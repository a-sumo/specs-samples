import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const outDir = path.resolve(webRoot, '../Assets/Images/StoryUI');
await fs.mkdir(outDir, { recursive: true });

const TARGETS = [
  { file: 'math-explainer.html', readyFlag: 'mathExplainerReady', prefix: 'math_explainer_' },
  { file: 'vf-definition.html',  readyFlag: 'vfDefinitionReady',   prefix: 'vf_def_' },
];

const browser = await puppeteer.launch({ headless: true });

for (const t of TARGETS) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1480, height: 2400, deviceScaleFactor: 1 });
  const url = 'file://' + path.join(webRoot, t.file);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`window.${t.readyFlag} === true`, { timeout: 15000 });
  // settle KaTeX/SVG layout
  await new Promise(r => setTimeout(r, 400));

  const panels = await page.$$('section.panel');
  for (const panel of panels) {
    const id = await panel.evaluate(el => el.id);
    const box = await panel.boundingBox();
    const out = path.join(outDir, id + '.png');
    await panel.screenshot({ path: out, omitBackground: true });
    console.log(`${id}  ${Math.round(box.width)}x${Math.round(box.height)} -> ${out}`);
  }
  await page.close();
}

await browser.close();
console.log('done');
