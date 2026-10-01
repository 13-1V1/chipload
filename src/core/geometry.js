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

/** Center and radius through three points, or null if collinear. */
export function circleThrough3Points(p1, p2, p3) {
  const [x1, y1] = p1, [x2, y2] = p2, [x3, y3] = p3;
  const determinant = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  if (Math.abs(determinant) < 1e-12) return null;
  const a = x1 * x1 + y1 * y1, b = x2 * x2 + y2 * y2, c = x3 * x3 + y3 * y3;
  const x = (a * (y2 - y3) + b * (y3 - y1) + c * (y1 - y2)) / determinant;
  const y = (a * (x3 - x2) + b * (x1 - x3) + c * (x2 - x1)) / determinant;
  const radius = Math.hypot(x1 - x, y1 - y);
  return { x, y, radius, diameter: radius * 2 };
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
    ({ a, b, A } = p);
    const sinB = b * Math.sin(r(A)) / a;
    if (sinB > 1) throw new Error("No triangle: side a is too short for that angle");
    B = d(Math.asin(sinB)); C = 180 - A - B; c = a * Math.sin(r(C)) / Math.sin(r(A));
    const B2 = 180 - B, C2 = 180 - A - B2;
    if (C2 > 0 && Math.abs(B2 - B) > 1e-9) ambiguous = { a, b, c: a * Math.sin(r(C2)) / Math.sin(r(A)), A, B: B2, C: C2 };
  } else throw new Error("Unsupported triangle mode");
  const area = 0.5 * a * b * Math.sin(r(C));
  return { a, b, c, A, B, C, area, ambiguous };
}

// ── Arc / chord / segment ────────────────────────────────────────────────────
/**
 * Circular segment from any two of: radius R, chord c, height (sagitta) h, central angle θ (deg).
 * Source: Machinery's Handbook "Segments of Circles".
 */
export function circularSegment({ radius, chord, height, angle }) {
  let R = radius, c = chord, h = height, th = angle;
  const r = (d) => d * Math.PI / 180, d = (x) => x * 180 / Math.PI;
  if (Number.isFinite(R) && Number.isFinite(c)) { if (c > 2 * R) throw new Error("Chord can't be longer than the diameter"); th = d(2 * Math.asin(c / (2 * R))); h = R - Math.sqrt(R * R - c * c / 4); }
  else if (Number.isFinite(R) && Number.isFinite(h)) { if (h > 2 * R) throw new Error("Height can't exceed the diameter"); c = 2 * Math.sqrt(2 * R * h - h * h); th = d(2 * Math.acos((R - h) / R)); }
  else if (Number.isFinite(R) && Number.isFinite(th)) { c = 2 * R * Math.sin(r(th) / 2); h = R * (1 - Math.cos(r(th) / 2)); }
  else if (Number.isFinite(c) && Number.isFinite(h)) { R = (c * c / (4 * h) + h) / 2; th = d(2 * Math.asin(c / (2 * R))); }
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
