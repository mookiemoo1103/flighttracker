#!/usr/bin/env python3
"""AquaCeroWx / GRLevelX placefile collector using ADSB.lol community data.

The free public API supports point-radius queries. Four 250-NM regional circles
are sampled and de-duplicated; this is regional coverage with gaps, NOT a
complete nationwide feed. A feeder key is needed for ADSB.lol's feeder-only
whole-world snapshot endpoint.
"""
import json, os, time, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path

API="https://api.adsb.lol/v2/point"
OUT=Path(os.getenv("PLACEFILE_OUTPUT","flighttracker.txt"))
ICON_URL="https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/aircraft.png"
API_KEY=os.getenv("ADSBLOL_API_KEY")
REGIONS=[
 ("NORTHEAST",40.5,-75.0,250),
 ("SOUTHEAST",31.0,-85.0,250),
 ("CENTRAL",39.0,-98.0,250),
 ("WEST",39.0,-120.0,250),
]
# Four queries per cycle; public no-key quota is 500/day/IP.
# 15-minute cycles use 384 requests/day. Set a longer interval if rate-limited.
POLL=max(900,int(os.getenv("POLL_SECONDS","900")))

def fetch(lat,lon,radius):
    headers={"User-Agent":"USFlightTrackerPlacefile/2.0","Accept":"application/json"}
    if API_KEY: headers["x-api-key"]=API_KEY
    req=urllib.request.Request(f"{API}/{lat}/{lon}/{radius}",headers=headers)
    with urllib.request.urlopen(req,timeout=35) as r:
        return json.loads(r.read().decode("utf-8"))

def classify(a):
    t=(a.get("t") or "").upper()
    desc=(a.get("desc") or "").upper()
    cs=(a.get("flight") or "").strip().upper()
    if "HELI" in desc or t.startswith(("R","H")): return 3,"HELICOPTER"
    if a.get("mil") or a.get("military") or cs.startswith(("RCH","REACH","DUKE","JAKE")): return 5,"MILITARY"
    if any(x in desc for x in ("CARGO","FREIGHT")): return 4,"CARGO"
    if t.startswith(("A3","A2","B7","B3","B4","B5","B6","B8")): return 1,"COMMERCIAL AIRLINER"
    if t.startswith(("E","CRJ","ERJ")): return 2,"REGIONAL AIRCRAFT"
    if t or a.get("r"): return 2,"PRIVATE / GENERAL AVIATION"
    return 6,"AIRCRAFT TYPE UNKNOWN"

def clean(v):
    return str(v or "").replace('"',"'").replace("\\","/").replace("\n"," ").strip()

def render(ac,stamp):
    lines=[
      "; ADSB.lol community ADS-B data",
      "Title: US FLIGHT TRACKER - ADSB.LOL",
      "Refresh: 10",
      "Color: 235 235 235",
      'Font: 1, 10, 1, "Arial"',
      f'IconFile: 1, 32, 32, 16, 16, "{ICON_URL}"',
      "; Updated: "+stamp.strftime("%Y-%m-%d %H:%M:%S UTC"),
      "; Coverage: four 250-NM regional sample circles; gaps remain",
      "; Icons: 1 airliner, 2 private/regional, 3 helicopter, 4 cargo, 5 military, 6 unknown",
    ]
    for a in ac.values():
      try:
        lat=float(a["lat"]); lon=float(a["lon"])
        icon,kind=classify(a)
        cs=clean(a.get("flight")) or clean(a.get("hex")) or "UNKNOWN"
        reg=clean(a.get("r")); typ=clean(a.get("t"))
        alt=a.get("alt_baro",a.get("alt_geom","N/A"))
        gs=a.get("gs","N/A"); hdg=float(a.get("track") or 0)
        hover=(f"{kind}\\nCallsign: {cs}\\nRegistration: {reg or 'Unknown'}"
               f"\\nAircraft type: {typ or 'Unknown'}\\nAltitude: {alt}"
               f"\\nGround speed: {gs} kt\\nHeading: {hdg:.0f} deg"
               f"\\nICAO24: {clean(a.get('hex'))}\\nSquawk: {clean(a.get('squawk'))}")
        lines += [f"Object: {lat:.5f},{lon:.5f}","Threshold: 999",
                  f'Icon: 0,0,{hdg:.0f},1,{icon},"{hover}"',
                  f'Text: 20,0,1,"{cs} | {alt}"',"End:"]
      except (KeyError,TypeError,ValueError): continue
    return "\n".join(lines)+"\n"

def main():
    import sys
    once="--once" in sys.argv
    while True:
      start=time.monotonic()
      try:
        aircraft={}
        for name,lat,lon,radius in REGIONS:
          data=fetch(lat,lon,radius)
          for a in data.get("ac",[]):
            hx=(a.get("hex") or "").lower()
            if hx and a.get("lat") is not None and a.get("lon") is not None:
              aircraft[hx]=a
        tmp=OUT.with_suffix(OUT.suffix+".tmp")
        tmp.write_text(render(aircraft,datetime.now(timezone.utc)),encoding="utf-8")
        tmp.replace(OUT)
        print("ADSB.lol updated:",len(aircraft),"aircraft")
      except urllib.error.HTTPError as e:
        retry=e.headers.get("Retry-After") if e.headers else None
        print("ADSB.lol HTTP",e.code,e)
        if retry: time.sleep(max(30,int(retry)))
      except Exception as e: print("Update failed:",e)
      if once: break
      time.sleep(max(1,POLL-(time.monotonic()-start)))

if __name__=="__main__": main()
