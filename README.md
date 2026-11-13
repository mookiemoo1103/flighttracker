# US Flight Tracker Placefile

A live US air-traffic placefile generated from the free OpenSky Network public ADS-B API.

## Files
- `flighttracker.py` — polls OpenSky, enriches aircraft via the public aircraft database, and writes `flighttracker.txt`.
- `flighttracker.txt` — generated placefile; it is intentionally not committed as a live snapshot because it becomes stale immediately.
- `.github/workflows/update-placefile.yml` — optional scheduled snapshot workflow (GitHub Actions cadence is minutes, not seconds).

## Live operation (recommended)
Run the collector on a computer that remains online, then point AquaCeroWx/GRLevelX at the generated `flighttracker.txt` file or serve it from a local web server.

```bash
python -m pip install --upgrade pip
python flighttracker.py
```

The script refreshes at a conservative 10-second target. OpenSky's anonymous public feed itself has approximately 10-second resolution and rate limits; polling every second would not provide newer data and would unnecessarily consume service capacity. The client placefile refresh header is 10 seconds.

## Coverage and limitations
The query uses broad geographic bounds intended to include the United States and nearby airspace. The feed is ADS-B-derived, not a complete radar picture: aircraft without suitable transponders, aircraft not received by participating sensors, and some low-altitude/remote traffic may be missing. Aircraft metadata is incomplete for some hex codes; those targets are marked as unknown rather than guessed.

Aircraft categories are color-coded:
- **Commercial airliners:** red
- **Regional airline aircraft:** orange
- **Private / general aviation:** blue
- **Helicopters:** yellow
- **Military:** purple (only when metadata/callsign identifies it)
- **Cargo:** green
- **Unclassified:** gray

## Data source and terms
OpenSky Network API: https://openskynetwork.github.io/opensky-api/rest.html  
OpenSky aircraft metadata: https://github.com/openskynetwork/opensky-aircraft-database

OpenSky documents the API as intended for research/non-commercial use and applies API-credit/rate limits. Review its current terms and limits before operational or commercial use. This tool is for situational awareness only, not aviation safety or dispatch decisions.

## Configuration
Environment variables:
- `POLL_SECONDS` (default 10; enforced minimum 10)
- `LAT_MIN`, `LAT_MAX`, `LON_MIN`, `LON_MAX` (geographic bounds)
- `OPENSKY_URL` (API endpoint)
- `PLACEFILE_OUTPUT` (output filename)
