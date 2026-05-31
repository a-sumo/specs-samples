import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "web", "math-explainer.html");
const outDir = path.join(root, "Assets", "Images", "StoryUI");
const previewDir = path.join(root, "test", "screenshots", "preview");

const steps = [
  "del_intro",
  "operator",
  "del_coordinates",
  "divergence",
  "divergence_example",
  "curl",
  "curl_example",
];

await fs.mkdir(outDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const browser = await puppeteer.launch({ headless: "new" });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.setViewport({ width: 1200, height: 2400, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.mathExplainerReady === true);
await page.evaluateHandle("document.fonts.ready");

// Baked assets: transparent background.
for (const id of steps) {
  const el = await page.$(`#math_explainer_${id}`);
  if (!el) throw new Error(`Missing #math_explainer_${id}`);
  await el.screenshot({ path: path.join(outDir, `math_explainer_${id}.png`), omitBackground: true });
}

// Review composites over a dark scene-like backdrop to judge contrast.
await page.evaluate(() => { document.body.style.background = "#10141b"; });
for (const id of steps) {
  const el = await page.$(`#math_explainer_${id}`);
  await el.screenshot({ path: path.join(previewDir, `math_explainer_${id}.png`) });
}

await browser.close();
console.log(`Rendered ${steps.length} math explainer steps to ${path.relative(root, outDir)} (+ previews)`);
