# U.S. Flight Tracker Placefiles

AquaCeroWx / GRLevelX live aircraft placefiles served by the Cloudflare Worker and Cloudflare D1.

## Live combined placefiles

- Full U.S. coverage: `https://flighttracker.mitchellgeissler.workers.dev/flighttracker.txt`
- Pacific: `/pacific.txt`
- Southwest: `/southwest.txt`
- Mountain: `/mountain.txt`
- Central: `/central.txt`
- Southeast: `/southeast.txt`
- Northeast: `/northeast.txt`

The combined placefiles merge independent live networks and de-duplicate aircraft by normalized ICAO24 hex address. When both feeds report the same aircraft, the record with the freshest observed position is retained; ties prefer the record with more aircraft details.

## Compare individual data sources

- FlyItalyADSB only: `https://flighttracker.mitchellgeissler.workers.dev/flyitaly-test.txt`
- ADSB.lol only: `https://flighttracker.mitchellgeissler.workers.dev/adsblol-test.txt`
- Combined feed health: `https://flighttracker.mitchellgeissler.workers.dev/health`
- ADSB.lol collection health: `https://flighttracker.mitchellgeissler.workers.dev/adsblol-health`

## Live data collection

- **FlyItalyADSB** is the primary feed. It uses the `FLYITALYADSB_API_KEY` Worker secret and a 59-area U.S. coverage grid, including Alaska, Hawaii and Puerto Rico. Collection volume adapts to the API key's plan; the current Free-tier batch is 27 requests per minute, for an approximately three-minute full sweep.
- **ADSB.lol** is an independent, public, no-key feed using its ADS-B Exchange-compatible point endpoint. It uses a separate 38-area lower-48 grid, 250-nautical-mile radius, and a conservative 10 requests per minute. A full sweep takes approximately four minutes. Its public rate limits can vary with network load; failed regions are logged and retried on the next sweep.
- **ADSB.fi** was previously used as a secondary feed, but requests from this Cloudflare Worker received HTTP 403. It is not counted as an active source. The old ADSB.fi test cache and diagnostic route remain for reference only.
- Each source has its own D1 cache and collection status. One source can continue updating if the other source is temporarily unavailable.
- Aircraft are merged by ICAO24 hex. The freshest observed position is selected; duplicate records are not drawn twice.
- Provider snapshots are refreshed independently of the placefile reload interval. A 15-minute maximum snapshot age prevents indefinitely stale cached aircraft from being displayed.

## Helicopter and aircraft icons

- Helicopters use icon file 2: `assets/helicopter-map-icon-96.png`, 96×96, centered anchor 48×48.
- Helicopter detection uses multiple aircraft type/model/description fields, registry enrichment, and ADS-B emitter categories A7/A8. Unknown aircraft remain General Aviation rather than being dropped.
- Passenger, commercial, business-jet, general-aviation, military/government and helicopter icon assignments are kept separate.

## Diagnostics

- `/health` reports FlyItalyADSB and ADSB.lol last-success times, batch counts and errors.
- `/adsblol-health` reports ADSB.lol cached regions, aircraft record counts, per-region freshness and collection errors.
- `/flyitaly-test.txt` and `/adsblol-test.txt` allow side-by-side source comparison without the combined de-duplication layer.

## Data limitations

Aircraft appear only when a source has a usable ADS-B/MLAT position and reports the aircraft. Community receiver coverage varies by location, altitude, terrain and aircraft equipment. Combining independent networks improves coverage but cannot guarantee every aircraft or continuous reception. This is an awareness/visualization feed, not a certified surveillance system and must not be used for dispatch, separation or other safety-critical decisions.

## Attribution

- FlyItalyADSB: `flyitalyadsb.com`, CC BY-SA 4.0.
- ADSB.lol: community network, ODbL 1.0.
