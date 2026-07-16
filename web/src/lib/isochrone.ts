import { contours } from "d3-contour";
import type { LatLng, ReachableStop } from "./types";

/**
 * Reachable-area computation.
 *
 * Approach (mirrors the marching-squares idea of the reference app, but the
 * "field" is built client-side): rasterize walk-out coverage from the origin
 * and from every stop reachable within the threshold onto a fine grid, then
 * contour the 0/1 mask into smooth polygons.
 *
 * Egress/access walking uses crow-fly distance scaled by a detour factor to
 * approximate street-network distance. Good enough for an MVP; can be
 * replaced by true network egress grids later.
 */

const CELL_M = 150; // grid resolution
const DETOUR_FACTOR = 0.75; // crow-fly -> street network approximation
const EGRESS_CAP_MIN = 30; // max walking time from a stop (sanity cap)
const M_PER_DEG_LAT = 111_320;

export interface IsochroneResult {
  geojson: GeoJSON.Feature<GeoJSON.MultiPolygon>;
  reachableStopCount: number;
  /** approximate reachable area in square kilometres */
  areaKm2: number;
}

export function computeIsochrone(
  origin: LatLng,
  stops: ReachableStop[],
  thresholdMin: number,
  walkSpeedMs: number
): IsochroneResult {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);

  // Collect coverage sources: [lat, lng, radius_m]
  const sources: [number, number, number][] = [];
  const originRadius = walkSpeedMs * thresholdMin * 60 * DETOUR_FACTOR;
  sources.push([origin.lat, origin.lng, originRadius]);

  let reachableStopCount = 0;
  for (const s of stops) {
    if (s.duration >= thresholdMin) continue;
    reachableStopCount++;
    const remainingMin = Math.min(thresholdMin - s.duration, EGRESS_CAP_MIN);
    const r = walkSpeedMs * remainingMin * 60 * DETOUR_FACTOR;
    if (r > CELL_M / 2) sources.push([s.lat, s.lon, r]);
  }

  // Grid bbox = coverage extent + one-cell padding.
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng, r] of sources) {
    const dLat = r / M_PER_DEG_LAT;
    const dLng = r / mPerDegLng;
    minLat = Math.min(minLat, lat - dLat);
    maxLat = Math.max(maxLat, lat + dLat);
    minLng = Math.min(minLng, lng - dLng);
    maxLng = Math.max(maxLng, lng + dLng);
  }
  const cellLat = CELL_M / M_PER_DEG_LAT;
  const cellLng = CELL_M / mPerDegLng;
  minLat -= cellLat; maxLat += cellLat; minLng -= cellLng; maxLng += cellLng;

  const rows = Math.max(2, Math.ceil((maxLat - minLat) / cellLat));
  const cols = Math.max(2, Math.ceil((maxLng - minLng) / cellLng));
  const mask = new Float64Array(rows * cols);

  // Rasterize disks (row 0 = north).
  for (const [lat, lng, r] of sources) {
    const rCellsLat = Math.ceil(r / CELL_M);
    const centerRow = (maxLat - lat) / cellLat;
    const centerCol = (lng - minLng) / cellLng;
    const r2 = (r / CELL_M) * (r / CELL_M);
    const rowLo = Math.max(0, Math.floor(centerRow - rCellsLat));
    const rowHi = Math.min(rows - 1, Math.ceil(centerRow + rCellsLat));
    for (let row = rowLo; row <= rowHi; row++) {
      const dy = row - centerRow;
      const span2 = r2 - dy * dy;
      if (span2 < 0) continue;
      const span = Math.sqrt(span2);
      const colLo = Math.max(0, Math.floor(centerCol - span));
      const colHi = Math.min(cols - 1, Math.ceil(centerCol + span));
      for (let col = colLo; col <= colHi; col++) {
        const dx = col - centerCol;
        if (dx * dx + dy * dy <= r2) mask[row * cols + col] = 1;
      }
    }
  }

  // Approximate area from the mask (cells are CELL_M x CELL_M).
  let onCells = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] === 1) onCells++;
  const areaKm2 = (onCells * CELL_M * CELL_M) / 1_000_000;

  // Marching squares -> polygons in grid space -> lng/lat.
  const generator = contours().size([cols, rows]).smooth(true).thresholds([0.5]);
  const [contour] = generator(Array.from(mask));
  const coordinates: GeoJSON.Position[][][] = contour.coordinates.map((poly) =>
    poly.map((ring) =>
      ring.map(([x, y]) => [minLng + x * cellLng, maxLat - y * cellLat])
    )
  );

  return {
    geojson: {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiPolygon", coordinates },
    },
    reachableStopCount,
    areaKm2,
  };
}
