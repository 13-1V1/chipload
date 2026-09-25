// Save only changed forms; preserve the existing keys for installed users.
export function initFormPersistence({ forms, capture, restore }) {
  const dirty = new Set();
  const savedValues = new WeakMap();
  let timer;
  function flush() {
    clearTimeout(timer);
    for (const form of dirty) {
      const value = JSON.stringify(capture(form));
      if (savedValues.get(form) === value) continue;
      try {
        localStorage.setItem(`marcos_persist_${form.id}`, value);
        savedValues.set(form, value);
      } catch {}
    }
    dirty.clear();
  }
  function schedule(form) {
    dirty.add(form);
    clearTimeout(timer);
    timer = setTimeout(flush, 300);
  }
  for (const form of forms) {
    try {
      const saved = localStorage.getItem(`marcos_persist_${form.id}`);
      if (saved) restore(form, JSON.parse(saved));
    } catch {}
    savedValues.set(form, JSON.stringify(capture(form)));
    for (const name of ["input", "change", "reset", "submit", "click"]) {
      form.addEventListener(name, () => queueMicrotask(() => schedule(form)));
    }
  }
  document.addEventListener("form-restored", event => schedule(event.detail));
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
  window.addEventListener("pagehide", flush);
  document.addEventListener("app-before-update", flush);
  return { flush, schedule };
}
