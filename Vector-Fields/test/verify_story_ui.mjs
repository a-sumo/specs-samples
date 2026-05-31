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
  "#example_detail_magnetism_panel",
  "#example_detail_aerodynamics_panel",
  "#card_theory_active",
  "#card_examples_pressed",
  "#example_gravity_normal",
  "#example_magnetism_active",
  "#example_aerodynamics_normal",
  "#variant_artemis_active",
  "#overlay_card_hover",
  "#overlay_example_selected",
  "#cursor_hover",
  "#panel_cursor_wash",
];

const aspectChecks = [
  ["Assets/Images/StoryUI/chapter_panel_main_v3.png", 30 / 20],
  ["Assets/Images/StoryUI/examples_panel.png", 30 / 20],
  ["Assets/Images/StoryUI/theory_panel.png", 30 / 20],
  ["Assets/Images/StoryUI/theory_panel_motion.png", 30 / 20],
  ["Assets/Images/StoryUI/example_detail_magnetism_panel.png", 30 / 20],
  ["Assets/Images/StoryUI/card_theory_main_v3_normal.png", 12.8 / 13],
  ["Assets/Images/StoryUI/card_theory_main_v3_active.png", 12.8 / 13],
  ["Assets/Images/StoryUI/card_theory_main_v3_pressed.png", 12.8 / 13],
  ["Assets/Images/StoryUI/card_examples_main_v3_normal.png", 12.8 / 13],
  ["Assets/Images/StoryUI/card_examples_main_v3_active.png", 12.8 / 13],
  ["Assets/Images/StoryUI/card_examples_main_v3_pressed.png", 12.8 / 13],
  ["Assets/Images/StoryUI/card_definition_normal.png", 400 / 600],
  ["Assets/Images/StoryUI/card_definition_active.png", 400 / 600],
  ["Assets/Images/StoryUI/card_definition_pressed.png", 400 / 600],
  ["Assets/Images/StoryUI/card_metrics_normal.png", 400 / 600],
  ["Assets/Images/StoryUI/card_metrics_active.png", 400 / 600],
  ["Assets/Images/StoryUI/card_metrics_pressed.png", 400 / 600],
  ["Assets/Images/StoryUI/card_patterns_normal.png", 400 / 600],
  ["Assets/Images/StoryUI/card_patterns_active.png", 400 / 600],
  ["Assets/Images/StoryUI/card_patterns_pressed.png", 400 / 600],
  ["Assets/Images/StoryUI/utility_follow_on.png", 260 / 86],
  ["Assets/Images/StoryUI/utility_fold_open.png", 260 / 86],
  ["Assets/Images/StoryUI/utility_plane_floor_on.png", 260 / 86],
  ["Assets/Images/StoryUI/utility_plane_front_off.png", 260 / 86],
  ["Assets/Images/StoryUI/example_gravity_normal.png", 27.2 / 2.8],
  ["Assets/Images/StoryUI/example_magnetism_normal.png", 27.2 / 2.8],
  ["Assets/Images/StoryUI/example_wind_normal.png", 27.2 / 2.8],
  ["Assets/Images/StoryUI/example_aerodynamics_normal.png", 27.2 / 2.8],
  ["Assets/Images/StoryUI/math_explainer_operator.png", 26.4 / 8.56],
  ["Assets/Images/StoryUI/vf_def_vf_formal.png", 26.4 / 8.56],
];

function pngSize(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("Not a PNG");
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function assertAspect(file, expectedRatio) {
  const fullPath = path.join(root, file);
  const size = pngSize(await fs.readFile(fullPath));
  const ratio = size.width / size.height;
  const delta = Math.abs(ratio - expectedRatio);
  if (delta > 0.012) {
    throw new Error(`${file} aspect ${ratio.toFixed(4)} does not match slot ${expectedRatio.toFixed(4)} (${size.width}x${size.height})`);
  }
}

for (const [file, ratio] of aspectChecks) {
  await assertAspect(file, ratio);
}

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
