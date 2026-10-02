// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// ACME thread geometry (general purpose, 29°). Pro.

import { register } from "../app/registry.js";
import { acmeGeometry } from "../core/thread.js";
import { fmt } from "../core/format.js";
import { parseFraction } from "../core/format.js";

function parseAcme(text) {
  const m = String(text || "").trim().toLowerCase().replace(/\s*acme\s*$/, "").match(/^([0-9.]+\/[0-9.]+|[0-9]+(?:\.[0-9]+)?(?:-[0-9]+\/[0-9]+)?)-(\d+(?:\.\d+)?)$/);
  if (!m) throw new Error("Type an Acme thread like 1/2-10 or 1-5");
  const majorText = m[1].includes("-") ? m[1].replace("-", " ") : m[1];
  const major = parseFraction(majorText);
  const tpi = Number(m[2]);
  if (!(major > 0) || !(tpi > 0)) throw new Error("Type an Acme thread like 1/2-10 or 1-5");
  return { major, tpi, label: `${m[1]}-${m[2]} ACME` };
}

export default register({
  id: "acme",
  title: "ACME thread",
  short: "29° general-purpose geometry and class allowance",
  help: "29° Acme threads used on lead screws: basic sizes and class allowance.",
  category: "thread",
  keywords: ["acme", "29", "lead screw", "leadscrew", "trapezoidal", "2g", "3g", "4g", "power screw"],
  pro: true,
  units: false,
  prefillRank: 16,
  prefill: (q) => { try { const t = parseAcme(q); return /acme/i.test(q) ? { params: { thread: q.trim() }, label: t.label } : null; } catch { return null; } },
  inputs: [
    { id: "thread", suggest: ["1/4-16", "3/8-12", "1/2-10", "5/8-8", "3/4-6", "1-5"], label: "Thread (inch)", kind: "text", default: "1/2-10", placeholder: "1/2-10, 3/4-6, 1-5" },
    { id: "cls", label: "Class", kind: "segment", default: "2G", options: ["2G", "3G", "4G"].map((v) => ({ value: v, label: v })) },
    { id: "starts", label: "Starts", kind: "int", default: "1", min: 1, max: 8 },
  ],
  compute(v, c) {
    const t = parseAcme(v.thread);
    const g = acmeGeometry({ major: t.major, tpi: t.tpi });
    // No inch/mm switch of its own (units: false): an Acme thread is specified in inches, but on a mm screen every
    // length reads in mm (×25.4, 3 places), the same rule Tap drill and Thread data follow.
    const mm = c?.units === "mm" || c?.settings?.units === "mm";
    const u = mm ? "mm" : "in", lp = mm ? 3 : 4, L = (x) => (mm ? x * 25.4 : x);
    const len = (x) => `${fmt(L(x), lp)} ${u}`;
    // The screw's root has to stay a real diameter: D − P − clearance > 0 (ASME B1.5 sizes stay well inside it).
    if (!(g.externalMinor > 0)) throw new Error(`${t.tpi} TPI is too coarse for a ${len(t.major)} Acme — the screw would have no core. Check the thread`);
    // B1.5's coarsest pitch for its diameter is 1/4-16 (P = D/4); coarser is almost always a typo.
    const warnings = g.pitch > t.major * 0.25 + 1e-9 ? [`${t.label} is coarser than any ASME B1.5 standard size (1/4-16 is P = D ÷ 4). Check the diameter and TPI.`] : [];
    const lead = g.pitch * v.starts;
    const leadAngle = Math.atan(lead / (Math.PI * g.pitchDiameter)) * 180 / Math.PI;
    const allowance = g.allowance[v.cls];
    // B1.5 writes the root clearance and allowance factors in inches; on a mm screen the formulas show them in mm
    const clr = mm ? "0.508 mm (≤10 TPI) / 0.254 mm" : "0.020 in (≤10 TPI) / 0.010 in";
    const factor = { "2G": 0.008, "3G": 0.006, "4G": 0.004 }[v.cls];
    return {
      primary: { label: `${t.label} basic pitch diameter`, value: L(g.pitchDiameter), unit: u, places: lp },
      stats: [
        { label: "Pitch", value: L(g.pitch), unit: u, places: lp },
        { label: `Lead (${v.starts} start${v.starts > 1 ? "s" : ""})`, value: L(lead), unit: u, places: lp },
        { label: "Lead angle at PD", value: leadAngle, unit: "°", places: 2 },
        { label: "Thread depth (basic)", value: L(g.depth), unit: u, places: lp },
        { label: "Minor dia, internal (tap drill basis)", value: L(g.internalMinor), unit: u, places: lp },
        { label: "Minor dia, external", value: L(g.externalMinor), unit: u, places: lp },
        { label: "Major dia, internal", value: L(g.internalMajor), unit: u, places: lp },
        { label: `${v.cls} PD allowance (external)`, value: L(allowance), unit: u, places: lp },
        { label: `External PD max (${v.cls})`, value: L(g.pitchDiameter - allowance), unit: u, places: lp },
        { label: "Flat at crest", value: L(g.crestFlat), unit: u, places: lp },
      ],
      warnings,
      source: "acme",
      explain: [
        { title: "ASME B1.5 general purpose Acme", formula: `depth = 0.5P   PD = D − 0.5P   minor(int) = D − P   clearance ${clr}`, plugged: `P = ${len(g.pitch)}, D = ${len(t.major)}` },
        // in mm the same rule is (factor × √25.4) √D with D in mm: 2G 0.008 √D in = 0.0403 √D mm
        { title: "Allowance", formula: `${v.cls}: ${fmt(mm ? factor * Math.sqrt(25.4) : factor, 4)} √D (D in ${mm ? "mm" : "inches"})`, plugged: `= ${fmt(mm ? factor * Math.sqrt(25.4) : factor, 4)} × √${fmt(L(t.major), lp)} = ${len(allowance)}` },
      ],
      notes: [
        ...(mm ? [`${t.label} is an inch thread: it is specified in inches (${t.tpi} TPI); the lengths here are converted to mm.`] : []),
        "PD tolerances for each class come from the B1.5 tables and depend on diameter and pitch — use the tables or a thread gauge for limits. Multi-start: cut each start one lead apart, depth stays 0.5P.",
      ],
      historyLabel: `${t.label} ${v.cls}`,
    };
  },
});
