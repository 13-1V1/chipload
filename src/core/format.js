// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Number formatting and shop-style input parsing (fractions, mixed numbers, unit suffixes).

/** Fixed-place format that drops trailing zeros. Non-finite → "—". */
export function fmt(value, places = 3) {
  if (!Number.isFinite(value)) return "—";
  const digits = Math.max(0, Math.min(12, Number(places) || 0));
  const fixed = Number(value).toFixed(digits);
  return digits === 0 ? fixed : fixed.replace(/\.?0+$/, "");
}

/** Parse "3/8", "1 1/4", "-0,5", "0.375" → number. NaN on failure. */
export function parseFraction(value) {
  // A single comma is accepted as a decimal separator, never as a grouping mark.
  const text = String(value ?? "").trim().replace(/^([+-]?\d+),(\d+)$/, "$1.$2");
  if (!text) return NaN;
  const match = text.match(/^([+-])?(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);
  if (match) {
    const sign = match[1] === "-" ? -1 : 1;
    const whole = Number(match[2] || 0);
    const numerator = Number(match[3]);
    const denominator = Number(match[4]);
    if (!denominator) return NaN;
    return sign * (whole + numerator / denominator);
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : NaN;
}

/** Parse a length; an explicit "mm" / "in" / " suffix converts to `expectedUnit`. */
export function parseDimension(value, expectedUnit = "in") {
  let text = String(value ?? "").trim().toLowerCase();
  if (!text) return NaN;
  const suppliedMm = /\bmm\b/.test(text);
  const suppliedIn = /(?:\bin(?:ch(?:es)?)?\b|[\"″])/.test(text);
  text = text
    .replace(/(?:millimeters?|millimetres?|\bmm\b)/g, "")
    .replace(/(?:inches?|\bin\b|[\"″])/g, "")
    .trim();
  const parsed = parseFraction(text);
  if (!Number.isFinite(parsed)) return NaN;
  if (expectedUnit === "in" && suppliedMm) return parsed / 25.4;
  if (expectedUnit === "mm" && suppliedIn) return parsed * 25.4;
  return parsed;
}

export function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

/**
 * Nearest shop fraction (to 1/64) for a decimal inch value.
 * Returns { numerator, denominator, whole, text, error } or null when nothing is within `tolerance`.
 */
export function decimalToFraction(inches, { maxDenominator = 64, tolerance = 0.0005 } = {}) {
  if (!Number.isFinite(inches) || inches < 0) return null;
  for (let d = 1; d <= maxDenominator; d *= 2) {
    const n = Math.round(inches * d);
    if (Math.abs(n / d - inches) < tolerance) {
      const g = gcd(n, d) || 1;
      const sn = n / g, sd = d / g;
      const whole = Math.floor(sn / sd);
      const rem = sn - whole * sd;
      const text = sd === 1 ? `${sn}` : whole > 0 ? `${whole}-${rem}/${sd}` : `${rem}/${sd}`;
      return { numerator: sn, denominator: sd, whole, remainder: rem, text, error: n / d - inches };
    }
  }
  return null;
}

/** Legacy helper: `0.375 → '3/8"'`, null when no clean fraction to 1/64. */
export function decimalToFractionStr(inches) {
  if (!(inches > 0)) return null;
  const f = decimalToFraction(inches);
  if (!f) return null;
  return f.denominator === 1 ? `${f.numerator}"` : `${f.numerator}/${f.denominator}"`;
}

export const degToRad = (d) => d * Math.PI / 180;
export const radToDeg = (r) => r * 180 / Math.PI;
