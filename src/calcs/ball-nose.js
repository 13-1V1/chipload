// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Ball nose: scallop height ⇄ stepover, and effective diameter at a depth of cut. Pro.

import { register } from "../app/registry.js";
import { ballNoseScallopHeight, ballNoseStepover } from "../core/milling.js";
import { rpmFromSfm } from "../core/feeds.js";
import { fmt } from "../core/format.js";
import { lenPlaces, toIn, toSfm } from "./_util.js";

/** Effective cutting diameter of a ball at axial depth ap: Deff = 2 √(D·ap − ap²), capped at D. */
export function ballEffectiveDiameter(diameter, depth) {
  if (!(diameter > 0) || !(depth > 0)) return NaN;
  if (depth >= diameter / 2) return diameter;
  return 2 * Math.sqrt(diameter * depth - depth * depth);
}

export default register({
  id: "ball-nose",
  title: "Ball nose scallop & effective dia",
  short: "Stepover for a finish, RPM at the real cutting diameter",
  help: "For 3D finishing with a ball end mill: how far to step over for the finish you want, and the real cutting diameter at a shallow depth.",
  category: "mill",
  keywords: ["ball nose", "ball end mill", "scallop", "cusp", "stepover", "effective diameter", "3d finish", "surface finish"],
  pro: true,
  inputs: [
    { id: "diameter", label: "Ball diameter", kind: "length", default: "0.5", defaultMm: "12", min: 0.0001 },
    { id: "mode", label: "Find", kind: "segment", default: "stepover", options: [{ value: "stepover", label: "Stepover" }, { value: "scallop", label: "Scallop" }] },
    { id: "scallop", label: "Scallop height wanted", kind: "length", default: "0.0005", defaultMm: "0.01", min: 0, showIf: (r) => r.mode === "stepover" },
    { id: "stepover", label: "Stepover", kind: "length", default: "0.05", defaultMm: "1", min: 0, showIf: (r) => r.mode === "scallop" },
    { id: "depth", positive: true, advanced: true, label: "Axial depth of cut", kind: "length", default: "", optional: true, placeholder: "optional — gives effective diameter" },
    { id: "sfm", advanced: true, label: "Surface speed", kind: "speed", default: "", optional: true, placeholder: "optional — RPM at effective dia" },
  ],
  compute(v, c) {
    const p = c.units === "in" ? 4 : 3;
    const R = v.diameter / 2;
    let stepover, scallop;
    if (v.mode === "stepover") { scallop = v.scallop; stepover = ballNoseStepover({ radius: R, scallopHeight: scallop }); if (!Number.isFinite(stepover)) throw new Error("Scallop can't be taller than the ball radius"); }
    else { stepover = v.stepover; scallop = ballNoseScallopHeight({ radius: R, stepover }); if (!Number.isFinite(scallop)) throw new Error("Stepover can't be more than the ball diameter"); }
    const stats = [
      v.mode === "stepover" ? { label: "Scallop height", value: scallop, unit: c.L.length, places: 5 } : { label: "Stepover", value: stepover, unit: c.L.length, places: p },
      { label: "Stepover as % of diameter", value: 100 * stepover / v.diameter, unit: "%", places: 1 },
    ];
    const explain = [
      { title: "Scallop (cusp)", formula: "h = R − √(R² − (s/2)²)     s = 2 √(2Rh − h²)", plugged: `R = ${fmt(R, p)}, s = ${fmt(stepover, p)}, h = ${fmt(scallop, 5)}` },
    ];
    if (Number.isFinite(v.depth) && v.depth > 0) {
      const deff = ballEffectiveDiameter(v.diameter, v.depth);
      stats.push({ label: "Effective cutting diameter", value: deff, unit: c.L.length, places: p });
      explain.push({ title: "Effective diameter", formula: "Deff = 2 √(D·ap − ap²)", plugged: `= 2 √(${fmt(v.diameter, p)} × ${fmt(v.depth, p)} − ${fmt(v.depth, p)}²) = ${fmt(deff, p)}` });
      if (Number.isFinite(v.sfm) && Number.isFinite(deff) && deff > 0) {
        const rpmEff = rpmFromSfm(toSfm(v.sfm, c.units), toIn(deff, c.units));
        const rpmFull = rpmFromSfm(toSfm(v.sfm, c.units), toIn(v.diameter, c.units));
        stats.push({ label: "RPM at effective dia", value: rpmEff, unit: "RPM", places: 0 }, { label: "RPM at full dia (too slow)", value: rpmFull, unit: "RPM", places: 0 });
        explain.push({ title: "Speed at the real diameter", formula: "RPM = SFM × 12 ÷ (π × Deff)", plugged: `= ${fmt(rpmEff, 0)} vs ${fmt(rpmFull, 0)} at full diameter` });
      }
    }
    return {
      primary: v.mode === "stepover" ? { label: "Stepover", value: stepover, unit: c.L.length, places: p } : { label: "Scallop height", value: scallop, unit: c.L.length, places: 5 },
      stats, explain,
      source: "advanced",
      notes: ["Shallow 3D finishing cuts near the ball tip at close to zero surface speed — use the effective diameter to set RPM."],
      historyLabel: `Ø${fmt(v.diameter, p)} · ${v.mode === "stepover" ? `h ${fmt(scallop, 5)}` : `s ${fmt(stepover, p)}`}`,
    };
  },
});
