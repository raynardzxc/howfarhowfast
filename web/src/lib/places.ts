/**
 * Everyday places (grocery shops, gyms) shown on top of the reachable area.
 *
 * The data is generated from the same OpenStreetMap extracts the routing
 * server uses (see tools/extract-places.py) and shipped with the app as a
 * static file, one per city. It is small enough to fetch whole and keep in
 * memory, and it changes slowly, so there is nothing to query at runtime.
 */

import type { Theme } from "./theme";
import {
  MAP_HALO,
  MAP_RING,
  PLACE_ICON_PATHS,
  fade,
  rasterise,
  strokeFor,
  type MapIcon,
} from "./icons";

/** Per theme, for the reason given on modeIconId in ./icons. */
export const placeIconId = (cat: PlaceCategory, theme: Theme, reached: boolean) =>
  `place-${cat}${reached ? "" : "-out"}-${theme}`;

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
  // These have to be readable on both basemaps and should not be mistaken for a
  // transit line. Between the two cities the network already uses 25 colours
  // covering most of the wheel, so there is not much room: an early orange sat
  // 10 units of CIELAB from Helsinki's metro orange, which is to say it was the
  // same colour.
  //
  // Green is the conventional grocery colour but a crowded one, since SL's metro
  // green and two HSL tram lines are green. It works here because the markers
  // are pictograms rather than plain dots, so a basket is not going to be read
  // as a line whatever colour it is. The light green is dark enough to keep its
  // distance from those lines; the dark-theme one has to be pale to show on a
  // near-black map, which lands it nearer the reachable-area teal than to any
  // green line.
  grocery: {
    label: "Grocery shops",
    singular: "grocery shop",
    plural: "grocery shops",
    colour: { light: "#1B4A2C", dark: "#A8DCBB" },
  },
  gym: {
    label: "Gyms",
    singular: "gym",
    plural: "gyms",
    colour: { light: "#4F46E5", dark: "#7551FF" },
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
 * Marker pictograms for the map: a basket and a dumbbell, the same drawings
 * the toggles use. Generated on a canvas rather than shipped as files, since
 * they are a few strokes each. Returns nothing outside a browser, so this
 * module can still be imported by tooling.
 */
export function placeIcons(theme: Theme): MapIcon[] {
  const out: MapIcon[] = [];

  for (const cat of Object.keys(PLACE_CATEGORIES) as PlaceCategory[]) {
    const paths = PLACE_ICON_PATHS[cat];
    // Two versions of each: in reach, and out of reach in a lighter mix of the
    // same colour. Dimming a line drawing with opacity turns it muddy against
    // the map, whereas a paler version of the same colour still reads as the
    // same thing, just not one you can get to.
    const inReach = rasterise(
      placeIconId(cat, theme, true),
      paths,
      placeColour(cat, theme),
      MAP_RING[theme],
      strokeFor(cat)
    );
    const outOfReach = rasterise(
      placeIconId(cat, theme, false),
      paths,
      fade(placeColour(cat, theme), theme),
      MAP_RING[theme],
      strokeFor(cat)
    );
    for (const icon of [inReach, outOfReach]) if (icon) out.push(icon);
  }
  return out;
}

/**
 * Map layer definitions, kept next to the data they draw.
 *
 * Both layers read a `reached` property to decide solid or dimmed, so moving
 * the time slider only needs new source data, never a paint change.
 *
 * Rebuilt per theme because MapView tears its own layers, sources and images
 * down and puts them back on a theme change. How much of that a style swap
 * clears is not something to rely on.
 */
export const PLACES_SOURCE_ID = "places";

export function placesLayers(theme: Theme): unknown[] {
  const byReach = (prop: PlaceCategory) => [
    "case",
    ["==", ["get", "reached"], true],
    placeColour(prop, theme),
    fade(placeColour(prop, theme), theme),
  ];
  const byCategory = [
    "match",
    ["get", "cat"],
    "grocery",
    byReach("grocery"),
    "gym",
    byReach("gym"),
    "#888888",
  ];
  const halo = MAP_HALO[theme];

  return [
    {
      id: "places-dot",
      type: "symbol",
      source: PLACES_SOURCE_ID,
      layout: {
        // Four images: a basket and a dumbbell, each in its own colour and in
        // a paler mix of it for the ones out of reach. Built by calling the same
        // placeIconId the generator uses, rather than assembling the string a
        // second time in the expression: a mismatch there would leave every
        // marker missing, and MapLibre treats a missing image as a no-op
        // rather than an error.
        "icon-image": [
          "match",
          ["get", "cat"],
          ...(Object.keys(PLACE_CATEGORIES) as PlaceCategory[]).flatMap((cat) => [
            cat,
            [
              "case",
              ["==", ["get", "reached"], true],
              placeIconId(cat, theme, true),
              placeIconId(cat, theme, false),
            ],
          ]),
          placeIconId("grocery", theme, true),
        ],
        // Every marker draws. Without this, MapLibre would drop the ones that
        // collide and most of them would vanish.
        "icon-allow-overlap": true,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 9, 0.8, 12, 1, 15, 1.2, 17, 1.35],
      },
    },
    {
      id: "places-label",
      type: "symbol",
      source: PLACES_SOURCE_ID,
      minzoom: 13,
      // Unnamed places still get a marker, but there is nothing to write.
      filter: ["!=", ["get", "name"], ""],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 16, 12],
        "text-offset": [0, 1],
        "text-anchor": "top",
        // Labels drop out rather than overlap; prefer the ones in reach.
        "symbol-sort-key": ["case", ["==", ["get", "reached"], true], 0, 1],
      },
      paint: {
        // The name is paled off the same way the marker is, rather than faded.
        "text-color": byCategory,
        "text-halo-color": halo,
        "text-halo-width": 1.3,
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
