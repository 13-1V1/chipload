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
    { id: "nominal", label: "Nominal size", kind: "length", default: "1", min: 0.0001 },
    { id: "fit", label: "Fit", kind: "select", default: "H7/g6", options: COMMON.map(([value, label]) => ({ value, label: value === "custom" ? label : `${value} — ${label}` })) },
    { id: "hole", label: "Hole", kind: "text", default: "H7", placeholder: "H7", showIf: (r) => r.fit === "custom" },
    { id: "shaft", label: "Shaft", kind: "text", default: "g6", placeholder: "g6", showIf: (r) => r.fit === "custom" },
  ],
  compute(v, c) {
    const mm = c.units === "mm" ? v.nominal : v.nominal * 25.4;
    if (mm < 1 || mm > 500) throw new Error("ISO 286 covers 1–500 mm (0.04–19.7 in)");
    const [h, s] = v.fit === "custom" ? [v.hole, v.shaft] : v.fit.split("/");
    const f = isoFit(mm, h, s);
    const L = (x) => (c.units === "mm" ? x : x / 25.4);
    const p = c.units === "mm" ? 3 : 4;
    const rows = [
      { what: `Hole ${f.hole.spec}`, min: L(f.hole.min), max: L(f.hole.max), tol: L(f.hole.tolerance) },
      { what: `Shaft ${f.shaft.spec}`, min: L(f.shaft.min), max: L(f.shaft.max), tol: L(f.shaft.tolerance) },
    ];
    const kindLabel = { clearance: "Clearance", interference: "Interference", transition: "Transition" }[f.kind];
    return {
      primary: { label: `${h}/${s} · ${kindLabel} fit`, text: f.kind === "interference" ? `${fmt(L(-f.maxClearance), p)} – ${fmt(L(-f.minClearance), p)} tight` : `${fmt(L(f.minClearance), p)} – ${fmt(L(f.maxClearance), p)}`, unit: c.L.length },
      stats: [
        { label: `Hole ${f.hole.spec}`, text: `${fmt(L(f.hole.min), p)} – ${fmt(L(f.hole.max), p)}` },
        { label: `Shaft ${f.shaft.spec}`, text: `${fmt(L(f.shaft.min), p)} – ${fmt(L(f.shaft.max), p)}` },
        { label: "Max clearance", value: L(f.maxClearance), unit: c.L.length, places: p },
        { label: "Min clearance (− = interference)", value: L(f.minClearance), unit: c.L.length, places: p, clamped: f.minClearance < 0 },
        { label: "Hole tolerance", value: L(f.hole.tolerance), unit: c.L.length, places: p },
        { label: "Shaft tolerance", value: L(f.shaft.tolerance), unit: c.L.length, places: p },
      ],
      tables: [{ title: "Limits", columns: [{ key: "what", label: "" }, { key: "min", label: "Min", align: "right", places: p }, { key: "max", label: "Max", align: "right", places: p }, { key: "tol", label: "Tol", align: "right", places: p }], rows }],
      source: "geometry",
      explain: [{ title: "ISO 286-1", formula: "i = 0.45 ∛D + 0.001 D (µm);  IT6 = 10i, IT7 = 16i, IT8 = 25i, IT9 = 40i;  deviations g = −2.5 D^0.34, f = −5.5 D^0.41, p = IT7 + 1…", plugged: `D = ${fmt(mm, 3)} mm` }],
      notes: ["Computed from the ISO 286 formulas; published tables can differ by a micron or two from rounding. Inch sizes are converted to mm, then back."],
      historyLabel: `${fmt(v.nominal, p)} ${c.L.length} ${h}/${s}`,
    };
  },
});

export { featureLimits };
