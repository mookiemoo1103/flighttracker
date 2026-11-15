const API = "https://api.flyitalyadsb.com/v2/lat";
const ICON_URL = "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/aircraft.png?v=2";
const REGIONS = [
  [25, -124, 500],\n  [25, -116, 500],\n  [25, -108, 500],\n  [25, -100, 500],\n  [25, -92, 500],\n  [25, -84, 500],\n  [25, -76, 500],\n  [25, -68, 500],\n  [30, -124, 500],\n  [30, -116, 500],\n  [30, -108, 500],\n  [30, -100, 500],\n  [30, -92, 500],\n  [30, -84, 500],\n  [30, -76, 500],\n  [30, -68, 500],\n  [35, -124, 500],\n  [35, -116, 500],\n  [35, -108, 500],\n  [35, -100, 500],\n  [35, -92, 500],\n  [35, -84, 500],\n  [35, -76, 500],\n  [35, -68, 500],\n  [40, -124, 500],\n  [40, -116, 500],\n  [40, -108, 500],\n  [40, -100, 500],\n  [40, -92, 500],\n  [40, -84, 500],\n  [40, -76, 500],\n  [40, -68, 500],\n  [45, -124, 500],\n  [45, -116, 500],\n  [45, -108, 500],\n  [45, -100, 500],\n  [45, -92, 500],\n  [45, -84, 500],\n  [45, -76, 500],\n  [45, -68, 500],\n  [50, -124, 500],\n  [50, -116, 500],\n  [50, -108, 500],\n  [50, -100, 500],\n  [50, -92, 500],\n  [50, -84, 500],\n  [50, -76, 500],\n  [50, -68, 500],\n  [54, -164, 500],\n  [58, -156, 500],\n  [62, -148, 500],\n  [66, -140, 500],\n  [60, -136, 500],\n  [56, -150, 500],\n  [64, -160, 500],\n  [68, -152, 500],\n  [19.5, -155.5, 500],\n  [21, -158.5, 500],\n  [18.2, -66.5, 500]
];
const AIRLINES = {
 AAL:"American Airlines",UAL:"United Airlines",DAL:"Delta Air Lines",SWA:"Southwest Airlines",JBU:"JetBlue",
 ASA:"Alaska Airlines",FFT:"Frontier Airlines",NKS:"Spirit Airlines",SKW:"SkyWest Airlines",RPA:"Republic Airways",
 ENY:"Envoy Air",PDT:"Piedmont Airlines",AAY:"Allegiant Air",FDX:"FedEx",UPS:"UPS Airlines",GTI:"Atlas Air",
 ABX:"ABX Air",KAL:"Korean Air",BAW:"British Airways",AFR:"Air France",DLH:"Lufthansa",ACA:"Air Canada",
 WJA:"WestJet",AMX:"Aeromexico",JAL:"Japan Airlines",ANA:"All Nippon Airways",QTR:"Qatar Airways",
 UAE:"Emirates",EVA:"EVA Air",THY:"Turkish Airlines",SIA:"Singapore Airlines",IBE:"Iberia",AUA:"Austrian Airlines",
 KLM:"KLM",VIR:"Virgin Atlantic",FLE:"Flair Airlines",ROU:"Air Canada Rouge",POE:"Porter Airlines"
};
const MILITARY_BRANCHES = [
 [["UNITED STATES AIR FORCE","USAF","AIR FORCE"],"U.S. AIR FORCE"],
 [["UNITED STATES NAVY","US NAVY","NAVY"],"U.S. NAVY"],
 [["UNITED STATES ARMY","US ARMY","ARMY"],"U.S. ARMY"],
 [["UNITED STATES MARINE","USMC","MARINE"],"U.S. MARINE CORPS"],
 [["UNITED STATES COAST GUARD","USCG","COAST GUARD"],"U.S. COAST GUARD"],
 [["UNITED STATES SPACE FORCE","USSF","SPACE FORCE"],"U.S. SPACE FORCE"]
];
const BATCH = 6;
const CACHE_TTL = 6 * 60 * 1000;
const SNAPSHOT_TTL = 15 * 60 * 1000;
const clean = v => String(v ?? "").replaceAll('"',"'").replaceAll("\\","/").replace(/[\r\n]/g," ").trim();
function airline(a) {
 const op=clean(a.ownOp||a.operator), flight=clean(a.flight).toUpperCase(), prefix=(flight.match(/[A-Z]/g)||[]).join("").slice(0,3);
 return AIRLINES[prefix] || (!["","UNKNOWN","N/A"].includes(op.toUpperCase())?op:"");
}
function branch(a) {
 const fields=["ownOp","operator","desc","flight","r"].map(k=>clean(a[k])).join(" ").toUpperCase();
 for (const [terms,name] of MILITARY_BRANCHES) if(terms.some(t=>fields.includes(t))) return name;
 return "MILITARY (BRANCH UNKNOWN)";
}
function classify(a) {
 const t=clean(a.t).toUpperCase(), desc=clean(a.desc).toUpperCase();
 let flags=0; try { flags=Number.parseInt(String(a.dbFlags||"0"),0)||0; } catch {}
 if(a.mil||a.military||(flags&1)) return [5,"MILITARY",branch(a)];
 if(desc.includes("HELI")||t.startsWith("R")||t.startsWith("H")) return [3,"HELICOPTER",""];
 if(desc.includes("CARGO")||desc.includes("FREIGHT")) return [4,"CARGO",airline(a)];
 const op=airline(a), flight=clean(a.flight);
 if(op&&(t.startsWith("A")||t.startsWith("B")||t.startsWith("E")||flight.length>=3)) return [1,"COMMERCIAL",op];
 if(["A3","A2","B7","B3","B4","B5","B6","B8"].some(x=>t.startsWith(x))) return [1,"COMMERCIAL",op];
 return [2,"PRIVATE / GENERAL AVIATION",""];
}
function altText(a) {
 const alt=a.alt_baro ?? a.alt_geom;
 if(alt==="ground") return "GROUND";
 const n=Number(alt);
 return alt!==null&&alt!==undefined&&Number.isFinite(n)?Math.trunc(n).toLocaleString("en-US")+" FT":"ALT N/A";
}
function render(rows, usage) {
 const now=Date.now(), aircraft=new Map();
 for(const row of rows) {
  if(now-Number(row.updated_at)>SNAPSHOT_TTL) continue;
  let list; try { list=JSON.parse(row.payload); } catch { continue; }
  for(const a of list) {
   const hx=clean(a.hex).toLowerCase();
   if(!hx||a.lat==null||a.lon==null) continue;
   const seen=Number(a.seen_pos||0), observed=now-(Number.isFinite(seen)?seen*1000:0);
   if(now-observed>CACHE_TTL) continue;
   const old=aircraft.get(hx);
   if(!old||observed>old.observed) aircraft.set(hx,{a,observed});
  }
 }
 const stamp=new Date(now).toISOString().replace("T"," ").replace(/\.\d{3}Z$/," UTC");
 const lines=["; Flight data: FlyItalyADSB (flyitalyadsb.com), CC BY-SA 4.0",
 "Title: US FLIGHT TRACKER - FLYITALYADSB","Refresh: 1","Color: 235 235 235",'Font: 1, 10, 1, "Arial"',
 `IconFile: 1, 32, 32, 16, 16, "${ICON_URL}"`,`; Updated: ${stamp}`,
 `; Active aircraft cached across full U.S. coverage grid: ${aircraft.size}`,
 `; API quota used this month: ${usage.used||"unknown"} / ${usage.limit||"unknown"}`];
 for(const [hx,item] of aircraft) {
  const a=item.a, lat=Number(a.lat),lon=Number(a.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)) continue;
  const [icon,kind,org]=classify(a), ident=clean(a.flight)||clean(a.r)||hx;
  const gs=Number(a.gs), speed=a.gs!=null&&Number.isFinite(gs)?Math.round(gs)+" KT":"SPEED N/A";
  const alt=altText(a), heading=Number(a.track??a.true_heading??0);
  const hdg=Number.isFinite(heading)?((heading%360)+360)%360:0;
  const orgline=org?"\\n"+org:"";
  const hover=[kind,`ID: ${ident}`,...(org?[org]:[]),`Speed: ${speed}`,`Altitude: ${alt}`,`Registration: ${clean(a.r)||"Unknown"}`,`Aircraft type: ${clean(a.t)||"Unknown"}`,`ICAO24: ${hx}`].map(clean).join("\\n");
  lines.push(`Object: ${lat.toFixed(5)},${lon.toFixed(5)}`,"Threshold: 999",
   `Icon: 0,0,${Math.round(hdg)},1,${icon},"${hover}"`,
   `Text: 0,22,1,"${ident}"`,`Text: 0,34,1,"${speed} | ${alt}"`);
  if(org) lines.push(`Text: 0,46,1,"${clean(org)}"`);
  lines.push("End:");
 }
 return lines.join("\n")+"\n";
}
async function collect(env) {
 if(!env.FLYITALYADSB_API_KEY) throw new Error("Missing FLYITALYADSB_API_KEY Worker secret");
 const state=await env.DB.prepare("SELECT value FROM tracker_state WHERE key='next_region'").first();
 const start=Number(state?.value||0)%REGIONS.length, stmts=[];
 let used="unknown",limit="unknown",success=0;
 for(let i=0;i<BATCH;i++) {
  const idx=(start+i)%REGIONS.length,[lat,lon,radius]=REGIONS[idx];
  const url=`${API}/${lat}/lon/${lon}/dist/${radius}`;
  const res=await fetch(url,{headers:{"X-Api-Key":env.FLYITALYADSB_API_KEY,"Accept":"application/json","User-Agent":"USFlightTrackerPlacefile/4.0"}});
  if(!res.ok) throw new Error(`FlyItalyADSB HTTP ${res.status} for region ${idx}`);
  used=res.headers.get("X-FIA-Used-Month")||used;
  limit=res.headers.get("X-FIA-Quota-Month")||limit;
  const data=await res.json();
  stmts.push(env.DB.prepare("INSERT INTO region_data(region_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(region_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at")
   .bind(idx,JSON.stringify(data.ac||[]),Date.now()));
  success++;
 }
 const next=(start+success)%REGIONS.length, now=Date.now();
 stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('next_region',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(next)));
 stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('quota_used',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(used));
 stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('quota_limit',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(limit));
 stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('last_success',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(now)));
 await env.DB.batch(stmts);
}
export default {
 async scheduled(controller,env,ctx) { ctx.waitUntil(collect(env)); },
 async fetch(request,env) {
  const url=new URL(request.url);
  if(url.pathname==="/health") {
   const state=await env.DB.prepare("SELECT key,value FROM tracker_state WHERE key IN ('next_region','last_success','quota_used','quota_limit')").all();
   return Response.json({ok:true,total_regions:REGIONS.length,regions_per_minute:BATCH,approximate_full_sweep_minutes:Math.ceil(REGIONS.length/BATCH),state:state.results||[]});
  }
  if(url.pathname!=="/flighttracker.txt"&&url.pathname!=="/") return new Response("Not found",{status:404});
  const [{results:rows=[]},{results:states=[]}]=await Promise.all([
   env.DB.prepare("SELECT region_id,payload,updated_at FROM region_data").all(),
   env.DB.prepare("SELECT key,value FROM tracker_state WHERE key IN ('quota_used','quota_limit')").all()
  ]);
  const usage=Object.fromEntries(states.map(x=>[x.key==="quota_used"?"used":"limit",x.value]));
  return new Response(render(rows,usage),{headers:{"content-type":"text/plain; charset=utf-8","cache-control":"public, max-age=1"}});
 }
};
