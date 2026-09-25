import { createResultState } from "./ui-state.js?v=3.2.0";
import { createUnitController } from "./units.js?v=3.2.0";
import { initFormPersistence } from "./persistence.js?v=3.2.0";
import { initMobileUI, initInputHelpers } from "./mobile-ui.js?v=3.2.0";
import { initPwa } from "./pwa.js?v=3.2.0";
import {
  CORE_VERSION,
  CALCULATION_SOURCES,
  fmt,
  parseFraction,
  parseDimension,
  parseThreadSpec,
  tapDrillByPercent,
  mowSolveMExternal,
  mowSolveEExternal,
  mowSolveMInternal,
  mowSolveEInternal,
  radialChipThinningFactor,
  calculateSpeedsFeeds,
  boltCircleCoordinates,
  solveRightTriangle,
  chamferDepth,
  circleThrough3Points,
  tappingFeed,
  threadMilling,
  reamerAllowance,
  sineBarHeight,
  sineBarAngle,
  taperGeometry,
  ballNoseScallopHeight,
  ballNoseStepover,
  toleranceStack
} from "./calc-core.js?v=3.2.0";
(function initTheme(){
  const key = "marcos_calc_theme_mode";
  const btn = document.getElementById("themeToggle");
  const label = document.getElementById("themeLabel");
  function applyTheme(mode){
    document.documentElement.setAttribute("data-theme", mode === "light" ? "light" : "dark");
    label.textContent = mode === "light" ? "Switch to dark mode" : "Switch to light mode";
    btn.setAttribute("aria-label", label.textContent);
    btn.title = label.textContent;
  }
  function nextTheme(current){
    return current === "light" ? "dark" : "light";
  }
  let themeMode = null;
  try { themeMode = localStorage.getItem(key); } catch {}
  if (themeMode !== "light" && themeMode !== "dark"){
    const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    themeMode = prefersLight ? "light" : "dark";
  }
  applyTheme(themeMode);
  btn.addEventListener("click", () => {
    themeMode = nextTheme(themeMode);
    try { localStorage.setItem(key, themeMode); } catch {}
    applyTheme(themeMode);
  });
})();

const unitController = createUnitController();
const gcodePreflightIds = ["bcCheckUnits", "bcCheckOffset", "bcCheckMotion"];
const historyTimers = new Map();
const SQRT3 = Math.sqrt(3);
const BASIC_PITCH_DIAMETER_FACTOR = 0.6495190528;
const BASIC_INTERNAL_MINOR_FACTOR = 1.0825317547;
const toolStateKey = "marcos_calc_active_tool";
const toolCards = Array.from(document.querySelectorAll(".tool-card"));
const navLinks = Array.from(document.querySelectorAll("[data-tool-link]"));
const copyButtons = Array.from(document.querySelectorAll(".copy-btn"));
const desktopGrid = document.querySelector(".desktop-grid");
const results = {
  thread: { shell: document.querySelector("#tool-thread .result-shell"), primary: document.getElementById("threadPrimary"), stats: document.getElementById("threadStats"), details: document.getElementById("threadDetails"), copy: document.getElementById("threadCopy") },
  mow: { shell: document.querySelector("#tool-mow .result-shell"), primary: document.getElementById("mowPrimary"), stats: document.getElementById("mowStats"), details: document.getElementById("mowDetails"), copy: document.getElementById("mowCopy") },
  bolt: { shell: document.querySelector("#tool-bolt .result-shell"), primary: document.getElementById("bcPrimary"), stats: document.getElementById("bcStats"), details: document.getElementById("bcDetails"), copy: document.getElementById("bcCopy") },
  triangle: { shell: document.querySelector("#tool-triangle .result-shell"), primary: document.getElementById("rtPrimary"), stats: document.getElementById("rtStats"), details: document.getElementById("rtDetails"), copy: document.getElementById("rtCopy") },
  feeds: { shell: document.querySelector("#tool-feeds .result-shell"), primary: document.getElementById("sfPrimary"), stats: document.getElementById("sfStats"), details: document.getElementById("sfDetails"), copy: document.getElementById("sfCopy") },
  chamfer: { shell: document.querySelector("#tool-chamfer .result-shell"), primary: document.getElementById("chPrimary"), stats: document.getElementById("chStats"), details: document.getElementById("chDetails"), copy: document.getElementById("chCopy") },
  circle3: { shell: document.querySelector("#tool-circle3 .result-shell"), primary: document.getElementById("c3Primary"), stats: document.getElementById("c3Stats"), details: document.getElementById("c3Details"), copy: document.getElementById("c3Copy") },
  advanced: { shell: document.querySelector("#tool-advanced .result-shell"), primary: document.getElementById("advancedPrimary"), stats: document.getElementById("advancedStats"), details: document.getElementById("advancedDetails"), copy: document.getElementById("advancedCopy") }
};
const resultState = createResultState({
  results, capture: captureFormInputs,
  context: tool => ["feeds", "bolt", "advanced"].includes(tool)
    ? { machine: getActiveMachineProfile(), materials: shopWorkspace.materials, tools: shopWorkspace.tools } : null,
});

function escapeHtml(value){
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
function showWarn(element, message, fieldIds){
  if (element) resultState.warning(element, message, fieldIds);
}
function num(value){
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : parseFraction(value);
}
function fmtDual(value, fromUnit, dp){
  if (!Number.isFinite(value)) return "—";
  if (fromUnit === "in") return `${fmt(value, dp)} in / ${fmt(value * 25.4, 3)} mm`;
  return `${fmt(value, dp)} mm / ${fmt(value / 25.4, 4)} in`;
}
function fmtDualHtml(value, fromUnit, dp){
  if (!Number.isFinite(value)) return "—";
  if (fromUnit === "in") return `${escapeHtml(fmt(value, dp))} in<span class="stat-secondary">/ ${escapeHtml(fmt(value * 25.4, 3))} mm</span>`;
  return `${escapeHtml(fmt(value, dp))} mm<span class="stat-secondary">/ ${escapeHtml(fmt(value / 25.4, 4))} in</span>`;
}
function degToRad(value){ return value * Math.PI / 180; }
function radToDeg(value){ return value * 180 / Math.PI; }
function unitLabel(units){ return units === "in" ? "in" : "mm"; }
function renderStats(items){
  if (!items || !items.length) return "";
  return items.map((item) => {
    const val = item.valueHtml !== undefined ? item.valueHtml : escapeHtml(item.value || "");
    return `<div class="stat-card"><span>${escapeHtml(item.label)}</span><strong>${val}</strong></div>`;
  }).join("");
}
function renderList(items){
  return `<ul class="detail-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}
function renderTextCard(title, paragraphs){
  return `<div class="detail-card"><strong>${escapeHtml(title)}</strong><div class="detail-copy">${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div></div>`;
}
function renderCodeCard(title, body){
  return `<div class="detail-card"><strong>${escapeHtml(title)}</strong><pre>${escapeHtml(body)}</pre></div>`;
}
function renderProvenance(sourceKey){
  const source = CALCULATION_SOURCES[sourceKey];
  if (!source) return "";
  return `<div class="provenance-card"><strong>${escapeHtml(source.title)} · ${escapeHtml(source.confidence)}</strong><span>${escapeHtml(source.source)}</span></div>`;
}
function flashResult(shell){
  if (!shell) return;
  shell.classList.remove("fresh");
  void shell.offsetWidth;
  shell.classList.add("fresh");
  window.setTimeout(() => shell.classList.remove("fresh"), 650);
}
function setResult(toolName, config){
  const target = results[toolName];
  if (!target) return;
  target.primary.textContent = config.primary;
  target.stats.innerHTML = renderStats(config.stats || []);
  target.details.innerHTML = config.detailsHtml || "";
  if (config.copyText){
    target.copy.hidden = false;
    target.copy.dataset.copyText = config.copyText;
  } else {
    target.copy.hidden = true;
    target.copy.dataset.copyText = "";
  }
  const shareBtn = document.querySelector(`[data-share-tool="${toolName}"]`);
  if (shareBtn) shareBtn.hidden = !config.copyText;
  target.shell.classList.toggle("has-result", Boolean(config.copyText));
  if (!config.copyText) target.shell.classList.remove("expanded");
  const detailToggle = target.shell.querySelector(".result-detail-toggle");
  if (detailToggle){
    const expanded = target.shell.classList.contains("expanded");
    detailToggle.setAttribute("aria-expanded", String(expanded));
    detailToggle.textContent = expanded ? "Hide result details" : "Show result details";
  }
  const printBtn = target.shell.querySelector("[data-print]");
  if (printBtn) printBtn.hidden = !config.copyText;
  resultState.rendered(toolName, config);
  if (config.animate && resultState.mode(document.getElementById(`${toolName}Form`)) !== "live") flashResult(target.shell);
  if (config.saveHistory && config.primary && config.formState){
    clearTimeout(historyTimers.get(toolName));
    const save = () => {
      if (!resultState.isCurrent(toolName)) return;
      histSave(toolName, { ts: Date.now(), primary: config.primary, formState: config.formState });
      histRender(toolName);
    };
    if (resultState.mode(document.getElementById(toolName + "Form")) === "live") historyTimers.set(toolName, setTimeout(save, 800));
    else save();
  }
}
Object.values(results).forEach((target) => {
  const head = target.shell?.querySelector(".result-head");
  if (!head) return;
  const detailsButton = document.createElement("button");
  detailsButton.type = "button";
  detailsButton.className = "result-detail-toggle";
  detailsButton.textContent = "Show result details";
  detailsButton.setAttribute("aria-expanded", "false");
  head.after(detailsButton);
  const toggleMobileResult = () => {
    if (!window.matchMedia("(max-width: 620px)").matches || !target.shell.classList.contains("has-result")) return;
    const expanded = target.shell.classList.toggle("expanded");
    detailsButton.setAttribute("aria-expanded", String(expanded));
    detailsButton.textContent = expanded ? "Hide result details" : "Show result details";
  };
  head.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    toggleMobileResult();
  });
  detailsButton.addEventListener("click", toggleMobileResult);
});

// ── Local shop workspace: machines, tools, materials, and saved setups ──
const WORKSPACE_KEY = "marcos_shop_workspace_v3";
const emptyWorkspace = () => ({ machines: [], tools: [], materials: [], jobs: [], activeMachineId: null });
function makeId(prefix){
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function loadWorkspace(){
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKSPACE_KEY));
    if (parsed && typeof parsed === "object"){
      const hydrated = { ...emptyWorkspace(), ...parsed };
      ["machines", "tools", "materials", "jobs"].forEach((key) => { if (!Array.isArray(hydrated[key])) hydrated[key] = []; });
      return hydrated;
    }
  } catch {}
  return emptyWorkspace();
}
let shopWorkspace = loadWorkspace();
function saveWorkspace(){
  try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(shopWorkspace)); } catch {}
  refreshWorkspaceUI();
  ["feeds", "bolt", "advanced"].forEach(tool => { if (results[tool].snapshot) resultState.isCurrent(tool); });
}
function getActiveMachineProfile(){
  return shopWorkspace.machines.find((item) => item.id === shopWorkspace.activeMachineId) || null;
}
function machineFeedLimit(machine, targetUnits){
  if (!machine || !(machine.maxFeed > 0)) return Infinity;
  if (machine.units === targetUnits) return machine.maxFeed;
  return targetUnits === "in" ? machine.maxFeed / 25.4 : machine.maxFeed * 25.4;
}
function getWorkspaceMaterialDefaults(value){
  if (!String(value).startsWith("user:")) return null;
  const item = shopWorkspace.materials.find((candidate) => candidate.id === String(value).slice(5));
  return item ? { sfm: item.sfm, chipIn: item.chipIn } : null;
}
function workspaceMaterialLabel(value){
  if (!String(value).startsWith("user:")) return null;
  return shopWorkspace.materials.find((candidate) => candidate.id === String(value).slice(5))?.name || "Saved material";
}
function machineLimitCopy(machine){
  if (!machine) return "Open Shop setup to select a machine profile.";
  return `${machine.maxRpm ? `${fmt(machine.maxRpm, 0)} RPM` : "No RPM cap"} · ${machine.maxFeed ? `${fmt(machine.maxFeed, 2)} ${machine.units === "in" ? "IPM" : "mm/min"}` : "No feed cap"} · ${machine.controller.toUpperCase()} ${machine.workOffset}`;
}
function refreshWorkspaceUI(){
  const machineList = document.getElementById("machineProfileList");
  const toolList = document.getElementById("toolProfileList");
  const materialList = document.getElementById("materialProfileList");
  const jobList = document.getElementById("jobSetupList");
  if (!machineList) return;
  const activeMachine = getActiveMachineProfile();
  machineList.innerHTML = shopWorkspace.machines.length ? shopWorkspace.machines.map((item) => `<div class="library-item"><div class="library-item-copy"><strong>${escapeHtml(item.name)}${item.id === shopWorkspace.activeMachineId ? " · Active" : ""}</strong><span>${escapeHtml(machineLimitCopy(item))}</span></div><div class="library-actions"><button class="mini-btn" type="button" data-library="machine" data-action="activate" data-id="${escapeHtml(item.id)}">Use</button><button class="mini-btn danger" type="button" data-library="machine" data-action="delete" data-id="${escapeHtml(item.id)}">Delete</button></div></div>`).join("") : `<div class="hint">No machine profiles yet.</div>`;
  toolList.innerHTML = shopWorkspace.tools.length ? shopWorkspace.tools.map((item) => `<div class="library-item"><div class="library-item-copy"><strong>${escapeHtml(item.name)}</strong><span>Ø ${escapeHtml(fmt(item.diameter, 4))} ${escapeHtml(item.units)} · ${escapeHtml(String(item.flutes))} flutes${item.sfm ? ` · ${escapeHtml(fmt(item.sfm, 0))} SFM` : ""}</span></div><div class="library-actions"><button class="mini-btn" type="button" data-library="tool" data-action="apply" data-id="${escapeHtml(item.id)}">Apply</button><button class="mini-btn danger" type="button" data-library="tool" data-action="delete" data-id="${escapeHtml(item.id)}">Delete</button></div></div>`).join("") : `<div class="hint">No saved tools yet.</div>`;
  materialList.innerHTML = shopWorkspace.materials.length ? shopWorkspace.materials.map((item) => `<div class="library-item"><div class="library-item-copy"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(fmt(item.sfm, 0))} SFM · ${escapeHtml(fmt(item.chipIn, 5))} in/tooth</span></div><div class="library-actions"><button class="mini-btn" type="button" data-library="material" data-action="apply" data-id="${escapeHtml(item.id)}">Apply</button><button class="mini-btn danger" type="button" data-library="material" data-action="delete" data-id="${escapeHtml(item.id)}">Delete</button></div></div>`).join("") : `<div class="hint">No custom materials yet.</div>`;
  jobList.innerHTML = shopWorkspace.jobs.length ? shopWorkspace.jobs.map((item) => `<div class="library-item"><div class="library-item-copy"><strong>${escapeHtml(item.name || "Untitled setup")}</strong><span>${escapeHtml(item.partNumber || "No part number")} · ${new Date(item.savedAt).toLocaleString()}</span></div><div class="library-actions"><button class="mini-btn" type="button" data-library="job" data-action="restore" data-id="${escapeHtml(item.id)}">Restore</button><button class="mini-btn danger" type="button" data-library="job" data-action="delete" data-id="${escapeHtml(item.id)}">Delete</button></div></div>`).join("") : `<div class="hint">No saved setups yet.</div>`;

  const toolSelect = document.getElementById("sfSavedTool");
  if (toolSelect){
    const selected = toolSelect.value;
    toolSelect.innerHTML = `<option value="">Manual tool values</option>${shopWorkspace.tools.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}`;
    if ([...toolSelect.options].some((option) => option.value === selected)) toolSelect.value = selected;
  }
  const materialSelect = document.getElementById("sfMaterial");
  if (materialSelect){
    const selected = materialSelect.value;
    materialSelect.querySelectorAll("option[data-user-material]").forEach((option) => option.remove());
    shopWorkspace.materials.forEach((item) => {
      const option = document.createElement("option");
      option.value = `user:${item.id}`;
      option.textContent = `${item.name} (saved)`;
      option.dataset.userMaterial = "";
      materialSelect.appendChild(option);
    });
    if ([...materialSelect.options].some(option => option.value === selected)) materialSelect.value = selected;
  }
  const setupSummary = document.getElementById("sfSetupSummary");
  if (setupSummary) setupSummary.textContent = `${document.getElementById("sfOperation").selectedOptions[0].text} · ${activeMachine ? activeMachine.name + " · " + machineLimitCopy(activeMachine) : "No machine limit"}`;
  document.getElementById("activeMachineName").textContent = activeMachine ? activeMachine.name : "No machine limit";
  document.getElementById("activeMachineLimits").textContent = machineLimitCopy(activeMachine);
  document.getElementById("coreVersionLabel").textContent = CORE_VERSION;
  document.getElementById("dialogNetworkStatus").textContent = navigator.onLine ? "Online" : "Offline";
  applyActiveMachineToGcode(false);
}
function applyToolProfile(id){
  const item = shopWorkspace.tools.find((candidate) => candidate.id === id);
  if (!item) return;
  const targetUnits = document.getElementById("sfUnits").value;
  const diameter = item.units === targetUnits ? item.diameter : (targetUnits === "in" ? item.diameter / 25.4 : item.diameter * 25.4);
  document.getElementById("sfSavedTool").value = item.id;
  document.getElementById("sfTool").value = item.type;
  document.getElementById("sfDiameter").value = fmt(diameter, targetUnits === "in" ? 4 : 3);
  document.getElementById("sfFlutes").value = item.flutes;
  document.getElementById("sfSpeed").value = item.sfm ? (targetUnits === "in" ? fmt(item.sfm, 1) : fmt(item.sfm * 0.3048, 1)) : "";
  document.getElementById("sfChipLoad").value = item.chipIn ? (targetUnits === "in" ? fmt(item.chipIn, 5) : fmt(item.chipIn * 25.4, 4)) : "";
  sfSyncUnitLabels();
  document.getElementById("sfDiameter").dispatchEvent(new Event("input", { bubbles: true }));
  showToast(`${item.name} applied to Speeds & Feeds.`);
}
refreshWorkspaceUI();

(function initWorkspaceDialog(){
  const dialog = document.getElementById("workspaceDialog");
  const tabs = [...dialog.querySelectorAll("[data-workspace-tab]")];
  const panels = [...dialog.querySelectorAll("[data-workspace-panel]")];
  let activeWorkspaceTab = "machines";
  function setWorkspaceTab(name, { focus = false } = {}){
    if (!tabs.some((tab) => tab.dataset.workspaceTab === name)) return;
    activeWorkspaceTab = name;
    document.getElementById("workspaceSectionPicker").value = name;
    tabs.forEach((tab) => {
      const active = tab.dataset.workspaceTab === name;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active){
        tab.scrollIntoView({ block: "nearest", inline: "nearest" });
        if (focus) tab.focus();
      }
    });
    panels.forEach((panel) => { panel.hidden = panel.dataset.workspacePanel !== name; });
    dialog.querySelector(".dialog-body")?.scrollTo({ top: 0, behavior: "auto" });
  }
  document.getElementById("workspaceSectionPicker").addEventListener("change", event => setWorkspaceTab(event.target.value));
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => setWorkspaceTab(tab.dataset.workspaceTab));
    tab.addEventListener("keydown", (event) => {
      let nextIndex = null;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabs.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      setWorkspaceTab(tabs[nextIndex].dataset.workspaceTab, { focus: true });
    });
  });
  document.getElementById("workspaceBtn").addEventListener("click", () => {
    refreshWorkspaceUI();
    document.body.classList.add("dialog-open");
    dialog.showModal();
    setWorkspaceTab(activeWorkspaceTab);
  });
  document.getElementById("workspaceClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => document.body.classList.remove("dialog-open"));

  document.getElementById("machineProfileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const units = document.getElementById("machineUnits").value;
    const safeZ = parseDimension(document.getElementById("machineSafeZ").value, units);
    const machine = { id: makeId("machine"), name: document.getElementById("machineName").value.trim(), units, maxRpm: num(document.getElementById("machineMaxRpm").value), maxFeed: num(document.getElementById("machineMaxFeed").value), controller: document.getElementById("machineController").value, workOffset: document.getElementById("machineWorkOffset").value, safeZ: Number.isFinite(safeZ) ? safeZ : 0 };
    if (!machine.name || !(machine.maxRpm > 0) || !(machine.maxFeed > 0)){ showToast("Enter a machine name and positive RPM/feed limits."); return; }
    shopWorkspace.machines.push(machine);
    shopWorkspace.activeMachineId = machine.id;
    event.target.reset();
    saveWorkspace();
  });
  document.getElementById("toolProfileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const units = document.getElementById("toolProfileUnits").value;
    const tool = { id: makeId("tool"), name: document.getElementById("toolProfileName").value.trim(), units, type: document.getElementById("toolProfileType").value, diameter: parseDimension(document.getElementById("toolProfileDiameter").value, units), flutes: num(document.getElementById("toolProfileFlutes").value), sfm: num(document.getElementById("toolProfileSfm").value) / (units === "mm" ? 0.3048 : 1), chipIn: parseDimension(document.getElementById("toolProfileChip").value || "0", units) / (units === "mm" ? 25.4 : 1) };
    if (!tool.name || !(tool.diameter > 0) || !(tool.flutes >= 1)){ showToast("Enter a tool name, diameter, and flute count."); return; }
    if (!Number.isFinite(tool.sfm)) tool.sfm = 0;
    if (!Number.isFinite(tool.chipIn)) tool.chipIn = 0;
    shopWorkspace.tools.push(tool);
    event.target.reset();
    saveWorkspace();
  });
  document.getElementById("materialProfileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const material = { id: makeId("material"), name: document.getElementById("materialProfileName").value.trim(), sfm: num(document.getElementById("materialProfileSfm").value), chipIn: parseDimension(document.getElementById("materialProfileChip").value, "in") };
    if (!material.name || !(material.sfm > 0) || !(material.chipIn > 0)){ showToast("Enter a material name, positive SFM, and chip load."); return; }
    shopWorkspace.materials.push(material);
    event.target.reset();
    saveWorkspace();
  });
  document.getElementById("saveJobSetup").addEventListener("click", () => {
    const forms = {};
    ["threadForm","mowForm","boltForm","triangleForm","feedsForm","chamferForm","circle3Form","advancedForm"].forEach((id) => {
      const form = document.getElementById(id);
      if (form) forms[id] = captureFormInputs(form);
    });
    shopWorkspace.jobs.unshift({ id: makeId("job"), name: document.getElementById("jobName").value.trim(), partNumber: document.getElementById("jobPartNumber").value.trim(), notes: document.getElementById("jobNotes").value.trim(), savedAt: Date.now(), activeTool: toolCards.find((card) => card.classList.contains("active-tool"))?.dataset.tool || "thread", forms });
    shopWorkspace.jobs = shopWorkspace.jobs.slice(0, 25);
    saveWorkspace();
    showToast("Current setup saved.");
  });
  dialog.addEventListener("click", (event) => {
    const button = event.target.closest("[data-library][data-action]");
    if (!button) return;
    const { library, action, id } = button.dataset;
    const key = library === "machine" ? "machines" : library === "tool" ? "tools" : library === "material" ? "materials" : "jobs";
    if (action === "delete"){
      shopWorkspace[key] = shopWorkspace[key].filter((item) => item.id !== id);
      if (shopWorkspace.activeMachineId === id) shopWorkspace.activeMachineId = null;
      saveWorkspace();
      return;
    }
    if (library === "machine" && action === "activate"){
      shopWorkspace.activeMachineId = id;
      const machine = getActiveMachineProfile();
      if (machine){
        ["sfUnits", "bcUnits", "advancedUnits"].forEach(id => unitController.set(id, machine.units, { emit: true }));
      }
      saveWorkspace();
    } else if (library === "tool" && action === "apply"){
      applyToolProfile(id);
      dialog.close();
      openTool("feeds", { scroll: true });
    } else if (library === "material" && action === "apply"){
      document.getElementById("sfMaterial").value = `user:${id}`;
      document.getElementById("sfMaterial").dispatchEvent(new Event("change", { bubbles: true }));
      dialog.close();
      openTool("feeds", { scroll: true });
    } else if (library === "job" && action === "restore"){
      const job = shopWorkspace.jobs.find((item) => item.id === id);
      if (!job) return;
      Object.entries(job.forms || {}).forEach(([formId, state]) => {
        const form = document.getElementById(formId);
        if (form) restoreFormInputs(form, state);
      });
      document.getElementById("jobName").value = job.name || "";
      document.getElementById("jobPartNumber").value = job.partNumber || "";
      document.getElementById("jobNotes").value = job.notes || "";
      dialog.close();
      openTool(job.activeTool || "thread", { scroll: true });
      showToast("Saved setup restored.");
    }
  });
  document.getElementById("sfSavedTool").addEventListener("change", (event) => { if (event.target.value) applyToolProfile(event.target.value); });
  document.getElementById("exportWorkspace").addEventListener("click", () => triggerDownload(`marcos-workspace-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify({ version: CORE_VERSION, exportedAt: new Date().toISOString(), workspace: shopWorkspace }, null, 2), "application/json"));
  document.getElementById("importWorkspace").addEventListener("click", () => document.getElementById("workspaceImportFile").click());
  document.getElementById("workspaceImportFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const incoming = payload.workspace || payload;
      if (!incoming || !Array.isArray(incoming.machines) || !Array.isArray(incoming.tools) || !Array.isArray(incoming.materials) || !Array.isArray(incoming.jobs)) throw new Error("Invalid workspace file");
      shopWorkspace = { ...emptyWorkspace(), ...incoming };
      saveWorkspace();
      showToast("Workspace imported.");
    } catch { showToast("Workspace import failed."); }
    event.target.value = "";
  });
})();
async function writeClipboard(text){
  if (navigator.clipboard && navigator.clipboard.writeText){
    await navigator.clipboard.writeText(text);
    return;
  }
  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.style.position = "absolute";
  helper.style.left = "-9999px";
  document.body.appendChild(helper);
  helper.select();
  document.execCommand("copy");
  document.body.removeChild(helper);
}
copyButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const original = button.textContent;
    const text = button.dataset.copyText || "";
    if (!text) return;
    button.classList.remove("copied", "failed");
    try {
      await writeClipboard(text);
      button.textContent = "Copied";
      button.classList.add("copied");
      window.setTimeout(() => {
        button.textContent = original;
        button.classList.remove("copied");
      }, 1400);
    } catch {
      button.textContent = "Copy failed";
      button.classList.add("failed");
      window.setTimeout(() => {
        button.textContent = original;
        button.classList.remove("failed");
      }, 1600);
    }
  });
});

function updateStickyMetrics(){
  document.documentElement.style.setProperty("--header-height", `${document.getElementById("siteHeader").offsetHeight}px`);
  document.documentElement.style.setProperty("--nav-height", `${document.getElementById("sectionNav").offsetHeight}px`);
}
function setActiveNav(toolName){
  navLinks.forEach((link) => link.classList.toggle("active", link.dataset.toolLink === toolName));
  toolCards.forEach((card) => card.classList.toggle("active-tool", card.dataset.tool === toolName));
  const picker = document.getElementById("mobileToolPicker");
  if (picker && picker.value !== toolName) picker.value = toolName;
}
function isMobileLayout(){
  return window.matchMedia("(max-width: 820px)").matches;
}
const VIEW_MODE_KEY = "marcos_view_mode"; // "focus" | "multi"
function getViewMode(){
  let saved = null;
  try { saved = localStorage.getItem(VIEW_MODE_KEY); } catch {}
  return saved === "multi" ? "multi" : "focus";
}
function setViewMode(mode, { reapply = true } = {}){
  const val = mode === "multi" ? "multi" : "focus";
  try { localStorage.setItem(VIEW_MODE_KEY, val); } catch {}
  desktopGrid.classList.toggle("single-panel", val === "focus");
  const btn = document.getElementById("viewModeToggle");
  const label = document.getElementById("viewModeLabel");
  if (btn) btn.setAttribute("aria-pressed", val === "multi" ? "true" : "false");
  if (label) label.textContent = val === "multi" ? "Focus" : "Multi-panel";
  if (reapply){
    const activeCard = toolCards.find((c) => c.classList.contains("active-tool")) || toolCards[0];
    if (activeCard) applyToolState(activeCard.dataset.tool);
  }
}
function applyToolState(toolName){
  const mobile = isMobileLayout();
  const viewMode = getViewMode();
  const multiDesktop = !mobile && viewMode === "multi";
  toolCards.forEach((card) => {
    const isTarget = card.dataset.tool === toolName;
    const body = card.querySelector(".tool-body");
    const toggle = card.querySelector(".tool-toggle");
    card.hidden = mobile ? !isTarget : (multiDesktop ? false : !isTarget);
    // In multi-panel desktop mode, all visible cards are open; in other modes only the active is open.
    const shouldBeOpen = multiDesktop ? true : isTarget;
    card.classList.toggle("open", shouldBeOpen);
    if (toggle) toggle.setAttribute("aria-expanded", String(shouldBeOpen));
    body.inert = !shouldBeOpen;
    body.setAttribute("aria-hidden", shouldBeOpen ? "false" : "true");
  });
  setActiveNav(toolName);
  try { localStorage.setItem(toolStateKey, toolName); } catch {}
  document.dispatchEvent(new Event("tool-change"));
}
function setCardOpen(card, open){
  const body = card.querySelector(".tool-body");
  const toggle = card.querySelector(".tool-toggle");
  card.classList.toggle("open", open);
  if (toggle) toggle.setAttribute("aria-expanded", String(open));
  if (body){
    body.inert = !open;
    body.setAttribute("aria-hidden", open ? "false" : "true");
  }
}
function openTool(toolName, options = {}){
  const shouldScroll = Boolean(options.scroll);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shouldAnimate = options.animate !== false && !reduceMotion && typeof document.startViewTransition === "function";
  if (shouldAnimate){
    document.startViewTransition(() => {
      applyToolState(toolName);
    });
  } else {
    applyToolState(toolName);
  }
  if (shouldScroll){
    document.getElementById(`tool-${toolName}`).scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
function toggleTool(toolName){
  const card = toolCards.find((c) => c.dataset.tool === toolName);
  if (!card) return;
  if (!isMobileLayout()){
    openTool(toolName, { scroll: true });
    return;
  }
  if (card.classList.contains("open")){
    // Collapse without switching active tool
    setCardOpen(card, false);
  } else {
    openTool(toolName, { scroll: true });
  }
}
document.querySelectorAll("[data-tool-toggle]").forEach((btn) => {
  btn.addEventListener("click", () => {
    toggleTool(btn.dataset.toolToggle);
  });
});
// Re-apply layout state when crossing the mobile/desktop breakpoint
let wasMobile = isMobileLayout();
window.addEventListener("resize", () => {
  const nowMobile = isMobileLayout();
  if (nowMobile !== wasMobile){
    wasMobile = nowMobile;
    const activeCard = toolCards.find((c) => c.classList.contains("active-tool")) || toolCards[0];
    if (activeCard) applyToolState(activeCard.dataset.tool);
  }
});
function syncAccordionState(){
  let savedTool = null;
  try { savedTool = localStorage.getItem(toolStateKey); } catch {}
  const fallbackTool = document.querySelector('[data-tool="thread"]').dataset.tool;
  const toolName = toolCards.some((card) => card.dataset.tool === savedTool) ? savedTool : fallbackTool;
  openTool(toolName, { animate: false });
}
navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const toolName = link.dataset.toolLink;
    openTool(toolName, { scroll: true });
  });
});
document.getElementById("mobileToolPicker")?.addEventListener("change", (event) => {
  openTool(event.target.value, { scroll: true });
});
// Initialize desktop view mode (focus vs multi-panel). Don't reapply yet — syncAccordionState will.
setViewMode(getViewMode(), { reapply: false });
const viewModeBtn = document.getElementById("viewModeToggle");
if (viewModeBtn){
  viewModeBtn.addEventListener("click", () => {
    setViewMode(getViewMode() === "multi" ? "focus" : "multi");
  });
}
window.addEventListener("resize", updateStickyMetrics);
new ResizeObserver(updateStickyMetrics).observe(document.getElementById("siteHeader"));
new ResizeObserver(updateStickyMetrics).observe(document.getElementById("sectionNav"));
updateStickyMetrics();
syncAccordionState();

// ── Scroll-spy (multi-panel desktop only) ──
// Highlights the nav link whose tool card is closest to the viewport center.
// Only meaningful when every card is on-screen at once; in Focus/mobile it's a no-op.
(function initScrollSpy(){
  if (typeof IntersectionObserver !== "function") return;
  let observer = null;
  let scrollSpyEnabled = false;
  let clickLock = 0; // suppress spy updates right after a nav-click scroll
  // Track intersection ratios so we can pick the "most visible" card on each tick.
  const ratios = new Map();
  function onObserve(entries){
    if (!scrollSpyEnabled) return;
    entries.forEach(e => ratios.set(e.target, e.isIntersecting ? e.intersectionRatio : 0));
    if (performance.now() < clickLock) return;
    let best = null, bestRatio = 0;
    ratios.forEach((r, el) => {
      if (r > bestRatio){ bestRatio = r; best = el; }
    });
    if (best && bestRatio > 0){
      const toolName = best.dataset.tool;
      if (toolName){
        setActiveNav(toolName);
        try { localStorage.setItem(toolStateKey, toolName); } catch {}
      }
    }
  }
  function enable(){
    if (scrollSpyEnabled) return;
    scrollSpyEnabled = true;
    observer = new IntersectionObserver(onObserve, {
      // Band focused around the viewport middle so scroll-spy picks the
      // card the user is actually reading, not whatever is off-frame.
      rootMargin: "-35% 0px -45% 0px",
      threshold: [0, 0.25, 0.5, 0.75, 1]
    });
    toolCards.forEach(card => observer.observe(card));
  }
  function disable(){
    if (!scrollSpyEnabled) return;
    scrollSpyEnabled = false;
    if (observer){ observer.disconnect(); observer = null; }
    ratios.clear();
  }
  function sync(){
    const multiDesktop = !isMobileLayout() && getViewMode() === "multi";
    if (multiDesktop) enable(); else disable();
  }
  sync();
  window.addEventListener("resize", sync);
  // Hook the view-mode and nav-click flows so scroll-spy follows state changes
  const vmBtn = document.getElementById("viewModeToggle");
  if (vmBtn) vmBtn.addEventListener("click", () => { setTimeout(sync, 0); });
  navLinks.forEach(link => {
    link.addEventListener("click", () => {
      // When the user clicks a nav link we do a smooth scroll; lock out the
      // spy for ~700ms so it doesn't yank the active state mid-animation.
      clickLock = performance.now() + 700;
    });
  });
})();

const WIRE_SET_INCH = [0.010,0.012,0.014,0.016,0.018,0.020,0.022,0.024,0.025,0.026,0.028,0.030,0.032,0.035,0.040,0.045,0.050,0.055,0.060,0.063,0.070,0.080,0.090,0.100];
const WIRE_SET_MM = [0.25,0.30,0.35,0.40,0.45,0.50,0.60,0.70,0.80,0.90,1.00,1.10,1.20,1.30,1.40,1.50,1.60,1.70,1.80,2.00];

// Reverse thread lookup tables — [major_in, tpi, standard_name]
const UN_THREAD_TABLE = [
  [0.0600,80,"#0-80 UNF"],[0.0730,64,"#1-64 UNC"],[0.0730,72,"#1-72 UNF"],
  [0.0860,56,"#2-56 UNC"],[0.0860,64,"#2-64 UNF"],[0.0990,48,"#3-48 UNC"],
  [0.0990,56,"#3-56 UNF"],[0.1120,40,"#4-40 UNC"],[0.1120,48,"#4-48 UNF"],
  [0.1250,40,"#5-40 UNC"],[0.1250,44,"#5-44 UNF"],[0.1380,32,"#6-32 UNC"],
  [0.1380,40,"#6-40 UNF"],[0.1640,32,"#8-32 UNC"],[0.1640,36,"#8-36 UNF"],
  [0.1900,24,"#10-24 UNC"],[0.1900,32,"#10-32 UNF"],[0.2160,24,"#12-24 UNC"],
  [0.2160,28,"#12-28 UNF"],[0.2500,20,"1/4-20 UNC"],[0.2500,28,"1/4-28 UNF"],
  [0.3125,18,"5/16-18 UNC"],[0.3125,24,"5/16-24 UNF"],[0.3750,16,"3/8-16 UNC"],
  [0.3750,24,"3/8-24 UNF"],[0.4375,14,"7/16-14 UNC"],[0.4375,20,"7/16-20 UNF"],
  [0.5000,13,"1/2-13 UNC"],[0.5000,20,"1/2-20 UNF"],[0.5625,12,"9/16-12 UNC"],
  [0.5625,18,"9/16-18 UNF"],[0.6250,11,"5/8-11 UNC"],[0.6250,18,"5/8-18 UNF"],
  [0.7500,10,"3/4-10 UNC"],[0.7500,16,"3/4-16 UNF"],[0.8750,9,"7/8-9 UNC"],
  [0.8750,14,"7/8-14 UNF"],[1.0000,8,"1-8 UNC"],[1.0000,12,"1-12 UNF"],
  [1.0000,14,"1-14 UNEF"],[1.1250,7,"1-1/8-7 UNC"],[1.1250,12,"1-1/8-12 UNF"],
  [1.2500,7,"1-1/4-7 UNC"],[1.2500,12,"1-1/4-12 UNF"],[1.3750,6,"1-3/8-6 UNC"],
  [1.3750,12,"1-3/8-12 UNF"],[1.5000,6,"1-1/2-6 UNC"],[1.5000,12,"1-1/2-12 UNF"]
];

// [major_mm, pitch_mm, standard_name]
const METRIC_THREAD_TABLE = [
  [1.0,0.25,"M1x0.25"],[1.2,0.25,"M1.2x0.25"],[1.4,0.3,"M1.4x0.3"],[1.6,0.35,"M1.6x0.35"],
  [1.8,0.35,"M1.8x0.35"],[2.0,0.4,"M2x0.4"],[2.5,0.45,"M2.5x0.45"],[3.0,0.5,"M3x0.5"],
  [3.5,0.6,"M3.5x0.6"],[4.0,0.7,"M4x0.7"],[5.0,0.8,"M5x0.8"],[6.0,1.0,"M6x1"],
  [7.0,1.0,"M7x1"],[8.0,1.25,"M8x1.25"],[8.0,1.0,"M8x1 (fine)"],[10.0,1.5,"M10x1.5"],
  [10.0,1.25,"M10x1.25 (fine)"],[10.0,1.0,"M10x1 (extra fine)"],[12.0,1.75,"M12x1.75"],
  [12.0,1.25,"M12x1.25 (fine)"],[14.0,2.0,"M14x2"],[14.0,1.5,"M14x1.5 (fine)"],
  [16.0,2.0,"M16x2"],[16.0,1.5,"M16x1.5 (fine)"],[18.0,2.5,"M18x2.5"],[18.0,1.5,"M18x1.5 (fine)"],
  [20.0,2.5,"M20x2.5"],[20.0,1.5,"M20x1.5 (fine)"],[22.0,2.5,"M22x2.5"],[22.0,1.5,"M22x1.5 (fine)"],
  [24.0,3.0,"M24x3"],[24.0,2.0,"M24x2 (fine)"],[27.0,3.0,"M27x3"],[27.0,2.0,"M27x2 (fine)"],
  [30.0,3.5,"M30x3.5"],[30.0,2.0,"M30x2 (fine)"],[33.0,3.5,"M33x3.5"],[33.0,2.0,"M33x2 (fine)"],
  [36.0,4.0,"M36x4"],[36.0,3.0,"M36x3 (fine)"],[39.0,4.0,"M39x4"],[39.0,3.0,"M39x3 (fine)"],
  [42.0,4.5,"M42x4.5"],[42.0,3.0,"M42x3 (fine)"],[45.0,4.5,"M45x4.5"],[45.0,3.0,"M45x3 (fine)"],
  [48.0,5.0,"M48x5"],[48.0,3.0,"M48x3 (fine)"],[52.0,5.0,"M52x5"],[52.0,4.0,"M52x4 (fine)"],
  [56.0,5.5,"M56x5.5"],[56.0,4.0,"M56x4 (fine)"],[60.0,5.5,"M60x5.5"],[60.0,4.0,"M60x4 (fine)"],
  [64.0,6.0,"M64x6"],[64.0,4.0,"M64x4 (fine)"]
];

// Standard tap-drill lookup tables (ANSI B94.11M for UN, ISO 2306 for metric).
// Values are the commonly recommended stock drills for ~75% thread engagement.
// Format: map keyed by "major_in|tpi" (UN) or "major_mm|pitch_mm" (metric).
// Value is [drill_size_in_inches, drill_label, percent_engagement].
const TAP_DRILL_UN_TABLE = {
  "0.0600|80":  [0.0469, '3/64"',    73],  // #0-80
  "0.0730|64":  [0.0595, "#53",      72],  // #1-64
  "0.0730|72":  [0.0595, "#53",      79],  // #1-72
  "0.0860|56":  [0.0700, "#50",      74],  // #2-56
  "0.0860|64":  [0.0700, "#50",      79],  // #2-64
  "0.0990|48":  [0.0785, "#47",      77],  // #3-48
  "0.0990|56":  [0.0810, "#46",      78],  // #3-56
  "0.1120|40":  [0.0890, "#43",      79],  // #4-40
  "0.1120|48":  [0.0935, "#42",      76],  // #4-48
  "0.1250|40":  [0.1015, "#38",      79],  // #5-40
  "0.1250|44":  [0.1040, "#37",      79],  // #5-44
  "0.1380|32":  [0.1065, "#36",      78],  // #6-32
  "0.1380|40":  [0.1130, "#33",      77],  // #6-40
  "0.1640|32":  [0.1360, "#29",      75],  // #8-32
  "0.1640|36":  [0.1360, "#29",      83],  // #8-36
  "0.1900|24":  [0.1495, "#25",      79],  // #10-24
  "0.1900|32":  [0.1590, "#21",      83],  // #10-32
  "0.2160|24":  [0.1770, "#16",      77],  // #12-24
  "0.2160|28":  [0.1820, "#14",      80],  // #12-28
  "0.2500|20":  [0.2010, "#7",       75],  // 1/4-20
  "0.2500|28":  [0.2130, "#3",       78],  // 1/4-28
  "0.3125|18":  [0.2570, "F",        75],  // 5/16-18
  "0.3125|24":  [0.2720, "I",        79],  // 5/16-24
  "0.3750|16":  [0.3125, '5/16"',    77],  // 3/8-16
  "0.3750|24":  [0.3320, "Q",        79],  // 3/8-24
  "0.4375|14":  [0.3680, "U",        75],  // 7/16-14
  "0.4375|20":  [0.3906, '25/64"',   79],  // 7/16-20
  "0.5000|13":  [0.4219, '27/64"',   78],  // 1/2-13
  "0.5000|20":  [0.4531, '29/64"',   72],  // 1/2-20
  "0.5625|12":  [0.4844, '31/64"',   76],  // 9/16-12
  "0.5625|18":  [0.5156, '33/64"',   72],  // 9/16-18
  "0.6250|11":  [0.5313, '17/32"',   76],  // 5/8-11
  "0.6250|18":  [0.5781, '37/64"',   72],  // 5/8-18
  "0.7500|10":  [0.6563, '21/32"',   72],  // 3/4-10
  "0.7500|16":  [0.6875, '11/16"',   77],  // 3/4-16
  "0.8750|9":   [0.7656, '49/64"',   74],  // 7/8-9
  "0.8750|14":  [0.8125, '13/16"',   74],  // 7/8-14
  "1.0000|8":   [0.8750, '7/8"',     77],  // 1-8
  "1.0000|12":  [0.9219, '59/64"',   75],  // 1-12
  "1.0000|14":  [0.9375, '15/16"',   74],  // 1-14
  "1.1250|7":   [0.9844, '63/64"',   75],  // 1-1/8-7
  "1.1250|12":  [1.0469, '1-3/64"',  75],  // 1-1/8-12
  "1.2500|7":   [1.1094, '1-7/64"',  75],  // 1-1/4-7
  "1.2500|12":  [1.1719, '1-11/64"', 75],  // 1-1/4-12
  "1.3750|6":   [1.2188, '1-7/32"',  77],  // 1-3/8-6
  "1.3750|12":  [1.2969, '1-19/64"', 75],  // 1-3/8-12
  "1.5000|6":   [1.3438, '1-11/32"', 77],  // 1-1/2-6
  "1.5000|12":  [1.4219, '1-27/64"', 75]   // 1-1/2-12
};

// Metric tap-drill recommendations (ISO 2306 / DIN 336 commonly listed values)
// Format: "major_mm|pitch_mm" -> [drill_mm, drill_label_mm, percent]
const TAP_DRILL_METRIC_TABLE = {
  "1.0|0.25":   [0.75,  "0.75 mm", 74],
  "1.2|0.25":   [0.95,  "0.95 mm", 76],
  "1.4|0.30":   [1.10,  "1.10 mm", 74],
  "1.6|0.35":   [1.25,  "1.25 mm", 73],
  "1.8|0.35":   [1.45,  "1.45 mm", 73],
  "2.0|0.40":   [1.60,  "1.60 mm", 74],
  "2.5|0.45":   [2.05,  "2.05 mm", 75],
  "3.0|0.50":   [2.50,  "2.50 mm", 77],
  "3.5|0.60":   [2.90,  "2.90 mm", 77],
  "4.0|0.70":   [3.30,  "3.30 mm", 77],
  "5.0|0.80":   [4.20,  "4.20 mm", 77],
  "6.0|1.00":   [5.00,  "5.00 mm", 77],
  "7.0|1.00":   [6.00,  "6.00 mm", 77],
  "8.0|1.25":   [6.80,  "6.80 mm", 74],
  "8.0|1.00":   [7.00,  "7.00 mm", 77],
  "10.0|1.50":  [8.50,  "8.50 mm", 77],
  "10.0|1.25":  [8.80,  "8.80 mm", 74],
  "10.0|1.00":  [9.00,  "9.00 mm", 77],
  "12.0|1.75":  [10.20, "10.20 mm", 79],
  "12.0|1.25":  [10.80, "10.80 mm", 74],
  "14.0|2.00":  [12.00, "12.00 mm", 77],
  "14.0|1.50":  [12.50, "12.50 mm", 77],
  "16.0|2.00":  [14.00, "14.00 mm", 77],
  "16.0|1.50":  [14.50, "14.50 mm", 77],
  "18.0|2.50":  [15.50, "15.50 mm", 77],
  "18.0|1.50":  [16.50, "16.50 mm", 77],
  "20.0|2.50":  [17.50, "17.50 mm", 77],
  "20.0|1.50":  [18.50, "18.50 mm", 77],
  "22.0|2.50":  [19.50, "19.50 mm", 77],
  "22.0|1.50":  [20.50, "20.50 mm", 77],
  "24.0|3.00":  [21.00, "21.00 mm", 77],
  "24.0|2.00":  [22.00, "22.00 mm", 77],
  "27.0|3.00":  [24.00, "24.00 mm", 77],
  "27.0|2.00":  [25.00, "25.00 mm", 77],
  "30.0|3.50":  [26.50, "26.50 mm", 77],
  "30.0|2.00":  [28.00, "28.00 mm", 77],
  "33.0|3.50":  [29.50, "29.50 mm", 77],
  "33.0|2.00":  [31.00, "31.00 mm", 77],
  "36.0|4.00":  [32.00, "32.00 mm", 77],
  "36.0|3.00":  [33.00, "33.00 mm", 77],
  "39.0|4.00":  [35.00, "35.00 mm", 77],
  "39.0|3.00":  [36.00, "36.00 mm", 77],
  "42.0|4.50":  [37.50, "37.50 mm", 77],
  "42.0|3.00":  [39.00, "39.00 mm", 77],
  "45.0|4.50":  [40.50, "40.50 mm", 77],
  "45.0|3.00":  [42.00, "42.00 mm", 77],
  "48.0|5.00":  [43.00, "43.00 mm", 77],
  "48.0|3.00":  [45.00, "45.00 mm", 77],
  "52.0|5.00":  [47.00, "47.00 mm", 77],
  "52.0|4.00":  [48.00, "48.00 mm", 77],
  "56.0|5.50":  [50.50, "50.50 mm", 77],
  "56.0|4.00":  [52.00, "52.00 mm", 77],
  "60.0|5.50":  [54.50, "54.50 mm", 77],
  "60.0|4.00":  [56.00, "56.00 mm", 77],
  "64.0|6.00":  [58.00, "58.00 mm", 77],
  "64.0|4.00":  [60.00, "60.00 mm", 77]
};

// ASME B1.1 pitch-diameter tolerance formulas for Unified inch threads.
// These are a simplified calculator estimate — for acceptance work always
// confirm against the published B1.1 tables for the specific size.
//   L  = length of thread engagement (default 9P, clamped to 5P..25P per standard)
//   P  = pitch (1 / TPI)
//   D  = basic major diameter
// TD2 (class 2A PD tolerance) = 0.0015·D^(1/3) + 0.0015·L^(1/2) + 0.015·P^(2/3)
// Class 3A PD tol   ≈ 0.75  × TD2(2A)
// Class 2B PD tol   ≈ 1.30  × TD2(2A)
// Class 3B PD tol   ≈ 0.975 × TD2(2A)
// Allowance es (class 2A only) ≈ 0.300 × TD2(2A)
// Major dia tolerance (external) ≈ 0.060 × P^(2/3) for 2A, 0.040 × P^(2/3) for 3A
function computeUnToleranceEnvelope({ major, tpi, pitch, basicPitchDiameter, basicInternalMinor }){
  const L = 9 * pitch; // standard assumed engagement length
  const TD2_2A = 0.0015 * Math.cbrt(major) + 0.0015 * Math.sqrt(L) + 0.015 * Math.pow(pitch, 2/3);
  const TD2_3A = 0.75 * TD2_2A;
  const TD2_2B = 1.30 * TD2_2A;
  const TD2_3B = 0.975 * TD2_2A;
  const allowance = 0.300 * TD2_2A; // applied to class 2A external only
  const majorTol2A = 0.060 * Math.pow(pitch, 2/3);
  const majorTol3A = 0.040 * Math.pow(pitch, 2/3);
  // External (2A/3A): max PD = basic − allowance (2A) or basic (3A); min PD = max − TD2
  // Internal (2B/3B): min PD = basic; max PD = basic + TD2
  return {
    "2A": {
      pdMax: basicPitchDiameter - allowance,
      pdMin: basicPitchDiameter - allowance - TD2_2A,
      majorMax: major - allowance,
      majorMin: major - allowance - majorTol2A,
      tol: TD2_2A
    },
    "3A": {
      pdMax: basicPitchDiameter,
      pdMin: basicPitchDiameter - TD2_3A,
      majorMax: major,
      majorMin: major - majorTol3A,
      tol: TD2_3A
    },
    "2B": {
      pdMin: basicPitchDiameter,
      pdMax: basicPitchDiameter + TD2_2B,
      minorMin: basicInternalMinor,
      minorMax: basicInternalMinor + 0.25 * pitch, // approximate
      tol: TD2_2B
    },
    "3B": {
      pdMin: basicPitchDiameter,
      pdMax: basicPitchDiameter + TD2_3B,
      minorMin: basicInternalMinor,
      minorMax: basicInternalMinor + 0.2 * pitch,
      tol: TD2_3B
    }
  };
}

function lookupTapDrillUN(majorIn, tpi){
  // Round major to 4dp, tpi to integer for key
  const key = `${majorIn.toFixed(4)}|${tpi|0}`;
  const row = TAP_DRILL_UN_TABLE[key];
  return row ? { size: row[0], label: row[1], percent: row[2] } : null;
}
function lookupTapDrillMetric(majorMm, pitchMm){
  const key = `${majorMm.toFixed(1)}|${pitchMm.toFixed(2)}`;
  const row = TAP_DRILL_METRIC_TABLE[key];
  return row ? { size: row[0], label: row[1], percent: row[2] } : null;
}

// Drill charts: [size_in_inches, label] sorted ascending
const DRILL_CHART_INCH = [
  [0.0135,"#80"],[0.0145,"#79"],[0.016,"#78"],[0.018,"#77"],[0.02,"#76"],
  [0.021,"#75"],[0.0225,"#74"],[0.024,"#73"],[0.025,"#72"],[0.026,"#71"],
  [0.028,"#70"],[0.0292,"#69"],[0.031,"#68"],[0.03125,'1/32"'],[0.032,"#67"],
  [0.033,"#66"],[0.035,"#65"],[0.036,"#64"],[0.037,"#63"],[0.038,"#62"],
  [0.039,"#61"],[0.04,"#60"],[0.041,"#59"],[0.042,"#58"],[0.043,"#57"],
  [0.0465,"#56"],[0.052,"#55"],[0.055,"#54"],[0.0595,"#53"],[0.0625,'1/16"'],
  [0.0635,"#52"],[0.067,"#51"],[0.07,"#50"],[0.073,"#49"],[0.076,"#48"],
  [0.0785,"#47"],[0.081,"#46"],[0.082,"#45"],[0.086,"#44"],[0.089,"#43"],
  [0.0935,"#42"],[0.09375,'3/32"'],[0.096,"#41"],[0.098,"#40"],[0.0995,"#39"],
  [0.1015,"#38"],[0.104,"#37"],[0.1065,"#36"],[0.11,"#35"],[0.111,"#34"],
  [0.113,"#33"],[0.116,"#32"],[0.12,"#31"],[0.125,'1/8"'],[0.1285,"#30"],
  [0.136,"#29"],[0.1405,"#28"],[0.144,"#27"],[0.147,"#26"],[0.1495,"#25"],
  [0.152,"#24"],[0.154,"#23"],[0.157,"#22"],[0.15625,'5/32"'],[0.159,"#21"],
  [0.161,"#20"],[0.166,"#19"],[0.1695,"#18"],[0.173,"#17"],[0.177,"#16"],
  [0.18,"#15"],[0.182,"#14"],[0.1875,'3/16"'],[0.185,"#13"],[0.189,"#12"],
  [0.191,"#11"],[0.1935,"#10"],[0.196,"#9"],[0.199,"#8"],[0.201,"#7"],
  [0.204,"#6"],[0.2055,"#5"],[0.209,"#4"],[0.213,"#3"],[0.21875,'7/32"'],
  [0.228,"#2"],[0.234,"A"],[0.238,"B"],[0.242,"C"],[0.246,"D"],
  [0.25,'E / 1/4"'],[0.257,"F"],[0.261,"G"],[0.265625,'17/64"'],[0.266,"H"],
  [0.272,"I"],[0.277,"J"],[0.28125,'9/32"'],[0.281,"K"],[0.29,"L"],
  [0.295,"M"],[0.302,"N"],[0.3125,'5/16"'],[0.316,"O"],[0.323,"P"],
  [0.328125,'21/64"'],[0.332,"Q"],[0.339,"R"],[0.34375,'11/32"'],[0.348,"S"],
  [0.358,"T"],[0.359375,'23/64"'],[0.368,"U"],[0.375,'3/8"'],[0.377,"V"],
  [0.386,"W"],[0.390625,'25/64"'],[0.397,"X"],[0.40625,'13/32"'],[0.404,"Y"],
  [0.413,"Z"],[0.421875,'27/64"'],[0.4375,'7/16"'],[0.453125,'29/64"'],
  [0.46875,'15/32"'],[0.484375,'31/64"'],[0.5,'1/2"']
].sort((a, b) => a[0] - b[0]);

// Metric drill series in mm (converted to inches for comparison)
const DRILL_CHART_MM = [
  0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.85,0.9,0.95,
  1.0,1.05,1.1,1.15,1.2,1.25,1.3,1.35,1.4,1.45,1.5,1.55,1.6,1.65,1.7,
  1.75,1.8,1.85,1.9,1.95,2.0,2.05,2.1,2.15,2.2,2.25,2.3,2.35,2.4,2.45,
  2.5,2.6,2.7,2.8,2.9,3.0,3.1,3.2,3.3,3.4,3.5,3.6,3.7,3.8,3.9,
  4.0,4.1,4.2,4.3,4.4,4.5,4.6,4.7,4.8,4.9,5.0,5.1,5.2,5.3,5.4,5.5,
  5.6,5.7,5.8,5.9,6.0,6.1,6.2,6.3,6.4,6.5,6.6,6.7,6.8,6.9,7.0,7.1,
  7.2,7.3,7.4,7.5,7.6,7.7,7.8,7.9,8.0,8.1,8.2,8.3,8.4,8.5,8.6,8.7,
  8.8,8.9,9.0,9.1,9.2,9.3,9.4,9.5,9.6,9.7,9.8,9.9,10.0,10.2,10.5,10.8,
  11.0,11.2,11.5,11.8,12.0,12.5,13.0,13.5,14.0,14.5,15.0,15.5,16.0,
  16.5,17.0,17.5,18.0,18.5,19.0,19.5,20.0,21.0,22.0,23.0,24.0,25.0
];

function nearestDrillInch(sizeIn){
  let best = DRILL_CHART_INCH[0];
  let bestDelta = Math.abs(sizeIn - best[0]);
  for (const entry of DRILL_CHART_INCH){
    const delta = Math.abs(sizeIn - entry[0]);
    if (delta < bestDelta){ best = entry; bestDelta = delta; }
  }
  return { size: best[0], label: best[1] };
}
function nearestDrillMm(sizeMm){
  let best = DRILL_CHART_MM[0];
  let bestDelta = Math.abs(sizeMm - best);
  for (const candidate of DRILL_CHART_MM){
    const delta = Math.abs(sizeMm - candidate);
    if (delta < bestDelta){ best = candidate; bestDelta = delta; }
  }
  return { size: best, label: `${best} mm` };
}

// ── ±1 drill triplet lookups ──
function nearestDrillsInch(sizeIn){
  let bestIdx = 0, bestDelta = Infinity;
  for (let i = 0; i < DRILL_CHART_INCH.length; i++){
    const delta = Math.abs(sizeIn - DRILL_CHART_INCH[i][0]);
    if (delta < bestDelta){ bestIdx = i; bestDelta = delta; }
  }
  const make = (idx) => (idx >= 0 && idx < DRILL_CHART_INCH.length)
    ? { size: DRILL_CHART_INCH[idx][0], label: DRILL_CHART_INCH[idx][1] } : null;
  return { prev: make(bestIdx - 1), nearest: make(bestIdx), next: make(bestIdx + 1) };
}
function nearestDrillsMm(sizeMm){
  let bestIdx = 0, bestDelta = Infinity;
  for (let i = 0; i < DRILL_CHART_MM.length; i++){
    const delta = Math.abs(sizeMm - DRILL_CHART_MM[i]);
    if (delta < bestDelta){ bestIdx = i; bestDelta = delta; }
  }
  const make = (idx) => (idx >= 0 && idx < DRILL_CHART_MM.length)
    ? { size: DRILL_CHART_MM[idx], label: `${DRILL_CHART_MM[idx]} mm` } : null;
  return { prev: make(bestIdx - 1), nearest: make(bestIdx), next: make(bestIdx + 1) };
}

// ── Decimal → nearest fractional inch string ──
function gcd(a, b){ return b === 0 ? a : gcd(b, a % b); }
function decimalToFractionStr(inches){
  if (!(inches > 0)) return null;
  for (const d of [2, 4, 8, 16, 32, 64]){
    const n = Math.round(inches * d);
    if (Math.abs(n / d - inches) < 0.0005){
      const g = gcd(n, d);
      const sn = n / g, sd = d / g;
      return sd === 1 ? `${sn}"` : `${sn}/${sd}"`;
    }
  }
  return null;
}

// ── Drill selection detail card ──
function renderDrillCard(drill, system){
  if (system === "un"){
    const t = nearestDrillsInch(drill);
    const rows = [];
    if (t.prev){ const d = drill - t.prev.size; rows.push(`  Smaller: ${t.prev.label.padEnd(12)} ${fmt(t.prev.size,4)} in  (${fmt(d*1000,1)} thou under)`); }
    const dn = drill - t.nearest.size;
    rows.push(`\u2605 Nearest: ${t.nearest.label.padEnd(12)} ${fmt(t.nearest.size,4)} in  (${dn >= 0 ? "+" : ""}${fmt(dn*1000,1)} thou)`);
    if (t.next){ const d = t.next.size - drill; rows.push(`  Larger:  ${t.next.label.padEnd(12)} ${fmt(t.next.size,4)} in  (${fmt(d*1000,1)} thou over)`); }
    return renderCodeCard("Nearest stock drills", rows.join("\n"));
  } else {
    const t = nearestDrillsMm(drill);
    const rows = [];
    if (t.prev){ const d = drill - t.prev.size; rows.push(`  Smaller: ${t.prev.label.padEnd(8)}  (${fmt(d,3)} mm under)`); }
    const dn = drill - t.nearest.size;
    rows.push(`\u2605 Nearest: ${t.nearest.label.padEnd(8)}  (${dn >= 0 ? "+" : ""}${fmt(dn,3)} mm)`);
    if (t.next){ const d = t.next.size - drill; rows.push(`  Larger:  ${t.next.label.padEnd(8)}  (${fmt(d,3)} mm over)`); }
    return renderCodeCard("Nearest stock drills", rows.join("\n"));
  }
}

// ── Triangle SVG diagram ──
function updateTriangleDiagram(){
  const mode = document.getElementById("rtMode").value;
  const known = {
    run:   mode === "runRise" || mode === "runAngle",
    rise:  mode === "runRise" || mode === "riseAngle",
    hyp:   mode === "hypAngle",
    theta: mode !== "runRise"
  };
  const map = {
    run:   { edge: "svgRun",   label: "svgLabelRun"   },
    rise:  { edge: "svgRise",  label: "svgLabelRise"  },
    hyp:   { edge: "svgHyp",   label: "svgLabelHyp"   },
    theta: { edge: "svgTheta", label: "svgLabelTheta" }
  };
  for (const [key, ids] of Object.entries(map)){
    const isKnown = known[key];
    const edgeEl  = document.getElementById(ids.edge);
    const labelEl = document.getElementById(ids.label);
    if (edgeEl){  edgeEl.classList.toggle("known",   isKnown); edgeEl.classList.toggle("unknown",  !isKnown); }
    if (labelEl){ labelEl.classList.toggle("known",  isKnown); labelEl.classList.toggle("unknown", !isKnown); }
  }
}

// ── Bolt circle SVG preview ──
function buildBoltCircleSvg(holes, startAngle, direction){
  const S = 260, cx = S / 2, cy = S / 2;
  const svgR = S / 2 * 0.72;
  const hR = Math.max(4, Math.min(11, svgR / Math.max(holes, 4) * 1.5));
  const step = 360 / holes;
  const dir = direction === "cw" ? -1 : 1;
  let inner = "";
  inner += `<circle cx="${cx}" cy="${cy}" r="${svgR}" fill="none" stroke="var(--border-strong)" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  inner += `<line x1="${cx-8}" y1="${cy}" x2="${cx+8}" y2="${cy}" stroke="var(--muted)" stroke-width="1.2" opacity=".5"/>`;
  inner += `<line x1="${cx}" y1="${cy-8}" x2="${cx}" y2="${cy+8}" stroke="var(--muted)" stroke-width="1.2" opacity=".5"/>`;
  inner += `<circle cx="${cx}" cy="${cy}" r="2.5" fill="var(--muted)" opacity=".5"/>`;
  for (let i = 0; i < holes; i++){
    const rad = degToRad(startAngle + dir * i * step);
    const hx = cx + svgR * Math.cos(rad);
    const hy = cy - svgR * Math.sin(rad);
    inner += `<circle cx="${fmt(hx,2)}" cy="${fmt(hy,2)}" r="${hR}" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.5"/>`;
    if (holes <= 32){
      const lr = svgR + hR + 10;
      const lx = cx + lr * Math.cos(rad), ly = cy - lr * Math.sin(rad);
      inner += `<text x="${fmt(lx,2)}" y="${fmt(ly,2)}" text-anchor="middle" dominant-baseline="middle" font-size="10" font-weight="700" fill="var(--text)" font-family="sans-serif">${i + 1}</text>`;
    }
  }
  return `<div class="bc-svg-wrap"><svg class="bc-svg" viewBox="0 0 ${S} ${S}" fill="none">${inner}</svg></div>`;
}

// ── Form state save/restore ──
function captureFormInputs(form){
  const state = {};
  for (const el of form.elements){
    if (!el.id || el.hasAttribute("data-ephemeral")) continue;
    if (el.tagName === "INPUT" && el.type === "checkbox"){
      state[el.id] = el.checked ? "1" : "0";
    } else if (el.tagName === "INPUT" || el.tagName === "SELECT"){
      state[el.id] = el.value;
    }
  }
  if (form.id === "advancedForm"){
    state.__stackRows = JSON.stringify([...form.querySelectorAll("[data-stack-row]")].map((row) => ({
      nominal: row.querySelector("[data-stack-nominal]")?.value || "0",
      tolerance: row.querySelector("[data-stack-tolerance]")?.value || "0"
    })));
  }
  return state;
}
function restoreFormInputs(form, state){
  for (const el of form.elements){
    if (!el.id || el.hasAttribute("data-ephemeral") || state[el.id] === undefined) continue;
    if (el.tagName === "INPUT" && el.type === "checkbox"){
      el.checked = state[el.id] === "1" || state[el.id] === true || state[el.id] === "true";
    } else if (el.tagName === "INPUT" || el.tagName === "SELECT"){
      el.value = state[el.id];
    }
  }
  if (form.id === "advancedForm" && state.__stackRows){
    try {
      const items = JSON.parse(state.__stackRows);
      const container = form.querySelector("#stackRows");
      if (container && Array.isArray(items) && items.length){
        container.replaceChildren(...items.map((item) => {
          const row = document.createElement("div");
          row.className = "stack-row";
          row.dataset.stackRow = "";
          row.innerHTML = `<div class="field"><label>Nominal</label><input data-stack-nominal aria-label="Stack nominal" type="text" inputmode="decimal" /></div><div class="field"><label>± tolerance</label><input data-stack-tolerance aria-label="Stack tolerance" type="text" inputmode="decimal" /></div><button class="mini-btn danger" type="button" data-stack-remove>Remove</button>`;
          row.querySelector("[data-stack-nominal]").value = String(item.nominal ?? "0");
          row.querySelector("[data-stack-tolerance]").value = String(item.tolerance ?? "0");
          return row;
        }));
      }
    } catch {}
  }
  unitController.sync(form);
  if (form.id === "boltForm") {
    ["bcController", "bcWorkOffset", "bcSafeZ"].forEach(id => {
      if (state[id] !== undefined) document.getElementById(id).dataset.userEdited = "true";
    });
    clearGcodePreflight();
    syncGcodeVisibility();
  }
  document.dispatchEvent(new CustomEvent("form-restored", { detail: form }));
}

// ── Toast notification ──
const toastContainer = document.getElementById("toastContainer");
function showToast(message, undoFn){
  const toast = document.createElement("div");
  toast.className = "toast";
  const span = document.createElement("span");
  span.textContent = message;
  toast.appendChild(span);
  if (undoFn){
    const btn = document.createElement("button");
    btn.className = "toast-undo";
    btn.type = "button";
    btn.textContent = "Undo";
    toast.appendChild(btn);
    btn.addEventListener("click", () => { undoFn(); dismiss(); });
  }
  toastContainer.appendChild(toast);
  let gone = false;
  function dismiss(){
    if (gone) return; gone = true;
    toast.style.animation = "toast-out 220ms cubic-bezier(0.22,0.8,0.2,1) both";
    window.setTimeout(() => toast.remove(), 240);
  }
  window.setTimeout(dismiss, 4200);
}

// ── Segmented percent & MOW mode button sync ──
function syncPctButtons(){
  const val = document.getElementById("tapDrillPercent").value;
  document.querySelectorAll("[data-pct]").forEach(b => b.classList.toggle("active", b.dataset.pct === val));
}
function syncModeButtons(){
  const val = document.getElementById("mowMode").value;
  document.querySelectorAll("[data-mow-mode]").forEach(b => b.classList.toggle("active", b.dataset.mowMode === val));
}
function closestInSet(value, setArray){
  let closest = setArray[0];
  let delta = Math.abs(value - closest);
  for (const candidate of setArray){
    const candidateDelta = Math.abs(value - candidate);
    if (candidateDelta < delta){ closest = candidate; delta = candidateDelta; }
  }
  return closest;
}
function lookupUnThread(majorIn, tpi){
  const TOL_D = 0.003, TOL_T = 0.5;
  const match = UN_THREAD_TABLE.find(([d, t]) => Math.abs(d - majorIn) < TOL_D && Math.abs(t - tpi) < TOL_T);
  return match ? match[2] : null;
}
function lookupMetricThread(majorMm, pitchMm){
  const TOL_D = 0.08, TOL_P = 0.08;
  const match = METRIC_THREAD_TABLE.find(([d, p]) => Math.abs(d - majorMm) < TOL_D && Math.abs(p - pitchMm) < TOL_P);
  return match ? match[2] : null;
}
const THREAD_REFERENCE = {
  un: [
    {
      value: "basic",
      label: "Basic geometry only",
      short: "Basic",
      title: "Basic geometry only",
      body: "Shows theoretical pitch and minor diameters before class-based tolerance is applied.",
      hint: "Use this when you want a fast shop estimate and will check final limits from your thread standard."
    },
    {
      value: "2B",
      label: "2B general-purpose internal fit",
      short: "2B",
      title: "Unified class 2B",
      body: "Common internal Unified fit for everyday production tapped holes and standard fastening work.",
      hint: "Use published 2B limits from your thread standard for gaging and drawing control; the calculator geometry remains basic."
    },
    {
      value: "3B",
      label: "3B close internal fit",
      short: "3B",
      title: "Unified class 3B",
      body: "Closer internal Unified fit used where tighter engagement and reduced looseness matter more than assembly ease.",
      hint: "Use published 3B limits from your standard when inspection or mating fit needs to be controlled."
    }
  ],
  metric: [
    {
      value: "basic",
      label: "Basic geometry only",
      short: "Basic",
      title: "Basic geometry only",
      body: "Shows theoretical pitch and minor diameters before metric tolerance class limits are applied.",
      hint: "Use this when you want a fast geometry check and will pull the final class limits from your metric thread standard."
    },
    {
      value: "6H",
      label: "6H standard internal metric fit",
      short: "6H",
      title: "Metric class 6H",
      body: "Most common internal metric tolerance class for general-purpose tapped holes and standard mating fasteners.",
      hint: "Use 6H limits from the metric thread standard for final acceptance; the calculator values stay at basic geometry."
    },
    {
      value: "5H",
      label: "5H closer internal metric fit",
      short: "5H",
      title: "Metric class 5H",
      body: "Closer internal metric tolerance class used when tighter engagement or more repeatable fit is desired.",
      hint: "Check the published 5H limits from your metric standard before inspection or production release."
    },
    {
      value: "7H",
      label: "7H freer internal metric fit",
      short: "7H",
      title: "Metric class 7H",
      body: "Freer internal metric tolerance class used when added assembly clearance is preferred over a closer fit.",
      hint: "Use standard 7H limits for final control; the calculator still shows the underlying basic thread geometry."
    }
  ]
};
function getThreadReference(system, value){
  const list = THREAD_REFERENCE[system === "metric" ? "metric" : "un"];
  return list.find((item) => item.value === value) || list[0];
}
function requestFormSubmit(form, options){
  resultState.submit(form, options);
}

const threadForm = document.getElementById("threadForm");
const threadSystem = document.getElementById("threadSystem");
const threadUnifiedFields = document.getElementById("threadUnifiedFields");
const threadMetricFields = document.getElementById("threadMetricFields");
const threadQuickSpec = document.getElementById("threadQuickSpec");
const threadQuickNote = document.getElementById("threadQuickNote");
const threadClassRef = document.getElementById("threadClassRef");
const threadRefTitle = document.getElementById("threadRefTitle");
const threadRefBody = document.getElementById("threadRefBody");
const threadRefHint = document.getElementById("threadRefHint");
const threadWarn = document.getElementById("threadWarn");
function updateThreadReferenceCard(){
  const reference = getThreadReference(threadSystem.value, threadClassRef.value);
  threadRefTitle.textContent = reference.title;
  threadRefBody.textContent = reference.body;
  threadRefHint.textContent = reference.hint;
}
function updateThreadReferenceOptions(preferredValue){
  const systemKey = threadSystem.value === "metric" ? "metric" : "un";
  const references = THREAD_REFERENCE[systemKey];
  const nextValue = preferredValue || threadClassRef.value || "basic";
  threadClassRef.innerHTML = references.map((reference) => `<option value="${escapeHtml(reference.value)}">${escapeHtml(reference.label)}</option>`).join("");
  threadClassRef.value = references.some((reference) => reference.value === nextValue) ? nextValue : "basic";
  updateThreadReferenceCard();
}
function fillThreadFromParsed(parsed){
  threadSystem.value = parsed.system;
  updateThreadFields();
  updateThreadReferenceOptions();
  if (parsed.system === "un"){
    document.getElementById("unMajorIn").value = fmt(parsed.major, 4);
    document.getElementById("unTPI").value = fmt(parsed.tpi, 0);
  } else {
    document.getElementById("mMajorMm").value = fmt(parsed.major, 3);
    document.getElementById("mPitchMm").value = fmt(parsed.pitch, 3);
  }
}
function updateThreadFields(){
  const showUnified = threadSystem.value === "un";
  threadUnifiedFields.hidden = !showUnified;
  threadMetricFields.hidden = showUnified;
}
function updateThreadPreview(){
  const quick = threadQuickSpec.value.trim();
  if (!quick){ threadQuickNote.textContent = ""; return; }
  const parsed = parseThreadSpec(quick);
  threadQuickNote.textContent = parsed ? `Quick spec recognized as ${parsed.label}.` : "Quick spec not recognized yet. Use formats like 1/4-20 or M8x1.25.";
}
threadSystem.addEventListener("change", () => {
  updateThreadFields();
  updateThreadReferenceOptions();
});
threadClassRef.addEventListener("change", updateThreadReferenceCard);
threadQuickSpec.addEventListener("input", updateThreadPreview);
document.querySelectorAll("[data-pct]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById("tapDrillPercent").value = btn.dataset.pct;
    syncPctButtons();
  });
});

document.querySelectorAll("[data-mow-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById("mowMode").value = btn.dataset.mowMode;
    syncModeButtons();
    updateMowHints();
  });
});

document.querySelectorAll("[data-print]").forEach((btn) => {
  btn.addEventListener("click", () => window.print());
});

document.querySelectorAll("[data-thread-pick]").forEach((button) => {
  button.addEventListener("click", () => {
    const spec = button.dataset.threadPick;
    threadQuickSpec.value = spec;
    const parsed = parseThreadSpec(spec);
    if (parsed){
      fillThreadFromParsed(parsed);
      updateThreadPreview();
      document.querySelectorAll(".chip-btn").forEach(b => b.classList.remove("chip-active"));
      button.classList.add("chip-active");
      requestFormSubmit(threadForm);
    }
  });
});
updateThreadFields();
updateThreadReferenceOptions("basic");
updateThreadPreview();

threadForm.addEventListener("submit", (event) => {
  event.preventDefault();
  showWarn(threadWarn, "");
  const percentValue = num(document.getElementById("tapDrillPercent").value);
  const percentDisplay = Number.isInteger(percentValue) ? fmt(percentValue, 0) : fmt(percentValue, 2);
  const drillMethod = document.getElementById("threadDrillMethod").value;
  const quick = threadQuickSpec.value.trim();
  let system = threadSystem.value;
  let parsed = null;
  if (!(percentValue > 0)){
    showWarn(threadWarn, "Enter a positive tap-drill percent.", ["tapDrillPercent"]);
    return;
  }
  if (percentValue < 40 || percentValue > 90){
    showWarn(threadWarn, "Tap-drill percent is typically between 40% and 90%. Check your value.", ["tapDrillPercent"]);
    return;
  }
  if (quick){
    parsed = parseThreadSpec(quick);
    if (!parsed){
      showWarn(threadWarn, "Quick thread spec not recognized. Try 1/4-20 or M8x1.25, or fill the manual fields.", ["threadQuickSpec"]);
      return;
    }
    system = parsed.system;
    fillThreadFromParsed(parsed);
  }
  const fitReference = getThreadReference(system, threadClassRef.value);
  if (system === "un"){
    const major = num(document.getElementById("unMajorIn").value);
    const tpi = num(document.getElementById("unTPI").value);
    if (!(major > 0) || !(tpi > 0)){ showWarn(threadWarn, "Enter a positive major diameter and TPI.", ["unMajorIn","unTPI"]); return; }
    if (major < 0.01 || major > 6){ showWarn(threadWarn, "Major diameter should be between 0.01 in and 6 in.", ["unMajorIn"]); return; }
    if (tpi < 4 || tpi > 80){ showWarn(threadWarn, "TPI should be between 4 and 80.", ["unTPI"]); return; }
    const pitch = 1 / tpi;
    const computedDrill = tapDrillByPercent(major, pitch, percentValue);
    const stdTap = lookupTapDrillUN(major, tpi);
    const usingStdTap = drillMethod === "standard" && !!stdTap;
    const drill = usingStdTap ? stdTap.size : computedDrill;
    const basicPitchDiameter = major - BASIC_PITCH_DIAMETER_FACTOR * pitch;
    const basicInternalMinor = major - BASIC_INTERNAL_MINOR_FACTOR * pitch;
    const label = parsed ? parsed.label : `${fmt(major, 4)}-${fmt(tpi, 0)}`;
    const drillsIn = nearestDrillsInch(drill);
    const nearDrillIn = drillsIn.nearest;
    const fracStr = decimalToFractionStr(drill);
    const stdName = lookupUnThread(major, tpi);
    const bestWireUN = pitch / SQRT3;
    // Thread-class tolerance envelopes — shown when we identified a standard size.
    const toleranceEnvelope = stdName ? computeUnToleranceEnvelope({
      major, tpi, pitch, basicPitchDiameter, basicInternalMinor
    }) : null;
    const toMowBtn = document.getElementById("threadToMow");
    toMowBtn.dataset.mowUnits = "in";
    toMowBtn.dataset.mowPitchInput = fmt(tpi, 0);
    toMowBtn.dataset.mowPitchE = fmt(basicPitchDiameter, 6);
    toMowBtn.dataset.mowWire = fmt(bestWireUN, 6);
    document.getElementById("threadToMowRow").hidden = false;
    const threadFormState = captureFormInputs(threadForm);
    setResult("thread", {
      animate: true,
      saveHistory: true,
      formState: threadFormState,
      primary: `Tap drill: ${fmt(drill, 6)} in / ${fmt(drill * 25.4, 3)} mm  →  ${nearDrillIn.label}`,
      stats: [
        { label: "Thread", value: stdName || label },
        { label: "Pitch", valueHtml: fmtDualHtml(pitch, "in", 6) },
        { label: "Major", valueHtml: fmtDualHtml(major, "in", 6) },
        { label: "Method", value: usingStdTap ? "ANSI table" : `${percentDisplay}% thread` },
        { label: "Fit ref", value: fitReference.short },
        { label: "Nearest drill", value: `${nearDrillIn.label} (${fmt(nearDrillIn.size, 4)} in)` },
        { label: "Pitch dia basic", valueHtml: fmtDualHtml(basicPitchDiameter, "in", 6) },
        { label: "Internal minor", valueHtml: fmtDualHtml(basicInternalMinor, "in", 6) }
      ],
      detailsHtml: renderDrillCard(drill, "un") + renderList([
        usingStdTap
          ? `Selected result from ANSI B94.11M standard table: ${stdTap.label} (${fmt(stdTap.size, 4)} in, ~${stdTap.percent}% thread).`
          : `Selected result calculated from ${percentDisplay}% thread: ${fmt(computedDrill, 6)} in.`,
        ...(stdTap ? [`Comparison — ${percentDisplay}% calculation: ${fmt(computedDrill, 6)} in; ANSI table: ${stdTap.label} (${fmt(stdTap.size, 4)} in).`] : []),
        ...(drillMethod === "standard" && !stdTap ? ["No table entry matched this size, so the selected result uses the percent-thread calculation."] : []),
        ...(stdName ? [`Standard thread identified: ${stdName}.`] : []),
        ...(fracStr ? [`Nearest fractional inch: ${fracStr}.`] : []),
        "Use a standard drill near the computed size for a practical shop selection.",
        "Pitch diameter and internal minor diameter are both shown so the inside-thread size is not confused with pitch diameter.",
        "The basic internal minor diameter is the theoretical thread-root size, while the tap drill is typically larger because it depends on percent thread.",
        "Basic diameter values shown here do not include class-of-fit tolerances."
      ]) + (toleranceEnvelope ? renderCodeCard("Class tolerance envelopes (ASME B1.1 estimate)",
        [
          "External threads (bolt):",
          `  Class 2A  — PD: ${fmt(toleranceEnvelope["2A"].pdMin, 5)} … ${fmt(toleranceEnvelope["2A"].pdMax, 5)} in` +
                       `  |  Major: ${fmt(toleranceEnvelope["2A"].majorMin, 5)} … ${fmt(toleranceEnvelope["2A"].majorMax, 5)} in`,
          `  Class 3A  — PD: ${fmt(toleranceEnvelope["3A"].pdMin, 5)} … ${fmt(toleranceEnvelope["3A"].pdMax, 5)} in` +
                       `  |  Major: ${fmt(toleranceEnvelope["3A"].majorMin, 5)} … ${fmt(toleranceEnvelope["3A"].majorMax, 5)} in`,
          "Internal threads (nut):",
          `  Class 2B  — PD: ${fmt(toleranceEnvelope["2B"].pdMin, 5)} … ${fmt(toleranceEnvelope["2B"].pdMax, 5)} in` +
                       `  |  Minor: ${fmt(toleranceEnvelope["2B"].minorMin, 5)} … ${fmt(toleranceEnvelope["2B"].minorMax, 5)} in`,
          `  Class 3B  — PD: ${fmt(toleranceEnvelope["3B"].pdMin, 5)} … ${fmt(toleranceEnvelope["3B"].pdMax, 5)} in` +
                       `  |  Minor: ${fmt(toleranceEnvelope["3B"].minorMin, 5)} … ${fmt(toleranceEnvelope["3B"].minorMax, 5)} in`,
          "",
          "Simplified estimate from the B1.1 formulas with 9P engagement length.",
          "For acceptance work, verify against the published B1.1 limits table."
        ].join("\n")) : "") + renderTextCard("Fit reference", [
        `${fitReference.title}: ${fitReference.body}`,
        fitReference.hint
      ]) + renderCodeCard("Formula snapshot", [
        `Pitch P = 1 / TPI = ${fmt(pitch, 6)} in`,
        `Percent-thread drill = Major - ((${percentDisplay} / 76.98) x P) = ${fmt(computedDrill, 6)} in`,
        ...(usingStdTap ? [`Selected ANSI table drill = ${stdTap.label} (${fmt(stdTap.size, 4)} in)`] : []),
        `E_basic = Major - 0.649519 x P = ${fmt(basicPitchDiameter, 6)} in`,
        `D1_basic = Major - 1.082532 x P = ${fmt(basicInternalMinor, 6)} in`
      ].join("\n")),
      copyText: [
        `Marcos's Calculator - Thread Spec`,
        `Spec: ${label}`,
        `System: Unified`,
        `Fit reference: ${fitReference.title}`,
        `Tap-drill method: ${usingStdTap ? "ANSI B94.11M standard table" : `${percentDisplay}% thread calculation`}`,
        `Tap drill: ${fmt(drill, 6)} in`,
        ...(stdTap ? [`Percent-thread comparison: ${fmt(computedDrill, 6)} in`, `ANSI table comparison: ${stdTap.label} (${fmt(stdTap.size, 4)} in)`] : []),
        `Nearest stock drill: ${nearDrillIn.label} (${fmt(nearDrillIn.size, 4)} in)`,
        `Pitch: ${fmt(pitch, 6)} in`,
        `Basic pitch diameter: ${fmt(basicPitchDiameter, 6)} in`,
        `Basic internal minor diameter: ${fmt(basicInternalMinor, 6)} in`
      ].join("\n")
    });
  } else {
    const major = num(document.getElementById("mMajorMm").value);
    const pitch = num(document.getElementById("mPitchMm").value);
    if (!(major > 0) || !(pitch > 0)){ showWarn(threadWarn, "Enter a positive metric major diameter and pitch.", ["mMajorMm","mPitchMm"]); return; }
    if (major < 0.5 || major > 150){ showWarn(threadWarn, "Metric major diameter should be between 0.5 mm and 150 mm.", ["mMajorMm"]); return; }
    if (pitch < 0.1 || pitch > 6){ showWarn(threadWarn, "Metric pitch should be between 0.1 mm and 6 mm.", ["mPitchMm"]); return; }
    const computedDrillM = tapDrillByPercent(major, pitch, percentValue);
    const stdTapM = lookupTapDrillMetric(major, pitch);
    const usingStdTapM = drillMethod === "standard" && !!stdTapM;
    const drill = usingStdTapM ? stdTapM.size : computedDrillM;
    const basicPitchDiameter = major - BASIC_PITCH_DIAMETER_FACTOR * pitch;
    const basicInternalMinor = major - BASIC_INTERNAL_MINOR_FACTOR * pitch;
    const label = parsed ? parsed.label : `M${fmt(major, 3)}x${fmt(pitch, 3)}`;
    const drillsMm = nearestDrillsMm(drill);
    const nearDrillMm = drillsMm.nearest;
    const stdNameM = lookupMetricThread(major, pitch);
    const bestWireM = pitch / SQRT3;
    const toMowBtnM = document.getElementById("threadToMow");
    toMowBtnM.dataset.mowUnits = "mm";
    toMowBtnM.dataset.mowPitchInput = fmt(pitch, 3);
    toMowBtnM.dataset.mowPitchE = fmt(basicPitchDiameter, 3);
    toMowBtnM.dataset.mowWire = fmt(bestWireM, 4);
    document.getElementById("threadToMowRow").hidden = false;
    const threadFormStateM = captureFormInputs(threadForm);
    setResult("thread", {
      animate: true,
      saveHistory: true,
      formState: threadFormStateM,
      primary: `Tap drill: ${fmt(drill, 3)} mm / ${fmt(drill / 25.4, 5)} in  →  ${nearDrillMm.label}`,
      stats: [
        { label: "Thread", value: stdNameM || label },
        { label: "Pitch", valueHtml: fmtDualHtml(pitch, "mm", 3) },
        { label: "Major", valueHtml: fmtDualHtml(major, "mm", 3) },
        { label: "Method", value: usingStdTapM ? "ISO table" : `${percentDisplay}% thread` },
        { label: "Fit ref", value: fitReference.short },
        { label: "Nearest drill", value: nearDrillMm.label },
        { label: "Pitch dia basic", valueHtml: fmtDualHtml(basicPitchDiameter, "mm", 3) },
        { label: "Internal minor", valueHtml: fmtDualHtml(basicInternalMinor, "mm", 3) }
      ],
      detailsHtml: renderDrillCard(drill, "metric") + renderList([
        usingStdTapM
          ? `Selected result from ISO 2306 recommended table: ${stdTapM.label} (~${stdTapM.percent}% thread).`
          : `Selected result calculated from ${percentDisplay}% thread: ${fmt(computedDrillM, 3)} mm.`,
        ...(stdTapM ? [`Comparison — ${percentDisplay}% calculation: ${fmt(computedDrillM, 3)} mm; ISO table: ${stdTapM.label}.`] : []),
        ...(drillMethod === "standard" && !stdTapM ? ["No table entry matched this size, so the selected result uses the percent-thread calculation."] : []),
        ...(stdNameM ? [`Standard thread identified: ${stdNameM}.`] : []),
        "This is a practical tap-drill estimate for a 60 degree thread, not a tolerance-class lookup.",
        "Pitch diameter and internal minor diameter are both shown to avoid misreading the inside-thread size.",
        "The basic internal minor diameter is the theoretical thread-root size, while the tap drill is typically larger because it depends on percent thread."
      ]) + renderTextCard("Fit reference", [
        `${fitReference.title}: ${fitReference.body}`,
        fitReference.hint
      ]) + renderCodeCard("Formula snapshot", [
        `Percent-thread drill = Major - ((${percentDisplay} / 76.98) x P) = ${fmt(computedDrillM, 3)} mm`,
        ...(usingStdTapM ? [`Selected ISO table drill = ${stdTapM.label}`] : []),
        `E_basic = Major - 0.649519 x P = ${fmt(basicPitchDiameter, 3)} mm`,
        `D1_basic = Major - 1.082532 x P = ${fmt(basicInternalMinor, 3)} mm`
      ].join("\n")),
      copyText: [
        `Marcos's Calculator - Thread Spec`,
        `Spec: ${label}`,
        `System: ISO Metric`,
        `Fit reference: ${fitReference.title}`,
        `Tap-drill method: ${usingStdTapM ? "ISO 2306 recommended table" : `${percentDisplay}% thread calculation`}`,
        `Tap drill: ${fmt(drill, 3)} mm`,
        ...(stdTapM ? [`Percent-thread comparison: ${fmt(computedDrillM, 3)} mm`, `ISO table comparison: ${stdTapM.label}`] : []),
        `Nearest stock drill: ${nearDrillMm.label}`,
        `Pitch: ${fmt(pitch, 3)} mm`,
        `Basic pitch diameter: ${fmt(basicPitchDiameter, 3)} mm`,
        `Basic internal minor diameter: ${fmt(basicInternalMinor, 3)} mm`
      ].join("\n")
    });
  }
});
document.getElementById("btnThreadClear").addEventListener("click", () => {
  const saved = captureFormInputs(threadForm);
  const savedChip = document.querySelector(".chip-btn.chip-active")?.dataset.threadPick || null;
  threadForm.reset();
  threadSystem.value = saved.threadSystem;
  syncPctButtons();
  updateThreadFields();
  updateThreadReferenceOptions("basic");
  threadQuickNote.textContent = "";
  showWarn(threadWarn, "");
  document.querySelectorAll(".chip-btn").forEach(b => b.classList.remove("chip-active"));
  document.getElementById("threadToMowRow").hidden = true;
  setResult("thread", {
    primary: "Tap drill and pitch details will show here.",
    stats: [],
    detailsHtml: renderList([
      "Use a quick spec like 1/4-20 or M8x1.25, or tap a common size button for a faster start.",
      "The fit / tolerance reference is informational and does not replace published class limits."
    ]),
    copyText: ""
  });
  showToast("Thread form cleared.", () => {
    restoreFormInputs(threadForm, saved);
    syncPctButtons();
    updateThreadFields();
    updateThreadReferenceOptions(threadClassRef.value);
    updateThreadPreview();
    if (savedChip) document.querySelector(`[data-thread-pick="${savedChip}"]`)?.classList.add("chip-active");
  });
});

const mowForm = document.getElementById("mowForm");
const mowUnits = document.getElementById("mowUnits");
const mowMode = document.getElementById("mowMode");
const mowPreset = document.getElementById("mowPreset");
const mowPresetNote = document.getElementById("mowPresetNote");
const mowWireSet = document.getElementById("mowWireSet");
const mowPitchLabel = document.getElementById("mowPitchLabel");
const mowPitchInput = document.getElementById("mowPitchInput");
const mowPitchHint = document.getElementById("mowPitchHint");
const mowWire = document.getElementById("mowWire");
const mowE = document.getElementById("mowE");
const mowM = document.getElementById("mowM");
const mowWarn = document.getElementById("mowWarn");

function getPitchP(){
  const pitchInput = num(mowPitchInput.value);
  if (!(pitchInput > 0)) return NaN;
  return mowUnits.value === "in" ? 1 / pitchInput : pitchInput;
}
const mowFieldE = document.getElementById("mowFieldE");
const mowFieldM = document.getElementById("mowFieldM");
function updateMowHints(){
  if (mowUnits.value === "in"){
    mowPitchLabel.textContent = "TPI (threads per inch)";
    mowPitchInput.placeholder = "20";
    mowPitchHint.textContent = "In inch mode, enter TPI. Pitch P is calculated as 1 / TPI.";
  } else {
    mowPitchLabel.textContent = "Pitch P (mm)";
    mowPitchInput.placeholder = "2";
    mowPitchHint.textContent = "In metric mode, enter pitch directly in millimeters.";
  }
  if (mowMode.value === "solveM"){
    mowE.placeholder = "Enter E to compute M";
    mowM.placeholder = "Computed M appears here";
    mowFieldE.classList.remove("field-computed");
    mowFieldM.classList.add("field-computed");
  } else {
    mowM.placeholder = "Enter M to compute E";
    mowE.placeholder = "Computed E appears here";
    mowFieldM.classList.remove("field-computed");
    mowFieldE.classList.add("field-computed");
  }
}
function applyMowPreset(value){
  showWarn(mowWarn, "");
  if (!value){ mowPresetNote.textContent = ""; return; }
  const parsed = parseThreadSpec(value);
  if (!parsed){ mowPresetNote.textContent = "Preset not recognized."; return; }
  const isMetric = parsed.system === "metric";
  const units = isMetric ? "mm" : "in";
  const pitch = isMetric ? parsed.pitch : 1 / parsed.tpi;
  const major = parsed.major;
  const wire = pitch / SQRT3;
  const basicPitchDiameter = major - BASIC_PITCH_DIAMETER_FACTOR * pitch;
  const measurement = mowSolveMExternal(basicPitchDiameter, wire, pitch);
  const dp = isMetric ? 3 : 6;
  mowUnits.value = units;
  unitController.sync(mowForm);
  mowMode.value = "solveM";
  updateMowHints();
  mowPitchInput.value = isMetric ? String(parsed.pitch) : String(parsed.tpi);
  mowWire.value = wire.toFixed(4);
  mowE.value = basicPitchDiameter.toFixed(dp);
  mowM.value = measurement.toFixed(dp);
  mowPresetNote.textContent = `Loaded ${parsed.label} — best wire ${fmt(wire, 4)} ${units}, basic E ${fmt(basicPitchDiameter, dp)} ${units}.`;
  requestFormSubmit(mowForm);
}
mowUnits.addEventListener("change", updateMowHints);
mowMode.addEventListener("change", updateMowHints);
mowPreset.addEventListener("change", () => applyMowPreset(mowPreset.value));
updateMowHints();

document.getElementById("btnMowSuggest").addEventListener("click", () => {
  showWarn(mowWarn, "");
  const pitch = getPitchP();
  if (!(pitch > 0)){
    showWarn(mowWarn, "Enter pitch first. Use TPI in inch mode or pitch in millimeters in metric mode.");
    return;
  }
  const theoretical = pitch / SQRT3;
  let wireSetChoice = mowWireSet.value;
  if (wireSetChoice === "auto") wireSetChoice = mowUnits.value === "in" ? "inch" : "metric";
  const snapped = wireSetChoice === "inch" ? closestInSet(theoretical, WIRE_SET_INCH) : closestInSet(theoretical, WIRE_SET_MM);
  mowWire.value = snapped.toFixed(3);
  setResult("mow", {
    animate: true,
    primary: `Best wire suggestion: ${fmt(snapped, 6)} ${unitLabel(mowUnits.value)}`,
    stats: [
      { label: "Pitch P", value: `${fmt(pitch, 6)} ${unitLabel(mowUnits.value)}` },
      { label: "Theory", value: `${fmt(theoretical, 6)} ${unitLabel(mowUnits.value)}` },
      { label: "Stock set", value: wireSetChoice === "inch" ? "Inch" : "Metric" }
    ],
    detailsHtml: renderList([
      "The theoretical best wire is P / sqrt(3).",
      "The suggested value is snapped to the nearest size in the selected wire set.",
      "Enter E or M next, then press Calculate to finish the over-wires math."
    ]),
    copyText: [`Marcos's Calculator - Wire Suggestion`, `Pitch: ${fmt(pitch, 6)} ${unitLabel(mowUnits.value)}`, `Theoretical best wire: ${fmt(theoretical, 6)} ${unitLabel(mowUnits.value)}`, `Snapped wire: ${fmt(snapped, 6)} ${unitLabel(mowUnits.value)}`].join("\n")
  });
});

mowForm.addEventListener("submit", (event) => {
  event.preventDefault();
  showWarn(mowWarn, "");
  const pitch = getPitchP();
  const wire = num(mowWire.value);
  const units = unitLabel(mowUnits.value);
  if (!(pitch > 0)) { showWarn(mowWarn, "Pitch must be positive. Use TPI in inch mode or pitch in millimeters in metric mode.", ["mowPitchInput"]); return; }
  if (!(wire > 0)) { showWarn(mowWarn, "Wire diameter W must be positive.", ["mowWire"]); return; }
  const bestWire = pitch / SQRT3;
  const threadTypeEl = document.getElementById("mowType");
  const isInternal = threadTypeEl && threadTypeEl.value === "internal";
  // 60° thread MOW formulas:
  //   External (over wires):    M = E + 3·W − (√3/2)·P
  //                             E = M − 3·W + (√3/2)·P
  //   Internal (between wires): M = E − 3·W + (√3/2)·P   (between-wires of a plug gauge)
  //                             E = M + 3·W − (√3/2)·P
  const typeLabel = isInternal ? "Internal (between wires)" : "External (over wires)";
  if (mowMode.value === "solveM"){
    const pitchDiameter = num(mowE.value);
    if (!(pitchDiameter > 0)) { showWarn(mowWarn, "Enter a positive pitch diameter E to compute M.", ["mowE"]); return; }
    const measurement = isInternal
      ? mowSolveMInternal(pitchDiameter, wire, pitch)
      : mowSolveMExternal(pitchDiameter, wire, pitch);
    mowM.value = measurement.toFixed(6);
    const formulaLine = isInternal
      ? `M = E - 3W + (sqrt(3)/2)P  (internal)`
      : `M = E + 3W - (sqrt(3)/2)P  (external)`;
    setResult("mow", {
      animate: true,
      saveHistory: true,
      formState: captureFormInputs(mowForm),
      primary: `M = ${fmt(measurement, 6)} ${units}`,
      stats: [
        { label: "Type", value: typeLabel },
        { label: "Pitch P", value: `${fmt(pitch, 6)} ${units}` },
        { label: "Wire W", value: `${fmt(wire, 6)} ${units}` },
        { label: "Input E", value: `${fmt(pitchDiameter, 6)} ${units}` },
        { label: "Best wire", value: `${fmt(bestWire, 6)} ${units}` }
      ],
      detailsHtml: renderList([
        isInternal
          ? "Solved the between-wires reading on a plug-gauge style internal thread from the target pitch diameter."
          : "Solved micrometer reading across the three wires from the pitch diameter target.",
        "Replace E with your actual chart or gage target before recalculating when needed.",
        "The best-wire value is shown for comparison even if you use a different actual wire size."
      ]) + renderCodeCard("Formula snapshot", [formulaLine, `M = ${fmt(measurement, 6)} ${units}`].join("\n")),
      copyText: [`Marcos's Calculator - Measurement Over Wires`, `Type: ${typeLabel}`, `Mode: Solve M from E`, `Pitch P: ${fmt(pitch, 6)} ${units}`, `Wire W: ${fmt(wire, 6)} ${units}`, `Pitch diameter E: ${fmt(pitchDiameter, 6)} ${units}`, `Measurement over wires M: ${fmt(measurement, 6)} ${units}`].join("\n")
    });
  } else {
    const measurement = num(mowM.value);
    if (!(measurement > 0)) { showWarn(mowWarn, "Enter a positive measurement M to compute E.", ["mowM"]); return; }
    const pitchDiameter = isInternal
      ? mowSolveEInternal(measurement, wire, pitch)
      : mowSolveEExternal(measurement, wire, pitch);
    mowE.value = pitchDiameter.toFixed(6);
    const formulaLine = isInternal
      ? `E = M + 3W - (sqrt(3)/2)P  (internal)`
      : `E = M - 3W + (sqrt(3)/2)P  (external)`;
    setResult("mow", {
      animate: true,
      saveHistory: true,
      formState: captureFormInputs(mowForm),
      primary: `E = ${fmt(pitchDiameter, 6)} ${units}`,
      stats: [
        { label: "Type", value: typeLabel },
        { label: "Pitch P", value: `${fmt(pitch, 6)} ${units}` },
        { label: "Wire W", value: `${fmt(wire, 6)} ${units}` },
        { label: "Input M", value: `${fmt(measurement, 6)} ${units}` },
        { label: "Best wire", value: `${fmt(bestWire, 6)} ${units}` }
      ],
      detailsHtml: renderList([
        "Solved pitch diameter from the mic reading and wire size.",
        "If your wire differs from the best-wire recommendation, the result still uses the actual W you entered.",
        "Keep the units consistent all the way through the calculation."
      ]) + renderCodeCard("Formula snapshot", [formulaLine, `E = ${fmt(pitchDiameter, 6)} ${units}`].join("\n")),
      copyText: [`Marcos's Calculator - Measurement Over Wires`, `Type: ${typeLabel}`, `Mode: Solve E from M`, `Pitch P: ${fmt(pitch, 6)} ${units}`, `Wire W: ${fmt(wire, 6)} ${units}`, `Measurement M: ${fmt(measurement, 6)} ${units}`, `Pitch diameter E: ${fmt(pitchDiameter, 6)} ${units}`].join("\n")
    });
  }
});

document.getElementById("btnMowClear").addEventListener("click", () => {
  const saved = captureFormInputs(mowForm);
  unitController.reset(mowForm);
  mowMode.value = "solveM";
  syncModeButtons();
  mowPreset.value = "";
  mowPresetNote.textContent = "";
  updateMowHints();
  showWarn(mowWarn, "");
  setResult("mow", {
    primary: "Measurement-over-wires output will show here.",
    stats: [],
    detailsHtml: renderList([
      "Use M = E + 3W - (sqrt(3)/2)P to solve the mic reading from a target pitch diameter.",
      "Use the best-wire helper if you want the nearest stocked wire size instead of the theoretical value."
    ]),
    copyText: ""
  });
  showToast("MOW form cleared.", () => {
    restoreFormInputs(mowForm, saved);
    syncModeButtons();
    updateMowHints();
  });
});

const boltForm = document.getElementById("boltForm");
const bcDia = document.getElementById("bcDia");
const bcHoles = document.getElementById("bcHoles");
const bcStartAngle = document.getElementById("bcStartAngle");
const bcClockwise = document.getElementById("bcClockwise");
const bcWarn = document.getElementById("bcWarn");
const bcUnitsEl = document.getElementById("bcUnits");
function convertBoltUnitValues(fromUnits, toUnits){
  unitController.convert("bcUnits", fromUnits, toUnits);
  clearGcodePreflight();
}
// Show/hide G-code field group when the toggle changes
const bcGcodeCheck = document.getElementById("bcGcode");
const bcGcodeFieldsEl = document.getElementById("bcGcodeFields");
const bcGcodeHintEl = document.getElementById("bcGcodeHint");
const bcGcodeModeEl = document.getElementById("bcGcodeMode");
const bcGcodePeckField = document.getElementById("bcGcodePeck") && document.getElementById("bcGcodePeck").closest(".field");
function clearGcodePreflight(){
  gcodePreflightIds.forEach((id) => { const input = document.getElementById(id); if (input) input.checked = false; });
}
function applyActiveMachineToGcode(force = false){
  const machine = getActiveMachineProfile();
  if (!machine) return;
  const inputUnits = document.getElementById("bcUnits")?.value || machine.units;
  const safeZ = machine.units === inputUnits ? machine.safeZ : inputUnits === "in" ? machine.safeZ / 25.4 : machine.safeZ * 25.4;
  const controller = document.getElementById("bcController");
  const workOffset = document.getElementById("bcWorkOffset");
  const safeZInput = document.getElementById("bcSafeZ");
  const before = [controller?.value, workOffset?.value, safeZInput?.value].join("|");
  if (controller && (force || !controller.dataset.userEdited)) controller.value = machine.controller;
  if (workOffset && (force || !workOffset.dataset.userEdited)) workOffset.value = machine.workOffset;
  if (safeZInput && (force || !safeZInput.dataset.userEdited)) safeZInput.value = fmt(safeZ, inputUnits === "in" ? 4 : 3);
  if ([controller?.value, workOffset?.value, safeZInput?.value].join("|") !== before) clearGcodePreflight();
}
function syncGcodeVisibility(){
  const on = bcGcodeCheck && bcGcodeCheck.checked;
  if (on) applyActiveMachineToGcode(false);
  if (bcGcodeFieldsEl) bcGcodeFieldsEl.hidden = !on;
  if (bcGcodeHintEl) bcGcodeHintEl.hidden = !on;
  if (bcGcodePeckField){
    const mode = bcGcodeModeEl ? bcGcodeModeEl.value : "positions";
    bcGcodePeckField.hidden = !(on && mode === "peck");
  }
  // Visual state fallback for browsers without :has()
  const wrap = bcGcodeCheck && bcGcodeCheck.closest(".inline-check");
  if (wrap) wrap.classList.toggle("is-checked", Boolean(on));
}
if (bcGcodeCheck) bcGcodeCheck.addEventListener("change", syncGcodeVisibility);
if (bcGcodeModeEl) bcGcodeModeEl.addEventListener("change", syncGcodeVisibility);
bcUnitsEl.dataset.previousUnit = bcUnitsEl.value;
bcUnitsEl.addEventListener("change", () => {
  clearGcodePreflight();
  bcUnitsEl.dataset.previousUnit = bcUnitsEl.value;
  applyActiveMachineToGcode(false);
});
if (bcGcodeFieldsEl){
  bcGcodeFieldsEl.addEventListener("input", (event) => {
    if (event.target.closest(".safety-checklist")) return;
    event.target.dataset.userEdited = "true";
    clearGcodePreflight();
  });
}
boltForm.addEventListener("input", event => {
  if (!event.target.hasAttribute("data-ephemeral")) clearGcodePreflight();
});
syncGcodeVisibility();

function buildBoltGcode(holes, coords, inputUnits){
  const mode = bcGcodeModeEl ? bcGcodeModeEl.value : "positions";
  const zInput = parseDimension(document.getElementById("bcGcodeZ").value, inputUnits);
  const rInput = parseDimension(document.getElementById("bcGcodeR").value, inputUnits);
  const feedInput = num(document.getElementById("bcGcodeFeed").value);
  const peckInput = parseDimension(document.getElementById("bcGcodePeck").value, inputUnits);
  const safeZInput = parseDimension(document.getElementById("bcSafeZ").value, inputUnits);
  const spindle = num(document.getElementById("bcSpindle").value);
  const controller = document.getElementById("bcController").value;
  const workOffset = document.getElementById("bcWorkOffset").value;
  const coolant = document.getElementById("bcCoolant").value;
  const unitSel = document.getElementById("bcGcodeUnits").value;
  const unitHeader = unitSel === "auto" ? (inputUnits === "in" ? "G20" : "G21") : unitSel.toUpperCase();
  const outputUnits = unitHeader === "G20" ? "in" : "mm";
  const conversion = inputUnits === outputUnits ? 1 : outputUnits === "in" ? 1 / 25.4 : 25.4;
  const z = zInput * conversion;
  const r = rInput * conversion;
  const feed = feedInput * conversion;
  const peck = peckInput * conversion;
  const safeZ = safeZInput * conversion;
  const outputCoords = coords.map((coord) => ({ ...coord, x: coord.x * conversion, y: coord.y * conversion }));
  const dp = outputUnits === "in" ? 4 : 3;
  const out = [];
  out.push("%");
  out.push(`(Bolt circle: ${holes} hole${holes === 1 ? "" : "s"}; ${controller.toUpperCase()} profile)`);
  out.push("(SIMULATE, SINGLE-BLOCK, AND DRY-RUN ABOVE THE PART)");
  out.push(`${unitHeader} G90 G17 G40 G49 G80`);
  out.push(workOffset);
  out.push(`G0 Z${fmt(safeZ, dp)}`);
  if (mode === "positions"){
    outputCoords.forEach((c, i) => {
      out.push(`(Hole ${i + 1})`);
      out.push(`G0 X${fmt(c.x, dp)} Y${fmt(c.y, dp)}`);
    });
  } else {
    const cycleCmd = mode === "peck" ? "G83" : "G81";
    const first = outputCoords[0];
    out.push(`S${fmt(spindle, 0)} M3`);
    if (coolant === "flood") out.push("M8");
    out.push(`G0 X${fmt(first.x, dp)} Y${fmt(first.y, dp)}`);
    out.push(`G0 Z${fmt(r, dp)}`);
    const peckPart = mode === "peck" && Number.isFinite(peck) ? ` Q${fmt(peck, dp)}` : "";
    out.push(`${cycleCmd} G98 X${fmt(first.x, dp)} Y${fmt(first.y, dp)} Z${fmt(z, dp)} R${fmt(r, dp)}${peckPart} F${fmt(feed, 2)}`);
    for (let i = 1; i < outputCoords.length; i += 1){
      out.push(`X${fmt(outputCoords[i].x, dp)} Y${fmt(outputCoords[i].y, dp)}`);
    }
    out.push("G80");
    out.push(`G0 Z${fmt(safeZ, dp)}`);
    if (coolant === "flood") out.push("M9");
    out.push("M5");
  }
  out.push("M30");
  out.push("%");
  return out.join("\n");
}

// Build a CSV of the bolt-circle coordinates. Header + one row per hole.
function buildBoltCsv(coords, units){
  const u = unitLabel(units);
  const rows = [`Index,Angle_deg,X_${u},Y_${u}`];
  coords.forEach((c, i) => {
    rows.push(`${i + 1},${fmt(c.angleDeg, 6)},${fmt(c.x, 6)},${fmt(c.y, 6)}`);
  });
  return rows.join("\n") + "\n";
}
// Build a minimal AutoCAD R12 DXF with a POINT entity per hole on layer BOLT_CIRCLE.
// This is the classic "paired code/value" ASCII DXF — no libraries needed.
function buildBoltDxf(coords, diameter){
  const out = [];
  const add = (code, value) => { out.push(String(code), String(value)); };
  // HEADER section (minimal)
  add(0, "SECTION"); add(2, "HEADER");
  add(9, "$ACADVER"); add(1, "AC1009");
  add(0, "ENDSEC");
  // TABLES — declare a layer so the points land somewhere sensible.
  add(0, "SECTION"); add(2, "TABLES");
  add(0, "TABLE"); add(2, "LAYER"); add(70, 1);
  add(0, "LAYER"); add(2, "BOLT_CIRCLE"); add(70, 0); add(62, 1); add(6, "CONTINUOUS");
  add(0, "ENDTAB");
  add(0, "ENDSEC");
  // ENTITIES — the bolt circle itself plus one POINT per hole.
  add(0, "SECTION"); add(2, "ENTITIES");
  // Reference circle outline (visual aid; uncomment-equivalent is always nice to include).
  add(0, "CIRCLE"); add(8, "BOLT_CIRCLE");
  add(10, fmt(coords._cx || 0, 6));
  add(20, fmt(coords._cy || 0, 6));
  add(30, "0");
  add(40, fmt((diameter || 0) / 2, 6));
  coords.forEach((c) => {
    add(0, "POINT"); add(8, "BOLT_CIRCLE");
    add(10, fmt(c.x, 6)); add(20, fmt(c.y, 6)); add(30, "0");
  });
  add(0, "ENDSEC");
  add(0, "EOF");
  return out.join("\n") + "\n";
}
function triggerDownload(filename, text, mime){
  try {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  } catch (err) {
    showToast("Download failed — check browser permissions.");
  }
}
boltForm.addEventListener("submit", (event) => {
  event.preventDefault();
  showWarn(bcWarn, "");
  const diameter = num(bcDia.value);
  const holes = num(bcHoles.value);
  const startAngle = num(bcStartAngle.value);
  const centerX = num(document.getElementById("bcCenterX").value) || 0;
  const centerY = num(document.getElementById("bcCenterY").value) || 0;
  const inputUnits = document.getElementById("bcUnits").value;
  const units = unitLabel(inputUnits);
  if (!(diameter > 0)) { showWarn(bcWarn, "Bolt circle diameter must be positive.", ["bcDia"]); return; }
  if (!(holes >= 1 && Number.isInteger(holes))) { showWarn(bcWarn, "Number of holes must be an integer 1 or greater.", ["bcHoles"]); return; }
  if (!Number.isFinite(startAngle)) { showWarn(bcWarn, "Start angle must be a valid number.", ["bcStartAngle"]); return; }
  const radius = diameter / 2;
  const step = 360 / holes;
  const directionLabel = bcClockwise.value.toUpperCase();
  const hasOffset = centerX !== 0 || centerY !== 0;
  const chord = diameter * Math.sin(Math.PI / holes);
  const lines = ["Index, Angle (deg), X, Y"];
  const coords = boltCircleCoordinates(diameter, holes, startAngle, bcClockwise.value, centerX, centerY);
  coords.forEach((coord, index) => lines.push(`${index + 1}, ${fmt(coord.angleDeg, 4)}, ${fmt(coord.x, 6)}, ${fmt(coord.y, 6)}`));
  const centerNote = hasOffset ? `Center offset: (${fmt(centerX, 6)}, ${fmt(centerY, 6)}) ${units}` : "Centered at origin (0, 0)";
  const boltFormState = captureFormInputs(boltForm);

  const wantGcode = bcGcodeCheck && bcGcodeCheck.checked;
  if (wantGcode && !gcodePreflightIds.every((id) => document.getElementById(id)?.checked)){
    showWarn(bcWarn, "Acknowledge all three G-code preflight checks before generating a program.", gcodePreflightIds);
    return;
  }
  if (wantGcode){
    const z = parseDimension(document.getElementById("bcGcodeZ").value, inputUnits);
    const retract = parseDimension(document.getElementById("bcGcodeR").value, inputUnits);
    const safeZ = parseDimension(document.getElementById("bcSafeZ").value, inputUnits);
    const feed = num(document.getElementById("bcGcodeFeed").value);
    const spindle = num(document.getElementById("bcSpindle").value);
    const peck = parseDimension(document.getElementById("bcGcodePeck").value, inputUnits);
    const mode = bcGcodeModeEl.value;
    if (![z, retract, safeZ].every(Number.isFinite)){ showWarn(bcWarn, "Enter valid G-code depth, retract, and safe-Z values."); return; }
    if (safeZ < retract){ showWarn(bcWarn, "Safe Z must be at or above the retract plane.", ["bcSafeZ","bcGcodeR"]); return; }
    if (mode !== "positions" && (!(z < retract) || !(feed > 0) || !(spindle > 0))){ showWarn(bcWarn, "For a drill cycle, depth must be below retract and feed/spindle must be positive."); return; }
    if (mode === "peck" && !(peck > 0)){ showWarn(bcWarn, "Peck Q must be positive for a G83 cycle.", ["bcGcodePeck"]); return; }
  }
  const gcodeText = wantGcode ? buildBoltGcode(holes, coords, inputUnits) : "";
  const detailsExtras = wantGcode ? renderCodeCard("G-code", gcodeText) : "";
  const copyExtras = wantGcode ? ["", "— G-code —", gcodeText] : [];

  // Stash export payloads on the buttons so the click handlers don't need
  // to re-run the geometry math.
  coords._cx = centerX; coords._cy = centerY;
  const csvText = buildBoltCsv(coords, inputUnits);
  const dxfText = buildBoltDxf(coords, diameter);
  const csvBtn = document.getElementById("bcExportCsv");
  const dxfBtn = document.getElementById("bcExportDxf");
  if (csvBtn){ csvBtn.hidden = false; csvBtn.dataset.payload = csvText; }
  if (dxfBtn){ dxfBtn.hidden = false; dxfBtn.dataset.payload = dxfText; }

  setResult("bolt", {
    animate: true,
    saveHistory: true,
    formState: boltFormState,
    primary: `${holes} coordinates ready · ${units}`,
    stats: [
      { label: "BCD", valueHtml: fmtDualHtml(diameter, units, 6) },
      { label: "Radius", valueHtml: fmtDualHtml(radius, units, 6) },
      { label: "Step angle", value: `${fmt(step, 4)} deg` },
      { label: "Chord (h-to-h)", valueHtml: fmtDualHtml(chord, units, 6) },
      { label: "Direction", value: directionLabel },
      { label: "Center X", value: `${fmt(centerX, 6)} ${units}` },
      { label: "Center Y", value: `${fmt(centerY, 6)} ${units}` }
    ],
    detailsHtml: buildBoltCircleSvg(holes, startAngle, bcClockwise.value) + renderList([
      centerNote,
      `Chord (hole-to-hole): ${fmt(chord, 6)} ${units} — straight-line distance between adjacent holes.`,
      "Angles are measured from the +X axis; use 90 degrees to start on +Y.",
      "Use the copy button to grab the full coordinate block for setup notes or a CAM worksheet.",
      ...(wantGcode ? ["Preflight was acknowledged for this generated snapshot. Re-verify after every edit, transfer, or controller change."] : [])
    ]) + renderCodeCard("Coordinate list", lines.join("\n")) + detailsExtras + (wantGcode ? renderProvenance("gcode") : renderProvenance("geometry")),
    copyText: [`Marcos's Calculator - Bolt Circle`, `Units: ${units}`, `BCD: ${fmt(diameter, 6)} ${units}`, `Radius: ${fmt(radius, 6)} ${units}`, `Holes: ${holes}`, `Chord (hole-to-hole): ${fmt(chord, 6)} ${units}`, `Start angle: ${fmt(startAngle, 4)} deg`, `Direction: ${directionLabel}`, centerNote, "", ...lines, ...copyExtras].join("\n")
  });
});
// CSV / DXF export wiring. Payload is stamped onto the button on each submit.
(function wireBoltExports(){
  const csvBtn = document.getElementById("bcExportCsv");
  const dxfBtn = document.getElementById("bcExportDxf");
  if (csvBtn){
    csvBtn.addEventListener("click", () => {
      const payload = csvBtn.dataset.payload || "";
      if (!payload) return;
      triggerDownload("bolt-circle.csv", payload, "text/csv;charset=utf-8");
    });
  }
  if (dxfBtn){
    dxfBtn.addEventListener("click", () => {
      const payload = dxfBtn.dataset.payload || "";
      if (!payload) return;
      triggerDownload("bolt-circle.dxf", payload, "application/dxf");
    });
  }
})();
document.getElementById("btnBcClear").addEventListener("click", () => {
  const saved = captureFormInputs(boltForm);
  unitController.reset(boltForm);
  bcStartAngle.value = "0";
  bcClockwise.value = "ccw";
  document.getElementById("bcCenterX").value = "0";
  document.getElementById("bcCenterY").value = "0";
  showWarn(bcWarn, "");
  // Hide CSV/DXF export buttons until the next successful generation.
  const csvBtn = document.getElementById("bcExportCsv");
  const dxfBtn = document.getElementById("bcExportDxf");
  if (csvBtn){ csvBtn.hidden = true; csvBtn.dataset.payload = ""; }
  if (dxfBtn){ dxfBtn.hidden = true; dxfBtn.dataset.payload = ""; }
  setResult("bolt", {
    primary: "Coordinates will appear here when you generate them.",
    stats: [],
    detailsHtml: renderList([
      "The selected unit is carried into the output so the result no longer feels ambiguous.",
      "Copying the coordinate block gives you an easy handoff to setup sheets or CNC notes."
    ]),
    copyText: ""
  });
  showToast("Bolt circle form cleared.", () => {
    restoreFormInputs(boltForm, saved);
  });
});

const triangleForm = document.getElementById("triangleForm");
const rtMode = document.getElementById("rtMode");
const rtFieldRun = document.getElementById("rtFieldRun");
const rtFieldRise = document.getElementById("rtFieldRise");
const rtFieldHyp = document.getElementById("rtFieldHyp");
const rtFieldAngle = document.getElementById("rtFieldAngle");
const rtRun = document.getElementById("rtRun");
const rtRise = document.getElementById("rtRise");
const rtHyp = document.getElementById("rtHyp");
const rtAngle = document.getElementById("rtAngle");
const rtWarn = document.getElementById("rtWarn");
function updateTriangleFields(){
  const mode = rtMode.value;
  rtFieldRun.hidden   = !(mode === "runRise" || mode === "runAngle");
  rtFieldRise.hidden  = !(mode === "runRise" || mode === "riseAngle");
  rtFieldHyp.hidden   = !(mode === "hypAngle");
  rtFieldAngle.hidden = !(mode === "hypAngle" || mode === "runAngle" || mode === "riseAngle");
}
rtMode.addEventListener("change", () => { updateTriangleFields(); updateTriangleDiagram(); });
updateTriangleFields();
updateTriangleDiagram();

triangleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  showWarn(rtWarn, "");
  const mode = rtMode.value;
  const units = unitLabel(document.getElementById("rtUnits").value);
  let result;
  if (mode === "runRise"){
    const run = num(rtRun.value);
    const rise = num(rtRise.value);
    if (!(run > 0) || !(rise > 0)) { showWarn(rtWarn, "Enter positive run and rise values.", ["rtRun","rtRise"]); return; }
    const hyp = Math.hypot(run, rise);
    const angle = radToDeg(Math.atan2(rise, run));
    result = {
      primary: `Angle = ${fmt(angle, 4)} deg`,
      stats: [
        { label: "Run", valueHtml: fmtDualHtml(run, units, 6) },
        { label: "Rise", valueHtml: fmtDualHtml(rise, units, 6) },
        { label: "Hypotenuse", valueHtml: fmtDualHtml(hyp, units, 6) },
        { label: "Angle", value: `${fmt(angle, 4)} deg` },
        { label: "Comp. angle", value: `${fmt(90 - angle, 4)} deg` },
        { label: "Slope", value: fmt(rise / run, 6) }
      ],
      details: [
        "Solved angle and hypotenuse from the entered run and rise.",
        "Slope is listed as rise divided by run.",
        "Use this mode when you already know the two offset legs."
      ],
      copyText: [`Marcos's Calculator - Right Triangle`, `Mode: Given run and rise`, `Run: ${fmt(run, 6)} ${units}`, `Rise: ${fmt(rise, 6)} ${units}`, `Hypotenuse: ${fmt(hyp, 6)} ${units}`, `Angle: ${fmt(angle, 4)} deg`, `Comp. angle: ${fmt(90 - angle, 4)} deg`, `Slope: ${fmt(rise / run, 6)}`].join("\n")
    };
  } else if (mode === "hypAngle"){
    const hyp = num(rtHyp.value);
    const angle = num(rtAngle.value);
    if (!(hyp > 0) || !(angle > 0) || !(angle < 90)) { showWarn(rtWarn, "Enter a positive hypotenuse and an angle between 0 and 90 degrees.", ["rtHyp","rtAngle"]); return; }
    const radians = degToRad(angle);
    const run = hyp * Math.cos(radians);
    const rise = hyp * Math.sin(radians);
    result = {
      primary: `Run = ${fmt(run, 6)} ${units}`,
      stats: [
        { label: "Run", valueHtml: fmtDualHtml(run, units, 6) },
        { label: "Rise", valueHtml: fmtDualHtml(rise, units, 6) },
        { label: "Hypotenuse", valueHtml: fmtDualHtml(hyp, units, 6) },
        { label: "Angle", value: `${fmt(angle, 4)} deg` },
        { label: "Comp. angle", value: `${fmt(90 - angle, 4)} deg` },
        { label: "Slope", value: fmt(rise / run, 6) }
      ],
      details: [
        "Solved run and rise from the hypotenuse and the included angle.",
        "Angles must stay between 0 and 90 degrees for this right-triangle solver.",
        "The selected unit is carried through the answer cards and copied output."
      ],
      copyText: [`Marcos's Calculator - Right Triangle`, `Mode: Given hypotenuse and angle`, `Hypotenuse: ${fmt(hyp, 6)} ${units}`, `Angle: ${fmt(angle, 4)} deg`, `Comp. angle: ${fmt(90 - angle, 4)} deg`, `Run: ${fmt(run, 6)} ${units}`, `Rise: ${fmt(rise, 6)} ${units}`, `Slope: ${fmt(rise / run, 6)}`].join("\n")
    };
  } else if (mode === "runAngle"){
    const run = num(rtRun.value);
    const angle = num(rtAngle.value);
    if (!(run > 0) || !(angle > 0) || !(angle < 90)) { showWarn(rtWarn, "Enter a positive run and an angle between 0 and 90 degrees.", ["rtRun","rtAngle"]); return; }
    const radians = degToRad(angle);
    const rise = run * Math.tan(radians);
    const hyp = run / Math.cos(radians);
    result = {
      primary: `Rise = ${fmt(rise, 6)} ${units}`,
      stats: [
        { label: "Run", valueHtml: fmtDualHtml(run, units, 6) },
        { label: "Rise", valueHtml: fmtDualHtml(rise, units, 6) },
        { label: "Hypotenuse", valueHtml: fmtDualHtml(hyp, units, 6) },
        { label: "Angle", value: `${fmt(angle, 4)} deg` },
        { label: "Comp. angle", value: `${fmt(90 - angle, 4)} deg` },
        { label: "Slope", value: fmt(rise / run, 6) }
      ],
      details: [
        "Solved rise and hypotenuse from the run plus included angle.",
        "This is useful when the horizontal travel is fixed and you need the vertical offset.",
        "Press Enter after editing any field to solve immediately."
      ],
      copyText: [`Marcos's Calculator - Right Triangle`, `Mode: Given run and angle`, `Run: ${fmt(run, 6)} ${units}`, `Angle: ${fmt(angle, 4)} deg`, `Comp. angle: ${fmt(90 - angle, 4)} deg`, `Rise: ${fmt(rise, 6)} ${units}`, `Hypotenuse: ${fmt(hyp, 6)} ${units}`, `Slope: ${fmt(rise / run, 6)}`].join("\n")
    };
  } else {
    const rise = num(rtRise.value);
    const angle = num(rtAngle.value);
    if (!(rise > 0) || !(angle > 0) || !(angle < 90)) { showWarn(rtWarn, "Enter a positive rise and an angle between 0 and 90 degrees.", ["rtRise","rtAngle"]); return; }
    const radians = degToRad(angle);
    const run = rise / Math.tan(radians);
    const hyp = rise / Math.sin(radians);
    result = {
      primary: `Run = ${fmt(run, 6)} ${units}`,
      stats: [
        { label: "Run", valueHtml: fmtDualHtml(run, units, 6) },
        { label: "Rise", valueHtml: fmtDualHtml(rise, units, 6) },
        { label: "Hypotenuse", valueHtml: fmtDualHtml(hyp, units, 6) },
        { label: "Angle", value: `${fmt(angle, 4)} deg` },
        { label: "Comp. angle", value: `${fmt(90 - angle, 4)} deg` },
        { label: "Slope", value: fmt(rise / run, 6) }
      ],
      details: [
        "Solved run and hypotenuse from the rise plus included angle.",
        "Use this mode when the vertical offset is fixed and you need the horizontal reach.",
        "The selected unit is preserved in both the visible answer and the copied summary."
      ],
      copyText: [`Marcos's Calculator - Right Triangle`, `Mode: Given rise and angle`, `Rise: ${fmt(rise, 6)} ${units}`, `Angle: ${fmt(angle, 4)} deg`, `Comp. angle: ${fmt(90 - angle, 4)} deg`, `Run: ${fmt(run, 6)} ${units}`, `Hypotenuse: ${fmt(hyp, 6)} ${units}`, `Slope: ${fmt(rise / run, 6)}`].join("\n")
    };
  }
  setResult("triangle", { animate: true, saveHistory: true, formState: captureFormInputs(triangleForm), primary: result.primary, stats: result.stats, detailsHtml: renderList(result.details), copyText: result.copyText });
});

document.getElementById("btnRtClear").addEventListener("click", () => {
  const saved = captureFormInputs(triangleForm);
  unitController.reset(triangleForm);
  rtMode.value = "runRise";
  updateTriangleFields();
  updateTriangleDiagram();
  showWarn(rtWarn, "");
  setResult("triangle", {
    primary: "Solved offsets and angle details will show here.",
    stats: [],
    detailsHtml: renderList([
      "The selected unit now carries through the answer cards so the choice has a visible effect.",
      "Press Enter in any field to solve without leaving the keyboard."
    ]),
    copyText: ""
  });
  showToast("Offset solver form cleared.", () => {
    restoreFormInputs(triangleForm, saved);
    updateTriangleFields();
    updateTriangleDiagram();
  });
});

// ── Thread → MOW crosslink handler ──
document.getElementById("threadToMow").addEventListener("click", () => {
  const btn = document.getElementById("threadToMow");
  mowUnits.value = btn.dataset.mowUnits || "mm";
  unitController.sync(mowForm);
  mowMode.value = "solveM";
  syncModeButtons();
  updateMowHints();
  mowPitchInput.value = btn.dataset.mowPitchInput || "";
  mowWire.value = btn.dataset.mowWire || "";
  mowE.value = btn.dataset.mowPitchE || "";
  mowM.value = "";
  mowPreset.value = "";
  mowPresetNote.textContent = "";
  showWarn(mowWarn, "");
  openTool("mow", { scroll: true, animate: true });
  requestFormSubmit(mowForm);
});

// ── Speeds & Feeds calculator ──
// SFM defaults (surface feet per minute) keyed by [material][toolType]
// Values are conservative shop starting points — user overrides any time.
const SF_DEFAULTS = {
  aluminum:   { hss: { sfm: 250, chipIn: 0.003 }, carbide: { sfm: 800, chipIn: 0.004 }, coated:  { sfm: 1000, chipIn: 0.005 } },
  brass:      { hss: { sfm: 200, chipIn: 0.003 }, carbide: { sfm: 500, chipIn: 0.003 }, coated:  { sfm: 600,  chipIn: 0.003 } },
  mildSteel:  { hss: { sfm: 90,  chipIn: 0.002 }, carbide: { sfm: 350, chipIn: 0.003 }, coated:  { sfm: 450,  chipIn: 0.003 } },
  alloySteel: { hss: { sfm: 70,  chipIn: 0.0015 }, carbide: { sfm: 280, chipIn: 0.0025 }, coated: { sfm: 380, chipIn: 0.003 } },
  stainless:  { hss: { sfm: 50,  chipIn: 0.0015 }, carbide: { sfm: 180, chipIn: 0.002 }, coated:  { sfm: 250, chipIn: 0.0025 } },
  toolSteel:  { hss: { sfm: 40,  chipIn: 0.001 }, carbide: { sfm: 150, chipIn: 0.0015 }, coated:  { sfm: 220, chipIn: 0.002 } },
  castIron:   { hss: { sfm: 80,  chipIn: 0.002 }, carbide: { sfm: 300, chipIn: 0.003 }, coated:  { sfm: 380, chipIn: 0.003 } },
  titanium:   { hss: { sfm: 40,  chipIn: 0.0015 }, carbide: { sfm: 150, chipIn: 0.002 }, coated: { sfm: 220, chipIn: 0.0025 } },
  plastic:    { hss: { sfm: 300, chipIn: 0.004 }, carbide: { sfm: 600, chipIn: 0.005 }, coated:  { sfm: 700, chipIn: 0.005 } }
};
const MATERIAL_LABELS = {
  aluminum: "Aluminum (6061)", brass: "Brass / Bronze", mildSteel: "Mild steel (1018)",
  alloySteel: "Alloy steel (4140)", stainless: "Stainless (304/316)", toolSteel: "Tool steel (hardened)",
  castIron: "Cast iron", titanium: "Titanium", plastic: "Plastic", custom: "Custom"
};
const TOOL_LABELS = { hss: "HSS", carbide: "Carbide", coated: "Coated carbide" };

const feedsForm = document.getElementById("feedsForm");
const sfUnits = document.getElementById("sfUnits");
const sfTool = document.getElementById("sfTool");
const sfMaterial = document.getElementById("sfMaterial");
const sfOperation = document.getElementById("sfOperation");
const sfDiameter = document.getElementById("sfDiameter");
const sfFlutes = document.getElementById("sfFlutes");
const sfSpeed = document.getElementById("sfSpeed");
const sfChipLoad = document.getElementById("sfChipLoad");
const sfWoc = document.getElementById("sfWoc");
const sfDoc = document.getElementById("sfDoc");
const sfWarn = document.getElementById("sfWarn");
const sfSpeedLabel = document.getElementById("sfSpeedLabel");
const sfDiameterUnit = document.getElementById("sfDiameterUnit");
const sfChipUnit = document.getElementById("sfChipUnit");
const sfWocUnit = document.getElementById("sfWocUnit");
const sfDocUnit = document.getElementById("sfDocUnit");
const sfAutoSummary = document.getElementById("sfAutoSummary");

function sfSyncUnitLabels(){
  const isIn = sfUnits.value === "in";
  sfSpeedLabel.textContent = isIn ? "Surface speed (SFM)" : "Surface speed (SMM)";
  const dimensionUnit = isIn ? "in" : "mm";
  sfDiameterUnit.textContent = dimensionUnit;
  sfChipUnit.textContent = `${dimensionUnit}/tooth`;
  sfWocUnit.textContent = dimensionUnit;
  sfDocUnit.textContent = dimensionUnit;
  // Update chip load + diameter placeholders (hint only)
  sfDiameter.placeholder = isIn ? "0.375" : "6";
  const defaults = getSfDefaults();
  if (defaults){
    const chip = isIn ? defaults.chipIn : defaults.chipIn * 25.4;
    sfChipLoad.placeholder = isIn ? chip.toFixed(4) : chip.toFixed(3);
    const speed = isIn ? defaults.sfm : defaults.sfm * 0.3048;
    sfSpeed.placeholder = isIn ? String(Math.round(defaults.sfm)) : speed.toFixed(1);
    const speedCopy = sfSpeed.value.trim() ? `${sfSpeed.value.trim()} ${isIn ? "SFM" : "SMM"} override` : `Auto ${sfSpeed.placeholder} ${isIn ? "SFM" : "SMM"}`;
    const chipCopy = sfChipLoad.value.trim() ? `${sfChipLoad.value.trim()} ${dimensionUnit}/tooth override` : `Auto ${sfChipLoad.placeholder} ${dimensionUnit}/tooth`;
    sfAutoSummary.textContent = `${speedCopy} · ${chipCopy}`;
  } else {
    sfSpeed.placeholder = "required for custom material";
    sfChipLoad.placeholder = "required for custom material";
    sfAutoSummary.textContent = sfSpeed.value.trim() && sfChipLoad.value.trim()
      ? "Using custom speed and chip-load overrides."
      : "Custom material requires speed and chip-load overrides.";
  }
}
function getSfDefaults(){
  const mat = sfMaterial.value;
  const tool = sfTool.value;
  const base = getWorkspaceMaterialDefaults(mat) || SF_DEFAULTS[mat]?.[tool] || null;
  if (!base) return null;
  const operationFactors = sfOperation.value === "drilling"
    ? { speed: 0.75, chip: 0.60 }
    : sfOperation.value === "reaming"
      ? { speed: 0.50, chip: 0.35 }
      : { speed: 1, chip: 1 };
  return { sfm: base.sfm * operationFactors.speed, chipIn: base.chipIn * operationFactors.chip };
}
function getMaterialLabel(value){ return workspaceMaterialLabel(value) || MATERIAL_LABELS[value] || value; }
sfUnits.addEventListener("change", sfSyncUnitLabels);
sfMaterial.addEventListener("change", sfSyncUnitLabels);
sfTool.addEventListener("change", sfSyncUnitLabels);
sfOperation.addEventListener("change", () => { sfSyncUnitLabels(); refreshWorkspaceUI(); });
sfSpeed.addEventListener("input", sfSyncUnitLabels);
sfChipLoad.addEventListener("input", sfSyncUnitLabels);
sfSyncUnitLabels();

// Operation presets tweak WOC/DOC expectations
document.querySelectorAll("[data-feed-preset]").forEach(btn => {
  btn.addEventListener("click", () => {
    const preset = btn.dataset.feedPreset;
    const isIn = sfUnits.value === "in";
    const dia = parseDimension(sfDiameter.value, isIn ? "in" : "mm");
    const defaultDia = dia > 0 ? dia : (isIn ? 0.375 : 6);
    switch (preset){
      case "slot":
        sfOperation.value = "milling";
        sfWoc.value = fmt(defaultDia, isIn ? 4 : 3);
        sfDoc.value = fmt(defaultDia * 0.5, isIn ? 4 : 3);
        break;
      case "profile":
        sfOperation.value = "milling";
        sfWoc.value = fmt(defaultDia * 0.30, isIn ? 4 : 3);
        sfDoc.value = fmt(defaultDia * 1.0, isIn ? 4 : 3);
        break;
      case "finish":
        sfOperation.value = "milling";
        sfWoc.value = fmt(defaultDia * 0.10, isIn ? 4 : 3);
        sfDoc.value = fmt(defaultDia * 0.5, isIn ? 4 : 3);
        break;
      case "drill":
        sfOperation.value = "drilling";
        sfWoc.value = fmt(defaultDia, isIn ? 4 : 3);
        sfDoc.value = "";
        if (!sfChipLoad.value){
          const d = getSfDefaults();
          if (d){
            const chip = isIn ? d.chipIn : d.chipIn * 25.4;
            sfChipLoad.value = isIn ? chip.toFixed(4) : chip.toFixed(3);
          }
        }
        break;
    }
    sfSyncUnitLabels();
    requestFormSubmit(feedsForm);
  });
});

feedsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  showWarn(sfWarn, "");
  const isIn = sfUnits.value === "in";
  const tool = sfTool.value;
  const material = sfMaterial.value;
  const operation = sfOperation.value;
  const dia = parseDimension(sfDiameter.value, isIn ? "in" : "mm");
  const flutes = num(sfFlutes.value);
  if (!(dia > 0)){ showWarn(sfWarn, "Tool diameter must be positive.", ["sfDiameter"]); return; }
  if (!(flutes >= 1 && Number.isInteger(flutes))){ showWarn(sfWarn, "Flutes must be an integer of 1 or more.", ["sfFlutes"]); return; }
  // Bounds — avoid nonsense
  if (isIn){
    if (dia < 0.01 || dia > 4){ showWarn(sfWarn, "Tool diameter should be between 0.01 in and 4 in.", ["sfDiameter"]); return; }
  } else {
    if (dia < 0.25 || dia > 100){ showWarn(sfWarn, "Tool diameter should be between 0.25 mm and 100 mm.", ["sfDiameter"]); return; }
  }
  if (flutes > 12){ showWarn(sfWarn, "Flute count over 12 is unusual — double check.", ["sfFlutes"]); return; }

  const defaults = getSfDefaults();
  let surfaceSpeedUserIn = num(sfSpeed.value);
  let chipLoadUser = parseDimension(sfChipLoad.value, isIn ? "in" : "mm");
  let sfm; // always carry SFM internally, convert for display
  let chipIn; // chip load per tooth in inches
  let sourceNotes = [];
  if (surfaceSpeedUserIn > 0){
    sfm = isIn ? surfaceSpeedUserIn : surfaceSpeedUserIn / 0.3048;
    sourceNotes.push("Surface speed: user override.");
  } else if (defaults){
    sfm = defaults.sfm;
    sourceNotes.push(`Surface speed: ${getMaterialLabel(material)} + ${TOOL_LABELS[tool]} ${operation} starting point.`);
  } else {
    showWarn(sfWarn, "Enter a surface speed (custom material has no default).", ["sfSpeed"]);
    return;
  }
  if (chipLoadUser > 0){
    chipIn = isIn ? chipLoadUser : chipLoadUser / 25.4;
    sourceNotes.push("Chip load: user override.");
  } else if (defaults){
    chipIn = defaults.chipIn;
    sourceNotes.push(`Chip load: ${getMaterialLabel(material)} + ${TOOL_LABELS[tool]} ${operation} starting point.`);
  } else {
    showWarn(sfWarn, "Enter a chip load per tooth (custom material has no default).", ["sfChipLoad"]);
    return;
  }
  const dInches = isIn ? dia : dia / 25.4;
  const wocVal = parseDimension(sfWoc.value, isIn ? "in" : "mm");
  const docVal = parseDimension(sfDoc.value, isIn ? "in" : "mm");
  const activeMachine = getActiveMachineProfile();
  const machineMaxFeed = machineFeedLimit(activeMachine, isIn ? "in" : "mm");
  const calculated = calculateSpeedsFeeds({
    units: isIn ? "in" : "mm",
    diameter: dia,
    flutes,
    sfm,
    chipLoadIn: chipIn,
    widthOfCut: wocVal,
    depthOfCut: docVal,
    maxRpm: activeMachine?.maxRpm || Infinity,
    maxFeed: machineMaxFeed
  });
  const { rpm, feed, chipScale, thinningFactor, programmedChipIn: chipInAdj, mrr: mrrValue, requestedRpm, requestedFeed, limitedByRpm, limitedByFeed } = calculated;
  const scaleNote = `Chip load scaled ×${fmt(chipScale, 2)} for tool diameter ${fmt(dInches, 3)} in vs. the 0.375 in reference.`;
  const thinningNote = thinningFactor > 1
    ? `Radial chip-thinning compensation applied: WOC is ${fmt((wocVal / dia) * 100, 1)}% of D, increasing programmed chip load by ×${fmt(thinningFactor, 2)}.`
    : null;
  const feedLabel = isIn ? "IPM" : "mm/min";

  let mrrLine = null;
  if (mrrValue !== null){
    const mrrLabel = isIn ? "in³/min" : "mm³/min";
    mrrLine = `Material removal rate: ${fmt(mrrValue, isIn ? 4 : 2)} ${mrrLabel} (WOC × DOC × limited feed).`;
  }

  const matLabel = getMaterialLabel(material);
  const toolLbl = TOOL_LABELS[tool] || tool;
  const unitSpeed = isIn ? "SFM" : "SMM";
  const surfaceDisplay = isIn ? fmt(sfm, 0) : fmt(sfm * 0.3048, 1);
  const chipDisplay = isIn ? fmt(chipInAdj, 5) : fmt(chipInAdj * 25.4, 4);
  const diaDisplay = `${fmt(dia, isIn ? 4 : 3)} ${isIn ? "in" : "mm"}`;

  const formState = captureFormInputs(feedsForm);
  const stats = [
    { label: "Spindle RPM", value: fmt(rpm, 0) },
    { label: `Feed rate (${feedLabel})`, value: fmt(feed, isIn ? 1 : 0) },
    { label: "Surface speed", value: `${surfaceDisplay} ${unitSpeed}` },
    { label: "Chip load / tooth", value: `${chipDisplay} ${isIn ? "in" : "mm"}` },
    { label: "Flutes", value: String(flutes) },
    { label: "Tool diameter", value: diaDisplay }
  ];
  if (mrrValue !== null){
    stats.push({ label: "MRR", value: `${fmt(mrrValue, isIn ? 4 : 2)} ${isIn ? "in³/min" : "mm³/min"}` });
  }
  if (limitedByRpm) stats.push({ label: "Requested RPM", value: fmt(requestedRpm, 0) });
  if (limitedByFeed) stats.push({ label: `Requested feed (${feedLabel})`, value: fmt(requestedFeed, isIn ? 1 : 0) });
  if (activeMachine) stats.push({ label: "Machine profile", value: activeMachine.name });
  const detailsItems = [
    `Material: ${matLabel}. Tool: ${toolLbl}. Operation: ${operation}.`,
    ...sourceNotes,
    scaleNote,
    ...(thinningNote ? [thinningNote] : []),
    isIn
      ? `RPM = (SFM × 12) ÷ (π × D) = (${fmt(sfm, 0)} × 12) ÷ (π × ${fmt(dia, 4)}) = ${fmt(rpm, 0)}`
      : `RPM = (SMM × 1000) ÷ (π × D) = (${fmt(sfm * 0.3048, 1)} × 1000) ÷ (π × ${fmt(dia, 3)}) = ${fmt(rpm, 0)}`,
    `Feed = RPM × flutes × chip load = ${fmt(rpm, 0)} × ${flutes} × ${chipDisplay} = ${fmt(feed, isIn ? 1 : 0)} ${feedLabel}`,
    ...(limitedByRpm ? [`Machine RPM limit applied: requested ${fmt(requestedRpm, 0)}, capped at ${fmt(rpm, 0)}.`] : []),
    ...(limitedByFeed ? [`Machine feed limit applied: requested ${fmt(requestedFeed, isIn ? 1 : 0)} ${feedLabel}, capped at ${fmt(feed, isIn ? 1 : 0)} ${feedLabel}.`] : []),
    ...(mrrLine ? [mrrLine] : []),
    "Start conservative; ramp up once you see stable chips and good surface finish. These numbers are shop starting points, not guarantees."
  ];
  const copyText = [
    `Marcos's Calculator - Speeds & Feeds`,
    `Material: ${matLabel}`,
    `Tool: ${toolLbl}, ${diaDisplay}, ${flutes} flutes (${operation})`,
    `Surface speed: ${surfaceDisplay} ${unitSpeed}`,
    `Chip load per tooth: ${chipDisplay} ${isIn ? "in" : "mm"}`,
    `Spindle RPM: ${fmt(rpm, 0)}`,
    `Feed rate: ${fmt(feed, isIn ? 1 : 0)} ${feedLabel}`,
    ...(activeMachine ? [`Machine: ${activeMachine.name}${limitedByRpm || limitedByFeed ? " (limits applied)" : ""}`] : []),
    ...(mrrValue !== null ? [`MRR: ${fmt(mrrValue, isIn ? 4 : 2)} ${isIn ? "in³/min" : "mm³/min"}`] : [])
  ].join("\n");

  setResult("feeds", {
    animate: true,
    saveHistory: true,
    formState,
    primary: `${fmt(rpm, 0)} RPM  •  ${fmt(feed, isIn ? 1 : 0)} ${feedLabel}`,
    stats,
    detailsHtml: renderList(detailsItems) + renderProvenance("feeds"),
    copyText
  });
});

document.getElementById("btnSfClear").addEventListener("click", () => {
  const saved = captureFormInputs(feedsForm);
  unitController.reset(feedsForm);
  sfTool.value = "carbide";
  sfMaterial.value = "mildSteel";
  sfFlutes.value = "2";
  sfSyncUnitLabels();
  showWarn(sfWarn, "");
  setResult("feeds", {
    primary: "Spindle RPM and feed rate will show here.",
    stats: [],
    detailsHtml: renderList([
      "Defaults are conservative shop starting points — always sanity-check against tool-maker data.",
      "Leave surface speed and chip load blank to use the material + tool-type defaults.",
      "Enter width of cut (WOC) and depth of cut (DOC) to estimate material removal rate."
    ]),
    copyText: ""
  });
  showToast("Speeds & feeds form cleared.", () => {
    restoreFormInputs(feedsForm, saved);
    sfSyncUnitLabels();
  });
});

// ── Chamfer / Countersink depth ──
// Z-depth = (D2 − D1) / (2 · tan(angle/2))
// Works for countersinks (D2 = head diameter, angle = included), 82° flat-head
// machine screws, and generic chamfer tools.
(function initChamfer(){
  const form = document.getElementById("chamferForm");
  if (!form) return;
  const chUnits = document.getElementById("chUnits");
  const chAngle = document.getElementById("chAngle");
  const chSmall = document.getElementById("chSmall");
  const chLarge = document.getElementById("chLarge");
  const chWarn = document.getElementById("chWarn");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    showWarn(chWarn, "");
    const units = unitLabel(chUnits.value);
    const angleDeg = num(chAngle.value);
    const d1 = num(chSmall.value);
    const d2 = num(chLarge.value);
    if (!(angleDeg > 0 && angleDeg < 180)){
      showWarn(chWarn, "Included angle must be between 0 and 180 degrees.", ["chAngle"]); return;
    }
    if (!(d1 >= 0)) { showWarn(chWarn, "Hole diameter (D1) must be zero or positive.", ["chSmall"]); return; }
    if (!(d2 > 0)) { showWarn(chWarn, "Top diameter (D2) must be positive.", ["chLarge"]); return; }
    if (d2 <= d1){ showWarn(chWarn, "Top diameter (D2) must be larger than hole diameter (D1).", ["chLarge","chSmall"]); return; }
    const depth = chamferDepth(d1, d2, angleDeg);
    const widthChamfer = (d2 - d1) / 2; // radial face width
    const dp = chUnits.value === "in" ? 4 : 3;
    const formState = captureFormInputs(form);
    setResult("chamfer", {
      animate: true,
      saveHistory: true,
      formState,
      primary: `Z depth = ${fmt(depth, dp)} ${units}`,
      stats: [
        { label: "Included angle", value: `${fmt(angleDeg, 2)}°` },
        { label: "Hole D1", valueHtml: fmtDualHtml(d1, chUnits.value, dp) },
        { label: "Top D2", valueHtml: fmtDualHtml(d2, chUnits.value, dp) },
        { label: "Radial width", valueHtml: fmtDualHtml(widthChamfer, chUnits.value, dp) },
        { label: "Z depth", valueHtml: fmtDualHtml(depth, chUnits.value, dp) }
      ],
      detailsHtml: renderList([
        "Depth is measured along the tool axis from the D2 edge down to where the tool reaches D1.",
        "For countersinks, use the fastener-head diameter for D2 and the clearance-hole diameter for D1.",
        "Common angles: 82° flat-head machine screws, 90° DIN/ISO countersunk screws, 100° aerospace flush heads, 120° general chamfer."
      ]) + renderCodeCard("Formula snapshot", [
        `Z depth = (D2 - D1) / (2 × tan(angle/2))`,
        `       = (${fmt(d2, dp)} - ${fmt(d1, dp)}) / (2 × tan(${fmt(angleDeg/2, 2)}°))`,
        `       = ${fmt(depth, dp)} ${units}`
      ].join("\n")),
      copyText: [
        "Marcos's Calculator - Chamfer/Countersink Depth",
        `Included angle: ${fmt(angleDeg, 2)}°`,
        `Hole diameter D1: ${fmt(d1, dp)} ${units}`,
        `Top diameter D2: ${fmt(d2, dp)} ${units}`,
        `Z depth: ${fmt(depth, dp)} ${units}`
      ].join("\n")
    });
  });
  const clearBtn = document.getElementById("btnChClear");
  if (clearBtn){
    clearBtn.addEventListener("click", () => {
      const saved = captureFormInputs(form);
      unitController.reset(form);
      chAngle.value = "82";
      showWarn(chWarn, "");
      setResult("chamfer", {
        primary: "Depth will appear here.", stats: [], detailsHtml: "", copyText: ""
      });
      showToast("Chamfer form cleared.", () => restoreFormInputs(form, saved));
    });
  }
})();

// ── Circle through 3 points ──
// Find circumcenter from perpendicular bisectors; diameter = 2·r.
// Given 3 points (x1,y1), (x2,y2), (x3,y3):
//   Using determinant form:
//   D = 2 · ((x1)(y2 − y3) + (x2)(y3 − y1) + (x3)(y1 − y2))
//   Ux = ((x1²+y1²)(y2 − y3) + (x2²+y2²)(y3 − y1) + (x3²+y3²)(y1 − y2)) / D
//   Uy = ((x1²+y1²)(x3 − x2) + (x2²+y2²)(x1 − x3) + (x3²+y3²)(x2 − x1)) / D
//   If D ≈ 0 the points are collinear (no unique circle).
(function initCircle3(){
  const form = document.getElementById("circle3Form");
  if (!form) return;
  const c3Units = document.getElementById("c3Units");
  const c3Warn = document.getElementById("c3Warn");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    showWarn(c3Warn, "");
    const units = unitLabel(c3Units.value);
    const pts = [
      [num(document.getElementById("c3x1").value), num(document.getElementById("c3y1").value)],
      [num(document.getElementById("c3x2").value), num(document.getElementById("c3y2").value)],
      [num(document.getElementById("c3x3").value), num(document.getElementById("c3y3").value)]
    ];
    for (const [x, y] of pts){
      if (!Number.isFinite(x) || !Number.isFinite(y)){
        showWarn(c3Warn, "All six coordinates must be valid numbers.", ["c3x1","c3y1","c3x2","c3y2","c3x3","c3y3"]); return;
      }
    }
    const [[x1, y1], [x2, y2], [x3, y3]] = pts;
    const D = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    const solvedCircle = circleThrough3Points(pts[0], pts[1], pts[2]);
    if (!solvedCircle){
      showWarn(c3Warn, "The three points look collinear — no unique circle passes through them.");
      return;
    }
    const { x: ux, y: uy, radius: r, diameter: dia } = solvedCircle;
    const dp = c3Units.value === "in" ? 4 : 3;
    const formState = captureFormInputs(form);
    setResult("circle3", {
      animate: true,
      saveHistory: true,
      formState,
      primary: `Center (${fmt(ux, dp)}, ${fmt(uy, dp)}) ${units}  •  Ø ${fmt(dia, dp)} ${units}`,
      stats: [
        { label: "Center X", valueHtml: fmtDualHtml(ux, c3Units.value, dp) },
        { label: "Center Y", valueHtml: fmtDualHtml(uy, c3Units.value, dp) },
        { label: "Radius", valueHtml: fmtDualHtml(r, c3Units.value, dp) },
        { label: "Diameter", valueHtml: fmtDualHtml(dia, c3Units.value, dp) }
      ],
      detailsHtml: renderList([
        "Useful for back-computing a bore center from three probe touches on the inside of an arc.",
        "If the probed points are close to a straight line the answer gets noisy — spread them out around the arc for best accuracy.",
        "Coordinates use the same system as your input (machine XY, part XY — whatever you typed in)."
      ]) + renderCodeCard("Formula snapshot", [
        `D  = 2·(x1(y2−y3) + x2(y3−y1) + x3(y1−y2)) = ${fmt(D, 6)}`,
        `Xc = ${fmt(ux, dp)} ${units}`,
        `Yc = ${fmt(uy, dp)} ${units}`,
        `R  = √((x1−Xc)² + (y1−Yc)²) = ${fmt(r, dp)} ${units}`,
        `Ø  = ${fmt(dia, dp)} ${units}`
      ].join("\n")),
      copyText: [
        "Marcos's Calculator - Circle Through 3 Points",
        `P1: (${fmt(x1, dp)}, ${fmt(y1, dp)}) ${units}`,
        `P2: (${fmt(x2, dp)}, ${fmt(y2, dp)}) ${units}`,
        `P3: (${fmt(x3, dp)}, ${fmt(y3, dp)}) ${units}`,
        `Center: (${fmt(ux, dp)}, ${fmt(uy, dp)}) ${units}`,
        `Radius: ${fmt(r, dp)} ${units}`,
        `Diameter: ${fmt(dia, dp)} ${units}`
      ].join("\n")
    });
  });
  const clearBtn = document.getElementById("btnC3Clear");
  if (clearBtn){
    clearBtn.addEventListener("click", () => {
      const saved = captureFormInputs(form);
      unitController.reset(form);
      showWarn(c3Warn, "");
      setResult("circle3", {
        primary: "Center and diameter will appear here.", stats: [], detailsHtml: "", copyText: ""
      });
      showToast("Circle form cleared.", () => restoreFormInputs(form, saved));
    });
  }
})();

// ── Advanced shop math ──
(function initAdvancedMath(){
  const form = document.getElementById("advancedForm");
  if (!form) return;
  const mode = document.getElementById("advancedMode");
  const unitsEl = document.getElementById("advancedUnits");
  const warn = document.getElementById("advancedWarn");
  const stackRows = document.getElementById("stackRows");
  const readDim = (id) => parseDimension(document.getElementById(id).value, unitsEl.value);
  const dp = () => unitsEl.value === "in" ? 5 : 3;
  const units = () => unitLabel(unitsEl.value);
  const syncPanels = () => {
    document.querySelectorAll("[data-advanced-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.advancedPanel !== mode.value;
    });
  };
  mode.addEventListener("change", syncPanels);
  document.addEventListener("form-restored", event => { if (event.detail === form) syncPanels(); });
  syncPanels();

  function addStackRow(nominal = "0", tolerance = "0.001"){
    const row = document.createElement("div");
    row.className = "stack-row";
    row.dataset.stackRow = "";
    row.innerHTML = `<div class="field"><label>Nominal</label><input data-stack-nominal aria-label="Stack nominal" type="text" inputmode="decimal" value="${escapeHtml(nominal)}" /></div><div class="field"><label>± tolerance</label><input data-stack-tolerance aria-label="Stack tolerance" type="text" inputmode="decimal" value="${escapeHtml(tolerance)}" /></div><button class="mini-btn danger" type="button" data-stack-remove>Remove</button>`;
    stackRows.appendChild(row);
  }
  document.getElementById("addStackRow").addEventListener("click", () => addStackRow());
  stackRows.addEventListener("click", (event) => {
    const button = event.target.closest("[data-stack-remove]");
    if (!button) return;
    if (stackRows.querySelectorAll("[data-stack-row]").length <= 1){ showToast("Keep at least one stack dimension."); return; }
    button.closest("[data-stack-row]").remove();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    showWarn(warn, "");
    const selected = mode.value;
    const u = units();
    const places = dp();
    let primary = "";
    let stats = [];
    let details = [];
    let formula = "";
    try {
      if (selected === "tapping"){
        const requestedRpm = num(document.getElementById("advTapRpm").value);
        const machine = getActiveMachineProfile();
        const thread = parseDimension(document.getElementById("advTapThread").value, unitsEl.value);
        if (!(requestedRpm > 0) || !(thread > 0)) throw new Error("Enter a positive RPM and TPI/pitch.");
        const lead = unitsEl.value === "in" ? 1 / thread : thread;
        const rpm = Math.min(requestedRpm, machine?.maxRpm || Infinity, machineFeedLimit(machine, unitsEl.value) / lead);
        const result = unitsEl.value === "in" ? tappingFeed({ units: "in", rpm, tpi: thread }) : tappingFeed({ units: "mm", rpm, pitch: thread });
        primary = `Tap feed = ${fmt(result.feed, unitsEl.value === "in" ? 3 : 1)} ${unitsEl.value === "in" ? "IPM" : "mm/min"}`;
        stats = [{ label: "RPM", value: fmt(rpm, 0) }, { label: unitsEl.value === "in" ? "TPI" : "Pitch", value: `${fmt(thread, 4)}${unitsEl.value === "mm" ? " mm" : ""}` }, { label: "Lead / rev", value: `${fmt(result.lead, places)} ${u}` }];
        if (rpm < requestedRpm) stats.push({ label: "Requested RPM", value: fmt(requestedRpm, 0) });
        details = ["Feed is synchronized to spindle speed and thread lead.", ...(rpm < requestedRpm ? [`${machine.name} RPM/feed envelope applied: ${fmt(requestedRpm, 0)} RPM requested, ${fmt(rpm, 0)} RPM used.`] : []), "Use the machine or control maker's rigid-tapping requirements before running the cycle."];
        formula = `Feed = RPM × lead = ${fmt(rpm, 0)} × ${fmt(result.lead, places)} = ${fmt(result.feed, places)}`;
      } else if (selected === "threadMill"){
        const majorDiameter = readDim("advTmMajor");
        const cutterDiameter = readDim("advTmCutter");
        const requestedRpm = num(document.getElementById("advTmRpm").value);
        const machine = getActiveMachineProfile();
        const rpm = Math.min(requestedRpm, machine?.maxRpm || Infinity);
        const flutes = num(document.getElementById("advTmFlutes").value);
        const chipLoad = readDim("advTmChip");
        if (![majorDiameter, cutterDiameter, rpm, flutes, chipLoad].every((value) => value > 0)) throw new Error("All thread-milling values must be positive.");
        const result = threadMilling({ units: unitsEl.value, majorDiameter, cutterDiameter, rpm, flutes, chipLoad });
        const programFeed = Math.min(result.centerlineFeed, machineFeedLimit(machine, unitsEl.value));
        const feedLimited = programFeed < result.centerlineFeed;
        primary = `Program ${fmt(programFeed, places)} ${unitsEl.value === "in" ? "IPM" : "mm/min"}`;
        stats = [{ label: "Tool-path diameter", value: `${fmt(result.pathDiameter, places)} ${u}` }, { label: "Surface feed", value: fmt(result.surfaceFeed, places) }, { label: "Centerline feed", value: fmt(result.centerlineFeed, places) }];
        if (rpm < requestedRpm) stats.push({ label: "RPM limit", value: `${fmt(requestedRpm, 0)} → ${fmt(rpm, 0)} (${machine.name})` });
        if (feedLimited) stats.push({ label: "Feed limit", value: `${fmt(result.centerlineFeed, places)} → ${fmt(programFeed, places)} (${machine.name})` });
        details = ["For an internal thread, centerline feed is reduced by the tool-path-to-finished-diameter ratio.", ...(rpm < requestedRpm ? [`${machine.name} RPM ceiling was applied.`] : []), ...(feedLimited ? [`${machine.name} feed ceiling was applied.`] : []), "Confirm climb/conventional direction, cutter compensation, and controller arc behavior."];
        formula = `Centerline feed = RPM × flutes × chip load × (path Ø / thread Ø)`;
      } else if (selected === "reamer"){
        const targetDiameter = readDim("advReamTarget");
        const allowancePerSide = readDim("advReamAllowance");
        if (!(targetDiameter > 0) || !(allowancePerSide >= 0)) throw new Error("Enter a positive target and a non-negative allowance.");
        const result = reamerAllowance({ targetDiameter, allowancePerSide });
        if (!(result.preReamDiameter > 0)) throw new Error("Allowance is larger than the target diameter.");
        primary = `Pre-ream hole = ${fmt(result.preReamDiameter, places)} ${u}`;
        stats = [{ label: "Target", value: `${fmt(targetDiameter, places)} ${u}` }, { label: "Allowance / side", value: `${fmt(allowancePerSide, places)} ${u}` }, { label: "Total stock", value: `${fmt(result.totalAllowance, places)} ${u}` }];
        details = ["Allowance depends on material, hole quality, reamer geometry, and diameter.", "Use this subtraction as a setup aid, then verify against the reamer manufacturer's recommendation."];
        formula = `Pre-ream Ø = target Ø − 2 × allowance/side`;
      } else if (selected === "sine"){
        const solveFor = document.getElementById("advSineMode").value;
        const barLength = readDim("advSineLength");
        if (!(barLength > 0)) throw new Error("Bar length must be positive.");
        if (solveFor === "height"){
          const angle = num(document.getElementById("advSineValue").value);
          if (!(angle >= 0 && angle < 90)) throw new Error("Angle must be from 0 up to, but not including, 90 degrees.");
          const height = sineBarHeight({ barLength, angleDegrees: angle });
          primary = `Stack height = ${fmt(height, places)} ${u}`;
          stats = [{ label: "Bar length", value: `${fmt(barLength, places)} ${u}` }, { label: "Angle", value: `${fmt(angle, 4)}°` }];
          formula = `Height = length × sin(angle)`;
        } else {
          const height = readDim("advSineValue");
          const angle = sineBarAngle({ barLength, stackHeight: height });
          if (!Number.isFinite(angle)) throw new Error("Stack height must be no greater than the bar length.");
          primary = `Angle = ${fmt(angle, 5)}°`;
          stats = [{ label: "Bar length", value: `${fmt(barLength, places)} ${u}` }, { label: "Stack height", value: `${fmt(height, places)} ${u}` }];
          formula = `Angle = asin(height / length)`;
        }
        details = ["Use certified blocks and account for the actual roll-center distance of the sine bar."];
      } else if (selected === "taper"){
        const largeDiameter = readDim("advTaperLarge");
        const smallDiameter = readDim("advTaperSmall");
        const length = readDim("advTaperLength");
        if (!(largeDiameter > smallDiameter && smallDiameter >= 0 && length > 0)) throw new Error("Large diameter must exceed the small diameter and length must be positive.");
        const result = taperGeometry({ largeDiameter, smallDiameter, length, units: unitsEl.value });
        primary = `Compound angle = ${fmt(result.halfAngle, 5)}°`;
        stats = [{ label: "Included angle", value: `${fmt(result.includedAngle, 5)}°` }, { label: unitsEl.value === "in" ? "Taper / foot" : "Taper / 304.8 mm", value: `${fmt(result.taperPerFoot, places)} ${u}` }, { label: "Diameter change", value: `${fmt(result.diameterChange, places)} ${u}` }];
        details = ["The compound setting is the half-angle from the spindle axis."];
        formula = `Half-angle = atan(((D − d) / 2) / length)`;
      } else if (selected === "scallop"){
        const solveFor = document.getElementById("advScallopMode").value;
        const radius = readDim("advScallopRadius");
        const value = readDim("advScallopValue");
        if (!(radius > 0) || !(value >= 0)) throw new Error("Radius must be positive and the other value non-negative.");
        if (solveFor === "height"){
          const height = ballNoseScallopHeight({ radius, stepover: value });
          if (!Number.isFinite(height)) throw new Error("Stepover cannot exceed the ball diameter.");
          primary = `Scallop height = ${fmt(height, places)} ${u}`;
          stats = [{ label: "Ball diameter", value: `${fmt(radius * 2, places)} ${u}` }, { label: "Stepover", value: `${fmt(value, places)} ${u}` }];
          formula = `h = R − √(R² − stepover²/4)`;
        } else {
          const stepover = ballNoseStepover({ radius, scallopHeight: value });
          if (!Number.isFinite(stepover)) throw new Error("Scallop height is outside the ball geometry.");
          primary = `Stepover = ${fmt(stepover, places)} ${u}`;
          stats = [{ label: "Ball diameter", value: `${fmt(radius * 2, places)} ${u}` }, { label: "Target scallop", value: `${fmt(value, places)} ${u}` }];
          formula = `Stepover = 2 × √(2Rh − h²)`;
        }
        details = ["This is ideal ball-nose cusp geometry and does not include tool deflection, runout, or surface orientation effects."];
      } else if (selected === "stack"){
        const items = [...stackRows.querySelectorAll("[data-stack-row]")].map((row) => ({ nominal: parseDimension(row.querySelector("[data-stack-nominal]").value, unitsEl.value), tolerance: parseDimension(row.querySelector("[data-stack-tolerance]").value, unitsEl.value) }));
        if (!items.length || items.some((item) => !Number.isFinite(item.nominal) || !(item.tolerance >= 0))) throw new Error("Every stack row needs a valid nominal and non-negative tolerance.");
        const result = toleranceStack(items);
        primary = `Worst case ${fmt(result.worstCaseMin, places)} to ${fmt(result.worstCaseMax, places)} ${u}`;
        stats = [{ label: "Nominal", value: `${fmt(result.nominal, places)} ${u}` }, { label: "Worst-case ±", value: `${fmt(result.worstCaseTolerance, places)} ${u}` }, { label: "RSS ±", value: `${fmt(result.rssTolerance, places)} ${u}` }, { label: "RSS range", value: `${fmt(result.rssMin, places)} to ${fmt(result.rssMax, places)} ${u}` }];
        details = ["Worst case assumes every component lands at the adverse limit.", "RSS is statistical and is only appropriate when independent process distributions justify it."];
        formula = `Worst-case tolerance = Σ|tᵢ|\nRSS tolerance = √Σ(tᵢ²)`;
      }
    } catch (error) {
      showWarn(warn, error.message || "Check the entered values.");
      return;
    }
    const title = mode.options[mode.selectedIndex].text;
    const copyText = [`Marcos's Calculator - ${title}`, primary, ...stats.map((item) => `${item.label}: ${item.value}`), ...details].join("\n");
    setResult("advanced", {
      animate: true,
      saveHistory: true,
      formState: captureFormInputs(form),
      primary,
      stats,
      detailsHtml: renderList(details) + renderCodeCard("Formula snapshot", formula) + renderProvenance("advanced"),
      copyText
    });
  });

  document.getElementById("btnAdvancedClear").addEventListener("click", () => {
    unitController.reset(form);
    syncPanels();
    showWarn(warn, "");
    setResult("advanced", { primary: "Choose a calculator and enter values.", stats: [], detailsHtml: "", copyText: "" });
  });
})();

// ── History clear (event delegation) ──
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-hist-clear]");
  if (!btn) return;
  e.stopPropagation();
  const tool = btn.dataset.histClear;
  try { localStorage.removeItem("marcos_hist_" + tool); } catch {}
  histRender(tool);
});

// ── Input persistence ──
(function initPersistence(){
  const FORMS = ["threadForm", "mowForm", "boltForm", "triangleForm", "feedsForm", "chamferForm", "circle3Form", "advancedForm"];

  // ── Global unit preference ──
  // On first-ever load we seed every unit-bearing select to match the user's
  // locale (US → in, everyone else → mm). Users can still override per-card;
  // their per-form persistence (saved below) wins on every subsequent load.
  function detectDefaultUnit(){
    try {
      const stored = localStorage.getItem("marcos_unit_default");
      if (stored === "in" || stored === "mm") return stored;
    } catch {}
    // Fallback to locale sniff. Imperial regions: US, Liberia, Myanmar.
    let unit = "mm";
    try {
      const loc = (navigator.language || "en-US").toLowerCase();
      if (/-(us|lr|mm)$|^en-us$/.test(loc)) unit = "in";
    } catch {}
    try { localStorage.setItem("marcos_unit_default", unit); } catch {}
    return unit;
  }
  function seedUnitDefaults(){
    const unit = detectDefaultUnit();
    // Only seed selects whose form has no persistence yet. That way users
    // who have already been using the app keep their prior choices.
    const seedMap = {
      mowUnits: "mowForm", bcUnits: "boltForm",
      rtUnits: "triangleForm", sfUnits: "feedsForm",
      chUnits: "chamferForm", c3Units: "circle3Form", advancedUnits: "advancedForm"
    };
    // threadSystem: "un" for in, "metric" for mm.
    let threadSystemPersisted = false;
    try { threadSystemPersisted = !!localStorage.getItem("marcos_persist_threadForm"); } catch {}
    if (!threadSystemPersisted){
      const threadSystemEl = document.getElementById("threadSystem");
      if (threadSystemEl) threadSystemEl.value = unit === "in" ? "un" : "metric";
    }
    Object.entries(seedMap).forEach(([selectId, formId]) => {
      let hasPersist = false;
      try { hasPersist = !!localStorage.getItem("marcos_persist_" + formId); } catch {}
      if (hasPersist) return;
      const el = document.getElementById(selectId);
      if (el && (el.value === "" || el.value !== unit)){
        // Only set if the option exists on the select.
        const hasOption = Array.from(el.options).some(o => o.value === unit);
        if (hasOption){
          unitController.set(selectId, unit);
          if (selectId === "bcUnits") el.dataset.previousUnit = unit;
        }
      }
    });
  }
  seedUnitDefaults();

  initFormPersistence({ forms: FORMS.map(id => document.getElementById(id)), capture: captureFormInputs, restore: restoreFormInputs });
  unitController.sync();
  // Read saved thread reference directly (the select may not have the option yet)
  let savedThreadRef = "basic";
  try {
    const tRaw = localStorage.getItem("marcos_persist_threadForm");
    if (tRaw) savedThreadRef = JSON.parse(tRaw).threadClassRef || "basic";
  } catch {}
  // Sync button/field state after restore
  syncPctButtons();
  syncModeButtons();
  updateThreadFields();
  updateThreadReferenceOptions(savedThreadRef);
  updateThreadPreview();
  updateMowHints();
  updateTriangleFields();
  updateTriangleDiagram();
  sfSyncUnitLabels();
  syncGcodeVisibility();
  document.getElementById("bcUnits").dataset.previousUnit = document.getElementById("bcUnits").value;
})();

document.addEventListener("form-restored", event => {
  const form = event.detail;
  if (form.id === "threadForm") { syncPctButtons(); updateThreadFields(); updateThreadReferenceOptions(form.querySelector("#threadClassRef").value || "basic"); updateThreadPreview(); }
  if (form.id === "mowForm") { syncModeButtons(); updateMowHints(); }
  if (form.id === "triangleForm") { updateTriangleFields(); updateTriangleDiagram(); }
  if (form.id === "feedsForm") { sfSyncUnitLabels(); refreshWorkspaceUI(); }
  const tool = form.closest("[data-tool]")?.dataset.tool;
  if (tool && results[tool].snapshot) resultState.isCurrent(tool);
});

// ── History system ──
const HIST_MAX = 5;
function histLoad(tool){
  try { return JSON.parse(localStorage.getItem("marcos_hist_" + tool)) || []; } catch { return []; }
}
function histSave(tool, entry){
  let arr = histLoad(tool).filter(previous => JSON.stringify(previous.formState) !== JSON.stringify(entry.formState));
  arr.unshift(entry);
  arr = arr.slice(0, HIST_MAX);
  try { localStorage.setItem("marcos_hist_" + tool, JSON.stringify(arr)); } catch {}
}
function histRender(tool){
  const arr = histLoad(tool);
  const listEl = document.getElementById("histList-" + tool);
  const badgeEl = document.getElementById("histBadge-" + tool);
  const sectionEl = document.getElementById("histSection-" + tool);
  if (!listEl) return;
  badgeEl.textContent = arr.length;
  sectionEl.style.display = arr.length === 0 ? "none" : "";
  listEl.innerHTML = arr.map((entry, i) => {
    const ts = new Date(entry.ts);
    const timeStr = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `<div role="listitem"><button class="history-item-btn" type="button" data-hist-tool="${escapeHtml(tool)}" data-hist-index="${i}"><span class="history-item-primary">${escapeHtml(entry.primary)}</span><span class="history-item-time">${escapeHtml(timeStr)}</span></button></div>`;
  }).join("");
}

// History toggle buttons
["thread","mow","bolt","triangle","feeds","chamfer","circle3","advanced"].forEach(tool => {
  const toggleBtn = document.getElementById("histToggle-" + tool);
  const sectionEl = document.getElementById("histSection-" + tool);
  if (toggleBtn && sectionEl){
    toggleBtn.addEventListener("click", () => {
      sectionEl.classList.toggle("open");
      toggleBtn.setAttribute("aria-expanded", sectionEl.classList.contains("open") ? "true" : "false");
    });
  }
});

// History item click — restore form state and recalculate
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-hist-index]");
  if (!btn) return;
  const tool = btn.dataset.histTool;
  const index = Number(btn.dataset.histIndex);
  const entry = histLoad(tool)[index];
  if (!entry) return;
  const form = document.getElementById(tool + "Form");
  if (!form) return;
  restoreFormInputs(form, entry.formState);
  if (tool === "thread"){ syncPctButtons(); updateThreadFields(); updateThreadReferenceOptions(entry.formState.threadClassRef || "basic"); updateThreadPreview(); }
  if (tool === "mow"){ syncModeButtons(); updateMowHints(); }
  if (tool === "triangle"){ updateTriangleFields(); updateTriangleDiagram(); }
  if (tool === "feeds"){ sfSyncUnitLabels(); }
  if (tool === "advanced"){ document.getElementById("advancedMode")?.dispatchEvent(new Event("change")); }
  requestFormSubmit(form);
});

// Initialise history panels on load
["thread","mow","bolt","triangle","feeds","chamfer","circle3","advanced"].forEach(histRender);

// ── Share URL ──
function buildShareUrl(toolName, formState){
  const params = new URLSearchParams();
  params.set("tool", toolName);
  for (const [k, v] of Object.entries(formState)){
    if (v !== "" && v !== null && v !== undefined) params.set(k, v);
  }
  return location.href.split("#")[0] + "#" + params.toString();
}
function parseShareUrl(){
  const hash = location.hash.slice(1);
  if (!hash) return null;
  try {
    const shortcut = hash.match(/^tool-(thread|mow|bolt|triangle|feeds|chamfer|circle3|advanced)$/);
    if (shortcut) return { tool: shortcut[1], formState: null };
    const params = new URLSearchParams(hash);
    const tool = params.get("tool");
    if (!["thread","mow","bolt","triangle","feeds","chamfer","circle3","advanced"].includes(tool)) return null;
    const formState = {};
    for (const [k, v] of params.entries()){ if (k !== "tool") formState[k] = v; }
    return { tool, formState };
  } catch { return null; }
}

// Share button click — use Web Share API when available, else clipboard
const TOOL_SHARE_TITLES = {
  thread: "Thread & Tap Drill",
  mow: "Measurement Over Wires",
  bolt: "Bolt Circle Coordinates",
  triangle: "Right Triangle",
  feeds: "Speeds & Feeds",
  chamfer: "Chamfer & Countersink Depth",
  circle3: "Circle Through 3 Points",
  advanced: "Advanced Shop Math"
};
document.querySelectorAll("[data-share-tool]").forEach(btn => {
  btn.addEventListener("click", async () => {
    const toolName = btn.dataset.shareTool;
    const form = document.getElementById(toolName + "Form");
    if (!form) return;
    if (!resultState.isCurrent(toolName)) return;
    const url = buildShareUrl(toolName, results[toolName].formState);
    const title = "Marcos's Calculator — " + (TOOL_SHARE_TITLES[toolName] || "Result");
    const origText = btn.textContent;
    const flashCopied = () => {
      btn.textContent = "Copied!";
      btn.classList.add("shared");
      window.setTimeout(() => { btn.textContent = origText; btn.classList.remove("shared"); }, 1600);
    };
    // Prefer native share on mobile / supporting browsers
    if (navigator.share){
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        // User cancelled or share failed; fall back to clipboard silently unless cancelled
        if (err && err.name === "AbortError") return;
      }
    }
    try {
      await writeClipboard(url);
      flashCopied();
    } catch {
      showToast("Could not copy link to clipboard.");
    }
  });
});

setResult("thread", {
  primary: "Tap drill and pitch details will show here.",
  stats: [],
  detailsHtml: renderList([
    "Use a quick spec like 1/4-20 or M8x1.25 when you want the fastest workflow.",
    "The calculated tap drill is a practical rule-of-thumb, not a class-of-fit lookup."
  ]),
  copyText: ""
});
setResult("mow", {
  primary: "Measurement-over-wires output will show here.",
  stats: [],
  detailsHtml: renderList([
    "Use M = E + 3W - (sqrt(3)/2)P to solve the mic reading from a target pitch diameter.",
    "Use the best-wire helper if you want the nearest stocked wire size instead of the theoretical value."
  ]),
  copyText: ""
});
setResult("bolt", {
  primary: "Coordinates will appear here when you generate them.",
  stats: [],
  detailsHtml: renderList([
    "The selected unit is carried into the output so the result no longer feels ambiguous.",
    "Copying the coordinate block gives you an easy handoff to setup sheets or CNC notes."
  ]),
  copyText: ""
});
setResult("triangle", {
  primary: "Solved offsets and angle details will show here.",
  stats: [],
  detailsHtml: renderList([
    "The selected unit now carries through the answer cards so the choice has a visible effect.",
    "Press Enter in any field to solve without leaving the keyboard."
  ]),
  copyText: ""
});
setResult("feeds", {
  primary: "Spindle RPM and feed rate will show here.",
  stats: [],
  detailsHtml: renderList([
    "Defaults are conservative shop starting points — always sanity-check against tool-maker data.",
    "Leave surface speed and chip load blank to use the material + tool-type defaults.",
    "Enter width of cut (WOC) and depth of cut (DOC) to estimate material removal rate."
  ]),
  copyText: ""
});
setResult("chamfer", { primary: "Depth will appear here.", stats: [], detailsHtml: "", copyText: "" });
setResult("circle3", { primary: "Center and diameter will appear here.", stats: [], detailsHtml: "", copyText: "" });
setResult("advanced", { primary: "Choose a calculator and enter values.", stats: [], detailsHtml: "", copyText: "" });

// Parse hash on load — runs after defaults so result isn't overwritten
function applyRoute(){
  const shared = parseShareUrl();
  if (!shared) return;
  const form = document.getElementById(shared.tool + "Form");
  if (!form) return;
  openTool(shared.tool, { animate: false });
  if (!shared.formState) return;
  restoreFormInputs(form, shared.formState);
  if (shared.tool === "thread"){ syncPctButtons(); updateThreadFields(); updateThreadReferenceOptions(shared.formState.threadClassRef || "basic"); updateThreadPreview(); }
  if (shared.tool === "mow"){ syncModeButtons(); updateMowHints(); }
  if (shared.tool === "triangle"){ updateTriangleFields(); updateTriangleDiagram(); }
  if (shared.tool === "feeds"){ sfSyncUnitLabels(); }
  if (shared.tool === "advanced"){ document.getElementById("advancedMode")?.dispatchEvent(new Event("change")); }
  requestFormSubmit(form);
}
applyRoute();
window.addEventListener("hashchange", applyRoute);

// ── Keyboard shortcuts ──
// 1–8: switch tools. Ctrl/Cmd+K: focus quick thread spec.
// ── Auto-calculate live mode ──
(function initLiveCalc(){
  const LIVE_KEY = "marcos_live_calc";
  const LIVE_FORM_IDS = ["threadForm", "mowForm", "boltForm", "triangleForm", "feedsForm", "chamferForm", "circle3Form", "advancedForm"];
  let liveController = null;
  let liveDebounce = null;

  function read(){
    try { return localStorage.getItem(LIVE_KEY) === "1"; } catch { return false; }
  }
  function write(on){
    try { localStorage.setItem(LIVE_KEY, on ? "1" : "0"); } catch {}
  }
  function detach(){
    if (liveController){ liveController.abort(); liveController = null; }
    if (liveDebounce){ clearTimeout(liveDebounce); liveDebounce = null; }
  }
  function attach(){
    liveController = new AbortController();
    const { signal } = liveController;
    LIVE_FORM_IDS.forEach((id) => {
      const form = document.getElementById(id);
      if (!form) return;
      const onInput = (event) => {
          const t = event.target;
        if (!t || t.closest("[data-no-live]")) return;
        if (liveDebounce) clearTimeout(liveDebounce);
        liveDebounce = setTimeout(() => {
          liveDebounce = null;
          requestFormSubmit(form, { live: true });
        }, 250);
      };
      form.addEventListener("input", onInput, { signal });
      form.addEventListener("change", onInput, { signal });
    });
  }
  function apply(on){
    document.documentElement.classList.toggle("live-on", on);
    detach();
    if (on) attach();
  }

  const toggle = document.getElementById("liveCalcToggle");
  if (toggle){
    toggle.checked = read();
    apply(toggle.checked);
    toggle.addEventListener("change", () => {
      write(toggle.checked);
      apply(toggle.checked);
      if (toggle.checked){
        // Kick an immediate calc on the active tool so the result reflects current inputs
        const activeCard = toolCards.find((c) => c.classList.contains("active-tool")) || toolCards[0];
        if (activeCard){
          const form = document.getElementById(activeCard.dataset.tool + "Form");
          if (form) requestFormSubmit(form, { live: true });
        }
      }
    });
  }
})();

(function initKeyboardShortcuts(){
  const TOOL_KEYS = { "1": "thread", "2": "mow", "3": "bolt", "4": "triangle", "5": "feeds", "6": "chamfer", "7": "circle3", "8": "advanced" };
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    const target = event.target;
    const tag = target && target.tagName ? target.tagName.toUpperCase() : "";
    const isEditable = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || (target && target.isContentEditable);
    // Ctrl/Cmd+K: focus quick-spec input (works even in fields)
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && (event.key === "k" || event.key === "K")){
      const quick = document.getElementById("threadQuickSpec");
      if (quick){
        event.preventDefault();
        openTool("thread", { scroll: true });
        quick.focus();
        if (typeof quick.select === "function") quick.select();
      }
      return;
    }
    // Don't hijack digits while typing in a form control
    if (isEditable) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const toolName = TOOL_KEYS[event.key];
    if (toolName){
      event.preventDefault();
      openTool(toolName, { scroll: true });
    }
  });
})();

initMobileUI({ results, state: resultState, submit: requestFormSubmit });
initInputHelpers();
initPwa({ showToast });

document.getElementById("sfOpenWorkspace").addEventListener("click", () => document.getElementById("workspaceBtn").click());
document.getElementById("toolProfileUnits").addEventListener("change", event => {
    const metric = event.target.value === "mm";
    document.getElementById("toolSpeedUnit").textContent = metric ? "(m/min)" : "(SFM)";
    document.getElementById("toolChipUnit").textContent = metric ? "(mm/tooth)" : "(in/tooth)";
  });
document.getElementById("toolProfileForm").addEventListener("reset", () => queueMicrotask(() => {
  document.getElementById("toolSpeedUnit").textContent = "(SFM)";
  document.getElementById("toolChipUnit").textContent = "(in/tooth)";
}));
  document.documentElement.dataset.appReady = "true";
