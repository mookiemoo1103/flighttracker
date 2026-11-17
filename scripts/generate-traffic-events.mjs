import { writeFile, mkdir } from "node:fs/promises";

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
    EventStatus: a.EventStatus || a.Status || (a.IsActive === false ? "Inactive" : a.IsActive === true ? "Active" : ""),
    ClosureExists: a.IsFullClosure === true || a.ClosureExists === 1 || a.ClosureExists === true,
    Description: a.Description || a.Details || "",
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

function normalizeType(a) {
  return String(a.EventType ?? "").toLowerCase().replace(/[^a-z]/g, "");
}
function classify(a) {
  const type=normalizeType(a);
  const sub=String(a.EventSubType??"").toLowerCase().replace(/[^a-z]/g,"");
  const desc=String(a.Description??a.Details??"").toLowerCase();
  const combined=type+sub;

  // The API's event type/subtype describe the event itself. Never infer a
  // road closure solely from IsFullClosure: crashes can block all lanes too.
  if(type==="accidentsandincidents" ||
     /crash|collision|accident|stalledvehicle|disabledvehicle|vehiclefire|debris|hazard|overturned|incident/.test(sub) ||
     /crash|collision|accident|stalled vehicle|disabled vehicle|vehicle fire|debris|hazard|overturned/.test(desc)) return "incident";

  if(type==="weatherconditions" || /weather|flood|fog|ice|snow|wind|visibility|water|smoke/.test(combined) ||
     /flood|fog|ice|snow|wind|weather|water over road|smoke/.test(desc)) {
    if(/closure|closed/.test(sub) || /road closed|bridge closed|all lanes closed/.test(desc)) return "weather_closure";
    return "weather_incident";
  }

  if(/specialevent|parade|sportingevent|festival/.test(combined) ||
     /parade|festival|special event|sporting event/.test(desc)) return "special";

  if(type==="closures" || /closure|closed/.test(type+sub) ||
     /road closed|bridge closed|all lanes closed|floodgate closure/.test(desc)) return "closure";

  if(/workerspresent|workerpresent|workersonsite/.test(sub) ||
     /workers present|workers on site/.test(desc)) return "workers";

  if(type==="roadwork" || /roadwork|construction|workzone|maintenance|utilitywork|roadmarking|paving/.test(type+sub) ||
     /construction|road work|work zone|maintenance|utility work|road marking|paving/.test(desc)) return "construction";

  // Do not guess an icon for an event subtype we do not recognize.
  // Skipping unknown types is safer than showing a misleading symbol.
  return null;
}
function localClock(now) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone:"America/Chicago", weekday:"long", hour:"2-digit",
    minute:"2-digit", second:"2-digit", hourCycle:"h23",
    year:"numeric", month:"2-digit", day:"2-digit"
  }).formatToParts(now);
  return Object.fromEntries(parts.map(p=>[p.type,p.value]));
}
function scheduleDateKey(value) {
  if (!value) return 0;
  const m = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return 0;
  return Number(m[3])*10000 + Number(m[1])*100 + Number(m[2]);
}
function scheduleSeconds(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return Number(m[1])*3600 + Number(m[2])*60 + Number(m[3]||0);
}
function isScheduleActive(schedules, now) {
  if (!Array.isArray(schedules) || !schedules.length) return true;
  const clock = localClock(now);
  const today = Number(clock.year)*10000 + Number(clock.month)*100 + Number(clock.day);
  const weekday = clock.weekday;
  const seconds = Number(clock.hour)*3600 + Number(clock.minute)*60 + Number(clock.second);
  return schedules.some(schedule => {
    const startDay = scheduleDateKey(schedule.StartDate);
    const endDay = scheduleDateKey(schedule.EndDate);
    if (startDay && today < startDay) return false;
    if (endDay && today > endDay) return false;
    const days = Array.isArray(schedule.DaysOfWeek) ? schedule.DaysOfWeek : [];
    if (days.length && !days.some(d=>String(d).toLowerCase()===weekday.toLowerCase())) return false;
    const times = Array.isArray(schedule.Times) ? schedule.Times : [];
    if (!times.length) return true;
    return times.some(window => {
      const start = scheduleSeconds(window.StartTime);
      const end = scheduleSeconds(window.EndTime);
      if (start == null || end == null) return false;
      if (end >= start) return seconds >= start && seconds <= end;
      // Overnight window, e.g. 7 PM to 6 AM.
      return seconds >= start || seconds <= end;
    });
  });
}
function isCurrent(a) {
  const now = Date.now();
  const start = dateMs(a.StartDate || a.Reported);
  const end = dateMs(a.PlannedEndDate);
  // The 511LA Events API is the sole source of truth. The record must also
  // be within its actual start/end and recurrence window right now.
  if (start && start > now + 60 * 1000) return false;
  if (end && end < now - 60 * 1000) return false;
  if (!isScheduleActive(a.RecurrenceSchedules, now)) return false;
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
function eventKey(a, kind, position) {
  // Every marker corresponds to one 511LA API event ID. Do not merge separate
  // official events merely because they share a road or nearby coordinates.
  const identity = normalizeKey(a.ID ?? a.Id ?? a.SourceId);
  if (identity && identity !== "0") return "511LA|" + identity;
  const road = normalizeKey(a.RoadwayName);
  const subtype = normalizeKey(a.EventSubType || a.EventType);
  const description = normalizeKey(a.Description || a.Details);
  const start = dateMs(a.StartDate || a.Reported);
  return ["511LA",road,subtype,description,start,position[0].toFixed(5),position[1].toFixed(5)].join("|");
}
function popup(a, kind) {
  const direction = ({N:"Northbound",NB:"Northbound",NORTH:"Northbound",S:"Southbound",SB:"Southbound",SOUTH:"Southbound",E:"Eastbound",EB:"Eastbound",EAST:"Eastbound",W:"Westbound",WB:"Westbound",WEST:"Westbound",B:"Both Directions",BOTH:"Both Directions",ALL:"All Directions"})[String(a.TravelDirection || a.DirectionOfTravel || "").toUpperCase()] || a.TravelDirection || a.DirectionOfTravel || "";
  const rawType = a.EventSubType || a.EventType || "Traffic event";
  const heading=({closure:"ROAD CLOSURE",construction:"CONSTRUCTION / ROADWORK",workers:"CONSTRUCTION / WORKERS PRESENT",incident:"TRAFFIC INCIDENT",weather_incident:"WEATHER INCIDENT",weather_closure:"WEATHER CLOSURE",special:"SPECIAL EVENT",other:"OTHER 511LA EVENT"})[kind]||"TRAFFIC EVENT";
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
  const id = a.ID ?? a.Id ?? a.SourceId ?? null;
  return { a, source:"511LA", kind, id, position, paths, key: eventKey(a,kind,position) };
}
const events511 = await query511LAEvents();
const byId = new Map();
for (const a of events511) {
  const record = makeRecord(a,"511LA");
  if (record) byId.set(record.key,record);
}
const events = [...byId.values()];

const generatedAt = new Date().toISOString();
const counts=Object.fromEntries(["closure","construction","workers","incident","weather_incident","weather_closure","special","other"].map(kind=>[kind,events.filter(e=>e.kind===kind).length]));
console.log("511LA events received:",events511.length,"currently effective and mapped:",events.length);
await mkdir(OUT,{recursive:true});
const out = [
  "; Louisiana 511LA current traffic events - separate additive layer",
  "; Source: Louisiana 511LA Events API only.",
  "; Only events returned by 511LA are considered; future-start and expired events are excluded.",
  "; Icons are assigned from the official EventType and EventSubType fields.",
  "; Generated independently of the TomTom speed traffic placefile.",
  "; Updated: " + generatedAt,
  "Title: LOUISIANA ROAD EVENTS - 511LA",
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
    closure_exists: event.a.ClosureExists ?? event.a.IsFullClosure ?? null,
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
  name:"Louisiana 511LA Current Traffic Events",
  metadata:{generatedAt,sources:["511LA Events API"],eventCount:geoFeatures.length,counts},
  features:geoFeatures
};
if (out.filter(line=>line.startsWith("Object:")).length!==geoFeatures.length) throw new Error("Placefile/GeoJSON event count mismatch.");
if (geoFeatures.some(f=>!f.geometry || !f.properties.source || !f.properties.source_event_type)) throw new Error("Event output is missing source attribution, original type, or geometry.");
await writeFile(OUT + "/traffic-events.txt",out.join("\n")+"\n","utf8");
await writeFile(OUT + "/traffic-events.geojson",JSON.stringify(geojson),"utf8");
console.log("Generated 511LA-only current event outputs:",geoFeatures.length,JSON.stringify(counts));
