// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Tolerance stack-up: worst case (arithmetic) and RSS (root sum square).
// Source: ASME Y14.5 stack conventions / Machinery's Handbook "Tolerance Stack-up".

export function toleranceStack(items) {
  const normalized = items.map((item) => ({ nominal: Number(item.nominal) || 0, tolerance: Math.abs(Number(item.tolerance) || 0) }));
  const nominal = normalized.reduce((sum, item) => sum + item.nominal, 0);
  const worstCaseTolerance = normalized.reduce((sum, item) => sum + item.tolerance, 0);
  const rssTolerance = Math.sqrt(normalized.reduce((sum, item) => sum + item.tolerance ** 2, 0));
  return {
    nominal, worstCaseTolerance, rssTolerance,
    worstCaseMin: nominal - worstCaseTolerance, worstCaseMax: nominal + worstCaseTolerance,
    rssMin: nominal - rssTolerance, rssMax: nominal + rssTolerance,
  };
}
