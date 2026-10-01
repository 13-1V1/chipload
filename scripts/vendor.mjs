// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Copies the Capacitor ESM builds out of node_modules into vendor/ so the app can import them
// through the import map in index.html — no bundler needed.

import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "vendor");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// core is a single-file ESM bundle
cpSync(resolve(root, "node_modules/@capacitor/core/dist/index.js"), resolve(out, "capacitor-core.js"));

// TypeScript-style extensionless relative imports ("./web", "./definitions") don't resolve in a browser — add .js
const RELATIVE_IMPORT = /((?:from\s+|import\()\s*)(['"])(\.\.?\/[^'"]+?)\2/g;
const fixImports = (code) => code.replace(RELATIVE_IMPORT, (m, pre, q, path) => (/\.[a-z]+$/i.test(path) ? m : `${pre}${q}${path}.js${q}`));

// plugins ship dist/esm/ with relative imports plus a bare "@capacitor/core" import (resolved by the import map)
for (const plugin of ["app", "share", "filesystem", "status-bar", "splash-screen"]) {
  const src = resolve(root, `node_modules/@capacitor/${plugin}/dist/esm`);
  if (!existsSync(src)) { console.error(`missing ${src}`); process.exit(1); }
  cpSync(src, resolve(out, plugin), { recursive: true, filter: (p) => !p.endsWith(".map") && !p.endsWith(".d.ts") });
  for (const f of readdirSync(resolve(out, plugin)).filter((n) => n.endsWith(".js"))) {
    const fp = resolve(out, plugin, f);
    writeFileSync(fp, fixImports(readFileSync(fp, "utf8")));
  }
}
// synapse is a tiny helper the filesystem plugin imports
cpSync(resolve(root, "node_modules/@capacitor/synapse/dist/synapse.mjs"), resolve(out, "capacitor-synapse.js"));

const versions = {};
for (const pkg of ["core", "android", "app", "share", "filesystem", "status-bar", "splash-screen"]) {
  versions[pkg] = JSON.parse(readFileSync(resolve(root, `node_modules/@capacitor/${pkg}/package.json`), "utf8")).version;
}
writeFileSync(resolve(out, "VERSIONS.json"), JSON.stringify(versions, null, 2) + "\n");
console.log("vendor/ ready", versions);
