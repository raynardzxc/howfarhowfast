import { useEffect, useRef } from "react";
import { CITIES } from "../lib/cities";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** "Stockholm and Helsinki" / "Stockholm, Helsinki and Oslo", grows with the registry */
function cityList(): string {
  const names = CITIES.map((c) => c.label);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export default function InfoDialog({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes; focus moves to the close button on open.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} className="dialog-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <h2 id="info-title">how far, how fast</h2>
        <p>
          Pick a starting point and a travel time. The map shows everything you can
          reach within that time using public transport and walking. Currently
          {" "}{cityList()}.
        </p>

        <h3>What it's for</h3>
        <p>
          I built it for apartment hunting: set the starting point to an apartment's
          address and see if work is within 30 minutes. Start from your office instead
          and you get the areas with a short commute. Every view has its own link, to
          save or to send to someone.
        </p>

        <h3>The controls</h3>
        <p>
          The slider sets travel time, 10 minutes to 2 hours. Travel type picks the
          departure, since there is more service at rush hour than on a Sunday.
          Walking pace applies to the walk to and from stops.
        </p>
        <p>
          Metro and commuter train lines are shown by default, with stop names
          appearing as you zoom in. Trams and trunk buses have their own toggles.
          Grocery shops and gyms can be switched on as well, and the ones you can reach
          in your travel time stand out from the rest. Their locations come from
          OpenStreetMap, so some will be missing.
        </p>

        <h3>How it works</h3>
        <p>
          Each search asks a routing server to plan journeys against the current
          timetables, departing a normal Tuesday at 08:00 or 15:00, or a Sunday at
          noon (holidays mostly run a Sunday schedule). It's a planning estimate, so
          live delays are not included.
        </p>

        <h3>About</h3>
        <p>
          I'm Raynard, a Singaporean living in Stockholm, finishing my master's at the
          Stockholm School of Economics and working in investments. I made this as a
          summer project, after apartment hunting made clear how hard it is to tell
          whether a place is well connected.
        </p>
        <p>
          Say hi on{" "}
          <a
            href="https://www.linkedin.com/in/cycraynard/"
            target="_blank"
            rel="noreferrer"
          >
            LinkedIn
          </a>
          , or{" "}
          <a href="mailto:proj.howfarhowfast@gmail.com">email me</a> about the project.
        </p>
        <p>
          Heavily inspired by the Singapore Travel Time Map (
          <a href="https://www.traveltime.sg/" target="_blank" rel="noreferrer">
            traveltime.sg
          </a>
          ,{" "}
          <a
            href="https://github.com/Vorld/singapore-travel-time-map"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          ). It is open source under the MIT license, code on{" "}
          <a
            href="https://github.com/raynardzxc/howfarhowfast"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          .
        </p>

        <h3>Data &amp; attribution</h3>
        <p className="fine-print">
          Routing by{" "}
          <a href="https://github.com/motis-project/motis" target="_blank" rel="noreferrer">
            MOTIS
          </a>
          . Swedish transit data from{" "}
          <a href="https://www.trafiklab.se" target="_blank" rel="noreferrer">
            Trafiklab
          </a>{" "}
          (CC0). Finnish transit data from{" "}
          <a href="https://www.hsl.fi/en/hsl/open-data" target="_blank" rel="noreferrer">
            HSL
          </a>{" "}
          (CC BY 4.0). Map tiles by{" "}
          <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
            OpenFreeMap
          </a>{" "}
          (© OpenMapTiles). Street and walking network data ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap
          </a>{" "}
          contributors.
        </p>
      </div>
    </div>
  );
}
