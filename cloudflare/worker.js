const API = "https://api.flyitalyadsb.com/v2/lat";
const ADSBFI_API = "https://opendata.adsb.fi/api/v3/lat";
const ICON_URL = "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/aircraft-gray.png?v=5"; // Shared grayscale aircraft sprite
// Coverage grid: 38 lower-48 points plus Alaska, Hawaii and Puerto Rico.
// Radius is selected from the active FlyItalyADSB plan (500 km Free; 1,000 km Starter/Pro).
const REGIONS_FREE = [
 [26,-119,500],[26,-112,500],[26,-105,500],[26,-98,500],[26,-91,500],[26,-84,500],[26,-77,500],[26,-70,500],
 [31,-116.5,500],[31,-109.5,500],[31,-102.5,500],[31,-95.5,500],[31,-88.5,500],[31,-81.5,500],[31,-74.5,500],
 [36,-119,500],[36,-112,500],[36,-105,500],[36,-98,500],[36,-91,500],[36,-84,500],[36,-77,500],[36,-70,500],
 [41,-116.5,500],[41,-109.5,500],[41,-102.5,500],[41,-95.5,500],[41,-88.5,500],[41,-81.5,500],[41,-74.5,500],
 [46,-119,500],[46,-112,500],[46,-105,500],[46,-98,500],[46,-91,500],[46,-84,500],[46,-77,500],[46,-70,500],
 [54,-164,500],[58,-156,500],[62,-148,500],[66,-140,500],[60,-136,500],[56,-150,500],[64,-160,500],[68,-152,500],
 [19.5,-155.5,500],[21,-158.5,500],[18.2,-66.5,500]
];
const ADSBFI_REGION_COUNT = 38; // Legacy grid retained only for diagnostics; collector disabled after HTTP 403.
const REGIONS_STARTER = [
 // Continental U.S.: 15 overlapping 1,000-km circles.
 [27,-123],[27,-111],[27,-99],[27,-87],[27,-75],
 [37,-123],[37,-111],[37,-99],[37,-87],[37,-75],
 [47,-123],[47,-111],[47,-99],[47,-87],[47,-75],
 // Alaska, Hawaii and Puerto Rico.
 [54,-164],[60,-152],[64,-164],[66,-144],[58,-136],[56,-146],
 [20.5,-157.5],[18.2,-66.5]
];
const regionsForPlan = plan => {
 const p=String(plan||"free").toLowerCase();
 return p.includes("starter")||p.includes("pro")||p.includes("fleet") ? REGIONS_STARTER : REGIONS_FREE;
};
const PLACEFILE_REGIONS = { pacific:{title:"PACIFIC AIRCRAFT",test:(a,b)=>a>=24&&a<=50&&b>=-125&&b< -116}, southwest:{title:"SOUTHWEST AIRCRAFT",test:(a,b)=>a>=24&&a<37&&b>=-116&&b< -102}, mountain:{title:"MOUNTAIN AIRCRAFT",test:(a,b)=>a>=37&&a<=50&&b>=-116&&b< -102}, central:{title:"CENTRAL AIRCRAFT",test:(a,b)=>a>=24&&a<=50&&b>=-102&&b< -90}, southeast:{title:"SOUTHEAST AIRCRAFT",test:(a,b)=>a>=24&&a<37&&b>=-90&&b<=-66}, northeast:{title:"NORTHEAST AIRCRAFT",test:(a,b)=>a>=37&&a<=50&&b>=-90&&b<=-66} };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const CACHE_TTL = 6 * 60 * 1000;
const SNAPSHOT_TTL = 3 * 60 * 1000;
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
 const typeTokens = new Set(typeFields.join(" ").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean));
 const businessJetCodes = new Set([
  "C25A","C25B","C25C","C510","C525","C526","C550","C551","C552","C560","C56X","C650","C680","C68A","C700","C750",
  "CL30","CL35","CL60","GLF2","GLF3","GLF4","GLF5","GLF6","GLF7","GLF8","G150","G200","G280","G500","G600","G650","G700","G800","BD700","GLEX","GL7T","PC24","FA50","FA7X","FA8X",
  "E35L","E50P","E55P","E545","E550","LJ23","LJ24","LJ25","LJ28","LJ31","LJ35","LJ40","LJ45","LJ55","LJ60","LJ70","LJ75",
  "GALX","ASTR","H25B","H25C","H25D","HA4T","F2TH","F900","F2000","F7X","F8X","F10X","PRM1","HDJT","E290","E295"
 ]);
 const businessJetWords=/\b(BUSINESS JET|CORPORATE JET|EXECUTIVE JET|CITATION|LEARJET|CHALLENGER|GLOBAL EXPRESS|GULFSTREAM|FALCON [0-9]|PHENOM|LEGACY [0-9]|PRAETOR|HONDAJET|HAWKER|WESTWIND|ASTRA|G280|G200|BEECHJET|KING AIR 350|TURBO COMMANDER)\b/i;
 const businessIdentity = [desc,t,clean(registry.model),clean(registry.model_name),clean(registry.type),clean(registry.manufacturer)].join(" ").toUpperCase();
 if([...businessJetCodes].some(code=>typeTokens.has(code))||businessJetWords.test(businessIdentity)) return [1,"Business Jets",""];
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
 const lines=[...(multi ? ["; Flight data: FlyItalyADSB (flyitalyadsb.com), CC BY-SA 4.0"] : [adsbfi ? "; Flight data: adsb.fi; https://adsb.fi/" : "; Flight data: FlyItalyADSB (flyitalyadsb.com), CC BY-SA 4.0"]),
 region ? "Title: " + region.title : (adsbfi ? "Title: US FLIGHT TRACKER - ADSB.FI TEST" : "Title: US FLIGHT TRACKER - FLYITALYADSB"),"RefreshSeconds: 15","Color: 235 235 235",'Font: 1, 10, 1, "Arial"',
 `IconFile: 1, 64, 64, 64, 64, "${ICON_URL}"`,
  `IconFile: 2, 96, 96, 48, 48, "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/helicopter-map-icon-96.png?v=1"`,
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

async function writeState(env, entries) {
 const statements=entries.map(([key,value])=>env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,String(value)));
 if(statements.length) await env.DB.batch(statements);
}
async function runCollector(env,name,collector) {
 const started=Date.now();
 try {
  await writeState(env,[[name+"_last_attempt",started]]);
  const result=await collector(env);
  if(result===false) { console.log(name+" collector skipped; a previous cycle still holds the lock"); return; }
  const finished=Date.now();
  await writeState(env,[[name+"_last_success",finished],[name+"_last_duration_ms",finished-started]]);
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
 const lockNow=Date.now(),lockUntil=lockNow+90000;
 const lock=await env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('flyitaly_lock_until',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(tracker_state.value AS INTEGER) < ?")
  .bind(String(lockUntil),String(lockNow)).run();
 if(Number(lock.meta?.changes||0)===0) return false;
 try {
  const stateRows=await env.DB.prepare("SELECT key,value FROM tracker_state WHERE key IN ('next_region','quota_plan','quota_per_minute')").all();
  const state=Object.fromEntries((stateRows.results||[]).map(x=>[x.key,x.value]));
  const regions=regionsForPlan(plan);
  const start=Number(state.next_region||0)%regions.length, stmts=[];
  const plan=String(state.quota_plan||"free").toLowerCase();
  const perMinute=Math.max(1,Number(state.quota_per_minute)||30);
  const batchSize=Math.min(regions.length,Math.max(1,Math.floor(perMinute*0.9)));
  const radius=(plan.includes("starter")||plan.includes("pro")||plan.includes("fleet"))?1000:500;
  let used="unknown",limit="unknown",planHeader=plan,perMinuteHeader=String(perMinute),success=0;
  const failures=[];
  for(let i=0;i<batchSize;i++) {
   const idx=(start+i)%regions.length,[lat,lon]=regions[idx];
   if(i>0) await sleep(1050);
   try {
    const url=`${API}/${lat}/lon/${lon}/dist/${radius}`;
    const res=await fetch(url,{headers:{"X-Api-Key":env.FLYITALYADSB_API_KEY,"Accept":"application/json","User-Agent":"USFlightTrackerPlacefile/4.2"},signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)});
    if(!res.ok) {
     const detail=(await res.text()).slice(0,220);
     throw new Error(`HTTP ${res.status} ${res.statusText}: ${detail}`);
    }
    used=res.headers.get("X-FIA-Used-Month")||used;
    limit=res.headers.get("X-FIA-Quota-Month")||limit;
    planHeader=res.headers.get("X-FIA-Plan")||planHeader;
    perMinuteHeader=res.headers.get("X-FIA-Limit-Per-Min")||perMinuteHeader;
    const data=await res.json();
    if(!Array.isArray(data.ac)) throw new Error("response missing aircraft array");
    stmts.push(env.DB.prepare("INSERT INTO region_data(region_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(region_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at")
     .bind(idx,JSON.stringify(data.ac),Date.now()));
    success++;
   } catch(error) {
    const message=`region ${idx} (${lat},${lon}): ${String(error).slice(0,260)}`;
    failures.push(message);
    console.error("FlyItalyADSB region failed:",message);
    if(String(error).includes("HTTP 429")) break;
   }
  }
  const next=(start+batchSize)%regions.length, now=Date.now();
  const errorSummary=failures.slice(0,6).join(" | ").slice(0,1500);
  stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('next_region',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(next)));
  stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('quota_used',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(used));
  stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('quota_limit',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(limit));
  stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('quota_plan',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(planHeader));
  stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('quota_per_minute',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(perMinuteHeader));
  stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('flyitaly_last_error',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(errorSummary));
  stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('flyitaly_last_batch_count',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(success)));
  stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('flyitaly_regions_failed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(failures.length)));
  stmts.push(env.DB.prepare("DELETE FROM region_data WHERE region_id>=?").bind(regions.length));
  if(stmts.length) await env.DB.batch(stmts);
  console.log(`FlyItalyADSB ${planHeader}: ${success}/${batchSize} regions refreshed; ${failures.length} failed; grid ${regions.length}; estimated sweep ${Math.ceil(regions.length/batchSize)} minute(s)`);
  if(success===0) throw new Error("FlyItalyADSB batch failed: "+errorSummary);
 } finally {
  try {
   await env.DB.prepare("UPDATE tracker_state SET value='0' WHERE key='flyitaly_lock_until' AND value=?").bind(String(lockUntil)).run();
  } catch(error) {
   console.error("Could not release FlyItalyADSB collection lock:",String(error));
  }
 }
}
export default {
 async scheduled(controller,env,ctx) {
  // Each feed runs independently. Persist success/failure and log errors so a
  // scheduled invocation cannot silently hide a failed collection cycle.
  // adsb.fi is disabled: its edge returns Cloudflare 403 to this Worker.
  // Use FlyItalyADSB and adapt polling volume to the key tier.
  ctx.waitUntil(runCollector(env,"flyitaly",collect));
 },
 async fetch(request,env) {
  try {
  const url=new URL(request.url);
  if(url.pathname==="/health") {
   const [{results:state=[]},{results:flyRows=[]},{results:adsbRows=[]}] = await Promise.all([
    env.DB.prepare("SELECT key,value FROM tracker_state").all(),
    env.DB.prepare("SELECT region_id,updated_at FROM region_data").all(),
    env.DB.prepare("SELECT region_id,updated_at FROM adsbfi_region_data").all()
   ]);
   const stateMap=Object.fromEntries(state.map(x=>[x.key,x.value]));
   const activeRegions=regionsForPlan(stateMap.quota_plan||"free");
   const activeRows=flyRows.filter(row=>Number(row.region_id)<activeRegions.length);
   const healthBatch=Math.min(activeRegions.length,Math.max(1,Math.floor((Number(stateMap.quota_per_minute)||30)*0.9)));
   const latest=rows=>rows.reduce((max,row)=>Math.max(max,Number(row.updated_at)||0),0);
   return Response.json({
    ok:true,generated_at:new Date().toISOString(),
    feeds:{
     flyitaly:{last_attempt:stateMap.flyitaly_last_attempt||"0",last_success:stateMap.flyitaly_last_success||stateMap.last_success||"0",last_error:stateMap.flyitaly_last_error||"",regions_cached:activeRows.length,total_regions:activeRegions.length,last_batch_count:Number(stateMap.flyitaly_last_batch_count||0),regions_failed:Number(stateMap.flyitaly_regions_failed||0),last_duration_ms:Number(stateMap.flyitaly_last_duration_ms||0),latest_region_update:latest(activeRows),full_sweep_minutes:Math.ceil(activeRegions.length/healthBatch),regions:activeRows.map(row=>({region_id:row.region_id,updated_at:row.updated_at,age_seconds:Math.max(0,Math.round((Date.now()-Number(row.updated_at))/1000))}))},
     adsbfi:{last_attempt:stateMap.adsbfi_last_attempt||"0",last_success:stateMap.adsbfi_last_success||"0",last_error:stateMap.adsbfi_last_error||"",regions_cached:adsbRows.length,total_regions:ADSBFI_REGION_COUNT,latest_region_update:latest(adsbRows),full_sweep_minutes:null,disabled:true}
    },
    quota:{plan:stateMap.quota_plan||"unknown",per_minute:stateMap.quota_per_minute||"unknown",used:stateMap.quota_used||"unknown",limit:stateMap.quota_limit||"unknown"}
   });
  }
  if (url.pathname === "/adsbfi-probe") {
   const started = Date.now();
   try {
    const res = await fetch(`${ADSBFI_API}/30/lon/-90/dist/25`, {
     headers: { "Accept": "application/json", "User-Agent": "USFlightTrackerPlacefile/diagnostic" },
     signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const body = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(body); } catch {}
    return Response.json({
     ok:res.ok,status:res.status,status_text:res.statusText,
     content_type:res.headers.get("content-type"),
     elapsed_ms:Date.now()-started,
     aircraft_count:Array.isArray(parsed?.ac)?parsed.ac.length:null,
     response_preview:body.slice(0,500)
    });
   } catch(error) {
    return Response.json({ok:false,error:String(error?.stack||error),elapsed_ms:Date.now()-started},{status:502});
   }
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
    regions_total:ADSBFI_REGION_COUNT,regions_per_minute:0,approximate_full_sweep_minutes:null,disabled:true,regions_failed:Number(stateMap.adsbfi_regions_failed||0),last_batch_count:Number(stateMap.adsbfi_last_batch_count||0),last_duration_ms:Number(stateMap.adsbfi_last_duration_ms||0),
    last_attempt:stateMap.adsbfi_last_attempt||"0",last_success:stateMap.adsbfi_last_success||"0",last_error:stateMap.adsbfi_last_error||"",last_error_at:stateMap.adsbfi_last_error_at||"0",
    latest_region_update:latest,regions:rows.map(row=>({region_id:row.region_id,updated_at:row.updated_at,age_seconds:Math.max(0,Math.round((Date.now()-Number(row.updated_at))/1000))}))
   });
  }
  const regionalPath = url.pathname.split("/")[1].replace(".txt","");
  if (PLACEFILE_REGIONS[regionalPath]) {
   const region = PLACEFILE_REGIONS[regionalPath];
   const [{results:flyitalyRows=[]},{results:states=[]}] = await Promise.all([
    env.DB.prepare("SELECT region_id,payload,updated_at FROM region_data").all(),
    env.DB.prepare("SELECT key,value FROM tracker_state").all()
   ]);
   // Render the active FlyItalyADSB region snapshots; aircraft are deduplicated by ICAO24.
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
   const flyLatest=latest(flyitalyRows);
   const feedLine=(label,value)=>label+": "+(value?new Date(value).toISOString():"not yet");
   const body = render(flyitalyRows,{used:"FlyItalyADSB",limit:stateMap.quota_limit||"unknown"},"multi",region,registryRows)
    .replace("; Updated:", "; "+feedLine("FlyItalyADSB latest data",flyLatest)+"\n; ADSB.fi collector error: "+(stateMap.adsbfi_last_error||"none")+"\n; FlyItalyADSB collector error: "+(stateMap.flyitaly_last_error||"none")+"\n; Updated:");
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
  const [{results:flyitalyRows=[]},{results:states=[]}] = await Promise.all([
   env.DB.prepare("SELECT region_id,payload,updated_at FROM region_data").all(),
   env.DB.prepare("SELECT key,value FROM tracker_state").all()
  ]);
  let registryRows = [];
  try {
   const registryResult = await env.DB.prepare("SELECT hex,payload FROM aircraft_registry").all();
   registryRows = registryResult.results || [];
  } catch (error) {
   console.log("Aircraft registry unavailable; using live ADS-B type data:", String(error));
  }
  const stateMap = Object.fromEntries(states.map(x=>[x.key,x.value]));
  const latest = rows => rows.reduce((max,row)=>Math.max(max,Number(row.updated_at)||0),0);
  const flyLatest=latest(flyitalyRows);
  const body = render(flyitalyRows,{used:"FlyItalyADSB",limit:stateMap.quota_limit||"unknown"},"multi",null,registryRows)
   .replace("; Updated:", "; adsb.fi source: disabled (HTTP 403)"+
    "\\n; FlyItalyADSB latest data: "+(flyLatest?new Date(flyLatest).toISOString():"not yet")+
    "\\n; adsb.fi collector error: "+(stateMap.adsbfi_last_error||"none")+
    "\\n; FlyItalyADSB collector error: "+(stateMap.flyitaly_last_error||"none")+"\\n; Updated:");
  return new Response(body,{headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store, max-age=0"}});
  } catch(error) {
   const message=String(error?.stack||error);
   console.error("Flight tracker request failed:",message);
   return new Response("Flight tracker request failed: "+String(error?.message||error),{status:500,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"}});
  }
 }
};
