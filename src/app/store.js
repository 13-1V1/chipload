// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// On-device persistence: last inputs per calculator, history (20 per tool), favorites.

const P = "chipload.";
const HISTORY_MAX = 20;

function read(key, fallback) {
  try { const raw = localStorage.getItem(P + key); return raw == null ? fallback : JSON.parse(raw); }
  catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(P + key, JSON.stringify(value)); } catch { /* ignore */ }
}

export function loadInputs(calcId) { return read(`inputs.${calcId}`, null); }
export function saveInputs(calcId, values) { write(`inputs.${calcId}`, values); }

export function loadHistory(calcId) { return read(`history.${calcId}`, []); }
export function pushHistory(calcId, entry) {
  const list = loadHistory(calcId).filter((e) => e.key !== entry.key);
  list.unshift({ ...entry, at: Date.now() });
  write(`history.${calcId}`, list.slice(0, HISTORY_MAX));
}
export function clearHistory(calcId) { write(`history.${calcId}`, []); }

export function loadFavorites() { return read("favorites", []); }
export function toggleFavorite(calcId) {
  const list = loadFavorites();
  const next = list.includes(calcId) ? list.filter((id) => id !== calcId) : [...list, calcId];
  write("favorites", next);
  return next.includes(calcId);
}
export function isFavorite(calcId) { return loadFavorites().includes(calcId); }

export function loadRecents() { return read("recents", []); }
export function pushRecent(calcId) {
  const list = [calcId, ...loadRecents().filter((id) => id !== calcId)].slice(0, 8);
  write("recents", list);
}

/** Generic named blob (machines, tools, jobs). */
export function loadBlob(name, fallback) { return read(`blob.${name}`, fallback); }
export function saveBlob(name, value) { write(`blob.${name}`, value); }
