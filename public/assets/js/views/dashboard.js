import { mount, esc } from "../lib/dom.js";
import { api } from "../lib/api.js";
import { data, state, loadProgress, topicsFor } from "../lib/store.js";
import { meter, provisionalNote, paintBars } from "./_ui.js";

export default async function dashboard({ view }) {
  const [syllabus, portfolio, progress] = await Promise.all([
    data.syllabus(),
    api.listCommentaries(),
    loadProgress(),
  ]);

  const user = state.user;
  const mine = topicsFor(syllabus, user.level);
  const confident = mine.filter((t) => progress[t.code] === 2).length;
  const shaky = mine.filter((t) => progress[t.code] === 1).length;
  const untouched = mine.length - confident - shaky;
  const total = portfolio.total;

  const nextAction = pickNextAction({ portfolio, shaky, untouched, mine });

  mount(view, `
    <div class="view-head">
      <p class="eyebrow">${esc(user.yearGroup)} · ${esc(user.level)}${user.examSession ? ` · ${esc(user.examSession)}` : ""}</p>
      <h1>${esc(user.name.split(" ")[0])}, here is where you stand</h1>
    </div>

    <div class="grid-2">
      <section class="card">
        <h2>IA portfolio</h2>
        ${portfolio.commentaries.length === 0
          ? `<p class="lede">Nothing started yet.</p>
             <p class="small">Three commentaries, 45 marks, worth ${user.level === "HL" ? "20" : "30"}% of your grade.</p>
             <a class="btn btn-primary" href="#/ia">Start commentary 1</a>`
          : `${meter(total.total, 45, { label: "Portfolio so far" })}
             ${provisionalNote(total)}
             <p class="small">${esc(total.markedCount)} of 3 marked${
               total.criterionF !== null ? ` · criterion F: ${esc(total.criterionF)}/3` : " · criterion F not yet scorable"
             }</p>
             ${total.keyConcepts.ok ? "" : `<div class="note note-bad"><b>Key concept clash</b><p>${esc(total.keyConcepts.message)}</p></div>`}
             <a class="btn" href="#/ia">Open portfolio</a>`}
      </section>

      <section class="card">
        <h2>Syllabus confidence</h2>
        ${confident + shaky === 0
          ? `<p class="lede">You have not rated any topics yet.</p>
             <p class="small">Rating ${esc(mine.length)} topics as shaky or confident takes a few minutes and turns this into a revision order.</p>
             <a class="btn btn-primary" href="#/syllabus">Rate your topics</a>`
          : `${meter(confident, mine.length, { label: "Topics you are confident on" })}
             <p class="small">${esc(shaky)} shaky · ${esc(untouched)} not yet rated · ${esc(mine.length)} total for ${esc(user.level)}</p>
             <a class="btn" href="#/syllabus">Open syllabus</a>`}
      </section>
    </div>

    <section class="card mt-4">
      <h2>Do this next</h2>
      <p>${esc(nextAction.text)}</p>
      <a class="btn btn-primary" href="${esc(nextAction.href)}">${esc(nextAction.label)}</a>
    </section>

    <p class="small mt-4">
      AI marking used today: ${esc(state.usage?.used ?? 0)} of ${esc(state.usage?.limit ?? 0)}.
      Resets at midnight UTC.
    </p>
  `);
  paintBars(view);
}

/**
 * One recommendation, chosen by what is actually missing. A dashboard that
 * suggests everything suggests nothing.
 */
function pickNextAction({ portfolio, shaky, untouched, mine }) {
  const cs = portfolio.commentaries;
  if (cs.length === 0) {
    return { text: "Start your first IA commentary. It is worth more marks per hour than anything else you can do.", href: "#/ia", label: "Start commentary 1" };
  }
  if (!portfolio.keyConcepts.ok) {
    return { text: portfolio.keyConcepts.message, href: "#/ia", label: "Fix the clash" };
  }
  const failing = portfolio.criterionF?.requirements?.find((r) => r.met === false);
  if (failing) {
    return { text: `Criterion F is losing a mark: ${failing.label.toLowerCase()}. That is an admin fix worth one mark.`, href: "#/ia", label: "Open portfolio" };
  }
  const unmarked = cs.find((c) => !c.markedAt && c.body);
  if (unmarked) {
    return { text: `Commentary ${unmarked.slot} has text but has never been marked. Find out where it stands.`, href: `#/ia/${unmarked.slot}`, label: "Mark it" };
  }
  if (cs.length < 3) {
    return { text: `You have ${cs.length} of 3 commentaries. Criterion F cannot be scored until all three exist.`, href: "#/ia", label: `Start commentary ${cs.length + 1}` };
  }
  if (shaky > 0) {
    return { text: `You have ${shaky} topic${shaky === 1 ? "" : "s"} marked shaky. Those are your revision list.`, href: "#/syllabus", label: "Review shaky topics" };
  }
  if (untouched > mine.length / 2) {
    return { text: "Most of your topics are unrated, so there is nothing to prioritise from yet. Rate them and this becomes a plan.", href: "#/syllabus", label: "Rate topics" };
  }
  return { text: "Portfolio and topics are in good shape. Write a timed exam answer and have it marked against the markband.", href: "#/papers", label: "Mark an exam answer" };
}
