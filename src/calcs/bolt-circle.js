// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Bolt circle. Free: coordinates. Pro: G81/G83 program, CSV, DXF, partial circles.

import { register } from "../app/registry.js";
import { boltCircleCoordinates, partialBoltCircleCoordinates, buildBoltGcode, buildBoltPositions, buildBoltCsv, buildBoltDxf, boltGcodeProblems, usesOtherDialect } from "../core/boltcircle.js";
import { fmt } from "../core/format.js";

const isCycle = (r) => r.gcode === "drill" || r.gcode === "peck";

export default register({
  id: "bolt-circle",
  title: "Bolt circle",
  short: "Hole coordinates, G-code, CSV, DXF",
  help: "Holes spaced evenly around a circle, like on a flange. Gives the X/Y of every hole so you can dial them in, plus a drill program for CNC (Pro).",
  category: "geometry",
  keywords: ["bolt circle", "bolt hole", "bhc", "pcd", "pattern", "holes", "coordinates", "g81", "g83", "dxf", "flange", "hole pattern", "evenly spaced holes", "circle of holes"],
  pro: false,
  safety: "G-code is a starting point. Simulate, single-block, and dry run above the part.",
  inputs: [
    { id: "diameter", label: "Bolt circle diameter", kind: "length", default: "4", defaultMm: "100", min: 0.0001 },
    { id: "holes", label: "Number of holes", kind: "int", default: "6", min: 1, max: 360 },
    { id: "start", advanced: true, label: "First hole angle", kind: "angle", default: "0", hint: "0° is +X (3 o'clock). Counter-clockwise is positive." },
    { id: "direction", advanced: true, label: "Direction", kind: "segment", default: "ccw", options: [{ value: "ccw", label: "CCW" }, { value: "cw", label: "CW" }] },
    { id: "cx", advanced: true, label: "Center X", kind: "length", default: "0" },
    { id: "cy", advanced: true, label: "Center Y", kind: "length", default: "0" },
    { id: "sweep", advanced: true, label: "Partial circle sweep", kind: "angle", default: "", optional: true, placeholder: "optional — e.g. 180 for a half circle (Pro)" },
    { id: "gcode", advanced: true, label: "G-code", kind: "segment", default: "none",
      options: [{ value: "none", label: "None" }, { value: "positions", label: "Positions" }, { value: "drill", label: "G81" }, { value: "peck", label: "G83" }],
      hint: "Positions stops at each hole and never moves Z. G81 drills, G83 peck drills." },
    { id: "z", advanced: true, label: "Hole depth (Z, negative)", kind: "length", default: "-0.5", defaultMm: "-12", showIf: isCycle },
    { id: "r", advanced: true, label: "R plane", kind: "length", default: "0.1", defaultMm: "2", showIf: isCycle, hint: "Where the feed starts — a little above the part." },
    { id: "feed", advanced: true, label: "Feed", kind: "feed", default: "5", defaultMm: "120", showIf: isCycle },
    { id: "peck", positive: true, advanced: true, label: "Peck depth (Q)", kind: "length", default: "0.1", defaultMm: "2.5", showIf: (r) => r.gcode === "peck" },
    { id: "spindle", min: 1, advanced: true, label: "Spindle", kind: "int", default: "1000", unit: "RPM", showIf: isCycle },
    { id: "safeZ", advanced: true, label: "Safe Z", kind: "length", default: "1", defaultMm: "25", showIf: isCycle, hint: "High enough to clear clamps. The tool lifts here between holes." },
    { id: "tool", advanced: true, label: "Tool number (T and H)", kind: "int", default: "1", min: 1, max: 999, showIf: isCycle },
    { id: "workOffset", advanced: true, label: "Work offset", kind: "select", default: "G54", showIf: (r) => r.gcode !== "none",
      options: ["G54", "G55", "G56", "G57", "G58", "G59"].map((g) => ({ value: g, label: g })) },
  ],
  compute(v, c) {
    const partial = Number.isFinite(v.sweep) && v.sweep > 0 && v.sweep < 360;
    const coords = partial
      ? partialBoltCircleCoordinates(v.diameter, v.holes, v.start, v.sweep, v.direction, v.cx, v.cy)
      : boltCircleCoordinates(v.diameter, v.holes, v.start, v.direction, v.cx, v.cy);
    const p = c.units === "in" ? 4 : 3;
    const step = partial ? (v.holes > 1 ? v.sweep / (v.holes - 1) : 0) : 360 / v.holes;
    const chord = v.diameter * Math.sin((step * Math.PI / 180) / 2);

    const tables = [{
      title: partial ? `Coordinates (${fmt(v.sweep, 1)}° partial circle)` : "Coordinates", pro: partial,
      columns: [{ key: "index", label: "#", places: 0 }, { key: "angleDeg", label: "Angle", align: "right", places: 2 }, { key: "x", label: "X", align: "right", places: p }, { key: "y", label: "Y", align: "right", places: p }],
      rows: coords,
    }];
    const code = [];
    const warnings = [];
    const other = v.gcode === "none" ? null : usesOtherDialect(c.machine?.controller);
    const gcodeProblems = v.gcode === "none" || other ? [] : boltGcodeProblems({ mode: v.gcode, z: v.z, r: v.r, safeZ: v.safeZ, feed: v.feed, peck: v.peck, spindle: v.spindle });
    warnings.push(...gcodeProblems.map((problem) => `G-code not written: ${problem}`));
    if (other) {
      // G54, G43 H and G81 are different words (or different things) on these controls — hand over the numbers only.
      code.push({ title: "Hole positions (X Y)", pro: true, filename: `bolt-circle-${v.holes}x${fmt(v.diameter, 3)}.txt`, mime: "text/plain", text: buildBoltPositions(coords, c.units) });
      warnings.push(`${c.machine.name} is set to ${other}, which doesn't use Fanuc-style cycles and offsets. Here are the positions — write the cycle in your control's own format.`);
    } else if (v.gcode !== "none" && !gcodeProblems.length) {
      code.push({
        title: v.gcode === "positions" ? "Positions, stop at each hole" : v.gcode === "peck" ? "G83 peck drill" : "G81 drill", pro: true,
        filename: `bolt-circle-${v.holes}x${fmt(v.diameter, 3)}.nc`, mime: "text/plain",
        text: buildBoltGcode(coords, { units: c.units, mode: v.gcode, z: v.z, r: v.r, feed: v.feed, peck: v.peck, safeZ: v.safeZ, spindle: v.spindle, tool: v.tool, workOffset: v.workOffset, controller: c.machine?.controller || "fanuc" }),
      });
      if (isCycle(v) && v.r <= 0) warnings.push("R plane is at or below Z0. If Z0 is the top of the part, the tool will rapid into it — R is normally a little above the surface.");
    }
    const downloads = [
      { label: "Save CSV", pro: true, filename: `bolt-circle-${v.holes}.csv`, mime: "text/csv", text: buildBoltCsv(coords, c.units) },
      { label: "Save DXF", pro: true, filename: `bolt-circle-${v.holes}.dxf`, mime: "application/dxf", text: buildBoltDxf(coords, v.diameter, v.cx, v.cy) },
    ];
    return {
      primary: { label: `Hole 1 of ${v.holes}`, text: `X${fmt(coords[0].x, p)} Y${fmt(coords[0].y, p)}`, unit: "" },
      stats: [
        { label: "Angle between holes", value: step, unit: "°", places: 3 },
        { label: "Chord (hole to hole)", value: chord, unit: c.L.length, places: p },
        { label: "Radius", value: v.diameter / 2, unit: c.L.length, places: p },
        { label: "Circumference", value: Math.PI * v.diameter, unit: c.L.length, places: p },
      ],
      tables, code, downloads,
      warnings,
      source: v.gcode === "none" ? "geometry" : "gcode",
      explain: [
        { title: "Hole position", formula: "X = Cx + (D/2) cos θ   Y = Cy + (D/2) sin θ   θ = start ± n × step", plugged: `D/2 = ${fmt(v.diameter / 2, p)}, step = ${fmt(step, 3)}°` },
        { title: "Chord", formula: "chord = D × sin(step ÷ 2)", plugged: `= ${fmt(v.diameter, p)} × sin(${fmt(step / 2, 3)}°) = ${fmt(chord, p)}` },
      ],
      notes: v.gcode === "drill" || v.gcode === "peck" ? ["The tool lifts to Safe Z between holes (G98). With nothing in the way, change G98 to G99 and it stays at the R plane — faster."] : [],
      historyLabel: `${v.holes} holes on ${fmt(v.diameter, p)} ${c.L.length}${partial ? ` · ${fmt(v.sweep, 0)}°` : ""}`,
    };
  },
});
