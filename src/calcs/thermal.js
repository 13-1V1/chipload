// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Thermal expansion. Pro. How much a part grows between the shop and the inspection room.

import { register } from "../app/registry.js";
import { thermalExpansion, THERMAL_ALPHA_F } from "../core/inspect.js";
import { fmt } from "../core/format.js";
import { lenPlaces } from "./_util.js";

export default register({
  id: "thermal",
  title: "Thermal expansion",
  short: "Size change with temperature, by material",
  help: "How much a part grows or shrinks with temperature, so a hot part doesn't measure wrong.",
  category: "inspect",
  keywords: ["thermal", "expansion", "temperature", "68", "20c", "grow", "shrink", "shrink fit", "heat", "coefficient"],
  pro: true,
  inputs: [
    { id: "material", label: "Material", kind: "select", default: "steel", options: Object.entries(THERMAL_ALPHA_F).map(([value, m]) => ({ value, label: m.label })) },
    { id: "length", label: "Length or diameter", kind: "length", default: "10", defaultMm: "250", min: 0 },
    { id: "from", label: "From temperature", kind: "temp", default: "68", min: -460, max: 5000 },
    { id: "to", label: "To temperature", kind: "temp", default: "100", defaultMm: "40", min: -460, max: 5000 },
  ],
  compute(v, c) {
    const p = c.units === "in" ? 5 : 4;
    const m = THERMAL_ALPHA_F[v.material];
    const fromF = c.units === "in" ? v.from : v.from * 9 / 5 + 32;
    const toF = c.units === "in" ? v.to : v.to * 9 / 5 + 32;
    const r = thermalExpansion({ length: v.length, alphaPerF: m.a, fromF, toF });
    const metric = c.units === "mm";
    const alphaC = m.a * 1.8; // per °C
    return {
      primary: { label: `${m.label} ${r.deltaL >= 0 ? "grows" : "shrinks"}`, value: r.deltaL, unit: c.L.length, places: p },
      stats: [
        { label: "Final size", value: r.final, unit: c.L.length, places: p },
        { label: "Temperature change", value: c.units === "in" ? r.deltaT : r.deltaT * 5 / 9, unit: c.L.temp, places: 1 },
        metric ? { label: "Coefficient", value: alphaC * 1e6, unit: "µm/m/°C", places: 1 } : { label: "Coefficient", value: m.a * 1e6, unit: "µin/in/°F", places: 1 },
        metric ? { label: "Per 10 °C on this size", value: alphaC * v.length * 10, unit: "mm", places: p } : { label: "Per 10 °F on this size", value: m.a * v.length * 10, unit: "in", places: p },
        metric ? { label: "Per 100 mm per 10 °C", value: alphaC * 100 * 10 * 1000, unit: "µm", places: 1 } : { label: "Per inch per 10 °F", value: m.a * 10 * 1e6, unit: "µin", places: 0 },
      ],
      source: "geometry",
      explain: [{ title: "Linear expansion", formula: "ΔL = α × L × ΔT", plugged: metric
        ? `= ${alphaC.toExponential(2)} /°C × ${fmt(v.length, p)} × ${fmt(r.deltaT * 5 / 9, 1)} °C = ${fmt(r.deltaL, p)}`
        : `= ${m.a.toExponential(1)} /°F × ${fmt(v.length, p)} × ${fmt(r.deltaT, 1)} °F = ${fmt(r.deltaL, p)}` }],
      notes: [metric
        ? "Standard reference temperature is 20 °C (68 °F). A 250 mm steel part measured at 30 °C reads 0.029 mm long."
        : "Standard reference temperature is 68 °F (20 °C). A 10 in steel part measured at 90 °F reads 0.0014 in long."],
      historyLabel: `${m.label} ${fmt(v.length, 3)} · ${fmt(v.from, 0)}→${fmt(v.to, 0)}°`,
    };
  },
});
