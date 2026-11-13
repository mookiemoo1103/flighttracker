# US Flight Tracker Placefile

AquaCeroWx / GRLevelX placefile using the public **adsb.fi** community ADS-B API.

## Placefile URL
https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/flighttracker.txt

## Data source and limits
- Source: [adsb.fi](https://adsb.fi/) public API: https://opendata.adsb.fi/api/
- No account, API key, or receiver contribution is required for public point queries.
- Public API limit: **1 request per second**; each geographic query supports up to 250 NM.
- The collector samples 21 overlapping 250-NM circles across the contiguous United States. A complete sweep takes approximately 22 seconds, subject to network and API response time. Coverage is community-receiver dependent and cannot guarantee every aircraft or continuous nationwide visibility.
- adsb.fi's terms currently restrict public API use to personal, non-commercial purposes and require attribution. This project includes attribution in the placefile. See the provider documentation before broader redistribution.

## Placefile display
- Six existing category colors are retained.
- The uploaded airplane silhouette is used as a transparent PNG icon, with the nose rotated to the reported track.
- Aircraft ID, speed in knots, and altitude are printed below the icon.
- Commercial aircraft show an airline/operator name when it can be identified from callsign/operator metadata.
- Military aircraft show a service branch only when the operator/description metadata identifies it; otherwise the label says branch unknown rather than guessing.
- Click/hover details include registration, aircraft type and ICAO24.

## Refresh behavior
The placefile header requests a 10-second reread by AquaCeroWx; that does not change source data freshness. The GitHub Actions workflow republishes on its scheduled cadence (once per minute). For a true seconds-level refresh, run the collector continuously on a computer/server that remains online:
```bash
pip install -r requirements.txt
python flighttracker.py
``
Optional environment variables:
- `POLL_SECONDS`: minimum 20 seconds (default 30); each sweep itself takes about 22 seconds.
- `PLACEFILE_OUTPUT`: output filename.

GitHub-hosted scheduled workflows cannot run every few seconds. The script supports `--once` for scheduled publishing and continuous mode for a continuously running host.

## Operational note
Community ADS-B is not certified aviation surveillance and is not suitable for dispatch or safety-critical decisions. 
