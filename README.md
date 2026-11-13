# US Flight Tracker Placefile

A nationwide ADS-B aircraft layer for AquaCeroWx / GRLevelX, using OpenSky Network's free public API.

## Placefile URL
`https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/flighttracker.txt`

Add it in AquaCeroWx: **Edit Layers → Add Layer → Custom Layer → Live link**, paste the URL, then **Continue → Save & Load**. Enable **Show icons** and **Show text**.

## What was fixed
- Uses valid GRLevelX placefile structure: `Object:`, `Icon:`, `Text:`, and `End:`.
- Adds a real transparent PNG icon sprite sheet at `assets/aircraft.png` and declares it with `IconFile:`.
- Six icon types: commercial airliner, private/general aviation, helicopter, cargo, military, and unknown.
- Adds hover details including callsign, registration/model when known, altitude, speed, heading, ICAO24 and squawk.
- Requests OpenSky's extended state-vector response to obtain aircraft category.

## Updates and free API limits
The committed GitHub placefile is a snapshot refreshed by GitHub Actions every 15 minutes. A nationwide OpenSky bounding-box query costs 4 API credits; anonymous access has 400 credits/day, so a 15-minute cadence uses 384 credits/day. The source data itself has 10-second resolution for anonymous access, but repeatedly querying the entire country every 10 seconds would exceed the free daily allowance.

For faster refreshes, run `python flighttracker.py` on an always-on computer with OpenSky API credentials configured and a suitable authenticated quota. GitHub Actions is not a one-second streaming server; its schedule cannot publish a new file every second.

## Run locally
```bash
python -m pip install -r requirements.txt
python generate_assets.py
python flighttracker.py
```
The script writes `flighttracker.txt` in its working directory. Set `POLL_SECONDS` to a value of at least 900 for anonymous nationwide polling. The script enforces a 15-minute minimum to protect the free API allowance.

## Data limitations
This is ADS-B receiver-network coverage, not a complete FAA radar feed. Aircraft that do not transmit compatible data or are outside receiver coverage will not appear. Aircraft type metadata is incomplete; unidentified aircraft use the gray unknown icon.

OpenSky API documentation: https://openskynetwork.github.io/opensky-api/rest.html  
Aircraft metadata: https://github.com/openskynetwork/opensky-aircraft-database
