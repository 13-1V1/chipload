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
  category: "geometry",
  keywords: ["circle", "3 points", "three point", "center", "radius", "bore", "probe", "indicate"],
  pro: true,
  inputs: [
    { id: "x1", label: "Point 1 X", kind: "length", default: "1" }, { id: "y1", label: "Point 1 Y", kind: "length", default: "0" },
    { id: "x2", label: "Point 2 X", kind: "length", default: "0" }, { id: "y2", label: "Point 2 Y", kind: "length", default: "1" },
    { id: "x3", label: "Point 3 X", kind: "length", default: "-1" }, { id: "y3", label: "Point 3 Y", kind: "length", default: "0" },
  ],
  compute(v, c) {
    const r = circleThrough3Points([v.x1, v.y1], [v.x2, v.y2], [v.x3, v.y3]);
    if (!r) throw new Error("Those three points are on a straight line");
    const p = lenPlaces(c.units);
    return {
      primary: { label: "Center", text: `X${fmt(r.x, p)} Y${fmt(r.y, p)}`, unit: "" },
      stats: [
        { label: "Diameter", value: r.diameter, unit: c.L.length, places: p },
        { label: "Radius", value: r.radius, unit: c.L.length, places: p },
        { label: "Center X", value: r.x, unit: c.L.length, places: p },
        { label: "Center Y", value: r.y, unit: c.L.length, places: p },
      ],
      source: "geometry",
      explain: [{ title: "Circumcenter", formula: "Solve (x−a)² + (y−b)² = r² for the three points (perpendicular bisectors meet at the center)" }],
      historyLabel: `Ø${fmt(r.diameter, p)} at ${fmt(r.x, p)}, ${fmt(r.y, p)}`,
    };
  },
});
