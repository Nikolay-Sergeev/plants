export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
export const glyph = (shape) => `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">${shape}</svg>`;

export const leafIcon = glyph('<path d="M5 19c0-8 5-14 15-14 0 9-4 14-10 14a5 5 0 0 1-5-5m-1 7 11-11"/>');
export const chevronIcon = glyph('<path d="m7 10 5 5 5-5"/>');

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let toastTimer;

export function toast(msg, undo) {
  const el = $("#toast");
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button class="small" type="button">Undo</button>' : ""}`;
  el.hidden = false;
  if (undo) $("button", el).onclick = () => { el.hidden = true; undo(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), undo ? 6000 : 3000);
}

export function fail(err) { toast(err.message || String(err)); }

export function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const now = new Date();
  return `${MONTHS[m - 1]} ${d}${y !== now.getFullYear() ? ", " + y : ""}`;
}
