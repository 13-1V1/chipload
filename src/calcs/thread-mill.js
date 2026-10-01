// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Thread milling feed compensation. Pro. Internal and external.

import { register } from "../app/registry.js";
import { threadMilling } from "../core/milling.js";
import { fmt } from "../core/format.js";
import { threadFromSpec, threadPrefill, fromIn, toIn, COMMON_THREADS } from "./_util.js";

export default register({
  id: "thread-mill",
  title: "Thread mill feed",
  short: "Centerline feed comp for thread milling",
  help: "Feed for a thread mill: the control feeds the tool center, which travels a smaller circle than the cutting edge.",
  category: "mill",
  keywords: ["thread mill", "thread milling", "feed comp", "centerline", "helical", "internal", "external"],
  pro: true,
  prefillRank: 14,
  prefill: (q) => threadPrefill(q),
  inputs: [
    { id: "thread", suggest: COMMON_THREADS, label: "Thread", kind: "text", default: "1/2-13", placeholder: "1/2-13, M12x1.75" },
    { id: "side", label: "Thread is", kind: "segment", default: "internal", options: [{ value: "internal", label: "Internal" }, { value: "external", label: "External" }] },
    { id: "cutter", label: "Thread mill diameter", kind: "length", default: "0.375", defaultMm: "10", min: 0.0001 },
    { id: "flutes", label: "Flutes", kind: "int", default: "3", min: 1 },
    { id: "rpm", label: "Spindle", kind: "int", default: "3000", unit: "RPM", min: 1 },
    { id: "chip", positive: true, label: "Chip load per tooth", kind: "length", default: "0.001", defaultMm: "0.025", min: 0 },
  ],
  compute(v, c) {
    const t = threadFromSpec(v.thread);
    const majorIn = t.majorIn;
    const cutterIn = toIn(v.cutter, c.units);
    const chipIn = toIn(v.chip, c.units);
    const surface = v.rpm * v.flutes * chipIn;
    let centerline, pathDia;
    if (v.side === "internal") {
      const r = threadMilling({ majorDiameter: majorIn, cutterDiameter: cutterIn, rpm: v.rpm, flutes: v.flutes, chipLoad: chipIn });
      centerline = r.centerlineFeed; pathDia = r.pathDiameter;
    } else {
      pathDia = majorIn + cutterIn;
      centerline = surface * (pathDia / majorIn);
    }
    const p = c.units === "in" ? 4 : 3;
    const warnings = [];
    if (v.side === "internal" && cutterIn > majorIn * 0.75) warnings.push("Thread mill is over 75% of the hole size — expect deflection and a poor form. Use a smaller cutter.");
    return {
      primary: { label: "Program this feed (centerline)", value: fromIn(centerline, c.units), unit: c.L.feed, places: 2 },
      stats: [
        { label: "Surface (tooth) feed", value: fromIn(surface, c.units), unit: c.L.feed, places: 2 },
        { label: "Helix path diameter", value: fromIn(pathDia, c.units), unit: c.L.length, places: p },
        { label: "Feed per rev of helix", value: fromIn(centerline / v.rpm, c.units), unit: c.L.feedRev, places: 4 },
        { label: "Thread", text: `${t.label} · ${t.pitchLabel}` },
      ],
      warnings,
      source: "advanced",
      explain: [
        { title: "Surface feed", formula: "Fs = RPM × flutes × chip", plugged: `= ${v.rpm} × ${v.flutes} × ${fmt(chipIn, 4)} = ${fmt(surface, 2)} IPM` },
        v.side === "internal"
          ? { title: "Internal comp", formula: "Fc = Fs × (Dmajor − Dcutter) ÷ Dmajor", plugged: `= ${fmt(surface, 2)} × (${fmt(majorIn, 4)} − ${fmt(cutterIn, 4)}) ÷ ${fmt(majorIn, 4)} = ${fmt(centerline, 2)} IPM` }
          : { title: "External comp", formula: "Fc = Fs × (Dmajor + Dcutter) ÷ Dmajor", plugged: `= ${fmt(surface, 2)} × (${fmt(majorIn, 4)} + ${fmt(cutterIn, 4)}) ÷ ${fmt(majorIn, 4)} = ${fmt(centerline, 2)} IPM` },
      ],
      historyLabel: `${t.label} · ${v.side} · Ø${fmt(v.cutter, p)}`,
    };
  },
});
