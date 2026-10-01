// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Tap drill. Free tier. Thread spec + % thread → stock drill, with cut and roll-form taps.

import { register } from "../app/registry.js";
import { tapDrillByPercent, formTapDrillByPercent, percentThreadForDrill, lookupTapDrillUN, lookupTapDrillMetric } from "../core/tapdrill.js";
import { nearestDrillsInch, nearestDrillsMm } from "../core/drills.js";
import { fmt } from "../core/format.js";
import { threadFromSpec, threadPrefill, dual, COMMON_THREADS } from "./_util.js";

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
    const table = !form ? (t.isUn ? lookupTapDrillUN(t.majorIn, t.tpi) : lookupTapDrillMetric(t.majorMm, t.pitchMm)) : null;
    // At the shop-standard 75% a machinist expects the chart drill; any other % (or a form tap) is figured.
    const useChart = !!table && pct === 75;
    const byFormula = t.isUn ? nearestDrillsInch(calcIn) : nearestDrillsMm(calcIn * 25.4);
    const near = useChart ? (t.isUn ? nearestDrillsInch(table.size) : nearestDrillsMm(table.size)) : byFormula;
    const chosenIn = t.isUn ? near.nearest.size : near.nearest.size / 25.4;
    const actualPct = form ? (t.majorIn - chosenIn) / (0.0068 * t.pitchIn) : percentThreadForDrill(t.majorIn, t.pitchIn, chosenIn);
    const altIn = t.isUn ? nearestDrillsMm(calcIn * 25.4).nearest : nearestDrillsInch(calcIn).nearest;

    const stats = [
      { label: "Calculated diameter", text: dual(calcIn, t.nativeUnits) },
      { label: `Drill gives`, value: actualPct, unit: "% thread", places: 0 },
    ];
    if (table && !useChart) stats.push({ label: "Chart drill (75%)", text: `${t.isUn ? table.label : `${table.size} mm`} (${table.percent}%)` });
    if (useChart && byFormula.nearest.label !== near.nearest.label) stats.push({ label: "Nearest to 75% by formula", text: byFormula.nearest.label });
    stats.push({ label: "From", text: useChart ? (t.isUn ? "ANSI B94.11M tap drill chart" : "ISO 2306 tap drill chart") : "% thread formula, nearest stock drill" });
    if (near.prev) stats.push({ label: "One size smaller", text: `${near.prev.label} · ${t.isUn ? fmt(near.prev.size, 4) : fmt(near.prev.size, 2)}` });
    if (near.next) stats.push({ label: "One size larger", text: `${near.next.label} · ${t.isUn ? fmt(near.next.size, 4) : fmt(near.next.size, 2)}` });
    stats.push({ label: t.isUn ? "Nearest metric drill" : "Nearest inch drill", text: altIn.label });
    stats.push({ label: "Thread", text: `${t.label} · ${t.pitchLabel}` });

    const warnings = [];
    if (form) warnings.push("Roll-form taps displace metal: hole must be larger than for a cutting tap. Confirm with the tap maker's chart.");
    if (actualPct > 85) warnings.push("Over 85% thread adds tap torque without much strength. Consider a bigger drill.");
    if (actualPct < 55) warnings.push("Under 55% thread is weak. Consider a smaller drill.");

    return {
      primary: { label: `Tap drill for ${t.label} at ${pct}%`, text: near.nearest.label, unit: t.isUn ? `(${fmt(near.nearest.size, 4)} in)` : `(${fmt(near.nearest.size, 2)} mm)` },
      stats,
      warnings,
      source: "tapDrill",
      explain: form
        ? [{ title: "Roll-form tap drill", formula: "drill = D − 0.0068 × %thread × P", plugged: `= ${fmt(t.majorIn, 4)} − 0.0068 × ${pct} × ${fmt(t.pitchIn, 4)} = ${fmt(calcIn, 4)} in` }]
        : [{ title: "Cut tap drill", formula: "drill = D − (%thread ÷ 76.98) × P", plugged: `= ${fmt(t.majorIn, 4)} − (${pct} ÷ 76.98) × ${fmt(t.pitchIn, 4)} = ${fmt(calcIn, 4)} in` },
           { title: "Actual engagement with stock drill", formula: "% = (D − drill) ÷ P × 76.98", plugged: `= (${fmt(t.majorIn, 4)} − ${fmt(chosenIn, 4)}) ÷ ${fmt(t.pitchIn, 4)} × 76.98 = ${fmt(actualPct, 0)}%` }],
      notes: ["75% is the usual shop default. Tough materials (stainless, titanium) tap easier at 60–65%."],
      historyLabel: `${t.label} · ${pct}% · ${form ? "form" : "cut"}`,
    };
  },
});
