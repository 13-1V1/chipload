// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import assert from "node:assert/strict";

/** Assert |actual − expected| ≤ tolerance. */
export const near = (actual, expected, tolerance = 1e-9, label = "") => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label ? label + ": " : ""}expected ${expected} ± ${tolerance}, got ${actual}`);
};
