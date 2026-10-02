// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Hash router. Routes: #/  #/cat/<id>  #/calc/<id>?k=v (charts too)  #/shop[/<id>]  #/settings  #/pro  #/privacy  #/licenses

const handlers = [];
// How many in-app screens sit behind this one. Kept in each history entry, so Back and Forward restore it.
// history.length can't tell: it also counts the pages the tab showed before Chipload.
let depth = 0;
let fired = false; // the first screen of this page load is drawn

export function parseHash(hash = location.hash) {
  const clean = hash.replace(/^#\/?/, "");
  const [pathPart, query = ""] = clean.split("?");
  const segments = pathPart.split("/").filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(query));
  return { segments, params, path: "/" + segments.join("/") };
}

export function navigate(path, params) {
  const q = params && Object.keys(params).length ? "?" + new URLSearchParams(params).toString() : "";
  location.hash = "#" + path + q;
}

/** Show `path` in place of the current entry, so Back skips it (a bad link, or Home when there's nothing behind). */
export function replace(path) {
  history.replaceState({ depth }, "", "#" + path);
  fire();
}

/** The top bar's Back: the previous Chipload screen, or Home — never the page the tab showed before the app. */
export function back() {
  if (depth > 0) history.back();
  else replace("/");
}

export function onRoute(fn) { handlers.push(fn); }

/** Draw the current screen again (Pro just turned on or off). */
export function refresh() { fire(); }

function fire() {
  const saved = history.state?.depth;
  if (Number.isInteger(saved)) depth = saved;
  else {
    // a new entry: one deeper than where we came from (the very first one is 0)
    depth = fired ? depth + 1 : 0;
    try { history.replaceState({ ...(history.state || {}), depth }, ""); } catch { /* history locked: Back falls back to Home */ }
  }
  fired = true;
  handlers.forEach((fn) => fn(parseHash()));
}

export function startRouter() {
  window.addEventListener("hashchange", fire);
  fire();
}
