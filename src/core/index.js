// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Single import point for every pure calculator function and data table.

export const CORE_VERSION = "4.0.0";

export * from "./format.js";
export * from "./thread.js";
export * from "./tapdrill.js";
export * from "./drills.js";
export * from "./mow.js";
export * from "./feeds.js";
export * from "./boltcircle.js";
export * from "./geometry.js";
export * from "./milling.js";
export * from "./tapping.js";
export * from "./tolstack.js";
export * from "./saw.js";

export { CALCULATION_SOURCES } from "../data/sources.js";
export { MACHINE_SCREW_DIAMETERS, UN_THREAD_TABLE, TAP_DRILL_UN_TABLE } from "../data/threads-un.js";
export { METRIC_DEFAULT_PITCH, METRIC_THREAD_TABLE, TAP_DRILL_METRIC_TABLE } from "../data/threads-metric.js";
export { DRILL_CHART_INCH, DRILL_CHART_MM, WIRE_SET_INCH, WIRE_SET_MM } from "../data/drills.js";
export { TOOL_LABELS } from "../data/materials.js";
