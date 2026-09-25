export function initPwa({ showToast }) {
  let installPrompt = null;
  const installButton = document.getElementById("installAppBtn");
  const helpButton = document.getElementById("installHelpBtn");
  const help = document.getElementById("installHelp");
  function updateConnection() {
    const online = navigator.onLine;
    document.getElementById("networkStatus")?.classList.toggle("offline", !online);
    document.getElementById("networkStatusText").textContent = online ? "Online" : "Offline";
    document.getElementById("dialogNetworkStatus").textContent = online ? "Online" : "Offline";
  }
  window.addEventListener("online", updateConnection);
  window.addEventListener("offline", updateConnection);
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = false;
    helpButton.textContent = "Install calculator";
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    installButton.hidden = true;
    helpButton.textContent = "Installation help";
    showToast("Calculator installed.");
  });
  async function install() {
    if (!installPrompt) { help.open = true; help.scrollIntoView({ block: "nearest" }); return; }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installButton.hidden = true;
    helpButton.textContent = "Installation help";
  }
  installButton.addEventListener("click", install);
  helpButton.addEventListener("click", install);
  updateConnection();
  if (!("serviceWorker" in navigator)) return;

  let acceptedUpdate = false;
  let reloading = false;
  function showUpdate(worker) {
    if (document.getElementById("pwaUpdateToast")) return;
    const toast = document.createElement("div");
    toast.id = "pwaUpdateToast";
    toast.className = "pwa-toast";
    toast.setAttribute("role", "status");
    toast.innerHTML = '<span class="pwa-toast-text">New version available.</span><button type="button" class="pwa-toast-reload">Update</button><button type="button" class="pwa-toast-dismiss" aria-label="Dismiss update">×</button>';
    document.body.append(toast);
    toast.querySelector(".pwa-toast-reload").addEventListener("click", () => {
      document.dispatchEvent(new Event("app-before-update"));
      acceptedUpdate = true;
      worker.postMessage({ type: "SKIP_WAITING" });
    });
    toast.querySelector(".pwa-toast-dismiss").addEventListener("click", () => toast.remove());
  }
  navigator.serviceWorker.addEventListener("message", event => {
    if (event.data?.type === "APP_VERSION") document.getElementById("offlineCacheStatus").textContent = `Ready · v${event.data.version}`;
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    navigator.serviceWorker.controller?.postMessage({ type: "GET_VERSION" });
    // First installation must not interrupt entry. Other open tabs retain their state.
    if (!acceptedUpdate || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register("./sw.js").then(registration => {
    registration.active?.postMessage({ type: "GET_VERSION" });
    navigator.serviceWorker.ready.then(ready => ready.active?.postMessage({ type: "GET_VERSION" }));
    if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration.waiting);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate(worker);
      });
    });
  }).catch(() => { document.getElementById("offlineCacheStatus").textContent = "Unavailable"; });
}
