// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Thread data lookup. Free: basic geometry and tap drill. Pro: class-of-fit limits (estimate).

import { register } from "../app/registry.js";
import { basicThreadGeometry, unToleranceEnvelope, lookupUnThread, lookupMetricThread } from "../core/thread.js";
import { lookupTapDrillUN, lookupTapDrillMetric } from "../core/tapdrill.js";
import { fmt } from "../core/format.js";
import { threadFromSpec, threadPrefill } from "./_util.js";

export default register({
  id: "thread-data",
  title: "Thread data",
  short: "Pitch, major, minor, tap drill for a thread",
  category: "thread",
  keywords: ["thread", "pitch diameter", "minor diameter", "major", "tpi", "unc", "unf", "metric", "class", "2a", "2b", "tolerance"],
  pro: false,
  units: false,
  prefillRank: 2,
  prefill: (q) => threadPrefill(q),
  inputs: [
    { id: "thread", label: "Thread", kind: "text", default: "1/4-20", placeholder: "1/4-20 UNC, 3/8-24, M8x1.25" },
  ],
  compute(v) {
    const t = threadFromSpec(v.thread);
    const nat = t.isUn ? { major: t.major, pitch: 1 / t.tpi, u: "in", p: 4 } : { major: t.major, pitch: t.pitch, u: "mm", p: 3 };
    const g = basicThreadGeometry(nat.major, nat.pitch);
    const series = t.isUn ? lookupUnThread(t.major, t.tpi) : lookupMetricThread(t.major, t.pitch);
    const tap = t.isUn ? lookupTapDrillUN(t.major, t.tpi) : lookupTapDrillMetric(t.major, t.pitch);
    const tables = [];
    if (t.isUn) {
      const env = unToleranceEnvelope({ major: nat.major, pitch: nat.pitch });
      tables.push({
        title: "Class limits (ASME B1.1 estimate)", pro: true,
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
        { label: t.isUn ? "Threads per inch" : "Pitch", value: t.isUn ? t.tpi : t.pitch, unit: t.isUn ? "TPI" : "mm", places: t.isUn ? 0 : 3 },
        { label: "Minor dia (internal)", value: g.internalMinor, unit: nat.u, places: nat.p },
        { label: "Minor dia (external)", value: g.externalMinor, unit: nat.u, places: nat.p },
        { label: "Thread depth (ext)", value: g.threadDepthExternal, unit: nat.u, places: nat.p },
        { label: t.isUn ? "Pitch" : "TPI equivalent", value: t.isUn ? nat.pitch : t.tpi, unit: t.isUn ? "in" : "TPI", places: t.isUn ? 4 : 2 },
        { label: "Tap drill (75%)", text: tap ? `${tap.label} · ${tap.percent}%` : "not in chart" },
        { label: "Series", text: series || "non-standard" },
      ],
      tables,
      source: "threadGeometry",
      explain: [
        { title: "60° thread basics", formula: "H = 0.866 P   PD = D − 0.6495 P   minor (int) = D − 1.0825 P   minor (ext) = D − 1.2269 P", plugged: `P = ${fmt(nat.pitch, nat.p)} ${nat.u}, D = ${fmt(nat.major, nat.p)} ${nat.u}` },
      ],
      notes: [
        ...(t.suppliedSeries === "UNJ" ? ["UNJ (ASME B1.15): same basic diameters as UN, but the external root must have a 0.15011P–0.18042P radius and the internal minor is held larger to clear it. Use UNJ-specific taps and gauges."] : []),
        "Class limits are calculated from ASME B1.1 formulas at 9P engagement. For acceptance work use the published tables.",
      ],
      historyLabel: series || t.label,
    };
  },
});
