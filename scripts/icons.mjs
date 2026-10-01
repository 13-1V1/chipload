// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Rasterizes assets/brand/icon.svg into every PNG the web app, Play Store, and Android launcher need.
// Uses Playwright's Chromium (already a devDependency) — no native image libs.

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const svg = readFileSync(resolve(root, "assets/brand/icon.svg"), "utf8");

const targets = [
  // web / PWA
  ["assets/icons/app-192.png", 192, "full"],
  ["assets/icons/app-512.png", 512, "full"],
  ["assets/icons/maskable-512.png", 512, "full"],
  ["assets/icons/apple-touch-180.png", 180, "full"],
  ["assets/icons/brand-96.png", 96, "full"],
  ["assets/icons/brand-192.png", 192, "full"],
  // store
  ["assets/brand/play-icon-512.png", 512, "full"],
  ["assets/brand/icon-1024.png", 1024, "full"],
  // android launcher (legacy square + adaptive foreground/background)
  ["android/app/src/main/res/mipmap-mdpi/ic_launcher.png", 48, "full"],
  ["android/app/src/main/res/mipmap-hdpi/ic_launcher.png", 72, "full"],
  ["android/app/src/main/res/mipmap-xhdpi/ic_launcher.png", 96, "full"],
  ["android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png", 144, "full"],
  ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png", 192, "full"],
  ["android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png", 48, "round"],
  ["android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png", 72, "round"],
  ["android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png", 96, "round"],
  ["android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png", 144, "round"],
  ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png", 192, "round"],
  ["android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png", 108, "adaptive"],
  ["android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png", 162, "adaptive"],
  ["android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png", 216, "adaptive"],
  ["android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png", 324, "adaptive"],
  ["android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png", 432, "adaptive"],
  // splash (centered art on the blue, 1x–4x)
  ["android/app/src/main/res/drawable/splash.png", 480, "splash"],
  ["android/app/src/main/res/drawable-port-hdpi/splash.png", 800, "splash"],
  ["android/app/src/main/res/drawable-port-xhdpi/splash.png", 1280, "splash"],
  ["android/app/src/main/res/drawable-port-xxhdpi/splash.png", 1600, "splash"],
  ["android/app/src/main/res/drawable-port-xxxhdpi/splash.png", 1920, "splash"],
  ["android/app/src/main/res/drawable-land-hdpi/splash.png", 800, "splash"],
  ["android/app/src/main/res/drawable-land-xhdpi/splash.png", 1280, "splash"],
  ["android/app/src/main/res/drawable-land-xxhdpi/splash.png", 1600, "splash"],
  ["android/app/src/main/res/drawable-land-xxxhdpi/splash.png", 1920, "splash"],
];

const html = (mode, size) => {
  // adaptive: the art fills 108dp with the icon scaled so the mill sits in the 72dp safe zone
  const scale = mode === "adaptive" ? 0.72 : mode === "splash" ? 0.35 : 1;
  const clip = mode === "round" ? "border-radius:50%;" : "";
  return `<!doctype html><html><body style="margin:0;background:${mode === "splash" ? "#121416" : "transparent"}">
    <div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;overflow:hidden;${clip}${mode === "adaptive" ? "background:#2F6FEB;" : ""}">
      <div style="width:${size * scale}px;height:${size * scale}px;${mode === "splash" ? "border-radius:22%;overflow:hidden;" : ""}">${svg.replace(/<\?xml[^>]*\?>/, "").replace(/<!--[\s\S]*?-->/g, "").replace("<svg ", '<svg style="width:100%;height:100%;display:block" ')}</div>
    </div></body></html>`;
};

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [file, size, mode] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html(mode, size));
  const buf = await page.screenshot({ omitBackground: mode !== "splash", clip: { x: 0, y: 0, width: size, height: size } });
  const out = resolve(root, file);
  mkdirSync(resolve(out, ".."), { recursive: true });
  writeFileSync(out, buf);
  console.log("wrote", file);
}
await browser.close();
