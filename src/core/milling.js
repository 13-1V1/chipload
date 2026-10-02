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

/**
 * Chip thinning from the entering angle κr — the cutting edge measured from the work face (feed direction),
 * 90° = square shoulder. Sandvik Coromant: hex = fz × sin κr, so programmed fz = target chip ÷ sin κr.
 * 45° face mill → 1.414×; high-feed 12° → 4.8×. A US catalog "15° lead" (from the axis) is κr = 75° → 1.035×.
 */
export function leadAngleThinningFactor(enteringAngleDeg) {
  const s = Math.sin(enteringAngleDeg * Math.PI / 180);
  return s > 0 ? 1 / s : Infinity;
}

/**
 * Axial chip thinning on a corner radius / round insert when depth of cut ap < r:
 * effective lead angle κ = acos((r − ap) ÷ r), factor = 1 ÷ sin κ. At ap ≥ r → 1.
 */
export function cornerRadiusThinningFactor({ cornerRadius, depth }) {
  if (!(cornerRadius > 0) || !(depth > 0)) return 1;
  if (depth >= cornerRadius) return 1;
  const kappa = Math.acos((cornerRadius - depth) / cornerRadius);
  return 1 / Math.sin(kappa);
}

/**
 * Circular interpolation feed comp: the control feeds the tool center, the edge sees a different speed.
 * internal: F × (Dfeature − Dtool) ÷ Dfeature;  external: F × (Dfeature + Dtool) ÷ Dfeature.
 */
export function circleInterpolationFeed({ feed, toolDia, featureDia, internal = true }) {
  if (internal && toolDia >= featureDia) throw new Error("Tool must be smaller than the hole.");
  return internal ? feed * (featureDia - toolDia) / featureDia : feed * (featureDia + toolDia) / featureDia;
}

/** Cut time in minutes = length ÷ feed (length and feed in the same length unit). */
export function cutTime({ length, feed }) {
  return length / feed;
}

/** Metal removal rate = radial × axial × feed (in³/min when inches). */
export function metalRemovalRate({ widthOfCut, depthOfCut, feed }) {
  return widthOfCut * depthOfCut * feed;
}
