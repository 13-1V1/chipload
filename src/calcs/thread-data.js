// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Thread data lookup. Free: basic geometry and tap drill. Pro: class-of-fit limits (estimate).

import { register } from "../app/registry.js";
import { basicThreadGeometry, unToleranceEnvelope, lookupUnThread, lookupMetricThread, baseSeries } from "../core/thread.js";
import { lookupTapDrillUN, lookupTapDrillMetric, tapDrillByPercent } from "../core/tapdrill.js";
import { nearestDrillInch, nearestDrillMm, DRILL_MAX_IN, DRILL_MAX_MM } from "../core/drills.js";
import { fmt } from "../core/format.js";
import { threadFromSpec, threadPrefill, COMMON_THREADS } from "./_util.js";

/** A size with no chart row: the nearest drill to the 75% hole, or the size to bore once it is past the drill chart
 * (4-4 UNC, M64x2), the same cut-off Tap drill uses. */
function figuredTapDrill(t, nat) {
  const hole = tapDrillByPercent(nat.major, nat.pitch, 75);
  if (t.isUn ? hole > DRILL_MAX_IN + 1 / 64 : hole > DRILL_MAX_MM + 0.5) return `Bore to ${fmt(hole, t.isUn ? 4 : 2)} ${nat.u} · past the drill chart`;
  return `${(t.isUn ? nearestDrillInch(hole) : nearestDrillMm(hole)).label} · figured`;
}

export default register({
  id: "thread-data",
  title: "Thread data",
  short: "Pitch, major, minor, tap drill for a thread",
  help: "Everything about a thread size: outside diameter, pitch, the drill for tapping it, and the diameters inspectors check. Type it like 1/4-20, #10-32, or M8.",
  category: "thread",
  keywords: ["thread", "pitch diameter", "minor diameter", "major", "tpi", "unc", "unf", "metric", "class", "2a", "2b", "tolerance", "screw", "bolt", "thread size", "thread lookup"],
  pro: false,
  units: false,
  prefillRank: 2,
  prefill: (q) => threadPrefill(q),
  inputs: [
    { id: "thread", suggest: COMMON_THREADS, label: "Thread", kind: "text", default: "1/4-20", placeholder: "1/4-20 UNC, 3/8-24, M8x1.25" },
  ],
  compute(v) {
    const t = threadFromSpec(v.thread);
    const nat = t.isUn ? { major: t.major, pitch: 1 / t.tpi, u: "in", p: 4 } : { major: t.major, pitch: t.pitch, u: "mm", p: 3 };
    const g = basicThreadGeometry(nat.major, nat.pitch);
    const series = t.isUn ? lookupUnThread(t.major, t.tpi) : lookupMetricThread(t.major, t.pitch);
    const tap = t.isUn ? lookupTapDrillUN(t.major, t.tpi) : lookupTapDrillMetric(t.major, t.pitch);
    const tables = [];
    const warnings = t.caution ? [t.caution] : [];
    // "1/2-13 UNF" names a series the size isn't in: say so instead of quietly using the table's
    const typed = baseSeries(t.suppliedSeries);
    if (series && typed && typed !== "UN" && !series.endsWith(` ${typed}`)) warnings.push(`You wrote ${t.suppliedSeries}, but ${t.label} is ${series.replace(/^\S+ /, "")}. Check the callout.`);
    if (t.isUn) {
      const env = unToleranceEnvelope({ major: nat.major, pitch: nat.pitch });
      tables.push({
        title: "Class limits (ASME B1.1)", pro: true,
        columns: [{ key: "cls", label: "Class" }, { key: "pdMax", label: "PD max", align: "right", places: 4 }, { key: "pdMin", label: "PD min", align: "right", places: 4 }, { key: "other", label: "Major / minor", align: "right" }],
        rows: [
          { cls: "2A ext", pdMax: env["2A"].pdMax, pdMin: env["2A"].pdMin, other: `${fmt(env["2A"].majorMax, 4)} / ${fmt(env["2A"].majorMin, 4)}` },
          { cls: "3A ext", pdMax: env["3A"].pdMax, pdMin: env["3A"].pdMin, other: `${fmt(env["3A"].majorMax, 4)} / ${fmt(env["3A"].majorMin, 4)}` },
          { cls: "2B int", pdMax: env["2B"].pdMax, pdMin: env["2B"].pdMin, other: `minor ${fmt(env["2B"].minorMin, 4)}–${fmt(env["2B"].minorMax, 4)}` },
          { cls: "3B int", pdMax: env["3B"].pdMax, pdMin: env["3B"].pdMin, other: `minor ${fmt(env["3B"].minorMin, 4)}–${fmt(env["3B"].minorMax, 4)}` },
        ],
      });
    }
    return {
      primary: { label: `Basic pitch diameter · ${series || t.label}`, value: g.pitchDiameter, unit: nat.u, places: nat.p },
      stats: [
        { label: "Major diameter", value: g.major, unit: nat.u, places: nat.p },
        // 2-4.5 and 2-1/4-4.5 UNC are standard: keep the half thread (fmt drops a trailing zero, so 20 stays "20")
        { label: t.isUn ? "Threads per inch" : "Pitch", value: t.isUn ? t.tpi : t.pitch, unit: t.isUn ? "TPI" : "mm", places: t.isUn ? (Number.isInteger(t.tpi) ? 0 : 2) : 3 },
        { label: "Minor dia (internal)", value: g.internalMinor, unit: nat.u, places: nat.p },
        { label: "Minor dia (external)", value: g.externalMinor, unit: nat.u, places: nat.p },
        { label: "Thread depth (ext)", value: g.threadDepthExternal, unit: nat.u, places: nat.p },
        { label: t.isUn ? "Pitch" : "TPI equivalent", value: t.isUn ? nat.pitch : t.tpi, unit: t.isUn ? "in" : "TPI", places: t.isUn ? 4 : 2 },
        { label: "Tap drill (75%)", text: tap ? `${t.isUn ? tap.label : `${tap.size} mm`} · ${tap.percent}%` : figuredTapDrill(t, nat) },
        { label: "Series", text: series || (typed ? `${t.suppliedSeries} special (not a standard-series size)` : "non-standard") },
      ],
      warnings,
      tables,
      source: "threadGeometry",
      explain: [
        { title: "60° thread basics", formula: "H = 0.866 P   PD = D − 0.6495 P   minor (int) = D − 1.0825 P   minor (ext) = D − 1.2269 P", plugged: `P = ${fmt(nat.pitch, nat.p)} ${nat.u}, D = ${fmt(nat.major, nat.p)} ${nat.u}` },
      ],
      notes: [
        ...(/^UNR/.test(t.suppliedSeries || "") ? ["UNR (ASME B1.1): an external thread with a mandatory rounded root. Same sizes, classes and limits as UN; the root radius is checked separately."] : []),
        ...(/^UNJ/.test(t.suppliedSeries || "") ? ["UNJ (ASME B1.15): same basic diameters as UN, but the external root must have a 0.15011P–0.18042P radius and the internal minor is held larger to clear it. Use UNJ-specific taps and gauges."] : []),
        "Class limits come from the ASME B1.1 tolerance formulas, rounded the way the published tables are, with the few hand-adjusted table values used as printed. Standard-series threads match the tables; for a special, check the standard before you accept parts on it.",
      ],
      historyLabel: series || t.label,
    };
  },
});
