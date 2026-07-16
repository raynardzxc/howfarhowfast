#!/usr/bin/env bash
# Milestone 0/1 spike: MOTIS + SL GTFS + Stockholm OSM, running locally.
# Usage:  cd spike && ./setup.sh          (download + import + start server)
#         ./setup.sh --serve-only        (skip downloads/import, just start server)
set -euo pipefail
cd "$(dirname "$0")"

source .env  # provides TRAFIKLAB_KEY

# Locate the motis binary (archive layout differs per release: flat or motis/ dir)
find_motis() {
  if [[ -f ./motis && -x ./motis ]]; then echo "./motis";
  elif [[ -x ./motis/motis ]]; then echo "./motis/motis";
  else echo ""; fi
}

if [[ "${1:-}" != "--serve-only" ]]; then
  # --- 1. MOTIS binary ------------------------------------------------------
  MOTIS_BIN="$(find_motis)"
  if [[ -z "$MOTIS_BIN" ]]; then
    case "$(uname -s)-$(uname -m)" in
      Darwin-arm64)  TARGET=macos-arm64 ;;
      Darwin-x86_64) TARGET=macos-x86_64 ;;
      Linux-x86_64)  TARGET=linux-amd64 ;;
      Linux-aarch64) TARGET=linux-arm64 ;;
      *) echo "Unsupported platform"; exit 1 ;;
    esac
    echo ">> Downloading MOTIS ($TARGET)..."
    curl -fL -o motis.tar.bz2 \
      "https://github.com/motis-project/motis/releases/latest/download/motis-${TARGET}.tar.bz2"
    tar xf motis.tar.bz2
    rm motis.tar.bz2
    MOTIS_BIN="$(find_motis)"
    [[ -n "$MOTIS_BIN" ]] || { echo "Could not find motis binary after extraction"; exit 1; }
  fi

  # --- 2. SL GTFS (validate any existing file; partial downloads happen) ----
  if [[ -f sl.zip ]] && ! unzip -t sl.zip > /dev/null 2>&1; then
    echo ">> Existing sl.zip is corrupt/incomplete — removing and re-downloading"
    rm -f sl.zip
  fi
  if [[ ! -f sl.zip ]]; then
    echo ">> Downloading SL GTFS from Trafiklab (~70 MB)..."
    curl -fL --http1.1 --compressed -H "Accept-Encoding: gzip" \
      --retry 8 --retry-all-errors --retry-delay 3 --connect-timeout 30 \
      -o sl.zip.tmp \
      "https://opendata.samtrafiken.se/gtfs/sl/sl.zip?key=${TRAFIKLAB_KEY}"
    unzip -t sl.zip.tmp > /dev/null 2>&1 || { echo "downloaded sl.zip is corrupt — re-run setup.sh"; rm -f sl.zip.tmp; exit 1; }
    mv sl.zip.tmp sl.zip
  fi

  # --- 3. Stockholm OSM extract (BBBike; metro area — fine for the spike) ---
  if [[ ! -f stockholm.osm.pbf ]]; then
    echo ">> Downloading Stockholm OSM extract..."
    curl -fL --http1.1 --retry 8 --retry-all-errors --retry-delay 3 --connect-timeout 30 \
      -o stockholm.osm.pbf.tmp \
      "https://download.bbbike.org/osm/bbbike/Stockholm/Stockholm.osm.pbf"
    mv stockholm.osm.pbf.tmp stockholm.osm.pbf
  fi

  # --- 4. Config (paths depend on where the archive put ui/tiles-profiles) --
  BASE_DIR="$(dirname "$MOTIS_BIN")"
  cat > config.yml <<EOF
server:
  web_folder: ${BASE_DIR}/ui
osm: stockholm.osm.pbf
timetable:
  first_day: TODAY
  num_days: 60
  with_shapes: false        # keep the spike import fast
  datasets:
    sl:
      path: sl.zip
street_routing: true
osr_footpath: true          # route transfers on the real street network
geocoding: true
reverse_geocoding: true
tiles:
  profile: ${BASE_DIR}/tiles-profiles/background.lua
limits:
  onetoall_max_travel_minutes: 150   # default is 90; we need up to 120 + headroom
  onetoall_max_results: 65535
EOF

  # --- 5. Import ------------------------------------------------------------
  echo ">> Importing (this preprocesses OSM + GTFS; takes a few minutes)..."
  "$MOTIS_BIN" import
else
  MOTIS_BIN="$(find_motis)"
  [[ -n "$MOTIS_BIN" ]] || { echo "motis binary not found — run ./setup.sh without --serve-only first"; exit 1; }
fi

echo ">> Starting server on http://localhost:8080 (Ctrl-C to stop)"
echo ">> While it runs, open another terminal and run ./test_queries.sh"
"$MOTIS_BIN" server
