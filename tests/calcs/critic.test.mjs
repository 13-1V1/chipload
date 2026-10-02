// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Gates on the two critic harnesses: the input fuzzer and the machinist checklist must both come back clean.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const NL = String.fromCharCode(10);
const run = (file) => spawnSync(process.execPath, [resolve(import.meta.dirname, "../critic", file)], { encoding: "utf8", timeout: 240000 });

test("fuzz: every option, combination, machine and Pro setting — no NaN / Infinity / undefined, crash, inch unit in mm, or dead control", (t) => {
  const r = run("fuzz.mjs");
  assert.equal(r.status, 0, r.stdout.split(NL).slice(0, 40).join(NL) + r.stderr);
  // handed-off defects and inert fields stay visible in the test output until they're fixed
  for (const line of r.stdout.split(NL)) if (line.startsWith("  note: ")) t.diagnostic(line.slice(8));
});

test("machinist checklist never grades the app against its own tap drill tables", () => {
  // The checklist once compared the tap drill calc with TAP_DRILL_*_TABLE, which the calc itself reads: it could not fail.
  const src = readFileSync(resolve(import.meta.dirname, "../critic/domain.mjs"), "utf8");
  assert.doesNotMatch(src, /TAP_DRILL_(UN|METRIC)_TABLE|data\/threads-(un|metric)\.js/);
});

test("machinist checklist: callouts, tap drills, class limits, G-code, charts", () => {
  const r = run("domain.mjs");
  assert.equal(r.status, 0, r.stdout.split(NL).filter((l) => l.startsWith("FAIL")).join(NL) + r.stderr);
});
