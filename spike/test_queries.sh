#!/usr/bin/env bash
# Validation queries against the local MOTIS server (run setup.sh first).
# Tests: 3 travel types x 3 walking speeds, one-to-all from T-Centralen.
# Reports latency, reachable-stop counts, and saves raw JSON to results/.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p results

BASE="http://localhost:8080/api/v6"
ORIGIN="59.3311,18.0598"   # T-Centralen

# Representative datetimes (next plain Tuesday / Saturday, Europe/Stockholm)
read -r PEAK NONPEAK WEEKEND <<< "$(python3 - <<'PY'
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo
tz = ZoneInfo("Europe/Stockholm")
today = datetime.now(tz).date()
def next_dow(d, dow):  # dow: Mon=0
    days = (dow - d.weekday()) % 7 or 7
    return d + timedelta(days=days)
tue, sat = next_dow(today, 1), next_dow(today, 5)
fmt = lambda d, h, m: datetime.combine(d, time(h, m), tz).isoformat()
print(fmt(tue, 7, 45), fmt(tue, 12, 0), fmt(sat, 12, 0))
PY
)"

# (plain functions instead of associative arrays: macOS ships bash 3.2)
time_for()  { case "$1" in peak) echo "$PEAK";; nonpeak) echo "$NONPEAK";; weekend) echo "$WEEKEND";; esac; }
speed_for() { case "$1" in slow) echo 1.0;; avg) echo 1.4;; fast) echo 1.7;; esac; }  # m/s

echo "travel_type  walk_speed  http  latency_s  reachable_stops  bytes"
for tt in peak nonpeak weekend; do
  for sp in slow avg fast; do
    out="results/${tt}_${sp}.json"
    read -r code t <<< "$(curl -s -o "$out" -w "%{http_code} %{time_total}" -G "$BASE/one-to-all" \
      --data-urlencode "one=$ORIGIN" \
      --data-urlencode "time=$(time_for $tt)" \
      --data-urlencode "maxTravelTime=120" \
      --data-urlencode "pedestrianSpeed=$(speed_for $sp)")"
    n=$(python3 -c "import json;print(len(json.load(open('$out')).get('all',[])))" 2>/dev/null || echo "?")
    printf "%-11s  %-10s  %-4s  %-9s  %-15s  %s\n" "$tt" "$sp" "$code" "$t" "$n" "$(wc -c < "$out" | tr -d ' ')"
  done
done

echo
echo ">> Sanity checks:"
# Geocoding (replaces OneMap search)
curl -s -G "$BASE/../v1/geocode" --data-urlencode "text=Slussen" | head -c 400; echo; echo
# Response shape sample
python3 - <<'PY'
import json
d = json.load(open("results/peak_avg.json"))
print("Top-level keys:", list(d.keys()))
stops = d.get("all", [])
if stops:
    print("Sample entry:", json.dumps(stops[0], indent=2)[:500])
    print("Max duration (s):", max(s.get("duration", 0) for s in stops))
PY
echo
echo ">> Key comparisons to eyeball:"
echo "   - peak vs weekend reachable_stops should differ (service levels)"
echo "   - slow vs fast walk should differ (access/egress reach)"
echo "   - all latencies ideally < 1-2 s"
