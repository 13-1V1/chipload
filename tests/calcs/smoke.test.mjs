// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Every registered calculator computes with its defaults, in inch and mm, without throwing,
// and returns a well-formed result. Charts return rows.

import test from "node:test";
import assert from "node:assert/strict";
import "../../src/calcs/index.js";
import { allCalcs } from "../../src/app/registry.js";
import { buildValues, defaultRaw } from "../../src/app/values.js";
import { fmt } from "../../src/core/format.js";
import { UNIT_LABEL } from "../../src/app/settings.js";

const ctxFor = (units, machine = null) => ({ units, L: UNIT_LABEL[units], settings: { units, pro: true }, machine, fmt });

test("registry has the free-tier tools from the brief", () => {
  const ids = new Set(allCalcs().map((d) => d.id));
  for (const id of ["feeds-mill", "feeds-drill", "tap-drill", "drill-chart", "thread-data", "right-triangle", "bolt-circle", "fraction-converter", "unit-converter", "gcode-ref"]) {
    assert.ok(ids.has(id), `missing ${id}`);
  }
});

for (const def of allCalcs()) {
  if (def.view === "chart") {
    test(`chart ${def.id} has rows and columns`, () => {
      const rows = def.rows(ctxFor("in"));
      assert.ok(rows.length > 10, "rows");
      const cols = typeof def.columns === "function" ? def.columns(ctxFor("in")) : def.columns;
      for (const c of cols) assert.ok(c.key && c.label);
    });
    continue;
  }
  for (const units of def.units === false ? ["in"] : ["in", "mm"]) {
    test(`${def.id} computes with defaults (${units})`, () => {
      const raw = defaultRaw(def, {}, units);
      const ctx = ctxFor(units);
      const { values, invalid } = buildValues(def, raw, ctx);
      assert.equal(invalid.size, 0, `invalid defaults: ${[...invalid].join(",")}`);
      const out = def.compute(values, ctx);
      assert.ok(out && out.primary, "primary");
      assert.ok(Number.isFinite(out.primary.value) || typeof out.primary.text === "string", "primary has a value or text");
      for (const s of out.stats || []) assert.ok(s.label, "stat label");
      assert.ok(Array.isArray(out.explain) && out.explain.length > 0, "explain drawer content");
      assert.ok(out.source, "source key");
    });
  }
}

test("machine limits clamp feeds-mill and flag it", () => {
  const def = allCalcs().find((d) => d.id === "feeds-mill");
  const ctx = ctxFor("in", { id: "m1", name: "Bridgeport", maxRpm: 2000, maxFeed: 30, units: "in" });
  const { values } = buildValues(def, defaultRaw(def, { diameter: "0.25", sfm: "800" }), ctx);
  const out = def.compute(values, ctx);
  assert.equal(out.stats[0].value, 2000);
  assert.ok(out.warnings.length >= 1);
  assert.match(out.warnings[0], /Bridgeport/);
});

test("tap drill 1/4-20 at 75% → #7 and M10 → 8.5 mm", () => {
  const def = allCalcs().find((d) => d.id === "tap-drill");
  const ctx = ctxFor("in");
  let out = def.compute(buildValues(def, defaultRaw(def, { thread: "1/4-20" }), ctx).values, ctx);
  assert.equal(out.primary.text, "#7");
  out = def.compute(buildValues(def, defaultRaw(def, { thread: "M10" }), ctx).values, ctx);
  assert.equal(out.primary.text, "8.5 mm");
});

test("bolt circle G-code is gated as Pro and inch by default", () => {
  const def = allCalcs().find((d) => d.id === "bolt-circle");
  const ctx = ctxFor("in");
  const out = def.compute(buildValues(def, defaultRaw(def, { gcode: "drill" }), ctx).values, ctx);
  assert.equal(out.code[0].pro, true);
  assert.match(out.code[0].text, /G20/);
  assert.match(out.code[0].text, /G81/);
  assert.equal(out.tables[0].rows.length, 6);
});

test("unit converter dynamic options and temperature", () => {
  const def = allCalcs().find((d) => d.id === "unit-converter");
  const ctx = ctxFor("in");
  const { values } = buildValues(def, defaultRaw(def, { cat: "temp", value: "212", from: "°F", to: "°C" }), ctx);
  const out = def.compute(values, ctx);
  assert.ok(Math.abs(out.primary.value - 100) < 1e-9);
});

test("typing a thread on the home search ranks tap drill first, then thread data", async () => {
  const { searchCalcs } = await import("../../src/app/search.js");
  const hits = searchCalcs("1/4-20", allCalcs());
  assert.equal(hits[0].def.id, "tap-drill");
  assert.equal(hits[1].def.id, "thread-data");
  assert.ok(hits.every((h) => h.params?.thread === "1/4-20" || !h.params));
  const num = searchCalcs("0.201", allCalcs());
  assert.equal(num[0].def.id, "fraction-converter");
  // keyword searches: free tools outrank Pro ones that merely mention the word
  assert.equal(searchCalcs("rpm", allCalcs())[0].def.id, "feeds-mill");
  assert.equal(searchCalcs("tap", allCalcs())[0].def.id, "tap-drill");
});

test("every tool has plain-English help, and the band saw tool is free", () => {
  for (const d of allCalcs()) assert.ok((d.help || "").length > 40, `${d.id} needs help text`);
  const saw = allCalcs().find((d) => d.id === "saw-speed");
  assert.equal(saw.pro, false);
  const ctx = ctxFor("in");
  const out = saw.compute(buildValues(saw, defaultRaw(saw, { material: "s1018", thickness: "1" }), ctx).values, ctx);
  assert.ok(out.primary.value >= 250 && out.primary.value <= 350, `steel blade speed ${out.primary.value}`);
  assert.match(out.stats[1].text, /8 TPI/);
  assert.equal(allCalcs().find((d) => d.id === "shcs").pro, false);
});

test("job sheet: answers what it can and asks for the next number", () => {
  const def = allCalcs().find((d) => d.id === "job-sheet");
  assert.equal(def.pro, false);
  const ctx = ctxFor("in", { id: "m1", name: "Bridgeport", maxRpm: 2720, maxFeed: 30, units: "in" });
  let out = def.compute(buildValues(def, defaultRaw(def, { op: "mill", material: "s1018", diameter: "0.5", flutes: "4" }), ctx).values, ctx);
  assert.ok(out.stats.some((s) => /Spindle/.test(s.label)));
  assert.ok(out.next.some((n) => n.input === "woc"), "asks for width of cut");
  assert.ok(out.next.some((n) => n.input === "length"), "asks for length");
  out = def.compute(buildValues(def, defaultRaw(def, { op: "mill", material: "s1018", diameter: "0.5", flutes: "4", woc: "0.1", doc: "0.25", length: "10", stock: "1", qty: "20", rate: "90" }), ctx).values, ctx);
  assert.ok(out.stats.some((s) => s.label === "Metal removal rate"));
  assert.ok(out.stats.some((s) => s.label === "Passes" && s.value === 4));
  assert.ok(out.stats.some((s) => /Job time/.test(s.label)));
  assert.equal(out.tables[0].pro, true, "price is the Pro line");
  assert.ok(!out.next.some((n) => n.input === "rate"));
  out = def.compute(buildValues(def, defaultRaw(def, { op: "drill", material: "al6061", diameter: "0.25", depth: "1", holes: "8" }), ctx).values, ctx);
  assert.ok(out.stats.some((s) => /Drilling time per part/.test(s.label)));
});
