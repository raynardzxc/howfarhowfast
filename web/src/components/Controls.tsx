import { useEffect, useRef, useState } from "react";
import type { TravelTypeId, WalkSpeedId } from "../lib/types";
import { TIME_STOPS, TRAVEL_TYPES, WALK_SPEEDS, formatMinutes } from "../lib/types";
import { CITIES, type City } from "../lib/cities";
import type { Theme } from "../lib/theme";
import { geocode, type GeocodeMatch } from "../lib/motis";
import { PLACE_CATEGORIES, countPhrase, placeColour, type PlaceCounts } from "../lib/places";
import {
  DEFAULT_STROKE,
  ICON_BOX,
  LEGEND_ICON_PX,
  MODE_ICON_PATHS,
  PLACE_ICON_PATHS,
  strokeFor,
  type IconName,
  type PlaceIconName,
} from "../lib/icons";

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
  showGrocery: boolean;
  showGym: boolean;
  showRailway: boolean;
  showTram: boolean;
  showBus: boolean;
  /** how many of each are within reach, null before a starting point is set */
  placeCounts: PlaceCounts | null;
  placesError: boolean;
  transitError: boolean;
  onShowGrocery: (v: boolean) => void;
  onShowGym: (v: boolean) => void;
  onShowRailway: (v: boolean) => void;
  onShowTram: (v: boolean) => void;
  onShowBus: (v: boolean) => void;
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

/**
 * The same pictograms the map draws, from one shared set of paths so the legend
 * and the map cannot drift apart.
 *
 * Transit modes are drawn in the panel's own text colour, since on the map their
 * colour belongs to the line rather than the mode. The two place overlays keep
 * their category colour, because that is exactly how they appear on the map.
 */
function Icon({ paths, colour, stroke }: { paths: string[]; colour?: string; stroke?: number }) {
  return (
    <svg
      width={LEGEND_ICON_PX}
      height={LEGEND_ICON_PX}
      viewBox={`0 0 ${ICON_BOX} ${ICON_BOX}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke ?? DEFAULT_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={colour ? { color: colour } : undefined}
      aria-hidden="true"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

const ModeIcon = ({ name }: { name: IconName }) => (
  <Icon paths={MODE_ICON_PATHS[name]} stroke={strokeFor(name)} />
);

// The places carry their own colour, since on the map that is what tells a
// grocery shop from a gym.
const PlaceIcon = ({ name, colour }: { name: PlaceIconName; colour: string }) => (
  <Icon paths={PLACE_ICON_PATHS[name]} colour={colour} stroke={strokeFor(name)} />
);

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
    return () => {
      window.clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
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
            {/* same chevron shape as the select dropdowns below, just
                rotated, so it reads as the same "arrow" language */}
            <svg
              width="13"
              height="13"
              viewBox="0 0 12 12"
              style={{ transform: collapsed ? undefined : "rotate(180deg)" }}
            >
              <path
                d="M2.5 4.5 6 8l3.5-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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
          // Never empty: a zero-length list gives max={-1} and NaN minutes.
          const stops = TIME_STOPS.filter((t) => t <= props.maxMinutes);
          if (stops.length === 0) stops.push(TIME_STOPS[0]);
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

      <div className="field">
        <span>Show on the map</span>
        <div className="toggles">
          <label className="toggle">
            <input
              type="checkbox"
              checked={props.showRailway}
              onChange={(e) => props.onShowRailway(e.target.checked)}
            />
            <span className="slot">
              <ModeIcon name="train" />
            </span>
            Metro and commuter train
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={props.showTram}
              onChange={(e) => props.onShowTram(e.target.checked)}
            />
            <span className="slot">
              <ModeIcon name="tram" />
            </span>
            Tram
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={props.showBus}
              onChange={(e) => props.onShowBus(e.target.checked)}
            />
            <span className="slot">
              <ModeIcon name="bus" />
            </span>
            Trunk bus
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={props.showGrocery}
              onChange={(e) => props.onShowGrocery(e.target.checked)}
            />
            {/* Same pictogram and colour as on the map. */}
            <span className="slot">
              <PlaceIcon name="grocery" colour={placeColour("grocery", props.theme)} />
            </span>
            {PLACE_CATEGORIES.grocery.label}
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={props.showGym}
              onChange={(e) => props.onShowGym(e.target.checked)}
            />
            <span className="slot">
              <PlaceIcon name="gym" colour={placeColour("gym", props.theme)} />
            </span>
            {PLACE_CATEGORIES.gym.label}
          </label>
        </div>
        {props.transitError && (
          <div className="place-counts">Network data isn't available for this city.</div>
        )}
        {(props.showGrocery || props.showGym) && (props.placesError || props.placeCounts) && (
          <div className="place-counts">
            {props.placesError
              ? "Places data isn't available for this city."
              : `${[
                  props.showGrocery ? countPhrase(props.placeCounts!.grocery, "grocery") : null,
                  props.showGym ? countPhrase(props.placeCounts!.gym, "gym") : null,
                ]
                  .filter(Boolean)
                  .join(" and ")} in reach`}
          </div>
        )}
      </div>

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
