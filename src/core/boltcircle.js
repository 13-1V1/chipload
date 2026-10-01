// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Bolt circle coordinates plus G-code / CSV / DXF text builders (pure — no DOM).

import { fmt, gcodeNumber } from "./format.js";

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

/** Controls whose own dialect is not Fanuc-style: G54, G43 H and G81 mean something else there, or nothing. */
const OTHER_DIALECT = Object.freeze({ siemens: "Siemens", heidenhain: "Heidenhain", okuma: "Okuma" });
export const usesOtherDialect = (controller) => OTHER_DIALECT[String(controller).toLowerCase()] || null;

/**
 * Things that would make the drill cycle wrong or unsafe. Empty array = OK to post.
 * Z must be below the R plane (a positive "depth" drills air), and Safe Z must not be below R:
 * G98 lifts the tool back to Safe Z between holes.
 */
export function boltGcodeProblems({ mode = "positions", z, r, safeZ, feed, peck, spindle }) {
  const out = [];
  if (mode === "drill" || mode === "peck") {
    if (!(z < r)) out.push(`Hole depth Z (${fmt(z, 4)}) has to be below the R plane (${fmt(r, 4)}). Depth is a negative number, like -0.5.`);
    if (!(feed > 0)) out.push("Feed has to be more than zero.");
    if (!(spindle > 0)) out.push("Spindle speed has to be more than zero.");
    if (mode === "peck" && !(peck > 0)) out.push("Peck depth (Q) has to be more than zero.");
    if (!(safeZ >= r)) out.push(`Safe Z (${fmt(safeZ, 4)}) has to be at or above the R plane (${fmt(r, 4)}). The tool lifts to Safe Z between holes.`);
  }
  return out;
}

/**
 * Fanuc-style program text (Fanuc, Haas, Mazak EIA, LinuxCNC and most hobby controls). Lengths in `units`, feed in units/min.
 *   positions: X/Y moves only, a program stop (M0) at each hole. Z never moves — for spotting or quill drilling.
 *   drill / peck: tool change, G43 length offset to Safe Z, then G81 / G83 with G98, so the tool
 *     lifts back to Safe Z (the level it started the cycle from) between holes.
 * The safety line comes before the tool call, so its G49 can never cancel the G43 below it.
 * Comments use only capitals, digits, spaces and . - / because some controls reject anything else,
 * and stay under 36 characters so they read on a phone and on an old control's screen without scrolling.
 */
export function buildBoltGcode(coords, {
  units = "in", mode = "positions", z = -0.5, r = 0.1, feed = 5, peck = 0.1,
  safeZ = 1, spindle = 1000, tool = 1, controller = "fanuc", workOffset = "G54", coolant = "flood",
} = {}) {
  const dp = units === "in" ? 4 : 3;
  const n = (v) => gcodeNumber(v, dp);
  const xy = (c) => `X${n(c.x)} Y${n(c.y)}`;
  const holes = `${coords.length} HOLE${coords.length === 1 ? "" : "S"}`;
  const unitCode = units === "in" ? "G20" : "G21";
  const out = ["%"];
  if (mode === "positions") {
    out.push(`(BOLT CIRCLE - ${holes} - XY ONLY)`);
    out.push("(Z NEVER MOVES IN THIS PROGRAM)");
    out.push("(RAISE THE TOOL CLEAR FIRST)");
    out.push("(STOPS AT EACH HOLE)");
    out.push("(CYCLE START GOES TO THE NEXT)");
    out.push(`${unitCode} G17 G40 G80 G90`);
    out.push(workOffset);
    coords.forEach((c, i) => out.push(`(HOLE ${i + 1})`, `G0 ${xy(c)}`, "M0"));
  } else {
    const t = Math.round(tool);
    out.push(`(BOLT CIRCLE - ${holes} - ${mode === "peck" ? "G83 PECK" : "G81"})`);
    out.push(`(CHECK TOOL ${t} AND OFFSET ${workOffset})`);
    out.push("(CHECK THE DEPTHS BEFORE YOU RUN)");
    out.push("(SINGLE-BLOCK THE FIRST HOLE)");
    out.push(`${unitCode} G17 G40 G49 G80 G90`);
    out.push(`T${t} M6`);
    out.push(`${workOffset} G0 ${xy(coords[0])}`);
    out.push(`S${Math.round(spindle)} M3`);
    out.push(`G43 H${t} Z${n(safeZ)}`);
    if (coolant === "flood") out.push("M8");
    const peckWord = mode === "peck" ? ` Q${n(peck)}` : "";
    out.push(`${mode === "peck" ? "G83" : "G81"} G98 ${xy(coords[0])} Z${n(z)} R${n(r)}${peckWord} F${gcodeNumber(feed, 2)}`);
    for (let i = 1; i < coords.length; i += 1) out.push(xy(coords[i]));
    out.push("G80");
    out.push(`G0 Z${n(safeZ)}`);
    if (coolant === "flood") out.push("M9");
    out.push("M5");
  }
  out.push("M30", "%");
  return out.join("\n");
}

/** Bare X Y lines for controls that don't speak Fanuc: paste them under your own cycle. */
export function buildBoltPositions(coords, units = "in") {
  const dp = units === "in" ? 4 : 3;
  return coords.map((c) => `X${gcodeNumber(c.x, dp)} Y${gcodeNumber(c.y, dp)}`).join("\n");
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
