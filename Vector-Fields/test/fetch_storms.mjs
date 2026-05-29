// Refreshes tropical cyclone event data from GDACS, then bakes the same
// normalized snapshot for both the web preview and Lens Studio runtime.
//
// Live path:    GDACS API -> web/public/storms.json -> Assets/Scripts/StormsData.ts
// Offline path: existing storms.json or storms.backup.json -> StormsData.ts

import { readFile, writeFile } from "node:fs/promises";
import {
  gdacsUrl,
  normalizeStormPayload,
  renderStormsTs,
  stormPayloadFromGdacs,
} from "./storm_data.mjs";

const STORM_WINDOW_DAYS = Number(process.env.STORM_WINDOW_DAYS || 14);
const since = new Date(Date.now() - STORM_WINDOW_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 10);
const url = gdacsUrl(since);
const stormsJsonPath = new URL("../web/public/storms.json", import.meta.url);
const stormsBackupPath = new URL("../web/public/storms.backup.json", import.meta.url);
const stormsTsPath = new URL("../Assets/Scripts/StormsData.ts", import.meta.url);

async function readCachedPayload(reason) {
  const candidates = [stormsJsonPath, stormsBackupPath];
  for (const path of candidates) {
    try {
      const cached = JSON.parse(await readFile(path, "utf8"));
      return normalizeStormPayload(cached, {
        mode: "cached",
        usingFallback: true,
        fallbackReason: reason,
        windowSince: cached.windowSince || since,
      });
    } catch (e) {
      // Try the next real-data cache.
    }
  }

  return normalizeStormPayload({
    fetchedAt: new Date().toISOString(),
    windowSince: since,
    mode: "empty",
    usingFallback: true,
    fallbackReason: reason,
    storms: [],
  });
}

async function fetchLivePayload() {
  console.log("fetching", url);
  const response = await fetch(url, {
    headers: { "User-Agent": "earth-winds-lab/1.0" },
  });
  if (!response.ok) {
    throw new Error(`GDACS HTTP ${response.status}: ${await response.text()}`);
  }
  const json = await response.json();
  return stormPayloadFromGdacs(json, {
    fetchedAt: new Date().toISOString(),
    windowSince: since,
  });
}

async function writeArtifacts(payload) {
  const normalized = normalizeStormPayload(payload);
  await writeFile(stormsJsonPath, JSON.stringify(normalized, null, 2) + "\n");
  await writeFile(stormsTsPath, renderStormsTs(normalized));

  if (normalized.mode === "live" && normalized.storms.length > 0) {
    await writeFile(stormsBackupPath, JSON.stringify(normalized, null, 2) + "\n");
  }
}

let payload;
try {
  payload = await fetchLivePayload();
  console.log("live storms:", payload.storms.length);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn("live storm fetch failed:", message);
  payload = await readCachedPayload(message);
  console.log("using cached real storm data:", payload.storms.length);
}

await writeArtifacts(payload);
for (const storm of payload.storms) {
  const speed = storm.windKmh == null ? "wind pending" : `${Math.round(storm.windKmh)} km/h`;
  console.log(`  ${storm.alert.padEnd(7)} ${storm.name} · ${speed} · ${storm.coordinateLabel}`);
}
console.log("wrote web/public/storms.json");
console.log("wrote Assets/Scripts/StormsData.ts");
