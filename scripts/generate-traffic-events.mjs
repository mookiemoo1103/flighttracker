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
  "EventClosureStartDateUTC","EventClosureEndDateUTC","EventName","FromCrossStreet"
].join(",");
const lineFields = [
  "EventID","EventUID","RoadName","TravelDirection","EventType","EventSubType",
  "Severity","EventStatus","Description","ClosureExists","LanesOpen","LanesClosed",
  "LaneStatus","ParishName1","ParishName2","ParishName3","EventStartDateUTC",
  "EventEndDateUTC","EventClosureStartDateUTC","EventClosureEndDateUTC",
  "EventName","FromCrossStreet","ToCrossStreet"
].join(",");

async function queryLayer(layer) {
  const all = [];
  for (let offset = 0; offset < 5000; offset += 1000) {
    const url = new URL(BASE + "/" + layer + "/query");
    url.searchParams.set("where", "1=1");
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
  if (a.ClosureExists === 1 || /closure|closed|road closed/.test(type + " " + sub + " " + desc)) return "closure";
  if (/roadwork|construction|workzone/.test(type) || /construction|road work|work zone|maintenance/.test(sub + " " + desc)) return "construction";
  if (/accident|incident/.test(type) || /crash|collision|disabled vehicle|vehicle fire|debris|hazard/.test(sub + " " + desc)) return "incident";
  return null;
}
function isCurrent(a) {
  const status = String(a.EventStatus ?? "").toLowerCase();
  if (/cancel|complete|closed|expired|inactive|deleted/.test(status)) return false;
  const start = Number(a.EventStartDateUTC || a.EventClosureStartDateUTC || 0);
  const end = Number(a.EventEndDateUTC || a.EventClosureEndDateUTC || 0);
  if (start && start > now + 6 * 60 * 60 * 1000) return false;
  if (end && end < now - 60 * 60 * 1000) return false;
  return true;
}
function centerOf(geometry) {
  if (geometry?.x != null && geometry?.y != null) return [geometry.y, geometry.x];
  const paths = geometry?.paths || [];
  const pts = paths.flat();
  if (!pts.length) return null;
  return [pts.reduce((s,p)=>s+p[1],0)/pts.length, pts.reduce((s,p)=>s+p[0],0)/pts.length];
}
function eventKey(a) {
  return String(a.EventUID || a.EventID || a.OBJECTID || "");
}
function popup(a, kind) {
  const parts = [
    kind === "closure" ? "ROAD CLOSURE" : kind === "construction" ? "CONSTRUCTION / ROADWORK" : "TRAFFIC INCIDENT",
    a.RoadName,
    a.TravelDirection ? a.TravelDirection + "BOUND" : "",
    a.EventSubType,
    a.Description,
    a.ParishName || a.ParishName1 || a.ParishName2 || a.ParishName3,
    a.Severity ? "Severity: " + a.Severity : "",
    a.LanesClosed != null ? "Lanes closed: " + a.LanesClosed : "",
    a.LanesOpen != null ? "Lanes open: " + a.LanesOpen : "",
    a.EventStatus ? "Status: " + a.EventStatus : "",
    a.EventEndDateUTC ? "Expected end: " + new Date(a.EventEndDateUTC).toLocaleString("en-US",{timeZone:"America/Chicago"}) : ""
  ].filter(Boolean);
  return clean(parts.join("\\n"));
}

const [points, lines] = await Promise.all([queryLayer(1), queryLayer(2)]);
const byId = new Map();
for (const [items, source] of [[points,"point"],[lines,"line"]]) {
  for (const feature of items) {
    const a = feature.attributes || {};
    if (!isCurrent(a)) continue;
    const kind = classify(a);
    if (!kind) continue;
    const position = centerOf(feature.geometry);
    if (!position || !Number.isFinite(position[0]) || !Number.isFinite(position[1])) continue;
    const key = eventKey(a);
    const existing = byId.get(key);
    // Prefer the official event point if DOTD publishes both a point and a line.
    if (!existing || source === "point") byId.set(key, { a, kind, position, source });
  }
}
const events = [...byId.values()];
if (!events.length) console.log("DOTD returned no current closure, construction, or incident events.");
await mkdir(OUT, { recursive: true });
const out = [
  "; Louisiana DOTD / 511 traffic events - separate additive layer",
  "; Source: DOTD 511 Road Closures FeatureServer",
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
