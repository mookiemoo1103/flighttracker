// Regional Southeast Louisiana live traffic-speed placefile.
// Source: TomTom Traffic Flow Vector Tiles (free monthly developer quota).
// Uses relative speed (current speed / free-flow speed) for the requested colors.
const ZOOM = 8;
// Web Mercator z8 tiles covering Southeast Louisiana and the adjacent
// Mississippi coast. At this zoom, Louisiana is around tile Y 54-56.
const TILES = [
  [62,54],[63,54],[64,54],[65,54],
  [62,55],[63,55],[64,55],[65,55],
  [62,56],[63,56],[64,56],[65,56]
];
const CACHE_ID = 1;
const CACHE_MS = 290 * 1000;
const STALE_MS = 15 * 60 * 1000;
const EXTENT_DEFAULT = 4096;
const clean = value => String(value ?? "").replaceAll('"', "'").replaceAll("\\", "/").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();

function readVarint(bytes, state) {
  let value = 0, shift = 0;
  while (state.pos < bytes.length && shift <= 49) {
    const byte = bytes[state.pos++];
    value += (byte & 0x7f) * Math.pow(2, shift);
    if ((byte & 0x80) === 0) return value;
    shift += 7;
  }
  throw new Error("Malformed protobuf varint");
}

function fields(bytes) {
  const result = [], state = { pos: 0 };
  while (state.pos < bytes.length) {
    const tag = readVarint(bytes, state);
    const field = Math.floor(tag / 8), wire = tag & 7;
    if (!field) throw new Error("Invalid protobuf field number");
    if (wire === 0) result.push({ field, wire, value: readVarint(bytes, state) });
    else if (wire === 2) {
      const length = readVarint(bytes, state);
      if (length < 0 || state.pos + length > bytes.length) throw new Error("Invalid protobuf field length");
      result.push({ field, wire, value: bytes.subarray(state.pos, state.pos + length) });
      state.pos += length;
    } else if (wire === 1 || wire === 5) {
      const length = wire === 1 ? 8 : 4;
      if (state.pos + length > bytes.length) throw new Error("Invalid protobuf fixed field");
      result.push({ field, wire, value: bytes.subarray(state.pos, state.pos + length) });
      state.pos += length;
    } else throw new Error("Unsupported protobuf wire type " + wire);
  }
  return result;
}

function decodeValue(bytes) {
  for (const f of fields(bytes)) {
    if (f.field === 1 && f.wire === 2) return new TextDecoder().decode(f.value);
    if (f.field === 2 && f.wire === 5) return new DataView(f.value.buffer, f.value.byteOffset, 4).getFloat32(0, true);
    if (f.field === 3 && f.wire === 1) return new DataView(f.value.buffer, f.value.byteOffset, 8).getFloat64(0, true);
    if ([4,5].includes(f.field) && f.wire === 0) return f.value;
    if (f.field === 6 && f.wire === 0) return (f.value >>> 1) ^ -(f.value & 1);
    if (f.field === 7 && f.wire === 0) return Boolean(f.value);
  }
  return null;
}

function packedVarints(bytes) {
  const values = [], state = { pos: 0 };
  while (state.pos < bytes.length) values.push(readVarint(bytes, state));
  return values;
}

function decodeGeometry(commands, tileX, tileY, zoom, extent) {
  const paths = [];
  let x = 0, y = 0, current = null, i = 0;
  const n = Math.pow(2, zoom);
  const toLatLon = (px, py) => {
    const gx = (tileX + px / extent) / n;
    const gy = (tileY + py / extent) / n;
    const lon = gx * 360 - 180;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * gy))) * 180 / Math.PI;
    return [lat, lon];
  };
  while (i < commands.length) {
    const commandCount = commands[i++];
    const command = commandCount & 7;
    const count = commandCount >>> 3;
    if (!count) continue;
    if (command === 1 || command === 2) {
      for (let j = 0; j < count; j++) {
        if (i + 1 >= commands.length) return paths;
        const dx = commands[i++], dy = commands[i++];
        x += (dx >>> 1) ^ -(dx & 1);
        y += (dy >>> 1) ^ -(dy & 1);
        const point = toLatLon(x, y);
        if (command === 1) {
          current = [];
          paths.push(current);
        }
        if (!current) {
          current = [];
          paths.push(current);
        }
        current.push(point);
      }
    } else if (command === 7) {
      current = null;
    } else {
      break;
    }
  }
  return paths.filter(path => path.length >= 2);
}

function decodeFeature(bytes, keys, values, tileX, tileY, zoom, extent) {
  let tags = [], type = 0, geometry = [];
  for (const f of fields(bytes)) {
    if (f.field === 2 && f.wire === 2) tags = tags.concat(packedVarints(f.value));
    else if (f.field === 3 && f.wire === 0) type = f.value;
    else if (f.field === 4 && f.wire === 2) geometry = geometry.concat(packedVarints(f.value));
  }
  if (type !== 2 || !geometry.length) return [];
  const properties = {};
  for (let i = 0; i + 1 < tags.length; i += 2) {
    const key = keys[tags[i]], value = values[tags[i + 1]];
    if (key !== undefined) properties[key] = value;
  }
  const paths = decodeGeometry(geometry, tileX, tileY, zoom, extent);
  return paths.map(path => ({ path, properties }));
}

export function decodeTrafficTile(buffer, tileX, tileY, zoom = ZOOM) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const output = [];
  for (const top of fields(bytes)) {
    if (top.field !== 3 || top.wire !== 2) continue;
    let name = "", keys = [], values = [], featureBytes = [], extent = EXTENT_DEFAULT;
    for (const layerField of fields(top.value)) {
      if (layerField.field === 1 && layerField.wire === 2) name = new TextDecoder().decode(layerField.value);
      else if (layerField.field === 2 && layerField.wire === 2) featureBytes.push(layerField.value);
      else if (layerField.field === 3 && layerField.wire === 2) keys.push(new TextDecoder().decode(layerField.value));
      else if (layerField.field === 4 && layerField.wire === 2) values.push(decodeValue(layerField.value));
      else if (layerField.field === 5 && layerField.wire === 0) extent = layerField.value;
    }
    if (name && !name.toLowerCase().includes("traffic flow")) continue;
    for (const feature of featureBytes) output.push(...decodeFeature(feature, keys, values, tileX, tileY, zoom, extent));
  }
  return output;
}

function statusFor(properties) {
  const relative = Number(properties.traffic_level);
  const closed = properties.road_closure === true;
  if (closed || !Number.isFinite(relative) || relative < 0.45) return { color:[227,38,38], label:closed ? "CLOSED" : "VERY SLOW", ratio:relative };
  if (relative < 0.65) return { color:[242,140,24], label:"SLOW", ratio:relative };
  if (relative < 0.85) return { color:[244,210,31], label:"MODERATE", ratio:relative };
  return { color:[22,184,78], label:"FAST", ratio:relative };
}

function buildPlacefile(segments, updatedAt, stale = false) {
  const lines = [
    "; Live traffic flow from TomTom Traffic Flow Vector Tiles",
    "; Coverage: Pearl River, Slidell, Northshore, New Orleans, Baton Rouge and surrounding Southeast Louisiana",
    "; Colors are based on current speed as a percentage of free-flow speed.",
    "; GREEN >=85%; YELLOW 65-84%; ORANGE 45-64%; RED <45% or road closed.",
    "; Traffic data © TomTom",
    "; Updated: " + new Date(updatedAt).toISOString() + (stale ? " (STALE CACHE)" : ""),
    "Title: SOUTHEAST LOUISIANA LIVE TRAFFIC",
    "Refresh: 5",
    "Font: 1, 10, 1, Arial",
    "Threshold: 999"
  ];
  let drawn = 0;
  const seen = new Set();
  for (const segment of segments) {
    const props = segment.properties || {};
    const state = statusFor(props);
    const path = segment.path || [];
    if (path.length < 2) continue;
    const forward = path.map(p => p[0].toFixed(5) + "," + p[1].toFixed(5)).join(";");
    const reverse = path.slice().reverse().map(p => p[0].toFixed(5) + "," + p[1].toFixed(5)).join(";");
    const signature = (forward < reverse ? forward : reverse) + "|" + String(props.traffic_level) + "|" + String(props.road_closure);
    if (seen.has(signature)) continue;
    seen.add(signature);
    const roadType = clean(props.road_type || "Road");
    const ratioText = Number.isFinite(state.ratio) ? Math.round(state.ratio * 100) + "% of free-flow speed" : "speed unavailable";
    const coverage = clean(props.traffic_road_coverage || "not specified");
    const hover = clean(roadType + " | " + state.label + " | " + ratioText + " | Coverage: " + coverage + (props.road_closure ? " | ROAD CLOSED" : ""));
    const width = /motorway/i.test(roadType) ? 4 : /international|major road/i.test(roadType) ? 3 : 2;
    lines.push("Color: " + state.color.join(" "));
    lines.push('Line: ' + width + ', 1, "' + hover + '"');
    for (const point of path) lines.push(point[0].toFixed(5) + ", " + point[1].toFixed(5));
    lines.push("End:");
    drawn++;
  }
  lines.push("; Unique traffic segments rendered: " + drawn);
  lines.push("; Free-tier request estimate: 12 tiles every 5 minutes (about 103,680 tile requests per 30 days).");
  return lines.join("\n") + "\n";
}

async function fetchTrafficSegments(apiKey) {
  const results = await Promise.allSettled(TILES.map(async ([x, y]) => {
    const url = new URL("https://api.tomtom.com/traffic/map/4/tile/flow/relative/" + ZOOM + "/" + x + "/" + y + ".pbf");
    url.searchParams.set("key", apiKey);
    const response = await fetch(url.toString(), {
      headers: { "Accept": "application/x-protobuf" },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error("TomTom tile " + x + "/" + y + " HTTP " + response.status);
    return decodeTrafficTile(await response.arrayBuffer(), x, y, ZOOM);
  }));
  const segments = [];
  const errors = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") segments.push(...result.value);
    else errors.push(TILES[i][0] + "/" + TILES[i][1] + ": " + clean(result.reason?.message || result.reason));
  }
  if (!segments.length) throw new Error(errors.slice(0, 3).join("; ") || "TomTom returned no traffic segments");
  return { segments, errors };
}

export async function handleTrafficRequest(request, env) {
  const headers = {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "access-control-allow-origin": "*"
  };
  if (!env.DB) return new Response("; Traffic service unavailable: D1 binding is missing.\nTitle: SOUTHEAST LOUISIANA LIVE TRAFFIC\nRefresh: 5\n", { status: 503, headers });
  if (!env.TOMTOM_API_KEY) {
    return new Response([
      "; Live traffic placefile is deployed, but the free TomTom Traffic API key has not been configured.",
      "; Create a free TomTom developer account, enable Traffic Flow Vector Tiles, then add a GitHub Actions secret named TOMTOM_API_KEY.",
      "Title: SOUTHEAST LOUISIANA LIVE TRAFFIC",
      "Refresh: 5",
      "Font: 1, 10, 1, Arial",
      "Color: 255 220 80",
      'Text: 0,0,1,"CONFIGURE FREE TOMTOM API KEY"',
      ""
    ].join("\n"), { status: 200, headers });
  }

  let cached = null;
  try { cached = await env.DB.prepare("SELECT payload, updated_at FROM traffic_cache WHERE id=?").bind(CACHE_ID).first(); }
  catch (error) { console.error("Traffic cache read failed:", String(error)); }
  const cachedAt = Number(cached?.updated_at || 0);
  if (cached && cachedAt && Date.now() - cachedAt < CACHE_MS) {
    try {
      const payload = JSON.parse(cached.payload);
      return new Response(buildPlacefile(payload.segments || [], cachedAt, false), { headers });
    } catch (error) { console.error("Traffic cache parse failed:", String(error)); }
  }

  try {
    const { segments, errors } = await fetchTrafficSegments(env.TOMTOM_API_KEY);
    const updatedAt = Date.now();
    await env.DB.prepare("INSERT INTO traffic_cache(id,payload,updated_at,last_error) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at,last_error=excluded.last_error")
      .bind(JSON.stringify({ segments }), updatedAt, errors.join(" | ").slice(0, 1000) || null).run();
    const responseHeaders = errors.length ? { ...headers, "x-traffic-partial": String(errors.length) } : headers;
    return new Response(buildPlacefile(segments, updatedAt), { headers: responseHeaders });
  } catch (error) {
    const message = clean(error?.message || error);
    console.error("TomTom traffic refresh failed:", message);
    if (cached && cachedAt && Date.now() - cachedAt < STALE_MS) {
      try {
        const payload = JSON.parse(cached.payload);
        await env.DB.prepare("UPDATE traffic_cache SET last_error=? WHERE id=1").bind(message).run();
        return new Response(buildPlacefile(payload.segments || [], cachedAt, true), { ...headers, "x-traffic-cache": "stale-fallback" });
      } catch {}
    }
    return new Response([
      "; TomTom traffic refresh failed: " + message,
      "; No current traffic-speed data is available. The placefile will retry on its next refresh.",
      "Title: SOUTHEAST LOUISIANA LIVE TRAFFIC",
      "Refresh: 5",
      ""
    ].join("\n"), { status: 200, headers });
  }
}
