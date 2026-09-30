// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Calculator registry: every calculator module registers a definition here.
// A definition: { id, title, short, category, keywords[], pro, inputs[], compute(values, ctx), prefill?(query) }

const defs = new Map();

export function register(def) {
  if (!def?.id) throw new Error("Calculator definition needs an id");
  if (defs.has(def.id)) throw new Error(`Duplicate calculator id: ${def.id}`);
  defs.set(def.id, def);
  return def;
}

export function getCalc(id) { return defs.get(id) || null; }
export function allCalcs() { return [...defs.values()]; }
export function calcsInCategory(categoryId) { return allCalcs().filter((d) => d.category === categoryId); }
