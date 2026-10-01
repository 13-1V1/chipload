// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Band saw blade speeds (feet per minute) by material group, bi-metal blade.
// Source: Machinery's Handbook "Band Saw Blade Speeds" and Lenox / Starrett blade speed charts, low end
// of the published ranges. Starting points — a dull blade or a thin-walled part wants the low number.

export const SAW_SPEEDS_FPM = Object.freeze({
  "Aluminum": [1500, 3000],
  "Copper alloys": [800, 1500],
  "Carbon steel": [250, 350],
  "Alloy steel": [150, 250],
  "Tool steel": [100, 150],
  "Stainless": [100, 150],
  "Cast iron": [150, 250],
  "Titanium": [80, 120],
  "Nickel & superalloys": [60, 100],
  "Magnesium & zinc": [1500, 3000],
  "Plastics & composites": [1000, 3000],
  "Other": [200, 400],
});

/** Teeth-per-inch sizes you can actually buy. */
export const COMMON_TPI = Object.freeze([2, 3, 4, 6, 8, 10, 14, 18, 24, 32]);
