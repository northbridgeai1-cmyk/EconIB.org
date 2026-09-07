import { mount, esc, toast, emptyState } from "../lib/dom.js";
import { data, state, loadProgress, setProgress, topicsFor } from "../lib/store.js";

const STATES = [
  { value: 0, label: "—", title: "Not rated" },
  { value: 1, label: "Shaky", title: "Needs work" },
  { value: 2, label: "Solid", title: "Confident" },
];

export default async function syllabus({ view, parts }) {
  const [data_, progress] = await Promise.all([data.syllabus(), loadProgress()]);
  if (parts[0]) return topicDetail(view, data_, parts[0], progress);
  return topicList(view, data_, progress);
}

function sidebar(units, activeUnit) {
  return `<aside class="sidebar">
    <div class="sidebar-group">
      <h3>Units</h3>
      ${units.map((u) => `<a href="#/syllabus" data-unit="${u.unit}"
          aria-current="${String(u.unit) === String(activeUnit)}">${esc(u.unit)}. ${esc(u.title)}</a>`).join("")}
    </div>
  </aside>`;
}

function topicList(view, syl, progress) {
  const level = state.user.level;
  const mine = topicsFor(syl, level);

  const byUnit = syl.units.map((u) => ({
    ...u,
    topics: mine.filter((t) => t.unit === u.unit),
  }));

  mount(view, `
    <div class="view-head">
      <h1>Syllabus</h1>
      <p class="lede">
        ${esc(mine.length)} topics for ${esc(level)}${level === "SL" ? " — the three HL-only topics are hidden" : ""}.
        Rate each one and the list becomes a revision order.
      </p>
    </div>
    ${byUnit.map((u) => `
      <section class="mt-4">
        <h2>Unit ${esc(u.unit)} · ${esc(u.title)}</h2>
        <p class="small">${esc(u.topics.length)} topics · ${esc(level === "HL" ? u.hours.hl : u.hours.sl)} teaching hours</p>
        <div class="card card-tight mt-4">
          ${u.topics.map((t) => topicRow(t, progress[t.code] || 0)).join("")}
        </div>
      </section>`).join("")}
  `);

  view.addEventListener("click", onStateClick, { once: false });
}

function topicRow(topic, current) {
  return `<div class="topic" data-topic="${esc(topic.code)}">
      <span class="topic-code">${esc(topic.code)}</span>
      <span class="topic-title">
        <a href="#/syllabus/${esc(topic.code)}">${esc(topic.title)}</a>
        ${topic.hlOnly ? ' <span class="chip chip-accent">HL only</span>' : ""}
      </span>
      <span class="state-btns">
        ${STATES.map((s) => `<button class="state-btn" data-state="${s.value}" title="${esc(s.title)}"
            aria-pressed="${s.value === current}"
            aria-label="${esc(topic.code)}: ${esc(s.title)}">${esc(s.label)}</button>`).join("")}
      </span>
    </div>`;
}

async function onStateClick(event) {
  const button = event.target.closest(".state-btn");
  if (!button) return;
  const row = button.closest(".topic");
  const code = row.dataset.topic;
  const next = Number(button.dataset.state);

  const buttons = [...row.querySelectorAll(".state-btn")];
  const previous = buttons.map((b) => b.getAttribute("aria-pressed"));
  for (const b of buttons) b.setAttribute("aria-pressed", String(Number(b.dataset.state) === next));

  try {
    await setProgress(code, next);
  } catch (err) {
    // Put the buttons back rather than leaving the screen showing a state the
    // server never accepted.
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", previous[i]));
    toast("Could not save that. Check your connection.", "error");
  }
}

function topicDetail(view, syl, code, progress) {
  const topic = syl.topics.find((t) => t.code === code);
  if (!topic) {
    return mount(view, emptyState({
      title: "No such topic",
      body: `There is no topic ${code} in the syllabus.`,
      action: { href: "#/syllabus", label: "Back to the syllabus" },
    }));
  }
  const unit = syl.units.find((u) => u.unit === topic.unit);
  const current = progress[topic.code] || 0;

  mount(view, `
    <div class="view-head">
      <p class="eyebrow"><a href="#/syllabus">Syllabus</a> · Unit ${esc(topic.unit)} ${esc(unit.title)}</p>
      <h1>${esc(topic.code)} ${esc(topic.title)}</h1>
      ${topic.hlOnly ? '<p><span class="chip chip-accent">HL only</span></p>' : ""}
    </div>

    <div class="split">
      <aside class="sidebar">
        <div class="sidebar-group">
          <h3>Your rating</h3>
          <div class="topic" data-topic="${esc(topic.code)}">
            <span class="state-btns">
              ${STATES.map((s) => `<button class="state-btn" data-state="${s.value}"
                  aria-pressed="${s.value === current}" title="${esc(s.title)}">${esc(s.label)}</button>`).join("")}
            </span>
          </div>
        </div>
        ${topic.diagrams.length ? `
        <div class="sidebar-group">
          <h3>Diagrams to know</h3>
          <ul class="small">${topic.diagrams.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
        </div>` : ""}
      </aside>

      <div>
        <section class="card">
          <h2>What you need to know</h2>
          <ul>${topic.essentials.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
        </section>

        ${topic.hl.length && state.user.level === "HL" ? `
        <section class="card mt-4">
          <h2>HL extension</h2>
          <ul>${topic.hl.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
        </section>` : ""}

        <div class="note note-warn mt-4">
          <b>Where marks go missing</b>
          <p>${esc(topic.trap)}</p>
        </div>

        <p class="small mt-4">
          Study content written by EconIB. Always check the official subject guide
          and your teacher's material.
        </p>
      </div>
    </div>
  `);
  view.addEventListener("click", onStateClick);
}
