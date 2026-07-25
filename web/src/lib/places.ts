/**
 * Everyday places (grocery shops, gyms) shown on top of the reachable area.
 *
 * The data is generated from the same OpenStreetMap extracts the routing
 * server uses (see tools/extract-places.py) and shipped with the app as a
 * static file, one per city. It is small enough to fetch whole and keep in
 * memory, and it changes slowly, so there is nothing to query at runtime.
 */

import type { Theme } from "./theme";

export type PlaceCategory = "grocery" | "gym";

export interface Place {
  name: string;
  lng: number;
  lat: number;
  cat: PlaceCategory;
}

export const PLACE_CATEGORIES: Record<
  PlaceCategory,
  { label: string; singular: string; plural: string; colour: Record<Theme, string> }
> = {
  // The colours have to stay readable against the teal shading and against
  // both basemaps, so each has a lighter variant for the dark map.
  grocery: {
    label: "Grocery shops",
    singular: "grocery shop",
    plural: "grocery shops",
    colour: { light: "#e0590b", dark: "#fb923c" },
  },
  gym: {
    label: "Gyms",
    singular: "gym",
    plural: "gyms",
    colour: { light: "#7c3aed", dark: "#a78bfa" },
  },
};

export function placeColour(cat: PlaceCategory, theme: Theme): string {
  return PLACE_CATEGORIES[cat].colour[theme];
}

/** "1 gym" / "14 grocery shops" */
export function countPhrase(n: number, cat: PlaceCategory): string {
  const c = PLACE_CATEGORIES[cat];
  return `${n.toLocaleString()} ${n === 1 ? c.singular : c.plural}`;
}

/**
 * Map layer definitions, kept next to the data they draw.
 *
 * Both layers read a `reached` property to decide solid or dimmed, so moving
 * the time slider only needs new source data, never a paint change.
 *
 * They are rebuilt per theme because a swap replaces the whole basemap style
 * anyway, which drops these layers and re-adds them (see MapView).
 */
export const PLACES_SOURCE_ID = "places";

export function placesLayers(theme: Theme): unknown[] {
  const byCategory = [
    "match",
    ["get", "cat"],
    "grocery",
    placeColour("grocery", theme),
    "gym",
    placeColour("gym", theme),
    "#888888",
  ];
  // A ring in the map's own background colour, so a dot reads as sitting on
  // the map rather than glowing on it. Same idea as the origin marker.
  const ring = theme === "dark" ? "#1a1c1e" : "#ffffff";
  const halo = theme === "dark" ? "rgba(12, 12, 12, 0.85)" : "rgba(255, 255, 255, 0.92)";

  return [
    {
      id: "places-dot",
      type: "circle",
      source: PLACES_SOURCE_ID,
      paint: {
        "circle-color": byCategory,
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          2.5,
          12,
          4,
          15,
          5.5,
          17,
          7,
        ],
        // Out of reach stays visible but clearly secondary.
        "circle-opacity": ["case", ["get", "reached"], 0.95, 0.28],
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 9, 0.6, 13, 1.4],
        "circle-stroke-color": ring,
        "circle-stroke-opacity": ["case", ["get", "reached"], 0.9, 0.22],
      },
    },
    {
      id: "places-label",
      type: "symbol",
      source: PLACES_SOURCE_ID,
      minzoom: 13,
      // Unnamed places still get a dot, but there is nothing to write.
      filter: ["!=", ["get", "name"], ""],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 16, 12],
        "text-offset": [0, 1],
        "text-anchor": "top",
        // Labels drop out rather than overlap; prefer the ones in reach.
        "symbol-sort-key": ["case", ["get", "reached"], 0, 1],
      },
      paint: {
        "text-color": byCategory,
        "text-halo-color": halo,
        "text-halo-width": 1.3,
        "text-opacity": ["case", ["get", "reached"], 1, 0.4],
      },
    },
  ];
}

/** Row format written by tools/extract-places.py: [name, lng, lat, category]. */
type PlaceRow = [string, number, number, string];

const cache = new Map<string, Place[]>();

export async function loadPlaces(cityId: string, signal?: AbortSignal): Promise<Place[]> {
  const cached = cache.get(cityId);
  if (cached) return cached;

  const url = `${import.meta.env.BASE_URL}data/places-${cityId}.json`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`No places data for ${cityId}`);
  const body = (await res.json()) as { places?: PlaceRow[] };

  const places: Place[] = (body.places ?? []).map(([name, lng, lat, cat]) => ({
    name,
    lng,
    lat,
    cat: cat === "y" ? "gym" : "grocery",
  }));
  cache.set(cityId, places);
  return places;
}

export interface PlaceCounts {
  grocery: number;
  gym: number;
}

/**
 * Build the map source data for the categories currently switched on.
 *
 * `inReach` decides which places are drawn solid and which are dimmed. Pass
 * null when there is no reachable area yet (no starting point picked), in
 * which case everything is drawn solid, since there is nothing to compare
 * against.
 */
export function placesGeojson(
  places: Place[],
  show: Record<PlaceCategory, boolean>,
  inReach: ((lat: number, lng: number) => boolean) | null
): { data: GeoJSON.FeatureCollection<GeoJSON.Point>; counts: PlaceCounts } {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  const counts: PlaceCounts = { grocery: 0, gym: 0 };

  for (const p of places) {
    if (!show[p.cat]) continue;
    const reached = inReach ? inReach(p.lat, p.lng) : true;
    if (reached && inReach) counts[p.cat]++;
    features.push({
      type: "Feature",
      properties: { name: p.name, cat: p.cat, reached },
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    });
  }

  return { data: { type: "FeatureCollection", features }, counts };
}
