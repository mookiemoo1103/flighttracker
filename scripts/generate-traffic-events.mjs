import { writeFile, mkdir } from "node:fs/promises";

const BASE = "https://maps.dotd.la.gov/gdw/rest/services/Road_Closures/511_Road_Closures/FeatureServer";
const OUT = "traffic-events";
const ICONS = {
  closure: "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/traffic-events/assets/road-closure.png",
  construction: "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/traffic-events/assets/road-construction.png",
  incident: "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/traffic-events/assets/road-incident.png"
};
const clean = v => String(v ?? "").replaceAll('"', "'").replaceAll("\\", "/").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
const validPoint = p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
const timestamp = v => {
  if (v == null || v === "") return 0;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
  const parsed = Date.parse(String(v));
  return Number.isFinite(parsed) ? parsed : 0;
};
const dateMs = timestamp;
const eventFields = "*";

async function query511LAEvents() {
  const key = process.env.LOUISIANA_511_API_KEY;
  if (!key) throw new Error("Missing GitHub Actions secret LOUISIANA_511_API_KEY.");
  const url = new URL("https://511la.org/api/v2/get/event");
  url.searchParams.set("key", key);
  url.searchParams.set("format", "json");
  const res = await fetch(url, { headers: { Accept: "application/json", "Cache-Control": "no-cache", Pragma: "no-cache" }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error("511LA Events API returned HTTP " + res.status);
  const data = await res.json();
  const records = Array.isArray(data) ? data : (data.Events || data.events || data.EventList?.Events || data.EventList?.Event || []);
  if (!Array.isArray(records)) throw new Error("511LA Events API returned an unrecognized response shape.");
  return records.map(a => ({
    ...a,
    EventID: a.ID ?? a.Id ?? "",
    EventUID: a.SourceId ?? "",
    RoadName: a.RoadwayName || "",
    TravelDirection: a.DirectionOfTravel || "",
    EventType: a.EventType || "",
    EventSubType: a.EventSubType || "",
    Severity: a.Severity || "",
    EventStatus: a.EventStatus || a.Status || (a.IsActive === false ? "Inactive" : "Active"),
    Description: a.Description || a.Details || "",
    ClosureExists: a.IsFullClosure === true,
    LanesClosed: a.IsFullClosure ? "All" : "",
    LaneStatus: a.LanesAffected || "",
    EventStartDateUTC: timestamp(a.StartDate || a.Reported),
    EventEndDateUTC: timestamp(a.PlannedEndDate || a.EndDate),
    EventLastUpdatedUTC: timestamp(a.LastUpdated || a.Reported),
    Latitude: Number(a.Latitude),
    Longitude: Number(a.Longitude),
    LatitudeSecondary: Number(a.LatitudeSecondary),
    LongitudeSecondary: Number(a.LongitudeSecondary),
    _source: "511LA"
  }));
}

async function queryLayer(layer) {
  const all = [];
  // Exclude only records explicitly marked inactive/resolved/cancelled.
  // Old edit timestamps do not expire live events.
  const where = "1=1";
  for (let offset = 0; offset < 50000; offset += 1000) {
    const url = new URL(BASE + "/" + layer + "/query");
    url.searchParams.set("where", where);
    url.searchParams.set("orderByFields", "EventLastUpdatedUTC DESC");
    url.searchParams.set("outFields", eventFields);
    url.searchParams.set("returnGeometry", "true");
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("f", "json");
    url.searchParams.set("resultOffset", String(offset));
    url.searchParams.set("resultRecordCount", "1000");
    let data;
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, {headers:{"Cache-Control":"no-cache",Pragma:"no-cache"},signal:AbortSignal.timeout(60000)});
        if (!res.ok) throw new Error("DOTD layer " + layer + " returned HTTP " + res.status);
        data = await res.json();
        if (data.error) throw new Error("DOTD layer " + layer + ": " + JSON.stringify(data.error));
        break;
      } catch (error) {
        lastError = error;
        if (attempt === 3) throw lastError;
        await new Promise(resolve=>setTimeout(resolve,attempt*1500));
      }
    }
    const features=data.features||[];
    all.push(...features);
    if(!data.exceededTransferLimit && features.length<1000) break;
    if(!features.length) break;
  }
  return all;
}

function normalizeType(a) {
  return String(a.EventType ?? "").toLowerCase().replace(/[^a-z]/g, "");
}
function classify(a) {
  const type=normalizeType(a);
  const sub=String(a.EventSubType??"").toLowerCase().replace(/[^a-z]/g,"");
  const desc=String(a.Description??"").toLowerCase();
  const combined=type+sub;
  // Keep weather reports separate from ordinary incidents and closures.
  if(/weather/.test(type)||/weather|flood|fog|ice|snow|wind|visibility|water|smoke/.test(combined)) {
    return /closure|closed/.test(combined) ? "weather_closure" : "weather_incident";
  }
  if(/specialevent/.test(type)||/specialevent|parade|sportingevent|festival/.test(combined)) return "special";
  if(/roadwork|construction|workzone/.test(type)||/roadwork|construction|workzone|maintenance|utilitywork/.test(sub)) {
    if(/workerspresent|workerpresent|workersonsite/.test(sub)) return "workers";
    return "construction";
  }
  if(/closure/.test(type)||/closure|closed/.test(sub)) return "closure";
  if(/accident|incident|crash|disabledvehicle|hazard/.test(combined)) return "incident";
  // Preserve provider-specific/new event types instead of silently dropping them.
  if(type||sub) return "other";
  if(/flood|fog|ice|snow|wind|weather|water over road/.test(desc)) return "weather_incident";
  if(/parade|festival|special event|sporting event/.test(desc)) return "special";
  if(/crash|collision|accident|disabled vehicle|vehicle fire|debris|hazard|stalled vehicle|overturned/.test(desc)) return "incident";
  if(/closure|closed/.test(desc)) return "closure";
  if(/construction|road work|work zone|maintenance|utility work/.test(desc)) return "construction";
  return null;
}
function isCurrent(a) {
  const status = String(a.EventStatus ?? a.EventStatusText ?? "").trim().toLowerCase();
  if (/cancel|complete|closed|expired|inactive|deleted|resolved|archived/.test(status)) return false;
  const start = dateMs(a.EventStartDateUTC || a.EventClosureStartDateUTC || a.StartDate || a.Reported);
  const end = dateMs(a.EventEndDateUTC || a.EventClosureEndDateUTC || a.PlannedEndDate || a.EndDate);
  // LastUpdated is a content-edit timestamp, not an active/inactive flag.
  // Do not expire an otherwise active event just because it has not changed.
  if (start && start > Date.now() + 6 * 60 * 60 * 1000) return false;
  if (end && end < Date.now() - 60 * 1000) return false;
  return true;
}
function decodePolyline(encoded) {
  if (!encoded || typeof encoded !== "string") return [];
  let index = 0, lat = 0, lon = 0;
  const points = [];
  const read = () => {
    let result = 0, shift = 0, byte;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return (result & 1) ? ~(result >> 1) : (result >> 1);
  };
  while (index < encoded.length) {
    const dLat = read();
    const dLon = read();
    if (dLat == null || dLon == null) break;
    lat += dLat;
    lon += dLon;
    const p = [lat / 1e5, lon / 1e5];
    if (validPoint(p)) points.push(p);
  }
  return points;
}
function featurePaths(geometry) {
  if (!geometry) return [];
  if (Array.isArray(geometry.paths)) return geometry.paths.map(path => path.map(([lon,lat]) => [lat,lon]).filter(validPoint)).filter(p => p.length >= 2);
  if (Array.isArray(geometry.rings)) return geometry.rings.map(path => path.map(([lon,lat]) => [lat,lon]).filter(validPoint)).filter(p => p.length >= 2);
  if (geometry.x != null && geometry.y != null) return [[[Number(geometry.y), Number(geometry.x)]]].filter(path => validPoint(path[0]));
  return [];
}
function centerOf(paths, fallback) {
  const all = paths.flat();
  if (all.length) return [all.reduce((s,p)=>s+p[0],0)/all.length, all.reduce((s,p)=>s+p[1],0)/all.length];
  return validPoint(fallback) ? fallback : null;
}
function withinCoverage(p) {
  return validPoint(p) && p[0] >= 28.85 && p[0] <= 31.45 && p[1] >= -92.2 && p[1] <= -88.5;
}
function normalizeKey(v) { return String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function eventKey(a, kind, position, source) {
  const id=a.EventUID||a.SourceId||a.EventID||a.ID||a.OBJECTID||a.ObjectId;
  const identity=normalizeKey(id);
  const family=source==="511LA"?"511LA":"DOTD";
  const signature=[a.RoadName||a.RoadwayName,a.EventSubType||a.EventType,a.Description].map(normalizeKey).join("|");
  if(identity) return family+"|"+identity+"|"+signature;
  return [family,kind,signature,position[0].toFixed(4),position[1].toFixed(4)].join("|");
}
function popup(a, kind) {
  const direction = ({N:"Northbound",NB:"Northbound",NORTH:"Northbound",S:"Southbound",SB:"Southbound",SOUTH:"Southbound",E:"Eastbound",EB:"Eastbound",EAST:"Eastbound",W:"Westbound",WB:"Westbound",WEST:"Westbound",B:"Both Directions",BOTH:"Both Directions",ALL:"All Directions"})[String(a.TravelDirection || a.DirectionOfTravel || "").toUpperCase()] || a.TravelDirection || a.DirectionOfTravel || "";
  const rawType = a.EventSubType || a.EventType || "Traffic event";
  const heading=({closure:"ROAD CLOSURE",construction:"CONSTRUCTION / ROADWORK",workers:"CONSTRUCTION / WORKERS PRESENT",incident:"TRAFFIC INCIDENT",weather_incident:"WEATHER INCIDENT",weather_closure:"WEATHER CLOSURE",special:"SPECIAL EVENT",other:"OTHER 511LA / DOTD EVENT"})[kind]||"TRAFFIC EVENT";
  const start = dateMs(a.EventStartDateUTC || a.EventClosureStartDateUTC || a.StartDate || a.Reported);
  const end = dateMs(a.EventEndDateUTC || a.EventClosureEndDateUTC || a.PlannedEndDate || a.EndDate);
  const lines = [
    heading,
    "Event type: " + rawType,
    a.RoadName || a.RoadwayName ? "Road: " + (a.RoadName || a.RoadwayName) : "",
    direction ? "Direction: " + direction : "",
    a.Description ? "Description: " + a.Description : "",
    a.Details ? "Details: " + a.Details : "",
    a.ParishName || a.ParishName1 || a.ParishName2 || a.ParishName3 ? "Parish: " + (a.ParishName || a.ParishName1 || a.ParishName2 || a.ParishName3) : "",
    a.Severity ? "Severity: " + a.Severity : "",
    a.LanesClosed != null && a.LanesClosed !== "" ? "Lanes closed: " + a.LanesClosed : "",
    a.LanesOpen != null && a.LanesOpen !== "" ? "Lanes open: " + a.LanesOpen : "",
    a.LaneStatus || a.LanesAffected ? "Lane impact: " + (a.LaneStatus || a.LanesAffected) : "",
    a.EventStatus || a.EventStatusText ? "Status: " + (a.EventStatus || a.EventStatusText) : "",
    start ? "Reported/start: " + new Date(start).toLocaleString("en-US",{timeZone:"America/Chicago"}) : "",
    end ? "Expected end: " + new Date(end).toLocaleString("en-US",{timeZone:"America/Chicago"}) : "",
    a.Recurrence ? "Schedule: " + a.Recurrence : "",
    a.RecurrenceSchedules ? "Schedule details: " + a.RecurrenceSchedules : "",
    a.DetourInstructions ? "Detour: " + (Array.isArray(a.DetourInstructions) ? a.DetourInstructions.join("; ") : a.DetourInstructions) : "",
    a.ReportAgency || a.Organization ? "Reporting agency: " + (a.ReportAgency || a.Organization) : "",
    a.EventSource ? "Source: " + a.EventSource : a._source ? "Source: " + a._source : ""
  ].filter(Boolean).map(clean);
  return lines.length ? lines[0] + "\\n\\n" + lines.slice(1).join("\\n\\n") : heading;
}
function makeRecord(a, source, geometryPaths = []) {
  const kind = classify(a);
  if (!kind || !isCurrent(a)) return null;
  const encoded = decodePolyline(a.EncodedPolyline || a.MapEncodedPolyline || "");
  const secondary = [Number(a.LatitudeSecondary), Number(a.LongitudeSecondary)];
  const primary = [Number(a.Latitude ?? a.latitude), Number(a.Longitude ?? a.longitude)];
  const paths = geometryPaths.length ? geometryPaths : encoded.length >= 2 ? [encoded] : validPoint(primary) && validPoint(secondary) && (primary[0] !== secondary[0] || primary[1] !== secondary[1]) ? [[primary, secondary]] : validPoint(primary) ? [[primary]] : validPoint(secondary) ? [[secondary]] : [];
  const position = centerOf(paths, primary);
  if (!position || !withinCoverage(position)) return null;
  const id = a.EventUID || a.SourceId || a.EventID || a.ID || a.OBJECTID || a.ObjectId || null;
  return { a, source, kind, id, position, paths, key: eventKey(a,kind,position,source) };
}
const [centroidFeatures, lineFeatures, events511] = await Promise.all([queryLayer(0), queryLayer(2), query511LAEvents()]);
const pointFeatures = [];
const byId = new Map();
const add = record => {
  if (!record) return;
  const old = byId.get(record.key);
  // Prefer the point feature for its precise map pin, but keep roadway line
  // geometry when that is the only representation available.
  if (!old) { byId.set(record.key,record); return; }
  const mergedPaths=[...old.paths];
  for(const path of record.paths) if(path.length>=2 && !mergedPaths.some(p=>p.length===path.length && p[0]?.[0]===path[0]?.[0] && p[0]?.[1]===path[0]?.[1])) mergedPaths.push(path);
  const preferred=record.paths.some(path=>path.length>=2)?record:old;
  byId.set(record.key,{...preferred,position:old.position||record.position,paths:mergedPaths,source:"DOTD"});
};
for (const [items,source] of [[centroidFeatures,"DOTD centroid"],[pointFeatures,"DOTD point"],[lineFeatures,"DOTD line"]]) {
  for (const feature of items) {
    const a = feature.attributes || {};
    const paths = featurePaths(feature.geometry);
    add(makeRecord(a,source,paths));
  }
}
let accepted511 = 0;
for (const a of events511) {
  const record = makeRecord(a,"511LA");
  if (record) { add(record); accepted511++; }
}
const events = [...byId.values()];
const generatedAt = new Date().toISOString();
const counts=Object.fromEntries(["closure","construction","workers","incident","weather_incident","weather_closure","special","other"].map(kind=>[kind,events.filter(e=>e.kind===kind).length]));
console.log("511LA events received:",events511.length,"accepted:",accepted511);
console.log("DOTD source records:",centroidFeatures.length,"centroid /",pointFeatures.length,"point /",lineFeatures.length,"line; current retained:",events.length);
if (!events.length) throw new Error("No current 511LA/DOTD events were generated; refusing to publish an empty event feed.");
await mkdir(OUT,{recursive:true});
const out = [
  "; Louisiana DOTD / 511 traffic events - separate additive layer",
  "; Sources: official 511LA Events API + DOTD 511 Road Closures FeatureServer point and line layers.",
  "; Source status and planned end dates determine currency. LastUpdated alone is not used as an expiration timer.",
  "; Original event type/subtype, event geometry and source attribution are retained.",
  "; Generated independently of the TomTom speed traffic placefile.",
  "; Updated: " + generatedAt,
  "Title: LOUISIANA ROAD EVENTS - 511LA / DOTD",
  "Refresh: 5",
  'IconFile: 1, 32, 32, 16, 16, "' + ICONS.closure + '"',
  'IconFile: 2, 32, 32, 16, 16, "' + ICONS.construction + '"',
  'IconFile: 3, 32, 32, 16, 16, "' + ICONS.incident + '"'
];
const iconNumber={closure:1,construction:2,workers:2,incident:3,weather_incident:3,weather_closure:1,special:2,other:3};
const lineColor={closure:"220 35 45",construction:"245 145 35",workers:"255 175 45",incident:"150 75 190",weather_incident:"55 145 210",weather_closure:"40 125 205",special:"220 145 45",other:"125 125 145"};
const geoFeatures = [];
for (const event of events) {
  const [lat,lon] = event.position;
  const detail = popup(event.a,event.kind);
  // Keep a themed symbol for quick identification and draw the real roadway
  // geometry where the provider supplies it.
  out.push("Object: " + lat.toFixed(6) + "," + lon.toFixed(6));
  out.push("Threshold: 999");
  out.push('Icon: 0,0,0,' + iconNumber[event.kind] + ',1,1,"' + detail + '"');
  out.push("End:");
  const linePaths = event.paths.filter(path=>path.length>=2);
  for (const path of linePaths) {
    out.push("Color: "+lineColor[event.kind]);
    out.push("Line: " + (event.kind==="closure" ? "4" : "3") + ', 0, "' + clean(event.a.RoadName || event.a.RoadwayName || "Affected roadway") + '"');
    for (const [pLat,pLon] of path) out.push(pLat.toFixed(6) + ", " + pLon.toFixed(6));
    out.push("End:");
  }
  const props = {
    event_type: event.kind,
    source: event.source,
    source_event_type:event.a.EventType||event.a.EventSubType||null,
    event_subtype: event.a.EventSubType || null,
    event_id: event.id == null ? null : String(event.id),
    road: event.a.RoadName || event.a.RoadwayName || null,
    direction: event.a.TravelDirection || event.a.DirectionOfTravel || null,
    description: event.a.Description || null,
    details: event.a.Details || null,
    parish:event.a.ParishName||event.a.ParishNameList||event.a.ParishName1||event.a.ParishName2||event.a.ParishName3||null,
    severity: event.a.Severity || null,
    status: event.a.EventStatus || event.a.EventStatusText || null,
    lanes_closed: event.a.LanesClosed ?? null,
    lanes_open: event.a.LanesOpen ?? null,
    lane_impact: event.a.LaneStatus || event.a.LanesAffected || null,
    reported_at: dateMs(event.a.EventStartDateUTC || event.a.EventClosureStartDateUTC || event.a.StartDate || event.a.Reported) || null,
    updated_at: dateMs(event.a.EventLastUpdatedUTC || event.a.LastUpdated || event.a.service_last_updated) || null,
    expected_end: dateMs(event.a.EventEndDateUTC || event.a.EventClosureEndDateUTC || event.a.PlannedEndDate || event.a.EndDate) || null,
    recurrence: event.a.Recurrence || null,
    recurrence_schedules: event.a.RecurrenceSchedules || null,
    detour_instructions: event.a.DetourInstructions || null,
    reporting_agency: event.a.ReportAgency || event.a.Organization || null
  };
  const geometry = event.paths.some(p=>p.length>=2)
    ? {type:"MultiLineString",coordinates:event.paths.filter(p=>p.length>=2).map(p=>p.map(([pLat,pLon])=>[pLon,pLat]))}
    : {type:"Point",coordinates:[lon,lat]};
  geoFeatures.push({type:"Feature",properties:props,geometry});
}
out.push("; Current events displayed: " + events.length);
out.push("; Closures: " + counts.closure);
out.push("; Construction / roadwork: " + counts.construction);
out.push("; Incidents: "+counts.incident);
out.push("; Construction with workers present: "+counts.workers);
out.push("; Weather incidents: "+counts.weather_incident);
out.push("; Weather closures: "+counts.weather_closure);
out.push("; Special events: "+counts.special);
out.push("; Other official event types: "+counts.other);
const geojson = {
  type:"FeatureCollection",
  name:"Louisiana 511LA / DOTD Traffic Events",
  metadata:{generatedAt,sources:["511LA Events API","Louisiana DOTD 511 Road Closures FeatureServer"],eventCount:geoFeatures.length,counts},
  features:geoFeatures
};
if (out.filter(line=>line.startsWith("Object:")).length!==geoFeatures.length) throw new Error("Placefile/GeoJSON event count mismatch.");
if (geoFeatures.some(f=>!f.geometry || !f.properties.source || !f.properties.source_event_type)) throw new Error("Event output is missing source attribution, original type, or geometry.");
await writeFile(OUT + "/traffic-events.txt",out.join("\n")+"\n","utf8");
await writeFile(OUT + "/traffic-events.geojson",JSON.stringify(geojson),"utf8");
console.log("Generated separate 511LA/DOTD event outputs:",geoFeatures.length,JSON.stringify(counts));
