import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "web", "story-ui-templates.html");
const outDir = path.join(root, "test", "screenshots", "preview");

await fs.mkdir(outDir, { recursive: true });

const targets = [
  "#panel",
  "#examples_panel",
  "#theory_panel",
  "#example_detail_gravity_panel",
  "#example_detail_gravity_artemis_panel",
  "#card_intro_normal",
  "#card_theory_active",
  "#card_examples_pressed",
  "#example_gravity_normal",
  "#example_magnetism_active",
  "#variant_artemis_active",
  "#overlay_card_hover",
  "#overlay_example_selected",
  "#cursor_hover",
  "#panel_cursor_wash",
];

const browser = await puppeteer.launch({ headless: "new" });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("console.error:", m.text()); });
await page.setViewport({ width: 1600, height: 1400, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.storyUiReady === true);
await page.evaluateHandle("document.fonts.ready");

for (const sel of targets) {
  const el = await page.$(sel);
  if (!el) { console.log("MISSING", sel); continue; }
  const name = sel.replace("#", "") + ".png";
  await el.screenshot({ path: path.join(outDir, name), omitBackground: true });
}

await browser.close();
console.log(`Wrote ${targets.length} preview shots to ${path.relative(root, outDir)}`);
