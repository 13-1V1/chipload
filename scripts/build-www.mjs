// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Assembles www/ (what Capacitor ships inside the APK): the app shell, src/, vendor/, and the
// fonts and icons the app loads. tests/, legacy/ and the store artwork never make it into the bundle.

import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const www = resolve(root, "www");

if (!existsSync(resolve(root, "vendor"))) execSync("node scripts/vendor.mjs", { cwd: root, stdio: "inherit" });

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const item of ["index.html", "manifest.webmanifest", "sw.js", "LICENSE"]) {
  if (existsSync(resolve(root, item))) cpSync(resolve(root, item), resolve(www, item));
}
// assets/brand (Play Store screenshots, feature graphic) is 2.6 MB the app never opens — leave it out
for (const dir of ["src", "vendor", "assets/fonts", "assets/icons"]) cpSync(resolve(root, dir), resolve(www, dir), { recursive: true });
console.log("www/ ready");
