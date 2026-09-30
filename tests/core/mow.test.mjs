// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import { near } from "../helpers.mjs";
import { mowSolveMExternal, mowSolveEExternal, mowSolveMInternal, mowSolveEInternal, bestWire, wireRange, stockWire } from "../../src/core/mow.js";

// Machinery's Handbook: 20 TPI best wire = 0.02887; 1/4-20 at basic PD 0.2175 → M = 0.2608
test("1/4-20 measurement over wires matches handbook", () => {
  const pitch = 1 / 20;
  near(bestWire(pitch), 0.02887, 0.00001);
  near(mowSolveMExternal(0.2175, 0.02887, pitch), 0.2608, 0.0001);
});

test("external and internal solves round-trip", () => {
  const pitch = 1 / 20, wire = bestWire(pitch), pd = 0.2175;
  near(mowSolveEExternal(mowSolveMExternal(pd, wire, pitch), wire, pitch), pd, 1e-12);
  near(mowSolveEInternal(mowSolveMInternal(pd, wire, pitch), wire, pitch), pd, 1e-12);
});

test("wire range and stock wire", () => {
  const r = wireRange(0.05);
  near(r.min, 0.02525, 1e-9);
  near(r.max, 0.0505, 1e-9);
  near(stockWire(0.05, "in"), 0.028, 1e-9);
  near(stockWire(1.5, "mm"), 0.9, 1e-9);
});
