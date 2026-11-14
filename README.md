# U.S. Flight Tracker Placefile

AquaCeroWx / GRLevelX placefile using the **FlyItalyADSB** public API.

## Placefile
https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/flighttracker.txt

## Free API plan and coverage strategy
- API: https://api.flyitalyadsb.com/v2
- Authentication: GitHub Actions secret `FLYITALYADSB_API_KEY` (header `X-Api-Key`)
- Free plan: 30 requests/minute, 300,000 requests/month, maximum 500 km radius per request.
- This collector deliberately uses **6 requests per scheduled run**, once per minute: approximately 259,200 requests in a 30-day month, leaving a small quota margin.
- It rotates through 28 overlapping 500-km circles covering the contiguous U.S. A full geographic sweep takes about 5 minutes. Aircraft from recently queried regions are retained in a rolling cache for up to 7 minutes so the map does not collapse to only the six areas queried in the latest run.
- This is a quota-aware compromise, not a fresh nationwide snapshot every minute. Receiver coverage varies by location and some aircraft may not be seen.

## Live display
The placefile reread interval is 10 seconds. The scheduled GitHub workflow republishes approximately once per minute, subject to GitHub Actions scheduling delays. GitHub-hosted cron is not a guaranteed real-time scheduler.
- Transparent aircraft silhouette, existing category colors, and heading rotation are retained.
- Labels below icons show aircraft ID, speed in knots, and altitude.
- Commercial airline/operator and military branch labels are shown when metadata supports identification.
- Hover details include registration, aircraft type and ICAO24.

## Setup
In GitHub repository Settings -> Secrets and variables -> Actions, create repository secret:
`FLYITALYADSB_API_KEY`

Run the workflow manually from Actions to test it. The collector requires the secret and writes `flighttracker.txt` and `aircraft_cache.json`.

## Quota
Six requests per run × 1,440 runs/day × 30 days = 259,200 requests per 30-day month. Do not increase requests per run or trigger repeated manual runs without checking the provider's usage headers. Quota headers are included in placefile comments.

## Attribution and safety
Flight data: FlyItalyADSB (flyitalyadsb.com), CC BY-SA 4.0. Community ADS-B data is not certified aviation surveillance and must not be used for dispatch or safety-critical decisions.
