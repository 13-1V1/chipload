// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// The number pad's keys only build text the field can read: a decimal, a fraction, or a mixed number.

import test from "node:test";
import assert from "node:assert/strict";
import { parseFraction } from "../../src/core/format.js";

// numpad.js wires itself to the page when it loads; give it just enough of one.
globalThis.window ??= { matchMedia: () => ({ matches: false }), addEventListener() {} };
globalThis.document ??= { addEventListener() {} };
const { padText } = await import("../../src/app/numpad.js");

const KEYS = ["1", "0", ".", "/", "sp", "pm", "bksp"];
const type = (keys) => keys.reduce((v, k) => padText(v, k), "");

test("keys that could only lead to a rejected number are ignored", () => {
  // each of these used to build text parseFraction always rejects ("1./4", "3/.5", "1.5 3/4", "- 1/2", "1 1 1/2", "-/2", "1 .5")
  assert.equal(type(["1", ".", "/", "4"]), "1.4");
  assert.equal(type(["3", "/", ".", "5"]), "3/5");
  assert.equal(type(["3", "/", "4", "."]), "3/4");
  assert.equal(type(["1", ".", "5", "sp", "3", "/", "4"]), "1.534"); // the space and the slash are refused in a decimal
  assert.equal(type(["pm", "sp", "1", "/", "2"]), "-1/2");
  assert.equal(type(["1", "sp", "1", "sp", "1", "/", "2"]), "1 11/2");
  assert.equal(type(["pm", "/", "2"]), "-2");
  assert.equal(type(["1", "sp", ".", "5"]), "1 5");
  // what the pad is for still works
  assert.equal(type(["1", "sp", "1", "/", "4"]), "1 1/4");
  assert.equal(type(["pm", "1", "sp", "1", "/", "4"]), "-1 1/4");
  assert.equal(type([".", "5"]), ".5");
  assert.equal(type(["3", "/", "8"]), "3/8");
  assert.equal(type(["1", "2", ".", "7", "bksp"]), "12.");
});

test("every text the pad can build is a number, or a number after one more digit", () => {
  const seen = new Set([""]);
  let frontier = [""];
  for (let depth = 0; depth < 7; depth++) {
    const next = [];
    for (const v of frontier) {
      for (const k of KEYS) {
        const t = padText(v, k);
        if (!seen.has(t)) { seen.add(t); next.push(t); }
      }
    }
    frontier = next;
  }
  const dead = [...seen].filter((t) => t && ![t, `${t}1`, `${t}1/1`].some((x) => Number.isFinite(parseFraction(x))));
  assert.deepEqual(dead.slice(0, 10), [], `dead ends: ${dead.length}`);
});
