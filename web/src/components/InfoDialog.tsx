interface Props {
  open: boolean;
  onClose: () => void;
}

export default function InfoDialog({ open, onClose }: Props) {
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
        <button className="dialog-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <h2 id="info-title">HowFarHowFast</h2>
        <p>
          Pick a starting point and a travel time. The map shows everything you can
          reach within that time using public transport and walking.
        </p>

        <h3>What it's for</h3>
        <p>
          I mainly built it for apartment hunting: drop a pin on a listing and check if
          work is within 30 minutes. You can also start from your office instead, to see
          which areas would give you a short commute. Every view has its own link, so
          you can save it or send it to someone.
        </p>

        <h3>The controls</h3>
        <p>
          The slider sets your travel time, from 10 minutes to 2 hours. The travel type
          changes which departures are available, since there is more service at rush
          hour than on a Sunday. Walking pace is used for the walk to and from the
          stops.
        </p>

        <h3>How it works</h3>
        <p>
          Each search asks a routing server to plan journeys from your starting point
          using the current timetables. The departure times used are a normal Tuesday
          at 08:00 or 15:00, or a Sunday at noon (public holidays mostly run a Sunday
          schedule). It's a planning estimate, so live delays are not included.
        </p>

        <h3>About</h3>
        <p>
          I'm Raynard, a Singaporean living in Stockholm. I'm finishing my master's at
          the Stockholm School of Economics and work in the investments industry. I
          made this as a summer project based on my own experiences while apartment
          hunting, because it was hard to tell how well connected a place actually is.
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
          <a href="mailto:proj.howfarhowfast@gmail.com">email me</a> for any queries
          about the project.
        </p>
        <p>
          The project was heavily inspired by the Singapore Travel Time Map (
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
          ). It is open source under the MIT license.
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
          (CC0). Map tiles by{" "}
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
