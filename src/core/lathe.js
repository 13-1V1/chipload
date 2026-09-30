// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Turning math: cycle times, theoretical surface finish, tool-nose-radius compensation.
// Sources: Machinery's Handbook "Estimating Machining Time", "Surface Finish from Feed and Nose Radius",
// and "Tool Nose Radius Compensation" (chamfer/taper start-point tables).

import { degToRad } from "./format.js";

/** Straight turning or boring: minutes = length ÷ (feed/rev × RPM). */
export function turningTime({ length, ipr, rpm }) {
  return length / (ipr * rpm);
}

/** Facing or cutoff at constant RPM: radial travel ÷ (feed/rev × RPM). */
export function facingTimeRpm({ outerDia, innerDia = 0, ipr, rpm }) {
  return ((outerDia - innerDia) / 2) / (ipr * rpm);
}

/**
 * Facing or cutoff under constant surface speed (G96), inch units:
 * t = π (D² − d²) ÷ (48 × SFM × f)  — from ∫ 2πr dr ÷ (12 SFM f).
 */
export function facingTimeCss({ outerDia, innerDia = 0, sfm, ipr }) {
  return (Math.PI * (outerDia ** 2 - innerDia ** 2)) / (48 * sfm * ipr);
}

/**
 * Theoretical finish from feed and nose radius (same length units in, same out).
 * Rt (peak-to-valley) = f² ÷ (8 r);  Ra ≈ f² ÷ (31.2 r);  RMS ≈ 1.11 Ra.
 */
export function surfaceFinish({ feedPerRev, noseRadius }) {
  const rt = feedPerRev ** 2 / (8 * noseRadius);
  const ra = feedPerRev ** 2 / (31.2 * noseRadius);
  return { rt, ra, rms: ra * 1.11 };
}

/** Max feed/rev for a target Ra: f = √(31.2 r Ra). */
export function feedForRa({ ra, noseRadius }) {
  return Math.sqrt(31.2 * noseRadius * ra);
}

/**
 * Tool-nose-radius compensation for a chamfer/taper programmed from the imaginary tip
 * (no G41/G42). θ is the taper angle measured from the Z axis (centerline).
 *   dz = r (1 − tan(θ/2))          shift where the taper meets a diameter
 *   dx = r (1 − tan((90° − θ)/2))  shift (on radius) where the taper meets a face
 *   error = r (sin θ + cos θ − 1)  surface error left if not compensated (perpendicular to the taper)
 */
export function noseRadiusTaperComp({ noseRadius, angleFromZ }) {
  const t = degToRad(angleFromZ);
  return {
    dz: noseRadius * (1 - Math.tan(t / 2)),
    dx: noseRadius * (1 - Math.tan(degToRad((90 - angleFromZ) / 2))),
    error: noseRadius * (Math.sin(t) + Math.cos(t) - 1),
  };
}

/** Radius the nose center follows for an arc of radius R: convex (external corner) R + r, concave (fillet) R − r. */
export function arcCenterPathRadius({ radius, noseRadius, convex }) {
  return convex ? radius + noseRadius : radius - noseRadius;
}
