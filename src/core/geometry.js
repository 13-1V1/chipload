// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Shop trigonometry: right triangle, chamfer depth, 3-point circle, sine bar, taper.
// Source: plain trig; taper per Machinery's Handbook "Tapers" (TPF = 12 × ΔD / L).

import { degToRad, radToDeg } from "./format.js";

/** mode: runRise | hypAngle | runAngle | riseAngle. Angle is the one opposite `rise`, in degrees. */
export function solveRightTriangle(mode, first, second) {
  let run, rise, hypotenuse, angle;
  if (mode === "runRise") {
    run = first; rise = second; hypotenuse = Math.hypot(run, rise); angle = radToDeg(Math.atan2(rise, run));
  } else if (mode === "hypAngle") {
    hypotenuse = first; angle = second; run = hypotenuse * Math.cos(degToRad(angle)); rise = hypotenuse * Math.sin(degToRad(angle));
  } else if (mode === "runAngle") {
    run = first; angle = second; rise = run * Math.tan(degToRad(angle)); hypotenuse = run / Math.cos(degToRad(angle));
  } else if (mode === "riseAngle") {
    rise = first; angle = second; run = rise / Math.tan(degToRad(angle)); hypotenuse = rise / Math.sin(degToRad(angle));
  } else if (mode === "runHyp") {
    run = first; hypotenuse = second; rise = Math.sqrt(Math.max(0, hypotenuse ** 2 - run ** 2)); angle = radToDeg(Math.atan2(rise, run));
  } else if (mode === "riseHyp") {
    rise = first; hypotenuse = second; run = Math.sqrt(Math.max(0, hypotenuse ** 2 - rise ** 2)); angle = radToDeg(Math.atan2(rise, run));
  } else {
    throw new Error("Unsupported triangle mode");
  }
  return { run, rise, hypotenuse, angle, complementaryAngle: 90 - angle, slope: rise / run };
}

/** Axial depth to cut a chamfer between two diameters at an included angle (e.g. 90° countersink). */
export function chamferDepth(smallDiameter, largeDiameter, includedAngleDegrees) {
  return (largeDiameter - smallDiameter) / (2 * Math.tan(degToRad(includedAngleDegrees / 2)));
}

/**
 * Center and radius through three points, or null if they are on a line (or two are the same point).
 * Worked from point 1 so big coordinates don't eat the precision, and the straight-line test is scaled
 * to the spread of the points: |cross| ÷ span² is the same number in inches or mm, at X10 or X1000.
 */
export function circleThrough3Points(p1, p2, p3) {
  const [x1, y1] = p1;
  const bx = p2[0] - x1, by = p2[1] - y1, cx = p3[0] - x1, cy = p3[1] - y1;
  const span2 = Math.max(bx * bx + by * by, cx * cx + cy * cy, (cx - bx) ** 2 + (cy - by) ** 2);
  const cross = bx * cy - by * cx;
  if (!(span2 > 0) || Math.abs(cross) <= 1e-9 * span2) return null;
  const b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (cy * b2 - by * c2) / (2 * cross);
  const uy = (bx * c2 - cx * b2) / (2 * cross);
  const radius = Math.hypot(ux, uy);
  return { x: x1 + ux, y: y1 + uy, radius, diameter: radius * 2 };
}

/** Gauge-block stack for a sine bar: H = L × sin(θ). */
export function sineBarHeight({ barLength, angleDegrees }) {
  return barLength * Math.sin(degToRad(angleDegrees));
}

export function sineBarAngle({ barLength, stackHeight }) {
  if (!(barLength > 0) || Math.abs(stackHeight) > barLength) return NaN;
  return radToDeg(Math.asin(stackHeight / barLength));
}

/**
 * Taper from two diameters over a length (any one length unit).
 * taperPerFoot = 12 × ΔD ÷ L is the inch-shop number; taperRatio is the x in "1 : x" on diameter, the metric way to call it out.
 */
export function taperGeometry({ largeDiameter, smallDiameter, length }) {
  const diameterChange = largeDiameter - smallDiameter;
  const taperPerLength = diameterChange / length;
  const halfAngle = radToDeg(Math.atan((diameterChange / 2) / length));
  return { diameterChange, taperPerLength, taperPerFoot: taperPerLength * 12, taperRatio: length / diameterChange, includedAngle: halfAngle * 2, halfAngle };
}

// ── Oblique (any) triangle ────────────────────────────────────────────────────
/**
 * Solve a general triangle. Sides a, b, c are opposite angles A, B, C (degrees).
 * mode: "SSS" (a,b,c) | "SAS" (a, C, b) | "ASA" (A, c, B) | "AAS" (A, B, a) | "SSA" (a, b, A — may have two solutions)
 * Returns { a, b, c, A, B, C, area, ambiguous?: second solution }.
 */
export function solveTriangle(mode, p) {
  const r = (d) => d * Math.PI / 180, d = (x) => x * 180 / Math.PI;
  const law = (x, y, ang) => Math.sqrt(x * x + y * y - 2 * x * y * Math.cos(r(ang)));
  const angFromSides = (opp, s1, s2) => d(Math.acos((s1 * s1 + s2 * s2 - opp * opp) / (2 * s1 * s2)));
  let a, b, c, A, B, C, ambiguous = null;
  if (mode === "SSS") {
    ({ a, b, c } = p);
    if (a + b <= c || a + c <= b || b + c <= a) throw new Error("Those three sides can't form a triangle");
    A = angFromSides(a, b, c); B = angFromSides(b, a, c); C = 180 - A - B;
  } else if (mode === "SAS") {
    ({ a, b, C } = p);
    c = law(a, b, C); A = angFromSides(a, b, c); B = 180 - A - C;
  } else if (mode === "ASA") {
    ({ A, B, c } = p);
    C = 180 - A - B; if (C <= 0) throw new Error("Angles must add to less than 180°");
    a = c * Math.sin(r(A)) / Math.sin(r(C)); b = c * Math.sin(r(B)) / Math.sin(r(C));
  } else if (mode === "AAS") {
    ({ A, B, a } = p);
    C = 180 - A - B; if (C <= 0) throw new Error("Angles must add to less than 180°");
    b = a * Math.sin(r(B)) / Math.sin(r(A)); c = a * Math.sin(r(C)) / Math.sin(r(A));
  } else if (mode === "SSA") {
    // Two triangles only when A < 90° and b·sin A < a < b (law of sines, ambiguous case). At a = b·sin A
    // there is one, with B = 90°; at a = b there is one, isosceles. Float rounding lands a few parts in
    // 10^16 off those edges, so they are matched with a small relative tolerance, not exactly.
    const EDGE = 1e-12;
    ({ a, b, A } = p);
    let sinB = b * Math.sin(r(A)) / a;
    if (sinB > 1 + EDGE) throw new Error("No triangle: side a is too short for that angle");
    const right = sinB >= 1 - EDGE;
    if (right) sinB = 1;
    B = d(Math.asin(sinB)); C = 180 - A - B; c = a * Math.sin(r(C)) / Math.sin(r(A));
    const B2 = 180 - B, C2 = 180 - A - B2;
    if (!right && A < 90 && a < b * (1 - EDGE) && C2 > 1e-9) ambiguous = { a, b, c: a * Math.sin(r(C2)) / Math.sin(r(A)), A, B: B2, C: C2 };
  } else throw new Error("Unsupported triangle mode");
  const area = 0.5 * a * b * Math.sin(r(C));
  return { a, b, c, A, B, C, area, ambiguous };
}

// ── Arc / chord / segment ────────────────────────────────────────────────────
/**
 * Circular segment from any two of: radius R, chord c, height (sagitta) h, central angle θ (deg).
 * Source: Machinery's Handbook "Segments of Circles".
 * Chord + height pins one arc: when h > R it is more than a half circle, so θ = 2·atan2(c/2, R − h)
 * (= 360° − 2·asin(c/2R) there). Radius + chord fits two arcs; this returns the minor one (θ ≤ 180°),
 * the handbook's convention — the major arc is 360° − θ, height 2R − h.
 */
export function circularSegment({ radius, chord, height, angle }) {
  let R = radius, c = chord, h = height, th = angle;
  const r = (d) => d * Math.PI / 180, d = (x) => x * 180 / Math.PI;
  if (Number.isFinite(R) && Number.isFinite(c)) { if (c > 2 * R) throw new Error("Chord can't be longer than the diameter"); th = d(2 * Math.asin(c / (2 * R))); h = R - Math.sqrt(R * R - c * c / 4); }
  else if (Number.isFinite(R) && Number.isFinite(h)) { if (h > 2 * R) throw new Error("Height can't exceed the diameter"); c = 2 * Math.sqrt(2 * R * h - h * h); th = d(2 * Math.acos((R - h) / R)); }
  else if (Number.isFinite(R) && Number.isFinite(th)) { c = 2 * R * Math.sin(r(th) / 2); h = R * (1 - Math.cos(r(th) / 2)); }
  else if (Number.isFinite(c) && Number.isFinite(h)) { R = (c * c / (4 * h) + h) / 2; th = d(2 * Math.atan2(c / 2, R - h)); }
  else if (Number.isFinite(c) && Number.isFinite(th)) { R = c / (2 * Math.sin(r(th) / 2)); h = R * (1 - Math.cos(r(th) / 2)); }
  else if (Number.isFinite(h) && Number.isFinite(th)) { R = h / (1 - Math.cos(r(th) / 2)); c = 2 * R * Math.sin(r(th) / 2); }
  else throw new Error("Give any two of radius, chord, height, angle");
  const arcLength = R * r(th);
  const area = (R * R / 2) * (r(th) - Math.sin(r(th)));
  return { radius: R, chord: c, height: h, angle: th, arcLength, area };
}

// ── Fillet between two lines ─────────────────────────────────────────────────
/**
 * A fillet of radius r blending two lines that meet at included angle θ (deg):
 * tangent distance from the corner along each line t = r ÷ tan(θ/2), corner-to-center d = r ÷ sin(θ/2).
 */
export function filletTangents({ radius, includedAngle }) {
  const half = (includedAngle / 2) * Math.PI / 180;
  return { tangentDistance: radius / Math.tan(half), cornerToCenter: radius / Math.sin(half), arcAngle: 180 - includedAngle, arcLength: radius * (180 - includedAngle) * Math.PI / 180 };
}
