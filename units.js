import { parseDimension, parseFraction } from "./calc-core.js?v=3.2.0";

// Canonical values survive repeated unit switches without rounding accumulation.
export function createUnitController() {
  const knownUnits = new Map();
  const canonical = new WeakMap();
  const dimensions = {
    mowUnits: ["mowWire", "mowE", "mowM"],
    bcUnits: ["bcDia", "bcCenterX", "bcCenterY", "bcGcodeZ", "bcGcodeR", "bcGcodeFeed", "bcGcodePeck", "bcSafeZ"],
    rtUnits: ["rtRun", "rtRise", "rtHyp"],
    sfUnits: ["sfDiameter", "sfChipLoad", "sfWoc", "sfDoc"],
    chUnits: ["chSmall", "chLarge"],
    c3Units: ["c3x1", "c3y1", "c3x2", "c3y2", "c3x3", "c3y3"],
    advancedUnits: ["advTmMajor", "advTmCutter", "advTmChip", "advReamTarget", "advReamAllowance", "advSineLength", "advTaperLarge", "advTaperSmall", "advTaperLength", "advScallopRadius", "advScallopValue"],
    machineUnits: ["machineMaxFeed", "machineSafeZ"],
    toolProfileUnits: ["toolProfileDiameter", "toolProfileChip"],
  };
  const format = number => Number(number.toPrecision(12)).toString();
  function convertInput(input, from, to, kind = "length") {
    if (!input || !input.value.trim()) return;
    const prior = canonical.get(input);
    let base;
    if (prior?.text === input.value && prior.units === from && prior.kind === kind) base = prior.base;
    else {
      const number = kind === "length" ? parseDimension(input.value, from) : parseFraction(input.value);
      if (!Number.isFinite(number)) return;
      base = kind === "pitch" ? (from === "in" ? 25.4 / number : number)
        : number * (from === "in" ? (kind === "speed" ? 0.3048 : 25.4) : 1);
    }
    const value = kind === "pitch" ? (to === "in" ? 25.4 / base : base)
      : base / (to === "in" ? (kind === "speed" ? 0.3048 : 25.4) : 1);
    if (!Number.isFinite(value)) return;
    input.value = format(value);
    canonical.set(input, { base, text: input.value, units: to, kind });
  }
  function convert(id, from, to) {
    if (!from || !to || from === to) return;
    (dimensions[id] || []).forEach(field => convertInput(document.getElementById(field), from, to));
    if (id === "sfUnits") convertInput(document.getElementById("sfSpeed"), from, to, "speed");
    if (id === "toolProfileUnits") convertInput(document.getElementById("toolProfileSfm"), from, to, "speed");
    if (id === "mowUnits") convertInput(document.getElementById("mowPitchInput"), from, to, "pitch");
    if (id === "advancedUnits") {
      convertInput(document.getElementById("advTapThread"), from, to, "pitch");
      if (document.getElementById("advSineMode").value === "angle") convertInput(document.getElementById("advSineValue"), from, to);
      document.querySelectorAll("[data-stack-nominal], [data-stack-tolerance]").forEach(input => convertInput(input, from, to));
    }
  }
  function sync(form = document) {
    Object.keys(dimensions).forEach(id => {
      const select = document.getElementById(id);
      if (select && (form === document || form.contains(select))) knownUnits.set(id, select.value);
    });
  }
  function set(id, to, { emit = false } = {}) {
    const select = document.getElementById(id);
    const from = select.value;
    convert(id, from, to);
    select.value = to;
    knownUnits.set(id, to);
    if (emit) select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function reset(form) {
    const units = Object.keys(dimensions).flatMap(id => {
      const select = document.getElementById(id);
      return form.contains(select) ? [[id, select.value]] : [];
    });
    form.reset();
    sync(form);
    // Defaults in the markup have their own units; convert those defaults too.
    units.forEach(([id, value]) => set(id, value));
  }
  sync();
  // Run before calculator-specific change handlers update labels or recalculate.
  document.addEventListener("change", event => {
    const select = event.target;
    if (!Object.hasOwn(dimensions, select.id)) return;
    convert(select.id, knownUnits.get(select.id), select.value);
    knownUnits.set(select.id, select.value);
  }, true);
  document.addEventListener("reset", event => queueMicrotask(() => sync(event.target)));
  return { convert, set, sync, reset };
}
