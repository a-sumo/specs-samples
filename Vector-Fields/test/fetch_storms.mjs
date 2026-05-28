// Fetches active global tropical cyclones from GDACS and writes a compact
// JSON the web view loads on demand.
//
// Source: https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP
// Filters to TC (tropical cyclone) events with valid point centroids.

import { writeFile } from "node:fs/promises";

const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const url = `https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?fromDate=${since}&eventTypes=TC`;
console.log("fetching", url);

const r = await fetch(url, { headers: { "User-Agent": "earth-winds-lab/1.0" } });
if (!r.ok) {
  console.error("HTTP", r.status, await r.text());
  process.exit(1);
}
const j = await r.json();
const features = j.features || [];
console.log("raw features:", features.length);

// Keep one record per storm — prefer the most recent Point centroid.
const byEvent = new Map();
for (const f of features) {
  const p = f.properties || {};
  if (p.eventtype !== "TC") continue;
  const c = f.geometry?.coordinates;
  if (!Array.isArray(c) || c.length < 2 || typeof c[0] !== "number") continue;
  const key = `${p.eventid}-${p.episodeid}`;
  const fromDate = p.fromdate || "";
  const prev = byEvent.get(key);
  if (!prev || fromDate > prev.fromDate) {
    byEvent.set(key, {
      key,
      name: (p.eventname || p.name || "").replace(/^Tropical Cyclone\s+/i, ""),
      alert: p.alertlevel || "",
      lon: c[0],
      lat: c[1],
      country: p.country || "",
      fromDate,
      toDate: p.todate || "",
      severity: p.severitydata?.severity ?? null,
      severityText: p.severitydata?.severitytext || "",
      url: p.url?.report || "",
    });
  }
}
const storms = Array.from(byEvent.values()).sort((a, b) =>
  (b.fromDate || "").localeCompare(a.fromDate || "")
);
console.log("unique storms:", storms.length);
storms.forEach(s => console.log(" ", s.alert.padEnd(7), s.name, "@", s.lat.toFixed(2), s.lon.toFixed(2)));

const out = {
  source: "GDACS · Global Disaster Alert and Coordination System",
  fetchedAt: new Date().toISOString(),
  windowSince: since,
  count: storms.length,
  storms,
};
await writeFile(new URL("../web/public/storms.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("wrote web/public/storms.json");
