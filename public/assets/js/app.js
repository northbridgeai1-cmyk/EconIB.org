import { $, $$, mount, emptyState, toast } from "./lib/dom.js";
import { ApiError } from "./lib/api.js";
import { loadUser, state, data } from "./lib/store.js";
import { mountThemeToggle, mountBackToTop, registerServiceWorker } from "./lib/chrome.js";
import { mountSearch } from "./lib/search.js";

import dashboard from "./views/dashboard.js";
import syllabus from "./views/syllabus.js";
import ia from "./views/ia.js";
import papers from "./views/papers.js";
import reference from "./views/reference.js";
import grades from "./views/grades.js";
import account from "./views/account.js";

const routes = { "": dashboard, syllabus, ia, papers, reference, grades, account };
const view = $("#view");

/** "#/syllabus/2.3" -> { name: "syllabus", parts: ["2.3"] } */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean);
  return { name: parts[0] || "", parts: parts.slice(1) };
}

function markActiveNav(name) {
  for (const link of $$(".nav a")) {
    if (link.dataset.route === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

let renderToken = 0;

async function render() {
  const { name, parts } = parseHash();
  const handler = routes[name];
  const token = ++renderToken;

  markActiveNav(name);

  if (!handler) {
    mount(view, emptyState({
      title: "That page does not exist",
      body: "The link you followed does not match any page in EconIB.",
      action: { href: "#/", label: "Go to the dashboard" },
    }));
    return;
  }

  mount(view, `<div class="stack">
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-block"></div>
    </div>`);

  try {
    await handler({ view, parts, navigate });
    // A slower earlier render must not overwrite a newer one.
    if (token !== renderToken) return;
    // Re-trigger the entrance animation on every navigation.
    view.classList.remove("enter");
    void view.offsetWidth;
    view.classList.add("enter");
    view.focus({ preventScroll: true });
    backToTop?.update();
  } catch (err) {
    if (token !== renderToken) return;
    if (err instanceof ApiError && err.status === 401) return redirectToLogin();
    console.error(err);
    mount(view, emptyState({
      state: "error",
      title: "This page could not load",
      body: err instanceof ApiError ? err.message : "Something went wrong. Reload to try again.",
    }));
  }
}

function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function redirectToLogin() {
  location.href = "/login";
}

function paintUserChip() {
  const chip = $("#user-chip");
  if (!state.user) { chip.textContent = ""; return; }
  chip.textContent = `${state.user.yearGroup} · ${state.user.level}`;
}

/**
 * Offline is named, not implied. Losing signal otherwise looks like a hanging
 * button and silently stale data.
 */
function watchConnection() {
  const banner = $("#offline-banner");
  const paint = () => { banner.hidden = navigator.onLine !== false; };
  addEventListener("online", () => { paint(); toast("Back online.", "good"); });
  addEventListener("offline", paint);
  paint();
}

let backToTop = null;

async function start() {
  watchConnection();
  registerServiceWorker();

  const meta = $("#masthead-meta");
  mountSearch(meta, navigate);
  mountThemeToggle(meta);
  backToTop = mountBackToTop();

  // Warm the static data before the first view needs it, so a fresh sign-in
  // does not open onto an empty screen while three files are fetched.
  data.syllabus().catch(() => {});
  data.keyConcepts().catch(() => {});

  try {
    await loadUser();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return redirectToLogin();
    mount(view, emptyState({
      state: "error",
      title: "Could not reach EconIB",
      body: "Your connection or our server is down. Your work is saved; reload when you are back.",
    }));
    return;
  }
  paintUserChip();
  addEventListener("hashchange", render);
  await render();
}

export { navigate, paintUserChip };
start();
