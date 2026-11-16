import { writeFile } from "node:fs/promises";
import { decodeTrafficTile } from "../cloudflare/traffic.js";

const API_KEY = process.env.TOMTOM_API_KEY;
if (!API_KEY) throw new Error("TOMTOM_API_KEY repository secret is missing.");

const ZOOM = 10;
// Core Southeast Louisiana and Mississippi Gulf Coast: Baton Rouge/Livingston
// east through Pearl River/Slidell, south to New Orleans and nearby corridors.
const TILES = [];
for (let y = 418; y <= 425; y++) {
  for (let x = 250; x <= 259; x++) TILES.push([x, y]);
}

const clean = value => String(value ?? "")
  .replaceAll('"', "'").replaceAll("\\", "/")
  .replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();

function offsetPath(path, offsetMeters) {
  if (path.length < 2 || offsetMeters === 0) return path;
  const normals = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [lat1, lon1] = path[i], [lat2, lon2] = path[i + 1];
    const meanLat = (lat1 + lat2) / 2 * Math.PI / 180;
    const east = (lon2 - lon1) * 111320 * Math.cos(meanLat);
    const north = (lat2 - lat1) * 111320;
    const length = Math.hypot(east, north) || 1;
    // Right-hand offset relative to the direction the road geometry is drawn.
    normals.push([north / length, -east / length]);
  }
  return path.map(([lat, lon], i) => {
    let eastNormal, northNormal;
    if (i === 0) [eastNormal, northNormal] = normals[0];
    else if (i === path.length - 1) [eastNormal, northNormal] = normals[normals.length - 1];
    else {
      eastNormal = normals[i - 1][0] + normals[i][0];
      northNormal = normals[i - 1][1] + normals[i][1];
      const length = Math.hypot(eastNormal, northNormal) || 1;
      eastNormal /= length;
      northNormal /= length;
    }
    const latOffset = northNormal * offsetMeters / 111320;
    const lonOffset = eastNormal * offsetMeters / (111320 * Math.cos(lat * Math.PI / 180));
    return [lat + latOffset, lon + lonOffset];
  });
}

function statusFor(properties) {
  const relative = Number(properties.traffic_level);
  const closed = properties.road_closure === true || properties.road_closure === 1 || String(properties.road_closure).toLowerCase() === "true";
  if (closed) return { color: [255, 0, 255], label: "CLOSED", className: "magenta" };
  if (!Number.isFinite(relative) || relative < 0.45)
    return { color: [255, 0, 255], label: "STOPPED / VERY SLOW", className: "magenta" };
  if (relative < 0.65) return { color: [255, 128, 0], label: "SLOW", className: "orange" };
  if (relative < 0.85) return { color: [255, 220, 0], label: "MODERATE", className: "yellow" };
  return { color: [0, 220, 0], label: "FAST", className: "green" };
}

async function fetchTile(x, y) {
  const url = new URL(`https://api.tomtom.com/traffic/map/4/tile/flow/relative/${ZOOM}/${x}/${y}.pbf`);
  url.searchParams.set("key", API_KEY);
  url.searchParams.set("roadTypes", "[0,1,2,3,4,5]");
  url.searchParams.set("tags", "[road_type,traffic_level,traffic_road_coverage,left_hand_traffic,road_closure]");
  const response = await fetch(url, {
    headers: { Accept: "application/x-protobuf" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`TomTom tile ${x}/${y} returned HTTP ${response.status}`);
  return decodeTrafficTile(await response.arrayBuffer(), x, y, ZOOM);
}

const results = new Array(TILES.length);
let next = 0;
async function worker() {
  while (true) {
    const index = next++;
    if (index >= TILES.length) return;
    const [x, y] = TILES[index];
    results[index] = await fetchTile(x, y);
    console.log(`Fetched vector tile ${index + 1}/${TILES.length}: ${x}/${y}`);
  }
}
await Promise.all(Array.from({ length: 8 }, () => worker()));

const segments = results.flat();
console.log("Decoded segments:", segments.length);

const roadTypeNumber = value => {
  const name = String(value ?? "").trim().toLowerCase();
  if (name === "motorway") return 0;
  if (name === "international road") return 1;
  if (name === "major road") return 2;
  if (name === "secondary road") return 3;
  if (name === "connecting road") return 4;
  if (name === "major local road") return 5;
  return -1;
};
const usable = segments.filter(s =>
  roadTypeNumber(s.properties?.road_type) >= 0 &&
  (Number.isFinite(Number(s.properties?.traffic_level)) || s.properties?.road_closure === true) &&
  Array.isArray(s.path) && s.path.length >= 2
);
if (!usable.length) throw new Error("TomTom returned no usable colored road segments; existing published placefile was not overwritten.");

const lines = [
  "; Southeast Louisiana live traffic - GitHub Actions generated static placefile",
  "; Source: TomTom Traffic Flow Vector Tiles",
  "; Vector road geometry remains sharp at close zoom levels.",
  "; Interstates: 6px; other included roads: 4px. Thin black casing on all roads; interstate offset 32m and highway offset 50m.",
  "; Coverage: Baton Rouge/Livingston, Northshore, Pearl River, Slidell, New Orleans and Mississippi Gulf Coast",
  "; Traffic data © TomTom",
  "; Updated: " + new Date().toISOString(),
  "Title: SOUTHEAST LOUISIANA LIVE TRAFFIC",
  "Refresh: 5"
];

let drawn = 0;
const geoFeatures = [];
const classCounts = { magenta: 0, orange: 0, yellow: 0, green: 0 };
for (const segment of usable) {
  const roadType = roadTypeNumber(segment.properties.road_type);
  const status = statusFor(segment.properties);
  const [red, green, blue] = status.color;
  classCounts[status.className]++;
  const hex = "#" + [red, green, blue].map(v => v.toString(16).padStart(2, "0")).join("");
  const offsetMeters = roadType === 0 ? 32 : 50;
  const displayWidth = roadType === 0 ? 6 : 4;
  const coordinates = offsetPath(segment.path, offsetMeters).map(([lat, lon]) => [lon, lat]);
  const closed = segment.properties.road_closure === true || segment.properties.road_closure === 1 || String(segment.properties.road_closure).toLowerCase() === "true";
  const featureProperties = {
    "stroke-opacity": 1,
    traffic_status: status.label,
    road_type: segment.properties.road_type,
    traffic_level: Number(segment.properties.traffic_level),
    road_closure: closed
  };
  geoFeatures.push({
    type: "Feature",
    properties: { ...featureProperties, stroke: hex, "stroke-width": displayWidth, layer: "traffic" },
    geometry: { type: "LineString", coordinates }
  });
  const label = clean(status.label + (closed ? " - ROAD CLOSED" : ""));
  lines.push(`Color: ${red} ${green} ${blue}`);
  lines.push(`Line: ${displayWidth}, 0, "${label}"`);
  for (const [lat, lon] of offsetPath(segment.path, offsetMeters)) lines.push(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
  lines.push("End:");
  drawn++;
}
lines.push("; Vector road segments: " + drawn);
lines.push("; Interstate road type: 0; highway road types: 1, 2, 3, 4, 5 (including connecting roads/ramps and major local roads; excludes local/minor residential streets)");
lines.push("; Traffic color classes (magenta/orange/yellow/green): " + Object.values(classCounts).join("/"));
console.log("Traffic color class counts:", JSON.stringify(classCounts));
if (drawn !== lines.filter(line => line.startsWith("Line:")).length || drawn !== lines.filter(line => line.startsWith("Color:")).length) {
  throw new Error("Placefile validation failed: each road must have exactly one RGB color and one Line command.");
}

await writeFile("traffic.txt", lines.join("\n") + "\n", "utf8");
const geojson = {
  type: "FeatureCollection",
  name: "Southeast Louisiana Live Traffic",
  metadata: { source: "TomTom Traffic Flow Vector Tiles", updated: new Date().toISOString(), segments: geoFeatures.length },
  features: geoFeatures
};
await writeFile("traffic.geojson", JSON.stringify(geojson), "utf8");
console.log(`Generated traffic.geojson with ${geoFeatures.length} individually colored road features.`);
console.log(`Generated traffic.txt with ${drawn} colored vector road segments from ${TILES.length} tiles.`);
