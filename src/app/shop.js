// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Shop screens: machine profiles, tool library, saved jobs. Pro. Everything stays in localStorage.
// Deleting is one tap (no "are you sure?" to fumble with gloves on) and always comes with Undo.

import { loadBlob, saveBlob, loadList } from "./store.js";
import { getSettings } from "./settings.js";
import { navigate } from "./router.js";
import { getCalc } from "./registry.js";
import { attachNumpad, closeNumpad } from "./numpad.js";
import { fmt, parseFraction } from "../core/format.js";
import { toast } from "./ui.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);

export const machines = {
  all: () => loadList("machines").map((m) => ({ ...m, id: String(m.id ?? ""), name: String(m.name ?? "Machine"), type: m.type === "lathe" ? "lathe" : "mill", maxRpm: Number(m.maxRpm) || 0, maxFeed: Number(m.maxFeed) || 0, controller: String(m.controller ?? "other"), units: m.units === "mm" ? "mm" : "in" })),
  save: (list) => saveBlob("machines", list),
  activeId: () => loadBlob("activeMachine", null),
  setActive: (id) => saveBlob("activeMachine", id),
};
export const tools = {
  all: () => loadList("tools").map((t) => ({ ...t, id: String(t.id ?? ""), name: String(t.name ?? "Tool"), kind: t.kind === "drill" ? "drill" : "endmill", diameter: Number(t.diameter) || 0, flutes: Math.max(1, Math.round(Number(t.flutes) || 2)), toolType: ["hss", "carbide", "coated"].includes(t.toolType) ? t.toolType : "carbide", note: String(t.note ?? ""), units: t.units === "mm" ? "mm" : "in" })),
  save: (list) => saveBlob("tools", list),
};
export const jobs = {
  all: () => loadList("jobs").filter((j) => typeof j.calcId === "string" && j.raw && typeof j.raw === "object").map((j) => ({ ...j, id: String(j.id ?? ""), name: String(j.name ?? "Job"), primary: String(j.primary ?? ""), at: Number(j.at) || 0, units: j.units === "mm" ? "mm" : "in" })),
  save: (list) => saveBlob("jobs", list),
  add(job) { const list = jobs.all(); list.unshift({ id: uid(), at: Date.now(), ...job }); jobs.save(list.slice(0, 200)); },
  remove(id) { jobs.save(jobs.all().filter((j) => j.id !== id)); },
};

const TABS = [["machines", "Machines"], ["tools", "Tools"], ["jobs", "Jobs"]];

export function renderShop(root, tab = "machines") {
  const s = getSettings();
  root.innerHTML = `
    <div class="dl-row"><button type="button" class="btn primary" data-go="/calc/job-sheet">Job sheet</button><button type="button" class="btn" data-go="/calc/quote">Quote helper</button></div>
    <div style="height:14px"></div>
    <div class="seg" role="tablist">${TABS.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}" aria-pressed="${id === tab}">${label}</button>`).join("")}</div>
    <div style="height:12px"></div>
    <div id="shopBody"></div>`;
  root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => navigate(`/shop/${b.dataset.tab}`)));
  root.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.go)));
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
        <button type="button" class="radio" role="radio" aria-checked="${m.id === active}" data-activate="${esc(m.id)}" aria-label="Use ${esc(m.name)}"></button>
        <span class="t"><b>${esc(m.name)}</b><span class="sub">${esc(m.type)} · max ${fmt(m.maxRpm, 0)} RPM · ${fmt(m.maxFeed, 0)} ${m.units === "mm" ? "mm/min" : "IPM"} · ${esc(m.controller)}</span></span>
        <button type="button" class="btn small" data-edit="${esc(m.id)}">Edit</button></div></li>`).join("")}</ul>
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
    ${field("Name", `<input class="input" id="mName" type="text" enterkeyhint="done" value="${esc(m.name)}" placeholder="Haas VF-2" autocapitalize="words">`)}
    ${field("Type", seg("mType", [["mill", "Mill"], ["lathe", "Lathe"]], m.type))}
    ${field("Max spindle", `<input class="input" id="mRpm" type="text" value="${esc(m.maxRpm)}" data-numpad="1">`, "RPM")}
    ${field("Max feed", `<input class="input" id="mFeed" type="text" value="${esc(m.maxFeed)}" data-numpad="1">`, m.units === "mm" ? "mm/min" : "IPM")}
    ${field("Controller", `<select class="input" id="mCtl">${["fanuc", "haas", "mazak", "siemens", "heidenhain", "okuma", "linuxcnc", "other"].map((c) => `<option value="${c}" ${c === m.controller ? "selected" : ""}>${c[0].toUpperCase() + c.slice(1)}</option>`).join("")}</select>`)}
    <div class="dl-row"><button type="button" class="btn primary" id="save">Save</button>${isNew ? "" : `<button type="button" class="btn" id="del">Delete</button>`}<button type="button" class="btn" id="cancel">Cancel</button></div>
  </div>`;
  wireSeg(host, "mType");
  host.querySelectorAll("[data-numpad]").forEach((i) => attachNumpad(i, {}, host));
  host.querySelector("#cancel").addEventListener("click", () => { closeNumpad(); host.innerHTML = ""; });
  host.querySelector("#del")?.addEventListener("click", () => {
    const before = machines.all(), wasActive = machines.activeId() === m.id;
    machines.save(before.filter((x) => x.id !== m.id));
    if (wasActive) machines.setActive(null);
    closeNumpad();
    renderMachines(body);
    toast(`Deleted ${m.name}`, { action: "Undo", onAction: () => { machines.save(before); if (wasActive) machines.setActive(m.id); if (body.isConnected) renderMachines(body); } });
  });
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
        <button type="button" class="btn small" data-use="${esc(t.id)}">Feeds</button>
        <button type="button" class="btn small" data-edit="${esc(t.id)}">Edit</button></div></li>`).join("")}</ul>`
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
    ${field("Name", `<input class="input" id="tName" type="text" enterkeyhint="done" value="${esc(t.name)}" placeholder='3/8" 4FL carbide' autocapitalize="off">`)}
    ${field("Kind", seg("tKind", [["endmill", "End mill"], ["drill", "Drill"]], t.kind))}
    ${field("Diameter", `<input class="input" id="tDia" type="text" value="${esc(t.diameter)}" data-numpad="1">`, t.units)}
    ${field("Flutes", `<input class="input" id="tFlutes" type="text" value="${esc(t.flutes)}" data-numpad="1">`)}
    ${field("Material", seg("tType", [["hss", "HSS"], ["carbide", "Carbide"], ["coated", "Coated"]], t.toolType))}
    ${field("Note", `<input class="input" id="tNote" type="text" enterkeyhint="done" value="${esc(t.note)}" placeholder="AlTiN, 1.5 LOC, brand…">`)}
    <div class="dl-row"><button type="button" class="btn primary" id="save">Save</button>${isNew ? "" : `<button type="button" class="btn" id="del">Delete</button>`}<button type="button" class="btn" id="cancel">Cancel</button></div>
  </div>`;
  wireSeg(host, "tKind"); wireSeg(host, "tType");
  host.querySelectorAll("[data-numpad]").forEach((i) => attachNumpad(i, {}, host));
  host.querySelector("#cancel").addEventListener("click", () => { closeNumpad(); host.innerHTML = ""; });
  host.querySelector("#del")?.addEventListener("click", () => {
    const before = tools.all();
    tools.save(before.filter((x) => x.id !== t.id));
    closeNumpad();
    renderTools(body);
    toast(`Deleted ${t.name}`, { action: "Undo", onAction: () => { tools.save(before); if (body.isConnected) renderTools(body); } });
  });
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
        <button type="button" class="row-btn" style="padding:0" data-open="${esc(j.id)}"><span class="t"><b>${esc(j.name)}</b><span class="sub">${esc(def?.title || j.calcId)} · <span class="num">${esc(j.primary)}</span> · ${new Date(j.at).toLocaleDateString()}</span></span></button>
        <button type="button" class="btn small" data-del="${esc(j.id)}" aria-label="Delete ${esc(j.name)}">✕</button></div></li>`; }).join("")}</ul>`
    : `<div class="empty">No saved jobs. On any calculator, tap ⋯ then “Save job” to keep every input for next time.</div>`;
  body.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
    const j = list.find((x) => x.id === b.dataset.open);
    // Every field goes in the link, blank ones too: a blank ("use the table value") must not pick up
    // whatever was last typed in that tool.
    navigate(`/calc/${j.calcId}`, { ...Object.fromEntries(Object.entries(j.raw).map(([k, v]) => [k, String(v ?? "")])), units: j.units });
  }));
  body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
    const before = jobs.all(), gone = before.find((j) => j.id === b.dataset.del);
    jobs.remove(b.dataset.del);
    renderJobs(body);
    toast(`Deleted ${gone?.name || "job"}`, { action: "Undo", onAction: () => { jobs.save(before); if (body.isConnected) renderJobs(body); } });
  }));
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

