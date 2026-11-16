// Regional Southeast Louisiana high-resolution live traffic-speed placefile.
// Source: TomTom Traffic Raster Flow Tiles, relative0 style.
// z10 with 512px tiles provides sharper native-resolution traffic imagery when zoomed in.
// Coverage: Baton Rouge/Livingston to Pearl River/Slidell and Gulfport,
// McComb/Franklinton south through New Orleans and Houma.
const ZOOM = 11;
const TILE_SIZE = 512;
const TILES = [
  [500,836],[501,836],[502,836],[503,836],[504,836],[505,836],[506,836],[507,836],[508,836],[509,836],[510,836],[511,836],[512,836],[513,836],[514,836],[515,836],[516,836],[517,836],[518,836],[519,836]
  [500,837],[501,837],[502,837],[503,837],[504,837],[505,837],[506,837],[507,837],[508,837],[509,837],[510,837],[511,837],[512,837],[513,837],[514,837],[515,837],[516,837],[517,837],[518,837],[519,837]
  [500,838],[501,838],[502,838],[503,838],[504,838],[505,838],[506,838],[507,838],[508,838],[509,838],[510,838],[511,838],[512,838],[513,838],[514,838],[515,838],[516,838],[517,838],[518,838],[519,838]
  [500,839],[501,839],[502,839],[503,839],[504,839],[505,839],[506,839],[507,839],[508,839],[509,839],[510,839],[511,839],[512,839],[513,839],[514,839],[515,839],[516,839],[517,839],[518,839],[519,839]
  [500,840],[501,840],[502,840],[503,840],[504,840],[505,840],[506,840],[507,840],[508,840],[509,840],[510,840],[511,840],[512,840],[513,840],[514,840],[515,840],[516,840],[517,840],[518,840],[519,840]
  [500,841],[501,841],[502,841],[503,841],[504,841],[505,841],[506,841],[507,841],[508,841],[509,841],[510,841],[511,841],[512,841],[513,841],[514,841],[515,841],[516,841],[517,841],[518,841],[519,841]
  [500,842],[501,842],[502,842],[503,842],[504,842],[505,842],[506,842],[507,842],[508,842],[509,842],[510,842],[511,842],[512,842],[513,842],[514,842],[515,842],[516,842],[517,842],[518,842],[519,842]
  [500,843],[501,843],[502,843],[503,843],[504,843],[505,843],[506,843],[507,843],[508,843],[509,843],[510,843],[511,843],[512,843],[513,843],[514,843],[515,843],[516,843],[517,843],[518,843],[519,843]
  [500,844],[501,844],[502,844],[503,844],[504,844],[505,844],[506,844],[507,844],[508,844],[509,844],[510,844],[511,844],[512,844],[513,844],[514,844],[515,844],[516,844],[517,844],[518,844],[519,844]
  [500,845],[501,845],[502,845],[503,845],[504,845],[505,845],[506,845],[507,845],[508,845],[509,845],[510,845],[511,845],[512,845],[513,845],[514,845],[515,845],[516,845],[517,845],[518,845],[519,845]
  [500,846],[501,846],[502,846],[503,846],[504,846],[505,846],[506,846],[507,846],[508,846],[509,846],[510,846],[511,846],[512,846],[513,846],[514,846],[515,846],[516,846],[517,846],[518,846],[519,846]
  [500,847],[501,847],[502,847],[503,847],[504,847],[505,847],[506,847],[507,847],[508,847],[509,847],[510,847],[511,847],[512,847],[513,847],[514,847],[515,847],[516,847],[517,847],[518,847],[519,847]
  [500,848],[501,848],[502,848],[503,848],[504,848],[505,848],[506,848],[507,848],[508,848],[509,848],[510,848],[511,848],[512,848],[513,848],[514,848],[515,848],[516,848],[517,848],[518,848],[519,848]
  [500,849],[501,849],[502,849],[503,849],[504,849],[505,849],[506,849],[507,849],[508,849],[509,849],[510,849],[511,849],[512,849],[513,849],[514,849],[515,849],[516,849],[517,849],[518,849],[519,849]
  [500,850],[501,850],[502,850],[503,850],[504,850],[505,850],[506,850],[507,850],[508,850],[509,850],[510,850],[511,850],[512,850],[513,850],[514,850],[515,850],[516,850],[517,850],[518,850],[519,850]
  [500,851],[501,851],[502,851],[503,851],[504,851],[505,851],[506,851],[507,851],[508,851],[509,851],[510,851],[511,851],[512,851],[513,851],[514,851],[515,851],[516,851],[517,851],[518,851],[519,851]
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
    "; Interstates and highways displayed together; no zoom threshold filtering.",
    "; Coverage: Pearl River, Slidell, Northshore, New Orleans, Baton Rouge and surrounding Southeast Louisiana",
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
    const nw = b.north.toFixed(6) + ", " + b.west.toFixed(6);
    const ne = b.north.toFixed(6) + ", " + b.east.toFixed(6);
    const se = b.south.toFixed(6) + ", " + b.east.toFixed(6);
    const sw = b.south.toFixed(6) + ", " + b.west.toFixed(6);
    lines.push(nw + ", 0, 0");
    lines.push(ne + ", 1, 0");
    lines.push(se + ", 1, 1");
    lines.push(nw + ", 0, 0");
    lines.push(se + ", 1, 1");
    lines.push(sw + ", 0, 1");
    lines.push("End:");
  }
  lines.push("; Raster traffic tiles: " + TILES.length);
  return lines.join("\n") + "\n";
}


function buildRoadClassPlacefile(segments, updatedAt, roadClass) {
  const isInterstate = roadClass === "interstate";
  const wanted = isInterstate ? new Set([0]) : new Set([1, 2, 3]);
  const lines = [
    "; Live traffic flow from TomTom vector traffic tiles",
    "; Separate road-class feed for independent AquaCeroWx zoom-range control.",
    "; " + (isInterstate ? "Interstates" : "U.S. highways and major/state highways"),
    "; Traffic data © TomTom",
    "; Updated: " + new Date(updatedAt).toISOString(),
    "Title: SOUTHEAST LOUISIANA " + (isInterstate ? "INTERSTATE" : "HIGHWAY") + " TRAFFIC",
    "Refresh: 1"
  ];
  let count = 0;
  for (const segment of segments) {
    const roadType = Number(segment.properties?.road_type);
    if (!wanted.has(roadType)) continue;
    const points = segment.path || [];
    if (points.length < 2) continue;
    const status = statusFor(segment.properties || {});
    const [red, green, blue] = status.color;
    lines.push("Color: " + red + " " + green + " " + blue);
    const label = clean(status.label + (segment.properties?.road_closure === true ? " - ROAD CLOSED" : ""));
    lines.push('Line: ' + (isInterstate ? 2 : 1) + ', 0, "' + label + '"');
    for (const [lat, lon] of points) lines.push(lat.toFixed(6) + ", " + lon.toFixed(6));
    lines.push("End:");
    count++;
  }
  lines.push("; " + (isInterstate ? "Interstate" : "Highway") + " segments: " + count);
  return lines.join("\n") + "\n";
}

async function fetchRasterTile(x, y, apiKey) {
  const url = new URL("https://api.tomtom.com/traffic/map/4/tile/flow/relative/" + ZOOM + "/" + x + "/" + y + ".png");
  url.searchParams.set("key", apiKey);
  // TomTom only supports thickness on the relative/absolute styles;
  // relative0 ignores/rejects this parameter. Use the maximum documented
  // width so traffic routes are clearly visible over the base map.
  url.searchParams.set("thickness", "3");
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
  const roadClass = url.searchParams.get("roads");
  if (roadClass === "interstate" || roadClass === "highway") {
    const headers = {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "access-control-allow-origin": "*"
    };
    if (!env.TOMTOM_API_KEY) {
      return new Response("; TomTom API key is not configured.\\nTitle: SOUTHEAST LOUISIANA TRAFFIC\\nRefresh: 1\\n", { status: 503, headers });
    }
    try {
      const data = await fetchTrafficSegments(env.TOMTOM_API_KEY);
      const body = buildRoadClassPlacefile(data.segments, Date.now(), roadClass);
      return new Response(body, { headers: { ...headers, "x-traffic-segments": String(data.segments.length) } });
    } catch (error) {
      return new Response("; Traffic vector feed temporarily unavailable: " + clean(error?.message || error) + "\\nTitle: SOUTHEAST LOUISIANA TRAFFIC\\nRefresh: 1\\n", { status: 502, headers });
    }
  }
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
