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

function statusFor(properties) {
  const relative = Number(properties.traffic_level);
  const closed = properties.road_closure === true;
  if (closed || !Number.isFinite(relative) || relative < 0.45)
    return { color: [227, 38, 38], label: closed ? "CLOSED" : "VERY SLOW" };
  if (relative < 0.65) return { color: [242, 140, 24], label: "SLOW" };
  if (relative < 0.85) return { color: [244, 210, 31], label: "MODERATE" };
  return { color: [22, 184, 78], label: "FAST" };
}

async function fetchTile(x, y) {
  const url = new URL(`https://api.tomtom.com/traffic/map/4/tile/flow/relative/${ZOOM}/${x}/${y}.pbf`);
  url.searchParams.set("key", API_KEY);
  url.searchParams.set("roadTypes", "[0,1,2,3]");
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
console.log("Decoded road types:", [...new Set(segments.map(x => x.properties?.road_type))]);
const usable = segments.filter(s =>
  [0, 1, 2, 3].includes(Number(s.properties?.road_type)) &&
  (Number.isFinite(Number(s.properties?.traffic_level)) || s.properties?.road_closure === true) &&
  Array.isArray(s.path) && s.path.length >= 2
);
if (!usable.length) throw new Error("TomTom returned no usable colored road segments; existing published placefile was not overwritten.");

const lines = [
  "; Southeast Louisiana live traffic - GitHub Actions generated static placefile",
  "; Source: TomTom Traffic Flow Vector Tiles",
  "; Vector road geometry remains sharp at close zoom levels.",
  "; Interstates are slightly thicker than highways.",
  "; Coverage: Baton Rouge/Livingston, Northshore, Pearl River, Slidell, New Orleans and Mississippi Gulf Coast",
  "; Traffic data © TomTom",
  "; Updated: " + new Date().toISOString(),
  "Title: SOUTHEAST LOUISIANA LIVE TRAFFIC",
  "Refresh: 5"
];

let drawn = 0;
for (const segment of usable) {
  const roadType = Number(segment.properties.road_type);
  const status = statusFor(segment.properties);
  const [red, green, blue] = status.color;
  lines.push(`Color: ${red} ${green} ${blue}`);
  const label = clean(status.label + (segment.properties.road_closure === true ? " - ROAD CLOSED" : ""));
  lines.push(`Line: ${roadType === 0 ? 2 : 1}, 0, "${label}"`);
  for (const [lat, lon] of segment.path) lines.push(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
  lines.push("End:");
  drawn++;
}
lines.push("; Vector road segments: " + drawn);
lines.push("; Interstate road type: 0; highway road types: 1, 2, 3");

await writeFile("traffic.txt", lines.join("\n") + "\n", "utf8");
console.log(`Generated traffic.txt with ${drawn} colored vector road segments from ${TILES.length} tiles.`);
