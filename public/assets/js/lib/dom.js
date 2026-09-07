/** Escape every character that can break out of an HTML text or attribute context. */
export function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Tagged template that escapes every interpolated value.
 * Use html`<p>${userText}</p>` — never string concatenation — for any markup
 * built from data the user or the network supplied.
 * Opt out only for markup you built yourself, via `raw()`.
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    out += (v && v.__raw === true ? v.value : Array.isArray(v) ? v.map(part => (part && part.__raw ? part.value : esc(part))).join("") : esc(v));
    out += strings[i + 1];
  }
  return out;
}

/** Mark a string as already-safe markup. Only ever pass markup you generated. */
export const raw = (value) => ({ __raw: true, value });

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Render trusted markup into a container. */
export function mount(container, markup) {
  container.innerHTML = markup;
  return container;
}

/** A skeleton says what shape is arriving. It is not a spinner. */
export function skeleton({ lines = 3, block = false } = {}) {
  if (block) return `<div class="skeleton skeleton-block" aria-hidden="true"></div>`;
  return `<div aria-hidden="true">${'<div class="skeleton skeleton-line"></div>'.repeat(lines)}</div>`;
}

/**
 * An empty panel is ambiguous between broken, empty and still loading.
 * This names which, and what action fills it.
 */
export function emptyState({ state = "empty", title, body, action }) {
  const cls = state === "error" ? "note note-bad" : "empty";
  const btn = action ? `<a class="btn btn-primary" href="${esc(action.href)}">${esc(action.label)}</a>` : "";
  return `<div class="${cls}"><h3>${esc(title)}</h3><p>${esc(body)}</p>${btn}</div>`;
}

export function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Announce to screen readers and show a transient message. */
export function toast(message, kind = "info") {
  let host = document.getElementById("toast-host");
  if (!host) {
    host = el("div", { id: "toast-host", role: "status", "aria-live": "polite" });
    document.body.append(host);
  }
  const node = el("div", { class: `toast toast-${kind}`, text: message });
  host.append(node);
  setTimeout(() => node.remove(), 5000);
}

/**
 * Add a Show/Hide control to every password box inside `root`.
 *
 * Being unable to see what you typed is how a typo at signup becomes an account
 * you can never log into. The field starts hidden and the control is a real
 * button, so it is reachable by keyboard and announced to screen readers.
 */
export function wirePasswordToggles(root) {
  for (const input of root.querySelectorAll('input[type="password"]')) {
    if (input.dataset.toggled === "1") continue;
    input.dataset.toggled = "1";

    const wrap = el("div", { class: "pw-wrap" });
    input.parentNode.insertBefore(wrap, input);
    wrap.append(input);

    const button = el("button", {
      type: "button",
      class: "pw-toggle",
      "aria-pressed": "false",
      "aria-label": "Show password",
      text: "Show",
    });

    button.addEventListener("click", () => {
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.textContent = showing ? "Show" : "Hide";
      button.setAttribute("aria-pressed", String(!showing));
      button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      // Keep the caret where it was; toggling type resets it in some browsers.
      const end = input.value.length;
      input.focus();
      try { input.setSelectionRange(end, end); } catch { /* not all types support it */ }
    });

    wrap.append(button);
  }
}
