// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import { near } from "../helpers.mjs";
import { mowSolveMExternal, mowSolveEExternal, mowSolveMInternal, mowSolveEInternal, bestWire, wireRange, stockWire, pitchDiameterWindow } from "../../src/core/mow.js";

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

// Thread wires are sold at the best size for each pitch (Pratt & Whitney / Thread Check wire charts, W = 0.57735 P):
// 20 TPI .02887, 18 TPI .03208, 16 TPI .03608, 13 TPI .04441, 8 TPI .07217, 4 TPI .14434; metric 1.5 mm pitch 0.866 mm.
test("wire range and the wire sets sell the best size", () => {
  const r = wireRange(0.05);
  near(r.min, 0.02525, 1e-9);
  near(r.max, 0.0505, 1e-9);
  for (const [tpi, want] of [[20, 0.02887], [18, 0.03208], [16, 0.03608], [13, 0.04441], [8, 0.07217], [4, 0.14434]]) near(stockWire(1 / tpi, "in"), want, 1e-9, `${tpi} TPI`);
  near(stockWire(1.5, "mm"), 0.866, 1e-9);
  // Metric best-size wires, W = 0.57735 P to 0.0001 mm (Pratt & Whitney / Thread Check):
  // 0.5 mm 0.2887, 1.0 0.5774, 1.25 0.7217, 1.75 1.0104, 2.0 1.1547, 2.5 1.4434.
  for (const [pitch, want] of [[0.5, 0.2887], [1, 0.5774], [1.25, 0.7217], [1.75, 1.0104], [2, 1.1547], [2.5, 1.4434]]) near(stockWire(pitch, "mm"), want, 1e-9, `${pitch} mm`);
});

// Every ISO 261 pitch has a wire in the mm set at the best size, to the set's 0.0001 mm.
test("every ISO 261 pitch has its best wire in the mm set", () => {
  for (const pitch of [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7, 0.75, 0.8, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6]) {
    near(stockWire(pitch, "mm"), bestWire(pitch), 0.00005, `${pitch} mm`);
  }
});

// ASME B1.1 basic profile: 1/4-20 external minor 0.1887 in, major 0.250 in. A PD outside that can't be a 1/4-20.
test("pitch-diameter window runs from the root to the major", () => {
  const w = pitchDiameterWindow(0.25, 0.05);
  near(w.min, 0.18866, 1e-5);
  near(w.max, 0.25, 1e-12);
});
