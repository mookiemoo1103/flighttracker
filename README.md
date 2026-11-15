# U.S. Flight Tracker Placefile

AquaCeroWx / GRLevelX placefile using the **FlyItalyADSB** live aircraft API.

## Placefile
https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/flighttracker.txt

## Coverage and update frequency
- Queries a full U.S. coverage grid on every workflow run: 48 overlapping 500-km circles across the contiguous states, plus additional circles for Alaska, Hawaii and Puerto Rico.
- All 59 geographic areas are queried during each run; they are no longer rotated six at a time.
- The free API allows 30 requests/minute, 300,000 requests/month and up to 500 km per request. The script sends requests in two batches with a 61-second pause to stay below the per-minute limit.
- GitHub Actions is scheduled every 5 minutes. GitHub-hosted schedules are best-effort and can start late; they cannot guarantee real-time updates.
- AquaCeroWx placefile reread is set to 1 second, so it picks up a newly published file promptly. This does not make the upstream data refresh every second.
- Approximately 59 requests × 288 runs per 30-day month = 16,992 requests/month, well below the 300,000 free-plan allowance.

## Data and display
- Live positions refresh at the provider as new receiver data arrives; aircraft visibility depends on ADS-B/MLAT receiver coverage.
- Transparent aircraft silhouette, category colors, heading rotation and flight labels are retained.
- Labels show aircraft ID, speed in knots and altitude; hover details include registration, aircraft type and ICAO24.
- Aircraft are cached briefly to bridge regional data gaps; this is not a certified surveillance feed and must not be used for dispatch or safety-critical decisions.

## Setup
Repository secret required: `FLYITALYADSB_API_KEY` under Settings -> Secrets and variables -> Actions.

Run the workflow manually from Actions to test it. The collector writes `flighttracker.txt` and `aircraft_cache.json`.

## Attribution
Flight data: FlyItalyADSB (flyitalyadsb.com), CC BY-SA 4.0.
