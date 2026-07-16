#!/usr/bin/env bash
# Biweekly data refresh (cron: 1st and 15th, 05:30 UTC): new GTFS feeds +
# monthly OSM, re-import, restart. Feeds hold ~3 months of validity, so
# biweekly keeps schedules current at minimal compute. Run manually any time:
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

# --- OSM extracts: first run or the 1st of the month ------------------------------
fetch_osm() {  # url -> outfile
  local url="$1" out="$2"
  if [[ ! -f "$out" || "$(date +%d)" == "01" ]]; then
    echo ">> Downloading $out..."
    curl -fL --http1.1 --retry 8 --retry-all-errors --retry-delay 5 --connect-timeout 30 \
      -o "$out.tmp" "$url"
    mv "$out.tmp" "$out"
  fi
}
fetch_osm "https://download.bbbike.org/osm/bbbike/Stockholm/Stockholm.osm.pbf" stockholm.osm.pbf
fetch_osm "https://download.bbbike.org/osm/bbbike/Helsinki/Helsinki.osm.pbf" helsinki.osm.pbf

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
