import { writeFile, mkdir } from "node:fs/promises";

const BASE = "https://maps.dotd.la.gov/gdw/rest/services/Road_Closures/511_Road_Closures/FeatureServer";
const OUT = "traffic-events";
const ICONS = {
  closure: "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/traffic-events/assets/road-closure.png",
  construction: "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/traffic-events/assets/road-construction.png",
  incident: "https://raw.githubusercontent.com/mookiemoo1103/flighttracker/main/traffic-events/assets/road-incident.png"
};
const clean = v => String(v ?? "").replaceAll('"', "'").replaceAll("\\", "/").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
const pointFields = [
  "EventID","EventUID","RoadName","TravelDirection","EventType","EventSubType",
  "Severity","EventStatus","Description","ClosureExists","LanesOpen","LanesClosed",
  "LaneStatus","ParishName","EventStartDateUTC","EventEndDateUTC",
  "EventClosureStartDateUTC","EventClosureEndDateUTC","EventCreatedOnUTC","EventLastUpdatedUTC","service_last_updated","EventName","FromCrossStreet","ReportAgency","EventSource","OwnerName","RoadClassCodeDesc"
].join(",");
const lineFields = [
  "EventID","EventUID","RoadName","TravelDirection","EventType","EventSubType",
  "Severity","EventStatus","Description","ClosureExists","LanesOpen","LanesClosed",
  "LaneStatus","ParishName1","ParishName2","ParishName3","EventStartDateUTC",
  "EventEndDateUTC","EventClosureStartDateUTC","EventClosureEndDateUTC","EventCreatedOnUTC","EventLastUpdatedUTC","service_last_updated",
  "EventName","FromCrossStreet","ToCrossStreet","ReportAgency","EventSource","OwnerName","RoadClassCodeDesc"
].join(",");

async function query511LAEvents() {
  const key = process.env.LOUISIANA_511_API_KEY;
  if (!key) throw new Error("Missing GitHub Actions secret LOUISIANA_511_API_KEY.");
  const url = new URL("https://511la.org/api/v2/get/event");
  url.searchParams.set("key", key);
  url.searchParams.set("format", "json");
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error("511LA Events API returned HTTP " + res.status);
  const data = await res.json();
  const records = Array.isArray(data) ? data : (data.Events || data.events || data.EventList?.Events || data.EventList?.Event || []);
  if (!Array.isArray(records)) throw new Error("511LA Events API returned an unrecognized response shape.");
  return records.map(a => {
    const seconds = v => {
      const n = Number(v || 0);
      return Number.isFinite(n) && n > 0 ? n * 1000 : 0;
    };
    return {
      EventID: "511LA-" + (a.ID ?? a.Id ?? a.SourceId ?? ""),
      EventUID: "511LA-" + (a.ID ?? a.Id ?? a.SourceId ?? ""),
      RoadName: a.RoadwayName || "",
      TravelDirection: a.DirectionOfTravel || "",
      EventType: a.EventType || "",
      EventSubType: a.EventSubType || "",
      Severity: a.Severity || "",
      EventStatus: "Active",
      Description: a.Description || a.Details || "",
      ClosureExists: a.IsFullClosure === true,
      LanesOpen: "",
      LanesClosed: a.IsFullClosure ? "All" : "",
      LaneStatus: a.LanesAffected || "",
      EventStartDateUTC: seconds(a.StartDate || a.Reported),
      EventEndDateUTC: seconds(a.PlannedEndDate),
      EventLastUpdatedUTC: seconds(a.LastUpdated || a.Reported),
      ParishName: "",
      ReportAgency: a.Organization || "",
      EventSource: "511LA",
      Latitude: Number(a.Latitude),
      Longitude: Number(a.Longitude),
      LatitudeSecondary: Number(a.LatitudeSecondary),
      LongitudeSecondary: Number(a.LongitudeSecondary),
      _source: "511LA"
    };
  });
}

async function queryLayer(layer) {
  const all = [];
  for (let offset = 0; offset < 50000; offset += 1000) {
    const url = new URL(BASE + "/" + layer + "/query");
    url.searchParams.set("where", "1=1");
    url.searchParams.set("orderByFields", "EventLastUpdatedUTC DESC");
    url.searchParams.set("outFields", layer === 1 ? pointFields : lineFields);
    url.searchParams.set("returnGeometry", "true");
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("f", "json");
    url.searchParams.set("resultOffset", String(offset));
    url.searchParams.set("resultRecordCount", "1000");
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error("DOTD layer " + layer + " returned HTTP " + res.status);
    const data = await res.json();
    if (data.error) throw new Error("DOTD layer " + layer + ": " + JSON.stringify(data.error));
    const features = data.features || [];
    all.push(...features);
    if (!data.exceededTransferLimit && features.length < 1000) break;
    if (!features.length) break;
  }
  return all;
}

const now = Date.now();
const normalizeType = a => String(a.EventType ?? "").toLowerCase().replace(/[^a-z]/g, "");
function classify(a) {
  const type = normalizeType(a);
  const sub = String(a.EventSubType ?? "").toLowerCase();
  const desc = String(a.Description ?? "").toLowerCase();
  if (/closure|closed/.test(type) || /closure|closed/.test(sub)) return "closure";
  if (/roadwork|construction|workzone/.test(type) || /construction|road work|work zone|maintenance/.test(sub + " " + desc)) return "construction";
  if (/accident|incident/.test(type) || /crash|collision|disabled vehicle|vehicle fire|debris|hazard/.test(sub + " " + desc)) return "incident";
  return null;
}
function dateMs(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}
function isCurrent(a, kind) {
  const status = String(a.EventStatus ?? "").trim().toLowerCase();
  if (/cancel|complete|closed|expired|inactive|deleted|resolved/.test(status)) return false;
  const start = dateMs(a.EventStartDateUTC || a.EventClosureStartDateUTC);
  const end = dateMs(a.EventEndDateUTC || a.EventClosureEndDateUTC);
  const updated = dateMs(a.EventLastUpdatedUTC || a.service_last_updated || a.EventCreatedOnUTC);
  if (start && start > now + 6 * 60 * 60 * 1000) return false;
  if (end && end < now - 60 * 60 * 1000) return false;

  // Old confirmed records with distant/missing end dates caused stale markers.
  // Require a recent source update; incidents have a tighter freshness window.
  const freshnessMs = kind === "incident" ? 72 * 60 * 60 * 1000 : 14 * 24 * 60 * 60 * 1000;
  if (updated && updated < now - freshnessMs) return false;
  if (!updated && start && start < now - (kind === "incident" ? 72 : 30) * 60 * 60 * 1000) return false;
  if (!updated && !start) return false;
  return true;
}
function centerOf(geometry) {
  if (geometry?.x != null && geometry?.y != null) return [geometry.y, geometry.x];
  const paths = geometry?.paths || [];
  const pts = paths.flat();
  if (!pts.length) return null;
  return [pts.reduce((s,p)=>s+p[1],0)/pts.length, pts.reduce((s,p)=>s+p[0],0)/pts.length];
}
function eventKey(a, kind, position) {
  // DOTD publishes the same event as a point and a roadway line.
  // Prefer a stable event identifier so those representations are not doubled.
  const id = a.EventUID || a.EventID;
  if (id != null && String(id).trim()) return kind + "|" + String(id).trim();
  return [
    kind,
    String(a.RoadName || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
    String(a.EventSubType || a.EventType || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
    position[0].toFixed(3),
    position[1].toFixed(3)
  ].join("|");
}
function popup(a, kind) {
  const direction = ({N:"Northbound",NB:"Northbound",NORTH:"Northbound",S:"Southbound",SB:"Southbound",SOUTH:"Southbound",E:"Eastbound",EB:"Eastbound",EAST:"Eastbound",W:"Westbound",WB:"Westbound",WEST:"Westbound",B:"Both Directions",BOTH:"Both Directions",ALL:"All Directions"})[String(a.TravelDirection || "").toUpperCase()] || a.TravelDirection || "";
  const parts = [
    kind === "closure" ? "ROAD CLOSURE" : kind === "construction" ? "CONSTRUCTION / ROADWORK" : "TRAFFIC INCIDENT",
    a.RoadName,
    direction,
    a.EventSubType,
    a.Description,
    a.ParishName || a.ParishName1 || a.ParishName2 || a.ParishName3,
    a.Severity ? "Severity: " + a.Severity : "",
    a.LanesClosed != null ? "Lanes closed: " + a.LanesClosed : "",
    a.LanesOpen != null ? "Lanes open: " + a.LanesOpen : "",
    a.EventStatus ? "Status: " + a.EventStatus : "",
    dateMs(a.EventEndDateUTC || a.EventClosureEndDateUTC) ? "Expected end: " + new Date(dateMs(a.EventEndDateUTC || a.EventClosureEndDateUTC)).toLocaleString("en-US",{timeZone:"America/Chicago"}) : "",
    a.ReportAgency ? "Reporting agency: " + a.ReportAgency : "",
    a.EventSource ? "Source: " + a.EventSource : ""
  ].filter(Boolean);
  return parts.map(clean).filter(Boolean).join("\\n");
}

const [points, lines, events511] = await Promise.all([queryLayer(1), queryLayer(2), query511LAEvents()]);
const byId = new Map();
for (const [items, source] of [[points,"DOTD point"],[lines,"DOTD line"]]) {
  for (const feature of items) {
    const a = feature.attributes || {};
    const kind = classify(a);
    if (!kind || !isCurrent(a, kind)) continue;
    const position = centerOf(feature.geometry);
    if (!position || !Number.isFinite(position[0]) || !Number.isFinite(position[1])) continue;
    if (position[0] < 28.85 || position[0] > 31.45 || position[1] < -92.2 || position[1] > -88.5) continue;
    const key = eventKey(a, kind, position);
    const existing = byId.get(key);
    if (!existing || source === "DOTD point") byId.set(key, { a, kind, position, source });
  }
}
let accepted511 = 0;
for (const a of events511) {
  const kind = classify(a);
  if (!kind || !isCurrent(a, kind)) continue;
  const position = [a.Latitude, a.Longitude];
  if (!Number.isFinite(position[0]) || !Number.isFinite(position[1])) continue;
  if (position[0] < 28.85 || position[0] > 31.45 || position[1] < -92.2 || position[1] > -88.5) continue;
  const key = eventKey(a, kind, position);
  const existing = byId.get(key);
  // Prefer the 511LA event record where both systems report the same event.
  if (!existing || existing.source !== "511LA") byId.set(key, { a, kind, position, source: "511LA" });
  accepted511++;
}
const events = [...byId.values()];
console.log("511LA events received:", events511.length, "accepted in coverage/freshness window:", accepted511);
if (!events.length) console.log("DOTD returned no current closure, construction, or incident events.");
await mkdir(OUT, { recursive: true });
const out = [
  "; Louisiana DOTD / 511 traffic events - separate additive layer",
  "; Sources: Louisiana 511LA Events API + DOTD 511 Road Closures FeatureServer.",
  "; Freshness: incidents updated within 72 hours; closures/construction within 14 days.",
  "; 511LA API records are included alongside DOTD ArcGIS records.",
  "; Generated independently of the TomTom speed traffic placefile.",
  "; Updated: " + new Date().toISOString(),
  "Title: LOUISIANA ROAD CLOSURES / CONSTRUCTION / INCIDENTS",
  "Refresh: 5",
  'IconFile: 1, 32, 32, 16, 16, "' + ICONS.closure + '"',
  'IconFile: 2, 32, 32, 16, 16, "' + ICONS.construction + '"',
  'IconFile: 3, 32, 32, 16, 16, "' + ICONS.incident + '"'
];
const iconNumber = { closure: 1, construction: 2, incident: 3 };
for (const event of events) {
  const [lat, lon] = event.position;
  out.push("Object: " + lat.toFixed(6) + "," + lon.toFixed(6));
  out.push("Threshold: 999");
  out.push('Icon: 0,0,0,' + iconNumber[event.kind] + ',1,1,"' + popup(event.a,event.kind) + '"');
  out.push("End:");
}
out.push("; Current events displayed: " + events.length);
out.push("; Closures: " + events.filter(e=>e.kind==="closure").length);
out.push("; Construction: " + events.filter(e=>e.kind==="construction").length);
out.push("; Incidents: " + events.filter(e=>e.kind==="incident").length);
await writeFile(OUT + "/traffic-events.txt", out.join("\n") + "\n", "utf8");
console.log("Generated separate DOTD events placefile:", events.length, JSON.stringify({
  closures: events.filter(e=>e.kind==="closure").length,
  construction: events.filter(e=>e.kind==="construction").length,
  incidents: events.filter(e=>e.kind==="incident").length
}));
