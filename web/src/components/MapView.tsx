import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LatLng } from "../lib/types";
import type { City } from "../lib/cities";
import { mapStyleUrl, type Theme } from "../lib/theme";

interface Props {
  city: City;
  theme: Theme;
  origin: LatLng | null;
  isochrone: GeoJSON.Feature<GeoJSON.MultiPolygon> | null;
  onPickOrigin: (p: LatLng) => void;
}

const ISO_COLOR = "#0f9488";

export default function MapView({ city, theme, origin, isochrone, onPickOrigin }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onPickRef = useRef(onPickOrigin);
  onPickRef.current = onPickOrigin;
  const isochroneRef = useRef(isochrone);
  isochroneRef.current = isochrone;

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
      ensureLayers(map);
      setIsochroneData(map, isochroneRef.current);
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
  useEffect(() => {
    mapRef.current?.setStyle(mapStyleUrl(theme));
  }, [theme]);

  // City switch: fly there.
  useEffect(() => {
    mapRef.current?.flyTo({ center: city.center, zoom: city.zoom, duration: 1500 });
  }, [city.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setIsochroneData(map, isochrone);
  }, [isochrone]);

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

/** Idempotently (re)create our source + layers on the current style. */
function ensureLayers(map: maplibregl.Map) {
  if (map.getSource("isochrone")) return;
  try {
    map.addSource("isochrone", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "isochrone-fill",
      type: "fill",
      source: "isochrone",
      paint: { "fill-color": ISO_COLOR, "fill-opacity": 0.28 },
    });
    map.addLayer({
      id: "isochrone-line",
      type: "line",
      source: "isochrone",
      paint: { "line-color": ISO_COLOR, "line-width": 1.5 },
    });
  } catch {
    // style may still be loading; the next styledata event will retry
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
