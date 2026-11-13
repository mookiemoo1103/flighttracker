#!/usr/bin/env python3
"""
Nationwide ADS-B placefile generator for GRLevelX/AquaCeroWx-style clients.

Data: OpenSky Network public REST API.
The public anonymous API is rate-limited and resolves at approximately 10-second
intervals; this script polls at a conservative 10-second interval by default.
Do not lower the interval below the upstream API's data resolution/allowed rate.

Aircraft classification uses the OpenSky aircraft database when available.
OpenSky state vectors alone do not expose aircraft category/type for every
target, so unknowns are classified by conservative callsign/metadata heuristics.

Output: flighttracker.txt (placefile format)
"""
from __future__ import annotations

import csv
import io
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API_URL = os.getenv("OPENSKY_URL", "https://opensky-network.org/api/states/all")
OUTPUT = Path(os.getenv("PLACEFILE_OUTPUT", "flighttracker.txt"))
POLL_SECONDS = max(10, int(os.getenv("POLL_SECONDS", "10")))
# Contiguous US-focused bounds including Alaska and Hawaii, excluding most ocean.
# Broad bounding region covers the US and nearby airspace.
BBOX = {
    "lamin": float(os.getenv("LAT_MIN", "17.0")),
    "lamax": float(os.getenv("LAT_MAX", "72.0")),
    "lomin": float(os.getenv("LON_MIN", "-180.0")),
    "lomax": float(os.getenv("LON_MAX", "-60.0")),
}
AIRCRAFT_DB_URL = "https://raw.githubusercontent.com/openskynetwork/opensky-aircraft-database/master/aircraftDatabase.csv"
DB_CACHE = Path("aircraftDatabase.csv")
HTTP_TIMEOUT = 35

# Placefile symbols are generated inline as simple text/icon labels. Colors are
# intentionally distinct so categories remain visible on dark/light map themes.
SYMBOLS = {
    "airliner": ("AIRLINER", "255 70 70"),
    "private": ("PRIVATE", "70 170 255"),
    "helicopter": ("HELICOPTER", "255 210 40"),
    "military": ("MILITARY", "190 100 255"),
    "cargo": ("CARGO", "70 220 150"),
    "regional": ("REGIONAL", "255 150 70"),
    "general": ("GENERAL", "230 230 230"),
    "unknown": ("AIRCRAFT", "170 170 170"),
}

def request(url: str) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": "FlightTrackerPlacefile/1.0 (public ADS-B visualization)",
        "Accept": "application/json,text/csv,*/*",
    })
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as response:
        return response.read()

def load_aircraft_db() -> dict[str, dict[str, str]]:
    """Load ICAO24 metadata, cached locally for 7 days."""
    try:
        if not DB_CACHE.exists() or time.time() - DB_CACHE.stat().st_mtime > 7 * 86400:
            data = request(AIRCRAFT_DB_URL)
            DB_CACHE.write_bytes(data)
        text = DB_CACHE.read_text(encoding="utf-8", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        result = {}
        for row in reader:
            hex_id = (row.get("icao24") or "").strip().lower()
            if hex_id:
                result[hex_id] = row
        print(f"Loaded {len(result):,} aircraft metadata records", file=sys.stderr)
        return result
    except Exception as exc:
        print(f"Aircraft metadata unavailable; using callsign heuristics: {exc}", file=sys.stderr)
        return {}

def classify(state: list, db: dict[str, dict[str, str]]) -> tuple[str, str]:
    # OpenSky state vector: 0 ICAO24, 1 callsign, 2 origin country, 3 time pos,
    # 4 last contact, 5 longitude, 6 latitude, 7 baro altitude, 8 on ground,
    # 9 velocity, 10 true track, 11 vertical rate, 12 sensors, 13 geo altitude,
    # 14 squawk, 15 SPI, 16 position source, optional 17 category.
    hex_id = str(state[0] or "").lower()
    callsign = str(state[1] or "").strip()
    meta = db.get(hex_id, {})
    typ = (meta.get("typecode") or "").upper()
    desc = " ".join(str(meta.get(k) or "") for k in ("manufacturername", "model", "operator")).upper()
    cs = callsign.upper()

    # Aircraft type codes / description, with callsign patterns as fallback.
    if any(x in desc for x in ("HELICOPTER", "ROTORCRAFT")) or typ.startswith(("H", "R")):
        return "helicopter", "Helicopter"
    if any(x in desc for x in ("MILITARY", "AIR FORCE", "NAVY", "ARMY")) or re.match(r"^(RCH|REACH|JAKE|DUKE|EVAC|SAM|AF1)", cs):
        return "military", "Military"
    if any(x in desc for x in ("CARGO", "FREIGHT")) or re.match(r"^(FDX|UPS|ABX|GTI|ATN|CLX|CKS|WGN)", cs):
        return "cargo", "Cargo"
    if any(x in desc for x in ("BOEING 7", "AIRBUS A", "AIRLINER")) or typ.startswith(("A3", "A2", "B7", "B3", "B4", "B5", "B6", "B7", "B8")):
        if typ.startswith(("A3", "A2", "B7", "B3", "B4", "B5", "B6", "B8")):
            return "airliner", "Commercial airliner"
    if re.match(r"^(UAL|AAL|DAL|SWA|JBU|FFT|NKS|ASA|SKW|RPA|ENY|GJS|PDT|JIA|EDV|FDY|CJT|ASH)", cs):
        return "regional" if re.match(r"^(SKW|RPA|ENY|GJS|PDT|JIA|EDV|ASH)", cs) else "airliner", "Commercial airline"
    if any(x in desc for x in ("CESSNA", "PIPER", "CIRRUS", "BEECH", "MOONEY", "GULFSTREAM", "LEARJET", "EMBRAER")):
        return "private", "Private/general aviation"
    if typ and typ.startswith(("C", "P", "BE", "L", "SR", "GLF", "CL")):
        return "private", "Private/general aviation"
    if callsign and re.match(r"^N[0-9A-Z]{2,5}$", cs):
        return "private", "Private/general aviation"
    # OpenSky category values 1..8: no info, no ADS-B emitter category, etc.
    cat = state[17] if len(state) > 17 else None
    if cat == 8:
        return "helicopter", "Helicopter"
    if cat in (2, 3, 4):
        return "airliner", "Commercial airliner"
    return "unknown", "Aircraft (type not identified)"

def safe(value) -> str:
    return str(value or "").replace('"', "'").replace("\\", "/").replace("\n", " ").strip()

def make_placefile(states: list, db: dict[str, dict[str, str]], fetched_at: datetime) -> str:
    lines = [
        "Title: US FLIGHT TRACKER",
        "Refresh: 10",
        "Color: 255 255 255",
        "Font: 1, 10, 1, 'Arial'",
        "IconFile: 1, 20, 20, 10, 10, 0, 0, '1.png'",
        f"; Updated: {fetched_at.strftime('%Y-%m-%d %H:%M:%S UTC')}",
        f"; Aircraft in source snapshot: {len(states)}",
        "; Source: OpenSky Network public ADS-B state vectors",
        "; Colors: airliner red, private blue, helicopter yellow, military purple, cargo green",
        "",
    ]
    now = fetched_at.timestamp()
    count = 0
    for s in states:
        try:
            if len(s) < 11 or s[5] is None or s[6] is None:
                continue
            lon, lat = float(s[5]), float(s[6])
            if not (BBOX["lamin"] <= lat <= BBOX["lamax"] and BBOX["lomin"] <= lon <= BBOX["lomax"]):
                continue
            if bool(s[8]):
                continue
            last_contact = float(s[4] or s[3] or now)
            if now - last_contact > 180:
                continue
            category, label = classify(s, db)
            heading = float(s[10] or 0.0) % 360
            altitude = s[13] if s[13] is not None else s[7]
            if altitude is None:
                alt_text = "Unknown"
            elif isinstance(altitude, (int, float)) and altitude < 0:
                alt_text = "Ground"
            else:
                alt_text = f"{int(float(altitude)):,} ft"
            speed = "Unknown" if s[9] is None else f"{int(float(s[9]) * 1.94384)} kt"
            callsign = safe(s[1]) or "No callsign"
            hex_id = safe(s[0]).upper()
            country = safe(s[2])
            squawk = safe(s[14]) if len(s) > 14 else ""
            meta = db.get(hex_id.lower(), {})
            reg = safe(meta.get("registration"))
            model = safe(meta.get("model"))
            operator = safe(meta.get("operator"))
            color = SYMBOLS[category][1]
            # Label icon is text, ensuring no dependency on local bitmap assets.
            lines.extend([
                f"Color: {color}",
                f"Text: {lat:.5f}, {lon:.5f}, 1, 0, 10, '{category.upper()} {callsign}'",
                f"; {label} | {callsign} | {reg} | {model} | {operator}",
                f"; ICAO24: {hex_id} | Country: {country} | Altitude: {alt_text} | Speed: {speed} | Heading: {heading:.0f} deg | Squawk: {squawk}",
                f"Object: {lat:.5f}, {lon:.5f}, {heading:.0f}, 1, 0, 0, '{category.upper()} {callsign}'",
                "",
            ])
            count += 1
        except (ValueError, TypeError, IndexError):
            continue
    lines.insert(6, f"; Rendered aircraft: {count}")
    return "\n".join(lines) + "\n"

def fetch_states() -> list:
    query = urllib.parse.urlencode({
        "lamin": BBOX["lamin"], "lamax": BBOX["lamax"],
        "lomin": BBOX["lomin"], "lomax": BBOX["lomax"],
    })
    payload = json.loads(request(f"{API_URL}?{query}").decode("utf-8"))
    return payload.get("states") or []

def main() -> None:
    db = load_aircraft_db()
    print(f"Starting US flight tracker; refresh target: {POLL_SECONDS}s", file=sys.stderr)
    while True:
        started = time.monotonic()
        try:
            states = fetch_states()
            timestamp = datetime.now(timezone.utc)
            content = make_placefile(states, db, timestamp)
            tmp = OUTPUT.with_suffix(OUTPUT.suffix + ".tmp")
            tmp.write_text(content, encoding="utf-8")
            tmp.replace(OUTPUT)
            print(f"{timestamp.isoformat()} | {len(states)} raw | placefile written", file=sys.stderr)
        except urllib.error.HTTPError as exc:
            retry = int(exc.headers.get("X-Rate-Limit-Retry-After-Seconds", "60")) if exc.headers else 60
            print(f"OpenSky HTTP {exc.code}; backing off {max(retry, 30)}s", file=sys.stderr)
            time.sleep(max(retry, 30))
        except Exception as exc:
            print(f"Update failed: {exc}", file=sys.stderr)
        elapsed = time.monotonic() - started
        time.sleep(max(1, POLL_SECONDS - elapsed))

if __name__ == "__main__":
    main()
