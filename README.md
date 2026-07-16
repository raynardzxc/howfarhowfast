# HowFarHowFast

Pick a starting point and a travel time. The map shows everything you can
reach within that time using public transport and walking. First city:
**Stockholm**.

I built this while apartment hunting. Listings tell you the address, but not
how well connected it is. This makes it easy to check, for example, whether
work is within 30 minutes of a flat, or which areas would give you a short
commute.

The project was heavily inspired by the Singapore Travel Time Map
([traveltime.sg](https://www.traveltime.sg/),
[GitHub](https://github.com/Vorld/singapore-travel-time-map)).

## Features

- Start from a search result, a tap on the map, or your current location
- Travel time from 10 minutes to 2 hours, updates instantly as you drag
- Three schedules: weekday rush hour, weekday afternoon, weekend and holidays
- Walking pace (relaxed, normal, brisk) affects the whole journey
- Reachable area shown in km², light and dark mode, shareable links

## How it works

The system has two parts: a static web app and a routing server. Routing
happens live, per request, rather than from precomputed tables. That is what
makes walking pace and travel type free to change on the fly: they are simply
parameters of the query.

### One query per starting point

When you pick a starting point, the app asks the routing server one question:
from this exact spot, departing at this time and walking at this pace, what
is the fastest journey to every transit stop in the region, within 120
minutes? The server runs [MOTIS](https://github.com/motis-project/motis),
which holds the current timetables and the OpenStreetMap street network, and
answers in tens of milliseconds. The answer is a list of stops with their
fastest travel times. Everything after that happens in your browser.

### Departure times

Service levels differ a lot across the week, so each travel type is routed
against a fixed, typical departure:

| Travel type          | Departure used              |
| -------------------- | --------------------------- |
| Weekday rush hour    | next ordinary Tuesday 08:00 |
| Weekday afternoon    | next ordinary Tuesday 15:00 |
| Weekend and holidays | next Sunday 12:00           |

Sunday stands in for public holidays as well, since holiday service generally
follows the Sunday schedule.

### Drawing the shape

For every stop reached within your travel time, the leftover time becomes
walking distance at your chosen pace. A stop reached in 20 minutes on a 45
minute budget leaves 25 minutes of walking around it. Straight-line distances
are scaled by 0.75 to approximate real streets, and the walk out from a stop
is capped at 30 minutes. The walking range around the starting point itself
counts too.

All of these circles are stamped onto a 150 m grid, and the outline of the
covered cells is traced into the smooth shape on the map (marching squares).
The km² figure is the total area of covered cells.

Dragging the time slider never re-queries the server. The first answer
already covers the full 120 minutes, so each new shape is recomputed
instantly in the browser.

### What the result is, and is not

The shape is a planning estimate based on scheduled service. Live delays and
disruptions are not included. The walk out from stops uses straight-line
approximations rather than exact street routes, and water is not masked out,
so shapes can spill over shorelines. Treat the edges as indicative rather
than exact.

### Keeping data fresh

The server re-downloads the region's timetable feed (GTFS) every night and
re-imports it, so routing always follows the current schedule.

## Repository layout

- `web/` is the app (Vite + React + TypeScript + MapLibre). See `web/README.md`.
- `deploy/` sets up the production routing server: MOTIS, HTTPS via Caddy,
  and the nightly data refresh. See `DEPLOY.md`.
- `spike/` is the same routing stack for local development.

## Production setup

- Frontend: static site on Cloudflare Pages
- Routing: our own [MOTIS](https://github.com/motis-project/motis) server on a
  small cloud VM (`deploy/`)
- Tiles: [OpenFreeMap](https://openfreemap.org)

See `DEPLOY.md` for the full setup.

## Future work

- More cities. The frontend needs one entry in `web/src/lib/cities.ts`; the
  routing server needs that region's GTFS feed and OSM extract.

## Data & attribution

- Routing: [MOTIS](https://github.com/motis-project/motis)
- Swedish transit data: [Trafiklab](https://www.trafiklab.se) (CC0)
- Map tiles: [OpenFreeMap](https://openfreemap.org) (© OpenMapTiles)
- Street and walking network data ©
  [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors

## License

MIT, see [LICENSE](LICENSE).
