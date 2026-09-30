// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Surface finish from feed and nose radius, or the max feed for a target Ra. Pro.

import { register } from "../app/registry.js";
import { surfaceFinish, feedForRa } from "../core/lathe.js";
import { fmt } from "../core/format.js";
import { toIn, fromIn } from "./_util.js";

const NOSE = [["0.0156", '1/64"'], ["0.0312", '1/32"'], ["0.0469", '3/64"'], ["0.0625", '1/16"'], ["custom", "Other"]];

export default register({
  id: "surface-finish",
  title: "Surface finish (Ra)",
  short: "Finish from feed and nose radius, or feed for a target Ra",
  category: "lathe",
  keywords: ["surface finish", "ra", "rms", "roughness", "nose radius", "microinch", "feed", "finish pass"],
  pro: true,
  inputs: [
    { id: "mode", label: "Find", kind: "segment", default: "finish", options: [{ value: "finish", label: "Finish" }, { value: "feed", label: "Feed for Ra" }] },
    { id: "nose", label: "Nose radius", kind: "segment", default: "0.0312", options: NOSE.map(([value, label]) => ({ value, label })) },
    { id: "noseCustom", label: "Nose radius", kind: "length", default: "0.5", min: 0.0001, showIf: (r) => r.nose === "custom" },
    { id: "ipr", label: "Feed per revolution", kind: "feedRev", default: "0.005", min: 0, showIf: (r) => r.mode === "finish" },
    { id: "ra", label: "Target Ra", kind: "number", default: "32", unit: "µin", min: 0.1, showIf: (r) => r.mode === "feed" },
  ],
  compute(v, c) {
    const rIn = v.nose === "custom" ? toIn(v.noseCustom, c.units) : Number(v.nose);
    if (v.mode === "finish") {
      const fIn = toIn(v.ipr, c.units);
      const f = surfaceFinish({ feedPerRev: fIn, noseRadius: rIn });
      const raU = f.ra * 1e6;
      return {
        primary: { label: "Theoretical Ra", value: raU, unit: "µin", places: 0 },
        stats: [
          { label: "Ra (metric)", value: raU * 0.0254, unit: "µm", places: 2 },
          { label: "RMS", value: f.rms * 1e6, unit: "µin", places: 0 },
          { label: "Peak to valley (Rt)", value: f.rt * 1e6, unit: "µin", places: 0 },
          { label: "Nose radius", value: fromIn(rIn, c.units), unit: c.L.length, places: 4 },
          { label: "Nearest standard callout", text: nearestCallout(raU) },
        ],
        source: "advanced",
        explain: [{ title: "Theoretical finish", formula: "Rt = f² ÷ (8 r)     Ra ≈ f² ÷ (31.2 r)", plugged: `f = ${fmt(fIn, 4)} in, r = ${fmt(rIn, 4)} in → Ra = ${fmt(raU, 1)} µin` }],
        notes: ["Real parts run 1.5–3× rougher than theory from vibration, built-up edge, and wear. Use this to pick a feed, not to certify a part."],
        historyLabel: `${fmt(v.ipr, 4)} ipr · r ${fmt(rIn, 4)} → ${fmt(raU, 0)} µin`,
      };
    }
    const fIn = feedForRa({ ra: v.ra / 1e6, noseRadius: rIn });
    return {
      primary: { label: `Max feed for ${fmt(v.ra, 0)} µin Ra`, value: fromIn(fIn, c.units), unit: c.L.feedRev, places: 4 },
      stats: [
        { label: "Suggested (÷1.5 for real life)", value: fromIn(fIn / 1.5, c.units), unit: c.L.feedRev, places: 4 },
        { label: "Nose radius", value: fromIn(rIn, c.units), unit: c.L.length, places: 4 },
        { label: "Target Ra", value: v.ra * 0.0254, unit: "µm", places: 2 },
      ],
      source: "advanced",
      explain: [{ title: "Feed for a finish", formula: "f = √(31.2 × r × Ra)", plugged: `= √(31.2 × ${fmt(rIn, 4)} × ${fmt(v.ra / 1e6, 7)}) = ${fmt(fIn, 4)} in/rev` }],
      historyLabel: `Ra ${fmt(v.ra, 0)} · r ${fmt(rIn, 4)}`,
    };
  },
});

function nearestCallout(ra) {
  const std = [4, 8, 16, 32, 63, 125, 250, 500];
  const c = std.reduce((a, b) => (Math.abs(b - ra) < Math.abs(a - ra) ? b : a));
  return `${c} µin`;
}
