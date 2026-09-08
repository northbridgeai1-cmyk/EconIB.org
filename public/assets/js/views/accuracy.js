import { mount, esc, toast, fmtDate } from "../lib/dom.js";
import { api, ApiError } from "../lib/api.js";

/**
 * Marking accuracy: what your teacher actually gave, next to what EconIB said.
 *
 * This is the only honest way to answer "is this marking any good?". It is also
 * the easiest place in the product to invent a finding, so the arithmetic in
 * calibration.js refuses to call anything a pattern below three samples, and
 * refuses to call a mean under half a mark a difference at all. This view shows
 * whatever that returns and never dresses it up.
 */
const CRITERIA = [
  { id: "A", name: "Diagrams", max: 3 },
  { id: "B", name: "Terminology", max: 2 },
  { id: "C", name: "Application and analysis", max: 3 },
  { id: "D", name: "Key concept", max: 3 },
  { id: "E", name: "Evaluation", max: 3 },
];

export default async function accuracy({ view }) {
  const data = await api.getFeedback();
  paint(view, data);
}

function paint(view, data) {
  const { records, calibration: cal } = data;

  mount(view, `
    <div class="view-head">
      <h1>Marking accuracy</h1>
      <p class="lede">
        Enter the marks your teacher actually gave. EconIB compares them with its own,
        tells you where it has been wrong, and takes that into account next time it
        marks your work.
      </p>
    </div>

    ${cal.comparable === 0 ? `
      <div class="note">
        <b>Nothing to compare yet</b>
        <p>Add the marks from a piece EconIB has already marked, and this page starts
        telling you where the two disagree. It needs three before it will call
        anything a pattern — two points is not a trend, however far apart they are.</p>
      </div>` : renderCalibration(cal)}

    <section class="card mt-4">
      <h2>Add your teacher's marks</h2>
      <p class="small">
        For an IA commentary, fill in whichever criteria your teacher marked — you do
        not need all five.
      </p>
      <form id="fb-form" class="mt-4">
        <div class="field">
          <label for="targetKind">What was marked</label>
          <select id="targetKind" name="targetKind">
            <option value="ia">An IA commentary</option>
            <option value="paper">An exam answer</option>
          </select>
        </div>

        <div id="ia-fields">
          <div class="grid-3">
            ${CRITERIA.map((c) => `
              <div class="field">
                <label for="m-${c.id}">${esc(c.id)} — ${esc(c.name)}</label>
                <input id="m-${c.id}" name="m-${c.id}" type="number" min="0" max="${c.max}"
                       step="1" placeholder="/ ${c.max}">
              </div>`).join("")}
          </div>
        </div>

        <div id="paper-fields" hidden>
          <div class="grid-2">
            <div class="field">
              <label for="rubricId">Which part</label>
              <select id="rubricId" name="rubricId">
                <option value="p1b">Paper 1 (b) — out of 15</option>
                <option value="p1a">Paper 1 (a) — out of 10</option>
                <option value="p2g">Paper 2 (g) — out of 15</option>
                <option value="p3b">Paper 3 (b) — out of 10</option>
              </select>
            </div>
            <div class="field">
              <label for="paperMark">Mark given</label>
              <input id="paperMark" name="paperMark" type="number" min="0" max="15" step="1">
            </div>
          </div>
        </div>

        <div class="field">
          <label for="comments">What your teacher said <span class="small">(optional)</span></label>
          <textarea id="comments" name="comments" rows="4"
            placeholder="Type their comment in your own words. EconIB will reinforce it rather than contradict it when it marks your next piece."></textarea>
        </div>

        <div class="field">
          <label for="receivedAt">Date received <span class="small">(optional)</span></label>
          <input id="receivedAt" name="receivedAt" type="date">
        </div>

        <button class="btn btn-primary" type="submit" id="fb-save">Save</button>
      </form>
    </section>

    ${records.length ? `
      <section class="card mt-4">
        <h2>What you have recorded</h2>
        <p class="small">This is your data. Remove any of it whenever you like.</p>
        <div class="mt-4">
          ${records.map((r) => renderRecord(r)).join("")}
        </div>
      </section>` : ""}

    <div class="note mt-4">
      <b>Who can see this</b>
      <p>Only you. It is stored against your account, never shared, and deleting your
      account deletes it. EconIB records no teacher's name or school — only the marks
      and whatever you choose to type.</p>
    </div>`);

  wire(view);
}

function renderCalibration(cal) {
  return `
    <section class="card">
      <h2>Where EconIB stands against your teacher</h2>
      <p class="lede">${esc(cal.overall.text)}</p>
      ${cal.headline ? `<div class="note note-warn">
        <b>The clearest difference</b><p>${esc(cal.headline.text)}</p>
      </div>` : ""}
      <div class="mt-4">
        ${Object.values(cal.criteria).map((c) => `
          <div class="req">
            <span class="req-mark ${c.enough ? (Math.abs(c.meanDiff ?? 0) >= 0.5 ? "unmet" : "met") : "unknown"}">
              ${c.meanDiff === null ? "—" : (c.meanDiff > 0 ? "+" : "") + c.meanDiff}
            </span>
            <span class="req-text"><b>${esc(c.name)}</b>${esc(c.text)}</span>
          </div>`).join("")}
      </div>
      <p class="small mt-4">
        A positive number means EconIB gave more than your teacher did. Based on
        ${esc(cal.comparable)} piece${cal.comparable === 1 ? "" : "s"} that both marked.
      </p>
    </section>`;
}

function renderRecord(r) {
  const marks = r.targetKind === "ia"
    ? CRITERIA.filter((c) => r.marks[c.id] !== undefined)
        .map((c) => `${c.id} ${r.marks[c.id]}/${c.max}`).join(" · ")
    : `${r.marks.mark}/${r.maxMarks}`;
  return `<div class="req">
      <span class="req-mark met">${r.targetKind === "ia" ? "IA" : "EX"}</span>
      <span class="req-text">
        <b>${esc(marks)}</b>
        ${r.comments ? esc(r.comments.slice(0, 140)) : "No comment recorded."}
        <span class="small"> · ${esc(fmtDate(r.receivedAt || r.createdAt))}</span>
      </span>
      <button class="btn btn-danger btn-sm" type="button" data-remove="${esc(r.id)}">Remove</button>
    </div>`;
}

function wire(view) {
  const kind = view.querySelector("#targetKind");
  const iaFields = view.querySelector("#ia-fields");
  const paperFields = view.querySelector("#paper-fields");
  kind.addEventListener("change", () => {
    const isPaper = kind.value === "paper";
    iaFields.hidden = isPaper;
    paperFields.hidden = !isPaper;
  });

  view.querySelector("#fb-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const v = Object.fromEntries(new FormData(form).entries());
    const button = view.querySelector("#fb-save");
    button.disabled = true;
    button.textContent = "Saving…";

    const payload = {
      targetKind: v.targetKind,
      comments: v.comments || "",
      receivedAt: v.receivedAt || null,
    };
    if (v.targetKind === "ia") {
      payload.marks = {};
      for (const c of CRITERIA) {
        const raw = v[`m-${c.id}`];
        if (raw !== "" && raw !== undefined) payload.marks[c.id] = Number(raw);
      }
    } else {
      payload.rubricId = v.rubricId;
      payload.marks = { mark: Number(v.paperMark) };
    }

    try {
      const data = await api.addFeedback(payload);
      toast("Saved. EconIB will take this into account.", "good");
      paint(view, data);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not save that.", "error");
      button.disabled = false;
      button.textContent = "Save";
    }
  });

  view.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    if (!confirm("Remove this record? It stops counting toward the comparison.")) return;
    try {
      await api.deleteFeedback(button.dataset.remove);
      paint(view, await api.getFeedback());
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not remove it.", "error");
    }
  });
}
