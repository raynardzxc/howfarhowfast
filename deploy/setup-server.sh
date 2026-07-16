#!/usr/bin/env bash
# One-time setup on a cloud server (Ubuntu 22.04/24.04, x86 or ARM).
# Run:  bash setup-server.sh
set -euo pipefail

APP_DIR=/opt/howfarhowfast
sudo mkdir -p "$APP_DIR"
sudo chown "$USER" "$APP_DIR"
cd "$APP_DIR"

# --- swap (insurance for small droplets during import) ------------------------
if [[ ! -f /swapfile ]]; then
  echo ">> Creating 4G swap file..."
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
fi

# --- secrets ----------------------------------------------------------------
if [[ ! -f .env ]]; then
  echo "Create $APP_DIR/.env first with:  TRAFIKLAB_KEY=yourkey"
  exit 1
fi
source .env

# --- MOTIS binary (linux ARM) -----------------------------------------------
if [[ ! -x ./motis ]] && [[ ! -x ./motis/motis ]]; then
  echo ">> Downloading MOTIS (linux-arm64)..."
  curl -fL -o motis.tar.bz2 \
    "https://github.com/motis-project/motis/releases/latest/download/motis-linux-arm64.tar.bz2"
  tar xf motis.tar.bz2 && rm motis.tar.bz2
fi
MOTIS_BIN=$([[ -x ./motis && -f ./motis ]] && echo "$APP_DIR/motis" || echo "$APP_DIR/motis/motis")

# --- osmium (merges per-city OSM extracts into one file for MOTIS) ------------
if ! command -v osmium > /dev/null; then
  echo ">> Installing osmium-tool..."
  sudo apt-get update -qq && sudo apt-get install -y -qq osmium-tool unzip
fi

# --- config -------------------------------------------------------------------
# No tiles (OpenFreeMap serves the basemap) -> less RAM, faster import.
# To add a city: add its GTFS dataset below, and its OSM extract in
# deploy/refresh-data.sh (which merges all extracts into region.osm.pbf).
cat > config.yml <<'EOF'
server:
  host: 127.0.0.1        # only Caddy talks to MOTIS directly
  port: 8080
osm: region.osm.pbf
timetable:
  first_day: TODAY
  num_days: 60
  with_shapes: false
  datasets:
    sl:
      path: sl.zip
    hsl:
      path: hsl.zip
street_routing: true
osr_footpath: true
geocoding: true
reverse_geocoding: true
limits:
  onetoall_max_travel_minutes: 150
  onetoall_max_results: 65535
EOF

# --- initial data + import ----------------------------------------------------
bash "$(dirname "$0")/refresh-data.sh" --initial

# --- systemd service ----------------------------------------------------------
sudo tee /etc/systemd/system/motis.service > /dev/null <<EOF
[Unit]
Description=MOTIS routing server (howfarhowfast)
After=network.target

[Service]
User=$USER
WorkingDirectory=$APP_DIR
ExecStart=$MOTIS_BIN server
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now motis

# --- Caddy (HTTPS + CORS) -----------------------------------------------------
if ! command -v caddy > /dev/null; then
  echo ">> Installing Caddy..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
  sudo apt-get update -qq && sudo apt-get install -y -qq caddy
fi
if [[ -f "$(dirname "$0")/Caddyfile" ]]; then
  sudo cp "$(dirname "$0")/Caddyfile" /etc/caddy/Caddyfile
  sudo systemctl reload caddy
else
  echo "!! Edit deploy/Caddyfile with your domain, copy to /etc/caddy/Caddyfile, then: sudo systemctl reload caddy"
fi

# --- biweekly refresh cron (1st and 15th, 05:30 UTC) ---------------------------
( crontab -l 2>/dev/null | grep -v refresh-data ; \
  echo "30 5 1,15 * * bash $APP_DIR/deploy/refresh-data.sh >> $APP_DIR/refresh.log 2>&1" ) | crontab -

echo ">> Done. Check:  curl -s 'http://127.0.0.1:8080/api/v1/geocode?text=Slussen' | head -c 200"
