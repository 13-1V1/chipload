// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// ISO metric thread class limits (6g / 6H and friends). Pro.

import { register } from "../app/registry.js";
import { metricToleranceEnvelope, basicThreadGeometry, ISO965_RECOMMENDED } from "../core/thread.js";
import { lookupTapDrillMetric } from "../core/tapdrill.js";
import { fmt } from "../core/format.js";
import { threadFromSpec, COMMON_METRIC_THREADS } from "./_util.js";
import { parseThreadSpec } from "../core/thread.js";

export default register({
  id: "thread-metric",
  title: "Metric thread limits",
  short: "6g / 6H limits from ISO 965",
  help: "Max and min sizes for metric threads by tolerance class (6g for the screw, 6H for the hole).",
  category: "thread",
  keywords: ["metric", "iso", "6g", "6h", "4h", "8g", "tolerance class", "limits", "pitch diameter", "m10", "m8"],
  pro: true,
  units: false,
  prefillRank: 10,
  prefill: (q) => { const t = parseThreadSpec(q); return t?.system === "metric" ? { params: { thread: q.trim() }, label: t.label } : null; },
  inputs: [
    { id: "thread", suggest: COMMON_METRIC_THREADS, label: "Thread", kind: "text", default: "M10", placeholder: "M10, M8x1.25, M12x1" },
    { id: "extPos", label: "External position", kind: "segment", default: "g", options: ["e", "f", "g", "h"].map((v) => ({ value: v, label: v })) },
    { id: "extGrade", label: "External grade", kind: "segment", default: "6", options: ["4", "6", "8"].map((v) => ({ value: v, label: v })) },
    { id: "intPos", label: "Internal position", kind: "segment", default: "H", options: ["G", "H"].map((v) => ({ value: v, label: v })) },
    { id: "intGrade", label: "Internal grade", kind: "segment", default: "6", options: ["4", "5", "6", "7", "8"].map((v) => ({ value: v, label: v })) },
  ],
  compute(v) {
    const t = threadFromSpec(v.thread);
    if (t.isUn) throw new Error("Use a metric spec like M10 or M8x1.25 (UN classes live in Thread data)");
    const env = metricToleranceEnvelope({ major: t.major, pitch: t.pitch, extPos: v.extPos, extGrade: Number(v.extGrade), intPos: v.intPos, intGrade: Number(v.intGrade) });
    const ext = env.external, int = env.internal, tol = env.tolerances;
    if (!ext && !int) throw new Error(env.undefinedReasons.join(" "));
    const extLabel = `${v.extGrade}${v.extPos}`, intLabel = `${v.intGrade}${v.intPos}`;
    const g = basicThreadGeometry(t.major, t.pitch);
    const tap = lookupTapDrillMetric(t.major, t.pitch);
    const range = (lo, hi) => `${fmt(lo, 3)} – ${fmt(hi, 3)} mm`;
    const warnings = [...(t.caution ? [t.caution] : []), ...env.undefinedReasons];
    if (ext && !ISO965_RECOMMENDED.external.includes(extLabel)) warnings.push(`${extLabel} is not one of the ISO 965-1 recommended classes: gauges and dies for it are rarely stocked. Use 6g unless the print calls for it.`);
    if (int && !ISO965_RECOMMENDED.internal.includes(intLabel)) warnings.push(`${intLabel} is not one of the ISO 965-1 recommended classes: taps and gauges for it are rarely stocked. Use 6H unless the print calls for it.`);
    const um = (x) => `${fmt(x, 0)} µm`;
    return {
      primary: ext
        ? { label: `${t.label}-${ext.label} pitch diameter`, text: `${fmt(ext.pdMin, 3)} – ${fmt(ext.pdMax, 3)}`, unit: "mm" }
        : { label: `${t.label}-${int.label} pitch diameter`, text: `${fmt(int.pdMin, 3)} – ${fmt(int.pdMax, 3)}`, unit: "mm" },
      stats: [
        ...(ext ? [
          { label: `${ext.label} major`, text: range(ext.majorMin, ext.majorMax) },
          { label: `${ext.label} allowance (es)`, value: ext.allowance, unit: "mm", places: 3 },
        ] : []),
        ...(ext && int ? [{ label: `${int.label} pitch dia`, text: range(int.pdMin, int.pdMax) }] : []),
        ...(int ? [{ label: `${int.label} minor`, text: range(int.minorMin, int.minorMax) }] : []),
        { label: "Basic pitch dia", value: g.pitchDiameter, unit: "mm", places: 3 },
        { label: "Tap drill", text: tap ? `${tap.label} · ${tap.percent}%` : "—" },
      ],
      warnings,
      tables: [{
        title: "Limits (mm)",
        columns: [{ key: "what", label: "" }, { key: "min", label: "Min", align: "right", places: 3 }, { key: "max", label: "Max", align: "right", places: 3 }],
        rows: [
          ...(ext ? [{ what: `${ext.label} major`, min: ext.majorMin, max: ext.majorMax }, { what: `${ext.label} pitch dia`, min: ext.pdMin, max: ext.pdMax }] : []),
          ...(int ? [{ what: `${int.label} pitch dia`, min: int.pdMin, max: int.pdMax }, { what: `${int.label} minor`, min: int.minorMin, max: int.minorMax }] : []),
        ],
      }],
      source: "threadGeometry",
      explain: [
        { title: `ISO 965-1 ${env.fromFormula ? "formulas (no table row for this pitch and size)" : "Tables 1, 3, 4, 5 and 6"}`,
          formula: "external: max = basic − es, min = max − Td (major) or Td2 (pitch dia)   internal: min = basic + EI, max = min + TD1 (minor) or TD2 (pitch dia)",
          plugged: [ext && `es(${v.extPos}) = ${um(tol.es)}, Td(${v.extGrade}) = ${um(tol.Td)}, Td2(${v.extGrade}) = ${um(tol.Td2)}`, int && `EI(${v.intPos}) = ${um(tol.EI)}, TD1(${v.intGrade}) = ${um(tol.TD1)}, TD2(${v.intGrade}) = ${um(tol.TD2)}`].filter(Boolean).join("; ") },
      ],
      notes: [env.fromFormula
        ? "ISO 965-1 has no table row for this size and pitch, so the tolerances come from its formulas, rounded the way the tables are. Check the standard before you accept parts on it."
        : "Tolerances are the ISO 965-1 table values, the same ones ISO 965-2 builds its 6g / 6H limits from. For acceptance work, thread gauges have the final say."],
      historyLabel: `${t.label} ${extLabel}/${intLabel}`,
    };
  },
});
