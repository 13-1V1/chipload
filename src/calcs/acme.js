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
  compute(v) {
    const t = parseAcme(v.thread);
    const g = acmeGeometry({ major: t.major, tpi: t.tpi });
    const lead = g.pitch * v.starts;
    const leadAngle = Math.atan(lead / (Math.PI * g.pitchDiameter)) * 180 / Math.PI;
    const allowance = g.allowance[v.cls];
    return {
      primary: { label: `${t.label} basic pitch diameter`, value: g.pitchDiameter, unit: "in", places: 4 },
      stats: [
        { label: "Pitch", value: g.pitch, unit: "in", places: 4 },
        { label: `Lead (${v.starts} start${v.starts > 1 ? "s" : ""})`, value: lead, unit: "in", places: 4 },
        { label: "Lead angle at PD", value: leadAngle, unit: "°", places: 2 },
        { label: "Thread depth (basic)", value: g.depth, unit: "in", places: 4 },
        { label: "Minor dia, internal (tap drill basis)", value: g.internalMinor, unit: "in", places: 4 },
        { label: "Minor dia, external", value: g.externalMinor, unit: "in", places: 4 },
        { label: "Major dia, internal", value: g.internalMajor, unit: "in", places: 4 },
        { label: `${v.cls} PD allowance (external)`, value: allowance, unit: "in", places: 4 },
        { label: `External PD max (${v.cls})`, value: g.pitchDiameter - allowance, unit: "in", places: 4 },
        { label: "Flat at crest", value: g.crestFlat, unit: "in", places: 4 },
      ],
      source: "threadGeometry",
      explain: [
        { title: "ASME B1.5 general purpose Acme", formula: "depth = 0.5P   PD = D − 0.5P   minor(int) = D − P   clearance 0.020 (≤10 TPI) / 0.010", plugged: `P = ${fmt(g.pitch, 4)}, D = ${fmt(t.major, 4)}` },
        { title: "Allowance", formula: `${v.cls}: ${v.cls === "2G" ? "0.008" : v.cls === "3G" ? "0.006" : "0.004"} √D`, plugged: `= ${fmt(allowance, 4)} in` },
      ],
      notes: ["PD tolerances for each class come from the B1.5 tables and depend on diameter and pitch — use the tables or a thread gauge for limits. Multi-start: cut each start one lead apart, depth stays 0.5P."],
      historyLabel: `${t.label} ${v.cls}`,
    };
  },
});
