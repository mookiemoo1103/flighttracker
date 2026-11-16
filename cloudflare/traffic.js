// Regional Southeast Louisiana traffic-event placefile.
// Source: Louisiana DOTD 511LA public developer API.
// This API exposes events/incidents, not measured segment speeds. Do not
// interpret event colors as measured traffic-speed bands.
const API = "https://511la.org/api/v2/get/event";
const CACHE_KEY = 1;
const CACHE_MS = 60 * 1000;
const STALE_MS = 15 * 60 * 1000;
const BOUNDS = { minLat: 28.65, maxLat: 31.55, minLon: -92.25, maxLon: -88.0 };

const clean = value => String(value ?? "")
  .replaceAll('"', "'").replaceAll("\\", "/")
  .replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();

function decodePolyline(encoded) {
  if (!encoded || typeof encoded !== "string") return [];
  const points = [];
  let index = 0, lat = 0, lon = 0;
  try {
    while (index < encoded.length) {
      let result = 0, shift = 0, byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index <= encoded.length);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      result = 0; shift = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index <= encoded.length);
      lon += (result & 1) ? ~(result >> 1) : (result >> 1);
      points.push([lat / 1e5, lon / 1e5]);
      if (points.length > 10000) break;
    }
  } catch { return []; }
  return points;
}

function eventPoints(event) {
  const encoded = event.EncodedPolyline || event.encodedPolyline || event.encoded_polyline;
  let points = decodePolyline(encoded);
  if (points.length < 2) {
    const lat1 = Number(event.Latitude ?? event.latitude);
    const lon1 = Number(event.Longitude ?? event.longitude);
    const lat2 = Number(event.LatitudeSecondary ?? event.latitudeSecondary);
    const lon2 = Number(event.LongitudeSecondary ?? event.longitudeSecondary);
    if (Number.isFinite(lat1) && Number.isFinite(lon1)) {
      points = [[lat1, lon1]];
      if (Number.isFinite(lat2) && Number.isFinite(lon2) && (lat1 !== lat2 || lon1 !== lon2)) points.push([lat2, lon2]);
    }
  }
  return points.filter(([lat, lon]) =>
    Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat &&
    lon >= BOUNDS.minLon && lon <= BOUNDS.maxLon
  );
}

function colorFor(event) {
  const type = clean(event.EventType ?? event.eventType ?? event.type).toLowerCase();
  const subtype = clean(event.EventSubType ?? event.eventSubType ?? event.subtype).toLowerCase();
  const severity = clean(event.Severity ?? event.severity).toLowerCase();
  const full = event.IsFullClosure === true || event.isFullClosure === true;
  if (full || type.includes("closure") || subtype.includes("closed") || severity === "critical") return [235, 35, 35, "CLOSED / CRITICAL"];
  if (type.includes("accident") || type.includes("incident") || severity === "major") return [242, 125, 20, "INCIDENT / MAJOR"];
  if (type.includes("roadwork") || type.includes("construction") || severity === "moderate") return [245, 205, 35, "WORK ZONE / MODERATE"];
  return [235, 145, 35, "TRAFFIC EVENT"];
}

function formatEventTime(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "Not provided";
  const d = new Date(n < 1e12 ? n * 1000 : n);
  return Number.isNaN(d.getTime()) ? "Not provided" : d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

function buildPlacefile(events, updatedAt, stale = false) {
  const lines = [
    "; Louisiana DOTD 511LA traffic events — Southeast Louisiana",
    "; Coverage: Pearl River, Slidell, Northshore, New Orleans, Baton Rouge and nearby corridors",
    "; IMPORTANT: 511LA's documented API provides incidents/events, not measured road speeds.",
    "; Colors classify event type/severity only; they are NOT speed estimates.",
    "; Data updated: " + formatEventTime(updatedAt) + (stale ? " (STALE CACHE)" : ""),
    "Title: SOUTHEAST LOUISIANA TRAFFIC EVENTS",
    "Refresh: 1",
    "Font: 1, 10, 1, Arial",
    "Threshold: 999",
    "; Legend: RED = full closures/critical; ORANGE = incidents/major; YELLOW = roadwork/moderate"
  ];
  let drawn = 0;
  const now = Date.now();
  for (const event of events) {
    const end = Number(event.PlannedEndDate ?? event.endDate ?? event.EndDate);
    if (Number.isFinite(end) && end > 0 && end < (now / 1000) - 3600) continue;
    const points = eventPoints(event);
    if (!points.length) continue;
    const road = clean(event.RoadwayName ?? event.roadwayName ?? event.road ?? "Roadway");
    const direction = clean(event.DirectionOfTravel ?? event.directionOfTravel ?? "");
    const description = clean(event.Description ?? event.description ?? event.Details ?? event.details ?? "Traffic event");
    const subtype = clean(event.EventSubType ?? event.eventSubType ?? "");
    const [r, g, b, label] = colorFor(event);
    const hover = clean(road + (direction ? " " + direction : "") + " | " + label + " | " + subtype + " | " + description + " | Updated: " + formatEventTime(event.LastUpdated ?? event.lastUpdated));
    lines.push("Color: " + r + " " + g + " " + b);
    if (points.length >= 2) {
      lines.push('Line: 4, 1, "' + hover + '"');
      for (const [lat, lon] of points) lines.push(lat.toFixed(5) + ", " + lon.toFixed(5));
      lines.push("End:");
    } else {
      lines.push("Object: " + points[0][0].toFixed(5) + ", " + points[0][1].toFixed(5));
      lines.push('Text: 0,0,1,"' + clean(road + " - " + label) + '","' + hover + '"');
      lines.push("End:");
    }
    drawn++;
  }
  lines.push("; Events rendered in coverage area: " + drawn);
  return lines.join("\n") + "\n";
}

async function getCachedEvents(env) {
  return await env.DB.prepare("SELECT payload, updated_at FROM traffic_cache WHERE id=?").bind(CACHE_KEY).first();
}

export async function handleTrafficRequest(request, env) {
  const headers = {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "access-control-allow-origin": "*"
  };
  if (!env.DB) return new Response("; Traffic service unavailable: D1 binding is missing.\nTitle: SOUTHEAST LOUISIANA TRAFFIC EVENTS\nRefresh: 1\n", { status: 503, headers });
  if (!env.LOUISIANA_511_API_KEY) {
    return new Response([
      "; Traffic placefile is installed, but its free 511LA developer key has not been configured.",
      "; Create a free 511LA account, request a developer API key, then add it as the Cloudflare Worker secret LOUISIANA_511_API_KEY.",
      "; This feed supports event/incident geometry. It does not claim to show measured speeds.",
      "Title: SOUTHEAST LOUISIANA TRAFFIC EVENTS",
      "Refresh: 1",
      "Font: 1, 10, 1, Arial",
      "Color: 255 220 80",
      'Text: 0,0,1,"CONFIGURE 511LA API KEY"',
      ""
    ].join("\n"), { status: 200, headers });
  }

  let cached = null;
  try { cached = await getCachedEvents(env); } catch (error) { console.error("Traffic cache read failed:", String(error)); }
  const cachedAt = Number(cached?.updated_at || 0);
  if (cached && cachedAt && Date.now() - cachedAt < CACHE_MS) {
    try { return new Response(buildPlacefile(JSON.parse(cached.payload), cachedAt), { headers }); }
    catch (error) { console.error("Traffic cache parse failed:", String(error)); }
  }

  try {
    const apiUrl = new URL(API);
    apiUrl.searchParams.set("key", env.LOUISIANA_511_API_KEY);
    apiUrl.searchParams.set("format", "json");
    const response = await fetch(apiUrl.toString(), {
      headers: { "Accept": "application/json", "User-Agent": "AquaCeroWX-Traffic-Placefile/1.0" },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error("511LA HTTP " + response.status);
    const payload = await response.json();
    const events = Array.isArray(payload) ? payload :
      Array.isArray(payload?.Events) ? payload.Events :
      Array.isArray(payload?.events) ? payload.events : null;
    if (!events) throw new Error("511LA response did not contain an event array");
    const updatedAt = Date.now();
    await env.DB.prepare("INSERT INTO traffic_cache(id,payload,updated_at,last_error) VALUES(1,?,?,NULL) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at,last_error=NULL")
      .bind(JSON.stringify(events), updatedAt).run();
    return new Response(buildPlacefile(events, updatedAt), { headers });
  } catch (error) {
    const message = clean(error?.message || error);
    console.error("511LA traffic refresh failed:", message);
    if (cached && cachedAt && Date.now() - cachedAt < STALE_MS) {
      try {
        await env.DB.prepare("UPDATE traffic_cache SET last_error=? WHERE id=1").bind(message).run();
        return new Response(buildPlacefile(JSON.parse(cached.payload), cachedAt, true), { ...headers, "x-traffic-cache": "stale-fallback" });
      } catch {}
    }
    return new Response([
      "; 511LA traffic refresh failed: " + message,
      "; No current traffic-event data is available. No speeds are being fabricated.",
      "Title: SOUTHEAST LOUISIANA TRAFFIC EVENTS",
      "Refresh: 1",
      ""
    ].join("\n"), { status: 200, headers });
  }
}
