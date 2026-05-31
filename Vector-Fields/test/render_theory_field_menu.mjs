import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "web", "theory-field-menu.html");
const outDir = path.join(root, "Assets", "Images", "StoryUI");

const modes = [
  {
    id: "expansion",
    title: "Expansion",
    copy: "The cube field radiates outward from the sample volume. Divergence stays positive while curl stays flat.",
    divergence: "+2.00",
    curl: "+0.00",
  },
  {
    id: "contraction",
    title: "Contraction",
    copy: "The cube field pulls inward through the volume. Divergence stays negative while curl stays flat.",
    divergence: "-2.00",
    curl: "+0.00",
  },
  {
    id: "curl",
    title: "Curl",
    copy: "The cube arrows circulate around the sample. Local spin reads as curl without a source or sink at center.",
    divergence: "+0.00",
    curl: "+2.00",
  },
  {
    id: "motion",
    title: "Motion",
    copy: "Use the handle to stir the planar field, then move the sample cursor to measure how local divergence and curl change.",
    divergence: "live",
    curl: "live",
  },
];

const palettes = [
  "jet",
  "viridis",
  "plasma",
];

await fs.mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({ headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 980, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.theoryMenuReady === true);
await page.evaluateHandle("document.fonts.ready");

for (const mode of modes) {
  const hot = { expansion: "div", contraction: "div", curl: "curl", motion: "both" }[mode.id] || "none";
  const signature = {
    expansion: "∇·F &gt; 0<span class=\"sep\"></span>∇×F = 0",
    contraction: "∇·F &lt; 0<span class=\"sep\"></span>∇×F = 0",
    curl: "∇·F = 0<span class=\"sep\"></span>∇×F ≠ 0",
    motion: "∇·F&nbsp;&nbsp;live<span class=\"sep\"></span>∇×F&nbsp;&nbsp;live",
  }[mode.id] || "";
  await page.evaluate((nextMode, hotKey, sig) => {
    document.querySelector(".title").textContent = nextMode.title;
    // Motion is interactive: no fixed condition or values, so show how to drive
    // it instead of the empty live/live readout.
    const isMotion = nextMode.id === "motion";
    document.getElementById("theory_panel").classList.toggle("motion-panel", isMotion);
    document.getElementById("signature").hidden = isMotion;
    document.getElementById("readout").hidden = isMotion;
    document.getElementById("instruction").hidden = !isMotion;
    if (!isMotion) {
      document.getElementById("signature").innerHTML = sig;
      document.getElementById("divValue").textContent = nextMode.divergence.replace("-", "−");
      document.getElementById("curlValue").textContent = nextMode.curl.replace("-", "−");
      const dm = document.getElementById("divMetric");
      const cm = document.getElementById("curlMetric");
      dm.classList.toggle("hot", hotKey === "div" || hotKey === "both");
      cm.classList.toggle("hot", hotKey === "curl" || hotKey === "both");
    }
  }, mode, hot, signature);

  const panel = await page.$("#theory_panel");
  if (!panel) throw new Error("Missing capture target #theory_panel");
  await panel.screenshot({
    path: path.join(outDir, `theory_field_panel_${mode.id}.png`),
    omitBackground: true,
  });
}

for (const mode of modes) {
  for (const state of ["normal", "active", "pressed"]) {
    const selector = `#mode_${mode.id}_${state}`;
    const button = await page.$(selector);
    if (!button) throw new Error(`Missing capture target ${selector}`);
    await button.screenshot({
      path: path.join(outDir, `theory_mode_${mode.id}_${state}.png`),
      omitBackground: true,
    });
  }
}

for (const palette of palettes) {
  for (const state of ["normal", "active", "pressed"]) {
    const selector = `#palette_${palette}_${state}`;
    const button = await page.$(selector);
    if (!button) throw new Error(`Missing capture target ${selector}`);
    await button.screenshot({
      path: path.join(outDir, `palette_${palette}_${state}.png`),
      omitBackground: true,
    });
  }
}

for (const [selector, filename] of [
  ["#slider_backplate", "slider_backplate.png"],
  ["#slider_track", "slider_track.png"],
  ["#slider_fill", "slider_fill.png"],
  ["#slider_knob", "slider_knob.png"],
]) {
  const element = await page.$(selector);
  if (!element) throw new Error(`Missing capture target ${selector}`);
  await element.screenshot({
    path: path.join(outDir, filename),
    omitBackground: true,
  });
}

await browser.close();

console.log(`Rendered ${modes.length} theory panels, ${modes.length * 3} mode buttons, ${palettes.length * 3} palette buttons, and 4 slider assets to ${path.relative(root, outDir)}`);
