// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Provenance notes shown in every calculator's "How was this figured?" drawer.

export const CALCULATION_SOURCES = Object.freeze({
  tapDrill: {
    title: "Tap drill guidance",
    source: "ANSI B94.11M / ISO 2306 tables when explicitly selected; otherwise the percent-thread rule of thumb.",
    confidence: "Shop starting point",
  },
  threadGeometry: {
    title: "60 degree thread geometry",
    source: "Basic 60 degree Unified and ISO metric geometry. Class limits remain estimates unless verified against the published standard.",
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
    source: "Controller-aware template only. Work offset, tool length, clearances, units, spindle, and cycle behavior require operator verification.",
    confidence: "Review before machine use",
  },
});
