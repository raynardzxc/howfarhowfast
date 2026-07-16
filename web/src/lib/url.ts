import type { LatLng, TravelTypeId, WalkSpeedId } from "./types";
import { DEFAULT_MINUTES, TIME_STOPS } from "./types";
import { getCity } from "./cities";

export interface UrlState {
  origin: LatLng | null;
  minutes: number;
  walkSpeed: WalkSpeedId;
  travelType: TravelTypeId;
  cityId: string;
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
  const walkSpeed: WalkSpeedId = ["slow", "avg", "fast"].includes(w) ? w : "avg";
  const d = p.get("d") as TravelTypeId;
  const travelType: TravelTypeId = ["peak", "nonpeak", "weekend"].includes(d) ? d : "peak";
  return { origin, minutes, walkSpeed, travelType, cityId };
}

export function writeUrlState(s: UrlState): void {
  const p = new URLSearchParams();
  p.set("c", s.cityId);
  if (s.origin) p.set("o", `${s.origin.lat.toFixed(5)},${s.origin.lng.toFixed(5)}`);
  p.set("t", String(s.minutes));
  p.set("w", s.walkSpeed);
  p.set("d", s.travelType);
  const url = `${window.location.pathname}?${p}`;
  window.history.replaceState(null, "", url);
}
