import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "web", "vf-definition.html");
const outDir = path.join(root, "Assets", "Images", "StoryUI");
const previewDir = path.join(root, "test", "screenshots", "preview");

const steps = [
  "scalar_to_vector",
  "vf_informal",
  "vf_formal",
  "vf_examples",
  "vf_gradient",
];

await fs.mkdir(outDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const browser = await puppeteer.launch({ headless: "new" });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("console.error:", m.text()); });
await page.setViewport({ width: 1400, height: 2400, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.vfDefinitionReady === true);
await page.evaluateHandle("document.fonts.ready");

for (const id of steps) {
  const el = await page.$(`#vf_def_${id}`);
  if (!el) throw new Error(`Missing #vf_def_${id}`);
  await el.screenshot({ path: path.join(outDir, `vf_def_${id}.png`), omitBackground: true });
}

await page.evaluate(() => { document.body.style.background = "#10141b"; });
for (const id of steps) {
  const el = await page.$(`#vf_def_${id}`);
  if (!el) throw new Error(`Missing #vf_def_${id}`);
  await el.screenshot({ path: path.join(previewDir, `vf_def_${id}.png`) });
}

await browser.close();
console.log(`Rendered ${steps.length} vector-field definition steps to ${path.relative(root, outDir)} (+ previews)`);
