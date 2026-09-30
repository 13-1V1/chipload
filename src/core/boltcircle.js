// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Bolt circle coordinates plus G-code / CSV / DXF text builders (pure — no DOM).

import { fmt } from "./format.js";

/** Evenly spaced holes. Angles in degrees, CCW positive from +X unless direction "cw". */
export function boltCircleCoordinates(diameter, holes, startDegrees = 0, direction = "ccw", centerX = 0, centerY = 0) {
  const radius = diameter / 2;
  const step = 360 / holes;
  const sign = direction === "cw" ? -1 : 1;
  return Array.from({ length: holes }, (_, index) => {
    const angleDeg = startDegrees + sign * index * step;
    const radians = angleDeg * Math.PI / 180;
    return { index: index + 1, angleDeg, x: centerX + radius * Math.cos(radians), y: centerY + radius * Math.sin(radians) };
  });
}

/** Partial bolt circle: `holes` spread across `sweepDegrees` inclusive of both ends. */
export function partialBoltCircleCoordinates(diameter, holes, startDegrees, sweepDegrees, direction = "ccw", centerX = 0, centerY = 0) {
  const radius = diameter / 2;
  const step = holes > 1 ? sweepDegrees / (holes - 1) : 0;
  const sign = direction === "cw" ? -1 : 1;
  return Array.from({ length: holes }, (_, index) => {
    const angleDeg = startDegrees + sign * index * step;
    const radians = angleDeg * Math.PI / 180;
    return { index: index + 1, angleDeg, x: centerX + radius * Math.cos(radians), y: centerY + radius * Math.sin(radians) };
  });
}

/**
 * Drill-cycle program. Source: Fanuc-style G81/G83 canned cycles; header G20 (inch) by default.
 * All lengths in `units`. Feed in units/min.
 */
export function buildBoltGcode(coords, {
  units = "in", mode = "positions", z = -0.5, r = 0.1, feed = 5, peck = 0.1,
  safeZ = 1, spindle = 1000, controller = "fanuc", workOffset = "G54", coolant = "flood",
} = {}) {
  const dp = units === "in" ? 4 : 3;
  const unitHeader = units === "in" ? "G20" : "G21";
  const out = ["%"];
  out.push(`(Bolt circle: ${coords.length} hole${coords.length === 1 ? "" : "s"}; ${String(controller).toUpperCase()} profile)`);
  out.push("(STARTING POINT - SIMULATE, SINGLE-BLOCK, AND DRY-RUN ABOVE THE PART)");
  out.push(`${unitHeader} G90 G17 G40 G49 G80`);
  out.push(workOffset);
  out.push(`G0 Z${fmt(safeZ, dp)}`);
  if (mode === "positions") {
    coords.forEach((c, i) => {
      out.push(`(Hole ${i + 1})`);
      out.push(`G0 X${fmt(c.x, dp)} Y${fmt(c.y, dp)}`);
    });
  } else {
    const cycle = mode === "peck" ? "G83" : "G81";
    const first = coords[0];
    out.push(`S${fmt(spindle, 0)} M3`);
    if (coolant === "flood") out.push("M8");
    out.push(`G0 X${fmt(first.x, dp)} Y${fmt(first.y, dp)}`);
    out.push(`G0 Z${fmt(r, dp)}`);
    const peckPart = mode === "peck" && Number.isFinite(peck) ? ` Q${fmt(peck, dp)}` : "";
    out.push(`${cycle} G98 X${fmt(first.x, dp)} Y${fmt(first.y, dp)} Z${fmt(z, dp)} R${fmt(r, dp)}${peckPart} F${fmt(feed, 2)}`);
    for (let i = 1; i < coords.length; i += 1) out.push(`X${fmt(coords[i].x, dp)} Y${fmt(coords[i].y, dp)}`);
    out.push("G80");
    out.push(`G0 Z${fmt(safeZ, dp)}`);
    if (coolant === "flood") out.push("M9");
    out.push("M5");
  }
  out.push("M30", "%");
  return out.join("\n");
}

export function buildBoltCsv(coords, units = "in") {
  const rows = [`Index,Angle_deg,X_${units},Y_${units}`];
  coords.forEach((c, i) => rows.push(`${i + 1},${fmt(c.angleDeg, 6)},${fmt(c.x, 6)},${fmt(c.y, 6)}`));
  return rows.join("\n") + "\n";
}

/** Minimal AutoCAD R12 ASCII DXF: reference circle + one POINT per hole on layer BOLT_CIRCLE. */
export function buildBoltDxf(coords, diameter, centerX = 0, centerY = 0) {
  const out = [];
  const add = (code, value) => { out.push(String(code), String(value)); };
  add(0, "SECTION"); add(2, "HEADER"); add(9, "$ACADVER"); add(1, "AC1009"); add(0, "ENDSEC");
  add(0, "SECTION"); add(2, "TABLES");
  add(0, "TABLE"); add(2, "LAYER"); add(70, 1);
  add(0, "LAYER"); add(2, "BOLT_CIRCLE"); add(70, 0); add(62, 1); add(6, "CONTINUOUS");
  add(0, "ENDTAB"); add(0, "ENDSEC");
  add(0, "SECTION"); add(2, "ENTITIES");
  add(0, "CIRCLE"); add(8, "BOLT_CIRCLE");
  add(10, fmt(centerX, 6)); add(20, fmt(centerY, 6)); add(30, "0"); add(40, fmt((diameter || 0) / 2, 6));
  coords.forEach((c) => { add(0, "POINT"); add(8, "BOLT_CIRCLE"); add(10, fmt(c.x, 6)); add(20, fmt(c.y, 6)); add(30, "0"); });
  add(0, "ENDSEC"); add(0, "EOF");
  return out.join("\n") + "\n";
}
