#!/usr/bin/env python3
"""Generate a GRLevelX/AquaCeroWx-compatible nationwide aircraft placefile."""
import csv, io, json, os, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://opensky-network.org/api/states/all"
OUT = Path(os.getenv("PLACEFILE_OUTPUT", "flighttracker.txt"))
# Local collector targets 10 seconds. OpenSky quotas may require slower polling:
# anonymous 400/day ~= 14.4 min; standard 4,000/day ~= 86 sec;
# active feeder 8,000/day ~= 43 sec; licensed tier can support 10 sec.
DEFAULT_POLL = "86" if (os.getenv("OPENSKY_CLIENT_ID") and os.getenv("OPENSKY_CLIENT_SECRET")) else "900"
POLL = max(10, int(os.getenv("POLL_SECONDS", DEFAULT_POLL)))
CLIENT_ID = os.getenv("OPENSKY_CLIENT_ID")
CLIENT_SECRET = os.getenv("OPENSKY_CLIENT_SECRET")
TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
_token = None
_token_expiry = 0)
BOUNDS = {"lamin":17, "lamax":72, "lomin":-180, "lomax":-60}
ICON_URL = "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/aircraft.png"
DB_URL = "https://raw.githubusercontent.com/openskynetwork/opensky-aircraft-database/master/aircraftDatabase.csv"
DB_FILE = Path("aircraftDatabase.csv")

def access_token():
    global _token, _token_expiry
    if not (CLIENT_ID and CLIENT_SECRET):
        return None
    if _token and time.time() < _token_expiry:
        return _token
    body=urllib.parse.urlencode({
        "grant_type":"client_credentials",
        "client_id":CLIENT_ID,
        "client_secret":CLIENT_SECRET
    }).encode()
    req=urllib.request.Request(TOKEN_URL,data=body,headers={
        "Content-Type":"application/x-www-form-urlencoded",
        "User-Agent":"USFlightTrackerPlacefile/1.0"
    })
    with urllib.request.urlopen(req,timeout=30) as r:
        payload=json.loads(r.read())
    _token=payload["access_token"]
    _token_expiry=time.time()+max(60,int(payload.get("expires_in",1800))-60)
    return _token

def get(url):
    headers={"User-Agent":"USFlightTrackerPlacefile/1.0"}
    token=access_token()
    if token: headers["Authorization"]="Bearer "+token
    req=urllib.request.Request(url,headers=headers)
    with urllib.request.urlopen(req,timeout=45) as r:
        remaining=r.headers.get("X-Rate-Limit-Remaining")
        if remaining is not None:
            print("OpenSky state credits remaining:",remaining)
        return r.read()

def aircraft_db():
    try:
        if not DB_FILE.exists() or time.time()-DB_FILE.stat().st_mtime>7*86400:
            DB_FILE.write_bytes(get(DB_URL))
        return {r["icao24"].lower():r for r in csv.DictReader(io.StringIO(DB_FILE.read_text(errors="replace"))) if r.get("icao24")}
    except Exception as e:
        print("Aircraft database unavailable:",e); return {}

def classify(s, db):
    # OpenSky extended state-vector category (index 17).
    cat = s[17] if len(s)>17 and isinstance(s[17],int) else 0
    cs = (s[1] or "").strip().upper()
    m = db.get((s[0] or "").lower(), {})
    typ = (m.get("typecode") or "").upper()
    desc = " ".join(str(m.get(k) or "") for k in ("manufacturername","model","operator")).upper()
    if cat == 8 or "HELICOPTER" in desc or typ.startswith(("R","H")): return 3,"HELICOPTER"
    if any(x in desc for x in ("MILITARY","AIR FORCE","NAVY","ARMY")) or cs.startswith(("RCH","REACH","DUKE","JAKE","SAM")): return 5,"MILITARY"
    if any(x in desc for x in ("CARGO","FREIGHT")) or cs.startswith(("FDX","UPS","GTI","ABX","ATN","CKS")): return 4,"CARGO"
    if cs.startswith(("SKW","RPA","ENY","GJS","PDT","JIA","EDV","ASH")): return 2,"REGIONAL AIRLINE"
    if cs.startswith(("UAL","AAL","DAL","SWA","JBU","FFT","NKS","ASA","AAY","VXP")): return 1,"COMMERCIAL AIRLINER"
    if cat in (3,4,5,6) or typ.startswith(("A3","A2","B7","B3","B4","B5","B6","B8")): return 1,"COMMERCIAL AIRCRAFT"
    if cat in (2,7,9,10,11,12,14) or cs.startswith("N"): return 2,"PRIVATE / GENERAL AVIATION"
    return 6,"AIRCRAFT TYPE UNKNOWN"

def q(s):
    return str(s or "").replace("\\","/").replace('"',"'").replace("\n"," ").strip()

def render(states, db, stamp):
    lines = [
      "; US Flight Tracker - OpenSky Network ADS-B",
      "Title: US FLIGHT TRACKER",
      "Refresh: 10",
      "Color: 235 235 235",
      'Font: 1, 10, 1, "Arial"',
      'IconFile: 1, 32, 32, 16, 16, "'+ICON_URL+'"',
      "; Updated: "+stamp.strftime("%Y-%m-%d %H:%M:%S UTC"),
      "; Icon order: 1 airliner, 2 private, 3 helicopter, 4 cargo, 5 military, 6 unknown",
    ]
    count=0
    now=stamp.timestamp()
    for s in states:
      try:
        if len(s)<17 or s[5] is None or s[6] is None or s[8]: continue
        lon,lat=float(s[5]),float(s[6])
        if not (BOUNDS["lamin"]<=lat<=BOUNDS["lamax"] and BOUNDS["lomin"]<=lon<=BOUNDS["lomax"]): continue
        contact=float(s[4] or s[3] or now)
        if now-contact>180: continue
        icon,kind=classify(s,db)
        callsign=q(s[1]) or "NO CALLSIGN"
        hexid=q(s[0]).upper()
        meta=db.get(hexid.lower(),{})
        reg=q(meta.get("registration")); model=q(meta.get("model")); operator=q(meta.get("operator"))
        alt=s[13] if s[13] is not None else s[7]
        altitude="N/A" if alt is None else f"{round(float(alt)*3.28084):,} ft"
        speed="N/A" if s[9] is None else f"{round(float(s[9])*1.94384)} kt"
        heading=round(float(s[10] or 0))%360
        squawk=q(s[14]) if len(s)>14 else ""
        hover=f"{kind}\\nCallsign: {callsign}\\nRegistration: {reg or 'Unknown'}\\nAircraft: {model or 'Unknown'}\\nOperator: {operator or 'Unknown'}\\nAltitude: {altitude}\\nGround speed: {speed}\\nHeading: {heading} deg\\nICAO24: {hexid}\\nSquawk: {squawk}"
        label=f"{callsign} | {altitude}"
        lines += [
          f"Object: {lat:.5f},{lon:.5f}",
          "Threshold: 999",
          f'Icon: 0,0,{heading},1,{icon},"{hover}"',
          f'Text: 20,0,1,"{label}"',
          "End:",
        ]
        count+=1
      except (ValueError,TypeError,IndexError): continue
    lines.insert(7,f"; Aircraft displayed: {count}")
    return "\n".join(lines)+"\n"

def main():
    import sys
    db=aircraft_db()
    once="--once" in sys.argv
    while True:
      started=time.monotonic()
      try:
        params=urllib.parse.urlencode({**BOUNDS,"extended":1})
        data=json.loads(get(API+"?"+params))
        stamp=datetime.now(timezone.utc)
        txt=render(data.get("states") or [],db,stamp)
        tmp=OUT.with_suffix(OUT.suffix+".tmp"); tmp.write_text(txt,encoding="utf-8"); tmp.replace(OUT)
        print(stamp.isoformat(),"updated",OUT)
      except Exception as e:
        print("Update error:",e)
        retry=getattr(getattr(e,"headers",None),"get",lambda *_:None)("X-Rate-Limit-Retry-After-Seconds")
        if retry: time.sleep(max(30,int(retry)))
      if once: break
      time.sleep(max(1,POLL-(time.monotonic()-started)))

if __name__=="__main__": main()
