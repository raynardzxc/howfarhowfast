/**
 * Pictograms, defined once and used in two places: the toggles in the control
 * panel, and the markers on the map.
 *
 * Held as SVG path strings so both consumers can share them. The panel drops
 * them straight into an <svg>, and the map strokes the same strings onto a
 * canvas through Path2D, so the two cannot drift apart.
 *
 * Five of them: train, tram and bus for the transit modes, plus a basket and a
 * dumbbell for the two place overlays. All are drawn in the same 16x16 box and
 * differ in outline rather than in detail, since internal detail is the first
 * thing to go when an icon is only 16 pixels across.
 */

import type { Theme } from "./theme";

export type IconName = "train" | "tram" | "bus";

export const ICON_BOX = 16;

/**
 * How large the pictograms are drawn in the control panel. Bigger than the
 * coordinate box they are designed in, because at exactly 16 pixels they read
 * as specks next to the labels.
 */
export const LEGEND_ICON_PX = 19;

export type PlaceIconName = "grocery" | "gym";

/**
 * A shopping basket and a dumbbell. Both are things people recognise as an
 * outline at a glance, which matters more here than at legend size, because on
 * the map they have to survive being 16 pixels over a busy background.
 */
export const PLACE_ICON_PATHS: Record<PlaceIconName, string[]> = {
  // A shopping basket: overhanging rim, two splayed carry handles with a gap
  // between them, tapered body on a rounded base, and the slats inside as three
  // splayed verticals crossed by one horizontal. The slats need a finer stroke
  // than the rest of the set or they merge into a solid block, hence the
  // override in ICON_STROKE below.
  grocery: [
    "M1.8 6.66h12.4", // rim
    "M5.64 6.66 6.85 3.46", // carry handles
    "M10.3 6.66 9.15 3.46",
    "M2.7 6.9 3.6 11.5a1 1 0 0 0 1 .8h6.8a1 1 0 0 0 1-.8l.9-4.6", // body
    "M5.57 6.9 5.9 12.3", // slats
    "M8 6.9v5.4",
    "M10.43 6.9 10.1 12.3",
    "M3.24 9.54h9.5",
  ],
  // Plates as boxes rather than strokes. Drawn as bare vertical lines they had
  // no weight to them and the icon read as a bar with two ticks; as boxes it is
  // unmistakably a dumbbell, and still an outline like the rest of the set.
  gym: [
    "M2.7 3.9h2.6v8.2H2.7z",
    "M10.7 3.9h2.6v8.2h-2.6z",
    "M5.3 8h5.4", // bar
  ],
};

/**
 * Stroke weight per icon: 1.25 for everything except the basket, which drops to
 * 1 because its slats sit close enough together that a heavier line fills the
 * gaps between them.
 */
export const DEFAULT_STROKE = 1.25;
const ICON_STROKE: Record<string, number> = { grocery: 1 };
export const strokeFor = (name: string) => ICON_STROKE[name] ?? DEFAULT_STROKE;

export const MODE_ICON_PATHS: Record<IconName, string[]> = {
  train: [
    // domed roof and body
    "M3.5 6.1A3.2 3.2 0 0 1 6.7 2.9h2.6A3.2 3.2 0 0 1 12.5 6.1V11.4a1.2 1.2 0 0 1-1.2 1.2H4.7a1.2 1.2 0 0 1-1.2-1.2z",
    "M5.1 6.3h5.8v2.2H5.1z", // windscreen
    "M5.2 10.6h5.6", // skirt
    "M5.4 12.8 4.5 14", // splayed feet, reading as the track below
    "M10.6 12.8l.9 1.2",
  ],
  tram: [
    "M3.6 2.3h8.8", // overhead wire
    "M8 5.5V2.6", // pantograph
    "M4.8 7.7A2.2 2.2 0 0 1 7 5.5h2a2.2 2.2 0 0 1 2.2 2.2v5.8H4.8z",
    "M6.3 8.2h3.4v2.1H6.3z",
  ],
  bus: [
    "M2.5 5.7A1.5 1.5 0 0 1 4 4.2h8A1.5 1.5 0 0 1 13.5 5.7v4.9H2.5z",
    "M3.9 6.2h8.2v1.9H3.9z", // window band
    // wheels, as arcs so they travel as path strings like everything else
    "M4 11.2a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0",
    "M9.6 11.2a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0",
  ],
};

/** Which pictogram stands for each transit mode. */
export const ICON_FOR_MODE: Record<string, IconName> = {
  metro: "train",
  rail: "train",
  tram: "tram",
  bus: "bus",
};

/**
 * Shared map colours. Kept here rather than per module because a stop name and a
 * shop name sit side by side on the map, and they had already drifted to
 * different halo opacities when each file carried its own copy.
 *
 * MAP_RING is the solid colour stroked behind a pictogram so it reads over any
 * background; MAP_HALO is the translucent one behind text.
 */
export const MAP_INK: Record<Theme, string> = { light: "#2b3236", dark: "#e8e6e3" };
export const MAP_RING: Record<Theme, string> = { light: "#ffffff", dark: "#1a1c1e" };
export const MAP_HALO: Record<Theme, string> = {
  light: "rgba(255, 255, 255, 0.93)",
  dark: "rgba(12, 12, 12, 0.88)",
};

const MAP_ICON_PX = 44; // drawn large and scaled down, so it stays crisp
const MAP_ICON_RATIO = 2.75;

/**
 * Canvas versions for the map, stroked twice: a thick pass in the background
 * colour first, so the icon carries its own halo and stays readable over a
 * park, a motorway or the shading, then the icon itself on top.
 *
 * Returns nothing outside a browser, so this module stays importable by tooling.
 */
export interface MapIcon {
  id: string;
  image: { width: number; height: number; data: Uint8Array };
  pixelRatio: number;
}

/**
 * Rasterise one pictogram for the map. Available to anything that needs to draw
 * these paths in its own colour, which is how the place markers get theirs.
 */
export function rasterise(
  id: string,
  paths: string[],
  ink: string,
  halo: string,
  stroke = DEFAULT_STROKE
): MapIcon | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = MAP_ICON_PX;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(MAP_ICON_PX / ICON_BOX, MAP_ICON_PX / ICON_BOX);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const [colour, width] of [
    [halo, stroke + 2.1],
    [ink, stroke],
  ] as const) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    for (const d of paths) ctx.stroke(new Path2D(d));
  }

  const { data } = ctx.getImageData(0, 0, MAP_ICON_PX, MAP_ICON_PX);
  return {
    id,
    image: { width: MAP_ICON_PX, height: MAP_ICON_PX, data: new Uint8Array(data) },
    pixelRatio: MAP_ICON_RATIO,
  };
}

/** Mix a colour towards the map's own background, for markers out of reach. */
export function fade(hex: string, theme: Theme, amount = 0.55): string {
  // Only six-digit hex. Anything else would parse to NaN and produce
  // "#NaNNaNNaN", which MapLibre quietly refuses and canvas ignores.
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const towards = theme === "dark" ? [12, 12, 12] : [255, 255, 255];
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mixed = rgb.map((c, i) => Math.round(c * (1 - amount) + towards[i] * amount));
  return "#" + mixed.map((c) => c.toString(16).padStart(2, "0")).join("");
}

/**
 * Image ids are per theme. Registered images are not reliably cleared when the
 * basemap style is swapped, so a single id per icon meant a light-mode image
 * being reused in dark mode until the page was reloaded. With the theme in the
 * id, both sets can sit side by side and a layer can only ever name the one it
 * was built for.
 */
export const modeIconId = (name: IconName, theme: Theme) => `mode-${name}-${theme}`;

export function modeIcons(theme: Theme): MapIcon[] {
  return (Object.keys(MODE_ICON_PATHS) as IconName[])
    .map((name) =>
      rasterise(
        modeIconId(name, theme),
        MODE_ICON_PATHS[name],
        MAP_INK[theme],
        MAP_RING[theme],
        strokeFor(name)
      )
    )
    .filter((i): i is MapIcon => i !== null);
}
