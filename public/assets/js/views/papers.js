import { mount, esc, fmtDate } from "../lib/dom.js";
import { api, ApiError } from "../lib/api.js";
import { data, state } from "../lib/store.js";
import { meter, ladder, paintBars, markedByNote } from "./_ui.js";

export default async function papers({ view, parts }) {
  const rubrics = await data.rubrics();
  const available = rubrics.papers.filter((p) => p.id !== "p3b" || state.user.level === "HL");
  const chosen = available.find((p) => p.id === parts[0]) || available[0];

  if (parts[0] === "history") return history(view, rubrics);

  paint();

  function paint(result = null, error = null, busy = false) {
    mount(view, `
      <div class="view-head">
        <h1>Exam answers</h1>
        <p class="lede">
          The four parts of the exam marked on markbands rather than a markscheme. Each is
          scored strand by strand, because a markband answer is capped by its weakest strand.
        </p>
      </div>

      <nav class="nav" aria-label="Paper part">
        ${available.map((p) => `<a href="#/papers/${esc(p.id)}"
            aria-current="${p.id === chosen.id ? "page" : "false"}">${esc(p.component)} ${esc(p.part)}</a>`).join("")}
        <a href="#/papers/history">Past attempts</a>
      </nav>

      <div class="split mt-4">
        <aside class="sidebar">
          <div class="sidebar-group">
            <h3>${esc(chosen.name)}</h3>
            <p class="small">Out of ${esc(chosen.max)}. ${esc(chosen.prompt)}</p>
          </div>
          <div class="sidebar-group">
            <h3>Strands assessed</h3>
            <ul class="small">${chosen.dimensions.map((d) => `<li>${esc(d.label)}</li>`).join("")}</ul>
          </div>
          <div class="sidebar-group">
            <h3>Bands</h3>
            <ul class="small">${chosen.bands.map((b, i) => `<li>Level ${i}: ${b[0]}–${b[1]} marks</li>`).join("")}</ul>
          </div>
        </aside>

        <div>
          <form id="paper-form" class="card">
            <div class="field">
              <label for="question">The question</label>
              <textarea id="question" name="question" rows="3"
                placeholder="Paste the exact question. Without it the marker cannot judge whether you answered what was asked — the strand worth the most."></textarea>
            </div>
            <div class="field">
              <label for="answer">Your answer</label>
              <textarea id="answer" name="answer" rows="16" placeholder="Paste or type your answer."></textarea>
              <p class="field-hint" id="answer-count">0 words</p>
            </div>
            <div class="row">
              <button class="btn btn-primary" type="submit" id="mark" ${busy ? "disabled" : ""}>
                ${busy ? "Marking…" : `Mark against the ${esc(chosen.component)} ${esc(chosen.part)} markband`}
              </button>
            </div>
            <p class="field-hint">
              Describe any diagram in words — the marker reads text only and cannot see an image.
              EconIB never writes your answer for you.
            </p>
          </form>

          <div id="result">
            ${error ? `<div class="note note-bad mt-4"><b>Not marked</b><p>${esc(error)}</p></div>` : ""}
            ${busy ? skeletonFor(chosen) : ""}
            ${result ? renderResult(result, chosen) : ""}
          </div>
        </div>
      </div>
    `);

    const answer = view.querySelector("#answer");
    answer.addEventListener("input", () => {
      const n = answer.value.trim() ? answer.value.trim().split(/\s+/).length : 0;
      view.querySelector("#answer-count").textContent = `${n} words`;
    });
    view.querySelector("#paper-form").addEventListener("submit", onSubmit);
    paintBars(view);
  }

  async function onSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const v = Object.fromEntries(new FormData(form).entries());
    const keep = { question: v.question, answer: v.answer };
    paint(null, null, true);
    restore(keep);
    try {
      const res = await api.gradePaper({ rubricId: chosen.id, question: keep.question, answer: keep.answer });
      if (state.usage && res.budget) state.usage.used = res.budget.used;
      paint(res.result, null, false);
      restore(keep);
      view.querySelector("#result").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      paint(null, err instanceof ApiError ? err.message : "Marking failed.", false);
      restore(keep);
    }
  }

  /** Never lose what the student typed, whatever happened to the request. */
  function restore({ question, answer }) {
    const q = view.querySelector("#question");
    const a = view.querySelector("#answer");
    if (q) q.value = question || "";
    if (a) {
      a.value = answer || "";
      const n = a.value.trim() ? a.value.trim().split(/\s+/).length : 0;
      view.querySelector("#answer-count").textContent = `${n} words`;
    }
  }
}

function skeletonFor(rubric) {
  return `<section class="card mt-4"><h2>Marking…</h2>
      ${rubric.dimensions.map((d) => `<div class="criterion">
        <div class="criterion-head"><span class="criterion-name">${esc(d.label)}</span></div>
        <div class="skeleton skeleton-line"></div></div>`).join("")}
    </section>`;
}

function renderResult(result, rubric) {
  return `
    <section class="card mt-4">
      <h2>${esc(result.name)}</h2>
      ${meter(result.mark, result.max, { label: `Band ${result.bandIndex} of ${result.bandCount - 1} · ${result.band[0]}–${result.band[1]} marks` })}
      ${markedByNote(result.markedBy)}

      <div class="note note-warn mt-4">
        <b>What is capping this answer</b>
        <p>${esc(result.capping.join(" and "))} — ${result.capping.length === 1 ? "this strand is" : "these strands are"}
        your weakest, and a markband answer is held down by its weakest strand. Lifting
        ${result.capping.length === 1 ? "it" : "them"} is the only thing that moves the band.</p>
      </div>

      ${result.adjusted ? `<div class="note"><b>Mark adjusted</b>
        <p>The marker proposed ${esc(result.adjusted.from)}, which falls outside the
        ${esc(result.adjusted.band[0])}–${esc(result.adjusted.band[1])} band its own strand levels imply.
        EconIB clamped it to the band rather than showing an inconsistent number.</p></div>` : ""}

      <div class="mt-4">
        ${result.dimensions.map((d) => {
          const dim = rubric.dimensions.find((x) => x.id === d.id);
          return `<div class="criterion">
            <div class="criterion-head">
              <span class="criterion-name">${esc(d.label)}</span>
              <span class="criterion-mark">${esc(d.rung)}<span class="meter-max"> / ${esc(d.maxRung)}</span></span>
            </div>
            <div class="criterion-body">
              ${d.evidence ? `<blockquote class="evidence">${esc(d.evidence)}</blockquote>` : ""}
              ${d.whyNotHigher ? `<p class="gap"><b>What is missing</b>${esc(d.whyNotHigher)}</p>` : ""}
              ${ladder({ rungs: dim.rungs, rung: d.rung })}
            </div>
          </div>`;
        }).join("")}
      </div>

      <div class="note mt-4"><b>The one change worth making</b><p>${esc(result.biggestGain)}</p></div>
      <p class="small">Not an official mark. Real papers are marked by IB examiners against the
      published markscheme alongside the markband.</p>
    </section>`;
}

async function history(view, rubrics) {
  const { attempts } = await api.gradePaperHistory();
  mount(view, `
    <div class="view-head">
      <p class="eyebrow"><a href="#/papers">Exam answers</a></p>
      <h1>Past attempts</h1>
    </div>
    ${attempts.length === 0
      ? `<div class="empty"><h3>Nothing marked yet</h3>
         <p>Answers you have marked will be listed here so you can see whether the strand that caps you keeps being the same one.</p>
         <a class="btn btn-primary" href="#/papers">Mark an answer</a></div>`
      : `<div class="card card-tight"><div class="table-scroll"><table>
          <thead><tr><th>When</th><th>Part</th><th class="num">Mark</th><th>Capped by</th></tr></thead>
          <tbody>${attempts.map((a) => `<tr>
              <td class="num">${esc(fmtDate(a.createdAt))}</td>
              <td>${esc(rubrics.papers.find((p) => p.id === a.rubricId)?.name || a.rubricId)}</td>
              <td class="num">${esc(a.result?.mark ?? "—")} / ${esc(a.result?.max ?? "—")}</td>
              <td>${esc((a.result?.capping || []).join(", "))}</td>
            </tr>`).join("")}</tbody>
        </table></div></div>`}
  `);
}
