// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Hash router. Routes: #/  #/cat/<id>  #/calc/<id>?k=v  #/chart/<id>  #/settings  #/shop

const handlers = [];

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

export function back() {
  if (history.length > 1) history.back();
  else navigate("/");
}

export function onRoute(fn) { handlers.push(fn); }

export function startRouter() {
  const fire = () => handlers.forEach((fn) => fn(parseHash()));
  window.addEventListener("hashchange", fire);
  fire();
}
