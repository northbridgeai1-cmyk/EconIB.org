import { mount, esc, emptyState } from "../lib/dom.js";
import { api, ApiError } from "../lib/api.js";
import { data, state } from "../lib/store.js";
import { celebrate } from "../lib/reward.js";

/**
 * Practice questions, marked instantly.
 *
 * These are auto-marked, so they cost nothing to run and answer immediately —
 * which is what makes them usable for ten minutes on a bus. The AI marking is
 * for writing; this is for whether you actually know the mechanism.
 *
 * The explanation shows on every question, right or wrong. Being told you were
 * correct teaches nothing about why.
 */
const SET_SIZE = 8;

export default async function practice({ view, parts }) {
  const syllabus = await data.syllabus();
  const unit = [1, 2, 3, 4].includes(Number(parts[0])) ? Number(parts[0]) : null;
  if (!unit) return chooser(view, syllabus);
  return run(view, syllabus, unit);
}

function chooser(view, syllabus) {
  mount(view, `
    <div class="view-head">
      <h1>Practice</h1>
      <p class="lede">
        Short sets of ${SET_SIZE} questions, marked the moment you finish, with an
        explanation for every one. Pick a unit.
      </p>
    </div>
    <div class="stack">
      ${syllabus.units.map((u) => `
        <a class="card practice-card" href="#/practice/${u.unit}"
           style="--unit-colour: var(--u${u.unit}); --unit-wash: var(--u${u.unit}-wash)">
          <div class="unit-banner">
            <p class="eyebrow">Unit ${esc(u.unit)}</p>
            <h2>${esc(u.title)}</h2>
          </div>
          <p class="small">${esc(u.blurb || "")}</p>
        </a>`).join("")}
    </div>`);
}

async function run(view, syllabus, unit) {
  const unitInfo = syllabus.units.find((u) => u.unit === unit);
  mount(view, `<div class="stack">
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-block"></div>
    </div>`);

  let pool;
  try {
    ({ questions: pool } = await api.getPractice(unit));
  } catch (err) {
    return mount(view, emptyState({
      state: "error", title: "Could not load the questions",
      body: err instanceof ApiError ? err.message : "Try again in a moment.",
    }));
  }
  if (!pool.length) {
    return mount(view, emptyState({
      title: "No questions for this unit yet",
      body: "More are being written. Try another unit.",
      action: { href: "#/practice", label: "Back to practice" },
    }));
  }

  // A different selection each time, so a set can be repeated without simply
  // remembering the order.
  const set = [...pool].sort(() => Math.random() - 0.5).slice(0, SET_SIZE);
  const chosen = new Map();
  let index = 0;
  let marked = null;

  paint();

  function paint() {
    if (marked) return paintResults();
    const q = set[index];
    const picked = chosen.get(q.id);
    view.innerHTML = `
      <div style="--unit-colour: var(--u${unit}); --unit-wash: var(--u${unit}-wash)">
        <div class="view-head">
          <p class="eyebrow"><a href="#/practice">Practice</a> · Unit ${esc(unit)} ${esc(unitInfo?.title || "")}</p>
          <h1>Question ${esc(index + 1)} of ${esc(set.length)}</h1>
        </div>
        <div class="unit-progress mb-4"><span data-width="${Math.round((index / set.length) * 100)}"></span></div>

        <section class="card">
          <p class="eyebrow">${esc(q.topic)}</p>
          <h2 class="q-stem">${esc(q.stem)}</h2>
          <div class="options mt-4">
            ${q.options.map((o, i) => `
              <button type="button" class="option" data-choice="${i}"
                      aria-pressed="${picked === i}">
                <span class="option-letter">${"ABCD"[i]}</span>
                <span>${esc(o)}</span>
              </button>`).join("")}
          </div>
        </section>

        <div class="row mt-4">
          <button class="btn" type="button" id="prev" ${index === 0 ? "disabled" : ""}>Back</button>
          ${index < set.length - 1
            ? `<button class="btn btn-primary" type="button" id="next" ${picked === undefined ? "disabled" : ""}>Next</button>`
            : `<button class="btn btn-primary" type="button" id="finish" ${chosen.size < set.length ? "disabled" : ""}>Finish and mark</button>`}
          <span class="small">${esc(chosen.size)} of ${esc(set.length)} answered</span>
        </div>
      </div>`;

    for (const bar of view.querySelectorAll("[data-width]")) bar.style.width = `${bar.dataset.width}%`;

    view.querySelector(".options").addEventListener("click", (e) => {
      const b = e.target.closest(".option");
      if (!b) return;
      chosen.set(q.id, Number(b.dataset.choice));
      paint();
    });
    const prev = view.querySelector("#prev");
    if (prev) prev.addEventListener("click", () => { index = Math.max(0, index - 1); paint(); });
    const next = view.querySelector("#next");
    if (next) next.addEventListener("click", () => { index = Math.min(set.length - 1, index + 1); paint(); });
    const finish = view.querySelector("#finish");
    if (finish) finish.addEventListener("click", submit);
  }

  async function submit() {
    const button = view.querySelector("#finish");
    button.disabled = true;
    button.textContent = "Marking…";
    try {
      marked = await api.submitPractice({
        answers: set.map((q) => ({ id: q.id, chosen: chosen.get(q.id) ?? -1 })),
      });
      celebrate(marked.reward);
      paint();
    } catch (err) {
      button.disabled = false;
      button.textContent = "Finish and mark";
      view.querySelector(".row").insertAdjacentHTML("afterend",
        `<div class="note note-bad"><b>Not marked</b><p>${esc(err instanceof ApiError ? err.message : "Try again.")}</p></div>`);
    }
  }

  function paintResults() {
    const byId = new Map(marked.results.map((r) => [r.id, r]));
    view.innerHTML = `
      <div style="--unit-colour: var(--u${unit}); --unit-wash: var(--u${unit}-wash)">
        <div class="view-head">
          <p class="eyebrow"><a href="#/practice">Practice</a> · Unit ${esc(unit)}</p>
          <h1>${esc(marked.right)} out of ${esc(marked.total)}</h1>
          <p class="lede">${esc(verdict(marked.score))}</p>
        </div>
        <div class="unit-progress mb-4"><span data-width="${esc(marked.score)}"></span></div>

        ${set.map((q, i) => {
          const r = byId.get(q.id);
          if (!r) return "";
          return `<section class="card">
            <div class="criterion-head">
              <span class="criterion-id ${r.correct ? "is-right" : "is-wrong"}">${r.correct ? "✓" : "✗"}</span>
              <span class="criterion-name">${esc(q.stem)}</span>
            </div>
            <div class="options mt-4">
              ${q.options.map((o, oi) => {
                const cls = oi === r.answer ? "option is-answer"
                  : oi === r.chosen ? "option is-chosen-wrong" : "option is-muted";
                return `<div class="${cls}"><span class="option-letter">${"ABCD"[oi]}</span><span>${esc(o)}</span></div>`;
              }).join("")}
            </div>
            <p class="gap mt-4"><b>Why</b>${esc(r.why)}</p>
          </section>`;
        }).join("")}

        <div class="row mt-4">
          <a class="btn btn-primary" href="#/practice/${esc(unit)}" id="again">Another set</a>
          <a class="btn" href="#/practice">Different unit</a>
        </div>
      </div>`;
    for (const bar of view.querySelectorAll("[data-width]")) bar.style.width = `${bar.dataset.width}%`;
    view.querySelector("#again").addEventListener("click", (e) => {
      e.preventDefault();
      run(view, syllabus, unit);
    });
  }
}

function verdict(score) {
  if (score === 100) return "Every one right. Try another unit, or a harder one.";
  if (score >= 75) return "Solid. Read the explanations for the ones you missed — that is where the marks are.";
  if (score >= 50) return "Halfway. The explanations below are the useful part.";
  return "Worth going back to the lessons for this unit before trying again.";
}
