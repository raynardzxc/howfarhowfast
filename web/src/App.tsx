import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapView from "./components/MapView";
import Controls from "./components/Controls";
import InfoDialog from "./components/InfoDialog";
import { oneToAll, reverseGeocode } from "./lib/motis";
import { computeIsochrone } from "./lib/isochrone";
import { readUrlState, writeUrlState } from "./lib/url";
import { getCity, nearestCity } from "./lib/cities";
import { initialTheme, persistTheme, type Theme } from "./lib/theme";
import { loadPlaces, placesGeojson, type Place } from "./lib/places";
import { loadTransit, transitGeojson } from "./lib/transit";
import type { LatLng, ReachableStop, TravelTypeId, WalkSpeedId } from "./lib/types";
import { WALK_SPEEDS } from "./lib/types";
import type { OneToAllResult } from "./lib/motis";

// In-memory cache: toggling travel type or walking pace back and forth
// shouldn't refetch. Keyed by origin + parameters, capped to the most
// recent entries.
const resultCache = new Map<string, OneToAllResult>();
const CACHE_MAX = 30;

export default function App() {
  const initial = useMemo(readUrlState, []);
  const [cityId, setCityId] = useState(initial.cityId);
  const [origin, setOrigin] = useState<LatLng | null>(initial.origin);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [walkSpeed, setWalkSpeed] = useState<WalkSpeedId>(initial.walkSpeed);
  const [travelType, setTravelType] = useState<TravelTypeId>(initial.travelType);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [infoOpen, setInfoOpen] = useState(false);
  const [showGrocery, setShowGrocery] = useState(initial.showGrocery);
  const [showGym, setShowGym] = useState(initial.showGym);
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesError, setPlacesError] = useState(false);
  const [showRailway, setShowRailway] = useState(initial.showRailway);
  const [showTram, setShowTram] = useState(initial.showTram);
  const [showBus, setShowBus] = useState(initial.showBus);
  const [transit, setTransit] = useState<GeoJSON.FeatureCollection | null>(null);
  const [transitError, setTransitError] = useState(false);

  const [stops, setStops] = useState<ReachableStop[] | null>(null);
  const [originLabel, setOriginLabel] = useState<string | null>(null);
  const [budget, setBudget] = useState<number>(120); // server-accepted max minutes
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const city = getCity(cityId);

  useEffect(() => persistTheme(theme), [theme]);

  // Keep the browser tab title in sync with the active city.
  useEffect(() => {
    document.title = `how far, how fast · ${city.label}, travel time visualised`;
  }, [city.label]);

  // Fetch one-to-all whenever origin / travel type / walk speed change.
  // The time slider does NOT refetch, it re-thresholds in memory.
  useEffect(() => {
    // Abort before the early return, so clearing the starting point also stops
    // an in-flight request. Without this its .then still fired and repopulated
    // stops for an origin that no longer existed.
    abortRef.current?.abort();
    if (!origin) return;

    const key = `${origin.lat},${origin.lng}|${travelType}|${walkSpeed}|${city.tz}`;
    const cached = resultCache.get(key);
    if (cached) {
      // Re-insert so the map's iteration order really is least-recent-first.
      resultCache.delete(key);
      resultCache.set(key, cached);
      setStops(cached.stops);
      setBudget(cached.budgetMinutes);
      setMinutes((m) => Math.min(m, cached.budgetMinutes));
      setLoading(false);
      setError(null);
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    oneToAll(origin, travelType, walkSpeed, city.tz, ctrl.signal)
      .then((r) => {
        resultCache.set(key, r);
        if (resultCache.size > CACHE_MAX) {
          resultCache.delete(resultCache.keys().next().value!);
        }
        setStops(r.stops);
        setBudget(r.budgetMinutes);
        setMinutes((m) => Math.min(m, r.budgetMinutes));
        setLoading(false);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e.message ?? "Routing failed");
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [origin, travelType, walkSpeed, city.tz]);

  useEffect(() => {
    // Debounced because dragging the slider fires this on every step, and
    // Safari throws once replaceState is called 100 times in 30 seconds.
    const id = window.setTimeout(() => {
      writeUrlState({
        origin,
        minutes,
        walkSpeed,
        travelType,
        cityId,
        showGrocery,
        showGym,
        showRailway,
        showTram,
        showBus,
      });
    }, 250);
    return () => window.clearTimeout(id);
  }, [
    origin,
    minutes,
    walkSpeed,
    travelType,
    cityId,
    showGrocery,
    showGym,
    showRailway,
    showTram,
    showBus,
  ]);

  // Metro and train are on by default, so this fetch runs on load. It is small
  // and cached per city, and a failure just means no network is drawn. One file
  // covers both toggles, so it is fetched once either way.
  const wantTransit = showRailway || showTram || showBus;
  useEffect(() => {
    if (!wantTransit) return;
    const ctrl = new AbortController();
    // Clear first, or the previous city's network stays drawn over the new one
    // for as long as the fetch takes.
    setTransit(null);
    setTransitError(false);
    loadTransit(cityId, ctrl.signal)
      .then(setTransit)
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setTransit(null);
        // Surfaced rather than swallowed. Silently, a checked toggle with an
        // empty map looked like the feature was broken.
        setTransitError(true);
      });
    return () => ctrl.abort();
  }, [wantTransit, cityId]);

  const transitLayer = useMemo(
    () => transitGeojson(transit, { railway: showRailway, tram: showTram, bus: showBus }),
    [transit, showRailway, showTram, showBus]
  );

  // Places data is only fetched once a toggle is actually switched on, so
  // nobody downloads it who never asks for it. Cached per city inside
  // loadPlaces, so switching back and forth is free.
  const wantPlaces = showGrocery || showGym;
  useEffect(() => {
    if (!wantPlaces) return;
    const ctrl = new AbortController();
    setPlaces([]);
    setPlacesError(false);
    loadPlaces(cityId, ctrl.signal)
      .then(setPlaces)
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setPlaces([]);
        setPlacesError(true);
      });
    return () => ctrl.abort();
  }, [wantPlaces, cityId]);

  // Show which point was picked (closest address/stop name).
  useEffect(() => {
    if (!origin) {
      setOriginLabel(null);
      return;
    }
    const fallback = `${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}`;
    setOriginLabel(fallback);
    const ctrl = new AbortController();
    reverseGeocode(origin, ctrl.signal)
      .then((name) => name && setOriginLabel(name))
      .catch(() => {});
    return () => ctrl.abort();
  }, [origin]);

  const iso = useMemo(() => {
    if (!origin || !stops) return null;
    return computeIsochrone(origin, stops, minutes, WALK_SPEEDS[walkSpeed].ms);
  }, [origin, stops, minutes, walkSpeed]);

  // Re-classified whenever the reachable area changes. A grid lookup per
  // place, so a slider drag costs far less here than the isochrone itself.
  const placeLayer = useMemo(() => {
    if (!wantPlaces || places.length === 0) return null;
    return placesGeojson(
      places,
      { grocery: showGrocery, gym: showGym },
      iso ? iso.contains : null
    );
  }, [wantPlaces, places, showGrocery, showGym, iso]);

  // Picking a point anywhere adopts the nearest city (label, timezone,
  // search bias follow the pin), without moving the camera.
  const pickOrigin = useCallback((p: LatLng) => {
    setOrigin(p);
    // Drop the previous point's reachable stops. Kept, they were re-centred on
    // the new pin and drew a wrong shape until the fetch landed.
    setStops(null);
    setCityId(nearestCity(p.lat, p.lng).id);
  }, []);

  const clearOrigin = useCallback(() => {
    setOrigin(null);
    setStops(null);
    setError(null);
  }, []);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Your browser doesn't allow location access.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => pickOrigin({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setError("Couldn't get your location. You can tap the map instead."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [pickOrigin]);

  // Deliberate switch via the dropdown: clear the origin and fly the map over.
  const [flyToken, setFlyToken] = useState(0);
  const switchCity = useCallback((id: string) => {
    setCityId(id);
    setOrigin(null); // old origin is meaningless in the new city
    setStops(null);
    setError(null);
    setFlyToken((t) => t + 1);
  }, []);

  const closeInfo = useCallback(() => setInfoOpen(false), []);

  return (
    <>
      <MapView
        city={city}
        theme={theme}
        flyToken={flyToken}
        origin={origin}
        isochrone={iso?.geojson ?? null}
        places={placeLayer?.data ?? null}
        transit={transitLayer}
        onPickOrigin={pickOrigin}
      />
      <Controls
        city={city}
        theme={theme}
        minutes={minutes}
        maxMinutes={budget}
        walkSpeed={walkSpeed}
        travelType={travelType}
        loading={loading}
        error={error}
        reachableStopCount={iso?.reachableStopCount ?? null}
        areaKm2={iso?.areaKm2 ?? null}
        originLabel={originLabel}
        showGrocery={showGrocery}
        showGym={showGym}
        showRailway={showRailway}
        showTram={showTram}
        showBus={showBus}
        placeCounts={iso && placeLayer ? placeLayer.counts : null}
        placesError={placesError}
        transitError={transitError}
        onShowGrocery={setShowGrocery}
        onShowGym={setShowGym}
        onShowRailway={setShowRailway}
        onShowTram={setShowTram}
        onShowBus={setShowBus}
        onClearOrigin={clearOrigin}
        onUseMyLocation={useMyLocation}
        onCity={switchCity}
        onTheme={setTheme}
        onInfo={() => setInfoOpen(true)}
        onMinutes={setMinutes}
        onWalkSpeed={setWalkSpeed}
        onTravelType={setTravelType}
        onPickPlace={(lat, lng) => pickOrigin({ lat, lng })}
      />
      {!origin && !infoOpen && (
        <div className="empty-hint">
          Tap the map or search to choose a starting point.
        </div>
      )}
      <InfoDialog open={infoOpen} onClose={closeInfo} />
    </>
  );
}
