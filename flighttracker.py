#!/usr/bin/env python3
"""AquaCeroWx / GRLevelX aircraft placefile collector using adsb.fi public ADS-B."""
import json, os, time, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path

API = "https://opendata.adsb.fi/api/v3/lat"
OUT = Path(os.getenv("PLACEFILE_OUTPUT", "flighttracker.txt"))
ICON_URL = "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/aircraft.png"
POLL = max(20, int(os.getenv("POLL_SECONDS", "30")))
REQUEST_GAP = 1.05  # adsb.fi public API: max 1 request/second

# Overlapping 250-NM circles, roughly covering the contiguous United States.
# A complete pass takes about 22 seconds at the published anonymous rate limit.
REGIONS = [(lat, lon, 250) for lat in (30, 38, 46)
           for lon in (-124, -114, -104, -94, -84, -74, -66)]

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
 (("UNITED STATES AIR FORCE","USAF","AIR FORCE","AIR FORCE RESERVE"),"U.S. AIR FORCE"),
 (("UNITED STATES NAVY","US NAVY","NAVY"),"U.S. NAVY"),
 (("UNITED STATES ARMY","US ARMY","ARMY"),"U.S. ARMY"),
 (("UNITED STATES MARINE","USMC","MARINE"),"U.S. MARINE CORPS"),
 (("UNITED STATES COAST GUARD","USCG","COAST GUARD"),"U.S. COAST GUARD"),
 (("UNITED STATES SPACE FORCE","USSF","SPACE FORCE"),"U.S. SPACE FORCE"),
]

def fetch(lat, lon, radius):
    url = f"{API}/{lat}/{lon}/dist/{radius}"
    req = urllib.request.Request(url, headers={
        "User-Agent":"USFlightTrackerPlacefile/3.0 (personal use; adsb.fi attribution)",
        "Accept":"application/json"})
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.loads(response.read().decode("utf-8"))

def clean(value):
    return str(value or "").replace('"', "'").replace("\\", "/").replace("\n", " ").strip()

def company_for(a):
    operator = clean(a.get("ownOp") or a.get("operator") or a.get("desc"))
    flight = clean(a.get("flight")).strip().upper()
    prefix = "".join(ch for ch in flight if ch.isalpha())[:3]
    if prefix in AIRLINES:
        return AIRLINES[prefix]
    return operator if operator and operator.upper() not in ("UNKNOWN", "N/A") else ""

def military_branch(a):
    fields = " ".join(clean(a.get(k)) for k in ("ownOp","operator","desc","flight","r"))
    upper = fields.upper()
    for needles, branch in MILITARY_BRANCHES:
        if any(n in upper for n in needles):
            return branch
    return "MILITARY (BRANCH UNKNOWN)"

def classify(a):
    t = clean(a.get("t")).upper()
    desc = clean(a.get("desc")).upper()
    cs = clean(a.get("flight")).strip().upper()
    if a.get("mil") or a.get("military"):
        return 5, "MILITARY", military_branch(a)
    if "HELI" in desc or t.startswith(("R","H")):
        return 3, "HELICOPTER", ""
    if any(x in desc for x in ("CARGO","FREIGHT")):
        return 4, "CARGO", company_for(a)
    company = company_for(a)
    if company and (t.startswith(("A","B","E","CRJ","ERJ")) or len(cs) >= 3):
        return 1, "COMMERCIAL", company
    if t.startswith(("A3","A2","B7","B3","B4","B5","B6","B8")):
        return 1, "COMMERCIAL", company
    return 2, "PRIVATE / GENERAL AVIATION", ""

def altitude_text(a):
    alt = a.get("alt_baro", a.get("alt_geom"))
    if alt == "ground" or a.get("alt_baro") == "ground":
        return "GROUND"
    try: return f"{int(float(alt)):,} FT"
    except (TypeError, ValueError): return "ALT N/A"

def render(aircraft, stamp):
    lines = [
      "; Data: adsb.fi community ADS-B network - https://adsb.fi/",
      "Title: US FLIGHT TRACKER - ADSB.FI",
      "Refresh: 10",
      "Color: 235 235 235",
      'Font: 1, 10, 1, "Arial"',
      f'IconFile: 1, 32, 32, 16, 16, "{ICON_URL}"',
      "; Updated: " + stamp.strftime("%Y-%m-%d %H:%M:%S UTC"),
      "; Icons retain category colors; aircraft nose rotates to ground track.",
    ]
    for a in aircraft.values():
      try:
        lat, lon = float(a["lat"]), float(a["lon"])
        icon, kind, organization = classify(a)
        ident = clean(a.get("flight")).strip() or clean(a.get("r")) or clean(a.get("hex")) or "UNKNOWN"
        speed = a.get("gs")
        try: speed_text = f"{float(speed):.0f} KT"
        except (TypeError, ValueError): speed_text = "SPEED N/A"
        alt_text = altitude_text(a)
        try: heading = float(a.get("track") if a.get("track") is not None else a.get("true_heading") or 0) % 360
        except (TypeError, ValueError): heading = 0
        extra = f"\\n{organization}" if organization else ""
        hover = (f"{kind}\\nID: {ident}{extra}\\nSpeed: {speed_text}"
                 f"\\nAltitude: {alt_text}\\nRegistration: {clean(a.get('r')) or 'Unknown'}"
                 f"\\nAircraft type: {clean(a.get('t')) or 'Unknown'}"
                 f"\\nICAO24: {clean(a.get('hex'))}")
        # Separate text rows are deliberately below the aircraft symbol.
        lines += [f"Object: {lat:.5f},{lon:.5f}", "Threshold: 999",
                  f'Icon: 0,0,{heading:.0f},1,{icon},"{hover}"',
                  f'Text: 0,22,1,"{ident}"',
                  f'Text: 0,34,1,"{speed_text} | {alt_text}"']
        if organization:
            lines.append(f'Text: 0,46,1,"{clean(organization)}"')
        lines.append("End:")
      except (KeyError, TypeError, ValueError):
        continue
    return "\n".join(lines) + "\n"

def main():
    import sys
    once = "--once" in sys.argv
    while True:
        started = time.monotonic()
        aircraft = {}
        errors = 0
        for index, (lat, lon, radius) in enumerate(REGIONS):
            try:
                data = fetch(lat, lon, radius)
                for a in data.get("ac", []):
                    hx = (a.get("hex") or "").lower()
                    if hx and a.get("lat") is not None and a.get("lon") is not None:
                        aircraft[hx] = a
            except urllib.error.HTTPError as exc:
                errors += 1
                retry = exc.headers.get("Retry-After") if exc.headers else None
                print("adsb.fi HTTP", exc.code, "region", index, exc)
                if exc.code == 429 and retry:
                    time.sleep(max(1, int(retry)))
            except Exception as exc:
                errors += 1
                print("Region failed:", index, exc)
            if index < len(REGIONS)-1:
                time.sleep(REQUEST_GAP)
        if aircraft:
            temp = OUT.with_suffix(OUT.suffix + ".tmp")
            temp.write_text(render(aircraft, datetime.now(timezone.utc)), encoding="utf-8")
            temp.replace(OUT)
        print(f"adsb.fi: {len(aircraft)} aircraft, {errors} region errors")
        if once: break
        time.sleep(max(1, POLL - (time.monotonic() - started)))

if __name__ == "__main__":
    main()
