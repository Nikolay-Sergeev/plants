import { $, $$, chevronIcon, esc, fail, fmtDate, MONTHS, toast } from "./ui.js?v=1";
import { initPushSettings } from "./push.js?v=1";

function disclosure(id, title, content, extraAttributes = "") {
  return `<details class="settings-item disclosure" id="settings-${id}">
    <summary><span>${title}</span>${chevronIcon}</summary>
    <div class="disclosure-body stack" ${extraAttributes}>${content}</div>
  </details>`;
}

function generalSection(settings) {
  return disclosure("general", "General", `
    <div><label for="s-name">App name</label><div class="row"><input id="s-name" maxlength="60" value="${esc(settings.app_name)}" style="flex:1"><button id="s-name-save">Save</button></div></div>
    <div><label for="s-units">Units</label><select id="s-units"><option value="imperial" ${settings.units !== "metric" ? "selected" : ""}>°F, inches, mph</option><option value="metric" ${settings.units === "metric" ? "selected" : ""}>°C, mm, km/h</option></select></div>
  `);
}

function featuresSection(settings) {
  return disclosure("features", "Features", `
    <p class="muted" >These switches apply to everyone in your household.</p>
    <label class="toggle"><input type="checkbox" data-feature="growth_timeline" ${settings.feature_growth_timeline ? "checked" : ""}><span>Growth timeline<small class="muted">each plant's photos side by side, oldest first</small></span></label>
    <label class="toggle"><input type="checkbox" data-feature="care_suggestions" ${settings.feature_care_suggestions ? "checked" : ""}><span>Care suggestions<small class="muted">photo ID pre-fills water and fertilize intervals</small></span></label>
    <label class="toggle"><input type="checkbox" data-feature="quick_links" ${settings.feature_quick_links ? "checked" : ""}><span>One-tap quick links<small class="muted">log care from a notification without signing in</small></span></label>
    <label class="toggle"><input type="checkbox" data-feature="plant_info" ${settings.feature_plant_info ? "checked" : ""}><span>Plant Info<small class="muted">free-text details on each plant; hiding it keeps the text</small></span></label>
    <label class="toggle"><input type="checkbox" data-feature="token_login" ${settings.feature_token_login ? "checked" : ""}><span>API token sign-in<small class="muted">sign into the website with an existing API token</small></span></label>
    <p class="hint">A quick link can only log or snooze its own task. Set "App address for links" under Notifications so the links in alerts work away from home. If a link ever ends up somewhere it shouldn't, reset them all.</p>
    <div><button class="small" id="ql-reset">Reset all quick links</button></div>
  `);
}

function weatherSection(settings) {
  return disclosure("weather", "Weather location", `
    <p class="muted" >${settings.weather_name ? esc(settings.weather_name) : "No location set"}.</p>
    <div class="row"><input id="wx-q" placeholder="City or town" style="flex:1" aria-label="Search for a city"><button id="wx-search">Search</button></div>
    <div class="results" id="wx-results"></div>
    ${settings.weather_name ? '<button class="small ghost" id="wx-clear">Remove location</button>' : ""}
  `);
}

function seasonsSection(settings) {
  return disclosure("seasons", "Seasons", `
    <p class="muted" >Choose the winter months and how much to extend care intervals. Individual winter intervals take priority.</p>
    <div class="row" id="s-months">${MONTHS.map((m, i) => `<label class="toggle" style="min-width:74px"><input type="checkbox" value="${i + 1}" ${settings.winter_months.includes(i + 1) ? "checked" : ""}> ${m}</label>`).join("")}</div>
    <div><label for="s-mult">Winter stretch</label><select id="s-mult">
      ${[1, 1.25, 1.5, 2].map((v) => `<option value="${v}" ${settings.winter_multiplier === v ? "selected" : ""}>${v === 1 ? "Off (same intervals)" : "x" + v}</option>`).join("")}</select></div>
    <button id="s-season-save">Save seasons</button>
  `);
}

function notificationsSection() {
  return disclosure("notifications", "Notifications", `
    <p class="muted" role="status">Loading notification settings…</p>
  `, 'id="notification-settings" aria-busy="true"');
}

function pushSection() {
  return disclosure("push", "Push notifications", `
    <p class="muted">Get care reminders on this device, even when Plants is closed. Reminders follow the household’s notification schedule.</p>
    <label class="toggle"><input type="checkbox" id="push-on" disabled> Push on this device</label>
    <p class="muted" id="push-status">Checking this browser…</p>
    <div class="row" id="push-actions" hidden><button id="push-test">Send test push</button></div>
  `);
}

function roomsSection(rooms) {
  return disclosure("rooms", "Rooms", `
    <div id="rooms">${rooms.map((r) => `<div class="list-row"><span class="grow">${esc(r.name)} <span class="muted">· ${r.plants} plant${r.plants === 1 ? "" : "s"}</span></span>
      <button class="small" data-rename="${r.id}">Rename</button><button class="small danger" data-delroom="${r.id}">Delete</button></div>`).join("") || '<p class="muted">No rooms yet. Rooms are created when you type one on a plant.</p>'}</div>
    <div class="row"><input id="room-new" placeholder="New room" maxlength="60" style="flex:1" aria-label="New room name"><button id="room-add">Add room</button></div>
  `);
}

function tokensSection(tokens) {
  return disclosure("tokens", "API tokens", `
    <p class="muted">Let a script, home automation, or an AI assistant add plants from a tag photo, read what's due, and log care. <a href="/api/docs" target="_blank" rel="noopener">API docs</a></p>
    <div id="token-new"></div>
    <div>${tokens.map((t) => `<div class="list-row"><span class="grow"><b>${esc(t.name)}</b> <span class="muted">${esc(t.prefix)}… · ${t.last_used_at ? "used " + fmtDate(t.last_used_at) : "never used"}</span></span>
      <button class="small danger" data-revoke="${t.id}">Revoke</button></div>`).join("")}</div>
    <div class="row"><input id="tok-name" placeholder="Token name, e.g. Assistant" maxlength="60" style="flex:1" aria-label="Token name"><button id="tok-add">Create token</button></div>
  `);
}

function usersSection(users, user) {
  return disclosure("users", "Users", `
    <p class="muted">Everyone shares one set of plants. Each care entry records who logged it.</p>
    ${users.map((u) => `<div class="list-row"><span class="grow"><b>${esc(u.username)}</b> <span class="muted">${u.is_admin ? "Administrator" : "Member"}${u.active ? "" : " · disabled"}</span></span>
      ${u.id === user.id ? '<span class="muted">You</span>' : `<button class="small" data-uadmin="${u.id}" data-val="${u.is_admin ? 0 : 1}">${u.is_admin ? "Make member" : "Make admin"}</button>
      <button class="small" data-uactive="${u.id}" data-val="${u.active ? 0 : 1}">${u.active ? "Disable" : "Enable"}</button>`}
      <button class="small" data-upw="${u.id}">Password</button></div>`).join("")}
    <form class="form-grid" id="user-form">
      <div><label for="u-name">Username</label><input id="u-name" required autocomplete="off"></div>
      <div><label for="u-pw">Password</label><input id="u-pw" type="password" required minlength="8" autocomplete="new-password"></div>
      <label class="toggle"><input type="checkbox" id="u-admin"> Administrator</label>
      <div><button class="primary" type="submit">Add user</button></div>
    </form>
  `);
}

function backupSection() {
  return disclosure("backup", "Backup", `
    <p class="muted">Export everything, photos included, as one JSON file. Importing replaces all data and signs everyone out.</p>
    <div class="row"><a class="btn" href="/api/export" download="plants-backup.json">Export backup</a>
      <label class="btn" style="margin:0;color:var(--text);font-size:15px">Import backup<input type="file" id="import" accept="application/json,.json" hidden></label></div>
  `);
}

export function setSettingsDisclosures(expanded, section, openSections = null) {
  for (const details of $$("#settings-list > details")) {
    if (expanded) details.removeAttribute("name");
    details.open = openSections ? openSections.has(details.id) : expanded || details.id === `settings-${section}`;
    if (!expanded) details.setAttribute("name", "plants-settings");
  }
}

export function showSettings({ settings, rooms, tokens, users, user }, { expanded, section }, actions) {
  const openSections = section === undefined && $("#settings-list")
    ? new Set($$("#settings-list > details[open]").map((details) => details.id)) : null;
  const household = user.is_admin
    ? [generalSection(settings), featuresSection(settings), weatherSection(settings), seasonsSection(settings),
      notificationsSection()].join("")
    : "";
  const management = user.is_admin ? usersSection(users, user) + backupSection() : "";
  $("#view").innerHTML = `
    <h1>Settings</h1>
    <div id="settings-list">
      ${household}${pushSection()}${roomsSection(rooms)}${tokensSection(tokens)}${management}
    </div>
    <div class="mobile-account"><span class="muted">${esc(user.username)}</span><button type="button" class="ghost" id="settings-logout">Sign out</button></div>`;
  setSettingsDisclosures(expanded, section, openSections);
  $("#settings-logout").onclick = () => actions.signOut().catch(fail);
  bindSettings(user.is_admin, actions);
  if (user.is_admin) loadNotificationSettings($("#notification-settings"), actions.api);
  initPushSettings(actions.api, user.is_admin);
}

// Notification settings can fail independently of the rest of Settings.
async function loadNotificationSettings(panel, api) {
  const focused = panel.contains(document.activeElement);
  const retry = $("#retry-notifications", panel);
  if (retry) {
    retry.disabled = true;
    retry.textContent = "Retrying…";
  }
  panel.setAttribute("aria-busy", "true");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const notify = await api("/api/notifications", { signal: controller.signal })
    .catch(() => null)
    .finally(() => clearTimeout(timeout));
  if (!panel.isConnected) return;
  panel.removeAttribute("aria-busy");
  const restoreFocus = focused && [retry, document.body].includes(document.activeElement);

  if (!notify) {
    panel.innerHTML = `<p class="muted" role="status">Notification settings could not be loaded.</p>
      <button type="button" id="retry-notifications">Try again</button>`;
    const button = $("#retry-notifications", panel);
    button.onclick = () => loadNotificationSettings(panel, api);
    if (restoreFocus) button.focus({ preventScroll: true });
    return;
  }

  renderNotificationSettings(panel, notify, api);
  if (restoreFocus) $("#n-urls", panel).focus({ preventScroll: true });
}

function renderNotificationSettings(panel, notify, api) {
  const hours = (sel) => Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === sel ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("");
  panel.innerHTML = `
    <p class="muted">Uses <a href="https://github.com/caronc/apprise/wiki" target="_blank" rel="noopener">Apprise</a> URLs, one per line: ntfy, Gotify, Pushover, email, Discord, Telegram and more. Alerts say "check soil", never "water now".</p>
    <div><label for="n-urls">Apprise URLs</label><textarea id="n-urls" placeholder="ntfys://ntfy.example.com/plants&#10;pover://user@token">${esc(notify.notify_urls)}</textarea></div>
    <div class="form-grid">
      <div><label for="n-mode">Style</label><select id="n-mode"><option value="digest" ${notify.notify_mode === "digest" ? "selected" : ""}>One daily digest</option><option value="each" ${notify.notify_mode === "each" ? "selected" : ""}>One alert per plant</option></select></div>
      <div><label for="n-hour">Send from</label><select id="n-hour">${hours(notify.notify_hour)}</select></div>
      <div><label for="n-qs">Quiet hours start</label><select id="n-qs">${hours(notify.quiet_start)}</select></div>
      <div><label for="n-qe">Quiet hours end</label><select id="n-qe">${hours(notify.quiet_end)}</select></div>
      <div><label for="n-rep">Repeat overdue every (days, 0 = never)</label><input id="n-rep" type="number" min="0" max="30" inputmode="numeric" value="${notify.overdue_repeat_days}"></div>
      <div><label for="n-url">App address for links (optional)</label><input id="n-url" type="url" placeholder="https://plants.example.com" value="${esc(notify.public_url)}"></div>
    </div>
    <div class="row"><button id="n-save">Save notifications</button><button id="n-test">Send test</button></div>`;
  const notifyBody = () => ({
    notify_urls: $("#n-urls").value, notify_mode: $("#n-mode").value, notify_hour: Number($("#n-hour").value),
    quiet_start: Number($("#n-qs").value), quiet_end: Number($("#n-qe").value),
    overdue_repeat_days: Number($("#n-rep").value || 0), public_url: $("#n-url").value,
  });
  $("#n-save").onclick = async () => {
    try { await api("/api/notifications", { method: "PUT", body: notifyBody() }); toast("Notifications saved"); } catch (err) { fail(err); }
  };
  $("#n-test").onclick = async () => {
    try { await api("/api/notifications", { method: "PUT", body: notifyBody() }); await api("/api/notifications/test", { method: "POST" }); toast("Test sent"); } catch (err) { fail(err); }
  };
}

function bindSettings(admin, { api, refresh, settingsChanged, backupRestored }) {
  const saveSettings = async (body, msg = "Saved") => {
    try { const settings = await api("/api/settings", { method: "PUT", body }); settingsChanged(settings); toast(msg); } catch (err) { fail(err); }
  };
  if (admin) {
    $("#s-name-save").onclick = () => saveSettings({ app_name: $("#s-name").value });
    $("#s-units").onchange = () => saveSettings({ units: $("#s-units").value });
    $$("[data-feature]").forEach((cb) => (cb.onchange = () => saveSettings({ [`feature_${cb.dataset.feature}`]: cb.checked }, cb.checked ? "Turned on" : "Turned off")));
    $("#ql-reset").onclick = async () => {
      if (!confirm("Reset every quick link? Links already sent in old notifications stop working.")) return;
      try { const r = await api("/api/quick-links/reset", { method: "POST" }); toast(`Reset ${r.reset} link${r.reset === 1 ? "" : "s"}`); } catch (err) { fail(err); }
    };
    const search = async () => {
      const q = $("#wx-q").value.trim();
      if (q.length < 2) return;
      try {
        const res = await api(`/api/weather/search?q=${encodeURIComponent(q)}`);
        $("#wx-results").innerHTML = res.length ? res.map((r, i) => `<button data-wx="${i}">${esc(r.label)}</button>`).join("") : '<p class="muted">No matches.</p>';
        $$("[data-wx]").forEach((b) => (b.onclick = async () => {
          const r = res[Number(b.dataset.wx)];
          await saveSettings({ weather_name: r.label, weather_lat: r.latitude, weather_lon: r.longitude }, "Location saved");
          refresh();
        }));
      } catch (err) { fail(err); }
    };
    $("#wx-search").onclick = search;
    $("#wx-q").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); search(); } };
    if ($("#wx-clear")) $("#wx-clear").onclick = async () => { await saveSettings({ clear_weather: true }, "Location removed"); refresh(); };
    $("#s-season-save").onclick = () => saveSettings({
      winter_months: $$("#s-months input:checked").map((i) => Number(i.value)),
      winter_multiplier: Number($("#s-mult").value),
    });
    $$("[data-uadmin]").forEach((b) => (b.onclick = () => updateUser(api, refresh, b.dataset.uadmin, { is_admin: b.dataset.val === "1" })));
    $$("[data-uactive]").forEach((b) => (b.onclick = () => updateUser(api, refresh, b.dataset.uactive, { active: b.dataset.val === "1" })));
    $$("[data-upw]").forEach((b) => (b.onclick = () => {
      const pw = prompt("New password (at least 8 characters)");
      if (pw) updateUser(api, refresh, b.dataset.upw, { password: pw });
    }));
    $("#user-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api("/api/users", { method: "POST", body: { username: $("#u-name").value, password: $("#u-pw").value, is_admin: $("#u-admin").checked } });
        toast("User added"); refresh();
      } catch (err) { fail(err); }
    };
    $("#import").onchange = async (e) => {
      const file = e.target.files[0];
      if (!file || !confirm("Replace ALL current data with this backup?")) return;
      try {
        const data = JSON.parse(await file.text());
        await api("/api/import", { method: "POST", body: data });
        toast("Backup restored. Sign in again.");
        backupRestored();
      } catch (err) { fail(err); }
    };
  }
  $$("[data-rename]").forEach((b) => (b.onclick = async () => {
    const name = prompt("Room name");
    if (!name) return;
    try { await api(`/api/rooms/${b.dataset.rename}`, { method: "PUT", body: { name } }); refresh(); } catch (err) { fail(err); }
  }));
  $$("[data-delroom]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Delete this room? Its plants stay, just without a room.")) return;
    try { await api(`/api/rooms/${b.dataset.delroom}`, { method: "DELETE" }); refresh(); } catch (err) { fail(err); }
  }));
  $("#room-add").onclick = async () => {
    const name = $("#room-new").value.trim();
    if (!name) return;
    try { await api("/api/rooms", { method: "POST", body: { name } }); refresh(); } catch (err) { fail(err); }
  };
  $$("[data-revoke]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Revoke this token? Anything using it stops working.")) return;
    try { await api(`/api/tokens/${b.dataset.revoke}`, { method: "DELETE" }); refresh(); } catch (err) { fail(err); }
  }));
  $("#tok-add").onclick = async () => {
    const name = $("#tok-name").value.trim();
    if (!name) return toast("Name the token first");
    try {
      const t = await api("/api/tokens", { method: "POST", body: { name } });
      await refresh();
      $("#token-new").innerHTML = `<p><b>Copy this token now.</b> It won't be shown again.</p><div class="token-new">${esc(t.token)}</div>`;
    } catch (err) { fail(err); }
  };
}

async function updateUser(api, refresh, id, body) {
  try { await api(`/api/users/${id}`, { method: "PUT", body }); toast("User updated"); refresh(); } catch (err) { fail(err); }
}
