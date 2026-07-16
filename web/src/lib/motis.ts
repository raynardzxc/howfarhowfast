import type { LatLng, ReachableStop, TravelTypeId, WalkSpeedId } from "./types";
import { MAX_MINUTES, WALK_SPEEDS } from "./types";
import { representativeDeparture } from "./times";

/**
 * Base URL of the MOTIS API.
 * - dev: "" -> vite proxies /api to the local MOTIS server
 * - prod: set VITE_MOTIS_URL (e.g. https://api.transitous.org)
 */
const API_BASE = import.meta.env.VITE_MOTIS_URL ?? "";

/** Budgets to try, largest first. Public instances (Transitous) may cap
 *  one-to-all below our preferred 120 minutes; we fall back gracefully and
 *  the UI clamps the slider to whatever the server allowed. */
const BUDGETS = [MAX_MINUTES, 90];

export interface GeocodeMatch {
  name: string;
  lat: number;
  lon: number;
  type: string;
  areas?: { name: string; default?: boolean }[];
}

export interface OneToAllResult {
  stops: ReachableStop[];
  /** the maxTravelTime the server actually accepted (minutes) */
  budgetMinutes: number;
}

/**
 * Fetch travel times from one origin to all reachable stops.
 * Queries the largest budget the server accepts so the time slider can
 * re-threshold locally without refetching.
 */
export async function oneToAll(
  origin: LatLng,
  travelType: TravelTypeId,
  walkSpeed: WalkSpeedId,
  tz: string,
  signal?: AbortSignal
): Promise<OneToAllResult> {
  let lastError: Error | null = null;
  for (const budget of BUDGETS) {
    const params = new URLSearchParams({
      one: `${origin.lat},${origin.lng}`,
      time: representativeDeparture(travelType, tz),
      maxTravelTime: String(budget),
      pedestrianSpeed: String(WALK_SPEEDS[walkSpeed].ms),
    });
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/v6/one-to-all?${params}`, { signal });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new Error("Can't reach the routing server. Please try again in a moment.");
    }
    if (res.ok) {
      const data = await res.json();
      const all: any[] = data.all ?? [];
      return {
        stops: all.map((e) => ({ lat: e.place.lat, lon: e.place.lon, duration: e.duration })),
        budgetMinutes: budget,
      };
    }
    lastError =
      res.status >= 500
        ? new Error("Couldn't plan a journey from this point. Try a spot on land, near a street.")
        : new Error("Couldn't plan a journey from this point. Try a different starting point.");
    // 4xx with a smaller budget still to try -> likely a server-side cap; retry.
    if (!(res.status >= 400 && res.status < 500 && budget !== BUDGETS[BUDGETS.length - 1])) {
      break;
    }
  }
  throw lastError ?? new Error("Couldn't plan a journey from this point.");
}

export async function geocode(
  text: string,
  bias: { lat: number; lng: number },
  signal?: AbortSignal
): Promise<GeocodeMatch[]> {
  const params = new URLSearchParams({
    text,
    place: `${bias.lat},${bias.lng}`, // bias results toward the active city
  });
  const res = await fetch(`${API_BASE}/api/v1/geocode?${params}`, { signal });
  if (!res.ok) throw new Error(`geocode failed: HTTP ${res.status}`);
  return res.json();
}

/** Name of the closest address/stop, for showing which point was picked. */
export async function reverseGeocode(point: LatLng, signal?: AbortSignal): Promise<string | null> {
  const params = new URLSearchParams({ place: `${point.lat},${point.lng}` });
  const res = await fetch(`${API_BASE}/api/v1/reverse-geocode?${params}`, { signal });
  if (!res.ok) return null;
  const results: GeocodeMatch[] = await res.json();
  return results[0]?.name ?? null;
}
