// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Quote helper. Pro. Cycle time × shop rate + material + tooling + markup → price per part.

import { register } from "../app/registry.js";
import { fmt } from "../core/format.js";

export default register({
  id: "quote",
  title: "Quote helper",
  short: "Price per part from cycle time and shop rate",
  category: "shop",
  keywords: ["quote", "price", "estimate", "shop rate", "cycle time", "setup", "markup", "cost per part", "job"],
  pro: true,
  units: false,
  inputs: [
    { id: "cycle", label: "Cycle time per part", kind: "number", default: "12", unit: "min", min: 0 },
    { id: "load", label: "Load / unload per part", kind: "number", default: "1", unit: "min", min: 0 },
    { id: "setup", label: "Setup time (whole job)", kind: "number", default: "60", unit: "min", min: 0 },
    { id: "qty", label: "Quantity", kind: "int", default: "25", min: 1 },
    { id: "rate", label: "Shop rate", kind: "number", default: "95", unit: "$/hr", min: 0 },
    { id: "material", label: "Material per part", kind: "number", default: "8.50", unit: "$", min: 0 },
    { id: "tooling", label: "Tooling / consumables per part", kind: "number", default: "1.25", unit: "$", min: 0 },
    { id: "outside", label: "Outside services per part (plating, heat treat)", kind: "number", default: "0", unit: "$", min: 0 },
    { id: "markup", label: "Markup on cost", kind: "percent", default: "20", min: 0 },
  ],
  compute(v) {
    const runMin = (v.cycle + v.load) * v.qty;
    const machineHrs = (runMin + v.setup) / 60;
    const labor = machineHrs * v.rate;
    const direct = (v.material + v.tooling + v.outside) * v.qty;
    const cost = labor + direct;
    const price = cost * (1 + v.markup / 100);
    const each = price / v.qty;
    const setupEach = (v.setup / 60 * v.rate) / v.qty;
    return {
      primary: { label: `Price per part · ${v.qty} pcs`, text: `$${fmt(each, 2)}`, unit: "" },
      stats: [
        { label: "Job total", text: `$${fmt(price, 2)}` },
        { label: "Total cost (before markup)", text: `$${fmt(cost, 2)}` },
        { label: "Profit", text: `$${fmt(price - cost, 2)}` },
        { label: "Machine time", value: machineHrs, unit: "hr", places: 2 },
        { label: "Labor / machine", text: `$${fmt(labor, 2)}` },
        { label: "Materials & tooling", text: `$${fmt(direct, 2)}` },
        { label: "Setup share per part", text: `$${fmt(setupEach, 2)}` },
        { label: "Break-even at qty 1", text: `$${fmt(((v.cycle + v.load + v.setup) / 60 * v.rate + v.material + v.tooling + v.outside) * (1 + v.markup / 100), 2)}` },
      ],
      source: "advanced",
      explain: [
        { title: "Price", formula: "cost = (run + setup) ÷ 60 × rate + (material + tooling + outside) × qty;  price = cost × (1 + markup)", plugged: `run ${fmt(runMin, 0)} min + setup ${fmt(v.setup, 0)} min at $${fmt(v.rate, 0)}/hr = $${fmt(labor, 2)}; direct $${fmt(direct, 2)}; × ${fmt(1 + v.markup / 100, 2)} = $${fmt(price, 2)}` },
      ],
      notes: ["Setup gets spread across the quantity — that's why 1 piece costs so much more than 25. Get the cycle time from the cut-time or lathe cycle tools."],
      historyLabel: `${v.qty} pcs @ $${fmt(each, 2)}`,
    };
  },
});
