// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// A write that didn't land says so: full or blocked storage (setItem throws QuotaExceededError, WHATWG
// HTML Storage interface) must not be reported as "Saved".

import test from "node:test";
import assert from "node:assert/strict";
import { saveBlob, loadList } from "../../src/app/store.js";

function fakeStorage({ full = false } = {}) {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { if (full) { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; } map.set(k, String(v)); },
    removeItem: (k) => map.delete(k),
  };
}

test("saveBlob returns true when stored and false when storage is full", () => {
  globalThis.localStorage = fakeStorage();
  assert.equal(saveBlob("jobs", [{ id: "a" }]), true);
  assert.deepEqual(loadList("jobs"), [{ id: "a" }]);
  globalThis.localStorage = fakeStorage({ full: true });
  assert.equal(saveBlob("jobs", [{ id: "b" }]), false);
  assert.deepEqual(loadList("jobs"), []);
  delete globalThis.localStorage;
  assert.equal(saveBlob("jobs", []), false, "no storage at all");
});
