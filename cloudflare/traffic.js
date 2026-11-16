// Regional Southeast Louisiana live traffic-speed placefile.
// Source: TomTom Traffic Flow Vector Tiles (free monthly developer quota).
// Uses relative speed (current speed / free-flow speed) for the requested colors.
// z8 coverage provides detailed road segments across Baton Rouge,
// Pearl River/Slidell, New Orleans, Houma, Biloxi and western Mobile.
const ZOOM = 8;
const TILES = [
  [62,104],[63,104],[64,104],[65,104],
  [62,105],[63,105],[64,105],[65,105],
  [62,106],[63,106],[64,106],[65,106]
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

function tileBounds(x, y, zoom) {
  const n = Math.pow(2, zoom);
  const lon = tx => tx / n * 360 - 180;
  const lat = ty => Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n))) * 180 / Math.PI;
  return { north: lat(y), south: lat(y + 1), west: lon(x), east: lon(x + 1) };
}

function buildPlacefile(updatedAt, origin, stale = false) {
  const lines = [
    "; Live traffic flow from TomTom pre-colored raster flow tiles",
    "; Coverage: Pearl River, Slidell, Northshore, New Orleans, Baton Rouge and surrounding Southeast Louisiana",
    "; Native TomTom relative0 colors show congestion directly in transparent PNG tiles.",
    "; Traffic data © TomTom",
    "; Updated: " + new Date(updatedAt).toISOString() + (stale ? " (STALE CACHE)" : ""),
    "Title: SOUTHEAST LOUISIANA LIVE TRAFFIC",
    "Refresh: 5",
    "Threshold: 999"
  ];
  for (const [x, y] of TILES) {
    const b = tileBounds(x, y, ZOOM);
    const imageUrl = origin + "/traffic.txt?tile=" + x + "/" + y;
    lines.push("Image: " + imageUrl);
    lines.push(b.north.toFixed(6) + ", " + b.west.toFixed(6) + ", 0, 0");
    lines.push(b.north.toFixed(6) + ", " + b.east.toFixed(6) + ", 1, 0");
    lines.push(b.south.toFixed(6) + ", " + b.east.toFixed(6) + ", 1, 1");
    lines.push(b.south.toFixed(6) + ", " + b.west.toFixed(6) + ", 0, 1");
    lines.push("End:");
  }
  lines.push("; Raster traffic tiles: " + TILES.length);
  return lines.join("\n") + "\n";
}

async function fetchRasterTile(x, y, apiKey) {
  const url = new URL("https://api.tomtom.com/traffic/map/4/tile/flow/relative0/" + ZOOM + "/" + x + "/" + y + ".png");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("thickness", "3");
  url.searchParams.set("tileSize", "256");
  const response = await fetch(url.toString(), {
    headers: { "Accept": "image/png, application/json" },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error("TomTom raster tile " + x + "/" + y + " HTTP " + response.status + ": " + detail);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("image/png")) throw new Error("TomTom returned non-PNG tile for " + x + "/" + y);
  return response;
}
async function fetchTrafficSegments(apiKey) {
  const results = await Promise.allSettled(TILES.map(async ([x, y]) => {
    const url = new URL("https://api.tomtom.com/traffic/map/4/tile/flow/relative/" + ZOOM + "/" + x + "/" + y + ".pbf");
    url.searchParams.set("key", apiKey);
    // Explicitly request all supported road classes and the speed/closure
    // attributes; without these tags some tile responses contain geometry
    // without the properties needed to color the placefile.
    url.searchParams.set("roadTypes", "[0,1,2,3,4,5,6,7,8]");
    url.searchParams.set("tags", "[road_type,traffic_level,traffic_road_coverage,left_hand_traffic,road_closure]");
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
  const withSpeed = segments.filter(segment => Number.isFinite(Number(segment.properties?.traffic_level))).length;
  if (!withSpeed) throw new Error("TomTom returned road geometry but no traffic_level speed attributes; refusing to draw uncolored roads");
  return { segments: segments.filter(segment => Number.isFinite(Number(segment.properties?.traffic_level)) || segment.properties?.road_closure === true), errors };
}

export async function handleTrafficRequest(request, env) {
  const url = new URL(request.url);
  const tileMatch = url.searchParams.get("tile")?.match(/^(\d+)\/(\d+)$/);
  if (tileMatch) {
    const x = Number(tileMatch[1]), y = Number(tileMatch[2]);
    if (!TILES.some(([tx, ty]) => tx === x && ty === y)) {
      return new Response("Unknown traffic tile", { status: 404 });
    }
    if (!env.TOMTOM_API_KEY) return new Response("TomTom API key is not configured", { status: 503 });
    try {
      const upstream = await fetchRasterTile(x, y, env.TOMTOM_API_KEY);
      return new Response(upstream.body, {
        headers: {
          "content-type": "image/png",
          "cache-control": "public, max-age=240, s-maxage=240",
          "access-control-allow-origin": "*"
        }
      });
    } catch (error) {
      return new Response("Traffic raster tile unavailable: " + clean(error?.message || error), {
        status: 502,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
      });
    }
  }
  const headers = {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "access-control-allow-origin": "*"
  };
  if (!env.TOMTOM_API_KEY) {
    return new Response([
      "; Live traffic placefile is deployed, but the free TomTom Traffic API key has not been configured.",
      "; Add a GitHub Actions secret named TOMTOM_API_KEY.",
      "Title: SOUTHEAST LOUISIANA LIVE TRAFFIC",
      "Refresh: 5",
      ""
    ].join("\n"), { status: 200, headers });
  }
  return new Response(buildPlacefile(Date.now(), url.origin), { headers });
}
