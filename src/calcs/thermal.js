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
    // min/max are °F like every default (absolute zero, and far past where a straight-line α means anything);
    // values.js converts them for °C. compute() checks again in the active unit as a backstop.
    { id: "from", label: "From temperature", kind: "temp", default: "68", min: -459.67, max: 5000 },
    { id: "to", label: "To temperature", kind: "temp", default: "100", defaultMm: "40", min: -459.67, max: 5000 },
  ],
  compute(v, c) {
    const p = c.units === "in" ? 5 : 4;
    const m = THERMAL_ALPHA_F[v.material];
    const fromF = c.units === "in" ? v.from : v.from * 9 / 5 + 32;
    const toF = c.units === "in" ? v.to : v.to * 9 / 5 + 32;
    const metric = c.units === "mm";
    for (const [name, f] of [["From temperature", fromF], ["To temperature", toF]]) {
      if (f < -459.67 - 1e-9) throw new Error(`${name} is below absolute zero (${metric ? "−273.15 °C" : "−459.67 °F"}). Check the sign and the unit.`);
      if (f > 5000 + 1e-9) throw new Error(`${name} is over ${metric ? "2760 °C" : "5000 °F"} — past where a straight-line expansion figure means anything.`);
    }
    const r = thermalExpansion({ length: v.length, alphaPerF: m.a, fromF, toF });
    const alphaC = m.a * 1.8; // per °C
    const dT = metric ? r.deltaT * 5 / 9 : r.deltaT;
    return {
      primary: { label: `${m.label} ${r.deltaL >= 0 ? "grows" : "shrinks"}`, value: r.deltaL, unit: c.L.length, places: p },
      stats: [
        { label: "Final size", value: r.final, unit: c.L.length, places: p },
        // Three places (fmt drops trailing zeros) carry a typed 37.75 whole, so this matches the explain line's ΔT.
        { label: "Temperature change", value: dT, unit: c.L.temp, places: 3 },
        // The table is per °F to one decimal; × 1.8 for °C needs two (brass 11.4 → 20.52) to stay the same number.
        metric ? { label: "Coefficient", value: alphaC * 1e6, unit: "µm/m/°C", places: 2 } : { label: "Coefficient", value: m.a * 1e6, unit: "µin/in/°F", places: 1 },
        metric ? { label: "Per 10 °C on this size", value: alphaC * v.length * 10, unit: "mm", places: p } : { label: "Per 10 °F on this size", value: m.a * v.length * 10, unit: "in", places: p },
        metric ? { label: "Per 100 mm per 10 °C", value: alphaC * 100 * 10 * 1000, unit: "µm", places: 1 } : { label: "Per inch per 10 °F", value: m.a * 10 * 1e6, unit: "µin", places: 0 },
      ],
      source: "thermal",
      // α is written the way the Coefficient stat shows it, every figure kept, and ΔT to 3 places (a typed 37.75 °C
      // stays 37.75), so the line multiplies out to the answer.
      explain: [{ title: "Linear expansion", formula: "ΔL = α × L × ΔT", plugged: metric
        ? `= ${fmt(alphaC * 1e6, 2)} × 10⁻⁶ /°C × ${fmt(v.length, p)} mm × ${fmt(dT, 3)} °C = ${fmt(r.deltaL, p)} mm`
        : `= ${fmt(m.a * 1e6, 1)} × 10⁻⁶ /°F × ${fmt(v.length, p)} in × ${fmt(dT, 3)} °F = ${fmt(r.deltaL, p)} in` }],
      notes: [metric
        ? "Standard reference temperature is 20 °C (68 °F). A 250 mm steel part measured at 30 °C reads 0.029 mm long."
        : "Standard reference temperature is 68 °F (20 °C). A 10 in steel part measured at 90 °F reads 0.0014 in long."],
      // Temperatures to 3 places like the ΔT stat, so a typed 37.75 reads 37.75 (fmt drops zeros: 68 stays 68)
      historyLabel: `${m.label} ${fmt(v.length, lenPlaces(c.units))} ${c.L.length} · ${fmt(v.from, 3)}→${fmt(v.to, 3)} ${c.L.temp}`,
    };
  },
});
