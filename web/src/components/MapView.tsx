import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LatLng } from "../lib/types";
import type { City } from "../lib/cities";
import { mapStyleUrl, type Theme } from "../lib/theme";
import { PLACES_SOURCE_ID, placeIcons, placesLayers } from "../lib/places";
import { TRANSIT_SOURCE_ID, transitLayers } from "../lib/transit";
import { modeIcons } from "../lib/icons";

interface Props {
  city: City;
  theme: Theme;
  /** increments only on a deliberate city switch (dropdown) -> fly the camera */
  flyToken: number;
  origin: LatLng | null;
  isochrone: GeoJSON.Feature<GeoJSON.MultiPolygon> | null;
  places: GeoJSON.FeatureCollection<GeoJSON.Point> | null;
  transit: GeoJSON.FeatureCollection | null;
  onPickOrigin: (p: LatLng) => void;
}

const ISO_COLOR = "#0f9488";

export default function MapView({
  city,
  theme,
  flyToken,
  origin,
  isochrone,
  places,
  transit,
  onPickOrigin,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onPickRef = useRef(onPickOrigin);
  onPickRef.current = onPickOrigin;
  const isochroneRef = useRef(isochrone);
  isochroneRef.current = isochrone;
  const placesRef = useRef(places);
  placesRef.current = places;
  const transitRef = useRef(transit);
  transitRef.current = transit;
  // The styledata handler is installed once, so it reads the current theme
  // from a ref rather than from a stale closure.
  const themeRef = useRef(theme);
  themeRef.current = theme;
  // Which theme the layers currently on the map were built for.
  const builtForRef = useRef<Theme | null>(null);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: mapStyleUrl(theme),
      center: city.center,
      zoom: city.zoom,
      minZoom: 4,
      maxZoom: 18,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
    });
    map.addControl(geolocate, "top-right");
    // Using your current location should immediately set the starting point.
    geolocate.on("geolocate", (e) => {
      onPickRef.current({ lat: e.coords.latitude, lng: e.coords.longitude });
    });
    map.on("click", (e) => onPickRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    // Re-attach our layers whenever a style (re)loads, initial load AND
    // every setStyle() call for theme switches.
    map.on("styledata", () => {
      // Only refill the sources when the layers were actually (re)created.
      // styledata also fires for sprite loads and for our own mutations, and
      // refilling on each one re-posted the whole network to the worker for
      // nothing. Ordinary data changes are handled by the effects below.
      if (!ensureLayers(map, themeRef.current, builtForRef)) return;
      setIsochroneData(map, isochroneRef.current);
      setPlacesData(map, placesRef.current);
      setSourceData(map, TRANSIT_SOURCE_ID, transitRef.current);
    });
    mapRef.current = map;
    return () => {
      // the marker's DOM lives inside the map container, drop the ref so a
      // remount (React StrictMode) recreates it on the new map
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme switch: swap basemap style (layers are re-added via "styledata").
  // Skipped on mount, since the map was constructed with this style already.
  // Calling setStyle with the same URL still refetches it and diffs against a
  // serialised style that includes our own layers, so it tore them all down and
  // rebuilt them on every page load.
  const builtTheme = useRef(theme);
  useEffect(() => {
    if (builtTheme.current === theme) return;
    builtTheme.current = theme;
    mapRef.current?.setStyle(mapStyleUrl(theme));
  }, [theme]);

  // Deliberate city switch (dropdown): fly there. Implicit switches (picking
  // a point in another city) must not move the camera, so this keys on the
  // flyToken rather than the city itself.
  // Compares the token rather than tracking "have I run once", because a boolean
  // ref survives React StrictMode's double mount and made the second pass fly
  // the camera on load.
  const lastFly = useRef(flyToken);
  useEffect(() => {
    if (lastFly.current === flyToken) return;
    lastFly.current = flyToken;
    mapRef.current?.flyTo({ center: city.center, zoom: city.zoom, duration: 1500 });
  }, [flyToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setIsochroneData(map, isochrone);
  }, [isochrone]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setPlacesData(map, places);
  }, [places]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setSourceData(map, TRANSIT_SOURCE_ID, transit);
  }, [transit]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (origin) {
      if (!markerRef.current) {
        const el = document.createElement("div");
        el.className = "origin-marker";
        markerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([origin.lng, origin.lat])
          .addTo(map);
      } else {
        markerRef.current.setLngLat([origin.lng, origin.lat]);
      }
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, [origin]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}

// Everything we add to the basemap, innermost last, so they can be torn down in
// an order that leaves no source still in use.
const OUR_LAYERS = [
  "places-label",
  "places-dot",
  "transit-stop",
  "transit-line",
  "isochrone-water-mask",
  "isochrone-edge",
  "isochrone-fill",
];
const OUR_SOURCES = [PLACES_SOURCE_ID, TRANSIT_SOURCE_ID, "isochrone"];

/**
 * Idempotently (re)create our sources and layers on the current style.
 *
 * Rebuilds when the theme changes, not only when the style has been wiped.
 * Almost everything we add is theme-dependent (label colours, the cloned water
 * layer, the marker images), and how much of it survives a setStyle is not
 * something to rely on: switching light to dark used to leave the markers in
 * their old colours until the page was reloaded. So this tears our own work
 * down and puts it back rather than assuming the swap did it for us.
 */
function ensureLayers(
  map: maplibregl.Map,
  theme: Theme,
  builtFor: { current: Theme | null }
): boolean {
  if (map.getSource("isochrone") && builtFor.current === theme) return false;
  try {
    for (const id of OUR_LAYERS) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of OUR_SOURCES) if (map.getSource(id)) map.removeSource(id);
    map.addSource("isochrone", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    // Water masking: the shading must sit above the basemap's land fills but
    // must not cover lakes or the sea. The basemap draws water early (below
    // land-use fills), so simply stacking below water won't work. Instead:
    // insert the shading above all area fills but below roads, then re-paint
    // a clone of the style's own water layer directly on top of the shading.
    // The clone carries the correct water color for the active theme.
    const layers = map.getStyle()?.layers ?? [];
    const waterLayer = layers.find(
      (l) => l.type === "fill" && (l.id === "water" || l.id.startsWith("water"))
    );
    // First non-area layer (in OpenFreeMap styles this is "waterway"):
    // everything before it is background/land fills, everything after is
    // roads, buildings, and labels, which should stay on top.
    const beforeId = layers.find(
      (l) => l.id === "waterway" || l.id === "building" || l.type === "line"
    )?.id;

    // Fill with a hairline edge, plus a soft blurred border underneath the
    // water mask. A crisp outline would end abruptly wherever water cuts the
    // shape; the blurred line has no hard core, so its ends fade out at
    // shorelines instead of snapping off, while still giving the shape
    // definition on land.
    map.addLayer(
      {
        id: "isochrone-fill",
        type: "fill",
        source: "isochrone",
        paint: {
          "fill-color": ISO_COLOR,
          "fill-opacity": 0.3,
          "fill-outline-color": ISO_COLOR,
        },
      },
      beforeId
    );
    map.addLayer(
      {
        id: "isochrone-edge",
        type: "line",
        source: "isochrone",
        paint: {
          "line-color": ISO_COLOR,
          "line-width": 3.5,
          "line-blur": 3,
          "line-opacity": 0.5,
        },
      },
      beforeId
    );
    if (waterLayer) {
      map.addLayer({ ...waterLayer, id: "isochrone-water-mask" } as never, beforeId);
    }

    // The network goes on top of the basemap, no beforeId. Anywhere lower and
    // roads, buildings and place labels draw straight over the lines, which
    // looks broken. That also puts it above the water mask, so bridges and
    // water crossings stay continuous.
    // Full opacity rather than a muted wash, because lines that share track
    // are drawn once per line and any transparency would compound where they
    // overlap, making trunk sections darker than branches.
    // Stop pictograms have to be registered before the layer that names them,
    // and a style swap clears images along with the layers.
    for (const icon of modeIcons(theme)) {
      if (!map.hasImage(icon.id)) {
        map.addImage(icon.id, icon.image, { pixelRatio: icon.pixelRatio });
      }
    }
    map.addSource(TRANSIT_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection,
    });
    for (const layer of transitLayers(theme)) map.addLayer(layer as never);

    // Marker shapes have to exist before the layer that names them, and a
    // style swap clears registered images along with the layers.
    for (const icon of placeIcons(theme)) {
      if (!map.hasImage(icon.id)) {
        map.addImage(icon.id, icon.image, { pixelRatio: icon.pixelRatio });
      }
    }

    // Places sit on top of everything, including the water mask and the
    // basemap's own labels, so no beforeId here. They are the thing you are
    // looking for when they are switched on.
    map.addSource(PLACES_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection,
    });
    for (const layer of placesLayers(theme)) map.addLayer(layer as never);

    builtFor.current = theme;
    return true;
  } catch (e) {
    // The style may still be loading, in which case the next styledata event
    // retries, and builtFor is left alone so the retry rebuilds rather than
    // skipping. Logged rather than swallowed: a genuinely malformed layer would
    // otherwise leave the map bare with nothing in the console to explain it.
    console.warn("ensureLayers failed, will retry on the next styledata", e);
    return false;
  }
}

function setIsochroneData(
  map: maplibregl.Map,
  iso: GeoJSON.Feature<GeoJSON.MultiPolygon> | null
) {
  const src = map.getSource("isochrone") as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  src.setData(iso ?? { type: "FeatureCollection", features: [] });
}

function setPlacesData(
  map: maplibregl.Map,
  places: GeoJSON.FeatureCollection<GeoJSON.Point> | null
) {
  setSourceData(map, PLACES_SOURCE_ID, places);
}

function setSourceData(
  map: maplibregl.Map,
  id: string,
  data: GeoJSON.FeatureCollection | null
) {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  src.setData(data ?? { type: "FeatureCollection", features: [] });
}
