// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Measurement over wires (3-wire). Pro.

import { register } from "../app/registry.js";
import { mowSolveMExternal, mowSolveEExternal, mowSolveMInternal, mowSolveEInternal, bestWire, wireRange, stockWire } from "../core/mow.js";
import { basicThreadGeometry, unToleranceEnvelope } from "../core/thread.js";
import { fmt } from "../core/format.js";
import { threadFromSpec, threadPrefill, toIn, fromIn, lenPlaces, COMMON_THREADS } from "./_util.js";

export default register({
  id: "mow",
  title: "Measure over wires",
  short: "3-wire pitch diameter check, best wire size",
  help: "Checking a thread's pitch diameter with three wires and a micrometer: best wire size and what the mic should read.",
  category: "thread",
  keywords: ["wires", "three wire", "3 wire", "measure over wires", "pitch diameter", "best wire", "thread mic"],
  pro: true,
  prefillRank: 11,
  prefill: (q) => threadPrefill(q),
  inputs: [
    { id: "thread", suggest: COMMON_THREADS, label: "Thread", kind: "text", default: "1/4-20", placeholder: "1/4-20, M10x1.5" },
    { id: "side", label: "Thread is", kind: "segment", default: "external", options: [{ value: "external", label: "External" }, { value: "internal", label: "Internal (balls)" }] },
    { id: "mode", label: "Find", kind: "segment", default: "m", options: [{ value: "m", label: "Measurement" }, { value: "e", label: "Pitch dia" }] },
    { id: "wire", positive: true, advanced: true, label: "Wire diameter", kind: "length", default: "", auto: (raw, c) => { try { const t = threadFromSpec(raw.thread); return c.units === "mm" ? stockWire(t.pitchMm, "mm") : stockWire(t.pitchIn, "in"); } catch { return NaN; } }, hint: "Blank = closest stock wire to the best size." },
    { id: "pd", positive: true, label: "Pitch diameter", kind: "length", default: "", showIf: (r) => r.mode === "m",
      auto: (raw, c) => { try { const t = threadFromSpec(raw.thread); return fromIn(basicThreadGeometry(t.majorIn, t.pitchIn).pitchDiameter, c.units); } catch { return NaN; } }, hint: "Blank = basic pitch diameter." },
    { id: "m", positive: true, label: "Measured over wires", kind: "length", default: "", showIf: (r) => r.mode === "e" },
  ],
  compute(v, c) {
    const t = threadFromSpec(v.thread);
    const p = lenPlaces(c.units);
    const wireIn = toIn(v.wire, c.units);
    const range = wireRange(t.pitchIn);
    const ext = v.side === "external";
    let mIn, eIn;
    if (v.mode === "m") { eIn = toIn(v.pd, c.units); mIn = ext ? mowSolveMExternal(eIn, wireIn, t.pitchIn) : mowSolveMInternal(eIn, wireIn, t.pitchIn); }
    else { mIn = toIn(v.m, c.units); eIn = ext ? mowSolveEExternal(mIn, wireIn, t.pitchIn) : mowSolveEInternal(mIn, wireIn, t.pitchIn); }
    const warnings = [];
    if (wireIn < range.min || wireIn > range.max) warnings.push(`Wire ${fmt(v.wire, p)} is outside the usable range ${fmt(fromIn(range.min, c.units), p)}–${fmt(fromIn(range.max, c.units), p)} ${c.L.length} for this pitch.`);
    const stats = [
      { label: "Best wire (0.57735 P)", value: fromIn(bestWire(t.pitchIn), c.units), unit: c.L.length, places: p },
      { label: "Wire range", text: `${fmt(fromIn(range.min, c.units), p)} – ${fmt(fromIn(range.max, c.units), p)}` },
      { label: v.mode === "m" ? "Pitch diameter used" : "Measurement used", value: fromIn(v.mode === "m" ? eIn : mIn, c.units), unit: c.L.length, places: p },
      { label: "Basic pitch diameter", value: fromIn(basicThreadGeometry(t.majorIn, t.pitchIn).pitchDiameter, c.units), unit: c.L.length, places: p },
    ];
    if (t.isUn && ext) {
      const env = unToleranceEnvelope({ major: t.majorIn, pitch: t.pitchIn });
      stats.push({ label: "2A PD limits (est.)", text: `${fmt(fromIn(env["2A"].pdMin, c.units), p)} – ${fmt(fromIn(env["2A"].pdMax, c.units), p)}` });
      stats.push({ label: "2A measurement limits", text: `${fmt(fromIn(mowSolveMExternal(env["2A"].pdMin, wireIn, t.pitchIn), c.units), p)} – ${fmt(fromIn(mowSolveMExternal(env["2A"].pdMax, wireIn, t.pitchIn), c.units), p)}` });
    }
    const K = 0.86603;
    return {
      primary: v.mode === "m"
        ? { label: `Measurement over ${ext ? "wires" : "balls"}`, value: fromIn(mIn, c.units), unit: c.L.length, places: p }
        : { label: "Pitch diameter", value: fromIn(eIn, c.units), unit: c.L.length, places: p },
      stats, warnings,
      source: "threadGeometry",
      explain: [
        ext
          ? { title: "Three-wire (60°, no lead correction)", formula: "M = E + 3W − 0.86603 P", plugged: `${v.mode === "m" ? `= ${fmt(eIn, 4)} + 3 × ${fmt(wireIn, 4)} − 0.86603 × ${fmt(t.pitchIn, 4)} = ${fmt(mIn, 4)} in` : `E = M − 3W + 0.86603 P = ${fmt(eIn, 4)} in`}` }
          : { title: "Between balls (internal, 60°)", formula: "M = E − 3W + 0.86603 P", plugged: `${v.mode === "m" ? `= ${fmt(mIn, 4)} in` : `E = M + 3W − 0.86603 P = ${fmt(eIn, 4)} in`}` },
      ],
      notes: ["Lead-angle correction is ignored; it is under 0.0001 in for most single-start threads.", `K = ${K}`],
      historyLabel: `${t.label} · ${ext ? "ext" : "int"} · W ${fmt(v.wire, p)}`,
    };
  },
});
