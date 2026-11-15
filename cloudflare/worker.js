const API = "https://api.flyitalyadsb.com/v2/lat";
const ADSBFI_API = "https://opendata.adsb.fi/api/v3/lat";
const ICON_URL = "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/aircraft-gray.png?v=5"; // Shared grayscale aircraft sprite
const REGIONS = [
  [25, -124, 500],
  [25, -116, 500],
  [25, -108, 500],
  [25, -100, 500],
  [25, -92, 500],
  [25, -84, 500],
  [25, -76, 500],
  [25, -68, 500],
  [30, -124, 500],
  [30, -116, 500],
  [30, -108, 500],
  [30, -100, 500],
  [30, -92, 500],
  [30, -84, 500],
  [30, -76, 500],
  [30, -68, 500],
  [35, -124, 500],
  [35, -116, 500],
  [35, -108, 500],
  [35, -100, 500],
  [35, -92, 500],
  [35, -84, 500],
  [35, -76, 500],
  [35, -68, 500],
  [40, -124, 500],
  [40, -116, 500],
  [40, -108, 500],
  [40, -100, 500],
  [40, -92, 500],
  [40, -84, 500],
  [40, -76, 500],
  [40, -68, 500],
  [45, -124, 500],
  [45, -116, 500],
  [45, -108, 500],
  [45, -100, 500],
  [45, -92, 500],
  [45, -84, 500],
  [45, -76, 500],
  [45, -68, 500],
  [50, -124, 500],
  [50, -116, 500],
  [50, -108, 500],
  [50, -100, 500],
  [50, -92, 500],
  [50, -84, 500],
  [50, -76, 500],
  [50, -68, 500],
  [54, -164, 500],
  [58, -156, 500],
  [62, -148, 500],
  [66, -140, 500],
  [60, -136, 500],
  [56, -150, 500],
  [64, -160, 500],
  [68, -152, 500],
  [19.5, -155.5, 500],
  [21, -158.5, 500],
  [18.2, -66.5, 500]
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
// Separate lower-48 test grid for adsb.fi. 38 overlapping 250-NM circles.
// 19 calls per scheduled minute, with one-second spacing: ~2-minute sweep.
const ADSBFI_REGIONS = [
 [26,-119],[26,-112],[26,-105],[26,-98],[26,-91],[26,-84],[26,-77],[26,-70],
 [31,-116.5],[31,-109.5],[31,-102.5],[31,-95.5],[31,-88.5],[31,-81.5],[31,-74.5],
 [36,-119],[36,-112],[36,-105],[36,-98],[36,-91],[36,-84],[36,-77],[36,-70],
 [41,-116.5],[41,-109.5],[41,-102.5],[41,-95.5],[41,-88.5],[41,-81.5],[41,-74.5],
 [46,-119],[46,-112],[46,-105],[46,-98],[46,-91],[46,-84],[46,-77],[46,-70]
];
const ADSBFI_BATCH = 6; // Six regions per minute; full lower-48 sweep about every 7 minutes
const PLACEFILE_REGIONS = { pacific:{title:"PACIFIC AIRCRAFT",test:(a,b)=>a>=24&&a<=50&&b>=-125&&b< -116}, southwest:{title:"SOUTHWEST AIRCRAFT",test:(a,b)=>a>=24&&a<37&&b>=-116&&b< -102}, mountain:{title:"MOUNTAIN AIRCRAFT",test:(a,b)=>a>=37&&a<=50&&b>=-116&&b< -102}, central:{title:"CENTRAL AIRCRAFT",test:(a,b)=>a>=24&&a<=50&&b>=-102&&b< -90}, southeast:{title:"SOUTHEAST AIRCRAFT",test:(a,b)=>a>=24&&a<37&&b>=-90&&b<=-66}, northeast:{title:"NORTHEAST AIRCRAFT",test:(a,b)=>a>=37&&a<=50&&b>=-90&&b<=-66} };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const CACHE_TTL = 6 * 60 * 1000;
const SNAPSHOT_TTL = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12000;
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
function classify(a, registry = {}) {
 const typeFields=[a.t,a.type,a.icao_type,a.typeCode,a.typeName,a.model,a.model_name,registry.icao_type_code,registry.typeCode,registry.type,registry.typeName,registry.model,registry.model_name].map(clean).filter(Boolean);
 const t=typeFields.join(" ").toUpperCase();
 const desc=[a.desc,a.typeDesc,a.category_desc,a.category_description,a.aircraft_desc,a.description,a.manufacturer,a.model,registry.type,registry.typeName,registry.model,registry.model_name,registry.manufacturer,registry.aircraft_desc,registry.description].map(clean).filter(Boolean).join(" ").toUpperCase();
 const operator=[a.ownOp,a.operator,registry.registered_owner].map(clean).filter(Boolean).join(" ").toUpperCase();
 const flight=clean(a.flight).toUpperCase();
 const prefix=(flight.match(/[A-Z]/g)||[]).join("").slice(0,3);
 let flags=0; try { flags=Number.parseInt(String(a.dbFlags||"0"),0)||0; } catch {}
 const rotorWords=/\b(HELI(?:COPTER)?|ROTORCRAFT|ROTOR[- ]?WING|GYROCOPTER|AUTOGYRO|BELL\s*(?:206|407|412|429|505)|ROBINSON\s*R?(?:22|44|66)|EUROCOPTER|AIRBUS\s*HELI|SIKORSKY|AGUSTA(?:WESTLAND)?|LEONARDO\s*HELI|MD\s*HELI|ENSTROM|KAMOV|MIL\s*MI[- ]?\d|HUGHES\s*(?:500|369)|BOEING\s*CH[- ]?47|BLACK\s*HAWK)\b/i;
 const rotorCodes=/(^|\b)(R22|R44|R66|B06T?|B206|B407|B412|B429|B505|EC(20|30|35|45|55|75|120|130|135|145|155|175|225)|AS(32|35|50|55|65|33|36)|H125|H130|H135|H145|H160|H175|H215|H225|H500|H269|H34[0-9A-Z]*|H46[0-9A-Z]*|H47[0-9A-Z]*|H53[0-9A-Z]*|H60[0-9A-Z]*|H64[0-9A-Z]*|S55|S58|S61|S64|S70[0-9A-Z]*|S76|S92|A109|A119|A139|A169|A189|MD5[0-9A-Z]*|MD6[0-9A-Z]*|OH[0-9A-Z]+|UH[0-9A-Z]+|HH[0-9A-Z]+|CH[0-9A-Z]+|MH[0-9A-Z]+|AH[0-9A-Z]+|TH[0-9A-Z]+|BK117|BO105|B105|MBB|K32|KA32)(?=$|\b)/;
 const emitterCategory=clean(a.category||a.emitter_category||a.emitterCategory||a.emitter_category_type||a.aircraft_category).toUpperCase();
 const rotorIdentity=[t,desc,operator,clean(a.flight),clean(a.r),clean(registry.registration)].join(" ").toUpperCase();
 if(rotorWords.test(rotorIdentity)||rotorCodes.test(rotorIdentity)||["A7","ROTORCRAFT","HELICOPTER","GYROCOPTER"].includes(emitterCategory)) return [2,"Helicopter",""];

 const identity=[operator,desc,clean(a.flight),clean(a.r),clean(registry.registration)].join(" ").toUpperCase();
 const government=/\b(UNITED STATES GOVERNMENT|U\.S\. GOVERNMENT|GOVERNMENT|DEPARTMENT OF|FEDERAL|STATE POLICE|HIGHWAY PATROL|SHERIFF|POLICE DEPARTMENT|POLICE|BORDER PATROL|CUSTOMS AND BORDER PROTECTION|CBP|DHS|DEA|FBI|ATF|USFS|FOREST SERVICE|NATIONAL PARK SERVICE|NOAA|NASA|FAA|CAL FIRE|CALIFORNIA HIGHWAY PATROL|TEXAS DPS)\b/;
 if(a.mil||a.military||(flags&1)) return [1,"MILITARY OR GOVERNMENT",branch(a)];
 if(government.test(identity)) return [1,"MILITARY OR GOVERNMENT",operator||"GOVERNMENT"];

 const cargoPrefixes=new Set(["FDX","UPS","GTI","ABX","CKS","PAC","ATN","MML","CLX","BOX","WGN","GTX","RPA"]);
 const cargoWords=/\b(CARGO|FREIGHT|AIR CARGO|LOGISTICS|PARCEL|EXPRESS)\b/;
 if(cargoPrefixes.has(prefix)||cargoWords.test(identity)) return [1,"COMMERCIAL",airline(a)||operator||"CARGO"];

 // Airline callsigns and known airline operators identify scheduled passenger
 // service. Aircraft size/type alone is deliberately not used to infer this.
 const passengerAirlinePrefixes=new Set([
  "AAL","UAL","DAL","SWA","JBU","ASA","FFT","NKS","SKW","RPA","ENY","PDT","AAY",
  "KAL","BAW","AFR","DLH","ACA","WJA","AMX","JAL","ANA","QTR","UAE","EVA","THY",
  "SIA","IBE","AUA","KLM","VIR","FLE","ROU","POE","AIC","ANZ","QFA","CCA","CSN",
  "CES","SAS","FIN","LOT","TAP","EZY","RYR","WZZ","ETD","ETI","SAA","ETH","QTR"
 ]);
 const knownAirline=Object.values(AIRLINES).some(name=>operator.includes(name.toUpperCase()));
 if(passengerAirlinePrefixes.has(prefix)||knownAirline) return [1,"PASSENGER",airline(a)||operator];

 // Explicit commercial charter, air-taxi and commuter operators are commercial.
 // Corporate/private aircraft remain General Aviation unless positively identified.
 const commercialWords=/\b(CHARTER|AIR TAXI|AEROMEDICAL|AIR AMBULANCE|COMMUTER AIR|AIR TRANSPORT|AIR SERVICES|FLIGHT SERVICES)\b/;
 if(commercialWords.test(identity)) return [1,"COMMERCIAL",operator||"COMMERCIAL OPERATOR"];

 // Business jets are identified from aircraft model/type records, not from
 // ADS-B emitter size categories. Keep this after existing commercial and
 // passenger rules so those previously recognized categories retain priority.
 const businessJetCodes=/^(C25[ABC]|C510|C525|C526|C550|C551|C560|C56X|C68A|C700|C750|CL30|CL35|CL60|GLF[234567]|G150|G280|FA50|FA7X|FA8X|E35L|E50P|E55P|E545|E550|LJ35|LJ45|LJ55|LJ60|GALX|ASTR|H25B|H25C|H25D|HA4T|HA4T|F2TH|F900|F2000|F7X|F8X)$/;
 const businessJetWords=/\b(BUSINESS JET|CORPORATE JET|EXECUTIVE JET|CITATION|LEARJET|CHALLENGER|GLOBAL EXPRESS|GULFSTREAM|FALCON [0-9]|PHENOM|LEGACY [0-9]|PRAETOR|HONDAJET|HAWKER|WESTWIND|ASTRA|G280|G200)\b/;
 if(businessJetCodes.test(t)||businessJetWords.test(desc)) return [1,"Business Jets",""];
 return [1,"GENERAL AVIATION",""];
}
function altText(a) {
 const alt=a.alt_baro ?? a.alt_geom;
 if(alt==="ground") return "GROUND";
 const n=Number(alt);
 return alt!==null&&alt!==undefined&&Number.isFinite(n)?Math.trunc(n).toLocaleString("en-US")+" FT":"ALT N/A";
}
function render(rows, usage, source = "FlyItalyADSB", region = null, registryRows = []) {
 const now=Date.now(), aircraft=new Map(), registry=new Map();
 for(const item of registryRows){try{registry.set(clean(item.hex).toLowerCase(),JSON.parse(item.payload));}catch{}}
 for(const row of rows) {
  if(now-Number(row.updated_at)>SNAPSHOT_TTL) continue;
  let list; try { list=JSON.parse(row.payload); } catch { continue; }
  for(const a of list) {
   const hx=clean(a.hex).toLowerCase();
   if(!hx||a.lat==null||a.lon==null) continue;
   // adsb.fi may provide seen_pos, seen, or neither depending on the
   // aircraft record. When the age field is absent or invalid, use the
   // snapshot timestamp rather than incorrectly dropping a valid aircraft.
   const seenRaw = a.seen_pos ?? a.seen;
   const seen = Number(seenRaw);
   const observed = Number.isFinite(seen) && seen >= 0 && seen < 3600
    ? now - seen * 1000
    : Number(row.updated_at);
   if (!Number.isFinite(observed) || now - observed > SNAPSHOT_TTL) continue;
   const old=aircraft.get(hx);
   if(!old||observed>old.observed) aircraft.set(hx,{a,observed});
  }
 }
 const stamp=new Date(now).toISOString().replace("T"," ").replace(/\.\d{3}Z$/," UTC");
 const adsbfi = source === "adsb.fi";
 const multi = source === "multi";
 let helicopterCount=0;
 const lines=[...(multi ? ["; Flight data: adsb.fi; https://adsb.fi/","; Flight data: FlyItalyADSB (flyitalyadsb.com), CC BY-SA 4.0"] : [adsbfi ? "; Flight data: adsb.fi; https://adsb.fi/" : "; Flight data: FlyItalyADSB (flyitalyadsb.com), CC BY-SA 4.0"]),
 region ? "Title: " + region.title : (adsbfi ? "Title: US FLIGHT TRACKER - ADSB.FI TEST" : "Title: US FLIGHT TRACKER - FLYITALYADSB"),"Refresh: 1","Color: 235 235 235",'Font: 1, 10, 1, "Arial"',
 `IconFile: 1, 64, 64, 64, 64, "${ICON_URL}"`,
  `IconFile: 2, 64, 64, 64, 64, "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/helicopter-gray.png?v=6"`,
 `IconFile: 3, 64, 64, 64, 64, "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/passenger-light-red.png?v=1"`,
 `IconFile: 4, 64, 64, 64, 64, "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/commercial-yellow.png?v=3"`,
 `IconFile: 5, 64, 64, 64, 64, "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/military-green.png?v=3"`,
 `IconFile: 6, 64, 64, 64, 64, "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/general-aviation-blue.png?v=2"`,
 `IconFile: 7, 64, 64, 64, 64, "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/business-jet-purple.png?v=2"`,`; Updated: ${stamp}`,
 `; Active aircraft cached across full U.S. coverage grid: ${aircraft.size}`,
 `; API quota used this month: ${usage.used||"unknown"} / ${usage.limit||"unknown"}`];
 for(const [hx,item] of aircraft) {
  const a=item.a, lat=Number(a.lat),lon=Number(a.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)) continue;
  if(region && !region.test(lat,lon)) continue;
  const reg=registry.get(hx)||{}, [icon,kind,org]=classify(a,reg), ident=clean(a.flight)||clean(a.r)||clean(reg.registration)||hx;
  if(kind==="Helicopter") helicopterCount++;
  const displayIcon=kind==="Helicopter"?2:kind==="PASSENGER"?3:kind==="COMMERCIAL"?4:kind==="MILITARY OR GOVERNMENT"?5:kind==="GENERAL AVIATION"?6:kind==="Business Jets"?7:icon;
  const gs=Number(a.gs), speed=a.gs!=null&&Number.isFinite(gs)?Math.round(gs)+" KT":"SPEED N/A";
  const alt=altText(a), heading=Number(a.track??a.true_heading??0);
  const hdg=Number.isFinite(heading)?((heading%360)+360)%360:0;
  const orgline=org?"\\n"+org:"";
  const hover=[kind,`ID: ${ident}`,...(org?[org]:[]),`Speed: ${speed}`,`Altitude: ${alt}`,`Registration: ${clean(a.r)||"Unknown"}`,`Aircraft type: ${clean(a.t||reg.icao_type_code)||"Unknown"}`,`Manufacturer: ${clean(reg.manufacturer)||"Unknown"}`,`Model: ${clean(reg.type)||"Unknown"}`,`ICAO24: ${hx}`].map(clean).join("\\n");
  lines.push(`Object: ${lat.toFixed(5)},${lon.toFixed(5)}`,"Threshold: 999",
   `Icon: 0,0,${Math.round(hdg)},${displayIcon},1,"${hover}"`,
   `Text: 0,22,1,"${ident}"`,`Text: 0,34,1,"${speed} | ${alt}"`);
  if(org) lines.push(`Text: 0,46,1,"${clean(org)}"`);
  lines.push("End:");
 }
 lines.push(`; Helicopters rendered: ${helicopterCount}`);
 return lines.join("\n")+"\n";
}
async function collectAdsbfi(env) {
 const state = await env.DB.prepare("SELECT value FROM tracker_state WHERE key='adsbfi_next_region'").first();
 const start = Number(state?.value || 0) % ADSBFI_REGIONS.length;
 const stmts = [];
 let success = 0;
 for (let i = 0; i < ADSBFI_BATCH; i++) {
  const idx = (start + i) % ADSBFI_REGIONS.length;
  const [lat, lon] = ADSBFI_REGIONS[idx];
  if (i > 0) await sleep(1100);
  const res = await fetch(`${ADSBFI_API}/${lat}/lon/${lon}/dist/250`, {
   headers: { "Accept": "application/json", "User-Agent": "USFlightTrackerPlacefile/adsbfi-test" },
   signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`adsb.fi HTTP ${res.status} for region ${idx}`);
  const data = await res.json();
  if (!Array.isArray(data.ac)) throw new Error(`adsb.fi response missing aircraft array for region ${idx}`);
  stmts.push(env.DB.prepare("INSERT INTO adsbfi_region_data(region_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(region_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at")
   .bind(idx, JSON.stringify(data.ac), Date.now()));
  success++;
 }
 const next = (start + success) % ADSBFI_REGIONS.length;
 const now = Date.now();
 stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('adsbfi_next_region',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(next)));
 stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('adsbfi_last_success',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(now)));
 stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('adsbfi_last_batch_count',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(success)));
 await env.DB.batch(stmts);
}
async function writeState(env, entries) {
 const statements=entries.map(([key,value])=>env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,String(value)));
 if(statements.length) await env.DB.batch(statements);
}
async function runCollector(env,name,collector) {
 const started=Date.now();
 try {
  await writeState(env,[[name+"_last_attempt",started],[name+"_last_error",""]]);
  await collector(env);
  const finished=Date.now();
  await writeState(env,[[name+"_last_success",finished],[name+"_last_duration_ms",finished-started],[name+"_last_error",""]]);
  console.log(name+" collector succeeded in "+(finished-started)+" ms");
 } catch(error) {
  const failed=Date.now(), message=String(error?.stack||error).slice(0,1500);
  try {
   await writeState(env,[[name+"_last_attempt",started],[name+"_last_error_at",failed],[name+"_last_error",message],[name+"_last_duration_ms",failed-started]]);
  } catch(stateError) {
   console.error(name+" collector failed and status could not be saved:",String(stateError));
  }
  console.error(name+" collector failed:",message);
 }
}
async function collect(env) {
 if(!env.FLYITALYADSB_API_KEY) throw new Error("Missing FLYITALYADSB_API_KEY Worker secret");
 const state=await env.DB.prepare("SELECT value FROM tracker_state WHERE key='next_region'").first();
 const start=Number(state?.value||0)%REGIONS.length, stmts=[];
 let used="unknown",limit="unknown",success=0;
 for(let i=0;i<BATCH;i++) {
  const idx=(start+i)%REGIONS.length,[lat,lon,radius]=REGIONS[idx];
  const url=`${API}/${lat}/lon/${lon}/dist/${radius}`;
  const res=await fetch(url,{headers:{"X-Api-Key":env.FLYITALYADSB_API_KEY,"Accept":"application/json","User-Agent":"USFlightTrackerPlacefile/4.0"},signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)});
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
 async scheduled(controller,env,ctx) {
  // Each feed runs independently. Persist success/failure and log errors so a
  // scheduled invocation cannot silently hide a failed collection cycle.
  ctx.waitUntil(Promise.all([
   runCollector(env,"flyitaly",collect),
   runCollector(env,"adsbfi",collectAdsbfi)
  ]));
 },
 async fetch(request,env) {
  const url=new URL(request.url);
  if(url.pathname==="/health") {
   const [{results:state=[]},{results:flyRows=[]},{results:adsbRows=[]}] = await Promise.all([
    env.DB.prepare("SELECT key,value FROM tracker_state").all(),
    env.DB.prepare("SELECT region_id,updated_at FROM region_data").all(),
    env.DB.prepare("SELECT region_id,updated_at FROM adsbfi_region_data").all()
   ]);
   const stateMap=Object.fromEntries(state.map(x=>[x.key,x.value]));
   const latest=rows=>rows.reduce((max,row)=>Math.max(max,Number(row.updated_at)||0),0);
   return Response.json({
    ok:true,generated_at:new Date().toISOString(),
    feeds:{
     flyitaly:{last_attempt:stateMap.flyitaly_last_attempt||"0",last_success:stateMap.flyitaly_last_success||stateMap.last_success||"0",last_error:stateMap.flyitaly_last_error||"",regions_cached:flyRows.length,total_regions:REGIONS.length,latest_region_update:latest(flyRows),full_sweep_minutes:Math.ceil(REGIONS.length/BATCH)},
     adsbfi:{last_attempt:stateMap.adsbfi_last_attempt||"0",last_success:stateMap.adsbfi_last_success||"0",last_error:stateMap.adsbfi_last_error||"",regions_cached:adsbRows.length,total_regions:ADSBFI_REGIONS.length,latest_region_update:latest(adsbRows),full_sweep_minutes:Math.ceil(ADSBFI_REGIONS.length/ADSBFI_BATCH)}
    },
    quota:{used:stateMap.quota_used||"unknown",limit:stateMap.quota_limit||"unknown"}
   });
  }
  if (url.pathname === "/adsbfi-health") {
   const [{results:state=[]},{results:rows=[]}] = await Promise.all([
    env.DB.prepare("SELECT key,value FROM tracker_state WHERE key LIKE 'adsbfi_%'").all(),
    env.DB.prepare("SELECT region_id,updated_at FROM adsbfi_region_data ORDER BY region_id").all()
   ]);
   const stateMap=Object.fromEntries(state.map(x=>[x.key,x.value]));
   const latest=rows.reduce((max,row)=>Math.max(max,Number(row.updated_at)||0),0);
   return Response.json({
    ok:true,source:"adsb.fi",generated_at:new Date().toISOString(),
    regions_total:ADSBFI_REGIONS.length,regions_per_minute:ADSBFI_BATCH,approximate_full_sweep_minutes:Math.ceil(ADSBFI_REGIONS.length/ADSBFI_BATCH),
    last_attempt:stateMap.adsbfi_last_attempt||"0",last_success:stateMap.adsbfi_last_success||"0",last_error:stateMap.adsbfi_last_error||"",last_error_at:stateMap.adsbfi_last_error_at||"0",
    latest_region_update:latest,regions:rows.map(row=>({region_id:row.region_id,updated_at:row.updated_at,age_seconds:Math.max(0,Math.round((Date.now()-Number(row.updated_at))/1000))}))
   });
  }
  const regionalPath = url.pathname.split("/")[1].replace(".txt","");
  if (PLACEFILE_REGIONS[regionalPath]) {
   const region = PLACEFILE_REGIONS[regionalPath];
   const [{results:adsbfiRows=[]},{results:flyitalyRows=[]},{results:states=[]}] = await Promise.all([
    env.DB.prepare("SELECT region_id,payload,updated_at FROM adsbfi_region_data").all(),
    env.DB.prepare("SELECT region_id,payload,updated_at FROM region_data").all(),
    env.DB.prepare("SELECT key,value FROM tracker_state").all()
   ]);
   // Merge independent live networks; render() deduplicates by ICAO24 hex and
   // keeps the freshest position, so aircraft reported by both appear once.
   // Registry enrichment is optional; never let a missing registry table
   // suppress live aircraft positions in a placefile.
   let registryRows = [];
   try {
    const registryResult = await env.DB.prepare("SELECT hex,payload FROM aircraft_registry").all();
    registryRows = registryResult.results || [];
   } catch (error) {
    console.log("Aircraft registry unavailable; using live ADS-B type data:", String(error));
   }
   const stateMap = Object.fromEntries(states.map(x=>[x.key,x.value]));
   const latest = rows => rows.reduce((max,row)=>Math.max(max,Number(row.updated_at)||0),0);
   const adsbLatest=latest(adsbfiRows), flyLatest=latest(flyitalyRows);
   const feedLine=(label,value)=>label+": "+(value?new Date(value).toISOString():"not yet");
   const body = render([...adsbfiRows,...flyitalyRows],{used:"multiple live feeds",limit:"source-specific limits"},"multi",region,registryRows)
    .replace("; Updated:", "; "+feedLine("adsb.fi latest data",adsbLatest)+"\n; "+feedLine("FlyItalyADSB latest data",flyLatest)+"\n; ADSB.fi collector error: "+(stateMap.adsbfi_last_error||"none")+"\n; FlyItalyADSB collector error: "+(stateMap.flyitaly_last_error||"none")+"\n; Updated:");
   return new Response(body,{headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store, max-age=0"}});
  }
  if (url.pathname === "/adsbfi-test.txt") {
   const [{results:rows=[]},{results:states=[]}] = await Promise.all([
    env.DB.prepare("SELECT region_id,payload,updated_at FROM adsbfi_region_data").all(),
    env.DB.prepare("SELECT key,value FROM tracker_state WHERE key LIKE 'adsbfi_%'").all()
   ]);
   const lastSuccess = Number(Object.fromEntries(states.map(x=>[x.key,x.value])).adsbfi_last_success || 0);
   const usage = {used:"adsb.fi public",limit:"1 request/second"};
   const body = render(rows,usage,"adsb.fi").replace("; Updated:", `; Last successful collection: ${lastSuccess ? new Date(lastSuccess).toISOString() : "not yet"}\n; Updated:`);
   return new Response(body,{headers:{"content-type":"text/plain; charset=utf-8","cache-control":"public, max-age=1"}});
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
