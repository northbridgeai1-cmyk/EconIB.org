import { mount, esc, toast, emptyState } from "../lib/dom.js";
import { data, state, loadProgress, setProgress, topicsFor } from "../lib/store.js";
import { celebrate } from "../lib/reward.js";
import { renderDiagram } from "../lib/diagram-catalogue.js";

/**
 * The syllabus, laid out like a textbook rather than a settings screen: the
 * unit tree stays on the left so a student always knows where they are, and
 * the reading pane changes. Each unit keeps one colour everywhere it appears,
 * so the tree can be navigated by colour before a word is read.
 */

const STATES = [
  { value: 0, label: "—", title: "Not rated" },
  { value: 1, label: "Shaky", title: "Needs work" },
  { value: 2, label: "Solid", title: "Confident" },
];

const TABS = [
  { id: "learn", label: "What to know" },
  { id: "terms", label: "Key terms" },
  { id: "exam", label: "Diagrams & traps" },
];

export default async function lessons({ view, parts }) {
  const [syl, progress] = await Promise.all([data.syllabus(), loadProgress()]);
  const mine = topicsFor(syl, state.user.level);
  const topic = parts[0] ? syl.topics.find((t) => t.code === parts[0]) : null;

  if (parts[0] && !topic) {
    return mount(view, emptyState({
      title: "No such topic",
      body: `There is no topic ${parts[0]} on your course.`,
      action: { href: "#/lessons", label: "Back to lessons" },
    }));
  }
  // An SL student following a link to an HL-only topic should be told, not
  // shown a page that is not on their course.
  if (topic && topic.hlOnly && state.user.level !== "HL") {
    return mount(view, emptyState({
      title: "That topic is HL only",
      body: `${topic.code} ${topic.title} is not on the SL course. If you take HL, change your level in your account.`,
      action: { href: "#/lessons", label: "Back to lessons" },
    }));
  }

  const tab = TABS.some((t) => t.id === parts[1]) ? parts[1] : "learn";

  mount(view, `
    <div class="study">
      ${renderTree(syl, mine, progress, topic)}
      <div>${topic ? renderTopic(topic, progress, tab) : renderOverview(syl, mine, progress)}</div>
    </div>`);

  // Widths are set here rather than inline in the markup, so the stylesheet
  // stays the only place that knows how a bar looks.
  for (const bar of view.querySelectorAll(".unit-progress span[data-width]")) {
    bar.style.width = `${bar.dataset.width}%`;
  }

  view.addEventListener("click", (event) => {
    const stateBtn = event.target.closest(".state-btn");
    if (stateBtn) return onStateClick(stateBtn, view, syl, mine, progress, topic);
    const tabBtn = event.target.closest(".tabs button");
    if (tabBtn && topic) location.hash = `#/lessons/${topic.code}/${tabBtn.dataset.tab}`;
  });
}

// ---------------------------------------------------------------------- tree

function renderTree(syl, mine, progress, current) {
  // Units collapse so the tree stays navigable: 31 topics open at once is a
  // wall. The unit containing whatever you are reading opens itself.
  return `<nav class="tree" aria-label="Lessons">
    ${syl.units.map((u) => {
      const topics = mine.filter((t) => t.unit === u.unit);
      if (!topics.length) return "";
      const solid = topics.filter((t) => progress[t.code] === 2).length;
      const pct = topics.length ? Math.round((solid / topics.length) * 100) : 0;
      const open = current ? current.unit === u.unit : u.unit === 2;
      return `<details class="tree-unit" ${open ? "open" : ""}
                style="--unit-colour: var(--u${u.unit}); --unit-wash: var(--u${u.unit}-wash)">
        <summary class="tree-unit-head">
          <span class="tree-dot"></span>
          <span class="tree-unit-name">Unit ${esc(u.unit)}</span>
          <span class="tree-unit-count">${esc(solid)}/${esc(topics.length)}</span>
        </summary>
        <div class="unit-progress" role="img" aria-label="${esc(solid)} of ${esc(topics.length)} topics confident">
          <span data-width="${pct}"></span>
        </div>
        ${topics.map((t) => `
          <a href="#/lessons/${esc(t.code)}" ${current?.code === t.code ? 'aria-current="page"' : ""}>
            <span class="tree-code">${esc(t.code)}</span>
            <span>${esc(t.title)}</span>
            <span class="tree-state" data-state="${esc(progress[t.code] || 0)}"
                  title="${esc(STATES[progress[t.code] || 0].title)}"></span>
          </a>`).join("")}
      </details>`;
    }).join("")}
  </nav>`;
}

// ------------------------------------------------------------------ overview

function renderOverview(syl, mine, progress) {
  const solid = mine.filter((t) => progress[t.code] === 2).length;
  const shaky = mine.filter((t) => progress[t.code] === 1).length;
  const terms = mine.reduce((n, t) => n + (t.terms?.length || 0), 0);

  return `
    <div class="view-head">
      <h1>Lessons</h1>
      <p class="lede">
        ${esc(mine.length)} topics and ${esc(terms)} key terms for ${esc(state.user.level)}${
          state.user.level === "SL" ? " — the three HL-only topics are hidden" : ""}.
        Pick a topic from the tree, or start with whatever you have marked shaky.
      </p>
    </div>

    ${shaky ? `<div class="note note-warn">
      <b>Your revision list</b>
      <p>${esc(shaky)} topic${shaky === 1 ? "" : "s"} marked shaky:
      ${mine.filter((t) => progress[t.code] === 1).map((t) =>
        `<a href="#/lessons/${esc(t.code)}">${esc(t.code)}</a>`).join(", ")}.</p>
    </div>` : ""}

    <div class="stack mt-4">
      ${syl.units.map((u) => {
        const topics = mine.filter((t) => t.unit === u.unit);
        if (!topics.length) return "";
        const done = topics.filter((t) => progress[t.code] === 2).length;
        const pct = topics.length ? Math.round((done / topics.length) * 100) : 0;
        return `<section class="card" style="--unit-colour: var(--u${u.unit}); --unit-wash: var(--u${u.unit}-wash)">
          <div class="unit-banner">
            <p class="eyebrow">Unit ${esc(u.unit)} · ${esc(topics.length)} topics · ${esc(state.user.level === "HL" ? u.hours.hl : u.hours.sl)} hours</p>
            <h2>${esc(u.title)}</h2>
          </div>
          <p class="lede">${esc(u.blurb || "")}</p>
          <div class="unit-progress"><span data-width="${pct}"></span></div>
          <p class="small">${esc(done)} of ${esc(topics.length)} marked solid</p>

          <details class="mt-4">
            <summary>What this unit covers, and why it matters</summary>
            <ul class="prose">${(u.covers || []).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
            ${u.why ? `<p class="gap"><b>Where the marks are</b>${esc(u.why)}</p>` : ""}
          </details>

          <p class="small mt-4">${topics.map((t) =>
            `<a href="#/lessons/${esc(t.code)}">${esc(t.code)}</a>`).join(" · ")}</p>
        </section>`;
      }).join("")}
    </div>

    <p class="small mt-4">
      Study content written by EconIB. Always check the official subject guide and
      your teacher's material.
    </p>`;
}

// --------------------------------------------------------------------- topic

function renderTopic(topic, progress, tab) {
  const current = progress[topic.code] || 0;
  const unitVars = `--unit-colour: var(--u${topic.unit}); --unit-wash: var(--u${topic.unit}-wash)`;

  return `<div style="${unitVars}">
    <div class="unit-banner">
      <p class="eyebrow"><a href="#/lessons">Lessons</a> · Unit ${esc(topic.unit)}</p>
      <h1>${esc(topic.code)} ${esc(topic.title)}</h1>
    </div>

    <div class="row-between mb-4">
      <div class="row">
        <span class="small">How confident are you?</span>
        <span class="state-btns" data-topic="${esc(topic.code)}">
          ${STATES.map((s) => `<button class="state-btn" data-state="${s.value}"
              aria-pressed="${s.value === current}" title="${esc(s.title)}"
              aria-label="${esc(topic.code)}: ${esc(s.title)}">${esc(s.label)}</button>`).join("")}
        </span>
      </div>
      ${topic.hlOnly ? '<span class="chip chip-accent">HL only</span>' : ""}
    </div>

    <div class="tabs" role="tablist">
      ${TABS.map((t) => `<button role="tab" data-tab="${t.id}"
          aria-selected="${t.id === tab}">${esc(t.label)}${
            t.id === "terms" ? ` <span class="tree-unit-count">${esc(topic.terms?.length || 0)}</span>` : ""}</button>`).join("")}
    </div>

    ${tab === "learn" ? learnPanel(topic) : tab === "terms" ? termsPanel(topic) : examPanel(topic)}
  </div>`;
}

function learnPanel(topic) {
  const showHl = topic.hl?.length && state.user.level === "HL";
  return `
    <section class="prose">
      <h2>What you need to know</h2>
      <ul>${topic.essentials.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
      ${showHl ? `<h2 class="mt-4">HL extension</h2>
        <ul>${topic.hl.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
    </section>`;
}

function termsPanel(topic) {
  if (!topic.terms?.length) {
    return `<div class="empty"><h3>No key terms yet for this topic</h3>
      <p>Terms are being written for every topic.</p></div>`;
  }
  return `
    <section>
      <p class="lede">
        Criterion B of the IA is terminology, and every Paper 1 part (a) opens by
        defining. These are the definitions worth knowing word for word.
      </p>
      <dl class="mt-4">
        ${topic.terms.map((t) => `<div class="define">
          <span class="define-label">Definition</span>
          <dt>${esc(t.term)}</dt>
          <dd>${esc(t.definition)}</dd>
        </div>`).join("")}
      </dl>
    </section>`;
}

function examPanel(topic) {
  const drawn = (topic.diagramIds || []).map(renderDiagram).filter(Boolean);
  // Labels with no drawing yet, so the page never implies a diagram exists
  // when it does not.
  const undrawn = topic.diagrams.filter(
    (d) => !drawn.some((x) => x.title.toLowerCase().startsWith(d.toLowerCase().slice(0, 12)))
  );

  return `
    <section>
      ${drawn.length ? `
        <h2>Diagrams you must be able to draw</h2>
        <p class="lede">
          Redraw each of these by hand until you can do it from memory. In the exam
          the diagram is worth marks on its own, and the explanation beside it is
          worth more.
        </p>
        ${drawn.map((d) => `
          <div class="dg-card">
            <div class="dg-figure">${d.svg}</div>
            <h3>${esc(d.title)}</h3>
            <p class="dg-what">${esc(d.what)}</p>
            <p class="dg-technique"><b>Exam technique</b>${esc(d.technique)}</p>
          </div>`).join("")}` : ""}

      ${undrawn.length ? `
        <section class="${drawn.length ? "mt-4" : ""}">
          <h2>${drawn.length ? "Also required" : "Diagrams you must be able to draw"}</h2>
          <p class="small">Not yet drawn in EconIB — use your textbook or your teacher's notes for these.</p>
          <ul class="prose">${undrawn.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
        </section>` : ""}

      ${!drawn.length && !undrawn.length ? `
        <div class="empty"><h3>No diagram is required for this topic</h3>
          <p>Not every topic is examined with a diagram. This one is not.</p></div>` : ""}

      <div class="note note-warn mt-4">
        <b>Where marks go missing</b>
        <p>${esc(topic.trap)}</p>
      </div>
    </section>`;
}

// -------------------------------------------------------------------- rating

async function onStateClick(button, view, syl, mine, progress, topic) {
  const holder = button.closest("[data-topic]") || button.closest(".topic");
  const code = holder?.dataset.topic;
  if (!code) return;
  const next = Number(button.dataset.state);

  const buttons = [...holder.querySelectorAll(".state-btn")];
  const previous = buttons.map((b) => b.getAttribute("aria-pressed"));
  for (const b of buttons) b.setAttribute("aria-pressed", String(Number(b.dataset.state) === next));

  // Update the tree dot and the unit bar straight away, so rating feels
  // immediate rather than waiting on the round trip.
  const dot = view.querySelector(`.tree a[href="#/lessons/${CSS.escape(code)}"] .tree-state`);
  if (dot) dot.dataset.state = String(next);
  progress[code] = next;
  repaintUnitBars(view, syl, mine, progress);

  try {
    const res = await setProgress(code, next);
    celebrate(res?.reward);
  } catch {
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", previous[i]));
    toast("Could not save that. Check your connection.", "error");
  }
}

function repaintUnitBars(view, syl, mine, progress) {
  syl.units.forEach((u, i) => {
    const topics = mine.filter((t) => t.unit === u.unit);
    if (!topics.length) return;
    const solid = topics.filter((t) => progress[t.code] === 2).length;
    const unit = view.querySelectorAll(".tree-unit")[i];
    if (!unit) return;
    const bar = unit.querySelector(".unit-progress span");
    const count = unit.querySelector(".tree-unit-count");
    if (bar) bar.style.width = `${Math.round((solid / topics.length) * 100)}%`;
    if (count) count.textContent = `${solid}/${topics.length}`;
  });
}
