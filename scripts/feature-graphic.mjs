// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Play Store feature graphic, 1024 × 500: icon art on layout blue with the one-line pitch.

import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const svg = readFileSync(resolve(root, "assets/brand/icon.svg"), "utf8").replace(/<\?xml[^>]*\?>/, "").replace(/<!--[\s\S]*?-->/g, "");
const font = readFileSync(resolve(root, "assets/fonts/ibm-plex-sans-latin.woff2")).toString("base64");

const html = `<!doctype html><html><head><style>
  @font-face { font-family: Plex; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 400 700; }
  body { margin: 0; width: 1024px; height: 500px; background: linear-gradient(135deg, #3A7BF2, #2358C4); font-family: Plex, system-ui, sans-serif; color: #fff; overflow: hidden; position: relative; }
  .ticks { position: absolute; left: 0; right: 0; bottom: 0; height: 28px; background: repeating-linear-gradient(to right, rgba(92,225,230,.55) 0 2px, transparent 2px 40px); opacity: .9; }
  .icon { position: absolute; left: 64px; top: 70px; width: 360px; height: 360px; border-radius: 80px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.35); }
  .icon svg { width: 100%; height: 100%; display: block; }
  .text { position: absolute; left: 470px; top: 110px; right: 56px; }
  h1 { margin: 0; font-size: 72px; font-weight: 700; letter-spacing: -.01em; line-height: 1; }
  h1 small { display: block; font-size: 28px; font-weight: 500; opacity: .85; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 14px; }
  p { margin: 22px 0 0; font-size: 30px; line-height: 1.3; font-weight: 500; color: #E8F3FF; }
  p b { color: #5CE1E6; font-weight: 600; }
</style></head><body>
  <div class="icon">${svg.replace("<svg ", '<svg preserveAspectRatio="xMidYMid slice" ')}</div>
  <div class="text"><h1><small>Machinist calculator</small>Chipload</h1><p>Every machinist calc in one app.<br><b>No subscription.</b> No ads. Works offline.</p></div>
  <div class="ticks"></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.waitForTimeout(200);
writeFileSync(resolve(root, "assets/brand/feature-graphic.png"), await page.screenshot());
await browser.close();
console.log("wrote assets/brand/feature-graphic.png");
