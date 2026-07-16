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
  {
    id: "helsinki",
    label: "Helsinki",
    country: "Finland",
    center: [24.9384, 60.1699],
    zoom: 10.5,
    tz: "Europe/Helsinki",
  },
  // To add a city: add an entry here AND load that region's GTFS feed and
  // OSM extract on the routing server (see deploy/setup-server.sh).
];

export const DEFAULT_CITY_ID = "stockholm";

export function getCity(id: string | null | undefined): City {
  return CITIES.find((c) => c.id === id) ?? CITIES.find((c) => c.id === DEFAULT_CITY_ID)!;
}
