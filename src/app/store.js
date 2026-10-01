// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// On-device persistence: last inputs per calculator, history (20 per tool), favorites, shop lists.
// Every reader checks the shape of what comes back: storage can hold anything (an older version's
// data, a half-written value), and a wrong type must fall back to empty instead of crashing a screen.

const P = "chipload.";
const HISTORY_MAX = 20;

function read(key, fallback) {
  try { const raw = localStorage.getItem(P + key); return raw == null ? fallback : JSON.parse(raw); }
  catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(P + key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const readArray = (key) => { const v = read(key, []); return Array.isArray(v) ? v : []; };
const readStrings = (key) => readArray(key).filter((x) => typeof x === "string");
const readObjects = (key) => readArray(key).filter(isObj);

/** { values: {id: text}, units, more } or null. */
export function loadInputs(calcId) {
  const v = read(`inputs.${calcId}`, null);
  if (!isObj(v)) return null;
  const values = {};
  if (isObj(v.values)) for (const [k, x] of Object.entries(v.values)) if (typeof x === "string" || typeof x === "number") values[k] = String(x);
  return { values, units: v.units === "mm" ? "mm" : v.units === "in" ? "in" : undefined, more: v.more === true };
}
export function saveInputs(calcId, state) { write(`inputs.${calcId}`, state); }

export function loadHistory(calcId) {
  return readObjects(`history.${calcId}`).filter((e) => isObj(e.raw)).map((e) => ({ ...e, label: String(e.label ?? ""), primary: String(e.primary ?? ""), units: e.units === "mm" ? "mm" : "in" }));
}
export function pushHistory(calcId, entry) {
  const list = loadHistory(calcId).filter((e) => e.key !== entry.key);
  list.unshift({ ...entry, at: Date.now() });
  write(`history.${calcId}`, list.slice(0, HISTORY_MAX));
}

export function loadFavorites() { return readStrings("favorites"); }
export function toggleFavorite(calcId) {
  const list = loadFavorites();
  const next = list.includes(calcId) ? list.filter((id) => id !== calcId) : [...list, calcId];
  write("favorites", next);
  return next.includes(calcId);
}
export function isFavorite(calcId) { return loadFavorites().includes(calcId); }

export function loadRecents() { return readStrings("recents"); }
export function pushRecent(calcId) {
  write("recents", [calcId, ...loadRecents().filter((id) => id !== calcId)].slice(0, 8));
}

/** Generic named value (flags, an id). Prefer loadList / loadStrings when you expect an array. */
export function loadBlob(name, fallback) { return read(`blob.${name}`, fallback); }
export function saveBlob(name, value) { write(`blob.${name}`, value); }
/** Array of plain objects (machines, tools, jobs); anything else in storage reads as empty. */
export function loadList(name) { return readObjects(`blob.${name}`); }
/** Array of strings (ids). */
export function loadStrings(name) { return readStrings(`blob.${name}`); }
