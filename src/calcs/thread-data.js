// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Thread data lookup. Free: basic geometry and tap drill. Pro: class-of-fit limits (estimate).

import { register } from "../app/registry.js";
import { basicThreadGeometry, unToleranceEnvelope, lookupUnThread, lookupMetricThread, baseSeries } from "../core/thread.js";
import { lookupTapDrillUN, lookupTapDrillMetric, tapDrillByPercent, percentThreadForDrill } from "../core/tapdrill.js";
import { nearestDrillInch, nearestDrillMm, DRILL_MIN_IN, DRILL_MAX_IN, DRILL_MIN_MM, DRILL_MAX_MM } from "../core/drills.js";
import { fmt } from "../core/format.js";
import { threadFromSpec, threadPrefill, COMMON_THREADS } from "./_util.js";

/**
 * Thread data has no inch/mm switch of its own (units: false), so it reads lengths the way Tap drill does: a metric
 * thread in mm, an inch thread in inches unless the app is set to mm.
 */
const readsMm = (t, c) => !t.isUn || c?.units === "mm" || c?.settings?.units === "mm";

/** A size with no chart row: the nearest drill to the 75% hole, or, past either end of the drill chart (4-4 UNC,
 * M64x2; 0.01-300, M0.25x0.075), the size to bore or the micro drill to buy — the same cut-offs Tap drill uses.
 * `len(x, inPlaces, mmPlaces)` writes a length in the thread's unit (inches or mm) the way the screen reads. */
function figuredTapDrill(t, nat, len) {
  const hole = tapDrillByPercent(nat.major, nat.pitch, 75);
  if (t.isUn ? hole > DRILL_MAX_IN + 1 / 64 : hole > DRILL_MAX_MM + 0.5) return `Bore to ${len(hole, 4, 2)} · past the drill chart`;
  // under the smallest drill (#80, 0.2 mm), and that drill would leave under 55% thread: no stock drill to name
  const smallest = t.isUn ? DRILL_MIN_IN : DRILL_MIN_MM;
  if (hole < smallest && percentThreadForDrill(nat.major, nat.pitch, smallest) < 55) return `Micro drill ${len(hole, 4, 3)} · under the drill chart`;
  const drill = t.isUn ? nearestDrillInch(hole) : nearestDrillMm(hole);
  return `${drill.label}${t.isUn && nat.mm ? ` (${len(drill.size, 4, 3)})` : ""} · figured`;
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
  compute(v, c) {
    const t = threadFromSpec(v.thread);
    const mm = readsMm(t, c);
    // nat: the thread's own unit, for the math. Shown lengths: an inch thread on a mm screen is converted (×25.4, 3 places).
    const nat = t.isUn ? { major: t.major, pitch: 1 / t.tpi, mm } : { major: t.major, pitch: t.pitch, mm };
    const k = t.isUn && mm ? 25.4 : 1, u = mm ? "mm" : "in", lp = mm ? 3 : 4;
    const L = (x) => x * k;
    const len = (x, inPlaces, mmPlaces) => (mm ? `${fmt(L(x), mmPlaces)} mm` : `${fmt(x, inPlaces)} in`);
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
      // The inch limits are exact to 0.0001 in. Converted to mm they round inward (max down, min up), so a part
      // inside the shown mm band is inside the inch limit.
      const hi = (x) => (k === 1 ? x : Math.floor(Number((L(x) * 1e3).toFixed(6))) / 1e3);
      const lo = (x) => (k === 1 ? x : Math.ceil(Number((L(x) * 1e3).toFixed(6))) / 1e3);
      const f = (x) => fmt(x, lp);
      tables.push({
        title: "Class limits (ASME B1.1)", pro: true,
        columns: [{ key: "cls", label: "Class" }, { key: "pdMax", label: `PD max, ${u}`, align: "right", places: lp }, { key: "pdMin", label: `PD min, ${u}`, align: "right", places: lp }, { key: "other", label: `Major / minor, ${u}`, align: "right" }],
        rows: [
          { cls: "2A ext", pdMax: hi(env["2A"].pdMax), pdMin: lo(env["2A"].pdMin), other: `${f(hi(env["2A"].majorMax))} / ${f(lo(env["2A"].majorMin))}` },
          { cls: "3A ext", pdMax: hi(env["3A"].pdMax), pdMin: lo(env["3A"].pdMin), other: `${f(hi(env["3A"].majorMax))} / ${f(lo(env["3A"].majorMin))}` },
          { cls: "2B int", pdMax: hi(env["2B"].pdMax), pdMin: lo(env["2B"].pdMin), other: `minor ${f(lo(env["2B"].minorMin))}–${f(hi(env["2B"].minorMax))}` },
          { cls: "3B int", pdMax: hi(env["3B"].pdMax), pdMin: lo(env["3B"].pdMin), other: `minor ${f(lo(env["3B"].minorMin))}–${f(hi(env["3B"].minorMax))}` },
        ],
      });
    }
    return {
      primary: { label: `Basic pitch diameter · ${series || t.label}`, value: L(g.pitchDiameter), unit: u, places: lp },
      stats: [
        { label: "Major diameter", value: L(g.major), unit: u, places: lp },
        // 2-4.5 and 2-1/4-4.5 UNC are standard: keep the half thread (fmt drops a trailing zero, so 20 stays "20")
        { label: t.isUn ? "Threads per inch" : "Pitch", value: t.isUn ? t.tpi : t.pitch, unit: t.isUn ? "TPI" : "mm", places: t.isUn ? (Number.isInteger(t.tpi) ? 0 : 2) : 3 },
        { label: "Minor dia (internal)", value: L(g.internalMinor), unit: u, places: lp },
        { label: "Minor dia (external)", value: L(g.externalMinor), unit: u, places: lp },
        { label: "Thread depth (ext)", value: L(g.threadDepthExternal), unit: u, places: lp },
        { label: t.isUn ? "Pitch" : "TPI equivalent", value: t.isUn ? L(nat.pitch) : t.tpi, unit: t.isUn ? u : "TPI", places: t.isUn ? lp : 2 },
        { label: "Tap drill (75%)", text: tap ? `${t.isUn ? `${tap.label}${mm ? ` (${len(tap.size, 4, 3)})` : ""}` : `${tap.size} mm`} · ${tap.percent}%` : figuredTapDrill(t, nat, len) },
        { label: "Series", text: series || (typed ? `${t.suppliedSeries} special (not a standard-series size)` : "non-standard") },
      ],
      warnings,
      tables,
      source: "threadGeometry",
      explain: [
        { title: "60° thread basics", formula: "H = 0.866 P   PD = D − 0.6495 P   minor (int) = D − 1.0825 P   minor (ext) = D − 1.2269 P", plugged: `P = ${len(nat.pitch, 4, 3)}, D = ${len(nat.major, 4, 3)}` },
      ],
      notes: [
        ...(t.isUn && mm ? [`${t.label} is an inch thread: it is specified in inches (${t.tpi} TPI); the lengths here are converted to mm.`] : []),
        ...(/^UNR/.test(t.suppliedSeries || "") ? ["UNR (ASME B1.1): an external thread with a mandatory rounded root. Same sizes, classes and limits as UN; the root radius is checked separately."] : []),
        ...(/^UNJ/.test(t.suppliedSeries || "") ? ["UNJ (ASME B1.15): same basic diameters as UN, but the external root must have a 0.15011P–0.18042P radius and the internal minor is held larger to clear it. Use UNJ-specific taps and gauges."] : []),
        // the B1.1 note goes with the B1.1 table, which only an inch thread gets; ISO 965 limits live in their own tool
        ...(t.isUn
          ? ["Class limits are ASME B1.1-2003 Table 2: the tolerance formulas, rounded per ASME B1.30 the way that table is. Standard-series threads match it; for a special, check the standard before you accept parts on it."]
          : ["6g / 6H class limits (ISO 965-1): see Metric thread limits."]),
      ],
      historyLabel: series || t.label,
    };
  },
});
