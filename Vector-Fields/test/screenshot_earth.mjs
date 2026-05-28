import puppeteer from 'puppeteer';

const url = 'http://127.0.0.1:4329/earth-winds.html';
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 980, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console.error:', m.text()); else console.log('[console.' + m.type() + ']', m.text()); });
await page.goto(url, { waitUntil: 'domcontentloaded' });
// Give the Earth texture + GFS time to load + first render to complete.
await new Promise(r => setTimeout(r, 9000));
await page.screenshot({ path: 'test/screenshots/earth_winds_lab_initial.png' });

// Switch to jet stream
await page.click('button[data-layer="jet"]');
await new Promise(r => setTimeout(r, 2500));
await page.screenshot({ path: 'test/screenshots/earth_winds_lab_jet.png' });

// Switch to ocean (this triggers the OSCAR fetch)
await page.click('button[data-layer="ocean"]');
await new Promise(r => setTimeout(r, 5000));
await page.screenshot({ path: 'test/screenshots/earth_winds_lab_ocean.png' });

// Rotate to W Pacific to capture Typhoon JANGMI marker.
const cv = await page.$('canvas');
const box = await cv.boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
await page.mouse.move(cx + 280, cy);
await page.mouse.down();
await page.mouse.move(cx - 280, cy, { steps: 30 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 4000));
await page.screenshot({ path: 'test/screenshots/earth_winds_lab_ocean_pacific.png' });

// Capture the wind layer at the Pacific too.
await page.click('button[data-layer="wind"]');
await new Promise(r => setTimeout(r, 4000));
await page.screenshot({ path: 'test/screenshots/earth_winds_lab_pacific_wind.png' });

await browser.close();
console.log('done');
