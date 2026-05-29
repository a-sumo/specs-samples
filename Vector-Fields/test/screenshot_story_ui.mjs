import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "test", "screenshots");

await fs.mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({ headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1400, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.join(root, "web", "story-ui-review.html")).href, { waitUntil: "domcontentloaded" });
await page.evaluateHandle("document.fonts.ready");
await page.screenshot({ path: path.join(outDir, "story_ui_review.png"), fullPage: true });
await browser.close();

console.log(`Wrote ${path.relative(root, path.join(outDir, "story_ui_review.png"))}`);
