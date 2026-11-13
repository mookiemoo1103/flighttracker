# US Flight Tracker Placefile

AquaCeroWx / GRLevelX placefile using live community ADS-B data from [ADSB.lol](https://www.adsb.lol/).

## Placefile URL
https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/flighttracker.txt

## Data source
The collector now uses the ADSB.lol public v2 API instead of OpenSky. Aircraft details include callsign, registration, ICAO type, altitude, ground speed, heading and squawk when provided by receivers.

API docs: https://www.adsb.lol/docs/open-data/api  
API key request: https://www.adsb.lol/request  
Feeder information: https://www.adsb.lol/docs

## Important coverage and refresh limits
The free public API supports point-radius queries. This implementation samples four 250-nautical-mile circles (Northeast, Southeast, Central and West) and de-duplicates aircraft. **This is not complete wall-to-wall U.S. coverage; there are substantial gaps.**

The public no-key allowance is 500 requests/day per IP. Four requests per collection cycle means the GitHub workflow runs every 15 minutes (384 requests/day). ADSB.lol documents a free adhoc key at 1,000/day and a free feeder key at 7,200/day plus feeder-only raw re-api access. The feeder-only worldwide snapshot is available twice per minute. See the provider's current documentation for terms and quota.

A true nationwide snapshot requires a feeder key and the feeder-only re-api / whole-world endpoint. The feeder endpoint is restricted to the feeder's IP; for a remote GitHub-hosted collector you would need a secure VPN/proxy arrangement or run the collector on the feeder host. Do not expose API keys in this repository.

## Aircraft icons
- 1: Commercial airliner (red)
- 2: Private / regional (blue)
- 3: Helicopter (yellow)
- 4: Cargo (green)
- 5: Military (purple)
- 6: Unknown (gray)

Icon sprite: [assets/aircraft.png](assets/aircraft.png)

## Running locally
```bash
python flighttracker.py
```
Optional environment variables:
- `ADSBLOL_API_KEY`: optional API key in the request header
- `POLL_SECONDS`: minimum is 900 seconds in this four-region free-tier configuration
- `PLACEFILE_OUTPUT`: output filename

The GitHub Actions workflow publishes snapshots every 15 minutes. The placefile's `Refresh: 10` controls AquaCeroWx's file reread interval; it does not make the underlying data update every 10 seconds.

## License and operational note
ADSB.lol publishes its API data under ODbL 1.0. Review attribution, share-alike and other license obligations before redistributing or operating a public-facing service. This is community ADS-B data, not certified aviation surveillance and not suitable for dispatch or safety-critical decisions.
