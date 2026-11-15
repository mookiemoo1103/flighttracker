#!/usr/bin/env python3
"""Repeatedly collect the lower-48 adsb.fi grid during one GitHub Actions run."""
import json
import os
import time
import urllib.request
from datetime import datetime, timezone

API = "https://opendata.adsb.fi/api/v3/lat"
CF_ACCOUNT_ID = os.environ["CLOUDFLARE_ACCOUNT_ID"]
CF_DATABASE_ID = os.environ["CLOUDFLARE_D1_DATABASE_ID"]
CF_TOKEN = os.environ["CLOUDFLARE_API_TOKEN"]
D1_QUERY = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_DATABASE_ID}/query"
REGIONS = [
    (26,-119),(26,-112),(26,-105),(26,-98),(26,-91),(26,-84),(26,-77),(26,-70),
    (31,-116.5),(31,-109.5),(31,-102.5),(31,-95.5),(31,-88.5),(31,-81.5),(31,-74.5),
    (36,-119),(36,-112),(36,-105),(36,-98),(36,-91),(36,-84),(36,-77),(36,-70),
    (41,-116.5),(41,-109.5),(41,-102.5),(41,-95.5),(41,-88.5),(41,-81.5),(41,-74.5),
    (46,-119),(46,-112),(46,-105),(46,-98),(46,-91),(46,-84),(46,-77),(46,-70),
]
SWEEPS_PER_RUN = 6
SWEEP_START_INTERVAL_SECONDS = 50

def d1(sql, params):
    body = json.dumps({"sql": sql, "params": params}, separators=(",", ":")).encode()
    req = urllib.request.Request(D1_QUERY, data=body, method="POST", headers={
        "Authorization": f"Bearer {CF_TOKEN}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=60) as response:
        result = json.loads(response.read().decode("utf-8"))
    if not result.get("success"):
        raise RuntimeError("Cloudflare D1 API error: " + json.dumps(result.get("errors", result)))
    return result

def region_name(lat, lon):
    if lon < -116:
        return "pacific"
    if lon < -102:
        return "southwest" if lat < 37 else "mountain"
    if lon < -90:
        return "central"
    return "southeast" if lat < 37 else "northeast"

def write_region_group(group_name, snapshots, now_ms):
    if not snapshots:
        return
    # Keep SQL short and send aircraft JSON as bound parameters. One D1
    # request commits this regional placefile's complete snapshot.
    values = ",".join("(?,?,?)" for _ in snapshots)
    params = []
    for region_id, payload in snapshots:
        params.extend([region_id, payload, now_ms])
    sql = (
        "INSERT INTO adsbfi_region_data(region_id,payload,updated_at) VALUES " + values +
        " ON CONFLICT(region_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at"
    )
    d1(sql, params)
    d1(
        "INSERT INTO tracker_state(key,value) VALUES(?,?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [f"adsbfi_last_success_{group_name}", str(now_ms)],
    )
    print(f"PLACEFILE {group_name.upper()} UPDATED: {len(snapshots)} grid points at {now_ms}")

def collect_sweep(sweep_number):
    # Group grid points by the six independently served placefiles.
    groups = {name: [] for name in ("pacific", "southwest", "mountain", "central", "southeast", "northeast")}
    for index, point in enumerate(REGIONS):
        groups[region_name(*point)].append((index, point))

    total_records = 0
    for group_name, points in groups.items():
        snapshots = []
        for position, (index, (lat, lon)) in enumerate(points):
            url = f"{API}/{lat}/lon/{lon}/dist/250"
            req = urllib.request.Request(url, headers={
                "Accept": "application/json",
                "User-Agent": "USFlightTrackerPlacefile/adsbfi-github-actions (+https://github.com/mookiemoo1103/flighttracker)",
            })
            with urllib.request.urlopen(req, timeout=25) as response:
                if response.status != 200:
                    raise RuntimeError(f"adsb.fi HTTP {response.status} for region {index}")
                data = json.loads(response.read().decode("utf-8"))
            if not isinstance(data.get("ac"), list):
                raise RuntimeError(f"adsb.fi response missing aircraft array for region {index}")
            payload = json.dumps(data["ac"], separators=(",", ":"), ensure_ascii=False)
            snapshots.append((index, payload))
            total_records += len(data["ac"])
            print(f"Sweep {sweep_number}/{SWEEPS_PER_RUN} — {group_name}: grid {index + 1}/{len(REGIONS)}, {len(data['ac'])} aircraft")
            if position < len(points) - 1:
                time.sleep(1.1)

        # Publish this placefile's data immediately; do not wait for other
        # regions in the country to finish.
        now_ms = int(time.time() * 1000)
        write_region_group(group_name, snapshots, now_ms)

    now_ms = int(time.time() * 1000)
    state = [
        ("adsbfi_next_region", "0"),
        ("adsbfi_last_success", str(now_ms)),
        ("adsbfi_last_batch_count", str(len(REGIONS))),
        ("adsbfi_last_source", "github-actions"),
        ("adsbfi_last_sweep", str(sweep_number)),
    ]
    for key, value in state:
        d1(
            "INSERT INTO tracker_state(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            [key, value],
        )
    print(f"SWEEP {sweep_number} SUCCESS: {len(REGIONS)} grid points; {total_records} aircraft records; {datetime.now(timezone.utc).isoformat()}")

def enrich_aircraft_registry():
    # Cache a bounded number of unseen aircraft by ICAO hex each collector run.
    known_result = d1("SELECT hex FROM aircraft_registry", [])
    known = {row["hex"].lower() for result in known_result.get("result", []) for row in result.get("results", [])}
    snapshot_result = d1("SELECT payload FROM adsbfi_region_data", [])
    candidates = set()
    for result in snapshot_result.get("result", []):
        for row in result.get("results", []):
            try:
                items = json.loads(row["payload"])
            except (TypeError, json.JSONDecodeError):
                continue
            for item in items:
                hx = str(item.get("hex", "")).lower()
                if len(hx) == 6 and all(c in "0123456789abcdef" for c in hx) and hx not in known:
                    candidates.add(hx)
    enriched = 0
    for hx in sorted(candidates)[:40]:
        try:
            req = urllib.request.Request(f"https://hexdb.io/api/v2/aircraft/{hx}",
                headers={"Accept": "application/json", "User-Agent": "USFlightTracker/1.0"})
            with urllib.request.urlopen(req, timeout=15) as response:
                record = json.loads(response.read().decode("utf-8"))
            if record.get("hex"):
                d1("INSERT INTO aircraft_registry(hex,registration,manufacturer,type,icao_type_code,registered_owner,payload,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(hex) DO UPDATE SET registration=excluded.registration,manufacturer=excluded.manufacturer,type=excluded.type,icao_type_code=excluded.icao_type_code,registered_owner=excluded.registered_owner,payload=excluded.payload,updated_at=excluded.updated_at",
                   [hx,record.get("registration"),record.get("manufacturer"),record.get("type"),record.get("icao_type_code"),record.get("registered_owner"),json.dumps(record,separators=(",",":")),int(time.time()*1000)])
                enriched += 1
        except Exception as exc:
            print(f"Registry lookup skipped for {hx}: {exc}")
        time.sleep(1.05)
    print(f"AIRCRAFT REGISTRY: cached {enriched} new ICAO records from {len(candidates)} candidates")

def main():
    run_started = time.monotonic()
    for sweep in range(1, SWEEPS_PER_RUN + 1):
        target_start = run_started + (sweep - 1) * SWEEP_START_INTERVAL_SECONDS
        wait = target_start - time.monotonic()
        if wait > 0:
            print(f"Waiting {wait:.1f}s before sweep {sweep}")
            time.sleep(wait)
        collect_sweep(sweep)
    enrich_aircraft_registry()
    print(f"Completed {SWEEPS_PER_RUN} full lower-48 sweeps in {time.monotonic() - run_started:.1f}s")

if __name__ == "__main__":
    main()
