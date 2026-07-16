# Self-hosting

The system is two parts: a static web app (`web/`) and a routing server
(`deploy/`). You can host both for little or no money.

## What you need

- A small Linux server (Ubuntu 22.04 or 24.04, 2 GB RAM recommended, ~10 GB
  free disk, x86 or ARM)
- A domain or subdomain pointed at the server (a free dynamic DNS service
  like DuckDNS works)
- A free [Trafiklab](https://www.trafiklab.se) API key for the GTFS Regional
  Static dataset (Swedish data; the Finnish HSL feed is open and needs no key)

## Routing server

1. Point your domain at the server's IP.
2. Put your domain in `deploy/Caddyfile` (replace the example domain).
3. Copy the deploy kit over and run it:

```sh
# from your machine
scp -r deploy root@YOUR_SERVER_IP:/tmp/deploy
ssh root@YOUR_SERVER_IP

# on the server
mkdir -p /opt/howfarhowfast
cp -r /tmp/deploy /opt/howfarhowfast/deploy
echo "TRAFIKLAB_KEY=yourkeyhere" > /opt/howfarhowfast/.env
bash /opt/howfarhowfast/deploy/setup-server.sh
```

The script downloads MOTIS (matching the server's architecture), fetches the
SL and HSL GTFS feeds plus OpenStreetMap data (Geofabrik country files,
clipped to each transit region and merged), imports everything, installs a
systemd service and Caddy (automatic HTTPS, compressed responses), and
schedules a data refresh on the 1st and 15th of each month (the feeds hold
about three months of validity, so biweekly keeps schedules current). You
can also run `deploy/refresh-data.sh` manually at any time.

Verify from your machine:

```sh
curl -s "https://YOUR_DOMAIN/api/v1/geocode?text=Slussen" | head -c 300
```

JSON mentioning Slussen means the server is up.

## Frontend

1. Set `VITE_MOTIS_URL` in `web/.env.production` to `https://YOUR_DOMAIN`.
2. Build and host the static site anywhere (Cloudflare Pages, Netlify,
   GitHub Pages). For Cloudflare Pages: connect the repo, framework preset
   **Vite**, root directory **web**, build command **npm run build**, output
   directory **dist**. Every push then redeploys automatically.

## Running it for another region

- Server: add the region's GTFS feed as a dataset in the config section of
  `deploy/setup-server.sh`, and its OSM download/clip in
  `deploy/refresh-data.sh` (follow the existing SL/HSL pattern in both).
- Frontend: add a city entry in `web/src/lib/cities.ts`.

## Local development

`spike/` runs the same routing stack on your own machine; see
`spike/README.md`. Start it, then run `npm run dev` in `web/`.
