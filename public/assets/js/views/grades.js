import { mount, esc } from "../lib/dom.js";
import { data, state } from "../lib/store.js";
import { paintBars } from "./_ui.js";

/**
 * Weighted percentage calculator.
 *
 * The weighted percentage is arithmetic and is computed exactly. The grade is
 * NOT: IB grade boundaries are set per session and are not published in advance,
 * so EconIB does not invent one. Showing "you are a 6" from a fixed table would
 * be a precise-looking number resting on nothing.
 */
export default async function grades({ view }) {
  const assessment = await data.assessment();
  const level = state.user.level;
  const components = assessment.components.filter((c) => c.levels.includes(level));
  const saved = readSaved();

  paint();

  function paint() {
    mount(view, `
      <div class="view-head">
        <h1>Grade calculator</h1>
        <p class="lede">
          Enter what you scored on each component and this works out your weighted percentage
          exactly. It does not convert that into a grade — see below for why.
        </p>
      </div>

      <div class="split">
        <aside class="sidebar">
          <div class="sidebar-group">
            <h3>${esc(level)} weightings</h3>
            ${components.map((c) => `<p class="small">${esc(c.name)} — ${esc(c.weight[level])}%</p>`).join("")}
          </div>
        </aside>

        <div>
          <form id="grade-form" class="card">
            ${components.map((c) => `
              <div class="field">
                <label for="c-${esc(c.id)}">
                  ${esc(c.name)} — ${esc(c.subtitle)}
                  <span class="small">(${esc(c.weight[level])}% · out of ${esc(c.maxMarks)})</span>
                </label>
                <input id="c-${esc(c.id)}" name="${esc(c.id)}" type="number" inputmode="numeric"
                       min="0" max="${esc(c.maxMarks)}" step="1" placeholder="0"
                       value="${esc(saved[c.id] ?? "")}">
              </div>`).join("")}
            <button class="btn btn-primary" type="submit">Calculate</button>
          </form>

          <div id="grade-result" class="mt-4"></div>

          <div class="note note-warn mt-4">
            <b>Why there is no predicted grade here</b>
            <p>
              IB grade boundaries are set after each session, from that session's papers, and
              are not published in advance. A 7 has landed anywhere from the low 70s to the
              low 80s depending on the session. Converting your percentage with a fixed table
              would give you a confident number built on a guess.
            </p>
            <p>
              Your teacher can tell you the boundaries from recent sessions at your school.
              That is a better basis than anything this page could invent.
            </p>
          </div>
        </div>
      </div>
    `);

    view.querySelector("#grade-form").addEventListener("submit", onSubmit);
    if (Object.keys(saved).length) calculate();
  }

  function onSubmit(event) {
    event.preventDefault();
    calculate();
  }

  function calculate() {
    const form = view.querySelector("#grade-form");
    const values = Object.fromEntries(new FormData(form).entries());
    const rows = [];
    let weighted = 0;
    let weightCovered = 0;

    for (const c of components) {
      const raw = values[c.id];
      if (raw === "" || raw === undefined) { rows.push({ c, entered: false }); continue; }
      const marks = Math.max(0, Math.min(c.maxMarks, Number(raw)));
      const pct = (marks / c.maxMarks) * 100;
      const contribution = (pct * c.weight[level]) / 100;
      weighted += contribution;
      weightCovered += c.weight[level];
      rows.push({ c, entered: true, marks, pct, contribution });
      saved[c.id] = marks;
    }
    writeSaved(saved);

    const complete = weightCovered === 100;
    const target = document.getElementById("grade-result");
    target.innerHTML = `
      <section class="card">
        <h2>Weighted percentage</h2>
        <div class="meter">
          <span class="meter-value">${weighted.toFixed(1)}</span>
          <span class="meter-max">% of ${weightCovered}% entered</span>
        </div>
        <div class="bar"><div class="bar-fill" data-pct="${Math.round(weighted)}"></div></div>

        ${complete ? "" : `<div class="note note-warn mt-4">
          <b>Too early to read</b>
          <p>You have entered ${weightCovered}% of the assessment. Until all components are in,
          this figure is your score on the parts you entered, not your overall standing.</p>
        </div>`}

        <div class="table-scroll mt-4"><table>
          <thead><tr><th>Component</th><th class="num">Marks</th><th class="num">%</th><th class="num">Weight</th><th class="num">Contributes</th></tr></thead>
          <tbody>${rows.map((r) => r.entered ? `<tr>
              <td>${esc(r.c.name)}</td>
              <td class="num">${esc(r.marks)} / ${esc(r.c.maxMarks)}</td>
              <td class="num">${r.pct.toFixed(1)}%</td>
              <td class="num">${esc(r.c.weight[level])}%</td>
              <td class="num">${r.contribution.toFixed(1)}</td>
            </tr>` : `<tr>
              <td>${esc(r.c.name)}</td>
              <td class="num" colspan="4">not entered</td>
            </tr>`).join("")}</tbody>
        </table></div>
        <p class="small">Kept on this device only. Nothing here is sent anywhere.</p>
      </section>`;
    paintBars(view);
  }
}

const KEY = "econib.grades";

function readSaved() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {}; // private windows and blocked site data both throw here
  }
}

function writeSaved(values) {
  try { localStorage.setItem(KEY, JSON.stringify(values)); } catch { /* not worth reporting */ }
}
