#!/usr/bin/env python3
"""Collect lower-48 adsb.fi aircraft and write snapshots to Cloudflare D1 using bound parameters."""
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

def main():
    snapshots = []
    for index, (lat, lon) in enumerate(REGIONS):
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
        snapshots.append((index, json.dumps(data["ac"], separators=(",", ":"), ensure_ascii=False)))
        print(f"Region {index + 1}/{len(REGIONS)}: {len(data['ac'])} aircraft")
        if index < len(REGIONS) - 1:
            time.sleep(1.1)

    now_ms = int(time.time() * 1000)
    # Bound parameters keep large aircraft JSON out of the SQL statement text.
    for region_id, payload in snapshots:
        d1(
            "INSERT INTO adsbfi_region_data(region_id,payload,updated_at) VALUES(?,?,?) "
            "ON CONFLICT(region_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
            [region_id, payload, now_ms],
        )
        print(f"Saved region {region_id + 1}/{len(REGIONS)} to D1")
    state = [
        ("adsbfi_next_region", "0"),
        ("adsbfi_last_success", str(now_ms)),
        ("adsbfi_last_batch_count", str(len(snapshots))),
        ("adsbfi_last_source", "github-actions"),
    ]
    for key, value in state:
        d1(
            "INSERT INTO tracker_state(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            [key, value],
        )
    total = sum(len(json.loads(payload)) for _, payload in snapshots)
    print(f"SUCCESS: {len(snapshots)} regions; {total} aircraft records; {datetime.now(timezone.utc).isoformat()}")

if __name__ == "__main__":
    main()
