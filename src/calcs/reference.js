// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Reference screens and calculators: GD&T guide, SHCS counterbores, material library, hardness, material weight.

import { register } from "../app/registry.js";
import { GDT_SYMBOLS } from "../data/gdt.js";
import { SHCS_INCH, SHCS_METRIC } from "../data/shcs.js";
import { MATERIALS, materialOptions, materialById } from "../data/materials-library.js";
import { convertHardness } from "../data/hardness.js";
import { GLOSSARY } from "../data/glossary.js";
import { fmt, parseFraction } from "../core/format.js";
import { lenPlaces } from "./_util.js";

register({
  id: "gdt",
  title: "GD&T symbols",
  short: "Every Y14.5 symbol in plain English",
  help: "Every GD&T symbol with what it means in plain words.",
  category: "reference",
  keywords: ["gd&t", "gdt", "symbol", "flatness", "position", "runout", "profile", "perpendicularity", "mmc", "datum", "y14.5", "feature control frame"],
  view: "chart",
  pro: true,
  placeholder: "Filter: runout, MMC, datum",
  columns: [{ key: "sym", label: "Sym" }, { key: "name", label: "Name", long: true }, { key: "type", label: "Type" }, { key: "meaning", label: "Means", long: true }],
  rows: () => GDT_SYMBOLS.map((s) => ({ ...s, meaning: s.datum ? `${s.meaning} Datum: ${s.datum}.` : s.meaning })),
  note: "ASME Y14.5-2018, paraphrased. Form controls need no datum; orientation, location, and runout do.",
});

register({
  id: "shcs",
  title: "Clearance & counterbore chart",
  short: "Drill sizes for bolts to pass through, and counterbores",
  help: "Drill sizes so a bolt passes through (clearance), and counterbore sizes so the head sits flush. Inch and metric.",
  category: "reference",
  keywords: ["counterbore", "cbore", "shcs", "socket head", "cap screw", "clearance hole", "b18.3", "iso 4762", "spotface", "clearance hole", "bolt hole", "screw hole", "through hole", "cap screw", "head size"],
  view: "chart",
  pro: false,
  placeholder: "Filter: 1/4, #10, M6",
  columns: [
    { key: "size", label: "Screw" }, { key: "head", label: "Head Ø", align: "right" }, { key: "depth", label: "Cbore depth", align: "right" },
    { key: "cbore", label: "Counterbore" }, { key: "close", label: "Close fit" }, { key: "normal", label: "Normal" }, { key: "loose", label: "Loose" },
  ],
  rows() {
    const inch = SHCS_INCH.map((r) => ({ size: `${r.size} SHCS`, head: fmt(r.head, 3), depth: fmt(r.height, 3), cbore: `${r.cbore[0]} (${fmt(r.cbore[1], 4)})`, close: `${r.close[0]} ${fmt(r.close[1], 3)}`, normal: `${r.normal[0]} ${fmt(r.normal[1], 3)}`, loose: `${r.loose[0]} ${fmt(r.loose[1], 3)}` }));
    const metric = SHCS_METRIC.map((r) => ({ size: `${r.size} SHCS`, head: `${r.head} mm`, depth: `${r.height} mm`, cbore: `${r.cbore} mm`, close: `${r.fine} mm`, normal: `${r.medium} mm`, loose: `${r.coarse} mm` }));
    return [...inch, ...metric];
  },
  note: "Counterbore depth = head height (flush). Add 0.010–0.030 in if the head must sit below the surface. Inch clearances per ASME B18.2.8 (the B18.3 appendix lists a looser single value, e.g. #10 → 0.221); metric per ISO 273.",
});

register({
  id: "materials",
  title: "Material library",
  short: `${MATERIALS.length} materials: machinability, SFM, chip load, density`,
  help: "The machinability library behind the speeds & feeds tools: ratings, speeds, chip loads, density for 196 materials.",
  category: "reference",
  keywords: ["material", "machinability", "library", "sfm", "4140", "6061", "304", "inconel", "titanium", "density", "rating"],
  view: "chart",
  pro: true,
  placeholder: "Filter: 4140, stainless, titanium",
  columns: [
    { key: "name", label: "Material" }, { key: "rating", label: "Rating", align: "right" }, { key: "sfmHss", label: "SFM HSS", align: "right", places: 0 },
    { key: "sfmCarbide", label: "SFM carbide", align: "right", places: 0 }, { key: "chip", label: "Chip 3/8\"", align: "right" }, { key: "density", label: "lb/in³", align: "right", places: 3 },
  ],
  rows: () => MATERIALS.map((m) => ({ name: `${m.name} · ${m.group}`, rating: `${m.rating}%`, sfmHss: m.sfmHss, sfmCarbide: m.sfmCarbide, chip: fmt(m.chipIn, 4), density: m.density })),
  note: "Conservative starting points (low end of handbook ranges). Rating is vs. B1112 = 100%. Every speeds & feeds tool pulls from this list.",
});

register({
  id: "hardness",
  title: "Hardness conversion",
  short: "Rockwell C/B, Brinell, Vickers, tensile",
  help: "Convert between Rockwell, Brinell, and Vickers hardness, with approximate steel tensile strength.",
  category: "reference",
  keywords: ["hardness", "rockwell", "hrc", "hrb", "brinell", "hb", "bhn", "vickers", "hv", "tensile", "e140"],
  pro: true,
  units: false,
  inputs: [
    { id: "scale", label: "Scale", kind: "segment", default: "hrc", options: [{ value: "hrc", label: "HRC" }, { value: "hrb", label: "HRB" }, { value: "hb", label: "Brinell" }, { value: "hv", label: "Vickers" }] },
    { id: "value", label: "Hardness", kind: "number", default: "40", min: 0 },
  ],
  compute(v) {
    const r = convertHardness(v.scale, v.value);
    if (!r) throw new Error("Outside the E140 steel table (HRC 20–68, HRB 50–100, HB 93–654, HV 93–940)");
    const txt = (x, d = 0) => (x == null ? "off scale" : fmt(x, d));
    return {
      primary: { label: v.scale === "hrc" ? "Brinell" : "Rockwell C", text: v.scale === "hrc" ? txt(r.hb) : txt(r.hrc, 1), unit: v.scale === "hrc" ? "HB" : "HRC" },
      stats: [
        { label: "Rockwell C", text: txt(r.hrc, 1) }, { label: "Rockwell B", text: txt(r.hrb, 1) },
        { label: "Brinell (3000 kgf)", text: txt(r.hb) }, { label: "Vickers", text: txt(r.hv) },
        { label: "Approx. tensile (steel)", text: r.tensile == null ? "off scale" : `${fmt(r.tensile, 0)} ksi (${fmt(r.tensile * 6.895, 0)} MPa)` },
      ],
      source: "geometry",
      explain: [{ title: "ASTM E140", formula: "Interpolated on Vickers between table rows (non-austenitic steel)", plugged: `${v.value} ${v.scale.toUpperCase()} → HV ${fmt(r.hv, 0)}` }],
      notes: ["Valid for carbon and alloy steels. Aluminum, brass, and austenitic stainless need their own tables."],
      historyLabel: `${v.value} ${v.scale.toUpperCase()}`,
    };
  },
});

register({
  id: "material-weight",
  title: "Material weight",
  short: "Bar, plate, tube, hex weight and cost",
  help: "Weight of a bar, plate, tube, or hex from its size and material, plus cost per pound.",
  category: "reference",
  keywords: ["weight", "mass", "stock", "bar", "plate", "tube", "hex", "round", "density", "cost", "price per pound", "quote"],
  pro: true,
  inputs: [
    { id: "shape", label: "Shape", kind: "select", default: "round", options: [{ value: "round", label: "Round bar" }, { value: "plate", label: "Plate / flat / square" }, { value: "tube", label: "Round tube" }, { value: "hex", label: "Hex bar" }, { value: "rectTube", label: "Rectangular tube" }] },
    { id: "material", label: "Material", kind: "select", default: "al6061", options: materialOptions() },
    { id: "d", positive: true, label: "Diameter", kind: "length", default: "2", defaultMm: "50", min: 0, showIf: (r) => r.shape === "round" || r.shape === "tube" },
    { id: "af", positive: true, label: "Across flats", kind: "length", default: "1", defaultMm: "25", min: 0, showIf: (r) => r.shape === "hex" },
    { id: "wall", positive: true, label: "Wall thickness", kind: "length", default: "0.125", defaultMm: "3", min: 0, showIf: (r) => r.shape === "tube" || r.shape === "rectTube" },
    { id: "t", positive: true, label: "Thickness", kind: "length", default: "0.5", defaultMm: "12", min: 0, showIf: (r) => r.shape === "plate" },
    { id: "w", positive: true, label: "Width", kind: "length", default: "6", defaultMm: "150", min: 0, showIf: (r) => r.shape === "plate" || r.shape === "rectTube" },
    { id: "h", positive: true, label: "Height", kind: "length", default: "2", defaultMm: "50", min: 0, showIf: (r) => r.shape === "rectTube" },
    { id: "len", positive: true, label: "Length", kind: "length", default: "12", defaultMm: "300", min: 0 },
    { id: "qty", label: "Quantity", kind: "int", default: "1", min: 1 },
    { id: "price", label: "Material price", kind: "number", default: "", unit: (u) => (u === "in" ? "$/lb" : "$/kg"), optional: true, placeholder: "optional", min: 0,
      // $/lb ⇄ $/kg when the unit system flips, so the job costs the same
      convert: (text, from, to) => { const v = parseFraction(text); return Number.isFinite(v) && from !== to ? fmt(to === "mm" ? v * 2.20462 : v / 2.20462, 2) : text; } },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const toIn3 = c.units === "in" ? 1 : 1 / 16387.064;
    let area;
    if (v.shape === "round") area = Math.PI * v.d * v.d / 4;
    else if (v.shape === "tube") { if (v.wall * 2 >= v.d) throw new Error("Wall is too thick for that diameter"); area = Math.PI * (v.d * v.d - (v.d - 2 * v.wall) ** 2) / 4; }
    else if (v.shape === "hex") area = (Math.sqrt(3) / 2) * v.af * v.af;
    else if (v.shape === "plate") area = v.t * v.w;
    else { if (v.wall * 2 >= Math.min(v.w, v.h)) throw new Error("Wall is too thick for that section"); area = v.w * v.h - (v.w - 2 * v.wall) * (v.h - 2 * v.wall); }
    const volIn3 = area * v.len * toIn3;
    const m = materialById(v.material);
    const lb = volIn3 * m.density;
    const total = lb * v.qty;
    const cost = Number.isFinite(v.price) ? (c.units === "in" ? total : total * 0.453592) * v.price : null;
    return {
      primary: { label: `Weight${v.qty > 1 ? ` · ${v.qty} pcs` : ""} · ${m.name}`, value: c.units === "in" ? total : total * 0.453592, unit: c.L.weight, places: 2 },
      stats: [
        { label: "Each", value: c.units === "in" ? lb : lb * 0.453592, unit: c.L.weight, places: 3 },
        { label: "Volume each", value: c.units === "in" ? volIn3 : volIn3 * 16.387064, unit: c.units === "in" ? "in³" : "cm³", places: 2 },
        { label: "Cross-section", value: area, unit: c.L.area, places: p },
        { label: "Density", value: c.units === "in" ? m.density : m.density * 27.68, unit: c.units === "in" ? "lb/in³" : "g/cm³", places: 3 },
        { label: c.units === "in" ? "Per foot" : "Per meter", value: c.units === "in" ? lb / v.len * 12 : lb * 0.453592 / v.len * 1000, unit: c.units === "in" ? "lb/ft" : "kg/m", places: 3 },
        ...(cost != null ? [{ label: "Material cost", text: `$${fmt(cost, 2)}` }] : []),
      ],
      source: "geometry",
      explain: [{ title: "Weight", formula: "W = area × length × density", plugged: c.units === "in"
        ? `= ${fmt(area, p)} in² × ${fmt(v.len, p)} in × ${fmt(m.density, 3)} lb/in³ = ${fmt(lb, 3)} lb`
        : `= ${fmt(area, p)} mm² × ${fmt(v.len, p)} mm × ${fmt(m.density * 27.68, 3)} g/cm³ ÷ 1,000,000 = ${fmt(lb * 0.453592, 3)} kg` }],
      historyLabel: `${v.shape} ${m.name.split(" ")[0]} · ${fmt(c.units === "in" ? total : total * 0.453592, 2)} ${c.L.weight}`,
    };
  },
});

register({
  id: "glossary",
  title: "Shop terms",
  short: "SFM, IPM, chip load, pitch diameter… in plain English",
  help: "Shop words in plain English — SFM, IPM, chip load, pitch diameter, and the rest. Type a word to find it.",
  category: "reference",
  keywords: ["glossary", "terms", "what is", "what does", "meaning", "definition", "sfm", "ipm", "chip load", "beginner", "learn"],
  view: "chart",
  placeholder: "Find a term: sfm, chip load, tenths",
  columns: [{ key: "term", label: "Term" }, { key: "name", label: "Stands for", long: true }, { key: "meaning", label: "Means", long: true }],
  rows: () => GLOSSARY.map(([term, name, meaning]) => ({ term, name, meaning })),
  note: "Written for people new to the shop. Pros: skip it, or send it to the new guy.",
});
