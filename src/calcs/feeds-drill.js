// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Speeds & feeds — drill. Free tier. SFM → RPM, feed per rev → IPM, optional hole time.

import { register } from "../app/registry.js";
import { rpmFromSfm, sfmFromRpm } from "../core/feeds.js";
import { materialOptions, materialSpeeds, toolCaution } from "../data/materials-library.js";
import { fmt } from "../core/format.js";
import { toIn, fromIn, toSfm, fromSfm } from "./_util.js";
import { drillFeedFactor, drillAdvice } from "./_advice.js";
import { machineFor, fitToMachine, spindleSanity } from "./_machine.js";

/**
 * Drilling feed per revolution by diameter, HSS in steel/aluminum — Machinery's Handbook "Feeds for
 * Drilling" (under 1/8: 0.001–0.002, 1/8–1/4: 0.002–0.004, 1/4–1/2: 0.004–0.007, 1/2–1: 0.007–0.015,
 * over 1: 0.015–0.025 in/rev), as the points 1/16 → 0.001, 1/8 → 0.002, 1/4 → 0.004, 1/2 → 0.007,
 * 1 → 0.010, 1.5 → 0.015, interpolated so the auto value moves smoothly with diameter.
 * Under 1/16 the feed keeps shrinking with the drill: 0.016 × D, the shop rule "0.001 per rev for every
 * 1/16 of diameter" (Norseman Drill). That sits under M.A. Ford's micro-drill data (Twister Micro XD:
 * 0.0005 IPR at 0.5 mm in low-carbon steel, carbide with coolant), as an HSS default should.
 */
export const MICRO_DRILL_IN = 0.0625;
export function drillFeedPerRev(diameterIn) {
  const pts = [[MICRO_DRILL_IN, 0.001], [0.125, 0.002], [0.25, 0.004], [0.5, 0.007], [1, 0.010], [1.5, 0.015]];
  if (diameterIn <= pts[0][0]) return Math.max(0.00005, pts[0][1] * diameterIn / pts[0][0]);
  if (diameterIn >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) {
    if (diameterIn <= pts[i][0]) {
      const [d0, f0] = pts[i - 1], [d1, f1] = pts[i];
      return f0 + (f1 - f0) * (diameterIn - d0) / (d1 - d0);
    }
  }
  return 0.005;
}

export default register({
  id: "feeds-drill",
  title: "Speeds & feeds — drill",
  short: "RPM, feed, and time per hole",
  help: "RPM and feed for a drill bit in a drill press or mill. Pick the drill size and material. If your machine only has a few speeds, use the closest one below the number.",
  category: "drill",
  keywords: ["drill", "rpm", "ipr", "feed", "sfm", "hole", "drilling speed", "drill bit", "drill press", "how fast to drill", "drilling speed"],
  pro: false,
  safety: "Starting point. Verify with your tooling maker and dry run.",
  inputs: [
    { id: "diameter", label: "Drill diameter", kind: "length", default: "0.25", defaultMm: "6", min: 0.0001 },
    { id: "material", label: "Material", kind: "select", default: "s1018", options: materialOptions() },
    { id: "toolType", label: "Drill", kind: "segment", default: "hss",
      options: [{ value: "hss", label: "HSS / cobalt" }, { value: "carbide", label: "Carbide" }] },
    { id: "sfm", advanced: true, label: "Surface speed", kind: "speed", default: "", places: 0,
      auto: (raw, c) => fromSfm(materialSpeeds(raw.material, raw.toolType === "carbide" ? "carbide" : "hss").drillSfm, c.units),
      hint: "Leave blank to use the table value." },
    { id: "ipr", advanced: true, label: "Feed per revolution", kind: "feedRev", default: "", places: 5,
      auto: (raw, c, v) => fromIn(drillFeedPerRev(toIn(Number.isFinite(v.diameter) ? v.diameter : 0.25, c.units)) * drillFeedFactor(materialSpeeds(raw.material).material.rating), c.units),
      hint: "Leave blank for the handbook feed, eased off for tough materials." },
    { id: "depth", positive: true, advanced: true, label: "Hole depth", kind: "length", default: "", optional: true, placeholder: "optional — gives time per hole" },
  ],
  compute(v, c) {
    const dIn = toIn(v.diameter, c.units);
    const sfm = toSfm(v.sfm, c.units);
    const iprIn = toIn(v.ipr, c.units);
    const requestedRpm = rpmFromSfm(sfm, dIn);
    const m = machineFor(c, "any");
    const fit = fitToMachine(m, requestedRpm, iprIn, c);
    const rpm = fit.rpm;
    const slowed = fit.rpmCapped || fit.feedCapped;
    const feedIpm = fit.feedIpm;
    const pointLen = dIn * 0.3; // 118° point ≈ 0.3 D
    const depthIn = Number.isFinite(v.depth) ? toIn(v.depth, c.units) : NaN;
    const timeMin = Number.isFinite(depthIn) ? (depthIn + pointLen) / feedIpm : null;
    const caution = toolCaution(v.material, v.toolType);
    const metric = c.units === "mm";
    const len = (x) => fmt(fromIn(x, c.units), metric ? 2 : 4);
    // Places for the feed per rev in the "Feed rate" line: enough that its rounding times the RPM stays under
    // a tenth of the feed's last digit (0.005), so the line works out to the feed it prints, micro drills included.
    const revPlaces = Math.max(4, Math.min(8, Math.ceil(Math.log10(200 * rpm)) || 4));

    const stats = [
      { label: slowed ? "Spindle (machine limit)" : "Spindle", value: rpm, unit: "RPM", places: 0, clamped: slowed },
      { label: "Feed per rev", value: fromIn(iprIn, c.units), unit: c.L.feedRev, places: dIn < MICRO_DRILL_IN ? 5 : 4 },
    ];
    if (slowed) stats.push({ label: "Wanted RPM", value: requestedRpm, unit: "RPM", places: 0 }, { label: "Actual surface speed", value: fromSfm(sfmFromRpm(rpm, dIn), c.units), unit: c.L.speed, places: 0 });
    if (timeMin != null) stats.push({ label: "Time per hole (incl. point)", value: timeMin * 60, unit: "sec", places: 1 });

    return {
      primary: { label: "Feed rate", value: fromIn(feedIpm, c.units), unit: c.L.feed, places: 1, clamped: fit.feedCapped },
      stats,
      warnings: [
        ...(caution ? [caution] : []),
        ...fit.warnings,
        ...spindleSanity(requestedRpm, m, "any", c),
        ...(dIn < MICRO_DRILL_IN ? ["Micro drill: peck often (about every half a diameter), use a spindle that runs true, and check the drill maker's chart. The feed here keeps shrinking with the size."] : []),
        ...drillAdvice({ dIn, depthIn }),
      ],
      source: "feeds",
      explain: metric
        ? [
            { title: "Spindle speed", formula: "RPM = (1000 × Vc) ÷ (π × D)", plugged: `= (1000 × ${fmt(fromSfm(sfm, "mm"), 3)}) ÷ (π × ${len(dIn)}) = ${fmt(requestedRpm, 0)}` },
            { title: "Feed rate", formula: "feed = RPM × feed per rev", plugged: `= ${fmt(rpm, 0)} × ${fmt(fromIn(iprIn, "mm"), revPlaces)} = ${fmt(fromIn(feedIpm, "mm"), 1)} mm/min` },
            ...(timeMin != null ? [{ title: "Time per hole", formula: "t = (depth + 0.3 D) ÷ feed", plugged: `= (${len(depthIn)} + ${len(pointLen)}) ÷ ${fmt(fromIn(feedIpm, "mm"), 1)} = ${fmt(timeMin, 3)} min` }] : []),
          ]
        : [
            { title: "Spindle speed", formula: "RPM = (SFM × 12) ÷ (π × D)", plugged: `= (${fmt(sfm, 0)} × 12) ÷ (π × ${len(dIn)}) = ${fmt(requestedRpm, 0)}` },
            { title: "Feed rate", formula: "IPM = RPM × IPR", plugged: `= ${fmt(rpm, 0)} × ${fmt(iprIn, revPlaces)} = ${fmt(feedIpm, 1)} IPM` },
            ...(timeMin != null ? [{ title: "Time per hole", formula: "t = (depth + 0.3 D) ÷ IPM", plugged: `= (${len(depthIn)} + ${len(pointLen)}) ÷ ${fmt(feedIpm, 1)} = ${fmt(timeMin, 3)} min` }] : []),
          ],
      historyLabel: `${fmt(v.diameter, c.units === "in" ? 4 : 2)} ${c.L.length} · ${materialSpeeds(v.material).material.name}`,
    };
  },
});
