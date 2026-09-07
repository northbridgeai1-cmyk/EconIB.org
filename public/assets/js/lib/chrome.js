/**
 * Page furniture shared by every page: theme toggle, skip link target,
 * back-to-top, and the service worker registration.
 */
import { el, $ } from "./dom.js";

const THEME_KEY = "econib.theme";

/**
 * Theme: system by default, with an explicit override the viewer can set.
 * The override is stamped on <html> so the CSS token blocks pick it up, and it
 * is applied before first paint by the inline-free bootstrap below.
 */
export function readTheme() {
  try { return localStorage.getItem(THEME_KEY) || "system"; } catch { return "system"; }
}

export function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* private window */ }
}

/** Resolve what the viewer is actually seeing right now. */
export function effectiveTheme() {
  const mode = readTheme();
  if (mode !== "system") return mode;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function mountThemeToggle(host) {
  const button = el("button", {
    class: "btn btn-quiet btn-sm theme-toggle",
    type: "button",
    "aria-label": "Change colour theme",
    title: "Colour theme",
  });

  const paint = () => {
    const mode = readTheme();
    button.textContent = mode === "system" ? "Auto" : mode === "dark" ? "Dark" : "Light";
    button.setAttribute("aria-label", `Colour theme: ${button.textContent}. Click to change.`);
  };

  button.addEventListener("click", () => {
    const order = ["system", "light", "dark"];
    const next = order[(order.indexOf(readTheme()) + 1) % order.length];
    applyTheme(next);
    paint();
  });

  paint();
  host.append(button);
  return button;
}

/** Appears only once there is enough page to be worth scrolling back up. */
export function mountBackToTop() {
  const button = el("button", {
    class: "to-top", type: "button", "aria-label": "Back to top", title: "Back to top",
  });
  button.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none"
      stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5"/></svg>`;
  button.addEventListener("click", () => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  });
  document.body.append(button);

  let ticking = false;
  const update = () => {
    ticking = false;
    const worth = document.documentElement.scrollHeight > innerHeight * 2;
    button.classList.toggle("is-visible", worth && scrollY > innerHeight * 0.75);
  };
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });
  update();
  return { update };
}

/**
 * Offline support.
 *
 * Registered only in production-like contexts. The worker itself is
 * version-stamped and deletes every older cache on activate — an installed copy
 * serving an old shell forever is the classic way this feature goes wrong.
 */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("offline support unavailable:", err?.message || err);
    });
  });
}
