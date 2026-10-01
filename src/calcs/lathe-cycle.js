// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Lathe cycle time: turn, face, groove, cutoff — constant RPM or constant surface speed. Pro.

import { register } from "../app/registry.js";
import { turningTime, facingTimeRpm, facingTimeCss } from "../core/lathe.js";
import { rpmFromSfm } from "../core/feeds.js";
import { fmt } from "../core/format.js";
import { toIn, toSfm, lenPlaces } from "./_util.js";

export default register({
  id: "lathe-cycle",
  title: "Lathe cycle time",
  short: "Turn, face, groove, or cutoff time with passes",
  help: "How long a turning, facing, grooving, or cutoff pass takes, with passes and overhead.",
  category: "lathe",
  keywords: ["cycle time", "turning time", "facing", "groove", "cutoff", "part off", "passes", "quote", "g96", "css"],
  pro: true,
  inputs: [
    { id: "op", label: "Operation", kind: "segment", default: "turn", options: [{ value: "turn", label: "Turn" }, { value: "face", label: "Face" }, { value: "groove", label: "Groove" }, { value: "cutoff", label: "Cutoff" }] },
    { id: "speedMode", label: "Spindle", kind: "segment", default: "css", options: [{ value: "css", label: "G96 (SFM)" }, { value: "rpm", label: "G97 (RPM)" }] },
    { id: "sfm", label: "Surface speed", kind: "speed", default: "400", min: 1, showIf: (r) => r.speedMode === "css" },
    { id: "rpm", label: "Spindle", kind: "int", default: "800", unit: "RPM", min: 1, showIf: (r) => r.speedMode === "rpm" },
    { id: "maxRpm", advanced: true, label: "Max RPM (G50)", kind: "int", default: "", unit: "RPM", optional: true, placeholder: "optional", showIf: (r) => r.speedMode === "css" },
    { id: "ipr", label: "Feed per revolution", kind: "feedRev", default: "0.010", min: 0.00001 },
    { id: "od", label: "Outer diameter", kind: "length", default: "2", min: 0.0001 },
    { id: "id", label: "Inner diameter (0 = solid)", kind: "length", default: "0", min: 0, showIf: (r) => r.op !== "turn" },
    { id: "length", label: "Length of cut", kind: "length", default: "4", min: 0, showIf: (r) => r.op === "turn" },
    { id: "depth", label: "Groove depth (radial)", kind: "length", default: "0.1", min: 0, showIf: (r) => r.op === "groove" },
    { id: "passes", label: "Passes", kind: "int", default: "1", min: 1 },
    { id: "rapid", advanced: true, label: "Return / index per pass", kind: "number", default: "2", unit: "sec", min: 0 },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const odIn = toIn(v.od, c.units), idIn = toIn(Number.isFinite(v.id) ? v.id : 0, c.units);
    const iprIn = toIn(v.ipr, c.units);
    const sfm = v.speedMode === "css" ? toSfm(v.sfm, c.units) : null;
    let perPass, how;
    if (v.op === "turn") {
      const rpm = v.speedMode === "css" ? Math.min(rpmFromSfm(sfm, odIn), Number.isFinite(v.maxRpm) ? v.maxRpm : Infinity) : v.rpm;
      perPass = turningTime({ length: toIn(v.length, c.units), ipr: iprIn, rpm });
      how = { formula: "t = L ÷ (f × N)", plugged: `= ${fmt(toIn(v.length, c.units), 3)} ÷ (${fmt(iprIn, 4)} × ${fmt(rpm, 0)}) = ${fmt(perPass, 3)} min`, rpm };
    } else {
      const inner = v.op === "groove" ? Math.max(idIn, odIn - 2 * toIn(v.depth, c.units)) : idIn;
      if (v.speedMode === "css") {
        // CSS until the G50 cap, then constant RPM the rest of the way in.
        const capRpm = Number.isFinite(v.maxRpm) ? v.maxRpm : Infinity;
        const dCap = Number.isFinite(capRpm) ? (12 * sfm) / (Math.PI * capRpm) : 0; // diameter where the cap kicks in
        if (dCap > inner && dCap < odIn) {
          perPass = facingTimeCss({ outerDia: odIn, innerDia: dCap, sfm, ipr: iprIn }) + facingTimeRpm({ outerDia: dCap, innerDia: inner, ipr: iprIn, rpm: capRpm });
          how = { formula: "t = π(D² − Dcap²) ÷ (48 SFM f) + (Dcap − d) ÷ (2 f Nmax)", plugged: `Dcap = ${fmt(dCap, 3)} at ${capRpm} RPM → ${fmt(perPass, 3)} min` };
        } else if (dCap >= odIn) {
          perPass = facingTimeRpm({ outerDia: odIn, innerDia: inner, ipr: iprIn, rpm: capRpm });
          how = { formula: "t = (D − d) ÷ (2 f Nmax)   (cap reached before the cut starts)", plugged: `= ${fmt(perPass, 3)} min` };
        } else {
          perPass = facingTimeCss({ outerDia: odIn, innerDia: inner, sfm, ipr: iprIn });
          how = { formula: "t = π (D² − d²) ÷ (48 × SFM × f)", plugged: `= π (${fmt(odIn, 3)}² − ${fmt(inner, 3)}²) ÷ (48 × ${fmt(sfm, 0)} × ${fmt(iprIn, 4)}) = ${fmt(perPass, 3)} min` };
        }
      } else {
        perPass = facingTimeRpm({ outerDia: odIn, innerDia: inner, ipr: iprIn, rpm: v.rpm });
        how = { formula: "t = (D − d) ÷ (2 × f × N)", plugged: `= (${fmt(odIn, 3)} − ${fmt(inner, 3)}) ÷ (2 × ${fmt(iprIn, 4)} × ${v.rpm}) = ${fmt(perPass, 3)} min` };
      }
    }
    const total = v.passes * perPass + v.passes * v.rapid / 60;
    const warnings = [];
    if (v.speedMode === "css" && v.op !== "turn" && !Number.isFinite(v.maxRpm) && idIn === 0) warnings.push("No max RPM set: under G96 the spindle would try to go infinite at center. Set a G50 / max RPM.");
    return {
      primary: { label: `${v.op[0].toUpperCase() + v.op.slice(1)} · ${v.passes} pass${v.passes > 1 ? "es" : ""}`, value: total, unit: "min", places: 2 },
      stats: [
        { label: "Per pass (cutting)", value: perPass * 60, unit: "sec", places: 1 },
        { label: "Overhead", value: v.passes * v.rapid, unit: "sec", places: 0 },
        ...(how.rpm ? [{ label: "Spindle used", value: how.rpm, unit: "RPM", places: 0 }] : []),
        { label: "Total", text: hms(total) },
      ],
      warnings,
      source: "advanced",
      explain: [{ title: "Cutting time", formula: how.formula, plugged: how.plugged }],
      historyLabel: `${v.op} Ø${fmt(v.od, p)} · ${fmt(total, 2)} min`,
    };
  },
});

function hms(minutes) {
  const s = Math.round(minutes * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`;
}
