// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Combined drill and countersink (center drill), plain type, 60°. Source: ASME B94.11M / common maker charts. Inches.
// body = shank/body diameter, pilot = small drill diameter, pilotLen = drill (pilot) length.

export const CENTER_DRILLS = Object.freeze([
  { size: "#00", body: 0.125, pilot: 0.025, pilotLen: 0.030 },
  { size: "#0", body: 0.125, pilot: 0.03125, pilotLen: 0.038 },
  { size: "#1", body: 0.125, pilot: 0.046875, pilotLen: 0.047 },
  { size: "#2", body: 0.1875, pilot: 0.078125, pilotLen: 0.078 },
  { size: "#3", body: 0.25, pilot: 0.109375, pilotLen: 0.109 },
  { size: "#4", body: 0.3125, pilot: 0.125, pilotLen: 0.125 },
  { size: "#5", body: 0.4375, pilot: 0.1875, pilotLen: 0.188 },
  { size: "#6", body: 0.5, pilot: 0.21875, pilotLen: 0.219 },
  { size: "#7", body: 0.625, pilot: 0.25, pilotLen: 0.250 },
  { size: "#8", body: 0.75, pilot: 0.3125, pilotLen: 0.313 },
]);
