import { useEffect, useRef, useState } from "react";
import type { TravelTypeId, WalkSpeedId } from "../lib/types";
import { TIME_STOPS, TRAVEL_TYPES, WALK_SPEEDS, formatMinutes } from "../lib/types";
import { CITIES, type City } from "../lib/cities";
import type { Theme } from "../lib/theme";
import { geocode, type GeocodeMatch } from "../lib/motis";

interface Props {
  city: City;
  theme: Theme;
  minutes: number;
  /** largest travel time the routing server accepted */
  maxMinutes: number;
  walkSpeed: WalkSpeedId;
  travelType: TravelTypeId;
  loading: boolean;
  error: string | null;
  reachableStopCount: number | null;
  areaKm2: number | null;
  /** name of the picked starting point (null = none picked yet) */
  originLabel: string | null;
  onClearOrigin: () => void;
  onUseMyLocation: () => void;
  onCity: (id: string) => void;
  onTheme: (t: Theme) => void;
  onInfo: () => void;
  onMinutes: (m: number) => void;
  onWalkSpeed: (w: WalkSpeedId) => void;
  onTravelType: (t: TravelTypeId) => void;
  onPickPlace: (lat: number, lng: number) => void;
}

export default function Controls(props: Props) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<GeocodeMatch[]>([]);
  const debounceRef = useRef<number | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  // Start collapsed on phones so the map is visible on load; desktop is
  // unaffected (matchMedia is false there). Doesn't track later resizes or
  // rotation, on purpose, to keep this simple.
  const [collapsed, setCollapsed] = useState(
    () => window.matchMedia("(max-width: 640px)").matches
  );

  const bias = { lat: props.city.center[1], lng: props.city.center[0] };

  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    if (query.trim().length < 2) {
      setMatches([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await geocode(query.trim(), bias, ctrl.signal);
        setMatches(res.slice(0, 6));
      } catch {
        /* aborted or offline, ignore */
      }
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, props.city.id]);

  return (
    <div className="controls">
      <div className="header-row">
        <h1>how far, how fast</h1>
        <div className="header-buttons">
          <button
            className="icon-btn"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand controls" : "Collapse controls"}
            title={collapsed ? "Expand controls" : "Collapse controls"}
          >
            {collapsed ? "⌄" : "⌃"}
          </button>
          <button
            className="icon-btn"
            onClick={() => props.onTheme(props.theme === "dark" ? "light" : "dark")}
            aria-label="Toggle light/dark mode"
            title="Toggle light/dark mode"
          >
            {props.theme === "dark" ? "☀" : "☾"}
          </button>
          <button className="icon-btn" onClick={props.onInfo} aria-label="Info" title="Info">
            ?
          </button>
        </div>
      </div>
      {!collapsed && (
      <>
      <p className="tagline">{props.city.label}, travel time visualised.</p>

      <label className="field">
        <span>City</span>
        <select value={props.city.id} onChange={(e) => props.onCity(e.target.value)}>
          {CITIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}, {c.country}
            </option>
          ))}
        </select>
      </label>

      <div className="search">
        <input
          type="text"
          placeholder="Starting from where?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches.length > 0) {
              props.onPickPlace(matches[0].lat, matches[0].lon);
              setQuery("");
              setMatches([]);
            }
          }}
        />
        {matches.length > 0 && (
          <ul className="matches">
            {matches.map((m, i) => (
              <li key={i}>
                <button
                  onClick={() => {
                    props.onPickPlace(m.lat, m.lon);
                    setQuery("");
                    setMatches([]);
                  }}
                >
                  {m.name}
                  <span className="area">
                    {m.areas?.find((a) => a.default)?.name ?? ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {props.originLabel ? (
        <div className="origin-chip">
          <span title={props.originLabel}>From: {props.originLabel}</span>
          <button onClick={props.onClearOrigin} aria-label="Clear starting point" title="Clear">
            ×
          </button>
        </div>
      ) : (
        <button className="link-btn" onClick={props.onUseMyLocation}>
          Use my current location
        </button>
      )}

      <label className="field">
        <span>How much time? <strong>{formatMinutes(props.minutes)}</strong></span>
        {(() => {
          const stops = TIME_STOPS.filter((t) => t <= props.maxMinutes);
          return (
            <input
              type="range"
              min={0}
              max={stops.length - 1}
              step={1}
              value={Math.max(0, stops.indexOf(props.minutes))}
              onChange={(e) => props.onMinutes(stops[Number(e.target.value)])}
            />
          );
        })()}
      </label>

      <label className="field">
        <span>When are you traveling?</span>
        <select
          value={props.travelType}
          onChange={(e) => props.onTravelType(e.target.value as TravelTypeId)}
        >
          {Object.entries(TRAVEL_TYPES).map(([id, t]) => (
            <option key={id} value={id}>{t.label}</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Your walking pace</span>
        <select
          value={props.walkSpeed}
          onChange={(e) => props.onWalkSpeed(e.target.value as WalkSpeedId)}
        >
          {Object.entries(WALK_SPEEDS).map(([id, w]) => (
            <option key={id} value={id}>{w.label}</option>
          ))}
        </select>
      </label>

      <div className="status">
        {props.loading && <span>Calculating…</span>}
        {props.error && <span className="error">{props.error}</span>}
        {!props.loading && !props.error && props.areaKm2 !== null && (
          props.reachableStopCount === 0 ? (
            <span className="warn">
              No public transport within reach of this point. The shape shows
              walking range only.
            </span>
          ) : (
            <span>
              Within reach: ≈{props.areaKm2 < 10 ? props.areaKm2.toFixed(1) : Math.round(props.areaKm2)} km²
              {props.reachableStopCount !== null &&
                ` · ${props.reachableStopCount.toLocaleString()} stops`}
            </span>
          )
        )}
      </div>

      <footer className="attribution">
        Transit data: <a href="https://www.trafiklab.se" target="_blank" rel="noreferrer">Trafiklab</a>
        {" · "}<a href="https://www.hsl.fi/en/hsl/open-data" target="_blank" rel="noreferrer">HSL</a>
        {" · "}Tiles: <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>
        {" · "}Data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
        {" contributors"}
      </footer>
      </>
      )}
    </div>
  );
}
