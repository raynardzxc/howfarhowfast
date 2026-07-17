#!/usr/bin/env bash
# Ship locally-imported routing data to the serve-only server.
# Run on YOUR machine from the repo root, after a fresh import in spike/:
#   cd spike && ./setup.sh   (Ctrl-C once "Starting server" appears)
#   cd .. && ./deploy/upload-data.sh USER@SERVER
# Re-run any time you want to update timetables; rsync sends only changes.
set -euo pipefail
HOST="${1:?usage: upload-data.sh user@server}"
cd "$(dirname "$0")/.."

[[ -d spike/data ]] || { echo "spike/data not found. Run spike/setup.sh first."; exit 1; }

# Server config = spike config minus local-only bits (debug UI, tiles),
# bound to localhost (only Caddy talks to MOTIS).
sed '/web_folder/d; /^tiles:/,+1d' spike/config.yml \
  | sed 's/^server:$/server:\n  host: 127.0.0.1\n  port: 8080/' > /tmp/hfhf-server-config.yml

echo ">> Uploading data to $HOST (first run is a few GB; later runs send only changes)..."
rsync -az --delete --exclude '/tiles*' spike/data/ "$HOST:/opt/howfarhowfast/data.staging/"
rsync -az spike/sl.zip spike/hsl.zip spike/region.osm.pbf "$HOST:/opt/howfarhowfast/"
rsync -az /tmp/hfhf-server-config.yml "$HOST:/opt/howfarhowfast/config.yml"

echo ">> Activating on server..."
ssh "$HOST" 'set -e
  cd /opt/howfarhowfast
  sudo systemctl stop motis 2>/dev/null || true
  rsync -a --delete data.staging/ data/
  sudo systemctl start motis
  sleep 3
  systemctl is-active --quiet motis && echo "motis is running" || { echo "motis failed to start; check: journalctl -u motis -n 50"; exit 1; }
'
echo ">> Done. Verify:  curl -s \"https://YOUR_DOMAIN/api/v1/geocode?text=Slussen\" | head -c 200"
