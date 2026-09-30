// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Measurement over wires for 60° threads.
// Source: Machinery's Handbook "Measuring Screw Threads — Three-Wire Method",
// simplified formula (no lead-angle correction): M = E + 3W − 0.86603 P.

import { WIRE_SET_INCH, WIRE_SET_MM } from "../data/drills.js";

const K = Math.sqrt(3) / 2;

/** External: measurement over wires from pitch diameter. */
export function mowSolveMExternal(pitchDiameter, wire, pitch) {
  return pitchDiameter + 3 * wire - K * pitch;
}

/** External: pitch diameter from measurement over wires. */
export function mowSolveEExternal(measurement, wire, pitch) {
  return measurement - 3 * wire + K * pitch;
}

/** Internal (between wires / balls): measurement from pitch diameter. */
export function mowSolveMInternal(pitchDiameter, wire, pitch) {
  return pitchDiameter - 3 * wire + K * pitch;
}

export function mowSolveEInternal(measurement, wire, pitch) {
  return measurement + 3 * wire - K * pitch;
}

/** Best wire size for a 60° thread: W = 0.57735 P (contacts at the pitch line). */
export function bestWire(pitch) {
  return pitch / Math.sqrt(3);
}

/**
 * Usable wire range. Source: Machinery's Handbook — wires must touch the flanks
 * above the root and below the crest: min ≈ 0.505 P, max ≈ 1.010 P (60°).
 */
export function wireRange(pitch) {
  return { min: 0.505 * pitch, best: bestWire(pitch), max: 1.010 * pitch };
}

export function closestInSet(value, setArray) {
  let closest = setArray[0];
  let delta = Math.abs(value - closest);
  for (const candidate of setArray) {
    const d = Math.abs(value - candidate);
    if (d < delta) { closest = candidate; delta = d; }
  }
  return closest;
}

/** Closest stock wire to the best size, from the inch or mm kit. */
export function stockWire(pitch, units = "in") {
  return closestInSet(bestWire(pitch), units === "in" ? WIRE_SET_INCH : WIRE_SET_MM);
}
