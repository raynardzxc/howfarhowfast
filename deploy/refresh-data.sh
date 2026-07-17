#!/usr/bin/env bash
# Monthly data refresh (cron: 1st of the month, 05:30 UTC): new GTFS feeds +
# OSM, re-import, restart. Feeds hold ~3 months of validity; monthly is the
# sensible floor (rarer and seasonal timetable changes go stale). Run
# manually any time:
#   bash deploy/refresh-data.sh
# Usage: refresh-data.sh [--initial]   (--initial: first run, no service restart)
set -euo pipefail
APP_DIR=/opt/howfarhowfast
cd "$APP_DIR"
source .env

echo "[$(date -Is)] refresh starting"

# --- helper: atomic, validated zip download ------------------------------------
fetch_zip() {  # url -> outfile
  local url="$1" out="$2"
  curl -fL --http1.1 --compressed -H "Accept-Encoding: gzip" \
    --retry 8 --retry-all-errors --retry-delay 5 --connect-timeout 30 \
    -o "$out.tmp" "$url"
  if ! unzip -t "$out.tmp" > /dev/null 2>&1; then
    echo "downloaded $out is corrupt, keeping previous data"
    rm -f "$out.tmp"
    return 1
  fi
  mv "$out.tmp" "$out"
}

# --- GTFS feeds -----------------------------------------------------------------
# Stockholm (SL via Trafiklab, needs key)
fetch_zip "https://opendata.samtrafiken.se/gtfs/sl/sl.zip?key=${TRAFIKLAB_KEY}" sl.zip
# Helsinki (HSL, open, no key)
fetch_zip "https://dev.hsl.fi/gtfs/hsl.zip" hsl.zip

# --- OSM: Geofabrik country files clipped to each transit region, refreshed
# on first run or the 1st of the month. (City-scale extracts proved too
# small: they missed outer stations like Marsta that SL serves.)
fetch_osm() {  # url -> outfile
  local url="$1" out="$2"
  if [[ ! -f "$out" || "$(date +%d)" == "01" ]]; then
    echo ">> Downloading $out..."
    curl -fL --http1.1 --retry 8 --retry-all-errors --retry-delay 5 --connect-timeout 30 \
      -o "$out.tmp" "$url"
    mv "$out.tmp" "$out"
  fi
}
fetch_osm "https://download.geofabrik.de/europe/sweden-latest.osm.pbf" sweden-latest.osm.pbf
fetch_osm "https://download.geofabrik.de/europe/finland-latest.osm.pbf" finland-latest.osm.pbf

if [[ ! -f stockholm.osm.pbf || sweden-latest.osm.pbf -nt stockholm.osm.pbf ]]; then
  echo ">> Clipping Stockholm county..."
  osmium extract -b 17.0,58.6,19.6,60.3 sweden-latest.osm.pbf -o stockholm.osm.pbf --overwrite
fi
if [[ ! -f helsinki.osm.pbf || finland-latest.osm.pbf -nt helsinki.osm.pbf ]]; then
  echo ">> Clipping Helsinki region..."
  osmium extract -b 23.7,59.85,25.8,60.8 finland-latest.osm.pbf -o helsinki.osm.pbf --overwrite
fi

# --- merge OSM extracts (MOTIS takes a single OSM file) ---------------------------
if [[ ! -f region.osm.pbf || stockholm.osm.pbf -nt region.osm.pbf || helsinki.osm.pbf -nt region.osm.pbf ]]; then
  echo ">> Merging OSM extracts..."
  osmium merge stockholm.osm.pbf helsinki.osm.pbf -o region.osm.pbf --overwrite
fi

# --- import + restart --------------------------------------------------------------
MOTIS_BIN=$([[ -x ./motis && -f ./motis ]] && echo "$APP_DIR/motis" || echo "$APP_DIR/motis/motis")
if [[ "${1:-}" != "--initial" ]]; then
  sudo systemctl stop motis
fi
"$MOTIS_BIN" import
if [[ "${1:-}" != "--initial" ]]; then
  sudo systemctl start motis
fi

echo "[$(date -Is)] refresh done"
