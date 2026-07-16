# Self-hosting HowFarHowFast

The system is two parts: a static web app (`web/`) and a routing server
(`deploy/`). You can host both for little or no money.

## What you need

- A small Linux server (Ubuntu 22.04 or 24.04, 1 to 2 GB RAM, x86 or ARM)
- A domain or subdomain pointed at the server (a free dynamic DNS service
  like DuckDNS works)
- For Swedish data: a free [Trafiklab](https://www.trafiklab.se) API key for
  the GTFS Regional Static dataset

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
SL GTFS feed and a Stockholm OSM extract, imports them, installs a systemd
service and Caddy (automatic HTTPS), and schedules a nightly data refresh.
The refresh uses about one Trafiklab request per day, well within the free
quota.

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

- Server: add that region's GTFS feed and OSM extract in the config section
  of `deploy/setup-server.sh` (there is a commented example).
- Frontend: add a city entry in `web/src/lib/cities.ts`.

## Local development

`spike/` runs the same routing stack on your own machine; see
`spike/README.md`. Start it, then run `npm run dev` in `web/`.
