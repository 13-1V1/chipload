// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Ball nose: scallop height ⇄ stepover, and effective diameter at a depth of cut. Pro.

import { register } from "../app/registry.js";
import { ballNoseScallopHeight, ballNoseStepover } from "../core/milling.js";
import { rpmFromSfm, sfmFromRpm } from "../core/feeds.js";
import { fmt } from "../core/format.js";
import { toIn, toSfm, fromSfm } from "./_util.js";
import { machineFor, fitToMachine, spindleSanity } from "./_machine.js";

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
    const len = (x) => `${fmt(x, p)} ${c.L.length}`;
    const R = v.diameter / 2;
    let stepover, scallop;
    if (v.mode === "stepover") { scallop = v.scallop; stepover = ballNoseStepover({ radius: R, scallopHeight: scallop }); if (!Number.isFinite(stepover)) throw new Error("Scallop can't be taller than the ball radius"); }
    else { stepover = v.stepover; scallop = ballNoseScallopHeight({ radius: R, stepover }); if (!Number.isFinite(scallop)) throw new Error("Stepover can't be more than the ball diameter"); }
    const stats = [
      v.mode === "stepover" ? { label: "Scallop height", value: scallop, unit: c.L.length, places: 5 } : { label: "Stepover", value: stepover, unit: c.L.length, places: p },
      { label: "Stepover as % of diameter", value: 100 * stepover / v.diameter, unit: "%", places: 1 },
    ];
    const explain = [
      { title: "Scallop (cusp)", formula: "h = R − √(R² − (s/2)²)     s = 2 √(2Rh − h²)", plugged: `R = ${len(R)}, s = ${len(stepover)}, h = ${fmt(scallop, 5)} ${c.L.length}` },
    ];
    const warnings = [];
    const hasSpeed = Number.isFinite(v.sfm);
    if (Number.isFinite(v.depth) && v.depth > 0) {
      const deff = ballEffectiveDiameter(v.diameter, v.depth);
      const fullBall = v.depth >= v.diameter / 2;
      stats.push({ label: "Effective cutting diameter", value: deff, unit: c.L.length, places: p });
      explain.push({ title: "Effective diameter", formula: "Deff = 2 √(D·ap − ap²)", plugged: fullBall
        ? `ap ${len(v.depth)} is at least the ball radius ${len(R)}, so the full ball cuts: Deff = D = ${len(deff)}`
        : `= 2 √(${len(v.diameter)} × ${len(v.depth)} − (${len(v.depth)})²) = ${len(deff)}` });
      if (hasSpeed && Number.isFinite(deff) && deff > 0) {
        const m = machineFor(c, "mill");
        const wantedRpm = rpmFromSfm(toSfm(v.sfm, c.units), toIn(deff, c.units));
        // No feed here, so only the spindle cap matters. fitToMachine's warning talks about the feed, which
        // this tool never shows, so the cap is worded below instead.
        const fit = fitToMachine(m, wantedRpm, 0, c);
        const rpmFull = rpmFromSfm(toSfm(v.sfm, c.units), toIn(v.diameter, c.units));
        warnings.push(...spindleSanity(wantedRpm, m, "mill", c));
        stats.push({ label: fit.rpmCapped ? "RPM at effective dia (machine max)" : "RPM at effective dia", value: fit.rpm, unit: "RPM", places: 0, clamped: fit.rpmCapped });
        if (fit.rpmCapped) {
          const reached = fromSfm(sfmFromRpm(fit.rpm, toIn(deff, c.units)), c.units);
          stats.push({ label: "Wanted RPM", value: wantedRpm, unit: "RPM", places: 0 }, { label: "Surface speed reached at Deff", value: reached, unit: c.L.speed, places: 0 });
          warnings.push(`${m.name} tops out at ${fmt(fit.rpm, 0)} RPM. This pass wants ${fmt(wantedRpm, 0)}. At ${fmt(fit.rpm, 0)} RPM the ball only sees ${fmt(reached, 0)} ${c.L.speed} at the ${len(deff)} cutting diameter. ${fullBall
            ? "The full ball is already cutting, so this is the most speed this spindle can give. Use a bigger ball or a faster spindle if the finish tears."
            : "Take a deeper pass or tilt the tool if the finish tears."}`);
        }
        // Full-diameter RPM is the mistake this tool exists to catch — show it only while it really is slower.
        if (Math.round(rpmFull) < Math.round(fit.rpm)) stats.push({ label: "RPM at full dia (too slow)", value: rpmFull, unit: "RPM", places: 0 });
        const sp = c.units === "in" ? `(${fmt(v.sfm, 0)} SFM × 12)` : `(${fmt(v.sfm, 1)} m/min × 1000)`;
        explain.push({ title: "Speed at the real diameter", formula: c.units === "in" ? "RPM = SFM × 12 ÷ (π × Deff)" : "RPM = m/min × 1000 ÷ (π × Deff)",
          plugged: `= ${sp} ÷ (π × ${len(deff)}) = ${fmt(wantedRpm, 0)} RPM${fit.rpmCapped ? ` → ${fmt(fit.rpm, 0)} on ${m.name}` : ""}${fullBall ? "" : `, vs ${fmt(rpmFull, 0)} RPM at the full ${len(v.diameter)}`}` });
      }
    } else if (hasSpeed) {
      warnings.push("Enter Axial depth of cut to get the RPM at the effective diameter. At full-diameter RPM a shallow ball-nose pass runs far too slow.");
    }
    return {
      primary: v.mode === "stepover" ? { label: "Stepover", value: stepover, unit: c.L.length, places: p } : { label: "Scallop height", value: scallop, unit: c.L.length, places: 5 },
      stats, explain, warnings,
      source: "advanced",
      notes: ["Shallow 3D finishing cuts near the ball tip at close to zero surface speed — use the effective diameter to set RPM."],
      historyLabel: `Ø${fmt(v.diameter, p)} · ${v.mode === "stepover" ? `h ${fmt(scallop, 5)}` : `s ${fmt(stepover, p)}`}`,
    };
  },
});
