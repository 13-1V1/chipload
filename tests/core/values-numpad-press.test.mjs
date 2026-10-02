// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// A pad key types once per press: on pointerdown for a finger or mouse, however long it's held, and on
// the click for Enter / Space (keyboard, switch access), which has no press before it.

import test from "node:test";
import assert from "node:assert/strict";

// numpad.js builds its keys on the page; give it a small stand-in page that records the listeners.
const fakeEl = () => {
  const on = {};
  const classes = new Set();
  return {
    on, dataset: {}, style: { setProperty() {}, removeProperty() {} }, offsetHeight: 300,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle: (c, f) => (f ? classes.add(c) : classes.delete(c)) },
    children: [], setAttribute() {}, removeAttribute() {},
    addEventListener(ev, fn) { (on[ev] ||= []).push(fn); },
    append(child) { this.children.push(child); },
    contains(x) { return x === this || this.children.includes(x); },
    fire(ev, e = {}) { for (const fn of on[ev] || []) fn({ preventDefault() {}, ...e }); },
  };
};
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, innerHeight: 800 };
globalThis.document = {
  createElement: () => fakeEl(), body: fakeEl(), documentElement: fakeEl(),
  querySelector: () => null, addEventListener() {},
};
globalThis.requestAnimationFrame = () => {};
const { openNumpad, closeNumpad } = await import("../../src/app/numpad.js");

const setup = () => {
  const input = { ...fakeEl(), value: "" };
  openNumpad(input, {});
  const pad = document.body.children.at(-1);
  const key = (k) => pad.children.find((b) => b.dataset.key === k);
  return { input, key };
};

test("a tap types once, however long the key is held", () => {
  const { input, key } = setup();
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    for (const held of [100, 900, 1800, 5000]) {
      input.value = "";
      key("7").fire("pointerdown");
      now += held; // a slow press with a glove on
      key("7").fire("pointerup");
      key("7").fire("click", { detail: 1 }); // a mouse or touch click counts 1 or more
      assert.equal(input.value, "7", `held ${held} ms`);
    }
  } finally { Date.now = realNow; closeNumpad(); }
});

test("Enter or Space on a focused key types once", () => {
  const { input, key } = setup();
  for (const k of ["1", "/", "2"]) key(k).fire("click", { detail: 0 }); // keyboard activation: detail 0
  assert.equal(input.value, "1/2");
  key("bksp").fire("click", { detail: 0 });
  assert.equal(input.value, "1/");
  closeNumpad();
});
