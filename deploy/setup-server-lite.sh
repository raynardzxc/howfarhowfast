#!/usr/bin/env bash
# One-time setup for a LOW-MEMORY server (~1 GB RAM) that only serves.
# The heavy data import runs on your own machine (spike/); the result is
# shipped up with deploy/upload-data.sh. No cron, no downloads here.
# Run on the server:  bash setup-server-lite.sh
set -euo pipefail

APP_DIR=/opt/howfarhowfast
sudo mkdir -p "$APP_DIR"
sudo chown "$USER" "$APP_DIR"
cd "$APP_DIR"

# --- swap (headroom for serving on small RAM) ---------------------------------
if [[ ! -f /swapfile ]]; then
  echo ">> Creating 2G swap file..."
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
fi

# --- MOTIS binary ---------------------------------------------------------------
if [[ ! -x ./motis ]] && [[ ! -x ./motis/motis ]]; then
  case "$(uname -m)" in
    x86_64)  TARGET=linux-amd64 ;;
    aarch64) TARGET=linux-arm64 ;;
    *) echo "Unsupported architecture"; exit 1 ;;
  esac
  echo ">> Downloading MOTIS ($TARGET)..."
  curl -fL -o motis.tar.bz2 \
    "https://github.com/motis-project/motis/releases/latest/download/motis-${TARGET}.tar.bz2"
  tar xf motis.tar.bz2 && rm motis.tar.bz2
fi
MOTIS_BIN=$([[ -x ./motis && -f ./motis ]] && echo "$APP_DIR/motis" || echo "$APP_DIR/motis/motis")

# --- systemd service (enabled, but idle until first data upload) ----------------
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
sudo systemctl enable motis

# --- Caddy (HTTPS + CORS + compression) ------------------------------------------
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
  echo "!! Copy deploy/Caddyfile (with your domain) to /etc/caddy/Caddyfile, then: sudo systemctl reload caddy"
fi

echo ">> Server ready. Now upload data from your machine:"
echo ">>   ./deploy/upload-data.sh $USER@$(hostname -I 2>/dev/null | awk '{print $1}')"
