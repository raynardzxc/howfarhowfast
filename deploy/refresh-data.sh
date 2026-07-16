#!/usr/bin/env bash
# Nightly data refresh: new SL GTFS from Trafiklab + (occasionally) new OSM,
# re-import, restart. Trafiklab updates daily 03:00-07:00 CET; cron runs 05:30 UTC.
# Usage: refresh-data.sh [--initial]   (--initial: first run, no service restart)
set -euo pipefail
APP_DIR=/opt/howfarhowfast
cd "$APP_DIR"
source .env

echo "[$(date -Is)] refresh starting"

# --- SL GTFS (validated, atomic) ---------------------------------------------
curl -fL --http1.1 --compressed -H "Accept-Encoding: gzip" \
  --retry 8 --retry-all-errors --retry-delay 5 --connect-timeout 30 \
  -o sl.zip.tmp \
  "https://opendata.samtrafiken.se/gtfs/sl/sl.zip?key=${TRAFIKLAB_KEY}"
if ! unzip -t sl.zip.tmp > /dev/null 2>&1; then
  echo "downloaded sl.zip is corrupt — keeping previous data"
  rm -f sl.zip.tmp
  exit 1
fi
mv sl.zip.tmp sl.zip

# --- OSM: only on first run or the 1st of the month (street network changes slowly)
if [[ ! -f stockholm.osm.pbf || "$(date +%d)" == "01" ]]; then
  echo ">> Downloading Stockholm OSM extract..."
  curl -fL --http1.1 --retry 8 --retry-all-errors --retry-delay 5 --connect-timeout 30 \
    -o stockholm.osm.pbf.tmp \
    "https://download.bbbike.org/osm/bbbike/Stockholm/Stockholm.osm.pbf"
  mv stockholm.osm.pbf.tmp stockholm.osm.pbf
fi

# --- import + restart ----------------------------------------------------------
MOTIS_BIN=$([[ -x ./motis && -f ./motis ]] && echo "$APP_DIR/motis" || echo "$APP_DIR/motis/motis")
if [[ "${1:-}" != "--initial" ]]; then
  sudo systemctl stop motis
fi
"$MOTIS_BIN" import
if [[ "${1:-}" != "--initial" ]]; then
  sudo systemctl start motis
fi

echo "[$(date -Is)] refresh done"
