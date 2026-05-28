// Fetches a rolling 24h window of NCEP GFS 10m wind forecasts from NOAA
// CoastWatch ERDDAP and writes a compact binary the web view loads.
//
// Source: https://upwell.pfeg.noaa.gov/erddap/griddap/ncep_global_lon180.html
// Dataset: ncep_global_lon180 — GFS Atmospheric Model, 0.5°, 3-hourly.
//
// We sample every 4th lat/lon cell (2° regrid) and 8 timesteps spaced 3 h
// apart starting from the most recent multiple of 6 h ago — so the bundle is
// ~1 MB and covers a full daily cycle the page can play back.

import { writeFile } from "node:fs/promises";

const BASE = "https://upwell.pfeg.noaa.gov/erddap/griddap/ncep_global_lon180.json";
const STRIDE = 4;          // 0.5° native → 2° output
const LAT_MIN = -90, LAT_MAX = 90;
const LON_MIN = -180, LON_MAX = 178;
const STEP_COUNT = 8;      // 8 × 3 h = 24 h window
const STEP_HOURS = 3;

// Round current UTC time down to the most recent GFS 3-hour tick we expect to
// be available. Production GFS lags wall clock by ~4 hours, so we step back.
function isoFloorHours(ms, h) {
  const d = new Date(ms);
  const slot = Math.floor(d.getUTCHours() / h) * h;
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(slot);
  return d;
}

const refTime = isoFloorHours(Date.now() - 6 * 3600 * 1000, STEP_HOURS);
const startIso = refTime.toISOString().replace(/\.\d+Z$/, "Z");
const endIso = new Date(refTime.getTime() + (STEP_COUNT - 1) * STEP_HOURS * 3600 * 1000)
  .toISOString().replace(/\.\d+Z$/, "Z");

const q =
  `ugrd10m[(${startIso}):1:(${endIso})][(${LAT_MIN}.0):${STRIDE}:(${LAT_MAX}.0)][(${LON_MIN}.0):${STRIDE}:(${LON_MAX}.0)],` +
  `vgrd10m[(${startIso}):1:(${endIso})][(${LAT_MIN}.0):${STRIDE}:(${LAT_MAX}.0)][(${LON_MIN}.0):${STRIDE}:(${LON_MAX}.0)]`;
const url = `${BASE}?${encodeURIComponent(q).replaceAll("%2C", ",")}`;

console.log("fetching", startIso, "→", endIso);
console.log(url);
const r = await fetch(url);
if (!r.ok) {
  console.error("HTTP", r.status, await r.text());
  process.exit(1);
}
const data = await r.json();
const rows = data.table.rows;
console.log("rows:", rows.length);

// Collect unique time/lat/lon coordinates in order of appearance.
const times = [], lats = [], lons = [];
const tSet = new Map(), latSet = new Map(), lonSet = new Map();
// GFS (no depth column): row layout is [time, latitude, longitude, u, v].
for (const row of rows) {
  const time = row[0], lat = row[1], lon = row[2];
  if (!tSet.has(time)) { tSet.set(time, times.length); times.push(time); }
  if (!latSet.has(lat)) { latSet.set(lat, lats.length); lats.push(lat); }
  if (!lonSet.has(lon)) { lonSet.set(lon, lons.length); lons.push(lon); }
}
// ERDDAP returns lat descending. Lon ascending. Normalise to fixed grids.
lats.sort((a, b) => b - a);
lons.sort((a, b) => a - b);
const tIdx = new Map(times.map((v, i) => [v, i]));
const latIdx = new Map(lats.map((v, i) => [v, i]));
const lonIdx = new Map(lons.map((v, i) => [v, i]));
const nt = times.length, ny = lats.length, nx = lons.length;
console.log(`grid: ${nx} lon × ${ny} lat × ${nt} time`);

// Layout: [t][y][x] for u, then same for v.
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
console.log(`null cells: ${nullCount}`);

const meta = {
  source: "NOAA ERDDAP · ncep_global_lon180 (NCEP GFS Atmospheric Model)",
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
  layout: "Float32 little-endian, concatenated [u (nt × ny × nx), v (nt × ny × nx)]",
};

await writeFile(new URL("../web/public/gfs.bin", import.meta.url), Buffer.from(buf.buffer));
await writeFile(new URL("../web/public/gfs.json", import.meta.url), JSON.stringify(meta, null, 2));
console.log(`wrote gfs.bin (${buf.byteLength} B) + gfs.json (${nt} timesteps)`);
