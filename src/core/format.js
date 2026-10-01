// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Number formatting and shop-style input parsing (fractions, mixed numbers, unit suffixes).

/** Fixed-place format that drops trailing zeros. Non-finite → "—". A value that rounds to zero prints "0", never "-0". */
export function fmt(value, places = 3) {
  if (!Number.isFinite(value)) return "—";
  const digits = Math.max(0, Math.min(12, Number(places) || 0));
  const fixed = Number(value).toFixed(digits);
  const out = digits === 0 ? fixed : fixed.replace(/\.?0+$/, "");
  return out === "-0" ? "0" : out;
}

/** Parse "3/8", "1 1/4", "-0,5", "0.375", "1,200" → number. NaN on failure. */
export function parseFraction(value) {
  let text = String(value ?? "").trim();
  // "1,200" and "12,500.5" are thousands groups, the way they are written in a US shop.
  // Any other single comma is a decimal comma: "0,5", "1,25", "0,125".
  if (/^[+-]?[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(text)) text = text.replace(/,/g, "");
  else text = text.replace(/^([+-]?\d+),(\d+)$/, "$1.$2");
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

// A length may carry its own unit, with or without a space: 10mm, 10 mm, 1/2", 0.5in, 2 inches.
const UNIT_SUFFIX = /^(.*?)\s*(millimeters?|millimetres?|mm|inches|inch|in|["″”])?$/;

/** Parse a length; an explicit mm / in / " suffix converts to `expectedUnit`. NaN on failure. */
export function parseDimension(value, expectedUnit = "in") {
  const m = String(value ?? "").trim().toLowerCase().match(UNIT_SUFFIX);
  if (!m || !m[1]) return NaN;
  const parsed = parseFraction(m[1]);
  if (!Number.isFinite(parsed) || !m[2]) return parsed;
  const suppliedMm = m[2].startsWith("m");
  if (expectedUnit === "in" && suppliedMm) return parsed / 25.4;
  if (expectedUnit === "mm" && !suppliedMm) return parsed * 25.4;
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

/**
 * A number for a G-code word. Always carries a decimal point: on many Fanuc-style controls
 * "X1" means 0.0001 in (or 0.001 mm), not 1.0. Trailing zeros trimmed, one digit kept: 1 → "1.0", -0.5 → "-0.5".
 */
export function gcodeNumber(value, places = 4) {
  let s = Number(value).toFixed(places);
  if (s.includes(".")) s = s.replace(/0+$/, "");
  if (s.endsWith(".")) s += "0";
  if (!s.includes(".")) s += ".0";
  return /^-0\.0$/.test(s) ? "0.0" : s;
}

export const degToRad = (d) => d * Math.PI / 180;
export const radToDeg = (r) => r * 180 / Math.PI;
