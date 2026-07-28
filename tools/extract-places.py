#!/usr/bin/env python3
"""
Extract everyday places (grocery shops, gyms) from an OpenStreetMap extract.

Usage:
    python3 tools/extract-places.py <input.osm.pbf> <output.json>

Needs pyosmium:
    pip install osmium

The output is a compact JSON file the web app fetches once per city. It is
generated from the same OSM extracts the routing server uses, so it needs no
extra data source and no API key.

Places mapped as a building outline rather than a single point (about 15% of
matches) are reduced to the centroid of the outline, which needs the node
coordinates, hence two passes over the file.

Multipolygon relations are ignored. They are rare for shops and a
relation-aware pass costs much more time for a handful of extra places.
"""

import json
import math
import sys
from collections import defaultdict

import osmium

# Places to do a food shop at. Bakeries, butchers and delis are deliberately
# excluded: they match a loose reading of "grocery" but are not where you buy
# the week's food.
GROCERY_SHOP_VALUES = {
    "supermarket",
    "convenience",
    "greengrocer",
    "grocery",
    "general",
}

# Rounded-coordinate grid used to drop duplicates (the same place mapped both
# as a point and as a building, or one shop with several mapped entrances).
DEDUPE_METRES = 60.0
M_PER_DEG_LAT = 111_320.0


def classify(tags) -> str | None:
    """Return 'grocery', 'gym', or None for anything we don't want."""
    if tags.get("shop") in GROCERY_SHOP_VALUES:
        return "grocery"
    if tags.get("leisure") == "fitness_centre":
        return "gym"
    if tags.get("leisure") == "sports_centre" and "fitness" in tags.get("sport", ""):
        return "gym"
    return None


def collect(path: str):
    """Pass 1: matching nodes with coordinates, matching ways with node refs."""
    places: list[tuple[str, str, float, float]] = []  # (category, name, lng, lat)
    pending_ways: list[tuple[str, str, list[int]]] = []  # (category, name, refs)
    wanted_nodes: set[int] = set()

    for obj in osmium.FileProcessor(path, osmium.osm.NODE | osmium.osm.WAY):
        category = classify(obj.tags)
        if category is None:
            continue
        name = obj.tags.get("name") or ""
        if obj.is_node():
            places.append((category, name, obj.location.lon, obj.location.lat))
        else:
            refs = [n.ref for n in obj.nodes]
            if refs:
                pending_ways.append((category, name, refs))
                wanted_nodes.update(refs)

    return places, pending_ways, wanted_nodes


def resolve_way_centroids(path: str, pending_ways, wanted_nodes):
    """Pass 2: look up the coordinates the matched ways refer to."""
    if not pending_ways:
        return []

    coords: dict[int, tuple[float, float]] = {}
    for obj in osmium.FileProcessor(path, osmium.osm.NODE):
        if obj.id in wanted_nodes:
            coords[obj.id] = (obj.location.lon, obj.location.lat)

    out = []
    for category, name, refs in pending_ways:
        pts = [coords[r] for r in refs if r in coords]
        if not pts:
            continue
        # An outline's last node repeats its first; harmless for a centroid.
        lng = sum(p[0] for p in pts) / len(pts)
        lat = sum(p[1] for p in pts) / len(pts)
        out.append((category, name, lng, lat))
    return out


def dedupe(places):
    """Drop near-duplicates: same category and name within DEDUPE_METRES."""
    # A plain dict read with .get, so probing the 3x3 neighbourhood does not
    # insert nine empty buckets per place.
    buckets: dict[tuple, list] = {}
    kept = []
    for category, name, lng, lat in places:
        m_per_deg_lng = M_PER_DEG_LAT * math.cos(math.radians(lat))
        cell_lat = DEDUPE_METRES / M_PER_DEG_LAT
        cell_lng = DEDUPE_METRES / m_per_deg_lng
        # Check the 3x3 neighbourhood so a pair either side of a cell edge
        # still collapses.
        row, col = int(lat / cell_lat), int(lng / cell_lng)
        duplicate = False
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                for other in buckets.get((category, name, row + dr, col + dc), ()):
                    d_lat = (lat - other[1]) * M_PER_DEG_LAT
                    d_lng = (lng - other[0]) * m_per_deg_lng
                    if d_lat * d_lat + d_lng * d_lng <= DEDUPE_METRES**2:
                        duplicate = True
                        break
                if duplicate:
                    break
            if duplicate:
                break
        if duplicate:
            continue
        buckets.setdefault((category, name, row, col), []).append((lng, lat))
        kept.append((category, name, lng, lat))
    return kept


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__.strip())
        return 2
    src, dst = sys.argv[1], sys.argv[2]

    nodes, pending_ways, wanted_nodes = collect(src)
    ways = resolve_way_centroids(src, pending_ways, wanted_nodes)
    places = dedupe(nodes + ways)

    # Unnamed places are kept: an unlabelled dot still tells you something is
    # there. Sorted for a stable diff between runs.
    places.sort(key=lambda p: (p[0], p[1], round(p[2], 5), round(p[3], 5)))
    rows = [
        [name, round(lng, 5), round(lat, 5), "g" if category == "grocery" else "y"]
        for category, name, lng, lat in places
    ]

    payload = {
        "format": "[name, lng, lat, category]",
        "categories": {"g": "grocery", "y": "gym"},
        "places": rows,
    }
    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")

    counts: dict[str, int] = defaultdict(int)
    for category, *_ in places:
        counts[category] += 1
    print(
        f"{dst}: {len(rows)} places "
        f"({counts['grocery']} grocery, {counts['gym']} gym), "
        f"{len(nodes)} points + {len(ways)} outlines, "
        f"{len(nodes) + len(ways) - len(rows)} duplicates dropped"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
