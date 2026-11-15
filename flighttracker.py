#!/usr/bin/env python3
"""Quota-aware FlyItalyADSB collector for AquaCeroWx / GRLevelX."""
import json, os, time, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path

API = "https://api.flyitalyadsb.com/v2/lat"
KEY = os.getenv("FLYITALYADSB_API_KEY", "").strip()
OUT = Path(os.getenv("PLACEFILE_OUTPUT", "flighttracker.txt"))
CACHE = Path(os.getenv("AIRCRAFT_CACHE", "aircraft_cache.json"))
ICON_URL = "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/aircraft.png?v=2"
REQUEST_GAP = 1.25
BATCH_SIZE = 28
BATCH_PAUSE = 61  # stay below the free plan's rolling 30-requests/minute limit
CACHE_TTL = 360

# Full U.S. coverage grid: 48 overlapping circles for the contiguous states,
# plus Alaska, Hawaii and Puerto Rico. Each request uses a 500-km radius.
REGIONS = [(lat, lon, 500) for lat in (25, 30, 35, 40, 45, 50)
           for lon in (-124, -116, -108, -100, -92, -84, -76, -68)]
REGIONS += [
    (54, -164, 500), (58, -156, 500), (62, -148, 500), (66, -140, 500),
    (60, -136, 500), (56, -150, 500), (64, -160, 500), (68, -152, 500),
    (19.5, -155.5, 500), (21, -158.5, 500), (18.2, -66.5, 500),
]

AIRLINES = {
 "AAL":"American Airlines","UAL":"United Airlines","DAL":"Delta Air Lines",
 "SWA":"Southwest Airlines","JBU":"JetBlue","ASA":"Alaska Airlines",
 "FFT":"Frontier Airlines","NKS":"Spirit Airlines","SKW":"SkyWest Airlines",
 "RPA":"Republic Airways","ENY":"Envoy Air","PDT":"Piedmont Airlines",
 "AAY":"Allegiant Air","FDX":"FedEx","UPS":"UPS Airlines","GTI":"Atlas Air",
 "ABX":"ABX Air","KAL":"Korean Air","BAW":"British Airways","AFR":"Air France",
 "DLH":"Lufthansa","ACA":"Air Canada","WJA":"WestJet","AMX":"Aeromexico",
 "JAL":"Japan Airlines","ANA":"All Nippon Airways","QTR":"Qatar Airways",
 "UAE":"Emirates","EVA":"EVA Air","THY":"Turkish Airlines","SIA":"Singapore Airlines",
 "IBE":"Iberia","AUA":"Austrian Airlines","KLM":"KLM","VIR":"Virgin Atlantic",
 "FLE":"Flair Airlines","ROU":"Air Canada Rouge","POE":"Porter Airlines",
}
MILITARY_BRANCHES = [
 (("UNITED STATES AIR FORCE","USAF","AIR FORCE"),"U.S. AIR FORCE"),
 (("UNITED STATES NAVY","US NAVY","NAVY"),"U.S. NAVY"),
 (("UNITED STATES ARMY","US ARMY","ARMY"),"U.S. ARMY"),
 (("UNITED STATES MARINE","USMC","MARINE"),"U.S. MARINE CORPS"),
 (("UNITED STATES COAST GUARD","USCG","COAST GUARD"),"U.S. COAST GUARD"),
 (("UNITED STATES SPACE FORCE","USSF","SPACE FORCE"),"U.S. SPACE FORCE"),
]

def clean(v):
    return str(v or "").replace('"', "'").replace("\\", "/").replace("\n", " ").strip()

def fetch(lat, lon, radius):
    req = urllib.request.Request(f"{API}/{lat}/lon/{lon}/dist/{radius}",
        headers={"X-Api-Key": KEY, "User-Agent":"USFlightTrackerPlacefile/4.0",
                 "Accept":"application/json"})
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.loads(response.read().decode("utf-8")), dict(response.headers)

def load_cache():
    try:
        obj = json.loads(CACHE.read_text(encoding="utf-8"))
        return obj if isinstance(obj, dict) else {"next_region":0,"aircraft":{}}
    except (OSError, ValueError):
        return {"next_region":0,"aircraft":{}}

def save_json(path, obj):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, separators=(",",":")), encoding="utf-8")
    tmp.replace(path)

def airline(a):
    op = clean(a.get("ownOp") or a.get("operator"))
    flight = clean(a.get("flight")).upper()
    prefix = "".join(ch for ch in flight if ch.isalpha())[:3]
    return AIRLINES.get(prefix) or (op if op.upper() not in ("", "UNKNOWN", "N/A") else "")

def branch(a):
    fields = " ".join(clean(a.get(k)) for k in ("ownOp","operator","desc","flight","r")).upper()
    for terms, name in MILITARY_BRANCHES:
        if any(term in fields for term in terms): return name
    return "MILITARY (BRANCH UNKNOWN)"

def classify(a):
    t, desc = clean(a.get("t")).upper(), clean(a.get("desc")).upper()
    try:
        db_flags = int(str(a.get("dbFlags") or "0"), 0)
    except (TypeError, ValueError):
        db_flags = 0
    if a.get("mil") or a.get("military") or db_flags & 1:
        return 5, "MILITARY", branch(a)
    if "HELI" in desc or t.startswith(("R","H")): return 3, "HELICOPTER", ""
    if any(x in desc for x in ("CARGO","FREIGHT")): return 4, "CARGO", airline(a)
    op = airline(a)
    if op and (t.startswith(("A","B","E")) or len(clean(a.get("flight")).strip()) >= 3):
        return 1, "COMMERCIAL", op
    if t.startswith(("A3","A2","B7","B3","B4","B5","B6","B8")):
        return 1, "COMMERCIAL", op
    return 2, "PRIVATE / GENERAL AVIATION", ""

def alt_text(a):
    alt = a.get("alt_baro", a.get("alt_geom"))
    if alt == "ground": return "GROUND"
    try: return f"{int(float(alt)):,} FT"
    except (TypeError, ValueError): return "ALT N/A"

def render(aircraft, stamp, usage):
    lines = ["; Flight data: FlyItalyADSB (flyitalyadsb.com), CC BY-SA 4.0",
      "Title: US FLIGHT TRACKER - FLYITALYADSB", "Refresh: 1",
      "Color: 235 235 235", 'Font: 1, 10, 1, "Arial"',
      f'IconFile: 1, 32, 32, 16, 16, "{ICON_URL}"',
      "; Updated: " + stamp.strftime("%Y-%m-%d %H:%M:%S UTC"),
      f"; Active aircraft cached across full U.S. coverage grid: {len(aircraft)}",
      f"; API quota used this month: {usage.get('used','unknown')} / {usage.get('limit','unknown')}"]
    for hx, item in aircraft.items():
      a = item.get("data", {})
      try:
        lat, lon = float(a["lat"]), float(a["lon"])
        icon, kind, org = classify(a)
        if kind == "HELICOPTER":
        ident = clean(a.get("flight")).strip() or clean(a.get("r")) or hx
        try: speed = f"{float(a.get('gs')):.0f} KT"
        except (TypeError, ValueError): speed = "SPEED N/A"
        altitude = alt_text(a)
        try: heading = float(a.get("track") or a.get("true_heading") or 0) % 360
        except (TypeError, ValueError): heading = 0
        orgline = f"\\n{org}" if org else ""
        hover = (f"{kind}\\nID: {ident}{orgline}\\nSpeed: {speed}\\nAltitude: {altitude}"
                 f"\\nRegistration: {clean(a.get('r')) or 'Unknown'}"
                 f"\\nAircraft type: {clean(a.get('t')) or 'Unknown'}\\nICAO24: {hx}")
        lines += [f"Object: {lat:.5f},{lon:.5f}", "Threshold: 999",
          f'Icon: 0,0,{heading:.0f},1,{icon},"{hover}"',
          f'Text: 0,22,1,"{ident}"', f'Text: 0,34,1,"{speed} | {altitude}"']
        if org: lines.append(f'Text: 0,46,1,"{clean(org)}"')
        lines.append("End:")
      except (KeyError, TypeError, ValueError): continue
    return "\n".join(lines) + "\n"

def main():
    import sys
    if not KEY:
        raise SystemExit("Missing FLYITALYADSB_API_KEY environment variable.")
    cache = load_cache()
    aircraft = cache.get("aircraft", {})
    now = time.time()
    usage = {}
    success = 0
    for idx, (lat, lon, radius) in enumerate(REGIONS):
        if idx and idx % BATCH_SIZE == 0:
            print(f"Rate-limit pause after {idx} regions")
            time.sleep(BATCH_PAUSE)
        try:
            data, headers = fetch(lat, lon, radius)
            usage = {"used":headers.get("X-FIA-Used-Month","unknown"),
                     "limit":headers.get("X-FIA-Quota-Month","unknown")}
            for a in data.get("ac", []):
                hx = clean(a.get("hex")).lower()
                if hx and a.get("lat") is not None and a.get("lon") is not None:
                    seen = a.get("seen_pos", 0)
                    try: observed = now - float(seen or 0)
                    except (TypeError, ValueError): observed = now
                    aircraft[hx] = {"data":a, "observed":observed}
            success += 1
        except urllib.error.HTTPError as exc:
            print("FlyItalyADSB HTTP", exc.code, "region", idx, exc)
            if exc.code == 429:
                print("Rate/quota limit; honoring Retry-After.")
                retry = exc.headers.get("Retry-After") if exc.headers else None
                if retry: time.sleep(min(60, max(1, int(retry))))
        except Exception as exc:
            print("Region failed:", idx, exc)
        if idx < len(REGIONS) - 1 and (idx + 1) % BATCH_SIZE != 0:
            time.sleep(REQUEST_GAP)
    cutoff = time.time() - CACHE_TTL
    aircraft = {hx:v for hx,v in aircraft.items()
                if float(v.get("observed",0)) >= cutoff}
    cache["aircraft"] = aircraft
    cache["regions_total"] = len(REGIONS)
    cache["updated"] = datetime.now(timezone.utc).isoformat()
    save_json(CACHE, cache)
    OUT.write_text(render(aircraft, datetime.now(timezone.utc), usage), encoding="utf-8")
    print(f"FlyItalyADSB: {success}/{len(REGIONS)} regions; {len(aircraft)} aircraft retained")
    if success == 0: raise SystemExit("No regions updated; placefile retained from current cache.")

if __name__ == "__main__": main()
