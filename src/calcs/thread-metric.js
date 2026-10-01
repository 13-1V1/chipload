// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// ISO metric thread class limits (6g / 6H and friends). Pro.

import { register } from "../app/registry.js";
import { metricToleranceEnvelope, basicThreadGeometry } from "../core/thread.js";
import { lookupTapDrillMetric } from "../core/tapdrill.js";
import { fmt } from "../core/format.js";
import { threadFromSpec } from "./_util.js";
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
    { id: "thread", label: "Thread", kind: "text", default: "M10", placeholder: "M10, M8x1.25, M12x1" },
    { id: "extPos", label: "External position", kind: "segment", default: "g", options: ["e", "f", "g", "h"].map((v) => ({ value: v, label: v })) },
    { id: "extGrade", label: "External grade", kind: "segment", default: "6", options: ["4", "6", "8"].map((v) => ({ value: v, label: v })) },
    { id: "intPos", label: "Internal position", kind: "segment", default: "H", options: ["G", "H"].map((v) => ({ value: v, label: v })) },
    { id: "intGrade", label: "Internal grade", kind: "segment", default: "6", options: ["5", "6", "7"].map((v) => ({ value: v, label: v })) },
  ],
  compute(v) {
    const t = threadFromSpec(v.thread);
    if (t.isUn) throw new Error("Use a metric spec like M10 or M8x1.25 (UN classes live in Thread data)");
    const env = metricToleranceEnvelope({ major: t.major, pitch: t.pitch, extPos: v.extPos, extGrade: Number(v.extGrade), intPos: v.intPos, intGrade: Number(v.intGrade) });
    const g = basicThreadGeometry(t.major, t.pitch);
    const tap = lookupTapDrillMetric(t.major, t.pitch);
    return {
      primary: { label: `${t.label}-${env.external.label} pitch diameter`, text: `${fmt(env.external.pdMin, 3)} – ${fmt(env.external.pdMax, 3)}`, unit: "mm" },
      stats: [
        { label: `${env.external.label} major`, text: `${fmt(env.external.majorMin, 3)} – ${fmt(env.external.majorMax, 3)}` },
        { label: `${env.external.label} allowance (es)`, value: env.external.allowance, unit: "mm", places: 3 },
        { label: `${env.internal.label} pitch dia`, text: `${fmt(env.internal.pdMin, 3)} – ${fmt(env.internal.pdMax, 3)}` },
        { label: `${env.internal.label} minor`, text: `${fmt(env.internal.minorMin, 3)} – ${fmt(env.internal.minorMax, 3)}` },
        { label: "Basic pitch dia", value: g.pitchDiameter, unit: "mm", places: 3 },
        { label: "Tap drill", text: tap ? `${tap.label} · ${tap.percent}%` : "—" },
      ],
      tables: [{
        title: "Limits (mm)",
        columns: [{ key: "what", label: "" }, { key: "min", label: "Min", align: "right", places: 3 }, { key: "max", label: "Max", align: "right", places: 3 }],
        rows: [
          { what: `${env.external.label} major`, min: env.external.majorMin, max: env.external.majorMax },
          { what: `${env.external.label} pitch dia`, min: env.external.pdMin, max: env.external.pdMax },
          { what: `${env.internal.label} pitch dia`, min: env.internal.pdMin, max: env.internal.pdMax },
          { what: `${env.internal.label} minor`, min: env.internal.minorMin, max: env.internal.minorMax },
        ],
      }],
      source: "threadGeometry",
      explain: [
        { title: "ISO 965-1 tolerances (µm)", formula: "Td2(6) = 90 P^0.4 D^0.1   TD2(6) ≈ 1.32 Td2(6)   Td(6) = 180 ∛P² − 3.15/√P   TD1(6) = 230 P^0.7", plugged: `es(${v.extPos}) = ${fmt(env.external.allowance * 1000, 0)} µm, Td2 = ${fmt(env.external.tolPd * 1000, 0)} µm, TD2 = ${fmt(env.internal.tolPd * 1000, 0)} µm` },
      ],
      notes: ["Calculated from the ISO 965 formulas; the published tables round differently by a few µm. For acceptance work use the tables or thread gauges."],
      historyLabel: `${t.label} ${env.external.label}/${env.internal.label}`,
    };
  },
});
