# Web app

Pick a starting point and a travel time. The map shows everything you can
reach within that time using public transport and walking.

## Local development

Production is fully cloud-hosted (see `../DEPLOY.md`). For local work you can
run the routing server on your machine:

1. Start it (in `../spike`): `./setup.sh --serve-only`
2. Here: `npm install && npm run dev`, then open http://localhost:5173

Or skip the local server and develop against the cloud one by creating
`.env.local` with `VITE_MOTIS_URL=https://your-subdomain.duckdns.org`.

## How it works

- One `one-to-all` query to MOTIS per combination of origin, travel type, and
  walking speed. The response covers the full 120-minute budget.
- The time slider re-thresholds in memory, so dragging it never refetches.
- Travel type maps to a representative departure: next ordinary Tuesday 08:00
  (rush hour) or 15:00 (afternoon), next Sunday 12:00 (weekend and holidays,
  since Swedish public holidays generally run a Sunday-level service).
- Walking speed (slow 3.6, average 5.0, fast 6.1 km/h) is sent to the router
  as `pedestrianSpeed` and also used client-side for walk-out distances.
- Reachable area = walk coverage from the origin plus every reachable stop,
  rasterized to a 150 m grid and contoured with marching squares.
- Map tiles come from OpenFreeMap (free vector tiles, light and dark styles).
- All state lives in the URL, so every view is a shareable link.

## Known technical shortcuts

- Walk-out distance is crow-fly times a 0.75 detour factor, capped at 30 min,
  rather than true street-network distance. Water is not masked out, so the
  shape can bleed over water near shorelines.
- Responses are raw MOTIS JSON (~4 MB per query). A thin proxy returning a
  compact format would cut bandwidth ~100x.

## Future work

- More cities. The frontend side is one entry in `src/lib/cities.ts`; the
  routing server needs that region's GTFS feed and OSM extract.
