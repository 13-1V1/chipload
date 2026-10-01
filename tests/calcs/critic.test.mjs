// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Gates on the two critic harnesses: the input fuzzer and the machinist checklist must both come back clean.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const NL = String.fromCharCode(10);
const run = (file) => spawnSync(process.execPath, [resolve(import.meta.dirname, "../critic", file)], { encoding: "utf8", timeout: 240000 });

test("fuzz: no calculator leaks NaN / Infinity / undefined or crashes on hostile input", () => {
  const r = run("fuzz.mjs");
  assert.equal(r.status, 0, r.stdout.split(NL).slice(0, 40).join(NL) + r.stderr);
});

test("machinist checklist: callouts, tap drills, class limits, G-code, charts", () => {
  const r = run("domain.mjs");
  assert.equal(r.status, 0, r.stdout.split(NL).filter((l) => l.startsWith("FAIL")).join(NL) + r.stderr);
});
