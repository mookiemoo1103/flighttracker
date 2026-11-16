// Regional Southeast Louisiana live traffic-speed placefile.
// Source: TomTom Traffic Raster Flow Tiles, relative0 style.
// z9 with 512px tiles exposes more road classes than the previous z8 overview.
// Coverage: Baton Rouge/Livingston to Pearl River/Slidell and Gulfport,
// McComb/Franklinton south through New Orleans and Houma.
const ZOOM = 9;
const TILE_SIZE = 512;
const TILES = [
  [125,209],[126,209],[127,209],[128,209],[129,209],
  [125,210],[126,210],[127,210],[128,210],[129,210],
  [125,211],[126,211],[127,211],[128,211],[129,211],
  [125,212],[126,212],[127,212],[128,212],[129,212]
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

function roadThreshold(roadType) {
  // Placefile thresholds are nautical miles across the view.
  // Interstates (TomTom road type 0) remain visible at every zoom.
  // Other highway classes appear once the view is about halfway zoomed in.
  const type = Number(roadType);
  if (type === 0) return 999;
  if (type >= 1 && type <= 3) return 80;
  return null;
}

function buildPlacefile(segments, updatedAt, stale = false) {
  const lines = [
    "; Live traffic flow from TomTom vector traffic tiles",
    "; Interstates remain visible at all zoom levels.",
    "; U.S. highways, major roads and state highways appear at 80 nautical miles view width.",
    "; Traffic data © TomTom",
    "; Updated: " + new Date(updatedAt).toISOString() + (stale ? " (STALE CACHE)" : ""),
    "Title: SOUTHEAST LOUISIANA LIVE TRAFFIC",
    "Refresh: 1"
  ];
  let interstateCount = 0, highwayCount = 0;
  for (const segment of segments) {
    const roadType = Number(segment.properties?.road_type);
    const threshold = roadThreshold(roadType);
    if (threshold === null) continue;
    const points = segment.path || [];
    if (points.length < 2) continue;
    const status = statusFor(segment.properties || {});
    const [red, green, blue] = status.color;
    const width = roadType === 0 ? 4 : 3;
    lines.push("Threshold: " + threshold);
    lines.push("Color: " + red + " " + green + " " + blue);
    const label = clean(status.label + (segment.properties?.road_closure === true ? " - ROAD CLOSED" : ""));
    lines.push('Line: ' + width + ', 0, "' + label + '"');
    for (const [lat, lon] of points) lines.push(lat.toFixed(6) + ", " + lon.toFixed(6));
    lines.push("End:");
    if (roadType === 0) interstateCount++;
    else highwayCount++;
  }
  lines.push("; Interstate segments: " + interstateCount);
  lines.push("; Highway and major-road segments (80 NM threshold): " + highwayCount);
  return lines.join("\n") + "\n";
}

async function fetchRasterTile(x, y, apiKey) {
  const url = new URL("https://api.tomtom.com/traffic/map/4/tile/flow/relative/" + ZOOM + "/" + x + "/" + y + ".png");
  url.searchParams.set("key", apiKey);
  // TomTom only supports thickness on the relative/absolute styles;
  // relative0 ignores/rejects this parameter. Use the maximum documented
  // width so traffic routes are clearly visible over the base map.
  url.searchParams.set("thickness", "20");
  url.searchParams.set("tileSize", String(TILE_SIZE));
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
  try {
    const data = await fetchTrafficSegments(env.TOMTOM_API_KEY);
    const body = buildPlacefile(data.segments, Date.now());
    return new Response(body, {
      headers: { ...headers, "x-traffic-segments": String(data.segments.length) }
    });
  } catch (error) {
    return new Response("; Traffic feed temporarily unavailable: " + clean(error?.message || error) + "\nTitle: SOUTHEAST LOUISIANA LIVE TRAFFIC\nRefresh: 1\n", {
      status: 502,
      headers
    });
  }
}
