// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Circular interpolation feed comp (ID / OD). Pro.

import { register } from "../app/registry.js";
import { circleInterpolationFeed } from "../core/milling.js";
import { fmt } from "../core/format.js";
import { lenPlaces } from "./_util.js";

export default register({
  id: "circle-interp",
  title: "Circle interpolation feed",
  short: "Adjust feed for helical bores and OD circles",
  help: "Feed to program when the tool travels in a circle (helical bore, round boss) so the cutting edge keeps the right speed.",
  category: "mill",
  keywords: ["circular", "interpolation", "helical", "bore", "feed comp", "id", "od", "g02", "g03", "arc feed"],
  pro: true,
  inputs: [
    { id: "feed", label: "Linear feed (from speeds & feeds)", kind: "feed", default: "40", min: 0.0001 },
    { id: "tool", label: "Tool diameter", kind: "length", default: "0.5", min: 0.0001 },
    { id: "feature", label: "Feature diameter", kind: "length", default: "1", min: 0.0001 },
    { id: "side", label: "Cutting", kind: "segment", default: "internal", options: [{ value: "internal", label: "Inside (bore)" }, { value: "external", label: "Outside (boss)" }] },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const internal = v.side === "internal";
    const f = circleInterpolationFeed({ feed: v.feed, toolDia: v.tool, featureDia: v.feature, internal });
    const pathDia = internal ? v.feature - v.tool : v.feature + v.tool;
    return {
      primary: { label: "Program this feed (tool center)", value: f, unit: c.L.feed, places: 1 },
      stats: [
        { label: "Edge feed stays at", value: v.feed, unit: c.L.feed, places: 1 },
        { label: "Tool center path diameter", value: pathDia, unit: c.L.length, places: p },
        { label: "Ratio", value: f / v.feed, unit: "×", places: 3 },
      ],
      warnings: internal && v.tool > v.feature * 0.8 ? ["Tool is over 80% of the bore. Feed drops a lot and chip evacuation gets ugly — consider a smaller tool."] : [],
      source: "advanced",
      explain: [{ title: internal ? "Inside circle" : "Outside circle", formula: internal ? "Fc = F × (Df − Dt) ÷ Df" : "Fc = F × (Df + Dt) ÷ Df", plugged: `= ${fmt(v.feed, 1)} × (${fmt(v.feature, p)} ${internal ? "−" : "+"} ${fmt(v.tool, p)}) ÷ ${fmt(v.feature, p)} = ${fmt(f, 1)}` }],
      notes: ["Controls with G41/G42 feed the tool center on the compensated path — this is the same correction, done by hand."],
      historyLabel: `${internal ? "ID" : "OD"} Ø${fmt(v.feature, p)} · Ø${fmt(v.tool, p)}`,
    };
  },
});
