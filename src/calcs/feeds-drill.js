// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Speeds & feeds — drill. Free tier. SFM → RPM, feed per rev → IPM, optional hole time.

import { register } from "../app/registry.js";
import { rpmFromSfm, sfmFromRpm } from "../core/feeds.js";
import { SF_DEFAULTS, MATERIAL_LABELS } from "../data/materials.js";
import { fmt } from "../core/format.js";
import { toIn, fromIn, toSfm, fromSfm } from "./_util.js";

/**
 * Drilling feed per revolution by diameter, HSS in steel/aluminum — Machinery's Handbook
 * "Feeds for Drilling": ≤1/8 → 0.002, 1/8–1/4 → 0.004, 1/4–1/2 → 0.007, 1/2–1 → 0.010, >1 → 0.015 in/rev.
 * Interpolated so the auto value moves smoothly with diameter.
 */
export function drillFeedPerRev(diameterIn) {
  const pts = [[0.0625, 0.001], [0.125, 0.002], [0.25, 0.004], [0.5, 0.007], [1, 0.010], [1.5, 0.015]];
  if (diameterIn <= pts[0][0]) return pts[0][1];
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
  category: "drill",
  keywords: ["drill", "rpm", "ipr", "feed", "sfm", "hole", "drilling speed"],
  pro: false,
  safety: "Starting point. Verify with your tooling maker and dry run.",
  inputs: [
    { id: "diameter", label: "Drill diameter", kind: "length", default: "0.25", min: 0.0001 },
    { id: "material", label: "Material", kind: "select", default: "mildSteel",
      options: Object.keys(SF_DEFAULTS).map((k) => ({ value: k, label: MATERIAL_LABELS[k] })) },
    { id: "toolType", label: "Drill", kind: "segment", default: "hss",
      options: [{ value: "hss", label: "HSS / cobalt" }, { value: "carbide", label: "Carbide" }] },
    { id: "sfm", label: "Surface speed", kind: "speed", default: "", places: 0,
      auto: (raw, c) => fromSfm((SF_DEFAULTS[raw.material] || SF_DEFAULTS.mildSteel)[raw.toolType === "carbide" ? "carbide" : "hss"].sfm, c.units),
      hint: "Leave blank to use the table value." },
    { id: "ipr", label: "Feed per revolution", kind: "feedRev", default: "", places: 4,
      auto: (raw, c, v) => fromIn(drillFeedPerRev(toIn(Number.isFinite(v.diameter) ? v.diameter : 0.25, c.units)), c.units) },
    { id: "depth", label: "Hole depth", kind: "length", default: "", optional: true, placeholder: "optional — gives time per hole" },
  ],
  compute(v, c) {
    const dIn = toIn(v.diameter, c.units);
    const sfm = toSfm(v.sfm, c.units);
    const iprIn = toIn(v.ipr, c.units);
    const requestedRpm = rpmFromSfm(sfm, dIn);
    const maxRpm = c.machine?.maxRpm > 0 ? c.machine.maxRpm : Infinity;
    const rpm = Math.min(requestedRpm, maxRpm);
    const clampedRpm = rpm < requestedRpm;
    const feedIpm = rpm * iprIn;
    const pointLen = dIn * 0.3; // 118° point ≈ 0.3 D
    const depthIn = Number.isFinite(v.depth) ? toIn(v.depth, c.units) : NaN;
    const timeMin = Number.isFinite(depthIn) ? (depthIn + pointLen) / feedIpm : null;

    const stats = [
      { label: clampedRpm ? "Spindle (machine max)" : "Spindle", value: rpm, unit: "RPM", places: 0, clamped: clampedRpm },
      { label: "Feed per rev", value: fromIn(iprIn, c.units), unit: c.L.feedRev, places: 4 },
    ];
    if (clampedRpm) stats.push({ label: "Wanted RPM", value: requestedRpm, unit: "RPM", places: 0 }, { label: "Actual surface speed", value: fromSfm(sfmFromRpm(rpm, dIn), c.units), unit: c.L.speed, places: 0 });
    if (timeMin != null) stats.push({ label: "Time per hole (incl. point)", value: timeMin * 60, unit: "sec", places: 1 });

    return {
      primary: { label: "Feed rate", value: fromIn(feedIpm, c.units), unit: c.L.feed, places: 1 },
      stats,
      warnings: clampedRpm ? [`${c.machine.name} tops out at ${fmt(maxRpm, 0)} RPM. Wanted ${fmt(requestedRpm, 0)}. Feed is figured at ${fmt(rpm, 0)} RPM.`] : [],
      source: "feeds",
      explain: [
        { title: "Spindle speed", formula: "RPM = (SFM × 12) ÷ (π × D)", plugged: `= (${fmt(sfm, 0)} × 12) ÷ (π × ${fmt(dIn, 4)}) = ${fmt(requestedRpm, 0)}` },
        { title: "Feed rate", formula: "IPM = RPM × IPR", plugged: `= ${fmt(rpm, 0)} × ${fmt(iprIn, 4)} = ${fmt(feedIpm, 1)}` },
        ...(timeMin != null ? [{ title: "Time per hole", formula: "t = (depth + 0.3 D) ÷ IPM", plugged: `= (${fmt(depthIn, 3)} + ${fmt(pointLen, 3)}) ÷ ${fmt(feedIpm, 1)} = ${fmt(timeMin, 3)} min` }] : []),
      ],
      historyLabel: `${fmt(v.diameter, c.units === "in" ? 4 : 2)} ${c.L.length} · ${MATERIAL_LABELS[v.material]}`,
    };
  },
});
