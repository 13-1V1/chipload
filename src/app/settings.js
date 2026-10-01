// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// App-wide settings. Imperial and dark are the hard defaults — never inferred from locale.

/** Web copy of the app (GitHub Pages) — shared links open there for people without the app. */
export const SHARE_BASE = "https://13-1v1.github.io/chipload/";

const KEY = "chipload.settings.v1";
const DEFAULTS = Object.freeze({ units: "in", theme: "dark", glove: false, pro: false, places: 4, tips: true });
const listeners = new Set();
let state = load();

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return { ...DEFAULTS }; }
}

export function getSettings() { return state; }

export function setSetting(key, value) {
  state = { ...state, [key]: value };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
  applyTheme();
  listeners.forEach((fn) => fn(state));
}

export function onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = state.theme;
  root.dataset.glove = state.glove ? "on" : "off";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = state.theme === "light" ? "#F4F5F7" : "#121416";
}

export const UNIT_LABEL = Object.freeze({
  in: { length: "in", small: "in", feed: "IPM", feedRev: "IPR", speed: "SFM", area: "in²", volume: "in³/min", weight: "lb", temp: "°F" },
  mm: { length: "mm", small: "mm", feed: "mm/min", feedRev: "mm/rev", speed: "m/min", area: "mm²", volume: "cm³/min", weight: "kg", temp: "°C" },
});
