#!/usr/bin/env python3
"""Collect the lower-48 adsb.fi grid from GitHub Actions and stage it for Cloudflare D1."""
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://opendata.adsb.fi/api/v3/lat"
REGIONS = [
    (26,-119),(26,-112),(26,-105),(26,-98),(26,-91),(26,-84),(26,-77),(26,-70),
    (31,-116.5),(31,-109.5),(31,-102.5),(31,-95.5),(31,-88.5),(31,-81.5),(31,-74.5),
    (36,-119),(36,-112),(36,-105),(36,-98),(36,-91),(36,-84),(36,-77),(36,-70),
    (41,-116.5),(41,-109.5),(41,-102.5),(41,-95.5),(41,-88.5),(41,-81.5),(41,-74.5),
    (46,-119),(46,-112),(46,-105),(46,-98),(46,-91),(46,-84),(46,-77),(46,-70),
]

def sql_literal(value):
    return "'" + str(value).replace("'", "''") + "'"

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
    statements = []
    for region_id, payload in snapshots:
        statements.append(
            "INSERT INTO adsbfi_region_data(region_id,payload,updated_at) VALUES "
            f"({region_id},{sql_literal(payload)},{now_ms}) "
            "ON CONFLICT(region_id) DO UPDATE SET "
            "payload=excluded.payload,updated_at=excluded.updated_at;"
        )
    state = {
        "adsbfi_next_region": "0",
        "adsbfi_last_success": str(now_ms),
        "adsbfi_last_batch_count": str(len(snapshots)),
        "adsbfi_last_source": "github-actions",
    }
    for key, value in state.items():
        statements.append(
            "INSERT INTO tracker_state(key,value) VALUES "
            f"({sql_literal(key)},{sql_literal(value)}) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value;"
        )
    Path("adsbfi_refresh.sql").write_text("\n".join(statements) + "\n", encoding="utf-8")
    total = sum(len(json.loads(payload)) for _, payload in snapshots)
    print(f"Prepared {len(snapshots)} regions; {total} aircraft records; timestamp {datetime.now(timezone.utc).isoformat()}")

if __name__ == "__main__":
    main()
