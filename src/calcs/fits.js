// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Fits & limits — ISO 286 hole-basis fits, in mm or inches. Pro.

import { register } from "../app/registry.js";
import { isoFit, featureLimits } from "../core/inspect.js";
import { fmt } from "../core/format.js";

const COMMON = [
  ["H11/c11", "Loose running"], ["H9/d9", "Free running"], ["H8/f7", "Close running"], ["H7/g6", "Sliding"], ["H7/h6", "Locational clearance"],
  ["H7/k6", "Locational transition"], ["H7/n6", "Locational transition (tighter)"], ["H7/p6", "Locational interference (press)"], ["H7/s6", "Medium drive"], ["H7/u6", "Force / shrink"],
  ["custom", "Custom (type hole and shaft)"],
];

export default register({
  id: "fits",
  title: "Fits & limits (ISO 286)",
  short: "H7/g6 and friends: hole and shaft limits, clearance",
  help: "Hole and shaft sizes for a fit callout like H7/g6, and how much clearance or press you get.",
  category: "inspect",
  keywords: ["fit", "fits", "limits", "h7", "g6", "p6", "press fit", "clearance", "interference", "iso 286", "tolerance grade", "it7"],
  pro: true,
  inputs: [
    { id: "nominal", label: "Nominal size", kind: "length", default: "1", defaultMm: "25", min: 0.0001 },
    { id: "fit", label: "Fit", kind: "select", default: "H7/g6", options: COMMON.map(([value, label]) => ({ value, label: value === "custom" ? label : `${value} — ${label}` })) },
    { id: "hole", label: "Hole", kind: "text", default: "H7", placeholder: "H7", showIf: (r) => r.fit === "custom" },
    { id: "shaft", label: "Shaft", kind: "text", default: "g6", placeholder: "g6", showIf: (r) => r.fit === "custom" },
  ],
  compute(v, c) {
    const mm = c.units === "mm" ? v.nominal : v.nominal * 25.4;
    if (mm > 500) throw new Error("ISO 286 here covers sizes up to 500 mm (19.7 in)");
    const [h, s] = v.fit === "custom" ? [v.hole, v.shaft] : v.fit.split("/");
    const f = isoFit(mm, h, s);
    const inch = c.units === "in";
    const L = (x) => (inch ? x / 25.4 : x);
    // mm limits are whole microns, exact at 3 places. Inch limits round inward (max down, min up), the ISO 370
    // practice for converted limits, so a shown limit never sits outside the ISO one. A zone narrower than
    // 0.0001 in that would round shut gets a fifth place.
    const limits = (feat) => {
      if (!inch) return { min: feat.min, max: feat.max, places: 3 };
      for (const q of [4, 5]) {
        const s = 10 ** q;
        const min = Math.ceil(L(feat.min) * s - 1e-6) / s, max = Math.floor(L(feat.max) * s + 1e-6) / s;
        if (min <= max || q === 5) return { min, max, places: q };
      }
    };
    const hl = limits(f.hole), sl = limits(f.shaft);
    const p = inch ? 4 : 3;
    const lp = Math.max(hl.places, sl.places);
    // Clearance and tolerance are worked from the limits shown, so the screen adds up. In mm those are the ISO
    // values; in inches they are the inward-rounded limits (what the shop makes to), each up to 0.0001 in inside ISO.
    const shown = (x) => Math.round(x * 10 ** lp) / 10 ** lp;
    const maxClear = shown(hl.max - sl.min), minClear = shown(hl.min - sl.max);
    const holeTol = shown(hl.max - hl.min), shaftTol = shown(sl.max - sl.min);
    const rows = [
      { what: `Hole ${f.hole.spec}`, min: hl.min, max: hl.max, tol: holeTol },
      { what: `Shaft ${f.shaft.spec}`, min: sl.min, max: sl.max, tol: shaftTol },
    ];
    const um = (x) => { const n = Math.round(x * 1e4) / 10; return `${n > 0 ? "+" : ""}${fmt(n, 1)}`; };
    const kindLabel = { clearance: "Clearance", interference: "Interference", transition: "Transition" }[f.kind];
    // The label keeps the ISO name. Rounding inward can only narrow the range, so in inches a small transition fit
    // (H7/n6 at 0.12 in: ISO −0.00063 to +0.00016 in) can show one side closed to line-to-line; a note says why.
    const closed = f.kind !== "transition" ? null : maxClear <= 0 ? "clearance" : minClear >= 0 ? "interference" : null;
    return {
      primary: { label: `${h}/${s} · ${kindLabel} fit`, text: f.kind === "interference" ? `${fmt(-maxClear, lp)} – ${fmt(-minClear, lp)} tight` : `${fmt(minClear, lp)} – ${fmt(maxClear, lp)}`, unit: c.L.length },
      stats: [
        { label: `Hole ${f.hole.spec}`, text: `${fmt(hl.min, hl.places)} – ${fmt(hl.max, hl.places)}` },
        { label: `Shaft ${f.shaft.spec}`, text: `${fmt(sl.min, sl.places)} – ${fmt(sl.max, sl.places)}` },
        { label: "Max clearance", value: maxClear, unit: c.L.length, places: lp },
        { label: "Min clearance (− = interference)", value: minClear, unit: c.L.length, places: lp, clamped: minClear < 0 },
        { label: "Hole tolerance", value: holeTol, unit: c.L.length, places: lp },
        { label: "Shaft tolerance", value: shaftTol, unit: c.L.length, places: lp },
      ],
      tables: [{ title: "Limits", columns: [{ key: "what", label: "" }, { key: "min", label: "Min", align: "right", places: lp }, { key: "max", label: "Max", align: "right", places: lp }, { key: "tol", label: "Tol", align: "right", places: lp }], rows }],
      source: "fits",
      explain: [{
        title: "ISO 286-1 tables",
        formula: "limit = nominal + deviation.   A hole letter sets its lower deviation, a shaft letter a–h its upper, k–z its lower; the grade number (IT) sets the width.",
        plugged: `${inch ? `D = ${fmt(v.nominal, 4)} in = ` : "D = "}${fmt(mm, 3)} mm: ${f.hole.spec} = ${um(f.hole.upper)} / ${um(f.hole.lower)} µm, ${f.shaft.spec} = ${um(f.shaft.upper)} / ${um(f.shaft.lower)} µm`,
      },
      ...(inch ? [{
        title: "Back to inches",
        formula: "limit (in) = limit (mm) ÷ 25.4, rounded inward: max down, min up",
        plugged: `${f.hole.spec} ${fmt(L(f.hole.min), 6)} – ${fmt(L(f.hole.max), 6)} in → ${fmt(hl.min, hl.places)} – ${fmt(hl.max, hl.places)} in; ${f.shaft.spec} ${fmt(L(f.shaft.min), 6)} – ${fmt(L(f.shaft.max), 6)} in → ${fmt(sl.min, sl.places)} – ${fmt(sl.max, sl.places)} in`,
      }] : [])],
      notes: [
        ...(closed ? [`ISO 286 calls ${h}/${s} a transition fit. At this size the inch limits, rounded inward, leave no ${closed} (${closed === "clearance" ? `max clearance ${fmt(maxClear, lp)}` : `min clearance ${fmt(minClear, lp)}`} ${c.L.length}): made to the limits shown, the parts ${closed === "clearance" ? "never run loose" : "never press together"}.`] : []),
        inch
          ? "Looked up from the ISO 286 tables in mm, then converted back. Inch limits are rounded inward to 0.0001 in so they stay inside the ISO limits, and the clearance and tolerance are worked from those limits, so each end of the clearance range can sit up to 0.0002 in inside the ISO range (the loose end reads tighter, the tight end looser), and each tolerance up to 0.0002 in narrower."
          : "Looked up from the ISO 286 tables."],
      historyLabel: `${fmt(v.nominal, p)} ${c.L.length} ${h}/${s}`,
    };
  },
});

export { featureLimits };
