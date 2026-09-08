/**
 * Site-wide search over the syllabus, command terms and key concepts.
 *
 * The whole corpus is a few hundred short records already loaded for the app,
 * so this runs locally: no request, no spend, and it works offline. Ranking is
 * deliberately simple — an exact code or title match beats a body match.
 */
import { el, esc } from "./dom.js";
import { data, state } from "./store.js";

let index = null;

async function build() {
  if (index) return index;
  const [syllabus, terms, concepts] = await Promise.all([
    data.syllabus(), data.commandTerms(), data.keyConcepts(),
  ]);

  const records = [];
  for (const t of syllabus.topics) {
    records.push({
      kind: "Topic",
      title: `${t.code} ${t.title}`,
      sub: `Unit ${t.unit}${t.hlOnly ? " · HL only" : ""}`,
      href: `#/lessons/${t.code}`,
      hlOnly: t.hlOnly,
      key: `${t.code} ${t.title}`,
      body: [...t.essentials, ...t.diagrams, t.trap].join(" "),
    });
  }
  for (const t of terms.terms) {
    records.push({
      kind: "Command term",
      title: t.term,
      sub: `${t.ao} — ${t.means.slice(0, 70)}`,
      href: "#/reference",
      key: t.term,
      body: `${t.means} ${t.trap}`,
    });
  }
  for (const c of concepts.concepts) {
    records.push({
      kind: "Key concept",
      title: c.name,
      sub: c.short,
      href: "#/reference/concepts",
      key: c.name,
      body: `${c.long} ${c.iaLens}`,
    });
  }
  index = records;
  return index;
}

export async function search(query) {
  const records = await build();
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const level = state.user?.level || "HL";

  const hits = [];
  for (const r of records) {
    // Do not offer an SL student topics they do not study.
    if (r.hlOnly && level === "SL") continue;
    const key = r.key.toLowerCase();
    let score = 0;
    if (key === q) score = 100;
    else if (key.startsWith(q)) score = 80;
    else if (key.includes(q)) score = 60;
    else if (r.body.toLowerCase().includes(q)) score = 20;
    if (score) hits.push({ ...r, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 12);
}

/** The overlay. Opens on click or Cmd/Ctrl+K, closes on Escape. */
export function mountSearch(host, navigate) {
  const button = el("button", { class: "search-btn", type: "button", "aria-label": "Search lessons and terms" });
  // The magnifier stays at every width; the word and the shortcut are what get
  // dropped on a narrow screen, so the control is never a blank box.
  button.innerHTML = `<svg class="search-icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/>
      <path d="M9.2 9.2 L12.5 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    </svg><span class="search-label">Search</span><kbd>${navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}K</kbd>`;
  button.addEventListener("click", open);
  host.append(button);

  addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      open();
    }
  });

  let overlay = null;
  let selected = 0;
  let hits = [];

  function open() {
    if (overlay) return;
    overlay = el("div", { class: "search-overlay", role: "dialog", "aria-modal": "true", "aria-label": "Search" });
    overlay.innerHTML = `
      <div class="search-panel">
        <input type="text" id="search-input" placeholder="Search topics, command terms, key concepts…"
               autocomplete="off" spellcheck="false" aria-label="Search">
        <div class="search-results" id="search-results" role="listbox"></div>
        <div class="search-foot">Enter to open · Esc to close</div>
      </div>`;
    document.body.append(overlay);
    document.body.style.overflow = "hidden";

    const input = overlay.querySelector("#search-input");
    input.focus();
    input.addEventListener("input", () => run(input.value));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.addEventListener("keydown", onKey);
    run("");
  }

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.body.style.overflow = "";
  }

  async function run(query) {
    hits = await search(query);
    selected = 0;
    paint(query);
  }

  function paint(query) {
    if (!overlay) return;
    const box = overlay.querySelector("#search-results");
    if (!query || query.trim().length < 2) {
      box.innerHTML = `<div class="search-empty">Type at least two characters. Try “elasticity”, “evaluate”, or “2.3”.</div>`;
      return;
    }
    if (!hits.length) {
      box.innerHTML = `<div class="search-empty">Nothing matches “${esc(query)}”.</div>`;
      return;
    }
    box.innerHTML = hits.map((h, i) => `
      <button class="search-hit" role="option" data-i="${i}" aria-selected="${i === selected}">
        <span class="hit-kind">${esc(h.kind)}</span>
        <div class="hit-title">${esc(h.title)}</div>
        <div class="hit-sub">${esc(h.sub)}</div>
      </button>`).join("");
    for (const b of box.querySelectorAll(".search-hit")) {
      b.addEventListener("click", () => choose(Number(b.dataset.i)));
    }
  }

  function onKey(event) {
    if (event.key === "Escape") { event.preventDefault(); return close(); }
    if (!hits.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); selected = (selected + 1) % hits.length; }
    else if (event.key === "ArrowUp") { event.preventDefault(); selected = (selected - 1 + hits.length) % hits.length; }
    else if (event.key === "Enter") { event.preventDefault(); return choose(selected); }
    else return;
    const box = overlay.querySelector("#search-results");
    box.querySelectorAll(".search-hit").forEach((b, i) => b.setAttribute("aria-selected", String(i === selected)));
    box.querySelector(`[data-i="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function choose(i) {
    const hit = hits[i];
    if (!hit) return;
    close();
    navigate(hit.href);
  }

  return { open, close };
}
