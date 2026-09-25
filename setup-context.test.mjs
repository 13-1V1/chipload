import test from "node:test";
import assert from "node:assert/strict";
import { readSetupContext } from "./setup-context.js";
const snapshot = () => ({ version: 1, calculatorVersion: "3.3.0", machine: { name: "Mill", units: "mm", maxRpm: 1000, maxFeed: 254, controller: "haas", workOffset: "G54", safeZ: 5 }, material: { id: "stock", name: "Shop stock", sfm: 350, chipIn: .003 } });
test("portable setup preserves effective limits and material values but drops unrelated records", () => {
  const original = snapshot();
  original.machine.jobs = ["private job"];
  const restored = readSetupContext(JSON.stringify(original));
  assert.deepEqual(restored, snapshot());
  assert.deepEqual(readSetupContext(JSON.stringify({ version: 1, calculatorVersion: "3.3.0", machine: null, material: null })).machine, null);
});
test("invalid or future setup data fails before a calculation can use it", () => {
  for (const mutate of [s=>s.version=2, s=>delete s.machine, s=>s.machine.maxRpm=-1, s=>s.machine.maxFeed="100", s=>s.machine.units="cm", s=>s.machine.safeZ=null, s=>s.material.chipIn=-.002, s=>s.machine.workOffset="G90"]){
    const s = snapshot(); mutate(s);
    assert.throws(() => readSetupContext(JSON.stringify(s)));
  }
  assert.throws(() => readSetupContext("invalid json"));
  assert.throws(() => readSetupContext(" ".repeat(12001)));
});
