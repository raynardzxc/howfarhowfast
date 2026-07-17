# Self-hosting

The system is two parts: a static web app (`web/`) and a routing server
(`deploy/`). Two server setups are provided; pick one.

## What you need

- A Linux server (Ubuntu 22.04 or 24.04, x86 or ARM). 2 GB RAM for the
  full setup, or ~1 GB for the serve-only setup below.
- A domain or subdomain pointed at the server (a free dynamic DNS service
  like DuckDNS works), with TCP ports 80 and 443 reachable.
- A free [Trafiklab](https://www.trafiklab.se) API key for the Swedish GTFS
  Regional Static dataset (the Finnish HSL feed is open and needs no key).

## Option A: full server (imports its own data)

The server downloads feeds and OSM itself and refreshes on the 1st of each
month. Needs 2 GB RAM and ~10 GB disk.

```sh
# from your machine (login user depends on provider: ubuntu, root, ...)
scp -r deploy ubuntu@YOUR_SERVER_IP:/tmp/deploy
ssh ubuntu@YOUR_SERVER_IP

# on the server
sudo mkdir -p /opt/howfarhowfast && sudo chown $USER /opt/howfarhowfast
cp -r /tmp/deploy /opt/howfarhowfast/deploy
echo "TRAFIKLAB_KEY=yourkeyhere" > /opt/howfarhowfast/.env
bash /opt/howfarhowfast/deploy/setup-server.sh
```

Put your domain in `deploy/Caddyfile` before copying. You can run
`deploy/refresh-data.sh` manually at any time.

## Option B: serve-only server (import on your own machine)

MOTIS separates the heavy data import from serving. Serving two regions
fits in about 1 GB of RAM, so a very small server works if you run the
import locally and ship the result. No Trafiklab key on the server, no
scheduled jobs; you control when data updates.

1. On the server: `bash deploy/setup-server-lite.sh` (after the same
   scp/chown steps as above; no `.env` needed).
2. On your machine, run a full import: `cd spike && ./setup.sh` (stop it
   once the server starts).
3. Upload: `./deploy/upload-data.sh USER@YOUR_SERVER` from the repo root.
   The first upload is a few GB; later ones send only changes.

Updating timetables means repeating steps 2 and 3 whenever you choose. The
feeds cover about three months of schedules, so monthly is comfortable.

## Verify

```sh
curl -s "https://YOUR_DOMAIN/api/v1/geocode?text=Slussen" | head -c 300
```

JSON mentioning Slussen means the server is up.

## Frontend on Cloudflare Pages

1. Set `VITE_MOTIS_URL` in `web/.env.production` to `https://YOUR_DOMAIN`.
2. dash.cloudflare.com, then Workers & Pages, Create, Pages, Connect to Git:
   - Framework preset: **Vite**, Root directory: **web**
   - Build command: **npm run build**, Output directory: **dist**
3. Deploy. You get `https://YOUR-PROJECT.pages.dev`; every push redeploys.

To test the production build locally first: `cd web && npm run build &&
npm run preview`.

## Running it for another region

- Server: add the region's GTFS feed as a dataset in the config section of
  `deploy/setup-server.sh` (and `spike/setup.sh` for Option B), and its OSM
  download/clip in `deploy/refresh-data.sh` (follow the existing SL/HSL
  pattern).
- Frontend: add a city entry in `web/src/lib/cities.ts`.

## Local development

`spike/` runs the same routing stack on your own machine; see
`spike/README.md`. Start it, then run `npm run dev` in `web/`.
