// Fetches a rolling 24h window of NCEP GFS 10m wind forecasts from public
// ERDDAP mirrors and writes a compact binary the web view loads.
//
// Source dataset: ncep_global_lon180, GFS Atmospheric Model, 0.5°, 3-hourly.
// Variables: ugrd10m / vgrd10m.
//
// Robustness policy:
//   1. Try a small set of known ERDDAP mirrors.
//   2. Try several older 3-hour windows because forecast publication can lag.
//   3. If every live attempt fails, keep the previous baked data and mark the
//      metadata as cached fallback so the Lens UI tells the truth.

import { access, readFile, writeFile } from "node:fs/promises";

const DATASET_ID = "ncep_global_lon180";
const DEFAULT_BASES = [
  "https://upwell.pfeg.noaa.gov/erddap/griddap/ncep_global_lon180.json",
  "https://pae-paha.pacioos.hawaii.edu/erddap/griddap/ncep_global_lon180.json",
  "https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncep_global_lon180.json",
  "https://oceanwatch.pfeg.noaa.gov/erddap/griddap/ncep_global_lon180.json",
];

const BASES = uniqueList(
  (process.env.GFS_ERDDAP_BASES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .concat(DEFAULT_BASES)
);

const STRIDE = 4;          // 0.5° native -> 2° output
const LAT_MIN = -90, LAT_MAX = 90;
const LON_MIN = -180, LON_MAX = 178;
const STEP_COUNT = 8;      // 8 x 3 h = 24 h window
const STEP_HOURS = 3;
const REQUEST_TIMEOUT_MS = Number(process.env.GFS_FETCH_TIMEOUT_MS || 15000);
const CACHE_OK = process.env.GFS_DISABLE_CACHE_FALLBACK !== "1";

const gfsBinPath = new URL("../web/public/gfs.bin", import.meta.url);
const gfsJsonPath = new URL("../web/public/gfs.json", import.meta.url);

function uniqueList(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function isoFloorHours(ms, h) {
  const d = new Date(ms);
  const slot = Math.floor(d.getUTCHours() / h) * h;
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(slot);
  return d;
}

function isoNoMs(date) {
  return date.toISOString().replace(/\.\d+Z$/, "Z");
}

function buildWindow(lagHours) {
  const refTime = isoFloorHours(Date.now() - lagHours * 3600 * 1000, STEP_HOURS);
  const startIso = isoNoMs(refTime);
  const endIso = isoNoMs(new Date(refTime.getTime() + (STEP_COUNT - 1) * STEP_HOURS * 3600 * 1000));
  return { startIso, endIso };
}

function buildUrl(base, startIso, endIso) {
  const q =
    `ugrd10m[(${startIso}):1:(${endIso})][(${LAT_MIN}.0):${STRIDE}:(${LAT_MAX}.0)][(${LON_MIN}.0):${STRIDE}:(${LON_MAX}.0)],` +
    `vgrd10m[(${startIso}):1:(${endIso})][(${LAT_MIN}.0):${STRIDE}:(${LAT_MAX}.0)][(${LON_MIN}.0):${STRIDE}:(${LON_MAX}.0)]`;
  return `${base}?${encodeURIComponent(q).replaceAll("%2C", ",")}`;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { "User-Agent": "curvilinear-vector-fields/1.0" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function shortError(error) {
  if (!error) return "unknown";
  const anyError = error;
  return anyError.cause?.code || anyError.code || anyError.name || anyError.message || String(error);
}

async function fetchJson(base, startIso, endIso) {
  const url = buildUrl(base, startIso, endIso);
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 220).replace(/\s+/g, " ")}`);
  }
  return { data: await response.json(), url };
}

function rowsToPayload(data, startIso, endIso, sourceUrl, attemptLog) {
  const rows = data?.table?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("ERDDAP response contained no rows");
  }

  const times = [], lats = [], lons = [];
  const tSet = new Map(), latSet = new Map(), lonSet = new Map();
  for (const row of rows) {
    const time = row[0], lat = row[1], lon = row[2];
    if (!tSet.has(time)) { tSet.set(time, times.length); times.push(time); }
    if (!latSet.has(lat)) { latSet.set(lat, lats.length); lats.push(lat); }
    if (!lonSet.has(lon)) { lonSet.set(lon, lons.length); lons.push(lon); }
  }
  lats.sort((a, b) => b - a);
  lons.sort((a, b) => a - b);

  const tIdx = new Map(times.map((v, i) => [v, i]));
  const latIdx = new Map(lats.map((v, i) => [v, i]));
  const lonIdx = new Map(lons.map((v, i) => [v, i]));
  const nt = times.length, ny = lats.length, nx = lons.length;
  const cellsPerStep = nx * ny;
  const totalFloats = cellsPerStep * nt * 2;
  const buf = new Float32Array(totalFloats);
  let nullCount = 0;

  for (const row of rows) {
    const ti = tIdx.get(row[0]);
    const yi = latIdx.get(row[1]);
    const xi = lonIdx.get(row[2]);
    const u = row[3], v = row[4];
    const off = ti * cellsPerStep + yi * nx + xi;
    if (u == null || v == null) {
      nullCount++;
      buf[off] = 0;
      buf[totalFloats / 2 + off] = 0;
    } else {
      buf[off] = u;
      buf[totalFloats / 2 + off] = v;
    }
  }

  const fetchedAt = new Date().toISOString();
  const meta = {
    source: "NOAA ERDDAP · ncep_global_lon180 (NCEP GFS Atmospheric Model)",
    sourceUrl,
    datasetId: DATASET_ID,
    variable: "10 m wind (ugrd10m, vgrd10m)",
    refTime: startIso,
    endTime: endIso,
    stepHours: STEP_HOURS,
    nt, ny, nx,
    lonMin: lons[0],
    lonMax: lons[lons.length - 1],
    latMax: lats[0],
    latMin: lats[lats.length - 1],
    lonRes: (lons[lons.length - 1] - lons[0]) / (nx - 1),
    latRes: (lats[0] - lats[lats.length - 1]) / (ny - 1),
    times,
    units: "m/s",
    layout: "Float32 little-endian, concatenated [u (nt x ny x nx), v (nt x ny x nx)]",
    fetchedAt,
    lastAttemptAt: fetchedAt,
    dataMode: "live",
    usingFallback: false,
    fallbackReason: "",
    nullCount,
    attemptedSources: attemptLog,
  };

  return { buf, meta };
}

async function hasFile(url) {
  try {
    await access(url);
    return true;
  } catch (e) {
    return false;
  }
}

async function writeCachedFallback(reason, attemptLog) {
  if (!CACHE_OK || !(await hasFile(gfsJsonPath)) || !(await hasFile(gfsBinPath))) {
    throw new Error(reason);
  }

  const meta = JSON.parse(await readFile(gfsJsonPath, "utf8"));
  meta.lastAttemptAt = new Date().toISOString();
  meta.dataMode = "cached";
  meta.usingFallback = true;
  meta.fallbackReason = reason;
  meta.attemptedSources = attemptLog;
  await writeFile(gfsJsonPath, JSON.stringify(meta, null, 2) + "\n");
  console.warn("GFS live refresh failed; kept cached data:", reason);
  console.warn("cached window:", meta.refTime, "->", meta.endTime);
}

const lagHours = (process.env.GFS_LAG_HOURS || "6,9,12,18,24,36")
  .split(",")
  .map((v) => Number(v.trim()))
  .filter((v) => Number.isFinite(v) && v >= 0);

const attemptLog = [];
let lastError = "no attempts";

for (const lag of lagHours) {
  const { startIso, endIso } = buildWindow(lag);
  for (const base of BASES) {
    const sourceUrl = base.replace(/\.json$/, ".html");
    console.log("fetching", startIso, "->", endIso, "from", sourceUrl);
    try {
      const { data, url } = await fetchJson(base, startIso, endIso);
      attemptLog.push({ sourceUrl, startIso, endIso, ok: true });
      const { buf, meta } = rowsToPayload(data, startIso, endIso, sourceUrl, attemptLog);
      await writeFile(gfsBinPath, Buffer.from(buf.buffer));
      await writeFile(gfsJsonPath, JSON.stringify(meta, null, 2) + "\n");
      console.log(`wrote gfs.bin (${buf.byteLength} B) + gfs.json (${meta.nt} timesteps)`);
      console.log("source:", sourceUrl);
      console.log("url:", url);
      process.exit(0);
    } catch (error) {
      lastError = `${sourceUrl} ${startIso}: ${shortError(error)}`;
      attemptLog.push({
        sourceUrl,
        startIso,
        endIso,
        ok: false,
        error: shortError(error),
      });
      console.warn("  failed:", shortError(error));
    }
  }
}

await writeCachedFallback(lastError, attemptLog);
