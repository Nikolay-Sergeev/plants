// Plants - vanilla JS front end. No build step.
import { $, $$, chevronIcon, esc, fail, fmtDate, glyph, leafIcon, toast } from "./ui.js?v=1";
import { pushOff } from "./push.js?v=1";
import { setSettingsDisclosures, showSettings } from "./settings.js?v=1";
import { weatherHtml } from "./weather.js?v=1";

const dropIcon = glyph('<path d="M12 3c-3.4 4.4-6.5 7.7-6.5 11.5a6.5 6.5 0 0 0 13 0C18.5 10.7 15.4 7.4 12 3Zm-3 12a3 3 0 0 0 3 3"/>');
const addIcon = glyph('<path d="M12 5v14M5 12h14"/>');
const searchIcon = glyph('<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/>');
const moreIcon = glyph('<path d="M5 12h.01m6.99 0h.01m6.99 0h.01" stroke-width="3"/>');
const selectIcon = glyph('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 2.5 2.5L16 9"/>');
const KINDS = [["water", "Water"], ["fertilize", "Fertilize"], ["mist", "Mist"], ["repot", "Repot"], ["rotate", "Rotate"], ["custom", "Custom"]];
// Starting intervals when a task type is picked; always editable.
const KIND_DAYS = { water: 7, fertilize: 30, mist: 3, repot: 365, rotate: 7, custom: 14 };
const feature = (name) => !state.settings || state.settings[`feature_${name}`] !== false;
const state = {
  me: null, settings: null, roomFilter: "", plantRoom: "", search: "",
  selecting: false, selected: new Set(), upcomingOpen: null, weatherOpen: null,
};
const wideLayout = window.matchMedia("(min-width: 48rem)");

let viewRevision = 0;

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function readApiResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function apiErrorDetail(detail, fallback) {
  if (!Array.isArray(detail)) return detail || fallback;
  return detail.map(({ msg }) => msg.replace(/^Value error, /, "")).join("; ");
}

async function api(path, opts = {}) {
  const init = { method: opts.method || "GET", headers: {}, credentials: "same-origin", signal: opts.signal };
  if (opts.form) init.body = opts.form;
  else if (opts.body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, init);
  if (res.status === 401 && !opts.allow401) {
    state.me = null;
    await showAuth();
    throw new ApiError("Please sign in again", res.status);
  }
  const data = await readApiResponse(res);
  if (!res.ok) {
    throw new ApiError(apiErrorDetail(data?.detail, res.statusText), res.status);
  }
  return data;
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function whenText(days) {
  if (days < -1) return `${-days} days overdue`;
  if (days === -1) return "1 day overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

function thumb(photo) {
  const inner = photo && !state.me?.token_session ? `<img src="${esc(photo)}" alt="" loading="lazy" decoding="async">` : leafIcon;
  return `<span class="thumb" aria-hidden="true">${inner}</span>`;
}

// ---------------------------------------------------------------- modal

function openModal(html, onOpen) {
  const modal = $("#modal");
  const sheet = $("#sheet");
  sheet.innerHTML = html;
  const title = $("h2", sheet);
  title.id = "sheet-title";
  title.tabIndex = -1;
  title.setAttribute("autofocus", "");
  const status = $("#toast");
  status.hidden = true;
  modal.append(status);
  $$("[data-close]", sheet).forEach((b) => (b.onclick = closeModal));
  if (onOpen) onOpen(sheet);
  if (modal.open) title.focus();
  else modal.showModal();
  modal.scrollTop = 0;
}

function closeModal() {
  const modal = $("#modal");
  if (!modal.open) return;
  modal.close();
  document.body.append($("#toast"));
  $("#sheet").innerHTML = "";
}

$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
$("#modal").addEventListener("cancel", (e) => { e.preventDefault(); closeModal(); });

// ---------------------------------------------------------------- auth

async function showAuth() {
  ++viewRevision;
  closeModal();
  $("#top").hidden = true;
  const status = await api("/api/status", { allow401: true });
  const setup = status.setup_required;
  const renderForm = () => {
    $("#view").innerHTML = `
      <form class="card auth stack" id="auth-form">
        <div class="auth-logo"><img src="/static/icon.svg?v=2" alt="" width="40" height="40">${esc(status.app_name)}</div>
        <h1>${setup ? "Set up Plants" : "Sign in"}</h1>
        ${setup ? '<p class="muted">Create the first account. It becomes the administrator.</p>' : ""}
        <div><label for="username">Username</label><input id="username" name="username" autocomplete="username" ${setup ? "required" : ""}></div>
        <div><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="${setup ? "new-password" : "current-password"}" required ${setup ? 'minlength="8"' : ""}></div>
        <p class="error" id="auth-error" role="alert"></p>
        <button class="primary" type="submit">${setup ? "Create administrator" : "Sign in"}</button>
      </form>`;
    $("#auth-form").onsubmit = async (e) => {
      e.preventDefault();
      const username = $("#username").value.trim();
      const password = $("#password").value;
      const body = { username, password };
      const button = $("button[type=submit]", e.currentTarget);
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = setup ? "Creating administrator..." : "Signing in...";
      $("#auth-error").textContent = "";
      try {
        await api(setup ? "/api/setup" : "/api/login", { method: "POST", body, allow401: true });
        await boot();
      } catch (err) {
        const error = $("#auth-error");
        if (error) error.textContent = err.message;
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.textContent = setup ? "Create administrator" : "Sign in";
        }
      }
    };
  };
  renderForm();
}

async function signOut() {
  await pushOff(api).catch(() => {}); // a shared device shouldn't keep getting the last person's reminders
  await api("/api/logout", { method: "POST", allow401: true });
  state.me = null;
  state.selecting = false;
  state.selected.clear();
  location.hash = "#/";
  showAuth();
}
$("#logout").onclick = () => signOut().catch(fail);

// ---------------------------------------------------------------- routing

function setAppName(name) {
  $("#app-name").textContent = name;
  document.title = name;
}

async function boot() {
  try {
    state.me = await api("/api/me", { allow401: true });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return showAuth();
    throw err;
  }
  if (state.me.token_session) {
    // API-token sign-in: limited to what the token API can do, so Settings stays out of reach.
    state.settings = null;
    const status = await api("/api/status");
    setAppName(status.app_name);
  } else {
    state.settings = await api("/api/settings");
    setAppName(state.settings.app_name);
  }
  $("#top").hidden = false;
  $("#top").classList.toggle("token-session", state.me.token_session === true);
  $("#user-badge").textContent = state.me.username + (state.me.token_session ? " (token)" : "");
  $$(".tab").forEach((t) => { t.hidden = state.me.token_session && t.dataset.tab === "settings"; });
  $("#view").innerHTML = '<section class="card" aria-busy="true"><p class="muted">Loading plants...</p></section>';
  route();
}

function routeFor(hash) {
  const plant = hash.match(/^#\/plant\/(\d+)/);
  if (plant) return { tab: "plants", render: () => renderPlant(Number(plant[1])) };
  if (hash.startsWith("#/plants")) return { tab: "plants", render: renderPlants };
  if (hash.startsWith("#/settings")) {
    return { tab: "settings", render: () => renderSettings(hash.split("/")[2] || "") };
  }
  return { tab: "today", render: renderToday };
}

const currentHash = () => location.hash || "#/";

function setActiveTab(tab) {
  for (const link of $$(".tab")) {
    const active = link.dataset.tab === tab;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

async function route(moveFocus = false) {
  ++viewRevision;
  if (!state.me) return;
  closeModal();
  const hash = currentHash();
  const { tab, render } = routeFor(hash);
  if (tab !== "today") {
    state.selecting = false;
    state.selected.clear();
  }
  setActiveTab(tab);
  try {
    await render();
    if (moveFocus && currentHash() === hash) $("#view").focus({ preventScroll: true });
  } catch (err) {
    if (currentHash() !== hash) return;
    if (err instanceof ApiError && err.status === 401) return;
    fail(err);
  }
}

window.addEventListener("hashchange", () => { window.scrollTo(0, 0); route(true); });

// ---------------------------------------------------------------- today

function roomPicker(id, rooms, selected) {
  if (rooms.length < 2) return "";
  return `<select class="room-picker" id="${id}" aria-label="Filter by room">
    <option value="">All rooms</option>
    ${rooms.map((r) => `<option value="${esc(r)}" ${r === selected ? "selected" : ""}>${esc(r)}</option>`).join("")}
  </select>`;
}

function dueRow(i) {
  const sel = state.selected.has(i.task_id);
  return `<div class="due ${sel ? "sel" : ""}" data-task="${i.task_id}" role="group" aria-labelledby="due-name-${i.task_id}">
    <a class="due-plant" href="#/plant/${i.plant_id}" aria-labelledby="due-name-${i.task_id}" aria-describedby="due-status-${i.task_id}">${thumb(i.photo)}
      <span class="due-main">
        <span class="due-name" id="due-name-${i.task_id}">${esc(i.plant_name)}</span>
        <span class="due-when" id="due-status-${i.task_id}">${esc(i.label)}${i.days !== 0
          ? ` <span class="due-date ${i.state}">· ${whenText(i.days)}</span>` : ""}</span>
      </span>
    </a>
    ${state.selecting
      ? `<label class="checkwrap"><input class="check" type="checkbox" aria-label="Select ${esc(i.label)} for ${esc(i.plant_name)}" ${sel ? "checked" : ""} data-select="${i.task_id}"></label>`
      : `<div class="due-actions">
        <button class="due-done" data-act="done" data-id="${i.task_id}">Done</button>
        <button class="icon-btn ghost" aria-label="More actions for ${esc(i.plant_name)}" data-care-more="${i.task_id}">${moreIcon}</button>
      </div>`}
    <div class="due-confirm" hidden>
      <span>Log ${esc(i.label)} for ${esc(i.plant_name)}?</span>
      <button class="primary" data-confirm-done="${i.task_id}">Yes, log</button>
      <button data-cancel-done>Cancel</button>
    </div>
  </div>`;
}

function careOptions(item) {
  openModal(`<h2>${esc(item.plant_name)}</h2>
    <p class="care-option-label">${esc(item.label)}</p>
    <p class="muted">${esc([item.room, item.outdoor ? "Outdoor" : "", item.reason].filter(Boolean).join(" · "))}</p>
    ${item.kind === "water" ? '<p class="hint">Check the soil first. Skip if it’s still moist.</p>' : ""}
    <div class="menu care-options">
      <button id="more-snooze">Snooze</button>
      <button id="more-skip">Skip this check</button>
    </div><div class="sheet-actions"><button data-close>Cancel</button></div>`, (sheet) => {
    $("#more-snooze", sheet).onclick = () => {
      const whole = item.plant_due > 1 ? { plant: item.plant_id, name: item.plant_name, count: item.plant_due } : null;
      snoozeMenu((days, all) => all ? snoozePlant(whole.plant, days, renderToday) : care(item.task_id, "snooze", { days }, renderToday), whole);
    };
    $("#more-skip", sheet).onclick = () => { closeModal(); care(item.task_id, "skip", {}, renderToday); };
  });
}

async function renderToday() {
  const revision = ++viewRevision;
  // Weather loads independently so it cannot delay the care list.
  const weather = api("/api/weather", { allow401: true })
    .catch(() => ({ error: "Weather unavailable right now." }));
  const due = await api("/api/due?days=7");
  if (revision !== viewRevision || !state.me) return;
  const rooms = [...new Set(due.items.map((i) => i.room || "No room"))].sort();
  if (!rooms.includes(state.roomFilter)) state.roomFilter = "";
  const dueByPlant = new Map();
  due.items.forEach((i) => {
    if (i.days <= 0) dueByPlant.set(i.plant_id, (dueByPlant.get(i.plant_id) || 0) + 1);
  });
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  $("#view").innerHTML = `
    <header class="pagehead"><div><h1>Today</h1><p class="today-date"><time datetime="${localToday()}">${esc(dateLabel)}</time></p></div></header>
    <div class="care-toolbar" id="care-controls"></div>
    <div class="today-layout">
      <div id="care-list"></div>
      <section class="disclosure weather" id="weather" aria-busy="true"><div class="weather-loading muted">Loading weather...</div></section>
    </div>`;
  drawCare(due.items, rooms, dueByPlant);
  weather.then((result) => {
    if (revision !== viewRevision || !state.me) return;
    $("#weather").outerHTML = weatherHtml(result, {
      open: state.weatherOpen ?? wideLayout.matches,
      canConfigure: state.me.is_admin && !state.me.token_session,
    });
    $("#weather summary").onclick = () => { state.weatherOpen = !$("#weather").open; };
  });
}

function drawCare(allItems, rooms, dueByPlant) {
  const root = $("#care-list");
  const items = allItems.filter((i) => !state.roomFilter || (i.room || "No room") === state.roomFilter);
  const overdue = items.filter((i) => i.state === "overdue");
  const today = items.filter((i) => i.state === "today");
  const upcoming = items.filter((i) => i.state === "upcoming");
  const visible = new Set(items.map((i) => i.task_id));
  state.selected = new Set([...state.selected].filter((id) => visible.has(id)));
  const list = (entries) => `
    ${state.selecting && entries.length > 1 ? '<button type="button" class="small ghost select-all" data-selectgroup>Select all</button>' : ""}
    <div class="due-list">${entries.map(dueRow).join("")}</div>`;
  $("#care-controls").innerHTML = `
    ${roomPicker("today-room", rooms, state.roomFilter)}
    ${items.length ? `<button type="button" class="small care-select" id="select-care">
      ${selectIcon}${state.selecting ? "Cancel selection" : "Select tasks"}
    </button>` : ""}
    ${overdue.length || today.length ? "" : `<p class="care-empty muted">${state.roomFilter ? "Nothing due today in this room." : "You're caught up for today."}</p>`}`;
  root.hidden = !items.length;
  root.innerHTML = `
    ${[[overdue, "Overdue"], [today, "Due today"]].map(([entries, title]) => entries.length ? `
      <section class="disclosure care-group"><h2 class="section-title">${title} <span class="section-count">${entries.length}</span></h2>${list(entries)}</section>` : "").join("")}
    ${upcoming.length ? `<details class="disclosure upcoming" id="upcoming" ${(state.upcomingOpen ?? wideLayout.matches) ? "open" : ""}>
      <summary><span>Next 7 days</span><span class="disclosure-meta muted">${upcoming.length}</span>${chevronIcon}</summary>${list(upcoming)}
    </details>` : ""}
    <div class="batchbar" id="batchbar" hidden>
      <b id="batch-count" role="status"></b>
      <button class="primary" data-batch="done">Done</button>
      <button data-batch="snooze">Snooze</button>
      <button data-batch="skip">Skip</button>
      <button class="ghost" id="clear-care">Clear</button>
      <span class="batch-confirm" hidden><span>Log <span id="batch-confirm-count"></span> selected?</span>
        <button class="primary" data-batch-confirm>Yes, log</button>
        <button data-batch-cancel>Cancel</button>
      </span>
    </div>`;

  const redraw = (focus) => {
    state.selected.clear();
    drawCare(allItems, rooms, dueByPlant);
    $(focus)?.focus({ preventScroll: true });
  };
  if ($("#today-room")) $("#today-room").onchange = (e) => {
    state.roomFilter = e.currentTarget.value;
    redraw("#today-room");
  };
  if ($("#select-care")) $("#select-care").onclick = () => {
    state.selecting = !state.selecting;
    redraw("#select-care");
  };
  const upcomingSection = $("#upcoming");
  if (upcomingSection) {
    $("summary", upcomingSection).onclick = () => { state.upcomingOpen = !upcomingSection.open; };
    upcomingSection.ontoggle = () => {
      if (upcomingSection.open || !state.selecting) return;
      $$("[data-select]:checked", upcomingSection).forEach((cb) => {
        cb.checked = false;
        state.selected.delete(Number(cb.dataset.select));
        cb.closest(".due").classList.remove("sel");
      });
      updateBatchBar();
    };
  }
  $$(".due [data-select]", root).forEach((cb) => (cb.onchange = () => {
    const id = Number(cb.dataset.select);
    cb.checked ? state.selected.add(id) : state.selected.delete(id);
    cb.closest(".due").classList.toggle("sel", cb.checked);
    updateBatchBar();
  }));
  $$("[data-selectgroup]", root).forEach((b) => (b.onclick = () => {
    $$("[data-select]", b.nextElementSibling).forEach((cb) => {
      cb.checked = true;
      state.selected.add(Number(cb.dataset.select));
      cb.closest(".due").classList.add("sel");
    });
    updateBatchBar();
  }));
  $$("[data-care-more]", root).forEach((button) => (button.onclick = () => {
    const item = items.find((i) => i.task_id === Number(button.dataset.careMore));
    careOptions({ ...item, plant_due: dueByPlant.get(item.plant_id) || 0 });
  }));
  bindCareButtons(root, renderToday);
  $("#clear-care").onclick = () => redraw("#select-care");
  $$("[data-batch]", root).forEach((b) => (b.onclick = () => batchAction(b.dataset.batch)));
  $$("[data-confirm-done]", root).forEach((b) => (b.onclick = () => {
    b.disabled = true;
    care(Number(b.dataset.confirmDone), "done", {}, renderToday);
  }));
  $$("[data-cancel-done]", root).forEach((b) => (b.onclick = () => {
    const row = b.closest(".due");
    $(".due-confirm", row).hidden = true;
    $(".due-done", row).focus();
  }));
  $("[data-batch-confirm]", root).onclick = (e) => {
    e.currentTarget.disabled = true;
    batchAction("done", true);
  };
  $("[data-batch-cancel]", root).onclick = () => {
    $(".batch-confirm").hidden = true;
    $("[data-batch=done]").focus();
  };
  updateBatchBar();
}

function updateBatchBar() {
  const bar = $("#batchbar");
  if (!bar) return;
  bar.hidden = state.selected.size === 0;
  $("#batch-count").textContent = `${state.selected.size} selected`;
  $("#batch-confirm-count").textContent = state.selected.size;
  $(".batch-confirm").hidden = true;
}

async function batchAction(action, confirmed = false) {
  if (action === "done" && !confirmed) {
    $("#batch-confirm-count").textContent = state.selected.size;
    $(".batch-confirm").hidden = false;
    $("[data-batch-confirm]").focus();
    return;
  }
  const ids = [...state.selected];
  const hash = location.hash;
  const run = async (extra = {}) => {
    try {
      await api("/api/care/batch", { method: "POST", body: { task_ids: ids, action, ...extra } });
      state.selected.clear();
      state.selecting = false;
      toast(`${ids.length} marked ${action === "done" ? "done" : action === "skip" ? "skipped" : "snoozed"}`);
      if (location.hash === hash) await renderToday();
    } catch (err) {
      fail(err);
      const button = $("[data-batch-confirm]");
      if (button) button.disabled = false;
    }
  };
  if (action === "snooze") return snoozeMenu((days) => run({ days }));
  run();
}

function bindCareButtons(root, after) {
  $$("[data-act]", root).forEach((b) => (b.onclick = async (e) => {
    e.preventDefault();
    const id = Number(b.dataset.id);
    const act = b.dataset.act;
    if (act === "snooze") {
      const whole = Number(b.dataset.plantdue) > 1 ? { plant: Number(b.dataset.plant), name: b.dataset.name, count: Number(b.dataset.plantdue) } : null;
      return snoozeMenu((days, all) => (all ? snoozePlant(whole.plant, days, after) : care(id, "snooze", { days }, after)), whole);
    }
    if (act === "unsnooze") return unsnooze(id, after);
    if (act === "copylink") return copyQuickLink(b.dataset.link);
    if (act === "log") return logCareModal(id, after);
    if (act === "done" && b.closest(".due")) {
      const row = b.closest(".due");
      $$(".due-confirm", root).forEach((panel) => { if (panel !== $(".due-confirm", row)) panel.hidden = true; });
      const panel = $(".due-confirm", row);
      panel.hidden = false;
      $("[data-confirm-done]", panel).focus();
      return;
    }
    care(id, act, {}, after);
  }));
}

async function care(taskId, action, body, after) {
  const hash = location.hash;
  try {
    await api(`/api/tasks/${taskId}/${action}`, { method: "POST", body });
    toast(action === "done" ? "Logged" : action === "skip" ? "Skipped until next cycle" : `Snoozed ${body.days} day${body.days === 1 ? "" : "s"}`);
    if (location.hash === hash) await after();
  } catch (err) { fail(err); const button = $(`[data-confirm-done="${taskId}"]`); if (button) button.disabled = false; }
}

async function snoozePlant(plantId, days, after) {
  try {
    const res = await api(`/api/plants/${plantId}/snooze`, { method: "POST", body: { days } });
    toast(`Snoozed ${res.count} task${res.count === 1 ? "" : "s"} for ${days} day${days === 1 ? "" : "s"}`);
    await after();
  } catch (err) { fail(err); }
}

async function unsnooze(taskId, after) {
  try { await api(`/api/tasks/${taskId}/unsnooze`, { method: "POST" }); toast("Snooze cleared"); await after(); } catch (err) { fail(err); }
}

function absoluteLink(link) {
  return /^https?:\/\//.test(link) ? link : location.origin + link;
}

async function copyQuickLink(link) {
  const url = absoluteLink(link);
  try {
    await navigator.clipboard.writeText(url);
    toast("Quick link copied. Anyone with it can log this one task.");
  } catch {
    prompt("Copy this quick link. Anyone with it can log this one task.", url);
  }
}

// whole: {plant, name, count} offers "snooze everything due on this plant"; pick(days, all)
function snoozeMenu(pick, whole = null) {
  openModal(`<h2>Snooze</h2><div class="menu">
      ${whole ? `<label class="toggle"><input type="checkbox" id="snooze-all"> All ${whole.count} due tasks for ${esc(whole.name)}</label>` : ""}
      <button data-days="1">1 day</button><button data-days="3">3 days</button><button data-days="7">7 days</button>
      <div class="row"><input type="number" id="snooze-days" min="1" max="365" placeholder="Custom days" aria-label="Custom days" inputmode="numeric" style="flex:1">
      <button class="primary" id="snooze-custom">Snooze</button></div>
    </div><div class="sheet-actions"><button data-close>Cancel</button></div>`, (sheet) => {
    const all = () => Boolean($("#snooze-all", sheet)?.checked);
    $$("[data-days]", sheet).forEach((b) => (b.onclick = () => { const a = all(); closeModal(); pick(Number(b.dataset.days), a); }));
    $("#snooze-custom", sheet).onclick = () => {
      const d = Number($("#snooze-days", sheet).value);
      if (d >= 1 && d <= 365) { const a = all(); closeModal(); pick(d, a); } else toast("Enter 1 to 365 days");
    };
  });
}

function logCareModal(taskId, after) {
  openModal(`<h2>Log care</h2><form id="log-form" class="stack">
      <div><label for="log-date">Date</label><input type="date" id="log-date" value="${localToday()}" max="${localToday()}" required></div>
      <div><label for="log-note">Note (optional)</label><textarea id="log-note" maxlength="1000" placeholder="Soil was bone dry, gave it a soak"></textarea></div>
      <div class="sheet-actions"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save</button></div>
    </form>`, (sheet) => {
    $("#log-form", sheet).onsubmit = (e) => {
      e.preventDefault();
      const body = { date: $("#log-date").value, note: $("#log-note").value };
      closeModal();
      care(taskId, "done", body, after);
    };
  });
}

// ---------------------------------------------------------------- plants list

function plantCard(plant) {
  const next = plant.next;
  const due = next?.days <= 0
    ? `<span class="due-date ${next.state}">${next.days < 0 ? "Overdue" : "Due today"}</span>` : "";
  const meta = [esc(plant.room), due].filter(Boolean).join(" · ");
  return `<a class="plant-card" href="#/plant/${plant.id}">${thumb(plant.photo)}
    <div class="pc-body"><div class="pc-name">${esc(plant.name)}</div>
      ${meta ? `<div class="pc-meta muted">${meta}</div>` : ""}
    </div></a>`;
}

function matchingPlants(plants, room, search) {
  const inRoom = room ? plants.filter((plant) => (plant.room || "No room") === room) : plants;
  const query = search.trim().toLowerCase();
  if (!query) return inRoom;
  return inRoom.filter(({ name, species, room }) => [name, species, room].join(" ").toLowerCase().includes(query));
}

async function renderPlants() {
  const revision = ++viewRevision;
  const plants = await api("/api/plants");
  if (revision !== viewRevision) return;
  const rooms = [...new Set(plants.map((p) => p.room || "No room"))].sort();
  if (!rooms.includes(state.plantRoom)) state.plantRoom = "";
  $("#view").innerHTML = `
    <header class="pagehead"><h1>Plants</h1>
      <button class="compact-add" id="add-plant" aria-label="Add plant">${addIcon}<span>Add plant</span></button></header>
    <div class="toolbar"><div class="search-field">${searchIcon}<input type="search" id="plant-search" placeholder="Search" value="${esc(state.search)}" aria-label="Search plants"></div>
      ${roomPicker("plant-room", rooms, state.plantRoom)}</div>
    <p class="sr-only" id="plant-count" role="status"></p>
    <div class="grid" id="plant-grid"></div>`;
  const draw = () => {
    const list = matchingPlants(plants, state.plantRoom, state.search);
    const total = `${plants.length} plant${plants.length === 1 ? "" : "s"}`;
    $("#plant-count").textContent = list.length === plants.length ? total : `${list.length} of ${total}`;
    $("#plant-grid").innerHTML = list.length ? list.map(plantCard).join("") :
      `<div class="card empty">${plants.length ? "No plants match." : "No plants yet. Add your first one."}</div>`;
  };
  draw();
  $("#plant-search").oninput = (e) => { state.search = e.target.value; draw(); };
  if ($("#plant-room")) $("#plant-room").onchange = (e) => { state.plantRoom = e.currentTarget.value; draw(); };
  $("#add-plant").onclick = () => plantForm(null);
}

// ---------------------------------------------------------------- plant detail

async function renderPlant(id) {
  const revision = ++viewRevision;
  const limited = state.me && state.me.token_session;
  const [p, events] = await Promise.all([
    api(`/api/plants/${id}`),
    limited ? Promise.resolve([]) : api(`/api/plants/${id}/events`),
  ]);
  if (revision !== viewRevision) return;
  const facts = [
    ["Species", p.species], ["Room", p.room], ["Light", p.light], ["Pot", [p.pot_size, p.pot_material].filter(Boolean).join(", ")],
    ["Acquired", fmtDate(p.acquired)], ["Where", p.outdoor ? "Outdoor" : "Indoor"], ["Added by", p.added_by],
  ].filter(([, v]) => v);
  const actLabel = { done: "Done", skip: "Skipped", snooze: "Snoozed", photo: "Photo", note: "Note" };
  const dueNow = p.tasks.filter((t) => t.days <= 0).length;
  const photos = events.filter((e) => e.photo).sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
  const growth = feature("growth_timeline");
  const photo = !limited && p.photo;
  $("#view").innerHTML = `
    <a class="back-link" href="#/plants">‹ All plants</a>
    <div class="hero ${photo ? "hero-with-photo" : ""}">
      ${photo ? `<div class="hero-photo"><img src="${esc(photo)}" alt="${esc(p.name)}"></div>` : ""}
      <div>
        <h1>${photo ? "" : `<span class="summary-icon" aria-hidden="true">${leafIcon}</span>`}${esc(p.name)}</h1>
        <dl class="facts">${facts.map(([k, v]) => `<div class="fact"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
        <div class="row">
          <button class="primary" id="add-photo">Add photo or note</button>
          <button id="edit-plant">Edit</button>
          ${dueNow ? `<button class="ghost" id="snooze-plant">Snooze plant</button>` : ""}
          ${limited ? "" : '<button class="ghost" id="dup-plant">Duplicate</button>'}
        </div>
      </div>
    </div>
    <section class="card settings-section">
      <div class="pagehead"><h2 style="margin:0">Care tasks</h2><button class="small" id="add-task">Add task</button></div>
      <div id="tasks">${p.tasks.length ? p.tasks.map((t) => `
        <div class="task">
          <div><b class="task-name">${t.kind === "water" ? dropIcon : ""} ${esc(t.label)}</b> <span class="status ${t.state}">${whenText(t.days)}</span>
            ${t.snoozed ? `<span class="badge snoozed">Snoozed to ${fmtDate(t.snoozed_until)}</span>` : ""}
            <div class="due-meta">${esc(t.reason)} · next ${fmtDate(t.next_due)}</div></div>
          <div class="row">
            <button class="primary" data-act="done" data-id="${t.id}">Done</button>
            <button data-act="log" data-id="${t.id}" title="Log with a date or note">Log…</button>
            ${t.snoozed ? `<button data-act="unsnooze" data-id="${t.id}">Unsnooze</button>`
              : `<button data-act="snooze" data-id="${t.id}" data-plant="${p.id}" data-plantdue="${t.days <= 0 ? dueNow : 0}" data-name="${esc(p.name)}">Snooze</button>`}
            <button data-act="skip" data-id="${t.id}">Skip</button>
            ${t.quick_links ? `<button class="ghost" data-act="copylink" data-link="${esc(t.quick_links.done)}" title="One-tap link for a text message">Copy link</button>` : ""}
            ${limited ? "" : `<button class="ghost" data-edit-task="${t.id}" aria-label="Edit ${esc(t.label)} task">Edit</button>`}
          </div>
        </div>`).join("") : '<p class="muted">No care tasks yet.</p>'}</div>
    </section>
    ${p.notes || p.care_source ? `<section class="card settings-section"><h2>Care notes</h2>
      ${p.notes ? `<div class="notes">${esc(p.notes)}</div>` : ""}
      ${p.care_source ? `<p class="hint">Source: <a href="${esc(p.care_source)}" target="_blank" rel="noopener">${esc(p.care_source.replace(/^https?:\/\//, "").split("/")[0])}</a></p>` : ""}
    </section>` : ""}
    ${feature("plant_info") ? `<section class="card settings-section"><h2>Info</h2>
      ${p.info ? `<div class="notes">${esc(p.info)}</div>` : `<p class="muted">No info yet. Edit this plant to add some.</p>`}
    </section>` : ""}
    ${growth ? `<section class="card settings-section" id="growth">
      <div class="pagehead"><h2 style="margin:0">Growth</h2><span class="muted">${photos.length} photo${photos.length === 1 ? "" : "s"}</span></div>
      ${photos.length ? `<div class="growth-strip">${photos.map((e, i) => `
        <button type="button" class="growth-item" data-growth="${i}" aria-label="Photo from ${fmtDate(e.date)}">
          <img src="${esc(e.photo)}" alt="" loading="lazy">
          <span class="growth-date">${fmtDate(e.date)}</span>
          <span class="growth-age">${growthAge(photos[0].date, e.date, i)}</span>
        </button>`).join("")}</div>
        ${photos.length === 1 ? '<p class="hint">Add a photo every few weeks and they line up here, oldest first, so you can watch it grow.</p>' : ""}`
        : '<p class="muted">Photos you add show up here oldest first, so you can watch it grow. Use Add photo or note.</p>'}
    </section>` : ""}
    <section class="card settings-section">
      <h2 style="margin-top:0">Timeline</h2>
      ${events.length ? `<ul class="timeline">${events.map((e) => `
        <li><div class="tl-date">${fmtDate(e.date)}</div>
          <div><b>${esc(e.action === "done" || e.action === "skip" || e.action === "snooze" ? `${e.label} · ${actLabel[e.action]}` : actLabel[e.action])}</b>
            <span class="muted">${e.user ? "by " + esc(e.user) : ""}${e.via ? " via " + esc(e.via) : ""}</span>
            ${e.note ? `<div class="notes">${esc(e.note)}</div>` : ""}
            ${e.photo ? `<a href="${esc(e.photo)}" target="_blank" rel="noopener"><img class="tl-photo" src="${esc(e.photo)}" alt="Photo from ${fmtDate(e.date)}" loading="lazy"></a>` : ""}
            ${e.photo && e.photo !== p.photo ? `<button class="small ghost" data-main="${e.id}">Use as main photo</button>` : ""}
          </div>
          <button class="icon-btn ghost danger" data-del-event="${e.id}" aria-label="Delete entry">✕</button></li>`).join("")}</ul>`
        : '<p class="muted">Care you log and photos you add show up here.</p>'}
    </section>
    ${limited ? "" : '<p><button class="danger" id="delete-plant">Delete plant</button></p>'}`;
  const again = () => renderPlant(id);
  bindCareButtons($("#view"), again);
  $("#edit-plant").onclick = () => plantForm(p);
  $("#add-photo").onclick = () => photoModal(p, again);
  $("#add-task").onclick = () => taskForm(p, null, again);
  $$("[data-edit-task]").forEach((b) => (b.onclick = () => taskForm(p, p.tasks.find((t) => t.id === Number(b.dataset.editTask)), again)));
  if ($("#snooze-plant")) $("#snooze-plant").onclick = () => snoozeMenu((days) => snoozePlant(id, days, again));
  $$("[data-growth]").forEach((b) => (b.onclick = () => growthViewer(p, photos, Number(b.dataset.growth))));
  if ($("#dup-plant")) $("#dup-plant").onclick = async () => {
    try {
      const copy = await api(`/api/plants/${id}/duplicate`, { method: "POST" });
      toast("Duplicated");
      location.hash = `#/plant/${copy.id}`;
    } catch (err) { fail(err); }
  };
  $$("[data-main]").forEach((b) => (b.onclick = async () => {
    try { await api(`/api/plants/${id}/main-photo?event_id=${b.dataset.main}`, { method: "POST" }); again(); } catch (err) { fail(err); }
  }));
  $$("[data-del-event]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Delete this timeline entry?")) return;
    try { await api(`/api/events/${b.dataset.delEvent}`, { method: "DELETE" }); toast("Entry deleted"); again(); } catch (err) { fail(err); }
  }));
  if ($("#delete-plant")) $("#delete-plant").onclick = async () => {
    if (!confirm(`Delete ${p.name} and its whole history and photos?`)) return;
    try { await api(`/api/plants/${id}`, { method: "DELETE" }); toast("Plant deleted"); location.hash = "#/plants"; } catch (err) { fail(err); }
  };
}

function isoDays(a, b) {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function growthAge(first, date, index) {
  if (index === 0) return "First photo";
  const d = isoDays(first, date);
  if (d < 1) return "Same day";
  if (d < 60) return `+${d} day${d === 1 ? "" : "s"}`;
  if (d < 730) return `+${Math.round(d / 30.44)} months`;
  return `+${(d / 365.25).toFixed(1)} years`;
}

function growthViewer(p, photos, start) {
  let i = start;
  const draw = (sheet) => {
    const e = photos[i];
    $("#gv-body", sheet).innerHTML = `<img class="gv-photo" src="${esc(e.photo)}" alt="${esc(p.name)} on ${fmtDate(e.date)}">
      <p><b>${fmtDate(e.date)}</b> · ${growthAge(photos[0].date, e.date, i)} <span class="muted">(${i + 1} of ${photos.length})</span></p>
      ${e.note ? `<div class="notes">${esc(e.note)}</div>` : ""}`;
    $("#gv-prev", sheet).disabled = i === 0;
    $("#gv-next", sheet).disabled = i === photos.length - 1;
  };
  openModal(`<h2>Growth · ${esc(p.name)}</h2><div id="gv-body"></div>
    <div class="sheet-actions"><button id="gv-prev">← Older</button><button id="gv-next">Newer →</button><button data-close>Close</button></div>`, (sheet) => {
    $("#gv-prev", sheet).onclick = () => { if (i > 0) { i--; draw(sheet); } };
    $("#gv-next", sheet).onclick = () => { if (i < photos.length - 1) { i++; draw(sheet); } };
    draw(sheet);
  });
}

// ---------------------------------------------------------------- forms

let libraryCache = null;
async function getLibrary() {
  if (!libraryCache) libraryCache = await api("/api/library");
  return libraryCache;
}

// In the add-plant form, picking a task type fills its usual interval until you type your own.
function bindKindDefaults(root) {
  $$(".task-edit", root).forEach((r) => {
    const kind = $("[data-f=kind]", r), days = $("[data-f=interval_days]", r);
    if (kind.dataset.bound) return;
    kind.dataset.bound = "1";
    days.addEventListener("input", () => (days.dataset.touched = "1"));
    kind.addEventListener("change", () => { if (!days.dataset.touched) days.value = KIND_DAYS[kind.value]; });
  });
}

function taskRow(t = {}) {
  return `<div class="task-edit">
    <div class="kind"><label>Task</label><select data-f="kind">${KINDS.map(([k, l]) => `<option value="${k}" ${t.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div><label>Check every (days)</label><input data-f="interval_days" type="number" min="1" max="730" inputmode="numeric" value="${esc(t.interval_days ?? 7)}" required></div>
    <div><label>Winter (days)</label><input data-f="winter_interval_days" type="number" min="1" max="730" inputmode="numeric" value="${esc(t.winter_interval_days ?? "")}" placeholder="Same"></div>
    <div><label>Last done</label><input data-f="last_done" type="date" max="${localToday()}" value="${esc(t.last_done_new ?? "")}"></div>
    <button type="button" class="icon-btn ghost danger" data-rm aria-label="Remove task">✕</button>
  </div>`;
}

async function plantForm(p) {
  const rooms = await api("/api/rooms");
  const identify = await api("/api/identify").catch(() => ({ configured: false }));
  const isNew = !p;
  openModal(`<h2>${isNew ? "Add plant" : "Edit plant"}</h2>
    <form id="plant-form">
      <div class="stack" style="margin-bottom:12px"><div><label for="id-photo">Identify from a photo</label>
        ${identify.configured ? `<div class="row">
          <input id="id-photo" type="file" accept="image/*">
          <button type="button" class="small" id="id-go" disabled>Identify</button>
        </div>
        <p class="hint" id="id-hint">A sharp photo of leaves or flowers works best. The photo goes to Pl@ntNet just to identify; it isn't saved.</p>
        <div class="results" id="id-results"></div>` : `<p class="hint" id="id-hint">Photo identification isn't set up on this server.
          ${state.me.is_admin ? "Add PLANTS_PLANTNET_API_KEY to the compose file; see Photo identification in the readme." : "Ask an administrator to add a Pl@ntNet API key."}</p>`}
      </div></div>
      ${isNew ? `<div class="stack" style="margin-bottom:12px"><div><label for="lib">Start from the starter library (optional)</label>
        <select id="lib"><option value="">Blank plant</option></select>
        <p class="hint">Fills in suggested care you can change. Intervals are when to check the soil, not a strict watering schedule.</p></div></div>` : ""}
      <div class="form-grid">
        <div><label for="f-name">Name</label><input id="f-name" name="name" required maxlength="80" value="${esc(p?.name)}" placeholder="Kitchen pothos"></div>
        <div><label for="f-species">Species or type</label><input id="f-species" name="species" maxlength="120" value="${esc(p?.species)}" placeholder="From the plant tag"></div>
        <div><label for="f-room">Room</label><input id="f-room" name="room" list="room-list" maxlength="60" value="${esc(p?.room)}" placeholder="Living room">
          <datalist id="room-list">${rooms.map((r) => `<option value="${esc(r.name)}">`).join("")}</datalist></div>
        <div><label for="f-light">Light</label><input id="f-light" name="light" maxlength="120" value="${esc(p?.light)}" placeholder="Bright, indirect"></div>
        <div><label for="f-pot">Pot size</label><input id="f-pot" name="pot_size" maxlength="40" value="${esc(p?.pot_size)}" placeholder='6"'></div>
        <div><label for="f-mat">Pot material</label><input id="f-mat" name="pot_material" maxlength="40" value="${esc(p?.pot_material)}" placeholder="Terracotta"></div>
        <div><label for="f-acq">Acquired</label><input id="f-acq" name="acquired" type="date" value="${esc(p?.acquired)}"></div>
        <div><label>&nbsp;</label><label class="toggle"><input type="checkbox" name="outdoor" ${p?.outdoor ? "checked" : ""}> Outdoor plant</label></div>
        ${feature("plant_info") ? `<div class="full"><label for="f-info">Info</label><textarea id="f-info" name="info" maxlength="4000" placeholder="What this plant is, where it came from, and anything worth remembering">${esc(p?.info)}</textarea></div>` : ""}
        <div class="full"><label for="f-notes">Care notes</label><textarea id="f-notes" name="notes" maxlength="4000">${esc(p?.notes)}</textarea></div>
        <div class="full"><label for="f-src">Care source link (optional)</label><input id="f-src" name="care_source" type="url" maxlength="300" value="${esc(p?.care_source)}" placeholder="https://"></div>
      </div>
      ${isNew ? `<h2>Care tasks</h2><div id="task-rows">${taskRow({ kind: "water", interval_days: 7 })}</div>
        <div class="chips add-kinds" role="group" aria-label="Add a care task">${KINDS.filter(([k]) => k !== "water").map(([k, l]) => `<button type="button" class="chip" data-addkind="${k}">+ ${l}</button>`).join("")}</div>` : ""}
      ${isNew ? `<div class="stack" style="margin-top:12px"><div><label for="f-photo">Photo (optional)</label><input id="f-photo" type="file" accept="image/*"></div></div>` : ""}
      <p class="error" id="form-error"></p>
      <div class="sheet-actions"><button type="button" data-close>Cancel</button><button class="primary" type="submit">${isNew ? "Add plant" : "Save"}</button></div>
    </form>`, async (sheet) => {
    const form = $("#plant-form", sheet);
    const bindRm = () => $$("[data-rm]", sheet).forEach((b) => (b.onclick = () => b.closest(".task-edit").remove()));
    if (identify.configured) {
      const idHintText = "A sharp photo of leaves or flowers works best. The photo goes to Pl@ntNet just to identify; it isn't saved.";
      const file = $("#id-photo", sheet), go = $("#id-go", sheet), hint = $("#id-hint", sheet), results = $("#id-results", sheet);
      file.onchange = () => { go.disabled = !file.files[0]; results.innerHTML = ""; hint.textContent = idHintText; };
      go.onclick = async () => {
        if (!file.files[0]) return;
        go.disabled = true;
        go.textContent = "Identifying…";
        results.innerHTML = "";
        hint.textContent = idHintText;
        try {
          const fd = new FormData();
          fd.append("photo", file.files[0]);
          const res = await api("/api/identify", { method: "POST", form: fd });
          results.innerHTML = res.suggestions.length
            ? res.suggestions.map((s, i) => `<button type="button" data-id-pick="${i}">${s.common ? `<b>${esc(s.common)}</b> · ` : ""}<i>${esc(s.scientific)}</i><span class="muted"> · ${s.score}% match</span></button>`).join("")
            : '<p class="muted">No matches for that photo. Try a closer shot of leaves or flowers.</p>';
          $$("[data-id-pick]", results).forEach((b) => (b.onclick = () => {
            const s = res.suggestions[Number(b.dataset.idPick)];
            form.species.value = s.scientific;
            if (!form.name.value) form.name.value = s.common || s.scientific;
            results.innerHTML = "";
            const c = isNew && s.care;
            if (c) {
              const rows = [taskRow({ kind: "water", interval_days: c.water_days })];
              if (c.fertilize_days) rows.push(taskRow({ kind: "fertilize", interval_days: c.fertilize_days }));
              if (c.mist_days) rows.push(taskRow({ kind: "mist", interval_days: c.mist_days }));
              $("#task-rows").innerHTML = rows.join("");
              bindRm();
              bindKindDefaults(sheet);
              if (c.match === "species") {
                if (!form.light.value) form.light.value = c.light;
                if (!form.notes.value) form.notes.value = c.care;
                if (!form.care_source.value) form.care_source.value = c.source;
              }
              const extra = [c.fertilize_days ? `fertilize every ${c.fertilize_days}` : "", c.mist_days ? `mist every ${c.mist_days}` : ""].filter(Boolean).join(", ");
              hint.textContent = `Filled from ${s.scientific}. Suggested care from the ${c.basis}: check water every ${c.water_days} days${extra ? ", " + extra : ""}. Edit anything before saving.`;
            } else {
              hint.textContent = `Filled from ${s.scientific}. Edit anything before saving.`;
            }
            file.value = "";
            go.disabled = true;
          }));
        } catch (err) { hint.textContent = err.message; }
        go.textContent = "Identify";
        go.disabled = !file.files[0];
      };
    }
    if (isNew) {
      bindRm();
      $$("[data-addkind]", sheet).forEach((b) => (b.onclick = () => {
        const kind = b.dataset.addkind;
        $("#task-rows").insertAdjacentHTML("beforeend", taskRow({ kind, interval_days: KIND_DAYS[kind] }));
        bindRm();
        bindKindDefaults(sheet);
      }));
      bindKindDefaults(sheet);
      const lib = await getLibrary();
      $("#lib").insertAdjacentHTML("beforeend", lib.plants.map((x) => `<option value="${esc(x.key)}">${esc(x.name)} (${esc(x.species)})</option>`).join(""));
      $("#lib").onchange = () => {
        const x = lib.plants.find((l) => l.key === $("#lib").value);
        if (!x) return;
        if (!form.name.value) form.name.value = x.name;
        form.species.value = x.species;
        form.light.value = x.light;
        form.notes.value = x.care;
        form.care_source.value = x.source;
        const rows = [taskRow({ kind: "water", interval_days: x.water_days })];
        if (x.fertilize_days) rows.push(taskRow({ kind: "fertilize", interval_days: x.fertilize_days }));
        if (x.mist_days) rows.push(taskRow({ kind: "mist", interval_days: x.mist_days }));
        $("#task-rows").innerHTML = rows.join("");
        bindRm();
      };
    }
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = {
        name: form.name.value, species: form.species.value, room: form.room.value, light: form.light.value,
        pot_size: form.pot_size.value, pot_material: form.pot_material.value, acquired: form.acquired.value || null,
        outdoor: form.outdoor.checked, notes: form.notes.value, care_source: form.care_source.value,
        ...(feature("plant_info") ? { info: form.info.value } : {}),
      };
      if (isNew) {
        body.tasks = $$(".task-edit", sheet).map((r) => ({
          kind: $("[data-f=kind]", r).value,
          interval_days: Number($("[data-f=interval_days]", r).value),
          winter_interval_days: $("[data-f=winter_interval_days]", r).value ? Number($("[data-f=winter_interval_days]", r).value) : null,
          last_done: $("[data-f=last_done]", r).value || null,
        }));
      }
      try {
        const saved = await api(isNew ? "/api/plants" : `/api/plants/${p.id}`, { method: isNew ? "POST" : "PUT", body });
        const file = isNew && $("#f-photo").files[0];
        if (file) {
          const fd = new FormData();
          fd.append("photo", file);
          fd.append("main", "true");
          await api(`/api/plants/${saved.id}/events`, { method: "POST", form: fd });
        }
        closeModal();
        toast(isNew ? "Plant added" : "Saved");
        if (isNew) location.hash = `#/plant/${saved.id}`; else route();
      } catch (err) { $("#form-error").textContent = err.message; }
    };
  });
}

function taskForm(p, t, after) {
  const isNew = !t;
  openModal(`<h2>${isNew ? "Add task" : "Edit task"} · ${esc(p.name)}</h2>
    <form id="task-form" class="stack">
      <div class="form-grid">
        <div><label for="t-kind">Task</label><select id="t-kind">${KINDS.map(([k, l]) => `<option value="${k}" ${(t?.kind || "fertilize") === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div><label for="t-label">Custom name (optional)</label><input id="t-label" maxlength="40" value="${esc(t?.custom_label)}" placeholder="Rotate pot"></div>
        <div><label for="t-int">Check every (days)</label><input id="t-int" type="number" min="1" max="730" inputmode="numeric" required value="${esc(t?.interval_days ?? KIND_DAYS[t?.kind || "fertilize"])}"></div>
        <div><label for="t-win">Winter interval (days)</label><input id="t-win" type="number" min="1" max="730" inputmode="numeric" value="${esc(t?.winter_interval_days ?? "")}" placeholder="Use the season setting"></div>
        ${isNew ? `<div><label for="t-last">Last done (optional)</label><input id="t-last" type="date" max="${localToday()}"></div>` : ""}
      </div>
      <p class="hint">Winter months and the default winter stretch are set in Settings. Nothing changes a schedule behind your back.</p>
      <p class="error" id="task-error"></p>
      <div class="sheet-actions">
        ${isNew ? "" : '<button type="button" class="danger" id="t-del">Delete task</button>'}
        <button type="button" data-close>Cancel</button><button class="primary" type="submit">Save</button></div>
    </form>`, (sheet) => {
    if (isNew) {
      let touched = false;
      $("#t-int", sheet).oninput = () => (touched = true);
      $("#t-kind", sheet).onchange = () => { if (!touched) $("#t-int", sheet).value = KIND_DAYS[$("#t-kind", sheet).value]; };
    }
    $("#task-form", sheet).onsubmit = async (e) => {
      e.preventDefault();
      const body = {
        kind: $("#t-kind").value, label: $("#t-label").value, interval_days: Number($("#t-int").value),
        winter_interval_days: $("#t-win").value ? Number($("#t-win").value) : null,
      };
      if (isNew) body.last_done = $("#t-last").value || null;
      try {
        await api(isNew ? `/api/plants/${p.id}/tasks` : `/api/tasks/${t.id}`, { method: isNew ? "POST" : "PUT", body });
        closeModal(); toast("Saved"); after();
      } catch (err) { $("#task-error").textContent = err.message; }
    };
    if (!isNew) $("#t-del", sheet).onclick = async () => {
      if (!confirm("Delete this task? Its history stays in the timeline.")) return;
      try { await api(`/api/tasks/${t.id}`, { method: "DELETE" }); closeModal(); after(); } catch (err) { fail(err); }
    };
  });
}

function photoModal(p, after) {
  openModal(`<h2>Add to timeline · ${esc(p.name)}</h2>
    <form id="photo-form" class="stack">
      <div><label for="ph-file">Photo</label><input id="ph-file" type="file" accept="image/*"></div>
      <div><label for="ph-note">Note</label><textarea id="ph-note" maxlength="1000" placeholder="New leaf unfurling"></textarea></div>
      <div><label for="ph-date">Date</label><input id="ph-date" type="date" value="${localToday()}" max="${localToday()}"></div>
      <label class="toggle"><input type="checkbox" id="ph-main" ${p.photo ? "" : "checked"}> Use as main photo</label>
      <p class="error" id="ph-error"></p>
      <div class="sheet-actions"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save</button></div>
    </form>`, (sheet) => {
    $("#photo-form", sheet).onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData();
      const file = $("#ph-file").files[0];
      if (file) fd.append("photo", file);
      fd.append("note", $("#ph-note").value);
      fd.append("date", $("#ph-date").value);
      fd.append("main", $("#ph-main").checked ? "true" : "false");
      try { await api(`/api/plants/${p.id}/events`, { method: "POST", form: fd }); closeModal(); toast("Added"); after(); }
      catch (err) { $("#ph-error").textContent = err.message; }
    };
  });
}

wideLayout.addEventListener("change", () => {
  const upcoming = $("#upcoming");
  if (upcoming) upcoming.open = state.upcomingOpen ?? wideLayout.matches;
  const weather = $("details#weather");
  if (weather) weather.open = state.weatherOpen ?? wideLayout.matches;
  setSettingsDisclosures(wideLayout.matches, location.hash.split("/")[2]);
});

async function renderSettings(section) {
  const revision = ++viewRevision;
  if (state.me && state.me.token_session) {
    $("#view").innerHTML = `<section class="card stack"><h1 style="margin-top:0">Settings</h1>
      <p class="muted">You're signed in with an API token. This session can only do what the token API can -
      settings, notifications, users, tokens and backups need a username-and-password sign-in.</p></section>`;
    return;
  }
  const admin = state.me.is_admin;
  const [settings, rooms, tokens, users] = await Promise.all([
    api("/api/settings"), api("/api/rooms"), api("/api/tokens"),
    admin ? api("/api/users") : null,
  ]);
  if (revision !== viewRevision) return;
  state.settings = settings;
  showSettings({ settings, rooms, tokens, users, user: state.me }, { expanded: wideLayout.matches, section }, {
    api, refresh: renderSettings, signOut,
    settingsChanged(updated) {
      state.settings = updated;
      setAppName(updated.app_name);
    },
    backupRestored() {
      state.me = null;
      showAuth();
    },
  });
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

function start() {
  boot().catch(() => {
    state.me = null;
    $("#top").hidden = true;
    $("#view").innerHTML = `<section class="card auth stack">
      <h1>Can't reach Plants</h1>
      <p>Check your connection to the Plants server and try again.</p>
      <button class="primary" id="retry" type="button">Try again</button>
    </section>`;
    $("#retry").onclick = () => {
      $("#view").innerHTML = '<p class="muted" role="status">Loading Plants…</p>';
      start();
    };
  });
}

start();
