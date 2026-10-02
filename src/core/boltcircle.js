// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Bolt circle coordinates plus G-code / CSV / DXF text builders (pure — no DOM).

import { fmt, fmtSig, gcodeNumber } from "./format.js";

/**
 * A polar angle as a person reads it, 0 to under 360 (600° → 240°, −60° → 300°). Only for showing:
 * X/Y come from the raw angle. Float dust next to 360 reads as 0, not 360.
 */
export function wrapDegrees(a) {
  const w = ((a % 360) + 360) % 360;
  return 360 - w < 1e-9 ? 0 : w;
}

const hole = (index, angle, radius, centerX, centerY) => {
  const radians = angle * Math.PI / 180;
  return { index: index + 1, angleDeg: wrapDegrees(angle), x: centerX + radius * Math.cos(radians), y: centerY + radius * Math.sin(radians) };
};

/** Evenly spaced holes. Angles in degrees, CCW positive from +X unless direction "cw". */
export function boltCircleCoordinates(diameter, holes, startDegrees = 0, direction = "ccw", centerX = 0, centerY = 0) {
  const step = 360 / holes;
  const sign = direction === "cw" ? -1 : 1;
  return Array.from({ length: holes }, (_, index) => hole(index, startDegrees + sign * index * step, diameter / 2, centerX, centerY));
}

/** Partial bolt circle: `holes` spread across `sweepDegrees` inclusive of both ends. */
export function partialBoltCircleCoordinates(diameter, holes, startDegrees, sweepDegrees, direction = "ccw", centerX = 0, centerY = 0) {
  const step = holes > 1 ? sweepDegrees / (holes - 1) : 0;
  const sign = direction === "cw" ? -1 : 1;
  return Array.from({ length: holes }, (_, index) => hole(index, startDegrees + sign * index * step, diameter / 2, centerX, centerY));
}

/** Controls whose own dialect is not Fanuc-style: G54, G43 H and G81 mean something else there, or nothing. */
const OTHER_DIALECT = Object.freeze({ siemens: "Siemens", heidenhain: "Heidenhain", okuma: "Okuma" });
export const usesOtherDialect = (controller) => OTHER_DIALECT[String(controller).toLowerCase()] || null;

/** Places on the F word: 4 in inch, 3 in mm — what Haas and Fanuc take, and the same as the length words. */
export const feedPlaces = (units) => (units === "in" ? 4 : 3);

/**
 * What is wrong with the F word a feed posts as, or null when it posts true. F carries only feedPlaces
 * digits, so a feed under the last one either posts as F0 (the control alarms) or rounds to a different
 * feed — 0.00005 IPM would post F0.0001, twice that feed. More than 5% off is refused, not posted.
 * "That feed" is the one passed in: the typed feed, or the machine-fitted one, which nobody typed.
 * Ends without a period so callers can add their own reason after it.
 */
export function feedWordProblem(feed, units = "in") {
  const posted = Number(gcodeNumber(feed, feedPlaces(units)));
  if (!(posted > 0)) return "posts as F0 and the control would alarm";
  if (Math.abs(posted - feed) > 0.05 * feed) return `posts as F${gcodeNumber(feed, feedPlaces(units))}, ${fmtSig(posted / feed, 2)}× that feed: the F word stops at ${fmt(10 ** -feedPlaces(units), feedPlaces(units))} ${units === "in" ? "IPM" : "mm/min"}`;
  return null;
}

/**
 * A drilling feed this slow per minute is almost always a feed per rev typed in the per-minute box (the
 * slowest real drilling feeds, tiny drills, still come to about 1 IPM). Under 0.1 IPM / 2.5 mm/min: say so.
 * The numbers are significant figures, not fixed places, so the sum always reads right (0.00005 × 1000 = 0.05).
 * @returns {string|null}
 */
export function boltFeedCaution(feed, spindle, units = "in") {
  const unit = units === "in" ? "IPM" : "mm/min";
  if (!(feed > 0) || feed >= (units === "in" ? 0.1 : 2.5)) return null;
  const perRev = units === "in" ? "in/rev" : "mm/rev";
  return `Feed ${fmtSig(feed, 3)} ${unit} is a crawl for a drill. It looks like a feed per rev (${perRev}). Feed here is per minute: ${fmtSig(feed, 3)} × ${fmt(spindle, 0)} RPM = ${fmtSig(feed * spindle, 3)} ${unit}.`;
}

/**
 * Things that would make the drill cycle wrong or unsafe. Empty array = OK to post.
 * Z must be below the R plane (a positive "depth" drills air), and Safe Z must not be below R:
 * G98 lifts the tool back to Safe Z between holes.
 */
export function boltGcodeProblems({ mode = "positions", units = "in", z, r, safeZ, feed, peck, spindle }) {
  const out = [];
  const u = units === "in" ? "in" : "mm";
  if (mode === "drill" || mode === "peck") {
    if (!(z < r)) out.push(`Hole depth Z (${fmt(z, 4)} ${u}) has to be below the R plane (${fmt(r, 4)} ${u}). Depth is a negative number, like ${units === "in" ? "-0.5 in" : "-12 mm"}.`);
    if (!(feed > 0)) out.push("Feed has to be more than zero.");
    // The number as posted has to be the feed typed: F0 alarms, and a feed under the F word's last digit rounds to another feed.
    else if (feedWordProblem(feed, units)) out.push(`Feed ${fmtSig(feed, 3)} ${units === "in" ? "IPM" : "mm/min"} ${feedWordProblem(feed, units)}. Feed is per minute: feed per rev × RPM.`);
    if (!(spindle > 0)) out.push("Spindle speed has to be more than zero.");
    if (mode === "peck" && !(peck > 0)) out.push("Peck depth (Q) has to be more than zero.");
    if (!(safeZ >= r)) out.push(`Safe Z (${fmt(safeZ, 4)} ${u}) has to be at or above the R plane (${fmt(r, 4)} ${u}). The tool lifts to Safe Z between holes.`);
  }
  return out;
}

/**
 * Send Z home before M30 so the spindle is up out of the way for the operator and the next tool.
 * Haas and LinuxCNC: G53 (machine coordinates, one block) Z0 is home. Fanuc, Mazak EIA and the rest:
 * G91 G28 Z0 straight up to the reference point (no stop on the way), then back to G90.
 */
export function zHome(controller) {
  const ctl = String(controller ?? "").toLowerCase();
  return ctl === "haas" || ctl === "linuxcnc" ? ["G53 G0 Z0.0"] : ["G91 G28 Z0.0", "G90"];
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
    // G94: the F word is per minute only under G94, and a tapping program (G95) can leave per-rev on.
    out.push(`${unitCode} G17 G40 G49 G80 G90 G94`);
    out.push(`T${t} M6`);
    out.push(`${workOffset} G0 ${xy(coords[0])}`);
    out.push(`S${Math.round(spindle)} M3`);
    out.push(`G43 H${t} Z${n(safeZ)}`);
    if (coolant === "flood") out.push("M8");
    const peckWord = mode === "peck" ? ` Q${n(peck)}` : "";
    out.push(`${mode === "peck" ? "G83" : "G81"} G98 ${xy(coords[0])} Z${n(z)} R${n(r)}${peckWord} F${gcodeNumber(feed, feedPlaces(units))}`);
    for (let i = 1; i < coords.length; i += 1) out.push(xy(coords[i]));
    out.push("G80");
    out.push(`G0 Z${n(safeZ)}`);
    if (coolant === "flood") out.push("M9");
    out.push("M5");
    out.push(...zHome(controller));
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
