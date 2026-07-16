export type WalkSpeedId = "slow" | "avg" | "fast";
export type TravelTypeId = "peak" | "nonpeak" | "weekend";

export interface LatLng {
  lat: number;
  lng: number;
}

/** One reachable stop from a one-to-all response. */
export interface ReachableStop {
  lat: number;
  lon: number;
  /** door-to-stop travel time in minutes */
  duration: number;
}

export const WALK_SPEEDS: Record<WalkSpeedId, { label: string; ms: number }> = {
  slow: { label: "Relaxed · 3.6 km/h", ms: 1.0 },
  avg: { label: "Normal · 5.0 km/h", ms: 1.4 },
  fast: { label: "Brisk · 6.1 km/h", ms: 1.7 },
};

export const TRAVEL_TYPES: Record<TravelTypeId, { label: string }> = {
  peak: { label: "Weekday rush hour · Tue 08:00" },
  nonpeak: { label: "Weekday afternoon · Tue 15:00" },
  weekend: { label: "Weekend & holidays · Sun 12:00" },
};

/** "45 min" / "1 h" / "1 h 30" */
export function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest}`;
}

/** Slider stops: 10..120 minutes in 5-minute steps. */
export const TIME_STOPS: number[] = Array.from({ length: 23 }, (_, i) => 10 + i * 5);
export const MAX_MINUTES = TIME_STOPS[TIME_STOPS.length - 1];
export const DEFAULT_MINUTES = 45;
