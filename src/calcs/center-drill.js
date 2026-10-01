// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Center drill dimensions and depth to a countersink diameter. Pro.

import { register } from "../app/registry.js";
import { CENTER_DRILLS } from "../data/centerdrills.js";
import { fmt } from "../core/format.js";
import { toIn, fromIn, lenPlaces } from "./_util.js";

export default register({
  id: "center-drill",
  title: "Center drill",
  short: "Sizes and depth for a countersink diameter",
  help: "Center drill sizes and how deep to go for a given countersink diameter.",
  category: "drill",
  keywords: ["center drill", "centre drill", "combined drill", "countersink", "60", "lathe center", "spot"],
  pro: true,
  inputs: [
    { id: "size", label: "Center drill", kind: "select", default: "#3", options: CENTER_DRILLS.map((d) => ({ value: d.size, label: `${d.size} · body ${fmt(d.body, 4)} · pilot ${fmt(d.pilot, 4)}` })) },
    { id: "csk", positive: true, label: "Countersink diameter wanted", kind: "length", default: "", auto: (raw, c) => { const d = CENTER_DRILLS.find((x) => x.size === raw.size); return d ? fromIn(d.body * 0.75, c.units) : NaN; }, hint: "Blank = 75% of the body (a good lathe center)." },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const d = CENTER_DRILLS.find((x) => x.size === v.size);
    const cskIn = toIn(v.csk, c.units);
    if (cskIn <= d.pilot) throw new Error("Countersink must be bigger than the pilot");
    if (cskIn > d.body) throw new Error(`Countersink can't exceed the body (${fmt(fromIn(d.body, c.units), p)} ${c.L.length})`);
    const cone = (cskIn - d.pilot) / (2 * Math.tan(30 * Math.PI / 180));
    const total = d.pilotLen + cone;
    return {
      primary: { label: `Depth from the surface (${d.size})`, value: fromIn(total, c.units), unit: c.L.length, places: p },
      stats: [
        { label: "Pilot diameter", value: fromIn(d.pilot, c.units), unit: c.L.length, places: p },
        { label: "Pilot length", value: fromIn(d.pilotLen, c.units), unit: c.L.length, places: p },
        { label: "Body diameter", value: fromIn(d.body, c.units), unit: c.L.length, places: p },
        { label: "Cone depth (60°)", value: fromIn(cone, c.units), unit: c.L.length, places: p },
        { label: "Max countersink (body)", value: fromIn(d.body, c.units), unit: c.L.length, places: p },
      ],
      source: "geometry",
      explain: [{ title: "60° countersink depth", formula: "cone = (Dcsk − Dpilot) ÷ (2 tan 30°);  Z = pilot length + cone", plugged: `= (${fmt(cskIn, 4)} − ${fmt(d.pilot, 4)}) ÷ 1.1547 = ${fmt(cone, 4)}; Z = ${fmt(total, 4)} in` }],
      notes: ["Pilot length varies by maker — the depth here assumes the drill is ground to the listed pilot length. Watch the countersink diameter, not the Z number, on the first part."],
      historyLabel: `${d.size} → Ø${fmt(v.csk, p)} csk`,
    };
  },
});
