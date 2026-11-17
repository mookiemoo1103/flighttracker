import { readFile, writeFile } from "node:fs/promises";

const trafficTxt = await readFile("traffic.txt", "utf8");
const eventsTxt = await readFile("traffic-events/traffic-events.txt", "utf8");
const trafficJson = JSON.parse(await readFile("traffic.geojson", "utf8"));
const eventsJson = JSON.parse(await readFile("traffic-events/traffic-events.geojson", "utf8"));

if (trafficJson.type !== "FeatureCollection" || eventsJson.type !== "FeatureCollection")
  throw new Error("Both source JSON files must be GeoJSON FeatureCollections.");
if (!trafficTxt.includes("Source: TomTom") || !eventsTxt.includes("Sources:"))
  throw new Error("Source TXT files failed validation.");

const eventBody = eventsTxt
  .split(/\r?\n/)
  .filter(line => !/^;/.test(line) && !/^Title:/.test(line) && !/^Refresh:/.test(line))
  .join("\n").trim();

const combinedTxt = [
  "; COMBINED LIVE TRAFFIC FEED",
  "; TomTom traffic speeds and Louisiana 511LA / DOTD roadway events are included as distinct sections.",
  "; TomTom roads retain their existing traffic colors and geometry.",
  "; 511LA / DOTD events retain their own event icons and popup details.",
  "; Updated: " + new Date().toISOString(),
  ...trafficTxt.trimEnd().split(/\r?\n/).filter(line => !/^Title:/.test(line) && !/^Refresh:/.test(line)),
  "",
  "; BEGIN SEPARATE 511LA / DOTD EVENT LAYER",
  eventBody,
  "; END SEPARATE 511LA / DOTD EVENT LAYER",
  "Title: SOUTHEAST LOUISIANA TRAFFIC SPEEDS + 511LA / DOTD EVENTS",
  "Refresh: 5",
  ""
].join("\n");

const speedFeatures = trafficJson.features.map(feature => ({
  ...feature,
  properties: { ...feature.properties, source: "TomTom Traffic Flow", layer: "tomtom-traffic-speeds" }
}));
const eventFeatures = eventsJson.features.map(feature => ({
  ...feature,
  properties: { ...feature.properties, source: feature.properties?.source || "511LA / Louisiana DOTD", layer: "511la-dotd-events" }
}));
const combinedJson = {
  type: "FeatureCollection",
  name: "Southeast Louisiana Combined Traffic",
  metadata: {
    generatedAt: new Date().toISOString(),
    sources: {
      tomtom: { source: trafficJson.metadata?.source || "TomTom Traffic Flow Vector Tiles", updated: trafficJson.metadata?.updated || null, featureCount: speedFeatures.length },
      events: { source: eventsJson.metadata?.sources || ["511LA Events API", "Louisiana DOTD 511 Road Closures FeatureServer"], updated: eventsJson.metadata?.generatedAt || null, featureCount: eventFeatures.length }
    },
    layers: ["tomtom-traffic-speeds", "511la-dotd-events"]
  },
  features: [...speedFeatures, ...eventFeatures]
};

if (!speedFeatures.length) throw new Error("TomTom traffic layer is empty; refusing to publish combined feed.");
if (speedFeatures.some(f => f.properties?.layer !== "tomtom-traffic-speeds") ||
    eventFeatures.some(f => f.properties?.layer !== "511la-dotd-events"))
  throw new Error("Combined GeoJSON layer separation validation failed.");
if (!combinedTxt.includes("BEGIN SEPARATE 511LA / DOTD EVENT LAYER"))
  throw new Error("Combined TXT event section missing.");

await writeFile("traffic.txt", combinedTxt, "utf8");
await writeFile("traffic.geojson", JSON.stringify(combinedJson), "utf8");
console.log("Combined TXT:", speedFeatures.length, "TomTom speed features plus", eventFeatures.length, "511LA/DOTD events.");
console.log("Combined GeoJSON:", combinedJson.features.length, "features with distinct source/layer properties.");
