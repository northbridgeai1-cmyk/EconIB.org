import { mount, esc, toast, emptyState, fmtDate } from "../lib/dom.js";
import { api, ApiError } from "../lib/api.js";
import { data, state } from "../lib/store.js";
import {
  wordCountStatus, checkRecency, IA_WORD_LIMIT, WORD_COUNT_EXCLUSIONS,
} from "../lib/ia-rules.js";
import {
  meter, provisionalNote, criterionBlock, wordCounter, requirementRow, paintBars, UNIT_NAMES,
} from "./_ui.js";

export default async function ia({ view, parts, navigate }) {
  if (parts[0]) return editor(view, Number(parts[0]), navigate);
  return portfolio(view);
}

// ----------------------------------------------------------------- portfolio

async function portfolio(view) {
  const [payload, concepts] = await Promise.all([api.listCommentaries(), data.keyConcepts()]);
  const { commentaries, criterionF, total, keyConcepts } = payload;
  const bySlot = new Map(commentaries.map((c) => [c.slot, c]));
  const weight = state.user.level === "HL" ? 20 : 30;

  mount(view, `
    <div class="view-head">
      <h1>IA portfolio</h1>
      <p class="lede">
        Three commentaries of up to ${IA_WORD_LIMIT} words. Each is marked out of 14 on criteria A to E;
        criterion F adds 3 across the portfolio, for 45 in total — ${weight}% of your ${esc(state.user.level)} grade.
      </p>
    </div>

    <section class="card">
      ${meter(total.total, 45, { label: "Portfolio total" })}
      ${provisionalNote(total)}
    </section>

    ${keyConcepts.ok ? "" : `<div class="note note-bad"><b>Key concept reused</b><p>${esc(keyConcepts.message)}</p></div>`}

    <div class="grid-3 mt-4">
      ${[1, 2, 3].map((slot) => slotCard(bySlot.get(slot), slot, concepts)).join("")}
    </div>

    <section class="card mt-4">
      <h2>Criterion F — the three free marks</h2>
      <p class="small">
        Decided by dates and metadata, not judgment, so EconIB computes it rather than guessing.
        ${criterionF.note ? esc(criterionF.note) : ""}
      </p>
      <div class="mt-4">${criterionF.requirements.map(requirementRow).join("")}</div>
      ${criterionF.awarded !== null
        ? `<p class="mt-4"><strong>Criterion F: ${esc(criterionF.awarded)} / 3</strong></p>`
        : ""}
    </section>

    <details class="mt-4">
      <summary>What the word count here does and does not include</summary>
      <p class="small">
        EconIB counts every word you paste. The IB excludes the following, which a plain
        text box cannot detect — so if your commentary contains them, your official count
        is lower than the number shown.
      </p>
      <ul class="small">${WORD_COUNT_EXCLUSIONS.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    </details>
  `);
  paintBars(view);
}

function slotCard(commentary, slot, concepts) {
  if (!commentary) {
    return `<section class="card">
        <p class="eyebrow">Commentary ${slot}</p>
        <div class="empty">
          <h3>Not started</h3>
          <p>Nothing saved in this slot yet.</p>
          <a class="btn btn-primary" href="#/ia/${slot}">Start it</a>
        </div>
      </section>`;
  }
  const words = wordCountStatus(commentary.body);
  const concept = concepts.concepts.find((c) => c.id === commentary.keyConcept);
  const marked = commentary.feedback;
  return `<section class="card">
      <p class="eyebrow">Commentary ${slot}</p>
      <h3>${esc(commentary.title || "Untitled")}</h3>
      <p class="small">
        ${esc(UNIT_NAMES[commentary.unit] || "Unit not set")} ·
        ${esc(concept ? concept.name : "No key concept")}
      </p>
      <p class="counter ${words.state === "over" ? "is-over" : words.state === "near" ? "is-near" : "is-ok"}">
        <span class="counter-n">${esc(words.words)}</span><span>/ ${IA_WORD_LIMIT}</span>
      </p>
      ${marked
        ? `<p><strong class="mono">${esc(marked.subtotal)} / 14</strong> <span class="small">marked ${esc(fmtDate(commentary.markedAt))}</span></p>`
        : `<p class="small">Not yet marked.</p>`}
      <a class="btn" href="#/ia/${slot}">${marked ? "Open" : "Continue"}</a>
    </section>`;
}

// -------------------------------------------------------------------- editor

async function editor(view, slot, navigate) {
  if (!Number.isInteger(slot) || slot < 1 || slot > 3) {
    return mount(view, emptyState({
      title: "No such commentary",
      body: "The portfolio has three commentaries, numbered 1 to 3.",
      action: { href: "#/ia", label: "Back to the portfolio" },
    }));
  }

  const [payload, concepts] = await Promise.all([api.listCommentaries(), data.keyConcepts()]);
  let commentary = payload.commentaries.find((c) => c.slot === slot) || null;
  const others = payload.commentaries.filter((c) => c.slot !== slot);
  const usedConcepts = new Set(others.map((c) => c.keyConcept).filter(Boolean));
  const usedUnits = new Set(others.map((c) => c.unit).filter(Boolean));

  paint();

  function paint() {
    const c = commentary || { slot, title: "", source: "", articleUrl: "", publishedAt: "", writtenAt: "", unit: "", keyConcept: "", body: "", feedback: null, markedAt: null };
    const words = wordCountStatus(c.body);
    const recency = checkRecency(c.publishedAt, c.writtenAt);

    mount(view, `
      <div class="view-head">
        <p class="eyebrow"><a href="#/ia">IA portfolio</a> · Commentary ${esc(slot)}</p>
        <h1>${esc(c.title || `Commentary ${slot}`)}</h1>
      </div>

      <div class="split">
        <aside class="sidebar">
          <div class="sidebar-group">
            <h3>Word count</h3>
            <p>${wordCounter(words)}</p>
          </div>
          <div class="sidebar-group">
            <h3>Article currency</h3>
            <p class="small">${recency.ok === true ? '<span class="chip chip-good">Current</span>'
              : recency.ok === false ? '<span class="chip chip-bad">Fails criterion F</span>'
              : '<span class="chip">Unknown</span>'}</p>
            <p class="small">${esc(recency.reason)}</p>
          </div>
          ${usedConcepts.size ? `<div class="sidebar-group">
            <h3>Already used</h3>
            <p class="small">Key concepts: ${[...usedConcepts].map((id) =>
              esc(concepts.concepts.find((k) => k.id === id)?.name || id)).join(", ")}</p>
            ${usedUnits.size ? `<p class="small">Units: ${[...usedUnits].map((u) => esc(UNIT_NAMES[u])).join(", ")}</p>` : ""}
          </div>` : ""}
        </aside>

        <div>
          <form id="ia-form" class="card">
            <div class="grid-2">
              <div class="field">
                <label for="title">Article title</label>
                <input id="title" name="title" type="text" value="${esc(c.title)}">
              </div>
              <div class="field">
                <label for="source">Source</label>
                <input id="source" name="source" type="text" placeholder="ft.com" value="${esc(c.source)}">
                <p class="field-hint">Must differ from your other two commentaries.</p>
              </div>
            </div>

            <div class="field">
              <label for="articleUrl">Article link <span class="small">(optional)</span></label>
              <input id="articleUrl" name="articleUrl" type="url" value="${esc(c.articleUrl)}">
            </div>

            <div class="grid-2">
              <div class="field">
                <label for="publishedAt">Article published</label>
                <input id="publishedAt" name="publishedAt" type="date" value="${esc(c.publishedAt || "")}">
              </div>
              <div class="field">
                <label for="writtenAt">Commentary written</label>
                <input id="writtenAt" name="writtenAt" type="date" value="${esc(c.writtenAt || "")}">
              </div>
            </div>

            <div class="grid-2">
              <div class="field">
                <label for="unit">Syllabus unit</label>
                <select id="unit" name="unit">
                  <option value="">Choose a unit</option>
                  ${[2, 3, 4].map((u) => `<option value="${u}"${String(c.unit) === String(u) ? " selected" : ""}>
                      ${esc(UNIT_NAMES[u])}${usedUnits.has(u) ? " — already used" : ""}
                    </option>`).join("")}
                </select>
              </div>
              <div class="field">
                <label for="keyConcept">Key concept</label>
                <select id="keyConcept" name="keyConcept">
                  <option value="">Choose a concept</option>
                  ${concepts.concepts.map((k) => `<option value="${esc(k.id)}"${c.keyConcept === k.id ? " selected" : ""}>
                      ${esc(k.name)}${usedConcepts.has(k.id) ? " — already used, scores 0" : ""}
                    </option>`).join("")}
                </select>
              </div>
            </div>

            <div class="field">
              <label for="body">Commentary</label>
              <textarea id="body" name="body" rows="18" placeholder="Paste your commentary here.">${esc(c.body)}</textarea>
              <p class="field-hint" id="live-count">${esc(words.words)} words</p>
            </div>

            <div class="row">
              <button class="btn btn-primary" type="submit" id="save">Save</button>
              <button class="btn" type="button" id="mark" ${commentary ? "" : "disabled"}>Mark against criteria A–E</button>
              ${commentary ? `<button class="btn btn-danger btn-sm" type="button" id="delete">Delete</button>` : ""}
            </div>
            <p class="field-hint">
              Marking uses one of your ${esc(state.usage?.limit ?? 0)} daily markings.
              EconIB never writes any part of your commentary.
            </p>
          </form>

          <div id="result">${c.feedback ? renderResult(c.feedback, c.markedAt) : ""}</div>
        </div>
      </div>
    `);

    view.querySelector("#body").addEventListener("input", (e) => {
      const s = wordCountStatus(e.target.value);
      const el = view.querySelector("#live-count");
      el.textContent = `${s.words} words — ${s.message}`;
      el.className = s.state === "over" ? "field-error" : "field-hint";
    });
    view.querySelector("#ia-form").addEventListener("submit", onSave);
    view.querySelector("#mark").addEventListener("click", onMark);
    const del = view.querySelector("#delete");
    if (del) del.addEventListener("click", onDelete);
    paintBars(view);
  }

  function values() {
    const form = view.querySelector("#ia-form");
    const v = Object.fromEntries(new FormData(form).entries());
    return {
      slot,
      title: v.title, source: v.source, articleUrl: v.articleUrl,
      publishedAt: v.publishedAt || null, writtenAt: v.writtenAt || null,
      unit: v.unit ? Number(v.unit) : null,
      keyConcept: v.keyConcept || null,
      body: v.body,
    };
  }

  async function onSave(event) {
    event.preventDefault();
    const button = view.querySelector("#save");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const payload = values();
      const res = commentary
        ? await api.updateCommentary(commentary.id, payload)
        : await api.saveCommentary(payload);
      commentary = res.commentary;
      toast("Saved.", "good");
      paint();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not save.", "error");
      button.disabled = false;
      button.textContent = "Save";
    }
  }

  async function onMark() {
    const button = view.querySelector("#mark");
    const result = view.querySelector("#result");
    button.disabled = true;
    button.textContent = "Marking…";
    // A skeleton in the shape of the five criteria that are arriving.
    result.innerHTML = `<section class="card mt-4"><h2>Marking…</h2>
        ${'<div class="criterion"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div></div>'.repeat(5)}
      </section>`;
    try {
      // Save first: marking unsaved text would mark something the student
      // cannot see and cannot get back.
      const saved = commentary
        ? await api.updateCommentary(commentary.id, values())
        : await api.saveCommentary(values());
      commentary = saved.commentary;

      const res = await api.gradeIa({ id: commentary.id });
      commentary.feedback = res.result;
      commentary.markedAt = res.markedAt;
      if (state.usage) state.usage.used = res.budget.used;
      paint();
      view.querySelector("#result").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Marking failed.";
      result.innerHTML = `<div class="note note-bad mt-4"><b>Not marked</b><p>${esc(message)}</p></div>`;
      button.disabled = false;
      button.textContent = "Mark against criteria A–E";
    }
  }

  async function onDelete() {
    if (!confirm(`Delete commentary ${slot}? This cannot be undone.`)) return;
    try {
      await api.deleteCommentary(commentary.id);
      commentary = null;
      toast("Deleted.", "good");
      navigate("#/ia");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not delete.", "error");
    }
  }
}

function renderResult(result, markedAt) {
  const order = ["A", "B", "C", "D", "E"];
  return `
    <section class="card mt-4">
      <div class="row-between">
        <h2>Marked against criteria A–E</h2>
        <span class="small">${esc(fmtDate(markedAt))}</span>
      </div>
      ${meter(result.subtotal, 14, { label: "This commentary" })}

      ${result.diagramPresent ? "" : `<div class="note note-warn">
        <b>No diagram referred to in the text</b>
        <p>EconIB reads text only and cannot see an attached image. If you have attached a
        diagram, criterion A depends on your writing explaining it — name the curve, say why
        it shifted, and state what happened to price and quantity.</p>
      </div>`}

      <div class="mt-4">${order.map((id) => criterionBlock({ id, ...result.detail[id] })).join("")}</div>

      <div class="note mt-4">
        <b>The one change worth making</b>
        <p>${esc(result.biggestGain)}</p>
      </div>
      <p class="small"><strong>Strongest:</strong> ${esc(result.strongest)}</p>
      <p class="small">
        Not an official mark. EconIB is not the IB; your teacher marks your IA and a moderator
        samples it. Use this to find gaps, not to predict a grade.
      </p>
    </section>`;
}
