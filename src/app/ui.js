// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Small shared UI helpers: toast, file save, share, print.

/** Dismissing a share or save sheet is a choice, not a failure. */
const wasCancelled = (e) => e?.name === "AbortError" || /cancel/i.test(String(e?.message ?? e ?? ""));

/**
 * A short message above the answer bar. With `action` it stays longer and carries one button
 * (e.g. Undo) — the way out of a slip of a gloved finger.
 */
export function toast(msg, { action, onAction } = {}) {
  document.querySelectorAll(".copied").forEach((t) => t.remove());
  const t = document.createElement("div");
  t.className = "copied"; t.setAttribute("role", "status");
  t.append(document.createTextNode(msg));
  if (action && onAction) {
    t.classList.add("has-action");
    const b = document.createElement("button");
    b.type = "button"; b.textContent = action;
    b.addEventListener("click", () => { t.remove(); onAction(); });
    t.append(b);
  }
  document.body.append(t);
  setTimeout(() => t.remove(), action ? 6000 : 1700);
}

/** Save text as a file. On Android (Capacitor) window.chiploadNative.saveFile opens the share sheet instead. */
export async function download(filename, text, mime = "text/plain") {
  try {
    if (window.chiploadNative?.saveFile) { await window.chiploadNative.saveFile(filename, text, mime); return; }
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.append(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 0);
  } catch (e) {
    if (!wasCancelled(e)) toast("Couldn't save the file");
  }
}

/** Share a link or text; falls back to the clipboard. */
export async function share({ title, text, url }) {
  try {
    if (window.chiploadNative?.share) { await window.chiploadNative.share({ title, text, url }); return; }
    if (navigator.share) { await navigator.share({ title, text, url }); return; }
    await navigator.clipboard.writeText(url || text);
    toast("Link copied");
  } catch (e) {
    if (!wasCancelled(e)) toast("Couldn't share");
  }
}

/** Run `fn` once the page has been covered by another screen and then shown again. */
function whenBackInFront(fn) {
  let covered = document.visibilityState === "hidden";
  const onChange = () => {
    if (document.visibilityState === "hidden") { covered = true; return; }
    if (!covered) return;
    document.removeEventListener("visibilitychange", onChange);
    fn();
  };
  document.addEventListener("visibilitychange", onChange);
}

/**
 * Print the current screen as a setup sheet (the print stylesheet lays it out).
 * Android's WebView has no window.print — the app's own Print plugin hands the page to the system print dialog.
 */
export async function printScreen(title = "Chipload") {
  const drawers = [...document.querySelectorAll("details.drawer.print")];
  const wasOpen = drawers.map((d) => d.open);
  const restore = () => drawers.forEach((d, i) => { d.open = wasOpen[i]; });
  drawers.forEach((d) => { d.open = true; });
  try {
    if (window.chiploadNative?.print) {
      await window.chiploadNative.print(title);
      // Android's print screen covers the app and lays the page out again every time the paper size or
      // "Save as PDF" is picked, so the drawers stay open until the app is back in front.
      whenBackInFront(restore);
      return;
    }
    if (typeof window.print !== "function") throw new Error("no print support");
    window.addEventListener("afterprint", restore, { once: true });
    window.print();
  } catch {
    restore();
    toast("Printing isn't available on this device");
  }
}
