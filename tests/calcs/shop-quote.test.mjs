// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Quote helper: money reads as money, break-even is cost with no markup, markup vs margin say what the math does.

import test from "node:test";
import assert from "node:assert/strict";
import quote from "../../src/calcs/quote.js";
import { money } from "../../src/calcs/_money.js";
import { buildValues, defaultRaw } from "../../src/app/values.js";
import { fmt } from "../../src/core/format.js";
import { UNIT_LABEL } from "../../src/app/settings.js";

const ctx = { units: "in", L: UNIT_LABEL.in, settings: { units: "in", pro: true }, machine: null, fmt };
const run = (over = {}) => quote.compute(buildValues(quote, defaultRaw(quote, over), ctx).values, ctx);
const text = (out, re) => out.stats.find((s) => re.test(s.label));

test("money is dollars and cents with thousands grouped (US invoice style, Intl en-US currency)", () => {
  assert.equal(money(3.8), "$3.80");
  assert.equal(money(1024), "$1,024.00");
  assert.equal(money(150.4), "$150.40");
  assert.equal(money(0), "$0.00");
  assert.equal(money(-12.5), "-$12.50");
  assert.equal(money(NaN), "—");
});

test("break-even at qty 1 is the cost with no markup (profit = 0)", () => {
  // defaults: (12 + 1 + 60) min ÷ 60 × $95/hr + $8.50 + $1.25 = $115.58 + $9.75 = $125.33
  const out = run();
  assert.equal(text(out, /^Break-even at qty 1/).text, "$125.33");
  assert.equal(text(out, /^Price at qty 1/).text, "$150.40", "× 1.20 markup");
  // at qty 1 the break-even equals the "Total cost (before markup)" line
  const one = run({ qty: "1" });
  assert.equal(text(one, /^Break-even/).text, text(one, /^Total cost/).text);
});

test("defaults read as money: setup share $3.80, job total $1,024.00", () => {
  // setup 60 min × $95/hr ÷ 25 = $3.80; cost (13 × 25 + 60) ÷ 60 × 95 + 9.75 × 25 = $853.33, × 1.2 = $1,024.00
  const out = run();
  assert.equal(text(out, /Setup share/).text, "$3.80");
  assert.equal(text(out, /Job total/).text, "$1,024.00");
  assert.equal(out.primary.text, "$40.96");
});

test("markup is on cost; margin is profit ÷ price (20% markup = 16.7% margin)", () => {
  const out = run();
  assert.equal(fmt(text(out, /^Margin/).value, 1), "16.7");
  assert.match(out.notes[0], /20% markup is a 16\.7% margin/);
  assert.match(out.explain[0].plugged, /\$95\.00\/hr/);
  const r = run({ rate: "92.50" });
  assert.match(r.explain[0].plugged, /at \$92\.50\/hr/, "the rate as typed, not rounded to $93");
});
