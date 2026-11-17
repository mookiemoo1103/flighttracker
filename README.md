# U.S. Flight Tracker Placefiles

AquaCeroWx / GRLevelX live aircraft placefiles served by the Cloudflare Worker and Cloudflare D1.

## Live combined placefiles

## Regional Southeast Louisiana live traffic placefile

- **GitHub-hosted placefile:** `https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/traffic.txt`
- This traffic placefile is generated and hosted directly from this GitHub repository. It does not use the Cloudflare Worker.
- Coverage: Pearl River, Slidell, the Northshore, New Orleans, Baton Rouge and nearby Mississippi Gulf Coast corridors.
- Source: TomTom Traffic Flow Vector Tiles. The GitHub Actions workflow requests 80 regional vector tiles every five minutes (about 23,040 tile requests per 30 days), within the published 200,000-request monthly free developer allowance.
- Speed colors use TomTom's measured speed relative to free-flow speed: green at 85% or faster, yellow at 65–84%, orange at 45–64%, and red below 45% or when a road is marked closed.
- Roads are published as vector line geometry, not stretched raster images. Interstates are slightly thicker than highways.
- To enable updates, add a GitHub Actions repository secret named `TOMTOM_API_KEY` with a TomTom Traffic Flow Vector Tiles API key. The scheduled workflow runs every five minutes and can also be started manually from GitHub Actions.
- GitHub Actions publishes the generated `traffic.txt` directly to the repository. If a TomTom request fails, the workflow does not overwrite the last successfully generated placefile.

## Separate Louisiana road-event placefile

- **Event placefile:** `https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/traffic-events/traffic-events.txt`
- This is an additive overlay. It does not replace or modify the existing TomTom traffic-speed placefile.
- Sources: official 511LA Events API plus DOTD 511 Road Closures FeatureServer event-centroid and roadway-line layers. Centroid and roadway-line representations are merged by provider event identity while preserving roadway geometry. Each record retains its source and original event type/subtype.
- Same-theme icons: red road-closure sign, orange construction worker, and purple traffic-incident symbol. Weather and other provider event families retain distinct labels and line colors while reusing the closest matching existing icon family, avoiding broken or missing assets. PNG assets are stored in `traffic-events/assets/` and referenced directly by the placefile.
- The event placefile refreshes every five minutes and includes roadway, direction, subtype, description/details, parish, severity, lane impacts, status, schedule, detour instructions, and expected end time when supplied.
- Roadway polylines from 511LA and DOTD are retained as line geometry instead of being reduced to a single averaged point. Event pins remain visible with the matching themed icon. Supported categories remain distinct: closures, construction, construction with workers present, traffic incidents, weather incidents, weather closures, special events, and other provider-defined event types. Existing red/orange/purple icon families are retained; category-specific line colors and popup headings distinguish the additional event families.
- Duplicate source identifiers are qualified with a roadway/description signature to prevent unrelated records with reused IDs from being collapsed. Explicit inactive/cancelled/resolved statuses and passed planned end times are filtered; an old `LastUpdated` value alone no longer expires an otherwise active event.
- GitHub Actions validates matching TXT/GeoJSON event counts, source attribution, event categories, icon assets, and point/line coordinates before publishing both `traffic-events/traffic-events.txt` and `traffic-events/traffic-events.geojson`.
- The 511LA advisories endpoint provides region-level messages but does not provide map coordinates or roadway geometry, so advisories are not fabricated into map pins. Waze incidents/closures are a separate 511LA map layer; Waze's live partner data feed is distributed through its authenticated Partner Hub. A DOTD-published Waze feed URL or authorized feed access is required before those reports can be added faithfully. The existing TomTom speed feed and aircraft feeds remain separate and unchanged. Failed source requests or validation do not overwrite the last published files.

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

- Helicopters use icon file 2: `assets/helicopter-aircraft-theme-96.png`, 96×96, centered anchor 48×48, very light grey fill with the same black outline weight as the airplane icons.
- Helicopter detection uses multiple aircraft type/model/description fields, registry enrichment, and ADS-B emitter categories A7/A8. Unknown aircraft with valid positions remain displayed as General Aviation rather than being dropped.
- Business-jet type codes are matched individually against every available ADS-B and registry type field; they are not tested against one concatenated string. This prevents populated secondary metadata fields from hiding a valid jet code.
- A scheduled, rate-limited HexDB lookup enriches active aircraft with missing type data and caches registration, manufacturer, model, ICAO type code and registered owner in D1. Not-found results are cached to avoid repeated lookups.
- Placefile diagnostics report the number rendered in each category, selected records per source, and ICAO24 duplicates removed.
- Passenger, commercial, business-jet, general-aviation, military/government and helicopter icon assignments are kept separate.

## Diagnostics

- `/health` reports FlyItalyADSB and ADSB.lol last-success times, batch counts and errors.
- `/adsblol-health` reports ADSB.lol cached regions, aircraft record counts, per-region freshness and collection errors.
- `/registry-health` reports HexDB registry cache size, aircraft with known ICAO types, latest enrichment batch counts and lookup errors.
- `/flyitaly-test.txt` and `/adsblol-test.txt` allow side-by-side source comparison without the combined de-duplication layer.

## Data limitations

Aircraft appear only when a source has a usable ADS-B/MLAT position and reports the aircraft. Community receiver coverage varies by location, altitude, terrain and aircraft equipment. Combining independent networks improves coverage but cannot guarantee every aircraft or continuous reception. This is an awareness/visualization feed, not a certified surveillance system and must not be used for dispatch, separation or other safety-critical decisions.

## Attribution

- FlyItalyADSB: `flyitalyadsb.com`, CC BY-SA 4.0.
- ADSB.lol: community network, ODbL 1.0.
- HexDB: aircraft registration/type lookup; data courtesy of the providers listed in the [HexDB documentation](https://hexdb.io/).
