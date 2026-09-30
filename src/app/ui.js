// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Small shared UI helpers: toast, file save, share.

export function toast(msg) {
  document.querySelectorAll(".copied").forEach((t) => t.remove());
  const t = document.createElement("div");
  t.className = "copied"; t.textContent = msg; t.setAttribute("role", "status");
  document.body.append(t);
  setTimeout(() => t.remove(), 1700);
}

/** Save text as a file. On Android (Capacitor) window.chiploadNative.saveFile opens the share sheet instead. */
export function download(filename, text, mime = "text/plain") {
  if (window.chiploadNative?.saveFile) return window.chiploadNative.saveFile(filename, text, mime);
  try {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.append(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 0);
  } catch { toast("Couldn't save file"); }
}

/** Share a link or text; falls back to the clipboard. */
export async function share({ title, text, url }) {
  try {
    if (window.chiploadNative?.share) { await window.chiploadNative.share({ title, text, url }); return; }
    if (navigator.share) { await navigator.share({ title, text, url }); return; }
    await navigator.clipboard.writeText(url || text);
    toast("Link copied");
  } catch (e) {
    if (e?.name !== "AbortError") toast("Couldn't share");
  }
}

/** Print the current screen (drawers open). On Android the native layer takes over if present. */
export function printScreen() {
  if (window.chiploadNative?.print) return window.chiploadNative.print();
  document.querySelectorAll("details.drawer").forEach((d) => { d.dataset.wasOpen = String(d.open); d.open = true; });
  const restore = () => { document.querySelectorAll("details.drawer").forEach((d) => { d.open = d.dataset.wasOpen === "true"; }); window.removeEventListener("afterprint", restore); };
  window.addEventListener("afterprint", restore);
  window.print();
}
