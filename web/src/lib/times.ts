import type { TravelTypeId } from "./types";

/**
 * Map an abstract travel type to a representative concrete departure datetime,
 * always in the future (routing engines need a real date inside the GTFS
 * validity window). Times are local to the given IANA timezone.
 *
 * - weekday rush hour -> next Tuesday 08:00
 * - weekday midday    -> next Tuesday 15:00
 * - weekend/holiday   -> next Sunday 12:00
 *
 * Sunday is used for the weekend option because public holidays generally run
 * a Sunday-level service, so one schedule covers both.
 */
export function representativeDeparture(
  travelType: TravelTypeId,
  tz: string,
  now = new Date()
): string {
  const targetDow = travelType === "weekend" ? 0 : 2; // Sun=0, Tue=2
  const [hour, minute] =
    travelType === "peak" ? [8, 0] : travelType === "nonpeak" ? [15, 0] : [12, 0];

  // Work in city-local calendar terms.
  const localNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const d = new Date(localNow);
  let days = (targetDow - d.getDay() + 7) % 7;
  if (days === 0) days = 7; // always a future day
  d.setDate(d.getDate() + days);

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");

  // Determine the timezone's absolute UTC offset on that date (handles DST)
  // via Intl, independent of the viewer's own timezone.
  const probe = new Date(`${y}-${m}-${day}T${hh}:${mm}:00Z`);
  const tzName = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "longOffset",
  })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")!.value; // e.g. "GMT+02:00" or "GMT"
  const offset = tzName === "GMT" ? "+00:00" : tzName.replace("GMT", "");

  return `${y}-${m}-${day}T${hh}:${mm}:00${offset}`;
}
