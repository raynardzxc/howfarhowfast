import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapView from "./components/MapView";
import Controls from "./components/Controls";
import InfoDialog from "./components/InfoDialog";
import { oneToAll, reverseGeocode } from "./lib/motis";
import { computeIsochrone } from "./lib/isochrone";
import { readUrlState, writeUrlState } from "./lib/url";
import { getCity } from "./lib/cities";
import { initialTheme, persistTheme, type Theme } from "./lib/theme";
import type { LatLng, ReachableStop, TravelTypeId, WalkSpeedId } from "./lib/types";
import { WALK_SPEEDS } from "./lib/types";

export default function App() {
  const initial = useMemo(readUrlState, []);
  const [cityId, setCityId] = useState(initial.cityId);
  const [origin, setOrigin] = useState<LatLng | null>(initial.origin);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [walkSpeed, setWalkSpeed] = useState<WalkSpeedId>(initial.walkSpeed);
  const [travelType, setTravelType] = useState<TravelTypeId>(initial.travelType);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [infoOpen, setInfoOpen] = useState(false);

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
    document.title = `HowFarHowFast: ${city.label}, visualised in minutes`;
  }, [city.label]);

  // Fetch one-to-all whenever origin / travel type / walk speed change.
  // The time slider does NOT refetch, it re-thresholds in memory.
  useEffect(() => {
    if (!origin) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    oneToAll(origin, travelType, walkSpeed, city.tz, ctrl.signal)
      .then((r) => {
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
  }, [origin, travelType, walkSpeed, city.tz]);

  useEffect(() => {
    writeUrlState({ origin, minutes, walkSpeed, travelType, cityId });
  }, [origin, minutes, walkSpeed, travelType, cityId]);

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

  const pickOrigin = useCallback((p: LatLng) => setOrigin(p), []);

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
      (p) => setOrigin({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setError("Couldn't get your location. You can tap the map instead."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const switchCity = useCallback((id: string) => {
    setCityId(id);
    setOrigin(null); // old origin is meaningless in the new city
    setStops(null);
    setError(null);
  }, []);

  const closeInfo = useCallback(() => setInfoOpen(false), []);

  return (
    <>
      <MapView
        city={city}
        theme={theme}
        origin={origin}
        isochrone={iso?.geojson ?? null}
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
        onClearOrigin={clearOrigin}
        onUseMyLocation={useMyLocation}
        onCity={switchCity}
        onTheme={setTheme}
        onInfo={() => setInfoOpen(true)}
        onMinutes={setMinutes}
        onWalkSpeed={setWalkSpeed}
        onTravelType={setTravelType}
        onPickPlace={(lat, lng) => setOrigin({ lat, lng })}
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
