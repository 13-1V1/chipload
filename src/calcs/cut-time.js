// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Metal removal rate & cut time. Pro. Multiple passes over a stock amount, with rapid overhead.

import { register } from "../app/registry.js";
import { cutTime, metalRemovalRate } from "../core/milling.js";
import { fmt } from "../core/format.js";
import { lenPlaces } from "./_util.js";

export default register({
  id: "cut-time",
  title: "Removal rate & cut time",
  short: "MRR, passes, and minutes for a milling cut",
  category: "mill",
  keywords: ["mrr", "removal rate", "cut time", "cycle time", "passes", "estimate", "quote", "minutes"],
  pro: true,
  inputs: [
    { id: "length", label: "Cut length per pass", kind: "length", default: "12", min: 0 },
    { id: "feed", label: "Feed rate", kind: "feed", default: "40", min: 0.0001 },
    { id: "woc", label: "Width of cut", kind: "length", default: "0.25", min: 0 },
    { id: "doc", label: "Depth of cut per pass", kind: "length", default: "0.1", min: 0.0001 },
    { id: "stock", label: "Total stock to remove (depth)", kind: "length", default: "", optional: true, placeholder: "optional — figures the number of passes" },
    { id: "rapid", label: "Rapid / repositioning per pass", kind: "number", default: "3", unit: "sec", min: 0 },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const perPass = cutTime({ length: v.length, feed: v.feed });
    const passes = Number.isFinite(v.stock) && v.stock > 0 ? Math.ceil(v.stock / v.doc - 1e-9) : 1;
    const total = passes * perPass + passes * v.rapid / 60;
    const mrr = metalRemovalRate({ widthOfCut: v.woc, depthOfCut: v.doc, feed: v.feed });
    const mrrOut = c.units === "in" ? mrr : mrr / 1000; // mm³/min → cm³/min
    const volume = v.length * v.woc * (Number.isFinite(v.stock) && v.stock > 0 ? v.stock : v.doc);
    return {
      primary: { label: passes > 1 ? `Total time · ${passes} passes` : "Cut time", value: total, unit: "min", places: 2 },
      stats: [
        { label: "Per pass", value: perPass * 60, unit: "sec", places: 1 },
        { label: "Passes", value: passes, unit: "", places: 0 },
        { label: "Metal removal rate", value: mrrOut, unit: c.L.volume, places: 2 },
        { label: "Volume removed", value: c.units === "in" ? volume : volume / 1000, unit: c.units === "in" ? "in³" : "cm³", places: 2 },
        { label: "Time as h:mm:ss", text: hms(total) },
      ],
      source: "advanced",
      explain: [
        { title: "Cut time", formula: "t = length ÷ feed", plugged: `= ${fmt(v.length, p)} ÷ ${fmt(v.feed, 1)} = ${fmt(perPass, 3)} min per pass` },
        { title: "Removal rate", formula: "MRR = ae × ap × feed", plugged: `= ${fmt(v.woc, p)} × ${fmt(v.doc, p)} × ${fmt(v.feed, 1)} = ${fmt(mrr, 3)}` },
        ...(passes > 1 ? [{ title: "Passes", formula: "n = ceil(stock ÷ ap)", plugged: `= ceil(${fmt(v.stock, p)} ÷ ${fmt(v.doc, p)}) = ${passes}` }] : []),
      ],
      historyLabel: `${fmt(v.length, p)} @ ${fmt(v.feed, 0)} · ${passes} pass${passes > 1 ? "es" : ""}`,
    };
  },
});

function hms(minutes) {
  const s = Math.round(minutes * 60);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
