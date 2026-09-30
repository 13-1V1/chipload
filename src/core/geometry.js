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

/** Taper from two diameters over a length. taperPerFoot in in/ft when units "in", mm/300mm when "mm". */
export function taperGeometry({ largeDiameter, smallDiameter, length, units = "in" }) {
  const diameterChange = largeDiameter - smallDiameter;
  const taperPerLength = diameterChange / length;
  const taperPerFoot = units === "in" ? taperPerLength * 12 : taperPerLength * 304.8;
  const halfAngle = radToDeg(Math.atan((diameterChange / 2) / length));
  return { diameterChange, taperPerLength, taperPerFoot, includedAngle: halfAngle * 2, halfAngle };
}
