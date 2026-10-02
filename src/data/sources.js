// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Provenance notes shown in every calculator's "How was this figured?" drawer.

export const CALCULATION_SOURCES = Object.freeze({
  tapDrill: {
    title: "Tap drill guidance",
    source: "At 75% thread with a cutting tap: the standard tap drill chart (inch: Machinery's Handbook / ASME B1.1 sizes; metric: ISO 2306). Any other percent, or a form tap, uses the percent-thread formula and the nearest stock drill (ASME B94.11M sizes).",
    confidence: "Shop starting point",
  },
  hardness: {
    title: "Hardness conversion tables",
    source: "ASTM E140 Tables 1 and 2 (non-austenitic steel), straight line between published rows. Tensile from ASTM A370 Tables 2 and 3.",
    confidence: "Approximate; the standards warn against accepting or rejecting parts on a converted value",
  },
  thermal: {
    title: "Thermal expansion",
    source: "ΔL = α × L × ΔT with a handbook average expansion coefficient for the alloy (Machinery's Handbook, maker datasheets), room temperature to about 212 °F (100 °C).",
    confidence: "Typical value; the coefficient varies a few percent by alloy, temper and temperature range",
  },
  fits: {
    title: "ISO 286 limits and fits",
    source: "ISO 286-1 / ISO 286-2 tolerance grade and fundamental deviation tables, looked up by size step. Inch sizes are converted to mm for the lookup, then back.",
    confidence: "Published table values",
  },
  sti: {
    title: "Screw thread insert (STI) tap drill",
    source: "ASME B18.29.1 (inch) and B18.29.2M / insert-maker charts (metric) for listed sizes; otherwise the first stock drill at or above the STI minor diameter, D + 0.2165 × pitch.",
    confidence: "Chart value, or an estimate — confirm with the insert maker's chart",
  },
  acme: {
    title: "Acme thread geometry",
    source: "ASME B1.5 general purpose Acme, 29 degree thread form.",
    confidence: "Reference geometry",
  },
  npt: {
    title: "NPT pipe thread",
    source: "ASME B1.20.1 tapered pipe thread (60 degree form, 1 in 16 taper on diameter).",
    confidence: "Published table values",
  },
  weight: {
    title: "Stock weight",
    source: "Volume from the shape's dimensions × a typical handbook density for the material.",
    confidence: "Typical value; real stock varies by alloy and size tolerance",
  },
  threadGeometry: {
    title: "60 degree thread geometry",
    source: "Basic 60 degree Unified and ISO metric geometry. Unified class limits follow the ASME B1.1 formulas; metric limits follow the ISO 965 formulas, within a few microns of the tables.",
    confidence: "Reference geometry",
  },
  feeds: {
    title: "Speeds and feeds",
    source: "Conservative built-in starting values or user/tool-library overrides, constrained by the active machine profile.",
    confidence: "Starting point; verify with tool-maker data",
  },
  geometry: {
    title: "Shop geometry",
    source: "Deterministic trigonometric and coordinate geometry.",
    confidence: "Calculated",
  },
  advanced: {
    title: "Advanced shop formulas",
    source: "Deterministic geometry and kinematic relationships. Process assumptions such as reamer stock, thread-mill direction, and statistical RSS suitability still require shop validation.",
    confidence: "Calculated setup aid",
  },
  gcode: {
    title: "G-code template",
    source: "Fanuc-style template (Fanuc, Haas, Mazak EIA, LinuxCNC). Tool number, work offset, tool length, clearances, units, spindle, and cycle behavior are yours to verify.",
    confidence: "Review before machine use",
  },
});
