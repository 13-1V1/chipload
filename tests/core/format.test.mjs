// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { fmt, parseFraction, parseDimension, decimalToFraction } from "../../src/core/format.js";

test("fmt drops trailing zeros but keeps integers", () => {
  assert.equal(fmt(70, 0), "70");
  assert.equal(fmt(1200, 0), "1200");
  assert.equal(fmt(1.2300, 4), "1.23");
  assert.equal(fmt(NaN), "—");
});

// cos(270°) is -1.8e-16, not 0. A coordinate table must never show "-0".
test("fmt never prints negative zero", () => {
  assert.equal(fmt(-1.8e-16, 4), "0");
  assert.equal(fmt(-0.00004, 4), "0");
  assert.equal(fmt(-0.3, 0), "0");
  assert.equal(fmt(-0, 2), "0");
  assert.equal(fmt(-0.5, 4), "-0.5");
  assert.equal(fmt(-0.0001, 4), "-0.0001");
});

// "1,200" is twelve hundred in a US shop, not 1.2. A lone comma anywhere else is a decimal comma.
test("parseFraction reads thousands separators and decimal commas", () => {
  for (const [text, want] of [["1,200", 1200], ["10,000", 10000], ["12,500.5", 12500.5], ["1,234,567", 1234567], ["-1,000", -1000], ["0,5", 0.5], ["1,25", 1.25], ["0,125", 0.125], ["1,2345", 1.2345]]) {
    near(parseFraction(text), want, 1e-12, text);
  }
  assert.ok(Number.isNaN(parseFraction("1,23,4")));
  assert.ok(Number.isNaN(parseFraction("1,2,3")));
});

// The unit is usually typed tight against the number.
test("parseDimension reads a unit with or without a space", () => {
  near(parseDimension("10mm", "in"), 10 / 25.4, 1e-12);
  near(parseDimension("12.7MM", "in"), 0.5, 1e-12);
  near(parseDimension("0.5in", "mm"), 12.7, 1e-12);
  near(parseDimension("1/2in", "mm"), 12.7, 1e-12);
  near(parseDimension("2inch", "mm"), 50.8, 1e-12);
  near(parseDimension("2 inches", "mm"), 50.8, 1e-12);
  near(parseDimension('1 1/4"', "mm"), 31.75, 1e-12);
  near(parseDimension("25.4 millimeters", "in"), 1, 1e-12, "a spelled-out unit converts too");
  near(parseDimension("0,5mm", "mm"), 0.5, 1e-12);
  near(parseDimension("3/8 in", "in"), 0.375, 1e-12);
  for (const bad of ["3 min", "5 m", "mm", "", "abc", "1,2,3mm"]) assert.ok(Number.isNaN(parseDimension(bad, "in")), bad);
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
});
