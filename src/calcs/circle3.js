// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Circle through 3 points. Pro. Find a center and radius from three probed/indicated points.

import { register } from "../app/registry.js";
import { circleThrough3Points } from "../core/geometry.js";
import { fmt } from "../core/format.js";
import { lenPlaces } from "./_util.js";

export default register({
  id: "circle3",
  title: "Circle from 3 points",
  short: "Center and diameter from three points",
  help: "Touch three points on a bore or boss and get its center and diameter.",
  category: "geometry",
  keywords: ["circle", "3 points", "three point", "center", "radius", "bore", "probe", "indicate"],
  pro: true,
  inputs: [
    { id: "x1", label: "Point 1 X", kind: "length", default: "1", defaultMm: "25" }, { id: "y1", label: "Point 1 Y", kind: "length", default: "0" },
    { id: "x2", label: "Point 2 X", kind: "length", default: "0" }, { id: "y2", label: "Point 2 Y", kind: "length", default: "1", defaultMm: "25" },
    { id: "x3", label: "Point 3 X", kind: "length", default: "-1", defaultMm: "-25" }, { id: "y3", label: "Point 3 Y", kind: "length", default: "0" },
  ],
  compute(v, c) {
    const pts = [[v.x1, v.y1], [v.x2, v.y2], [v.x3, v.y3]];
    const same = [[0, 1], [0, 2], [1, 2]].find(([i, j]) => pts[i][0] === pts[j][0] && pts[i][1] === pts[j][1]);
    if (same) throw new Error(`Point ${same[0] + 1} and point ${same[1] + 1} are the same. Touch three different spots on the circle.`);
    const r = circleThrough3Points(...pts);
    if (!r) throw new Error("Those three points are on a straight line. Touch three spots spread around the circle.");
    const p = lenPlaces(c.units);
    // How much of the circle the points cover: under ~10° a tiny probing error moves the center a long way.
    const span = Math.max(...[[0, 1], [0, 2], [1, 2]].map(([i, j]) => Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])));
    const cover = 2 * Math.asin(Math.min(1, span / r.diameter)) * 180 / Math.PI;
    const warnings = cover < 10 ? [`The points cover only ${fmt(cover, 1)}° of this circle, so they are almost in a line. A small probing error moves the center a lot. Spread the points farther around the circle.`] : [];
    return {
      warnings,
      primary: { label: "Center", text: `X${fmt(r.x, p)} Y${fmt(r.y, p)}`, unit: "" },
      stats: [
        { label: "Diameter", value: r.diameter, unit: c.L.length, places: p },
        { label: "Radius", value: r.radius, unit: c.L.length, places: p },
        { label: "Center X", value: r.x, unit: c.L.length, places: p },
        { label: "Center Y", value: r.y, unit: c.L.length, places: p },
      ],
      source: "geometry",
      explain: [{ title: "Circumcenter", formula: "Solve (x−a)² + (y−b)² = r² for the three points (perpendicular bisectors meet at the center)" }],
      historyLabel: `Ø${fmt(r.diameter, p)} ${c.L.length} at ${fmt(r.x, p)}, ${fmt(r.y, p)} ${c.L.length}`,
    };
  },
});
