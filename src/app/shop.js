// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Shop screens: machine profiles, tool library, saved jobs. Pro. Everything stays in localStorage.

import { loadBlob, saveBlob } from "./store.js";
import { getSettings } from "./settings.js";
import { navigate } from "./router.js";
import { getCalc } from "./registry.js";
import { attachNumpad, closeNumpad } from "./numpad.js";
import { fmt, parseFraction } from "../core/format.js";
import { ICONS } from "./icons.js";
import { toast } from "./ui.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);

export const machines = {
  all: () => loadBlob("machines", []),
  save: (list) => saveBlob("machines", list),
  activeId: () => loadBlob("activeMachine", null),
  setActive: (id) => saveBlob("activeMachine", id),
};
export const tools = { all: () => loadBlob("tools", []), save: (list) => saveBlob("tools", list) };
export const jobs = {
  all: () => loadBlob("jobs", []),
  save: (list) => saveBlob("jobs", list),
  add(job) { const list = jobs.all(); list.unshift({ id: uid(), at: Date.now(), ...job }); jobs.save(list.slice(0, 200)); },
  remove(id) { jobs.save(jobs.all().filter((j) => j.id !== id)); },
};

const TABS = [["machines", "Machines"], ["tools", "Tools"], ["jobs", "Jobs"]];

export function renderShop(root, tab = "machines") {
  const s = getSettings();
  root.innerHTML = `
    <div class="seg" role="tablist">${TABS.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}" aria-pressed="${id === tab}">${label}</button>`).join("")}</div>
    <div style="height:12px"></div>
    <div id="shopBody"></div>`;
  root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => navigate(`/shop/${b.dataset.tab}`)));
  const body = root.querySelector("#shopBody");
  if (!s.pro) {
    body.innerHTML = `<div class="lock"><div><b>Shop is a Pro feature</b><br><span>Machine limits, your tool library, and saved jobs.</span></div><a class="btn primary" href="#/pro">Unlock Pro</a></div>
      <p class="hint" style="margin-top:14px">With a machine profile, every speeds & feeds tool clamps to your spindle and shows both numbers.</p>`;
    return;
  }
  if (tab === "machines") renderMachines(body);
  else if (tab === "tools") renderTools(body);
  else renderJobs(body);
}

// ── Machines ──
function renderMachines(body) {
  const list = machines.all();
  const active = machines.activeId();
  body.innerHTML = `
    ${list.length ? `<ul class="list">${list.map((m) => `<li><div class="setting">
        <button type="button" class="radio" role="radio" aria-checked="${m.id === active}" data-activate="${m.id}" aria-label="Use ${esc(m.name)}"></button>
        <span class="t"><b>${esc(m.name)}</b><span class="sub">${esc(m.type)} · max ${fmt(m.maxRpm, 0)} RPM · ${fmt(m.maxFeed, 0)} ${m.units === "mm" ? "mm/min" : "IPM"} · ${esc(m.controller)}</span></span>
        <button type="button" class="btn small" data-edit="${m.id}">Edit</button></div></li>`).join("")}</ul>
      <p class="hint" style="margin:10px 0 0">The selected machine caps RPM and feed in every speeds & feeds tool. Pick none to turn that off.</p>`
      : `<div class="empty">No machines yet. Add your mill or lathe and the speeds & feeds tools will respect its limits.</div>`}
    <div style="height:12px"></div>
    <button type="button" class="btn primary block" id="add">Add machine</button>
    <div id="form"></div>`;
  body.querySelectorAll("[data-activate]").forEach((b) => b.addEventListener("click", () => { machines.setActive(active === b.dataset.activate ? null : b.dataset.activate); renderMachines(body); }));
  body.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => machineForm(body, list.find((m) => m.id === b.dataset.edit))));
  body.querySelector("#add").addEventListener("click", () => machineForm(body, null));
}

function machineForm(body, m) {
  const isNew = !m;
  m = m || { id: uid(), name: "", type: "mill", maxRpm: "", maxFeed: "", controller: "fanuc", units: getSettings().units };
  const host = body.querySelector("#form");
  host.innerHTML = `<div class="calc" style="margin-top:14px">
    <h2 class="sec" style="margin:0">${isNew ? "New machine" : "Edit machine"}</h2>
    ${field("Name", `<input class="input" id="mName" type="text" value="${esc(m.name)}" placeholder="Haas VF-2" autocapitalize="words">`)}
    ${field("Type", seg("mType", [["mill", "Mill"], ["lathe", "Lathe"]], m.type))}
    ${field("Max spindle", `<input class="input" id="mRpm" type="text" value="${esc(m.maxRpm)}" data-numpad="1">`, "RPM")}
    ${field("Max feed", `<input class="input" id="mFeed" type="text" value="${esc(m.maxFeed)}" data-numpad="1">`, m.units === "mm" ? "mm/min" : "IPM")}
    ${field("Controller", `<select class="input" id="mCtl">${["fanuc", "haas", "mazak", "siemens", "heidenhain", "okuma", "linuxcnc", "other"].map((c) => `<option value="${c}" ${c === m.controller ? "selected" : ""}>${c[0].toUpperCase() + c.slice(1)}</option>`).join("")}</select>`)}
    <div class="dl-row"><button type="button" class="btn primary" id="save">Save</button>${isNew ? "" : `<button type="button" class="btn" id="del">Delete</button>`}<button type="button" class="btn" id="cancel">Cancel</button></div>
  </div>`;
  wireSeg(host, "mType");
  host.querySelectorAll("[data-numpad]").forEach((i) => attachNumpad(i, {}));
  host.querySelector("#cancel").addEventListener("click", () => { closeNumpad(); host.innerHTML = ""; });
  host.querySelector("#del")?.addEventListener("click", () => { machines.save(machines.all().filter((x) => x.id !== m.id)); if (machines.activeId() === m.id) machines.setActive(null); closeNumpad(); renderMachines(body); });
  host.querySelector("#save").addEventListener("click", () => {
    const rec = { ...m, name: host.querySelector("#mName").value.trim() || "My machine", type: segValue(host, "mType"), maxRpm: parseFraction(host.querySelector("#mRpm").value) || 0, maxFeed: parseFraction(host.querySelector("#mFeed").value) || 0, controller: host.querySelector("#mCtl").value };
    const list = machines.all().filter((x) => x.id !== m.id);
    list.push(rec);
    machines.save(list);
    if (isNew && !machines.activeId()) machines.setActive(rec.id);
    closeNumpad();
    toast("Saved");
    renderMachines(body);
  });
  host.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Tools ──
function renderTools(body) {
  const list = tools.all();
  body.innerHTML = `
    ${list.length ? `<ul class="list">${list.map((t) => `<li><div class="setting">
        <span class="t"><b>${esc(t.name)}</b><span class="sub">Ø${fmt(t.diameter, 4)} ${t.units} · ${t.flutes} FL · ${esc(t.toolType)}${t.note ? " · " + esc(t.note) : ""}</span></span>
        <button type="button" class="btn small" data-use="${t.id}">Feeds</button>
        <button type="button" class="btn small" data-edit="${t.id}">Edit</button></div></li>`).join("")}</ul>`
      : `<div class="empty">No tools yet. Save the end mills and drills you reach for, then jump to speeds & feeds with one tap.</div>`}
    <div style="height:12px"></div>
    <button type="button" class="btn primary block" id="add">Add tool</button>
    <div id="form"></div>`;
  body.querySelectorAll("[data-use]").forEach((b) => b.addEventListener("click", () => {
    const t = list.find((x) => x.id === b.dataset.use);
    navigate(t.kind === "drill" ? "/calc/feeds-drill" : "/calc/feeds-mill", { diameter: String(t.diameter), flutes: String(t.flutes), toolType: t.toolType, units: t.units });
  }));
  body.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => toolForm(body, list.find((t) => t.id === b.dataset.edit))));
  body.querySelector("#add").addEventListener("click", () => toolForm(body, null));
}

function toolForm(body, t) {
  const isNew = !t;
  t = t || { id: uid(), name: "", kind: "endmill", diameter: "", flutes: "4", toolType: "carbide", note: "", units: getSettings().units };
  const host = body.querySelector("#form");
  host.innerHTML = `<div class="calc" style="margin-top:14px">
    <h2 class="sec" style="margin:0">${isNew ? "New tool" : "Edit tool"}</h2>
    ${field("Name", `<input class="input" id="tName" type="text" value="${esc(t.name)}" placeholder='3/8" 4FL carbide' autocapitalize="off">`)}
    ${field("Kind", seg("tKind", [["endmill", "End mill"], ["drill", "Drill"]], t.kind))}
    ${field("Diameter", `<input class="input" id="tDia" type="text" value="${esc(t.diameter)}" data-numpad="1">`, t.units)}
    ${field("Flutes", `<input class="input" id="tFlutes" type="text" value="${esc(t.flutes)}" data-numpad="1">`)}
    ${field("Material", seg("tType", [["hss", "HSS"], ["carbide", "Carbide"], ["coated", "Coated"]], t.toolType))}
    ${field("Note", `<input class="input" id="tNote" type="text" value="${esc(t.note)}" placeholder="AlTiN, 1.5 LOC, brand…">`)}
    <div class="dl-row"><button type="button" class="btn primary" id="save">Save</button>${isNew ? "" : `<button type="button" class="btn" id="del">Delete</button>`}<button type="button" class="btn" id="cancel">Cancel</button></div>
  </div>`;
  wireSeg(host, "tKind"); wireSeg(host, "tType");
  host.querySelectorAll("[data-numpad]").forEach((i) => attachNumpad(i, {}));
  host.querySelector("#cancel").addEventListener("click", () => { closeNumpad(); host.innerHTML = ""; });
  host.querySelector("#del")?.addEventListener("click", () => { tools.save(tools.all().filter((x) => x.id !== t.id)); closeNumpad(); renderTools(body); });
  host.querySelector("#save").addEventListener("click", () => {
    const dia = parseFraction(host.querySelector("#tDia").value);
    if (!(dia > 0)) { toast("Enter a diameter"); return; }
    const rec = { ...t, name: host.querySelector("#tName").value.trim() || `Ø${fmt(dia, 4)} tool`, kind: segValue(host, "tKind"), diameter: dia, flutes: Math.max(1, Math.round(parseFraction(host.querySelector("#tFlutes").value) || 2)), toolType: segValue(host, "tType"), note: host.querySelector("#tNote").value.trim() };
    const list = tools.all().filter((x) => x.id !== t.id);
    list.push(rec);
    tools.save(list);
    closeNumpad();
    toast("Saved");
    renderTools(body);
  });
  host.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Jobs ──
function renderJobs(body) {
  const list = jobs.all();
  body.innerHTML = list.length
    ? `<ul class="list">${list.map((j) => { const def = getCalc(j.calcId); return `<li><div class="setting">
        <button type="button" class="row-btn" style="padding:0" data-open="${j.id}"><span class="t"><b>${esc(j.name)}</b><span class="sub">${esc(def?.title || j.calcId)} · <span class="num">${esc(j.primary)}</span> · ${new Date(j.at).toLocaleDateString()}</span></span></button>
        <button type="button" class="btn small" data-del="${j.id}" aria-label="Delete ${esc(j.name)}">✕</button></div></li>`; }).join("")}</ul>`
    : `<div class="empty">No saved jobs. On any calculator, tap ⋯ then “Save job” to keep every input for next time.</div>`;
  body.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => { const j = list.find((x) => x.id === b.dataset.open); navigate(`/calc/${j.calcId}`, { ...j.raw, units: j.units }); }));
  body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { jobs.remove(b.dataset.del); renderJobs(body); }));
}

// ── tiny form helpers ──
function field(label, control, unit = "") {
  return `<div class="field"><label>${esc(label)}<span class="u">${esc(unit)}</span></label>${control}</div>`;
}
function seg(id, opts, value) {
  return `<div class="seg" data-seg="${id}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === value}">${l}</button>`).join("")}</div>`;
}
function wireSeg(host, id) {
  const el = host.querySelector(`[data-seg="${id}"]`);
  el.addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (!b) return; el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); });
}
function segValue(host, id) { return host.querySelector(`[data-seg="${id}"] [aria-pressed="true"]`)?.dataset.v; }

export { ICONS };
