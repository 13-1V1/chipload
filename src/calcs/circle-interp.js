// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Circular interpolation feed comp (ID / OD). Pro.

import { register } from "../app/registry.js";
import { circleInterpolationFeed } from "../core/milling.js";
import { fmt } from "../core/format.js";
import { lenPlaces, fromIn } from "./_util.js";
import { machineFor, maxFeedIpmOf } from "./_machine.js";

export default register({
  id: "circle-interp",
  title: "Circle interpolation feed",
  short: "Adjust feed for helical bores and OD circles",
  help: "Feed to program when the tool travels in a circle (helical bore, round boss) so the cutting edge keeps the right speed.",
  category: "mill",
  keywords: ["circular", "interpolation", "helical", "bore", "feed comp", "id", "od", "g02", "g03", "arc feed"],
  pro: true,
  inputs: [
    { id: "feed", label: "Linear feed (from speeds & feeds)", kind: "feed", default: "40", defaultMm: "1000", min: 0.0001 },
    { id: "tool", label: "Tool diameter", kind: "length", default: "0.5", defaultMm: "12", min: 0.0001 },
    { id: "feature", label: "Feature diameter", kind: "length", default: "1", defaultMm: "25", min: 0.0001 },
    { id: "side", label: "Cutting", kind: "segment", default: "internal", options: [{ value: "internal", label: "Inside (bore)" }, { value: "external", label: "Outside (boss)" }] },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const internal = v.side === "internal";
    const f = circleInterpolationFeed({ feed: v.feed, toolDia: v.tool, featureDia: v.feature, internal });
    const pathDia = internal ? v.feature - v.tool : v.feature + v.tool;
    const len = (x) => `${fmt(x, p)} ${c.L.length}`;
    const feedText = (x) => `${fmt(x, 1)} ${c.L.feed}`;
    // An outside circle can ask for more than the machine moves. There's no spindle speed here to slow,
    // so say how much to slow it: same fraction as the feed, and the chip load holds.
    const m = machineFor(c, "mill");
    const maxFeed = fromIn(maxFeedIpmOf(m), c.units);
    const capped = f > maxFeed * (1 + 1e-9);
    const program = capped ? maxFeed : f;
    const edge = v.feed * (program / f);
    const warnings = internal && v.tool > v.feature * 0.8 ? ["Tool is over 80% of the bore. Feed drops a lot and chip evacuation gets ugly — consider a smaller tool."] : [];
    if (capped) warnings.unshift(`${m.name} max feed is ${feedText(maxFeed)}; this circle needs ${feedText(f)} at the tool center. Program ${feedText(maxFeed)} and run the spindle at ${fmt(100 * program / f, 0)}% of your speeds & feeds RPM so the chip load holds (the edge then moves ${feedText(edge)}).`);
    return {
      primary: { label: capped ? "Program this feed (machine max)" : "Program this feed (tool center)", value: program, unit: c.L.feed, places: 1, clamped: capped },
      stats: [
        { label: capped ? "Edge feed at the machine max" : "Edge feed stays at", value: edge, unit: c.L.feed, places: 1 },
        { label: "Tool center path diameter", value: pathDia, unit: c.L.length, places: p },
        { label: "Ratio", value: f / v.feed, unit: "×", places: 3 },
        ...(capped ? [{ label: "Wanted feed", value: f, unit: c.L.feed, places: 1 }] : []),
      ],
      warnings,
      source: "advanced",
      explain: [{ title: internal ? "Inside circle" : "Outside circle", formula: internal ? "Fc = F × (Df − Dt) ÷ Df" : "Fc = F × (Df + Dt) ÷ Df", plugged: `= ${feedText(v.feed)} × (${len(v.feature)} ${internal ? "−" : "+"} ${len(v.tool)}) ÷ ${len(v.feature)} = ${feedText(f)}${capped ? ` → ${feedText(program)} on ${m.name}` : ""}` }],
      notes: ["Controls with G41/G42 feed the tool center on the compensated path — this is the same correction, done by hand."],
      historyLabel: `${internal ? "ID" : "OD"} Ø${fmt(v.feature, p)} ${c.L.length} · Ø${fmt(v.tool, p)} ${c.L.length}`,
    };
  },
});
