// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Lathe cycle time: turn, face, groove, cutoff — constant RPM or constant surface speed. Pro.

import { register } from "../app/registry.js";
import { turningTime, facingTimeRpm, facingTimeCss } from "../core/lathe.js";
import { rpmFromSfm, sfmFromRpm } from "../core/feeds.js";
import { fmt } from "../core/format.js";
import { toIn, fromIn, toSfm, fromSfm, lenPlaces } from "./_util.js";
import { machineFor, fitToMachine, maxRpmOf, maxFeedIpmOf, maxRpmAtFeed, spindleSanity } from "./_machine.js";

/** The fitted cut, or the plain reason it can't run (one turn already moves more than the machine's top feed). */
function fitted(m, rpm, iprIn, c) {
  const fit = fitToMachine(m, rpm, iprIn, c);
  if (fit.cantRun) throw new Error(fit.problem);
  return fit;
}

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
    { id: "sfm", label: "Surface speed", kind: "speed", default: "400", defaultMm: "120", min: 1, showIf: (r) => r.speedMode === "css" },
    { id: "rpm", label: "Spindle", kind: "int", default: "800", unit: "RPM", min: 1, showIf: (r) => r.speedMode === "rpm" },
    { id: "maxRpm", min: 1, advanced: true, label: "Max RPM (G50)", kind: "int", default: "", unit: "RPM", optional: true, placeholder: "optional", showIf: (r) => r.speedMode === "css" },
    { id: "ipr", label: "Feed per revolution", kind: "feedRev", default: "0.010", defaultMm: "0.25", min: 0.00001 },
    { id: "od", label: "Outer diameter", kind: "length", default: "2", defaultMm: "50", min: 0.0001 },
    { id: "id", label: "Inner diameter (0 = solid)", kind: "length", default: "0", min: 0, showIf: (r) => r.op !== "turn" },
    { id: "length", label: "Length of cut", kind: "length", default: "4", defaultMm: "100", min: 0, showIf: (r) => r.op === "turn" },
    { id: "depth", label: "Groove depth (radial)", kind: "length", default: "0.1", defaultMm: "2.5", min: 0, showIf: (r) => r.op === "groove" },
    { id: "passes", label: "Passes", kind: "int", default: "1", min: 1 },
    { id: "rapid", advanced: true, label: "Return / index per pass", kind: "number", default: "2", unit: "sec", min: 0 },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const inch = c.units === "in";
    const odIn = toIn(v.od, c.units), idIn = toIn(Number.isFinite(v.id) ? v.id : 0, c.units);
    const iprIn = toIn(v.ipr, c.units);
    const sfm = v.speedMode === "css" ? toSfm(v.sfm, c.units) : null;
    if (v.op !== "turn" && idIn >= odIn) throw new Error("Inner diameter has to be smaller than the outer diameter");
    // What the explain lines show, in the working unit with the unit written on it.
    const D = (dIn) => `${fmt(fromIn(dIn, c.units), p)} ${c.L.length}`;
    const f = `${fmt(v.ipr, inch ? 4 : 3)} ${c.L.feedRev}`;
    const V = `${fmt(v.sfm, inch ? 0 : 1)} ${c.L.speed}`;
    const K = inch ? "48 × SFM" : "4000 × m/min"; // π(D² − d²) ÷ (K × f): 48 with inches and SFM, 4000 with mm and m/min
    const m = machineFor(c, "lathe");
    const g50 = Number.isFinite(v.maxRpm) ? v.maxRpm : Infinity; // the user's clamp, never replaced by the machine's
    const warnings = [];
    let perPass, how, spindle = null, usedRpm = null;
    if (v.op === "turn") {
      const wanted = v.speedMode === "css" ? Math.min(rpmFromSfm(sfm, odIn), g50) : v.rpm;
      const fit = fitted(m, wanted, iprIn, c);
      warnings.push(...fit.warnings, ...spindleSanity(fit.rpm, m, "lathe", c));
      spindle = { label: "Spindle used", value: fit.rpm, clamped: fit.rpmCapped || fit.feedCapped };
      usedRpm = fit.rpm;
      perPass = turningTime({ length: toIn(v.length, c.units), ipr: iprIn, rpm: fit.rpm });
      how = { formula: "t = L ÷ (f × N)", plugged: `= ${D(toIn(v.length, c.units))} ÷ (${f} × ${fmt(fit.rpm, 0)} RPM) = ${fmt(perPass, 3)} min` };
    } else {
      const inner = v.op === "groove" ? Math.max(idIn, odIn - 2 * toIn(v.depth, c.units)) : idIn;
      if (v.speedMode === "css") {
        // CSS until the spindle stops climbing, then constant RPM the rest of the way in. It stops at the G50
        // typed in, or at the machine's top speed (or the speed where the feed hits its top feed), whichever is lower.
        const machineTop = maxRpmAtFeed(m, iprIn);
        if (machineTop < 1) fitted(m, maxRpmOf(m), iprIn, c); // no whole RPM runs this feed per rev: says why
        const capRpm = Math.min(g50, machineTop);
        const peak = Math.min(g50, inner > 0 ? rpmFromSfm(sfm, inner) : Infinity); // fastest the cut asks for
        if (Number.isFinite(peak)) {
          const fit = fitted(m, peak, iprIn, c);
          warnings.push(...fit.warnings, ...spindleSanity(fit.rpm, m, "lathe", c));
        } else if (machineTop < maxRpmOf(m)) {
          // The machine's top feed, not its top speed, is what stops the spindle at this feed per rev.
          const feedText = `${fmt(inch ? maxFeedIpmOf(m) : maxFeedIpmOf(m) * 25.4, 1)} ${c.L.feed}`;
          warnings.push(`No G50 set: under G96 the spindle climbs toward center. Figured at ${fmt(machineTop, 0)} RPM, where ${m.name}'s max feed of ${feedText} is reached at this feed per rev — put a G50 in the program.`);
          // A profile with no max spindle stops only at its feed, which can be a speed no lathe turns.
          warnings.push(...spindleSanity(machineTop, m, "lathe", c));
        } else if (Number.isFinite(machineTop)) {
          warnings.push(`No G50 set: under G96 the spindle climbs toward center. Figured at ${m.name}'s top of ${fmt(machineTop, 0)} RPM — put a G50 in the program.`);
        } else {
          warnings.push("No max RPM set: under G96 the spindle would try to go infinite at center. Set a G50 / max RPM.");
        }
        const dCap = Number.isFinite(capRpm) ? (12 * sfm) / (Math.PI * capRpm) : 0; // diameter where the cap kicks in
        if (dCap > inner) spindle = { label: "Spindle tops out at", value: capRpm, clamped: capRpm < g50 };
        if (dCap > inner && dCap < odIn) {
          perPass = facingTimeCss({ outerDia: odIn, innerDia: dCap, sfm, ipr: iprIn }) + facingTimeRpm({ outerDia: dCap, innerDia: inner, ipr: iprIn, rpm: capRpm });
          how = { formula: `t = π(D² − Dcap²) ÷ (${K} × f) + (Dcap − d) ÷ (2 f Nmax)`, plugged: `Dcap = ${D(dCap)} at ${fmt(capRpm, 0)} RPM → ${fmt(perPass, 3)} min` };
        } else if (dCap >= odIn) {
          perPass = facingTimeRpm({ outerDia: odIn, innerDia: inner, ipr: iprIn, rpm: capRpm });
          how = { formula: "t = (D − d) ÷ (2 f Nmax)   (cap reached before the cut starts)", plugged: `= (${D(odIn)} − ${D(inner)}) ÷ (2 × ${f} × ${fmt(capRpm, 0)} RPM) = ${fmt(perPass, 3)} min` };
        } else {
          perPass = facingTimeCss({ outerDia: odIn, innerDia: inner, sfm, ipr: iprIn });
          how = { formula: `t = π (D² − d²) ÷ (${K} × f)`, plugged: `= π ((${D(odIn)})² − (${D(inner)})²) ÷ (${inch ? 48 : 4000} × ${V} × ${f}) = ${fmt(perPass, 3)} min` };
        }
      } else {
        const fit = fitted(m, v.rpm, iprIn, c);
        warnings.push(...fit.warnings, ...spindleSanity(fit.rpm, m, "lathe", c));
        spindle = { label: "Spindle used", value: fit.rpm, clamped: fit.rpmCapped || fit.feedCapped };
        usedRpm = fit.rpm;
        perPass = facingTimeRpm({ outerDia: odIn, innerDia: inner, ipr: iprIn, rpm: fit.rpm });
        how = { formula: "t = (D − d) ÷ (2 × f × N)", plugged: `= (${D(odIn)} − ${D(inner)}) ÷ (2 × ${f} × ${fmt(fit.rpm, 0)} RPM) = ${fmt(perPass, 3)} min` };
      }
    }
    const total = v.passes * perPass + v.passes * v.rapid / 60;
    // At a typed G97 RPM the surface speed follows the diameter; at the OD it is the fastest the edge runs.
    const explain = [{ title: "Cutting time", formula: how.formula, plugged: how.plugged }];
    let odSpeed = null;
    if (v.speedMode === "rpm" && usedRpm != null) {
      odSpeed = { label: "Surface speed at the OD", value: fromSfm(sfmFromRpm(usedRpm, odIn), c.units), unit: c.L.speed, places: 0 };
      explain.push(inch
        ? { title: "Surface speed at the OD", formula: "SFM = π × D × N ÷ 12", plugged: `= π × ${D(odIn)} × ${fmt(usedRpm, 0)} RPM ÷ 12 = ${fmt(odSpeed.value, 0)} SFM` }
        : { title: "Surface speed at the OD", formula: "m/min = π × D × N ÷ 1000", plugged: `= π × ${D(odIn)} × ${fmt(usedRpm, 0)} RPM ÷ 1000 = ${fmt(odSpeed.value, 0)} m/min` });
    }
    return {
      primary: { label: `${v.op[0].toUpperCase() + v.op.slice(1)} · ${v.passes} pass${v.passes > 1 ? "es" : ""}`, value: total, unit: "min", places: 2 },
      stats: [
        { label: "Per pass (cutting)", value: perPass * 60, unit: "sec", places: 1 },
        { label: "Overhead", value: v.passes * v.rapid, unit: "sec", places: 0 },
        ...(spindle ? [{ ...spindle, unit: "RPM", places: 0 }] : []),
        ...(odSpeed ? [odSpeed] : []),
        { label: "Total", text: hms(total) },
      ],
      warnings,
      source: "advanced",
      explain,
      historyLabel: `${v.op} Ø${fmt(v.od, p)} ${c.L.length} · ${fmt(total, 2)} min`,
    };
  },
});

function hms(minutes) {
  const s = Math.round(minutes * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`;
}
