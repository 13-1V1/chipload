// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Tap drill. Free tier. Thread spec + % thread → stock drill, with cut and roll-form taps.

import { register } from "../app/registry.js";
import { tapDrillByPercent, formTapDrillByPercent, percentThreadForDrill, lookupTapDrillUN, lookupTapDrillMetric } from "../core/tapdrill.js";
import { nearestDrillsInch, nearestDrillsMm, DRILL_MIN_IN, DRILL_MAX_IN, DRILL_MIN_MM, DRILL_MAX_MM } from "../core/drills.js";
import { fmt } from "../core/format.js";
import { threadFromSpec, threadPrefill, dual, COMMON_THREADS } from "./_util.js";

/** A length in the thread's own unit: inch threads in inches, metric threads in mm. */
const nat = (t, valueIn) => (t.isUn ? fmt(valueIn, 4) : fmt(valueIn * 25.4, 3));

/** The hole is bigger than any drill on the chart: give the size to bore, not the chart's last drill. */
function offChart(t, pct, form, calcIn, maxIn) {
  const native = t.isUn ? `${fmt(calcIn, 4)} in` : `${fmt(calcIn * 25.4, 2)} mm`;
  const last = t.isUn ? `${fmt(maxIn, 4)} in` : `${fmt(maxIn * 25.4, 1)} mm`;
  return {
    primary: { label: `Hole for ${t.label} at ${pct}%`, text: `Bore to ${native}` },
    stats: [
      { label: "Calculated diameter", text: dual(calcIn, t.nativeUnits) },
      { label: "Largest drill on the chart", text: last },
      { label: "Thread", text: `${t.label} · ${t.pitchLabel}` },
    ],
    warnings: [`No stock drill comes near ${native}. Drill under size, then bore or interpolate to ${native} — or thread-mill it.`],
    source: "tapDrill",
    explain: [{ title: form ? "Roll-form tap hole" : "Cut tap hole", formula: form ? "hole = D − 0.0068 × %thread × P" : "hole = D − (%thread ÷ 76.98) × P",
      plugged: `= ${nat(t, t.majorIn)} − ${form ? `0.0068 × ${pct}` : `(${pct} ÷ 76.98)`} × ${nat(t, t.pitchIn)} = ${nat(t, calcIn)} ${t.nativeUnits}` }],
    historyLabel: `${t.label} · ${pct}% · ${form ? "form" : "cut"}`,
  };
}

export default register({
  id: "tap-drill",
  title: "Tap drill",
  short: "Drill size for a thread and % engagement",
  help: "Before you cut threads with a tap, you drill a hole a bit smaller than the thread. Type the thread (like 1/4-20 or M8) and this gives the drill to use.",
  category: "drill",
  keywords: ["tap", "tap drill", "thread", "percent", "drill size", "form tap", "roll tap", "unc", "unf", "metric", "what drill", "hole for tap", "tap size", "tap hole", "tapping", "screw thread"],
  pro: false,
  units: false,
  prefillRank: 1,
  prefill: (q) => threadPrefill(q),
  inputs: [
    { id: "thread", suggest: COMMON_THREADS, label: "Thread", kind: "text", default: "1/4-20", placeholder: "1/4-20, #10-32, M10x1.5" },
    { id: "tapType", label: "Tap", kind: "segment", default: "cut", options: [{ value: "cut", label: "Cutting tap" }, { value: "form", label: "Roll-form tap" }] },
    { id: "percent", label: "Thread engagement", kind: "segment", default: "75",
      options: [{ value: "60", label: "60%" }, { value: "65", label: "65%" }, { value: "70", label: "70%" }, { value: "75", label: "75%" }, { value: "80", label: "80%" }] },
  ],
  compute(v) {
    const t = threadFromSpec(v.thread);
    const pct = Number(v.percent);
    const form = v.tapType === "form";
    const calcIn = form ? formTapDrillByPercent(t.majorIn, t.pitchIn, pct) : tapDrillByPercent(t.majorIn, t.pitchIn, pct);
    // A pitch that eats the whole diameter is a typo, not a thread (a real one, even 4-4 UNC, leaves most of it).
    if (!(calcIn > t.majorIn * 0.25)) throw new Error(`That pitch is too coarse for a ${t.isUn ? fmt(t.majorIn, 4) + " in" : fmt(t.majorMm, 2) + " mm"} thread. Check the thread size`);
    const table = !form ? (t.isUn ? lookupTapDrillUN(t.majorIn, t.tpi) : lookupTapDrillMetric(t.majorMm, t.pitchMm)) : null;
    // Past the end of the drill chart there is no stock drill to name: give the hole size to bore.
    const maxIn = t.isUn ? DRILL_MAX_IN : DRILL_MAX_MM / 25.4;
    const tolIn = t.isUn ? 1 / 64 : 0.5 / 25.4;
    if (calcIn > maxIn + tolIn) return offChart(t, pct, form, calcIn, maxIn);
    // At the shop-standard 75% a machinist expects the chart drill; any other % (or a form tap) is figured.
    const useChart = !!table && pct === 75;
    const byFormula = t.isUn ? nearestDrillsInch(calcIn) : nearestDrillsMm(calcIn * 25.4);
    const near = useChart ? (t.isUn ? nearestDrillsInch(table.size) : nearestDrillsMm(table.size)) : byFormula;
    const chosenIn = t.isUn ? near.nearest.size : near.nearest.size / 25.4;
    const actualPct = form ? (t.majorIn - chosenIn) / (0.0068 * t.pitchIn) : percentThreadForDrill(t.majorIn, t.pitchIn, chosenIn);
    // The other system's nearest drill, unless the hole is off that chart's ends (then there is none to name).
    const altOff = t.isUn ? (calcIn * 25.4 > DRILL_MAX_MM + 0.5 || calcIn * 25.4 < DRILL_MIN_MM - 0.05)
      : (calcIn > DRILL_MAX_IN + 1 / 64 || calcIn < DRILL_MIN_IN - 0.002);
    const altText = altOff
      ? `None on the chart (hole is ${t.isUn ? `${fmt(calcIn * 25.4, 2)} mm` : `${fmt(calcIn, 4)} in`})`
      : (t.isUn ? nearestDrillsMm(calcIn * 25.4) : nearestDrillsInch(calcIn)).nearest.label;
    // Metric chart labels already carry "mm"; inch labels (#7, 1/4") get the decimal size after them.
    const sizeNote = (d) => (t.isUn ? ` · ${fmt(d.size, 4)} in` : "");

    const stats = [
      { label: "Calculated diameter", text: dual(calcIn, t.nativeUnits) },
      { label: `Drill gives`, value: actualPct, unit: "% thread", places: 0 },
    ];
    if (table && !useChart) stats.push({ label: "Chart drill (75%)", text: `${t.isUn ? table.label : `${table.size} mm`} (${table.percent}%)` });
    if (useChart && byFormula.nearest.label !== near.nearest.label) stats.push({ label: "Nearest to 75% by formula", text: byFormula.nearest.label });
    stats.push({ label: "From", text: useChart ? (t.isUn ? "Machinery's Handbook tap drill chart" : "ISO 2306 tap drill chart") : "% thread formula, nearest stock drill" });
    if (near.prev) stats.push({ label: "One size smaller", text: `${near.prev.label}${sizeNote(near.prev)}` });
    if (near.next) stats.push({ label: "One size larger", text: `${near.next.label}${sizeNote(near.next)}` });
    stats.push({ label: t.isUn ? "Nearest metric drill" : "Nearest inch drill", text: altText });
    stats.push({ label: "Thread", text: `${t.label} · ${t.pitchLabel}` });

    const warnings = [];
    if (form) warnings.push("Roll-form taps displace metal: hole must be larger than for a cutting tap. Confirm with the tap maker's chart.");
    if (actualPct > 85) warnings.push("Over 85% thread adds tap torque without much strength. Consider a bigger drill.");
    if (actualPct < 55) warnings.push("Under 55% thread is weak. Consider a smaller drill.");

    return {
      primary: { label: `Tap drill for ${t.label} at ${pct}%`, text: near.nearest.label, ...(t.isUn ? { unit: `(${fmt(near.nearest.size, 4)} in)` } : {}) },
      stats,
      warnings,
      source: "tapDrill",
      explain: form
        ? [{ title: "Roll-form tap drill", formula: "drill = D − 0.0068 × %thread × P", plugged: `= ${nat(t, t.majorIn)} − 0.0068 × ${pct} × ${nat(t, t.pitchIn)} = ${nat(t, calcIn)} ${t.nativeUnits}` }]
        : [{ title: "Cut tap drill", formula: "drill = D − (%thread ÷ 76.98) × P", plugged: `= ${nat(t, t.majorIn)} − (${pct} ÷ 76.98) × ${nat(t, t.pitchIn)} = ${nat(t, calcIn)} ${t.nativeUnits}` },
           { title: "Actual engagement with stock drill", formula: "% = (D − drill) ÷ P × 76.98", plugged: `= (${nat(t, t.majorIn)} − ${nat(t, chosenIn)}) ÷ ${nat(t, t.pitchIn)} × 76.98 = ${fmt(actualPct, 0)}%` }],
      notes: ["75% is the usual shop default. Tough materials (stainless, titanium) tap easier at 60–65%."],
      historyLabel: `${t.label} · ${pct}% · ${form ? "form" : "cut"}`,
    };
  },
});
