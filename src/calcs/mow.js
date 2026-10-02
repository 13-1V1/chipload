// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Measurement over wires (3-wire). Pro.

import { register } from "../app/registry.js";
import { mowSolveMExternal, mowSolveEExternal, mowSolveMInternal, mowSolveEInternal, bestWire, wireRange, stockWire, pitchDiameterWindow } from "../core/mow.js";
import { basicThreadGeometry, unToleranceEnvelope, metricToleranceEnvelope } from "../core/thread.js";
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
    { id: "wire", positive: true, advanced: true, label: "Wire diameter", kind: "length", default: "", auto: (raw, c) => { try { const t = threadFromSpec(raw.thread); return c.units === "mm" ? bestWire(t.pitchMm) : bestWire(t.pitchIn); } catch { return NaN; } }, hint: "Blank = the best wire, 0.57735 × pitch: the size thread wires are sold at for each pitch. Type the size marked on your wires if it differs." },
    { id: "pd", positive: true, label: "Pitch diameter", kind: "length", default: "", showIf: (r) => r.mode === "m",
      auto: (raw, c) => { try { const t = threadFromSpec(raw.thread); return fromIn(basicThreadGeometry(t.majorIn, t.pitchIn).pitchDiameter, c.units); } catch { return NaN; } }, hint: "Blank = basic pitch diameter." },
    { id: "m", positive: true, label: "Measured over wires", kind: "length", default: "", showIf: (r) => r.mode === "e" },
  ],
  compute(v, c) {
    const t = threadFromSpec(v.thread);
    const p = lenPlaces(c.units), u = c.L.length;
    const show = (inches, places = p) => fmt(fromIn(inches, c.units), places);
    // a reading just past a limit: add places until the two numbers read differently
    const showApart = (a, b) => { let k = p; while (k < p + 3 && show(a, k) === show(b, k)) k++; return [show(a, k), show(b, k)]; };
    // a limit shown rounded toward the inside of the band (min up, max down), so a reading at the shown limit passes
    const showInward = (inches, up) => { const s = 10 ** p, x = fromIn(inches, c.units) * s; return fmt((up ? Math.ceil(x - 1e-6) : Math.floor(x + 1e-6)) / s, p); };
    const wireIn = toIn(v.wire, c.units);
    const range = wireRange(t.pitchIn);
    const ext = v.side === "external";
    const pitchName = t.isUn ? `${fmt(t.tpi, 2)} TPI` : `${fmt(t.pitchMm, 3)} mm pitch`;
    // The wire the answer is figured for. A blank field is the best wire; say whether wire sets sell it.
    const best = bestWire(t.pitchIn);
    // compare in the set's own unit, within half its last stored place (inch sets to 0.00001 in, mm to 0.0001 mm)
    const inSet = t.isUn
      ? Math.abs(stockWire(t.pitchIn, "in") - best) < 0.000005
      : Math.abs(stockWire(t.pitchMm, "mm") - bestWire(t.pitchMm)) < 0.00005;
    const isBest = Math.abs(wireIn - best) < 1e-6;
    const wireNote = isBest
      ? (inSet ? `best wire for ${pitchName}` : `best wire for ${pitchName} (special: no standard set has it)`)
      : "the wire you entered";

    // Sanity: the pitch diameter has to sit inside the thread (above the root, under the major)
    const win = pitchDiameterWindow(t.majorIn, t.pitchIn);
    const outside = (e) => !(e > win.min && e < win.max);
    const windowText = `${show(win.min)} and ${show(win.max)} ${u}`;
    let mIn, eIn;
    if (v.mode === "m") {
      eIn = toIn(v.pd, c.units);
      if (outside(eIn)) throw new Error(`A pitch diameter of ${show(eIn)} ${u} can't be on a ${t.label}: it has to fall between ${windowText}. Check the units and the number.`);
      mIn = ext ? mowSolveMExternal(eIn, wireIn, t.pitchIn) : mowSolveMInternal(eIn, wireIn, t.pitchIn);
    } else {
      mIn = toIn(v.m, c.units);
      eIn = ext ? mowSolveEExternal(mIn, wireIn, t.pitchIn) : mowSolveEInternal(mIn, wireIn, t.pitchIn);
      if (outside(eIn)) throw new Error(`A reading of ${show(mIn)} ${u} doesn't fit a ${t.label}: it works out to a pitch diameter of ${show(eIn)} ${u}, and that has to fall between ${windowText}. Check the units, the wire size and the reading.`);
    }
    const warnings = t.caution ? [t.caution] : [];
    if (wireIn < range.min || wireIn > range.max) warnings.push(`Wire ${fmt(v.wire, p)} ${u} is outside the usable range ${show(range.min)}–${show(range.max)} ${u} for this pitch: it won't sit on the flanks right.`);

    // Class limits for the side being checked: 2A / 2B (ASME B1.1) or 6g / 6H (ISO 965)
    let limits = null;
    try {
      if (t.isUn) {
        const env = unToleranceEnvelope({ major: t.majorIn, pitch: t.pitchIn });
        limits = { cls: ext ? "2A" : "2B", ...env[ext ? "2A" : "2B"] };
      } else {
        const env = metricToleranceEnvelope({ major: t.majorMm, pitch: t.pitchMm });
        const side = ext ? env.external : env.internal;
        if (side) limits = { cls: side.label, pdMin: side.pdMin / 25.4, pdMax: side.pdMax / 25.4 };
      }
    } catch { limits = null; }
    const solveM = (e) => (ext ? mowSolveMExternal(e, wireIn, t.pitchIn) : mowSolveMInternal(e, wireIn, t.pitchIn));
    const stats = [
      // wire sizes one place finer, the way wires are marked (.02887 in, 0.2887 mm)
      { label: "Wire used", text: `${show(wireIn, p + 1)} ${u} · ${wireNote}` },
      { label: "Best wire (0.57735 P)", value: fromIn(best, c.units), unit: u, places: p + 1 },
      { label: "Wire range", text: `${show(range.min)} – ${show(range.max)} ${u}` },
      { label: v.mode === "m" ? "Pitch diameter used" : "Measurement used", value: fromIn(v.mode === "m" ? eIn : mIn, c.units), unit: u, places: p },
      { label: "Basic pitch diameter", value: fromIn(basicThreadGeometry(t.majorIn, t.pitchIn).pitchDiameter, c.units), unit: u, places: p },
    ];
    if (limits) {
      const [mLo, mHi] = [solveM(limits.pdMin), solveM(limits.pdMax)].sort((a, b) => a - b);
      stats.push({ label: `${limits.cls} PD limits`, text: `${showInward(limits.pdMin, true)} – ${showInward(limits.pdMax, false)} ${u}` });
      stats.push({ label: `${limits.cls} measurement limits`, text: `${showInward(mLo, true)} – ${showInward(mHi, false)} ${u}` });
      // a measured part gets a verdict, not just two numbers to compare by eye
      if (v.mode === "e" && eIn < limits.pdMin - 5e-7) { const [a, b] = showApart(eIn, limits.pdMin); warnings.push(`Pitch diameter ${a} ${u} is under the ${limits.cls} minimum ${b} ${u}: the thread is ${ext ? "undersize (cut too deep)" : "tight (a GO plug won't enter)"}.`); }
      if (v.mode === "e" && eIn > limits.pdMax + 5e-7) { const [a, b] = showApart(eIn, limits.pdMax); warnings.push(`Pitch diameter ${a} ${u} is over the ${limits.cls} maximum ${b} ${u}: the thread is ${ext ? "oversize (a GO ring won't go on)" : "loose (cut too deep)"}.`); }
    }
    const K = 0.86603;
    const w = show(wireIn), pp = show(t.pitchIn), e = show(eIn), m = show(mIn);
    return {
      primary: v.mode === "m"
        ? { label: `Measurement over ${ext ? "wires" : "balls"}`, value: fromIn(mIn, c.units), unit: u, places: p }
        : { label: "Pitch diameter", value: fromIn(eIn, c.units), unit: u, places: p },
      stats, warnings,
      source: "threadGeometry",
      explain: [
        ext
          ? { title: "Three-wire (60°, no lead correction)", formula: "M = E + 3W − 0.86603 P", plugged: v.mode === "m" ? `M = ${e} + 3 × ${w} − 0.86603 × ${pp} = ${m} ${u}` : `E = M − 3W + 0.86603 P = ${m} − 3 × ${w} + 0.86603 × ${pp} = ${e} ${u}` }
          : { title: "Between balls (internal, 60°)", formula: "M = E − 3W + 0.86603 P", plugged: v.mode === "m" ? `M = ${e} − 3 × ${w} + 0.86603 × ${pp} = ${m} ${u}` : `E = M + 3W − 0.86603 P = ${m} + 3 × ${w} − 0.86603 × ${pp} = ${e} ${u}` },
      ],
      notes: [`Lead-angle correction is ignored; it is under ${c.units === "mm" ? "0.003 mm" : "0.0001 in"} for most single-start threads.`, `K = ${K}`],
      historyLabel: `${t.label} · ${ext ? "ext" : "int"} · W ${fmt(v.wire, p)}`,
    };
  },
});
