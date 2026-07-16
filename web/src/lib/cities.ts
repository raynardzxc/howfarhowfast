/**
 * City registry, the only place in the frontend that knows about geography.
 *
 * Adding a city needs an entry here plus that region's GTFS feed and OSM
 * extract on the routing server (see deploy/setup-server.sh).
 */
export interface City {
  id: string;
  label: string;
  country: string;
  /** [lng, lat] */
  center: [number, number];
  zoom: number;
  /** IANA timezone for computing representative departure datetimes */
  tz: string;
}

export const CITIES: City[] = [
  {
    id: "stockholm",
    label: "Stockholm",
    country: "Sweden",
    center: [18.0686, 59.3293],
    zoom: 10.5,
    tz: "Europe/Stockholm",
  },
  // To add a city (e.g. Helsinki): add an entry here AND make sure the
  // routing server has that region's GTFS feed + OSM extract loaded.
  // { id: "helsinki", label: "Helsinki", country: "Finland",
  //   center: [24.9384, 60.1699], zoom: 10.5, tz: "Europe/Helsinki" },
];

export const DEFAULT_CITY_ID = "stockholm";

export function getCity(id: string | null | undefined): City {
  return CITIES.find((c) => c.id === id) ?? CITIES.find((c) => c.id === DEFAULT_CITY_ID)!;
}
