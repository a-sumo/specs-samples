import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "web", "calibration-ui.html");
const outDir = path.join(root, "Assets", "Images", "CalibrationUI");

const captures = [
  ["#calibration_panel", "reference_plane_panel.png"],
  ["#preview_plane", "reference_plane_preview.png"],
];

await fs.mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({ headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1100, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.calibrationUiReady === true);
await page.evaluateHandle("document.fonts.ready");

for (const [selector, filename] of captures) {
  const element = await page.$(selector);
  if (!element) throw new Error(`Missing capture target ${selector}`);
  await element.screenshot({
    path: path.join(outDir, filename),
    omitBackground: true,
  });
}

await browser.close();

console.log(`Rendered ${captures.length} calibration UI textures to ${path.relative(root, outDir)}`);
