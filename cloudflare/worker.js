import { handleTrafficRequest } from "./traffic.js";
const API = "https://api.flyitalyadsb.com/v2/lat";
const ADSBFI_API = "https://opendata.adsb.fi/api/v3/lat";
const ICON_HELICOPTER = "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/helicopter-aircraft-theme-96.png?v=1";
const ICON_PASSENGER = "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/passenger-light-red.png?v=1";
const ICON_COMMERCIAL = "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/commercial-yellow.png?v=3";
const ICON_BUSINESS = "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/business-jet-purple.png?v=2";
const ICON_GENERAL = "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/general-aviation-blue.png?v=2";
const ICON_MILITARY = "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/military-green.png?v=3";
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
 WJA:"WestJet",AMX:"Aeromexico",AMZ:"Amazon Air",JAL:"Japan Airlines",ANA:"All Nippon Airways",QTR:"Qatar Airways",
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
const BATCH = 27;
// Separate lower-48 test grid for adsb.fi. 38 overlapping 250-NM circles.
// 19 calls per scheduled minute, with one-second spacing: ~2-minute sweep.
const ADSBFI_REGIONS = [
 [26,-119],[26,-112],[26,-105],[26,-98],[26,-91],[26,-84],[26,-77],[26,-70],
 [31,-116.5],[31,-109.5],[31,-102.5],[31,-95.5],[31,-88.5],[31,-81.5],[31,-74.5],
 [36,-119],[36,-112],[36,-105],[36,-98],[36,-91],[36,-84],[36,-77],[36,-70],
 [41,-116.5],[41,-109.5],[41,-102.5],[41,-95.5],[41,-88.5],[41,-81.5],[41,-74.5],
 [46,-119],[46,-112],[46,-105],[46,-98],[46,-91],[46,-84],[46,-77],[46,-70]
];
const ADSBFI_BATCH = 19;
// Independent secondary feed. ADSB.lol's public point endpoint is queried
// separately from FlyItalyADSB; ICAO24 de-duplication happens in render().
const ADSBLOL_API = "https://api.adsb.lol/v2/point";
const ADSBLOL_REGIONS = ADSBFI_REGIONS;
const ADSBLOL_BATCH = 10;
const PLACEFILE_REGIONS = { pacific:{title:"PACIFIC AIRCRAFT",test:(a,b)=>a>=24&&a<=50&&b>=-125&&b< -116}, southwest:{title:"SOUTHWEST AIRCRAFT",test:(a,b)=>a>=24&&a<37&&b>=-116&&b< -102}, mountain:{title:"MOUNTAIN AIRCRAFT",test:(a,b)=>a>=37&&a<=50&&b>=-116&&b< -102}, central:{title:"CENTRAL AIRCRAFT",test:(a,b)=>a>=24&&a<=50&&b>=-102&&b< -90}, southeast:{title:"SOUTHEAST AIRCRAFT",test:(a,b)=>a>=24&&a<37&&b>=-90&&b<=-66}, northeast:{title:"NORTHEAST AIRCRAFT",test:(a,b)=>a>=37&&a<=50&&b>=-90&&b<=-66} };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const PLACEFILE_MEMORY_CACHE = new Map();
const PLACEFILE_CACHE_TTL = 20 * 1000;
const PLACEFILE_STALE_TTL = 5 * 60 * 1000;
async function serveCachedPlacefile(key, build) {
 const cached = PLACEFILE_MEMORY_CACHE.get(key);
 const response = (body, mode) => new Response(body, {
  headers: {
   "content-type": "text/plain; charset=utf-8",
   "cache-control": "no-store, max-age=0",
   "x-flighttracker-cache": mode
  }
 });
 if (cached && Date.now() - cached.generatedAt < PLACEFILE_CACHE_TTL)
  return response(cached.body, "memory-hit");
 try {
  const body = await build();
  PLACEFILE_MEMORY_CACHE.set(key, { body, generatedAt: Date.now() });
  if (PLACEFILE_MEMORY_CACHE.size > 8)
   PLACEFILE_MEMORY_CACHE.delete(PLACEFILE_MEMORY_CACHE.keys().next().value);
  return response(body, "generated");
 } catch (error) {
  if (cached && Date.now() - cached.generatedAt < PLACEFILE_STALE_TTL) {
   console.warn("Serving last successful placefile after refresh error:", key, error);
   return response(cached.body, "stale-fallback");
  }
  throw error;
 }
}

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
function classify(a, registry = {}) {
 const typeFields=[
  a.t,a.type,a.icao_type,a.typeCode,a.typeName,a.model,a.model_name,a.icaoType,
  a.type_code,a.type_description,a.description,registry.icao_type_code,
  registry.typeCode,registry.type,registry.typeName,registry.model,registry.model_name
 ].map(clean).filter(Boolean);
 const t=typeFields.join(" ").toUpperCase();
 const desc=[
  a.desc,a.typeDesc,a.category_desc,a.category_description,a.aircraft_desc,
  a.description,a.manufacturer,a.model,registry.type,registry.typeName,
  registry.model,registry.model_name,registry.manufacturer,registry.aircraft_desc,
  registry.description
 ].map(clean).filter(Boolean).join(" ").toUpperCase();
 const operator=[a.ownOp,a.operator,registry.registered_owner].map(clean).filter(Boolean).join(" ").toUpperCase();
 const flight=clean(a.flight).toUpperCase();
 const prefix=(flight.match(/[A-Z]/g)||[]).join("").slice(0,3);
 let flags=0; try { flags=Number.parseInt(String(a.dbFlags||"0"),0)||0; } catch {}
 const rotorWords=/\b(HELI(?:COPTER)?|ROTORCRAFT|ROTOR[- ]?WING|GYROCOPTER|AUTOGYRO|BELL\s*(?:206|407|412|429|505)|ROBINSON\s*R?(?:22|44|66)|EUROCOPTER|AIRBUS\s*HELI|SIKORSKY|AGUSTA(?:WESTLAND)?|LEONARDO\s*HELI|MD\s*HELI|ENSTROM|KAMOV|MIL\s*MI[- ]?\d|HUGHES\s*(?:500|369)|BOEING\s*CH[- ]?47|BLACK\s*HAWK)\b/i;
 const rotorCodes=/(^|\b)(R22|R44|R66|B06T?|B206|B407|B412|B429|B505|EC(20|30|35|45|55|75|120|130|135|145|155|175|225)|AS(32|35|50|55|65|33|36)|H125|H130|H135|H145|H160|H175|H215|H225|H500|H269|H34[0-9A-Z]*|H46[0-9A-Z]*|H47[0-9A-Z]*|H53[0-9A-Z]*|H60[0-9A-Z]*|H64[0-9A-Z]*|S55|S58|S61|S64|S70[0-9A-Z]*|S76|S92|A109|A119|A139|A169|A189|MD5[0-9A-Z]*|MD6[0-9A-Z]*|OH[0-9A-Z]+|UH[0-9A-Z]+|HH[0-9A-Z]+|CH[0-9A-Z]+|MH[0-9A-Z]+|AH[0-9A-Z]+|TH[0-9A-Z]+|BK117|BO105|B105|MBB|K32|KA32)(?=$|\b)/;
 const emitterCategory=clean(a.category||a.emitter_category||a.emitterCategory||a.emitter_category_type||a.aircraft_category).toUpperCase();
 const rotorIdentity=[t,desc,operator,clean(a.flight),clean(a.r),clean(registry.registration)].join(" ").toUpperCase();
 if(rotorWords.test(rotorIdentity)||rotorCodes.test(rotorIdentity)||["A7","A8","ROTORCRAFT","HELICOPTER","GYROCOPTER"].includes(emitterCategory)) return [2,"Helicopter",""];

 const identity=[operator,desc,clean(a.flight),clean(a.r),clean(registry.registration)].join(" ").toUpperCase();
 const government=/\b(UNITED STATES GOVERNMENT|U\.S\. GOVERNMENT|GOVERNMENT|DEPARTMENT OF|FEDERAL|STATE POLICE|HIGHWAY PATROL|SHERIFF|POLICE DEPARTMENT|POLICE|BORDER PATROL|CUSTOMS AND BORDER PROTECTION|CBP|DHS|DEA|FBI|ATF|USFS|FOREST SERVICE|NATIONAL PARK SERVICE|NOAA|NASA|FAA|CAL FIRE|CALIFORNIA HIGHWAY PATROL|TEXAS DPS)\b/;
 if(a.mil||a.military||(flags&1)) return [1,"MILITARY OR GOVERNMENT",branch(a)];
 if(government.test(identity)) return [1,"MILITARY OR GOVERNMENT",operator||"GOVERNMENT"];

 // Match ICAO type designators as individual tokens. Previously the code
 // anchored this expression to the entire concatenated metadata string;
 // a valid code such as C25A was missed whenever any other type/description
 // field was also populated. ADS-B emitter category is not used to infer jets.
 const businessJetCode=/^(?:BE40|BE4T|BD100|BD700|C25[ABC]|C510|C525|C526|C550|C551|C560|C56X|C650|C680|C68A|C700|C750|CL30|CL35|CL60|GLF[234567]|G150|G200|G280|GLEX|FA50|FA7X|FA8X|E35L|E50P|E55P|E545|E550|E75L|LJ2[3458]|LJ3[15]|LJ35|LJ40|LJ45|LJ55|LJ60|LJ70|LJ75|GALX|ASTR|H25A|H25B|H25C|H25D|HA4T|PRM1|F2TH|F900|F2000|F7X|F8X|PC24|SF50|WW24)$/;
 const typeTokens=typeFields.flatMap(value=>value.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean));
 const hasBusinessJetCode=typeTokens.some(code=>businessJetCode.test(code));
 const businessJetWords=/\b(BUSINESS JET|CORPORATE JET|EXECUTIVE JET|CITATION|LEARJET|CHALLENGER|GLOBAL EXPRESS|GLOBAL [0-9]{4}|GULFSTREAM|FALCON [0-9]|PHENOM|LEGACY [0-9]|PRAETOR|HONDAJET|HAWKER|WESTWIND|ASTRA|BEECHJET|PC[- ]?24|VISION JET)\b/;
 if(hasBusinessJetCode||businessJetWords.test(desc+" "+t)) return [1,"Business Jets",""];

 const cargoPrefixes=new Set(["FDX","UPS","GTI","ABX","CKS","PAC","ATN","MML","CLX","BOX","WGN","GTX","RPA"]);
 const cargoWords=/\b(CARGO|FREIGHT|AIR CARGO|LOGISTICS|PARCEL|EXPRESS)\b/;
 if(cargoPrefixes.has(prefix)||cargoWords.test(identity)) return [1,"COMMERCIAL",airline(a)||operator||"CARGO"];

 const passengerAirlinePrefixes=new Set([
  "AAL","UAL","DAL","SWA","JBU","ASA","FFT","NKS","SKW","RPA","ENY","PDT","AAY",
  "KAL","BAW","AFR","DLH","ACA","WJA","AMX","JAL","ANA","QTR","UAE","EVA","THY",
  "SIA","IBE","AUA","KLM","VIR","FLE","ROU","POE","AIC","ANZ","QFA","CCA","CSN",
  "CES","SAS","FIN","LOT","TAP","EZY","RYR","WZZ","ETD","ETI","SAA","ETH"
 ]);
 const knownAirline=Object.values(AIRLINES).some(name=>operator.includes(name.toUpperCase()));
 if(passengerAirlinePrefixes.has(prefix)||knownAirline) return [1,"PASSENGER",airline(a)||operator];

 const commercialWords=/\b(CHARTER|AIR TAXI|AEROMEDICAL|AIR AMBULANCE|COMMUTER AIR|AIR TRANSPORT|AIR SERVICES|FLIGHT SERVICES)\b/;
 if(commercialWords.test(identity)) return [1,"COMMERCIAL",operator||"COMMERCIAL OPERATOR"];
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
 let sourceRecordCount=0;
 for(const item of registryRows){try{registry.set(clean(item.hex).toLowerCase(),JSON.parse(item.payload));}catch{}}
 for(const row of rows) {
  if(now-Number(row.updated_at)>SNAPSHOT_TTL) continue;
  let list; try { list=JSON.parse(row.payload); } catch { continue; }
  for(const a of list) {
   const hx=clean(a.hex).toLowerCase();
   if(!hx||a.lat==null||a.lon==null) continue;
   // Filter to the requested regional bounds before de-duplication and
   // aircraft classification. This keeps high-traffic regions from doing
   // unnecessary work on the entire nationwide cache in a single request.
   const aircraftLat=Number(a.lat), aircraftLon=Number(a.lon);
   if(!Number.isFinite(aircraftLat)||!Number.isFinite(aircraftLon)) continue;
   if(region && !region.test(aircraftLat,aircraftLon)) continue;
   sourceRecordCount++;
   // Provider snapshots are already current; avoid an unreliable second age filter.
   const seenRaw = a.seen_pos ?? a.seen;
   const seen = seenRaw == null || seenRaw === "" ? NaN : Number(seenRaw);
   const observed = Number.isFinite(seen) && seen >= 0 && seen < 3600
    ? now - seen * 1000
    : Number(row.updated_at);
   const score = obj => Object.values(obj || {}).filter(v => v !== null && v !== undefined && v !== "").length;
   const old=aircraft.get(hx);
   if(!old || observed>old.observed || (observed===old.observed && score(a)>score(old.a)))
    aircraft.set(hx,{a,observed,feed:row.feed||"unknown"});
  }
 }
 const stamp=new Date(now).toISOString().replace("T"," ").replace(/\.\d{3}Z$/," UTC");
 const adsbfi = source === "adsb.fi";
 const sourceLines=source==="multi"?["; Flight data: FlyItalyADSB (flyitalyadsb.com)","; Flight data: ADSB.lol (adsb.lol)"]:source==="adsblol"?["; Flight data: ADSB.lol (adsb.lol)"]:source==="flyitaly"?["; Flight data: FlyItalyADSB (flyitalyadsb.com)"]: [adsbfi ? "; Flight data: adsb.fi; https://adsb.fi/" : "; Flight data: FlyItalyADSB (flyitalyadsb.com), CC BY-SA 4.0"];
 const lines=[...sourceLines,
 region ? "Title: " + region.title : (adsbfi ? "Title: US FLIGHT TRACKER - ADSB.FI TEST" : "Title: US FLIGHT TRACKER - FLYITALYADSB"),"Refresh: 1","Color: 235 235 235",'Font: 1, 10, 1, "Arial"',
 `IconFile: 1, 64, 64, 64, 64, "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/assets/aircraft-gray.png?v=5"`,
 `IconFile: 2, 96, 96, 48, 48, "${ICON_HELICOPTER}"`,
 `IconFile: 3, 64, 64, 64, 64, "${ICON_PASSENGER}"`,
 `IconFile: 4, 64, 64, 64, 64, "${ICON_COMMERCIAL}"`,
 `IconFile: 5, 64, 64, 64, 64, "${ICON_MILITARY}"`,
 `IconFile: 6, 64, 64, 64, 64, "${ICON_GENERAL}"`,
 `IconFile: 7, 64, 64, 64, 64, "${ICON_BUSINESS}"`, `; Updated: ${stamp}`,
 `; Active aircraft cached across full U.S. coverage grid: ${aircraft.size}`,
 `; API quota used this month: ${usage.used||"unknown"} / ${usage.limit||"unknown"}`];
 let helicopterCount=0, businessJetCount=0, generalAviationCount=0, passengerCount=0, commercialCount=0, militaryCount=0;
 const sourceCounts={"FlyItalyADSB":0,"ADSB.lol":0};
 for(const [hx,item] of aircraft) {
  const a=item.a, lat=Number(a.lat),lon=Number(a.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)) continue;
  if(region && !region.test(lat,lon)) continue;
  if(sourceCounts[item.feed]!==undefined) sourceCounts[item.feed]++;
  const reg=registry.get(hx)||{}, [icon,kind,org]=classify(a,reg), ident=clean(a.flight)||clean(a.r)||clean(reg.registration)||hx;
  if(kind==="Helicopter") helicopterCount++;
  else if(kind==="Business Jets") businessJetCount++;
  else if(kind==="GENERAL AVIATION") generalAviationCount++;
  else if(kind==="PASSENGER") passengerCount++;
  else if(kind==="COMMERCIAL") commercialCount++;
  else if(kind==="MILITARY OR GOVERNMENT") militaryCount++;
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
 lines.push(`; Unique aircraft: ${aircraft.size}`,`; Helicopters rendered: ${helicopterCount}`,`; Business jets rendered: ${businessJetCount}`,`; General aviation rendered: ${generalAviationCount}`,`; Passenger aircraft rendered: ${passengerCount}`,`; Commercial aircraft rendered: ${commercialCount}`,`; Military/government aircraft rendered: ${militaryCount}`,`; Selected records by source: FlyItalyADSB ${sourceCounts["FlyItalyADSB"]||0}, ADSB.lol ${sourceCounts["ADSB.lol"]||0}`,`; Duplicate source/overlap records removed: ${Math.max(0,sourceRecordCount-aircraft.size)}`);
 return lines.join("\n")+"\n";
}
function regionGridIds(grid, radiusNm, region) {
 const latPad=radiusNm/60+0.5;
 const midLat=(region.minLat+region.maxLat)/2;
 const lonPad=radiusNm/(60*Math.max(0.25,Math.cos(midLat*Math.PI/180)))+0.5;
 const ids=[];
 for(let i=0;i<grid.length;i++){
  const [lat,lon]=grid[i];
  if(lat>=region.minLat-latPad&&lat<=region.maxLat+latPad&&lon>=region.minLon-lonPad&&lon<=region.maxLon+lonPad) ids.push(i);
 }
 return ids;
}
async function selectRegionalRows(db, table, grid, radiusNm, region) {
 const ids=regionGridIds(grid,radiusNm,region);
 if(!ids.length) return [];
 const marks=ids.map(()=>"?").join(",");
 const result=await db.prepare(`SELECT region_id,payload,updated_at FROM ${table} WHERE region_id IN (${marks})`).bind(...ids).all();
 return result.results||[];
}
async function selectRegistryForRows(db, rows) {
 const hexes=new Set();
 for(const row of rows){
  let aircraft=[];try{aircraft=JSON.parse(row.payload)||[];}catch{}
  for(const a of aircraft) if(a.hex) hexes.add(String(a.hex).toLowerCase());
 }
 const ids=[...hexes], found=[];
 for(let i=0;i<ids.length;i+=80){
  const batch=ids.slice(i,i+80), marks=batch.map(()=>"?").join(",");
  const result=await db.prepare(`SELECT hex,payload FROM aircraft_registry WHERE hex IN (${marks})`).bind(...batch).all();
  found.push(...(result.results||[]));
 }
 return found;
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
   headers: { "Accept": "application/json", "User-Agent": "USFlightTrackerPlacefile/adsbfi-test" }
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
 const touched = new Set();
 for (let i = 0; i < success; i++) {
  const [lat, lon] = ADSBFI_REGIONS[(start + i) % ADSBFI_REGIONS.length];
  const name = lon < -116 ? "pacific" : lon < -102 ? (lat < 37 ? "southwest" : "mountain") : lon < -90 ? "central" : (lat < 37 ? "southeast" : "northeast");
  touched.add(name);
 }
 for (const name of touched) {
  stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(`adsbfi_last_success_${name}`,String(now)));
 }
 stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('adsbfi_next_region',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(next)));
 stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('adsbfi_last_success',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(now)));
 stmts.push(env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES('adsbfi_last_batch_count',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(success)));
 await env.DB.batch(stmts);
}
async function collectAdsbLol(env) {
 const state=await env.DB.prepare("SELECT value FROM tracker_state WHERE key='adsblol_next_region'").first();
 const start=Number(state?.value||0)%ADSBLOL_REGIONS.length, stmts=[], failures=[];
 let success=0,attempted=0;
 for(let i=0;i<ADSBLOL_BATCH;i++) {
  const regionId=(start+i)%ADSBLOL_REGIONS.length;
  const [lat,lon]=ADSBLOL_REGIONS[regionId];
  if(i>0) await sleep(1100);
  attempted++;
  try {
   const res=await fetch(`${ADSBLOL_API}/${lat}/${lon}/250`,{
    headers:{"Accept":"application/json","User-Agent":"USFlightTrackerPlacefile/5.0 (+https://github.com/mookiemoo1103/flighttracker)"},
    signal:AbortSignal.timeout(12000)
   });
   if(!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${(await res.text()).slice(0,180)}`);
   const data=await res.json();
   if(!Array.isArray(data.ac)) throw new Error("response missing aircraft array");
   stmts.push(env.DB.prepare("INSERT INTO adsblol_region_data(region_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(region_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at")
    .bind(regionId,JSON.stringify(data.ac),Date.now()));
   success++;
  } catch(error) {
   failures.push(`region ${regionId} (${lat},${lon}): ${String(error?.message||error).slice(0,200)}`);
   console.error("ADSB.lol region collection failed:",regionId,error);
   if(String(error).includes("HTTP 429")) break;
  }
 }
 const next=(start+attempted)%ADSBLOL_REGIONS.length, now=Date.now();
 const upsert=(key,value)=>env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,String(value));
 stmts.push(upsert("adsblol_next_region",next));
 stmts.push(upsert("adsblol_last_attempt",now));
 stmts.push(upsert("adsblol_last_batch_count",success));
 stmts.push(upsert("adsblol_last_batch_failed",failures.length));
 stmts.push(upsert("adsblol_last_error",failures.slice(0,5).join(" | ")));
 if(success>0) stmts.push(upsert("adsblol_last_success",now));
 await env.DB.batch(stmts);
 if(failures.length) console.warn(`ADSB.lol partial batch: ${success}/${attempted} succeeded; ${failures.length} failed`);
 if(success===0) throw new Error("ADSB.lol batch returned no successful regions: "+failures.slice(0,3).join(" | "));
}
async function collectRegistry(env) {
 const now=Date.now(), cacheCutoff=now-30*24*60*60*1000;
 const [{results:flyRows=[]},{results:lolRows=[]},{results:cachedRows=[]}] = await Promise.all([
  env.DB.prepare("SELECT payload,updated_at FROM region_data").all(),
  env.DB.prepare("SELECT payload,updated_at FROM adsblol_region_data").all(),
  env.DB.prepare("SELECT hex,updated_at FROM aircraft_registry WHERE updated_at>?").bind(cacheCutoff).all()
 ]);
 const cached=new Set(cachedRows.map(row=>clean(row.hex).toLowerCase()));
 const candidates=new Map();
 for(const row of [...flyRows,...lolRows]) {
  if(now-Number(row.updated_at)>SNAPSHOT_TTL) continue;
  let list=[]; try { list=JSON.parse(row.payload); } catch { continue; }
  for(const a of list) {
   const hex=clean(a.hex).toLowerCase();
   if(!/^[0-9a-f]{6}$/.test(hex)||cached.has(hex)||candidates.has(hex)) continue;
   // The ADS-B "type" field is a reception/source type (adsb_icao, mlat, etc.),
   // while "t" is only a short ICAO designator. Enrich aircraft that lack a
   // descriptive model/manufacturer/owner so uncommon business-jet codes can
   // be recognized even when a short type code is present.
   const hasDescriptiveType=[a.typeName,a.model,a.model_name,a.desc,a.description]
    .some(value=>clean(value)!=="");
   if(!hasDescriptiveType) candidates.set(hex,a);
  }
 }
 const selected=[...candidates.keys()].slice(0,20), stmts=[], failures=[];
 let success=0,notFound=0;
 for(let i=0;i<selected.length;i++) {
  const hex=selected[i];
  if(i>0) await sleep(250);
  try {
   const res=await fetch(`https://hexdb.io/api/v2/aircraft/${hex}`,{
    headers:{"Accept":"application/json","User-Agent":"USFlightTrackerPlacefile/5.1 (+https://github.com/mookiemoo1103/flighttracker)"},
    signal:AbortSignal.timeout(8000)
   });
   if(res.status===404) {
    stmts.push(env.DB.prepare("INSERT INTO aircraft_registry(hex,registration,manufacturer,type,icao_type_code,registered_owner,payload,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(hex) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at")
     .bind(hex,null,null,null,null,null,JSON.stringify({not_found:true}),now));
    notFound++;
    continue;
   }
   if(!res.ok) throw new Error(`HexDB HTTP ${res.status}: ${(await res.text()).slice(0,160)}`);
   const data=await res.json();
   const record={
    hex:clean(data.hex||hex).toLowerCase(),
    registration:data.registration||null,
    manufacturer:data.manufacturer||null,
    type:data.type||null,
    icao_type_code:data.icao_type_code||null,
    registered_owner:data.registered_owner||null,
    typeName:data.type||null,
    model:data.type||null,
    model_name:data.type||null,
    typeCode:data.icao_type_code||null,
    operator_flag_code:data.operator_flag_code||null
   };
   stmts.push(env.DB.prepare("INSERT INTO aircraft_registry(hex,registration,manufacturer,type,icao_type_code,registered_owner,payload,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(hex) DO UPDATE SET registration=excluded.registration,manufacturer=excluded.manufacturer,type=excluded.type,icao_type_code=excluded.icao_type_code,registered_owner=excluded.registered_owner,payload=excluded.payload,updated_at=excluded.updated_at")
    .bind(hex,record.registration,record.manufacturer,record.type,record.icao_type_code,record.registered_owner,JSON.stringify(record),now));
   success++;
  } catch(error) {
   failures.push(`${hex}: ${String(error?.message||error).slice(0,160)}`);
   console.warn("Aircraft registry lookup failed:",hex,error);
   if(String(error).includes("HTTP 429")) break;
  }
 }
 const upsert=(key,value)=>env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,String(value));
 stmts.push(upsert("registry_last_attempt",now));
 stmts.push(upsert("registry_last_batch_count",success));
 stmts.push(upsert("registry_last_not_found",notFound));
 stmts.push(upsert("registry_last_batch_failed",failures.length));
 stmts.push(upsert("registry_last_error",failures.slice(0,5).join(" | ")));
 if(success+notFound>0) stmts.push(upsert("registry_last_success",now));
 if(stmts.length) await env.DB.batch(stmts);
 if(failures.length) console.warn(`Aircraft registry partial batch: ${success} enriched, ${notFound} not found, ${failures.length} failed`);
}
async function collect(env) {
 if(!env.FLYITALYADSB_API_KEY) throw new Error("Missing FLYITALYADSB_API_KEY Worker secret");
 const state=await env.DB.prepare("SELECT value FROM tracker_state WHERE key='next_region'").first();
 const start=Number(state?.value||0)%REGIONS.length, stmts=[];
 let used="unknown",limit="unknown",success=0;
 const failures=[];
 for(let i=0;i<BATCH;i++) {
  const idx=(start+i)%REGIONS.length,[lat,lon,radius]=REGIONS[idx];
  const url=`${API}/${lat}/lon/${lon}/dist/${radius}`;
  try {
   const res=await fetch(url,{headers:{"X-Api-Key":env.FLYITALYADSB_API_KEY,"Accept":"application/json","User-Agent":"USFlightTrackerPlacefile/4.0"}});
   if(!res.ok) throw new Error(`HTTP ${res.status}`);
   used=res.headers.get("X-FIA-Used-Month")||used;
   limit=res.headers.get("X-FIA-Quota-Month")||limit;
   const data=await res.json();
   if(!Array.isArray(data.ac)) throw new Error("response missing aircraft array");
   stmts.push(env.DB.prepare("INSERT INTO region_data(region_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(region_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at")
    .bind(idx,JSON.stringify(data.ac),Date.now()));
   success++;
  } catch(error) {
   failures.push(`region ${idx}: ${String(error?.message||error).slice(0,180)}`);
   console.error("FlyItalyADSB region collection failed:",idx,error);
  }
 }
 const next=(start+BATCH)%REGIONS.length, now=Date.now();
 const stateUpsert=(key,value)=>env.DB.prepare("INSERT INTO tracker_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,String(value));
 stmts.push(stateUpsert("next_region",next));
 stmts.push(stateUpsert("quota_used",used));
 stmts.push(stateUpsert("quota_limit",limit));
 stmts.push(stateUpsert("last_batch_count",success));
 stmts.push(stateUpsert("last_batch_failed",failures.length));
 stmts.push(stateUpsert("last_error",failures.slice(0,5).join(" | ")));
 if(success>0) stmts.push(stateUpsert("last_success",now));
 await env.DB.batch(stmts);
 if(failures.length) console.warn(`FlyItalyADSB partial batch: ${success}/${BATCH} succeeded; ${failures.length} failed`);
}
export default {
 async scheduled(controller,env,ctx) {
  // Keep the three collectors below Cloudflare's per-invocation subrequest
  // ceiling. Live feeds run on four out of every five minutes; the separate
  // registry minute performs its own bounded HexDB batch without competing
  // with either live feed.
  const minute = new Date(controller.scheduledTime).getUTCMinutes();
  if (minute % 5 === 0) {
   ctx.waitUntil(collectRegistry(env).catch(error => console.error("Aircraft registry enrichment failed:", error)));
   return;
  }
  ctx.waitUntil(Promise.allSettled([
   collect(env).catch(error => console.error("FlyItalyADSB collection failed:", error)),
   collectAdsbLol(env).catch(error => console.error("ADSB.lol collection failed:", error))
  ]));
 },
 async fetch(request,env) {
  const url=new URL(request.url);
  if (url.pathname === "/traffic.txt") return handleTrafficRequest(request, env);
  if(url.pathname==="/health") {
   const state=await env.DB.prepare("SELECT key,value FROM tracker_state WHERE key IN ('next_region','last_success','quota_used','quota_limit','last_batch_count','last_batch_failed','last_error','adsblol_last_success','adsblol_last_batch_count','adsblol_last_batch_failed','adsblol_last_error','registry_last_success','registry_last_batch_count','registry_last_not_found','registry_last_batch_failed','registry_last_error')").all();
   return Response.json({ok:true,total_regions:REGIONS.length,regions_per_minute:BATCH,approximate_full_sweep_minutes:Math.ceil(REGIONS.length/BATCH),state:state.results||[]});
  }
  if(url.pathname==="/registry-health") {
   const [{results:states=[]},{results:counts=[]}] = await Promise.all([
    env.DB.prepare("SELECT key,value FROM tracker_state WHERE key LIKE 'registry_%'").all(),
    env.DB.prepare("SELECT COUNT(*) AS cached, SUM(CASE WHEN icao_type_code IS NOT NULL AND icao_type_code!='' THEN 1 ELSE 0 END) AS with_type FROM aircraft_registry").all()
   ]);
   const state=Object.fromEntries(states.map(x=>[x.key,x.value]));
   const totals=counts[0]||{};
   return Response.json({
    source:"HexDB aircraft registry",
    cached_aircraft:Number(totals.cached||0),
    cached_with_icao_type:Number(totals.with_type||0),
    last_attempt:state.registry_last_attempt||"0",
    last_success:state.registry_last_success||"0",
    last_batch_enriched:Number(state.registry_last_batch_count||0),
    last_batch_not_found:Number(state.registry_last_not_found||0),
    last_batch_failed:Number(state.registry_last_batch_failed||0),
    last_error:state.registry_last_error||""
   });
  }
  if(url.pathname==="/adsblol-health") {
   const [{results:rows=[]},{results:states=[]}] = await Promise.all([
    env.DB.prepare("SELECT region_id,updated_at,payload FROM adsblol_region_data ORDER BY region_id").all(),
    env.DB.prepare("SELECT key,value FROM tracker_state WHERE key LIKE 'adsblol_%'").all()
   ]);
   const state=Object.fromEntries(states.map(x=>[x.key,x.value]));
   return Response.json({
    ok:Number(state.adsblol_last_batch_count||0)>0,
    source:"ADSB.lol",
    total_regions:ADSBLOL_REGIONS.length,
    regions_cached:rows.length,
    last_attempt:state.adsblol_last_attempt||"0",
    last_success:state.adsblol_last_success||"0",
    last_batch_count:Number(state.adsblol_last_batch_count||0),
    last_batch_failed:Number(state.adsblol_last_batch_failed||0),
    last_error:state.adsblol_last_error||"",
    regions:rows.map(row=>({region_id:row.region_id,aircraft_count:(()=>{try{return JSON.parse(row.payload).length}catch{return 0}})(),updated_at:row.updated_at,age_seconds:Math.max(0,Math.round((Date.now()-Number(row.updated_at))/1000))}))
   });
  }
  if (url.pathname === "/adsbfi-health") {
   return Response.json({ok:false,enabled:false,source:"adsb.fi",reason:"Disabled for live placefiles; provider requests from this Worker were returning HTTP 403. Live maps use FlyItalyADSB."});
  }
  const regionalPath = url.pathname.split("/")[1].replace(".txt","");
  if (PLACEFILE_REGIONS[regionalPath]) {
   const region = PLACEFILE_REGIONS[regionalPath];
   return serveCachedPlacefile(url.pathname, async () => {
   const [flyRows,lolRows,statesResult] = await Promise.all([
    selectRegionalRows(env.DB,"region_data",REGIONS,500,region),
    selectRegionalRows(env.DB,"adsblol_region_data",ADSBLOL_REGIONS,250,region),
    env.DB.prepare("SELECT key,value FROM tracker_state WHERE key IN ('quota_used','quota_limit','last_success','adsblol_last_success','adsblol_last_error')").all()
   ]);
   const states=statesResult.results||[];
   const rows=[...flyRows.map(row=>({...row,feed:"FlyItalyADSB"})),...lolRows.map(row=>({...row,feed:"ADSB.lol"}))];
   let registryRows = [];
   try {
    registryRows=await selectRegistryForRows(env.DB,rows);
   } catch (error) {
    console.log("Regional aircraft registry lookup unavailable; using live ADS-B type data:",String(error));
   }
   const stateMap = Object.fromEntries(states.map(x=>[x.key,x.value]));
   const usage = {used:stateMap.quota_used||"unknown",limit:stateMap.quota_limit||"unknown"};
   const lastSuccess = Number(stateMap.last_success||0);
   const body = render(rows,usage,"multi",region,registryRows).replace(
    "; Updated:",
    "; FlyItalyADSB last success: " + (lastSuccess ? new Date(lastSuccess).toISOString() : "not yet") +
    "\\n; ADSB.lol last success: " + (stateMap.adsblol_last_success ? new Date(Number(stateMap.adsblol_last_success)).toISOString() : "not yet") +
    "\\n; ADSB.lol last error: " + (stateMap.adsblol_last_error||"none") + "\\n; Updated:"
   );
   return body;
   });
  }
  if (url.pathname === "/adsblol-test.txt" || url.pathname === "/flyitaly-test.txt") {
   const useLol=url.pathname==="/adsblol-test.txt";
   const [{results:rows=[]},{results:registryRows=[]}] = await Promise.all([
    env.DB.prepare(useLol?"SELECT region_id,payload,updated_at FROM adsblol_region_data":"SELECT region_id,payload,updated_at FROM region_data").all(),
    env.DB.prepare("SELECT hex,payload FROM aircraft_registry").all().catch(()=>({results:[]}))
   ]);
   const tagged=rows.map(row=>({...row,feed:useLol?"ADSB.lol":"FlyItalyADSB"}));
   const body=render(tagged,{used:useLol?"public":"API key",limit:"source-only"},useLol?"adsblol":"flyitaly",null,registryRows);
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
  return serveCachedPlacefile(url.pathname, async () => {
  const [{results:flyRows=[]},{results:lolRows=[]},{results:states=[]},{results:registryRows=[]}]=await Promise.all([
   env.DB.prepare("SELECT region_id,payload,updated_at FROM region_data").all(),
   env.DB.prepare("SELECT region_id,payload,updated_at FROM adsblol_region_data").all(),
   env.DB.prepare("SELECT key,value FROM tracker_state").all(),
   env.DB.prepare("SELECT hex,payload FROM aircraft_registry").all().catch(()=>({results:[]}))
  ]);
  const stateMap=Object.fromEntries(states.map(x=>[x.key,x.value]));
  const rows=[...flyRows.map(row=>({...row,feed:"FlyItalyADSB"})),...lolRows.map(row=>({...row,feed:"ADSB.lol"}))];
  const usage={used:stateMap.quota_used||"unknown",limit:stateMap.quota_limit||"unknown"};
  const body=render(rows,usage,"multi",null,registryRows).replace(
   "; Updated:",
   "; FlyItalyADSB latest snapshot: "+(flyRows.length?new Date(Math.max(...flyRows.map(x=>Number(x.updated_at)||0))).toISOString():"not yet")+
   "\\n; ADSB.lol latest snapshot: "+(lolRows.length?new Date(Math.max(...lolRows.map(x=>Number(x.updated_at)||0))).toISOString():"not yet")+
   "\\n; ADSB.lol last error: "+(stateMap.adsblol_last_error||"none")+"\\n; Updated:"
  );
  return body;
  });
 }
};
