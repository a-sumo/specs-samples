// Fetches a NASA OSCAR ocean-surface-current snapshot from the public NOAA
// ERDDAP mirror (Earth & Space Research / JPL processing) and writes a compact
// binary (Float32) + metadata JSON for the earth-winds page to load.
//
// Source: https://coastwatch.pfeg.noaa.gov/erddap/griddap/jplOscar.html
// Dataset: jplOscar — OSCAR Sea Surface Velocity, 1/3°, L4, 5-day composite.

import { writeFile } from 'node:fs/promises';

const BASE = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/jplOscar.json';
const TIME = '2016-09-26T00:00:00Z'; // latest in this mirror's coverage
const DEPTH = '15.0';
const STRIDE = 3;                    // 0.333° native → 1° output
const LON_MIN = 20;
const LON_MAX = 380;                 // 360° span (OSCAR's overlap stops at 420)
const LAT_MIN = -80;
const LAT_MAX = 80;

const q =
  `u[(${TIME})][(${DEPTH})][(${LAT_MIN}.0):${STRIDE}:(${LAT_MAX}.0)][(${LON_MIN}.0):${STRIDE}:(${LON_MAX}.0)],` +
  `v[(${TIME})][(${DEPTH})][(${LAT_MIN}.0):${STRIDE}:(${LAT_MAX}.0)][(${LON_MIN}.0):${STRIDE}:(${LON_MAX}.0)]`;
const url = `${BASE}?${encodeURIComponent(q).replaceAll('%2C', ',')}`;

console.log('fetching', url);
const r = await fetch(url);
if (!r.ok) {
  console.error('HTTP', r.status, await r.text());
  process.exit(1);
}
const data = await r.json();
const rows = data.table.rows;
console.log('rows:', rows.length);

// Build a uniform grid keyed by [lat][lon]. ERDDAP returns rows in (lat desc, lon asc) order.
const lats = [], lons = [];
const latSet = new Set(), lonSet = new Set();
for (const row of rows) {
  const lat = row[2], lon = row[3];
  if (!latSet.has(lat)) { latSet.add(lat); lats.push(lat); }
  if (!lonSet.has(lon)) { lonSet.add(lon); lons.push(lon); }
}
lats.sort((a, b) => b - a); // north to south
lons.sort((a, b) => a - b);
const ny = lats.length;
const nx = lons.length;
console.log(`grid: ${nx} lon × ${ny} lat`);

const latIdx = new Map(lats.map((v, i) => [v, i]));
const lonIdx = new Map(lons.map((v, i) => [v, i]));

const u = new Float32Array(nx * ny);
const v = new Float32Array(nx * ny);
let landCount = 0;
for (const row of rows) {
  const i = latIdx.get(row[2]) * nx + lonIdx.get(row[3]);
  const uVal = row[4], vVal = row[5];
  if (uVal == null || vVal == null) {
    landCount++;
    u[i] = 0; v[i] = 0;
  } else {
    u[i] = uVal;
    v[i] = vVal;
  }
}
console.log(`land/no-data cells: ${landCount} / ${nx * ny}`);

// Concatenate u then v into one Float32 buffer.
const out = new Float32Array(nx * ny * 2);
out.set(u, 0);
out.set(v, nx * ny);
const buf = Buffer.from(out.buffer);

const lonRes = (lons[lons.length - 1] - lons[0]) / (nx - 1);
const latRes = (lats[0] - lats[lats.length - 1]) / (ny - 1);

const meta = {
  source: 'NOAA ERDDAP · jplOscar (Earth & Space Research / JPL)',
  time: TIME,
  depth_m: Number(DEPTH),
  nx, ny,
  lonMin: lons[0],
  lonMax: lons[lons.length - 1],
  latMax: lats[0],     // first row is north
  latMin: lats[lats.length - 1],
  lonRes,
  latRes,
  units: 'm/s',
  byteOrder: 'little-endian',
  layout: 'concatenated [u (Float32, ny×nx, north-to-south, west-to-east), v (same shape)]',
};

await writeFile(new URL('../web/public/oscar.bin', import.meta.url), buf);
await writeFile(new URL('../web/public/oscar.json', import.meta.url), JSON.stringify(meta, null, 2));
console.log(`wrote oscar.bin (${buf.length} B) + oscar.json`);
