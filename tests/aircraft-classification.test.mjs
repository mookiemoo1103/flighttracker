import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const worker = fs.readFileSync(new URL("../cloudflare/worker.js", import.meta.url), "utf8");
const start = worker.indexOf("function classify(");
const end = worker.indexOf("function altText", start);
assert.ok(start >= 0 && end > start, "classify() must exist in the Worker");

const context = {
  clean: value => String(value ?? "").replaceAll('"', "'").replaceAll("\\", "/").replace(/[\r\n]/g, " ").trim(),
  branch: () => "MILITARY (BRANCH UNKNOWN)",
  airline: () => "",
  AIRLINES: {}
};
vm.runInNewContext(worker.slice(start, end) + "\nthis.classify = classify;", context);
const classify = context.classify;

const businessJetCases = [
  ["C25A with ADS-B source metadata", { t: "C25A", type: "adsb_icao" }, {}],
  ["C25B", { t: "C25B" }, {}],
  ["C510", { t: "C510" }, {}],
  ["CL35", { t: "CL35" }, {}],
  ["GLF5", { t: "GLF5" }, {}],
  ["G280", { t: "G280" }, {}],
  ["FA7X", { t: "FA7X" }, {}],
  ["E55P", { t: "E55P" }, {}],
  ["LJ45", { t: "LJ45" }, {}],
  ["PC24", { t: "PC24" }, {}],
  ["SF50", { t: "SF50" }, {}],
  ["registry type code", {}, { icao_type_code: "BE40" }],
  ["model description", { model: "Gulfstream G550" }, {}],
  ["Citation model description", { description: "Cessna Citation CJ3" }, {}]
];
for (const [label, aircraft, registry] of businessJetCases) {
  assert.equal(classify(aircraft, registry)[1], "Business Jets", label);
}

assert.equal(classify({ t: "B738", type: "adsb_icao" }, {})[1], "GENERAL AVIATION", "ordinary airliner type must not be inferred as a business jet");
assert.equal(classify({ t: "A320", category: "A3" }, {})[1], "GENERAL AVIATION", "emitter category alone must not hide an aircraft in another category");
assert.equal(classify({ category: "A7" }, {})[1], "Helicopter", "rotorcraft emitter category must be recognized");
console.log(`Aircraft classification tests passed: ${businessJetCases.length} business-jet cases plus GA and helicopter controls.`);
