import type { LatLng, TravelTypeId, WalkSpeedId } from "./types";
import { DEFAULT_MINUTES, TIME_STOPS, TRAVEL_TYPES, WALK_SPEEDS } from "./types";
import { getCity } from "./cities";

export interface UrlState {
  origin: LatLng | null;
  minutes: number;
  walkSpeed: WalkSpeedId;
  travelType: TravelTypeId;
  cityId: string;
  showGrocery: boolean;
  showGym: boolean;
  showRailway: boolean;
  showTram: boolean;
  showBus: boolean;
}

export function readUrlState(): UrlState {
  const p = new URLSearchParams(window.location.search);
  const cityId = getCity(p.get("c")).id;
  let origin: LatLng | null = null;
  const o = p.get("o");
  if (o) {
    const [lat, lng] = o.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) origin = { lat, lng };
  }
  const t = Number(p.get("t"));
  const minutes = TIME_STOPS.includes(t) ? t : DEFAULT_MINUTES;
  const w = p.get("w") as WalkSpeedId;
  const walkSpeed: WalkSpeedId = w in WALK_SPEEDS ? w : "avg";
  const d = p.get("d") as TravelTypeId;
  const travelType: TravelTypeId = d in TRAVEL_TYPES ? d : "peak";
  return {
    origin,
    minutes,
    walkSpeed,
    travelType,
    cityId,
    showGrocery: p.get("g") === "1",
    showGym: p.get("y") === "1",
    // Metro and train are on unless a link says otherwise; tram is off unless
    // a link asks for it.
    showRailway: p.get("r") !== "0",
    showTram: p.get("s") === "1",
    showBus: p.get("b") === "1",
  };
}

export function writeUrlState(s: UrlState): void {
  const p = new URLSearchParams();
  p.set("c", s.cityId);
  if (s.origin) p.set("o", `${s.origin.lat.toFixed(5)},${s.origin.lng.toFixed(5)}`);
  p.set("t", String(s.minutes));
  p.set("w", s.walkSpeed);
  p.set("d", s.travelType);
  // Only written when they differ from the default, so the usual link stays
  // short.
  if (s.showGrocery) p.set("g", "1");
  if (s.showGym) p.set("y", "1");
  if (!s.showRailway) p.set("r", "0");
  if (s.showTram) p.set("s", "1");
  if (s.showBus) p.set("b", "1");
  const url = `${window.location.pathname}?${p}`;
  window.history.replaceState(null, "", url);
}
