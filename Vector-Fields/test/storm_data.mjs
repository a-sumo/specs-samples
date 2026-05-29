const SOURCE = "GDACS · Global Disaster Alert and Coordination System";
const SOURCE_URL = "https://www.gdacs.org/";
const API_URL_BASE = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP";

function round(value, decimals = 1) {
  if (!Number.isFinite(value)) return null;
  const m = 10 ** decimals;
  return Math.round(value * m) / m;
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseWindKmh(text) {
  const match = compactText(text).match(/([0-9]+(?:\.[0-9]+)?)\s*km\/?h/i);
  return match ? asNumber(match[1]) : null;
}

function parseStatus(text) {
  const clean = compactText(text);
  if (!clean) return "";
  return clean.replace(/\s*\(.*/, "").trim();
}

function windBand(windKmh) {
  if (!Number.isFinite(windKmh)) return "Cyclone watch";
  if (windKmh < 63) return "Tropical depression";
  if (windKmh < 119) return "Tropical storm";
  if (windKmh < 154) return "Category 1 equivalent";
  if (windKmh < 178) return "Category 2 equivalent";
  if (windKmh < 209) return "Category 3 equivalent";
  if (windKmh < 252) return "Category 4 equivalent";
  return "Category 5 equivalent";
}

function formatHemisphere(value, positive, negative) {
  const suffix = value >= 0 ? positive : negative;
  return `${Math.abs(value).toFixed(1)}°${suffix}`;
}

function coordinateLabel(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  return `${formatHemisphere(lat, "N", "S")}, ${formatHemisphere(lon, "E", "W")}`;
}

function formatUtcLabel(iso) {
  const time = Date.parse(iso || "");
  if (!Number.isFinite(time)) return "";
  const d = new Date(time);
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())} UTC`;
}

function sourceKey(properties) {
  const eventId = compactText(properties.eventid || properties.eventId || "");
  const episodeId = compactText(properties.episodeid || properties.episodeId || "");
  if (eventId || episodeId) return `${eventId}-${episodeId}`;
  return compactText(properties.key || properties.id || properties.eventname || properties.name || "storm");
}

function normalizeStorm(raw) {
  const severityText = compactText(raw.severityText || raw.severitydata?.severitytext || "");
  const severity = asNumber(raw.severity ?? raw.severitydata?.severity);
  const windKmh = asNumber(raw.windKmh) ?? severity ?? parseWindKmh(severityText);
  const windMps = asNumber(raw.windMps) ?? (Number.isFinite(windKmh) ? round(windKmh / 3.6, 1) : null);
  const lat = asNumber(raw.lat);
  const lon = asNumber(raw.lon);
  const status = compactText(raw.status) || parseStatus(severityText) || windBand(windKmh);
  const band = compactText(raw.windBand) || windBand(windKmh);
  const alert = compactText(raw.alert || raw.alertlevel);
  const country = compactText(raw.country);
  const fromDate = compactText(raw.fromDate || raw.fromdate);
  const toDate = compactText(raw.toDate || raw.todate);
  const updatedLabel = compactText(raw.updatedLabel) || formatUtcLabel(toDate || fromDate);
  const coord = compactText(raw.coordinateLabel) || coordinateLabel(lat, lon);
  const speedText = Number.isFinite(windKmh)
    ? `${Math.round(windKmh)} km/h (${windMps?.toFixed ? windMps.toFixed(1) : round(windMps, 1)} m/s)`
    : "wind speed pending";
  const where = country || coord || "open ocean";
  const name = compactText(raw.name || raw.eventname).replace(/^Tropical Cyclone\s+/i, "") || "Tracked cyclone";
  const summary = compactText(raw.summary) ||
    `${name} is reported near ${where}. GDACS lists ${speedText} maximum wind and a ${alert || "tracked"} alert level.`;

  return {
    key: compactText(raw.key) || sourceKey(raw),
    eventId: compactText(raw.eventId || raw.eventid),
    episodeId: compactText(raw.episodeId || raw.episodeid),
    name,
    alert,
    lon,
    lat,
    country,
    fromDate,
    toDate,
    severity,
    severityText,
    windKmh: Number.isFinite(windKmh) ? round(windKmh, 1) : null,
    windMps: Number.isFinite(windMps) ? round(windMps, 1) : null,
    status,
    windBand: band,
    coordinateLabel: coord,
    updatedLabel,
    url: compactText(raw.url || raw.reportUrl || raw.report || ""),
    summary,
  };
}

export function gdacsUrl(since) {
  return `${API_URL_BASE}?fromDate=${since}&eventTypes=TC`;
}

export function stormPayloadFromGdacs(geojson, options = {}) {
  const byEvent = new Map();
  const features = Array.isArray(geojson?.features) ? geojson.features : [];

  for (const feature of features) {
    const p = feature.properties || {};
    if (p.eventtype !== "TC") continue;
    const c = feature.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2 || typeof c[0] !== "number" || typeof c[1] !== "number") continue;

    const key = `${p.eventid || ""}-${p.episodeid || ""}`;
    const fromDate = compactText(p.fromdate);
    const previous = byEvent.get(key);
    if (previous && fromDate <= previous.fromDate) continue;

    byEvent.set(key, normalizeStorm({
      key,
      eventId: p.eventid,
      episodeId: p.episodeid,
      name: p.eventname || p.name,
      alert: p.alertlevel,
      lon: c[0],
      lat: c[1],
      country: p.country,
      fromDate,
      toDate: p.todate,
      severity: p.severitydata?.severity ?? null,
      severityText: p.severitydata?.severitytext || "",
      url: p.url?.report || "",
    }));
  }

  return normalizeStormPayload({
    source: SOURCE,
    sourceUrl: SOURCE_URL,
    fetchedAt: options.fetchedAt || new Date().toISOString(),
    windowSince: options.windowSince || "",
    mode: "live",
    usingFallback: false,
    storms: Array.from(byEvent.values()).sort((a, b) => (b.fromDate || "").localeCompare(a.fromDate || "")),
  });
}

export function normalizeStormPayload(payload, options = {}) {
  const storms = Array.isArray(payload?.storms) ? payload.storms.map(normalizeStorm) : [];
  return {
    source: compactText(payload?.source) || SOURCE,
    sourceUrl: compactText(payload?.sourceUrl) || SOURCE_URL,
    fetchedAt: compactText(payload?.fetchedAt) || options.fetchedAt || new Date().toISOString(),
    generatedAt: options.generatedAt || new Date().toISOString(),
    windowSince: compactText(payload?.windowSince) || options.windowSince || "",
    mode: compactText(options.mode || payload?.mode) || "live",
    usingFallback: Boolean(options.usingFallback ?? payload?.usingFallback ?? false),
    fallbackReason: compactText(options.fallbackReason || payload?.fallbackReason),
    count: storms.length,
    storms,
  };
}

export function renderStormsTs(payload) {
  const normalized = normalizeStormPayload(payload);
  return `// AUTO-GENERATED by test/fetch_storms.mjs or test/bake_for_ls.mjs.
// Source: ${normalized.source}
// Fetched: ${normalized.fetchedAt}
// Mode: ${normalized.mode}${normalized.usingFallback ? " (cached fallback)" : ""}

export interface Storm {
  key: string;
  eventId: string;
  episodeId: string;
  name: string;
  alert: string;
  lon: number | null;
  lat: number | null;
  country: string;
  fromDate: string;
  toDate: string;
  severity: number | null;
  severityText: string;
  windKmh: number | null;
  windMps: number | null;
  status: string;
  windBand: string;
  coordinateLabel: string;
  updatedLabel: string;
  url: string;
  summary: string;
}

export const STORMS_SOURCE = ${JSON.stringify(normalized.source)};
export const STORMS_SOURCE_URL = ${JSON.stringify(normalized.sourceUrl)};
export const STORMS_FETCHED_AT = ${JSON.stringify(normalized.fetchedAt)};
export const STORMS_GENERATED_AT = ${JSON.stringify(normalized.generatedAt)};
export const STORMS_WINDOW_SINCE = ${JSON.stringify(normalized.windowSince)};
export const STORMS_DATA_MODE = ${JSON.stringify(normalized.mode)};
export const STORMS_USING_FALLBACK = ${normalized.usingFallback ? "true" : "false"};
export const STORMS_FALLBACK_REASON = ${JSON.stringify(normalized.fallbackReason)};
export const STORMS: Storm[] = ${JSON.stringify(normalized.storms, null, 2)};
`;
}
