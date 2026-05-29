import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import puppeteer from "puppeteer";

const url = process.env.AMBIENT_URL || "http://127.0.0.1:4324/ambient-ui.html";
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../../test/screenshots");

const captures = [
  {
    name: "audio-vector-plane-desktop.png",
    seek: 212,
    viewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
  },
  {
    name: "audio-vector-plane-mobile.png",
    seek: 300,
    viewport: { width: 390, height: 844, deviceScaleFactor: 2 },
  },
];

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({ headless: true });
const results = [];

try {
  for (const capture of captures) {
    const page = await browser.newPage();
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.setViewport(capture.viewport);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#ambientCanvas", { timeout: 10000 });
    await delay(1000);
    await page.$eval(
      "#timeline",
      (input, value) => {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      },
      String(capture.seek)
    );
    await delay(900);

    const info = await page.evaluate(() => {
      const canvas = document.querySelector("#ambientCanvas");
      const labels = [...document.querySelectorAll(".meter b")].map((node) => node.textContent);
      const values = [...document.querySelectorAll(".meter span")].map((node) => node.textContent);
      return {
        labels,
        values,
        title: document.title,
        canvas: canvas
          ? {
              width: canvas.width,
              height: canvas.height,
              clientWidth: canvas.clientWidth,
              clientHeight: canvas.clientHeight,
            }
          : null,
      };
    });

    const path = resolve(outDir, capture.name);
    await page.screenshot({ path, fullPage: false });
    results.push({ ...capture, path, errors, info });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));
