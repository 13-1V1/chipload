// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Bolt circle. Free: coordinates. Pro: G81/G83 program, CSV, DXF, partial circles.

import { register } from "../app/registry.js";
import { boltCircleCoordinates, partialBoltCircleCoordinates, buildBoltGcode, buildBoltPositions, buildBoltCsv, buildBoltDxf, boltGcodeProblems, boltFeedCaution, usesOtherDialect } from "../core/boltcircle.js";
import { fmt, gcodeNumber } from "../core/format.js";
import { machineFor, fitToMachine, spindleSanity } from "./_machine.js";

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
    // A span, 0–360°: clockwise is the Direction switch, so a negative or zero sweep is refused by name, never swapped for a full circle.
    { id: "sweep", advanced: true, label: "Partial circle sweep", kind: "angle", default: "", optional: true, positive: true, max: 360, placeholder: "optional — e.g. 180 for a half circle (Pro)",
      hint: "Degrees from the first hole to the last. Use Direction for clockwise. Blank or 360 = all the way round." },
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
    // buildValues refuses a sweep of 0 or less, or over 360, by name; exactly 360 is the full circle.
    const partial = Number.isFinite(v.sweep) && v.sweep > 0 && v.sweep < 360;
    const sweep360 = v.sweep === 360;
    const coords = partial
      ? partialBoltCircleCoordinates(v.diameter, v.holes, v.start, v.sweep, v.direction, v.cx, v.cy)
      : boltCircleCoordinates(v.diameter, v.holes, v.start, v.direction, v.cx, v.cy);
    const p = c.units === "in" ? 4 : 3;
    const step = partial ? (v.holes > 1 ? v.sweep / (v.holes - 1) : 0) : 360 / v.holes;
    const chord = v.diameter * Math.sin((step * Math.PI / 180) / 2);

    const tables = [{
      title: partial ? `Coordinates (${fmt(v.sweep, 3)}° partial circle)` : "Coordinates", pro: partial,
      columns: [{ key: "index", label: "#", places: 0 }, { key: "angleDeg", label: "Angle", align: "right", places: 2 }, { key: "x", label: "X", align: "right", places: p }, { key: "y", label: "Y", align: "right", places: p }],
      rows: coords,
    }];
    const code = [];
    const warnings = [];
    const notes = [];
    if (sweep360) notes.push("A 360° sweep is the full circle: the holes are spaced evenly all the way round.");
    // The last hole of a partial circle closer to the first than the holes are to each other is almost always a typo for a full circle.
    if (partial && v.holes > 1 && 360 - v.sweep < step / 2) {
      warnings.push(`The last hole lands only ${fmt(360 - v.sweep, 3)}° short of the first, closer than the ${fmt(step, 3)}° between the others. For holes evenly all the way round, leave Partial circle sweep blank.`);
    }
    // Neighbor holes closer than the last digit the coordinates are written to (0.0001 in / 0.001 mm) all land
    // on one spot: G81 would drill the same X/Y over and over. Say so, and don't write a program for it.
    const unitStep = c.units === "in" ? 0.0001 : 0.001;
    const stacked = v.holes > 1 && chord < unitStep;
    if (stacked) {
      const check = partial ? "Check Partial circle sweep (degrees from the first hole to the last) and the number of holes." : "Check the bolt circle diameter and the number of holes.";
      const said = `holes are less than ${fmt(unitStep, p)} ${c.L.length} apart, the last digit the coordinates are written to, so neighbors land on top of each other. ${check}`;
      warnings.push(v.gcode === "none" ? `Neighbor ${said}` : `G-code not written: neighbor ${said}`);
    }
    // The program is a mill program (X/Y moves; drill and peck add T M6 and G43 H). A lathe profile doesn't apply: say so and post for a mill.
    const m = machineFor(c, "mill");
    const holds = isCycle(v) ? "tool change, G43 length offset, X/Y moves" : "X/Y moves";
    if (v.gcode !== "none" && c.machine && !m) warnings.push(`${c.machine.name} is set up as a lathe. This is a mill program (${holds}) — run it on a mill. On a lathe X is a diameter, so every hole would land at half the radius.`);
    const other = v.gcode === "none" || stacked ? null : usesOtherDialect(m?.controller);
    const gcodeProblems = v.gcode === "none" || other || stacked ? [] : boltGcodeProblems({ mode: v.gcode, units: c.units, z: v.z, r: v.r, safeZ: v.safeZ, feed: v.feed, peck: v.peck, spindle: v.spindle });
    warnings.push(...gcodeProblems.map((problem) => `G-code not written: ${problem}`));
    if (stacked) {
      // said above; nothing to post
    } else if (other) {
      // G54, G43 H and G81 are different words (or different things) on these controls — hand over the numbers only.
      code.push({ title: "Hole positions (X Y)", pro: true, filename: `bolt-circle-${v.holes}x${fmt(v.diameter, 3)}.txt`, mime: "text/plain", text: buildBoltPositions(coords, c.units) });
      warnings.push(`${m.name} is set to ${other}, which doesn't use Fanuc-style cycles and offsets. Here are the positions — write the cycle in your control's own format.`);
    } else if (v.gcode !== "none" && !gcodeProblems.length) {
      let spindle = v.spindle, feed = v.feed, blocked = null;
      if (isCycle(v)) {
        // Fit S and F inside the machine the same way every speeds & feeds tool does: the control would clamp
        // S but run F as written, and the drill's feed per rev would jump by that ratio.
        const toIn = c.units === "in" ? 1 : 1 / 25.4;
        const fit = fitToMachine(m, v.spindle, (v.feed * toIn) / v.spindle, c);
        if (fit.rpmCapped || fit.feedCapped) {
          // A whole RPM at or under the cap, and F figured from that S so the feed per rev is exactly the one typed.
          spindle = Math.floor(fit.rpm + 1e-9);
          feed = (v.feed / v.spindle) * spindle;
          // The fitted S and F are what the control reads, so they get the same check as the typed ones: a
          // feed-capped spindle can floor under 1 RPM, and a tiny feed scaled down by the RPM cap can post as F0.
          // Both are almost always Spindle and Feed typed into each other's boxes.
          const swapped = `Check that Spindle and Feed aren't swapped: Spindle is RPM, Feed is per minute (${c.L.feed}).`;
          const feedPlaces = c.units === "in" ? 4 : 3;
          if (fit.cantRun || spindle < 1) blocked = `${fmt(v.feed, 4)} ${c.L.feed} at ${fmt(v.spindle, 0)} RPM is ${fmt(v.feed / v.spindle, feedPlaces)} ${c.L.feedRev}, more than ${m.name}'s max feed moves in a minute, so no spindle speed can run it. ${swapped}`;
          else if (!(Number(gcodeNumber(feed, feedPlaces)) > 0)) blocked = `at ${fmt(spindle, 0)} RPM${fit.feedCapped ? "" : ` (${m.name}'s top speed)`} the same feed per rev comes to ${fmt(feed, 6)} ${c.L.feed}, which posts as zero and the control would alarm. ${swapped}`;
          if (blocked) warnings.push(`G-code not written: ${blocked}`);
          else warnings.push(...fit.warnings, `The program posts S${fmt(spindle, 0)} F${fmt(feed, feedPlaces)} (${c.L.feed}): the same feed per rev you asked for.`);
        }
        warnings.push(...spindleSanity(v.spindle, m, "mill", c));
        const crawl = boltFeedCaution(v.feed, v.spindle, c.units);
        if (crawl) warnings.push(crawl);
      }
      if (!blocked) code.push({
        title: v.gcode === "positions" ? "Positions, stop at each hole" : v.gcode === "peck" ? "G83 peck drill" : "G81 drill", pro: true,
        filename: `bolt-circle-${v.holes}x${fmt(v.diameter, 3)}.nc`, mime: "text/plain",
        text: buildBoltGcode(coords, { units: c.units, mode: v.gcode, z: v.z, r: v.r, feed, peck: v.peck, safeZ: v.safeZ, spindle, tool: v.tool, workOffset: v.workOffset, controller: m?.controller || "fanuc" }),
      });
      if (isCycle(v) && v.r <= 0) warnings.push("R plane is at or below Z0. If Z0 is the top of the part, the tool will rapid into it — R is normally a little above the surface.");
    }
    if (isCycle(v)) notes.push("The tool lifts to Safe Z between holes (G98). With nothing in the way, change G98 to G99 and it stays at the R plane — faster.");
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
        { title: "Hole position", formula: "X = Cx + (D/2) cos θ   Y = Cy + (D/2) sin θ   θ = start ± n × step", plugged: `D/2 = ${fmt(v.diameter / 2, p)} ${c.L.length}, step = ${fmt(step, 3)}°` },
        { title: "Chord", formula: "chord = D × sin(step ÷ 2)", plugged: `= ${fmt(v.diameter, p)} ${c.L.length} × sin(${fmt(step / 2, 3)}°) = ${fmt(chord, p)} ${c.L.length}` },
      ],
      notes,
      historyLabel: `${v.holes} holes on ${fmt(v.diameter, p)} ${c.L.length}${partial ? ` · ${fmt(v.sweep, 3)}°` : ""}`,
    };
  },
});
