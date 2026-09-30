// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Milling helpers beyond basic speeds & feeds: thread milling, ball-nose scallop.
// Source: Machinery's Handbook "Milling Cutters — Ball End"; thread-mill feed comp
// per tool-maker guides (centerline feed = surface feed × (Dmajor − Dcutter) / Dmajor for internal).

/** Internal thread milling: programmed centerline feed from surface (tooth) feed. */
export function threadMilling({ units = "in", majorDiameter, cutterDiameter, rpm, flutes, chipLoad }) {
  const pathDiameter = majorDiameter - cutterDiameter;
  if (!(pathDiameter > 0)) throw new Error("Cutter diameter must be smaller than the thread major diameter.");
  const surfaceFeed = rpm * flutes * chipLoad;
  const centerlineFeed = surfaceFeed * (pathDiameter / majorDiameter);
  return { pathDiameter, surfaceFeed, centerlineFeed, units };
}

/** Cusp height between ball-nose passes: h = R − √(R² − (s/2)²). */
export function ballNoseScallopHeight({ radius, stepover }) {
  if (!(radius > 0) || !(stepover >= 0) || stepover > radius * 2) return NaN;
  return radius - Math.sqrt(radius * radius - (stepover * stepover) / 4);
}

/** Stepover for a target cusp height: s = 2 √(2Rh − h²). */
export function ballNoseStepover({ radius, scallopHeight }) {
  if (!(radius > 0) || !(scallopHeight >= 0) || scallopHeight > radius) return NaN;
  return 2 * Math.sqrt(Math.max(0, 2 * radius * scallopHeight - scallopHeight * scallopHeight));
}
