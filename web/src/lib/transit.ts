/**
 * The city's network: metro, commuter rail, tram, light rail and trunk buses,
 * drawn with each operator's own line colours.
 *
 * Generated from the same GTFS feeds the routing server uses (see
 * tools/extract-transit.py) and shipped with the app as one file per city.
 * Colours live in the data rather than here, because they are per line and
 * per operator, so the layers just read the property.
 */

import type { Theme } from "./theme";
import { ICON_FOR_MODE, MAP_HALO, MAP_INK, modeIconId } from "./icons";

export const TRANSIT_SOURCE_ID = "transit";

/**
 * Pick a value per mode. Written as an explicit match rather than a lookup,
 * because MapLibre needs a real expression here, and a bare ["get", ...] used
 * as a boolean is silently refused.
 */
const byMode = (metro: number, rail: number, tram: number, bus: number) => [
  "match",
  ["get", "mode"],
  "metro",
  metro,
  "rail",
  rail,
  "tram",
  tram,
  "bus",
  bus,
  tram,
];

const cache = new Map<string, GeoJSON.FeatureCollection>();

export async function loadTransit(
  cityId: string,
  signal?: AbortSignal
): Promise<GeoJSON.FeatureCollection> {
  const cached = cache.get(cityId);
  if (cached) return cached;

  const url = `${import.meta.env.BASE_URL}data/transit-${cityId}.json`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`No network data for ${cityId}`);
  const data = (await res.json()) as GeoJSON.FeatureCollection;
  cache.set(cityId, data);
  return data;
}

/**
 * Three choices: metro with commuter rail, tram with light rail, and trunk bus.
 * They behave differently on the map. The first pair is a handful of long lines
 * with named stations, while trams and buses are dense, packed along the same
 * streets, and mostly of interest once you are looking at a neighbourhood.
 *
 * Filtering the source data rather than the layers keeps the layer definitions
 * static, and around 600 features per city is nothing to rebuild.
 */
export function transitGeojson(
  data: GeoJSON.FeatureCollection | null,
  show: { railway: boolean; tram: boolean; bus: boolean }
): GeoJSON.FeatureCollection | null {
  if (!data) return null;
  const wanted = new Set<string>();
  if (show.railway) {
    wanted.add("metro");
    wanted.add("rail");
  }
  if (show.tram) wanted.add("tram");
  if (show.bus) wanted.add("bus");
  if (wanted.size === 0) return null;
  if (wanted.size === 4) return data;
  return {
    type: "FeatureCollection",
    features: data.features.filter((f) => wanted.has(f.properties?.mode)),
  };
}

/**
 * Two layers: the lines, and the stops with their names.
 *
 * Deliberately restrained: thin lines and small pictograms, so the network reads
 * as context for the reachable area rather than competing with it.
 *
 * Line weight carries meaning as well as colour. Metro is the heaviest and
 * trunk bus lighter, which is how HSL separate them on their own maps, since
 * both are branded the same orange.
 *
 * Two stages as you zoom in: the stop pictograms from 12.5, then their names
 * from 13.2.
 */
export function transitLayers(theme: Theme): unknown[] {
  const dark = theme === "dark";
  const labelColour = dark ? MAP_INK.dark : MAP_INK.light;
  const labelHalo = dark ? MAP_HALO.dark : MAP_HALO.light;

  return [
    {
      id: "transit-line",
      type: "line",
      source: TRANSIT_SOURCE_ID,
      filter: ["==", ["get", "kind"], "line"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["get", "colour"],
        // Metro heaviest, then commuter rail, with tram and bus kept
        // deliberately fine. Both of those run many lines along the same
        // streets, so they stack on top of each other and any weight at all
        // turns central Helsinki into a smear. Metro ends up about twice the
        // width of a trunk bus, which is also what separates the two in
        // Helsinki, where they share the same orange.
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          byMode(1.4, 1.1, 0.6, 0.7),
          12,
          byMode(2.2, 1.8, 1, 1.1),
          15,
          byMode(3.4, 2.8, 1.6, 1.8),
          17,
          byMode(4.8, 4, 2.3, 2.6),
        ],
      },
    },
    {
      // One layer for stops: the pictogram, and the name when there is room for
      // it. There is no plain dot. Once the icon is drawn the dot had nothing
      // left to say, and two markers for one stop meant maintaining a handover
      // between them.
      //
      // Held back until well past the default city zoom of 10.5. A wide view is
      // lines only, which is what the shape of a network is made of; icons at
      // that scale are just noise on top. They arrive when you have zoomed in
      // to somewhere specific.
      //
      // Overlap is not allowed either, so MapLibre drops icons that would collide
      // rather than piling them up, and the sort key decides who survives:
      // metro first, then commuter rail, tram, bus.
      id: "transit-stop",
      type: "symbol",
      source: TRANSIT_SOURCE_ID,
      minzoom: 12.5,
      filter: ["==", ["get", "kind"], "station"],
      layout: {
        // Built from ICON_FOR_MODE so the mapping lives in one place. Spelling
        // it out inline as well meant two copies that could drift, and a
        // mismatched icon-image is a silent no-op in MapLibre, not an error.
        "icon-image": [
          "match",
          ["get", "mode"],
          ...Object.entries(ICON_FOR_MODE).flatMap(([mode, icon]) => [
            mode,
            modeIconId(icon, theme),
          ]),
          modeIconId("train", theme),
        ],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 12.5, 1, 17, 1.35],
        "icon-padding": 1,
        // Two stages on purpose. From 12.5 you get the pictograms alone, which
        // is enough to see where the network calls; the names join them at 13.2,
        // once you are close enough in for them to fit. One threshold for every
        // mode, so the second stage reads as a single step rather than names
        // trickling in per mode.
        //
        // Gated by emptying the field rather than by fading it, so a name that
        // is not being shown does not silently reserve space and push the icons
        // apart.
        "text-field": ["step", ["zoom"], "", 13.2, ["get", "name"]],
        // Bold, with a little letter spacing, to separate stop names from the
        // basemap's own text: streets are grey and regular weight, and district
        // names are italic capitals. Bold is used by the basemap itself, so the
        // glyphs are known to be served.
        "text-font": ["Noto Sans Bold"],
        "text-letter-spacing": 0.02,
        "text-size": ["interpolate", ["linear"], ["zoom"], 13.2, 10.5, 17, 13],
        "text-offset": [0, 1.05],
        "text-anchor": "top",
        "text-max-width": 9,
        // The icon stays even where the name will not fit.
        "text-optional": true,
        "symbol-sort-key": byMode(0, 1, 2, 3),
      },
      paint: {
        "text-color": labelColour,
        "text-halo-color": labelHalo,
        "text-halo-width": 1.5,
        // A short fade, so the icons arrive rather than appearing all at once,
        // and are solid by the time the names join them.
        "icon-opacity": ["interpolate", ["linear"], ["zoom"], 12.5, 0, 12.7, 1],
      },
    },
  ];
}
