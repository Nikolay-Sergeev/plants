import { $, fail, toast } from "./ui.js?v=1";

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

// Empty string when this browser can do push; otherwise why not, in plain words.
function pushUnsupportedReason() {
  if (!window.isSecureContext) return "Push needs HTTPS. Open Plants at its https:// address (through your reverse proxy) to turn it on.";
  const has = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIOS() && !isStandalone()) return "On iPhone and iPad, add Plants to your Home Screen first (Share, then Add to Home Screen), open it from there, and turn push on in Settings.";
  if (!has) return "This browser doesn't support push notifications.";
  return "";
}

function b64urlToBytes(value) {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

function bytesToB64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function currentPushSubscription() {
  if (pushUnsupportedReason()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function pushOff(api) {
  const sub = await currentPushSubscription();
  if (!sub) return;
  await api("/api/push/unsubscribe", { method: "POST", body: { endpoint: sub.endpoint }, allow401: true }).catch(() => {});
  await sub.unsubscribe();
}

async function pushOn(api, publicKey) {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with old server keys can't receive pushes signed with new ones.
  const currentKey = sub?.options.applicationServerKey;
  if (currentKey && bytesToB64url(currentKey) !== publicKey.replace(/=+$/, "")) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(publicKey) });
  const json = sub.toJSON();
  return api("/api/push/subscribe", { method: "POST", body: { endpoint: json.endpoint, keys: json.keys } });
}

export async function initPushSettings(api, admin) {
  const box = $("#push-on");
  if (!box) return;
  const status = $("#push-status");
  const actions = $("#push-actions");
  const sendTest = $("#push-test");
  const show = (text, checked, enabled) => {
    status.textContent = text;
    box.checked = checked;
    box.disabled = !enabled;
    actions.hidden = !checked;
  };
  const reason = pushUnsupportedReason();
  if (reason) return show(reason, false, false);
  let sub = null;
  let info;
  try {
    sub = await currentPushSubscription();
    info = await api("/api/push" + (sub ? "?endpoint=" + encodeURIComponent(sub.endpoint) : ""));
  } catch (err) {
    return show("Couldn't check push status: " + (err.message || err), false, false);
  }
  if (!box.isConnected) return;
  if (!info.configured) {
    const why = info.problem ? ` (${info.problem})` : "";
    return show(admin
      ? `Push isn't set up on the server yet${why}. Add VAPID keys to your compose file; the readme shows how.`
      : `Push isn't set up on the server yet${why}. Ask an administrator to turn it on.`, false, false);
  }
  if (Notification.permission === "denied") {
    return show("Notifications are blocked for this site. Allow them in your browser's site settings, then reload.", false, false);
  }
  const others = (n) => (n > 0 ? ` You have push on ${n} other device${n === 1 ? "" : "s"}.` : "");
  const on = Boolean(sub && info.subscribed);
  if (on) show("On for this device." + (info.last_error ? ` Last delivery failed: ${info.last_error}.` : "") + others(info.devices - 1), true, true);
  else show("Off for this device." + others(info.devices), false, true);

  box.onchange = async () => {
    box.disabled = true;
    try {
      if (box.checked) {
        // Ask straight from the tap, before any other await, so browsers treat it as a user gesture.
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          show(permission === "denied"
            ? "Notifications are blocked for this site. Allow them in your browser's site settings, then reload."
            : "Permission wasn't granted, so push stays off.", false, permission !== "denied");
          return;
        }
        const res = await pushOn(api, info.public_key);
        show("On for this device." + others(res.devices - 1), true, true);
        toast("Push is on for this device");
      } else {
        await pushOff(api);
        const res = await api("/api/push");
        show("Off for this device." + others(res.devices), false, true);
        toast("Push is off for this device");
      }
    } catch (err) {
      show("Couldn't change push: " + (err.message || err), false, true);
    }
  };
  sendTest.onclick = async () => {
    try {
      const current = await currentPushSubscription();
      if (!current) throw new Error("This device isn't subscribed. Turn push on first.");
      await api("/api/push/test", { method: "POST", body: { endpoint: current.endpoint } });
      toast("Test push sent");
    } catch (err) {
      fail(err);
      if (box.isConnected) initPushSettings(api, admin);
    }
  };
}
