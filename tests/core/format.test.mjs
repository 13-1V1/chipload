// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { fmt, parseFraction, parseDimension, decimalToFraction, decimalToFractionStr } from "../../src/core/format.js";

test("fmt drops trailing zeros but keeps integers", () => {
  assert.equal(fmt(70, 0), "70");
  assert.equal(fmt(1200, 0), "1200");
  assert.equal(fmt(1.2300, 4), "1.23");
  assert.equal(fmt(NaN), "—");
});

test("parseFraction handles fractions, mixed numbers, and comma decimals", () => {
  near(parseFraction("3/8"), 0.375);
  near(parseFraction("1 1/4"), 1.25);
  near(parseFraction("-0,5"), -0.5);
  assert.ok(Number.isNaN(parseFraction("1/0")));
  assert.ok(Number.isNaN(parseFraction("abc")));
});

test("parseDimension converts explicit unit suffixes", () => {
  near(parseDimension("25.4 mm", "in"), 1);
  near(parseDimension('0.5 in', "mm"), 12.7);
  near(parseDimension('1/2"', "in"), 0.5);
  assert.ok(Number.isNaN(parseDimension("1,2,3", "mm")));
});

test("decimalToFraction finds shop fractions to 1/64", () => {
  assert.equal(decimalToFraction(0.375).text, "3/8");
  assert.equal(decimalToFraction(1.25).text, "1-1/4");
  assert.equal(decimalToFraction(0.203125).text, "13/64");
  assert.equal(decimalToFraction(0.201), null, "#7 drill is not a clean fraction");
  assert.equal(decimalToFractionStr(0.5), '1/2"');
});
