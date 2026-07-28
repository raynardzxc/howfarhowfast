#!/usr/bin/env python3
"""
Extract the network (metro, commuter rail, tram, light rail and trunk buses)
from a GTFS feed: line geometry with official colours, plus stop points.

Usage:
    python3 tools/extract-transit.py <feed.zip> <city-id> <output.json>

Example:
    python3 tools/extract-transit.py spike/sl.zip stockholm \\
        web/public/data/transit-stockholm.json

Ferries are left out, and buses are limited to each operator's own trunk
network (see BUS_TRUNK). The full bus networks run to several hundred routes
and would bury the map.

Feeds do not carry route colours, so the palettes below are taken from each
operator's own published network map. Colours are written into the output so
the app can draw straight from the data.
"""

import csv
import io
import json
import math
import re
import sys
import zipfile
from collections import defaultdict

# GTFS route_type, both the original values and the extended ones. Feeds are
# inconsistent about which they use: Stockholm reports metro as 401 while
# Helsinki uses 1, and both appear in the same field.
MODES = {
    "metro": {"1", "401", "402"},
    "rail": {"2"} | {str(t) for t in range(100, 118)},
    "tram": {"0"} | {str(t) for t in range(900, 907)},
    "bus": {"3"} | {str(t) for t in range(700, 717)},
}

# Only trunk buses. Stockholm has 559 bus routes and Helsinki 417, which drawn
# together are an unreadable tangle no operator publishes, and would be some
# 3 MB of geometry. Both feeds mark out their trunk network, so the subset is
# the operator's own definition rather than a judgement call: Stockholm tags
# its 25 blåbuss routes in route_desc, Helsinki gives its 14 trunk and express
# routes their own route_type.
BUS_TRUNK = {
    "stockholm": ("route_desc", "blåbuss"),
    "helsinki": ("route_type", "702"),
}

# The region each city's routing server holds street data for, matching the
# osmium extracts in deploy/refresh-data.sh. Feeds reach well beyond this (the
# Helsinki feed runs west past Siuntio), and drawing network the app cannot
# route in would promise more than it delivers.
BBOXES = {
    "stockholm": (17.0, 58.6, 19.6, 60.3),
    "helsinki": (23.7, 59.85, 25.8, 60.8),
}

# Two stops with the same name this close together are one interchange that the
# feed happens to model as separate stations, one per mode. T-Centralen, Alvik
# and Gullmarsplan all do this.
MERGE_SAME_NAME_M = 250.0
M_PER_DEG_LAT = 111_320.0

# Per-line colours, keyed by the line's public number or letter. Anything not
# listed falls back to the mode colour, so a new line still gets drawn.
# Line numbers repeat across modes (Stockholm has both a tram 7 and a bus 7),
# so the lookup is per mode.
PALETTES = {
    "stockholm": {
        # Sampled from SL's own Spårtrafikkarta.
        "lines": {
            "metro": {
                "10": "#0091D2", "11": "#0091D2",                    # Blue line
                "13": "#E31F26", "14": "#E31F26",                    # Red line
                "17": "#00B259", "18": "#00B259", "19": "#00B259",   # Green line
            },
            "rail": {  # Pendeltåg
                "40": "#F067A6", "41": "#F067A6", "43": "#F067A6", "48": "#F067A6",
            },
            "tram": {
                "7": "#80857E",                    # Spårväg City
                "12": "#738BA4",                   # Nockebybanan
                "21": "#B66732",                   # Lidingöbanan
                "30": "#DE8221", "31": "#DE8221",  # Tvärbanan
                "25": "#00AAAD", "26": "#00AAAD",  # Saltsjöbanan
                "27": "#A05DA6", "28": "#A05DA6", "29": "#A05DA6",  # Roslagsbanan
            },
            "bus": {},
        },
        # Blåbuss are blue, but not the metro blue line's blue, so this is a
        # deep navy that keeps its distance from it.
        "modes": {
            "metro": "#0091D2", "rail": "#F067A6",
            "tram": "#80857E", "bus": "#003F87",
        },
    },
    "helsinki": {
        # Tram lines run packed together through the centre, so they take their
        # individual colours from HSL's own city-centre tram map. The other
        # modes keep one colour each, as HSL's system map has them.
        "lines": {
            "metro": {},
            "rail": {},
            "tram": {
                "1": "#00B6E4", "2": "#7790CB", "3": "#8262AC", "4": "#009F62",
                "5": "#007730", "6": "#F2198A", "7": "#FF9BC5", "8": "#009AA3",
                "9": "#0088D1", "10": "#00B32F", "13": "#F17F46",
            },
            "bus": {},
        },
        # Trunk buses share the metro's orange, because that is what HSL does:
        # both are branded orange and the two are told apart by line weight
        # instead, which the app follows.
        "modes": {
            "metro": "#FF6319", "rail": "#8C4799",
            "tram": "#00985F", "bus": "#FF6319",
        },
    },
}

# Roughly 11 m. Enough to keep the shape of a line while dropping the dense
# points a feed records along straight track.
SIMPLIFY_TOLERANCE_DEG = 1e-4

# When a stop is served by several modes, the first of these wins, so an
# interchange is drawn as the most significant thing that calls there.
MODE_PRIORITY = ["metro", "rail", "tram", "bus"]


def metres_between(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    mid = math.radians((lat1 + lat2) / 2)
    dx = (lon2 - lon1) * M_PER_DEG_LAT * math.cos(mid)
    dy = (lat2 - lat1) * M_PER_DEG_LAT
    return (dx * dx + dy * dy) ** 0.5


def colour_for(short: str, mode: str, palette: dict) -> str:
    """
    Colour for a line, falling back sensibly.

    Feeds are full of variants: Helsinki has 1, 1H and 1T, Stockholm has 43X
    and 27S. A variant is the same line to a passenger, so an exact match is
    tried first, then the leading number, then the mode's own colour.

    Looked up per mode, because line numbers repeat across modes. Stockholm has
    both a tram 7 and a bus 7.
    """
    lines = palette["lines"].get(mode, {})
    if short in lines:
        return lines[short]
    base = re.match(r"\d+", short)
    if base and base.group(0) in lines:
        return lines[base.group(0)]
    return palette["modes"][mode]


def read_csv(z: zipfile.ZipFile, name: str):
    """Stream one GTFS table without holding the whole thing in memory."""
    with z.open(name) as fh:
        yield from csv.DictReader(io.TextIOWrapper(fh, "utf-8-sig"))


def simplify(points: list[tuple[float, float]], tol: float) -> list[tuple[float, float]]:
    """Ramer-Douglas-Peucker, iterative so a long line cannot blow the stack."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        if last <= first + 1:
            continue
        ax, ay = points[first]
        bx, by = points[last]
        dx, dy = bx - ax, by - ay
        norm = (dx * dx + dy * dy) ** 0.5
        worst, worst_i = -1.0, first
        for i in range(first + 1, last):
            px, py = points[i]
            if norm == 0:
                d = ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            else:
                # Perpendicular distance from the point to the segment's line.
                d = abs(dy * (px - ax) - dx * (py - ay)) / norm
            if d > worst:
                worst, worst_i = d, i
        if worst > tol:
            keep[worst_i] = True
            stack.append((first, worst_i))
            stack.append((worst_i, last))
    return [p for p, k in zip(points, keep) if k]


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__.strip())
        return 2
    src, city, dst = sys.argv[1], sys.argv[2], sys.argv[3]
    missing = [
        name
        for name, table in (("PALETTES", PALETTES), ("BUS_TRUNK", BUS_TRUNK), ("BBOXES", BBOXES))
        if city not in table
    ]
    if missing:
        print(f"'{city}' is missing from: {', '.join(missing)}. Add an entry to each.")
        return 2
    palette = PALETTES[city]
    z = zipfile.ZipFile(src)

    # 1. Which routes do we want, and what colour is each?
    trunk_field, trunk_value = BUS_TRUNK[city]
    routes = {}
    skipped_bus = 0
    for row in read_csv(z, "routes.txt"):
        rtype = row.get("route_type", "")
        mode = next((m for m, codes in MODES.items() if rtype in codes), None)
        if mode is None:
            continue
        if mode == "bus":
            # Trunk network only, on the operator's own definition.
            if (row.get(trunk_field) or "").strip().lower() != trunk_value.lower():
                skipped_bus += 1
                continue
        short = (row.get("route_short_name") or "").strip()
        routes[row["route_id"]] = {
            "line": short or (row.get("route_long_name") or "").strip(),
            "mode": mode,
            "colour": colour_for(short, mode, palette),
        }
    by_mode = defaultdict(int)
    for r in routes.values():
        by_mode[r["mode"]] += 1
    print(f"  {len(routes)} routes selected {dict(by_mode)}, {skipped_bus} non-trunk buses skipped")

    # 2. Their trips, so we can find both the geometry and the stations.
    trip_route: dict[str, str] = {}
    shape_route: dict[str, str] = {}
    for row in read_csv(z, "trips.txt"):
        rid = row.get("route_id")
        if rid not in routes:
            continue
        trip_route[row["trip_id"]] = rid
        shape = row.get("shape_id")
        if shape:
            shape_route[shape] = rid
    print(f"  {len(trip_route)} trips, {len(shape_route)} distinct shapes")

    # 3. One representative shape per route: the one with the most points,
    #    which is the full end-to-end run rather than a short working. Counted
    #    in a first pass so only the winners are held in memory.
    counts: dict[str, int] = defaultdict(int)
    for row in read_csv(z, "shapes.txt"):
        sid = row["shape_id"]
        if sid in shape_route:
            counts[sid] += 1
    best: dict[str, str] = {}
    for sid, n in counts.items():
        rid = shape_route[sid]
        if rid not in best or n > counts[best[rid]]:
            best[rid] = sid
    wanted = {sid: rid for rid, sid in best.items()}
    print(f"  {len(wanted)} representative shapes")

    raw: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
    for row in read_csv(z, "shapes.txt"):
        sid = row["shape_id"]
        if sid in wanted:
            raw[sid].append(
                (
                    int(row["shape_pt_sequence"]),
                    float(row["shape_pt_lon"]),
                    float(row["shape_pt_lat"]),
                )
            )

    west, south, east, north = BBOXES[city]

    def inside(lon: float, lat: float) -> bool:
        return west <= lon <= east and south <= lat <= north

    features = []
    total_pts = kept_pts = 0
    clipped = 0
    for sid, pts in raw.items():
        pts.sort()
        coords = [(lon, lat) for _, lon, lat in pts]
        total_pts += len(coords)
        info = routes[wanted[sid]]

        # Clip to the routable region. A line that leaves and comes back is
        # emitted as separate pieces rather than joined across the gap.
        runs: list[list[tuple[float, float]]] = []
        current: list[tuple[float, float]] = []
        for lon, lat in coords:
            if inside(lon, lat):
                current.append((lon, lat))
            elif current:
                runs.append(current)
                current = []
        if current:
            runs.append(current)
        # Guarded, because runs is empty when a shape is wholly outside the bbox.
        if len(runs) != 1 or (runs and len(runs[0]) != len(coords)):
            clipped += 1

        for run in runs:
            run = simplify(run, SIMPLIFY_TOLERANCE_DEG)
            if len(run) < 2:
                continue
            kept_pts += len(run)
            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "kind": "line",
                        "line": info["line"],
                        "mode": info["mode"],
                        "colour": info["colour"],
                    },
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[round(x, 5), round(y, 5)] for x, y in run],
                    },
                }
            )
    print(
        f"  geometry simplified from {total_pts} to {kept_pts} points"
        + (f", {clipped} lines clipped at the region edge" if clipped else "")
    )

    # 4. Every stop served by those routes. Taken over all trips, not just the
    #    representative shapes, so stations on a branch are not missed.
    #    Stops where nobody may board or alight are skipped. That is how a feed
    #    marks somewhere a train passes without stopping for passengers, and it
    #    correctly excludes Kymlinge, the station on the blue line that was
    #    built but never opened.
    stop_modes: dict[str, set[str]] = defaultdict(set)
    passed_through = set()
    for row in read_csv(z, "stop_times.txt"):
        rid = trip_route.get(row["trip_id"])
        if rid is None:
            continue
        if row.get("pickup_type") == "1" and row.get("drop_off_type") == "1":
            passed_through.add(row["stop_id"])
            continue
        stop_modes[row["stop_id"]].add(routes[rid]["mode"])
    ghosts = passed_through - set(stop_modes)
    print(
        f"  {len(stop_modes)} stops served"
        + (f", {len(ghosts)} passed through without stopping" if ghosts else "")
    )

    # 5. Collapse platforms into their parent station.
    stops = {r["stop_id"]: r for r in read_csv(z, "stops.txt")}
    stations: dict[str, dict] = {}
    for sid, modes in stop_modes.items():
        row = stops.get(sid)
        if row is None:
            continue
        parent = (row.get("parent_station") or "").strip()
        key = parent if parent and parent in stops else sid
        anchor = stops[key]
        entry = stations.setdefault(
            key,
            {
                "name": (anchor.get("stop_name") or "").strip(),
                "lon": float(anchor["stop_lon"]),
                "lat": float(anchor["stop_lat"]),
                "modes": set(),
            },
        )
        entry["modes"] |= modes

    # 6. Merge same-name stations that sit on top of each other, so an
    #    interchange is one marker rather than one per mode, and drop
    #    anything outside the routable region.
    merged: list[dict] = []
    by_name: dict[str, list[dict]] = defaultdict(list)
    for entry in stations.values():
        if not inside(entry["lon"], entry["lat"]):
            continue
        near = None
        for other in by_name[entry["name"]]:
            if (
                metres_between(entry["lon"], entry["lat"], other["lon"], other["lat"])
                <= MERGE_SAME_NAME_M
            ):
                near = other
                break
        if near is None:
            by_name[entry["name"]].append(entry)
            merged.append(entry)
        else:
            near["modes"] |= entry["modes"]
    dropped = len(stations) - len(merged)
    stations = {i: e for i, e in enumerate(merged)}
    if dropped:
        print(f"  {dropped} stations merged into an interchange or outside the region")

    for entry in stations.values():
        mode = next(m for m in MODE_PRIORITY if m in entry["modes"])
        features.append(
            {
                "type": "Feature",
                # The mode picks the stop's pictogram and its collision
                # priority, which decides which marker survives when two
                # would overlap.
                "properties": {"kind": "station", "name": entry["name"], "mode": mode},
                "geometry": {
                    "type": "Point",
                    "coordinates": [round(entry["lon"], 5), round(entry["lat"], 5)],
                },
            }
        )

    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(
            {"type": "FeatureCollection", "features": features},
            fh,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        fh.write("\n")

    stops_by_mode: dict[str, int] = defaultdict(int)
    for entry in stations.values():
        stops_by_mode[next(m for m in MODE_PRIORITY if m in entry["modes"])] += 1
    drawn = sum(1 for f in features if f["properties"]["kind"] == "line")
    print(
        f"{dst}: {len(wanted)} lines as {drawn} segments, "
        f"{len(stations)} stops ({dict(stops_by_mode)})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
