import { mount, esc } from "../lib/dom.js";
import { api } from "../lib/api.js";
import { data, state, loadProgress, topicsFor } from "../lib/store.js";
import { meter, provisionalNote, paintBars } from "./_ui.js";
import { ring, countUp } from "../lib/reward.js";

/**
 * The dashboard answers one question: what should I do right now?
 *
 * Everything else on it — streak, level, topics mastered — exists to make the
 * answer feel worth acting on. A study tool whose payoff is months away needs
 * to give something back today, or nobody opens it in October.
 */
export default async function dashboard({ view }) {
  const [syllabus, portfolio, progress, statsRes] = await Promise.all([
    data.syllabus(),
    api.listCommentaries(),
    loadProgress(),
    api.getStats().catch(() => ({ stats: null, activity: [] })),
  ]);

  const user = state.user;
  const stats = statsRes.stats;
  const mine = topicsFor(syllabus, user.level);
  const solid = mine.filter((t) => progress[t.code] === 2).length;
  const shaky = mine.filter((t) => progress[t.code] === 1).length;
  const untouched = mine.length - solid - shaky;
  const total = portfolio.total;
  const next = pickNextAction({ portfolio, shaky, untouched, mine, stats });

  mount(view, `
    <div class="view-head">
      <p class="eyebrow">${esc(user.yearGroup)} · ${esc(user.level)}${user.examSession ? ` · ${esc(user.examSession)}` : ""}</p>
      <h1>${esc(user.name.split(" ")[0])}, here is where you stand</h1>
    </div>

    ${stats ? `
    <section class="stat-row">
      <div class="stat ${stats.streak > 0 ? "stat-hot" : ""}">
        <span class="stat-value">
          ${stats.streak > 0 ? '<span class="streak-flame">▲</span> ' : ""}<span data-count="${stats.streak}">0</span>
        </span>
        <span class="stat-label">day streak</span>
        <span class="stat-sub">${stats.activeToday
          ? "Counted for today."
          : stats.streak > 0 ? "Do one thing today to keep it." : "Do anything today to start one."}</span>
      </div>

      <a class="stat stat-link" href="#/path">
        <div class="row">
          ${ring(stats.percent, stats.level)}
          <div>
            <span class="stat-value"><span data-count="${stats.xp}">0</span></span>
            <span class="stat-label">XP · ${esc(stats.name)}</span>
            <span class="stat-sub">${stats.next
              ? `${esc(stats.xpToNext)} XP to ${esc(stats.next.name)}`
              : "Top level reached"}</span>
          </div>
        </div>
      </a>

      <div class="stat">
        <span class="stat-value"><span data-count="${solid}">0</span><span class="meter-max"> / ${esc(mine.length)}</span></span>
        <span class="stat-label">topics solid</span>
        <span class="stat-sub">${shaky ? `${esc(shaky)} still shaky` : untouched ? `${esc(untouched)} not yet rated` : "All rated"}</span>
      </div>
    </section>` : ""}

    <section class="card mt-4">
      <p class="eyebrow">Do this next</p>
      <h2>${esc(next.title)}</h2>
      <p>${esc(next.text)}</p>
      <a class="btn btn-primary" href="${esc(next.href)}">${esc(next.label)}</a>
    </section>

    <div class="grid-2 mt-4">
      <section class="card">
        <h2>IA portfolio</h2>
        ${portfolio.commentaries.length === 0
          ? `<p class="lede">Nothing started yet.</p>
             <p class="small">Three commentaries, 45 marks, worth ${user.level === "HL" ? "20" : "30"}% of your grade.</p>
             <a class="btn btn-primary" href="#/ia">Start commentary 1</a>`
          : `${meter(total.total, 45, { label: "Portfolio so far" })}
             ${provisionalNote(total)}
             <p class="small">${esc(total.markedCount)} of 3 marked${
               total.criterionF !== null ? ` · criterion F: ${esc(total.criterionF)}/3` : " · criterion F not yet scorable"}</p>
             ${total.keyConcepts.ok ? "" : `<div class="note note-bad"><b>Key concept clash</b><p>${esc(total.keyConcepts.message)}</p></div>`}
             <a class="btn" href="#/ia">Open portfolio</a>`}
      </section>

      <section class="card">
        <h2>Recent activity</h2>
        ${statsRes.activity?.length
          ? `<div>${statsRes.activity.slice(0, 6).map((a) => `
              <div class="req">
                <span class="req-mark met">+${esc(a.xp)}</span>
                <span class="req-text"><b>${esc(describe(a.kind))}</b>${esc(a.detail)}</span>
              </div>`).join("")}</div>`
          : `<p class="lede">Nothing yet.</p>
             <p class="small">Rate a topic, or get a commentary marked, and it shows up here.</p>`}
      </section>
    </div>
  `);

  // Numbers count up so a change is visible rather than just present.
  for (const node of view.querySelectorAll("[data-count]")) {
    countUp(node, Number(node.dataset.count));
  }
  paintBars(view);
}

function describe(kind) {
  return {
    rate_topic: "Rated a topic",
    read_lesson: "Worked through a lesson",
    mark_paper: "Exam answer marked",
    mark_ia: "Commentary marked",
    save_commentary: "Saved a commentary",
    practice_set: "Practice set finished",
    streak_milestone: "Streak milestone",
    // A kind with no label used to print its internal key straight into the
    // feed — "streak_milestone" sat on the dashboard until this was noticed.
  }[kind] || String(kind).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/**
 * One recommendation, chosen by what is actually missing. A dashboard that
 * suggests everything suggests nothing.
 */
function pickNextAction({ portfolio, shaky, untouched, mine, stats }) {
  const cs = portfolio.commentaries;

  if (stats && !stats.activeToday && stats.streak > 0) {
    return { title: `Keep your ${stats.streak}-day streak`, href: "#/lessons",
      label: "Open lessons",
      text: "Anything counts — rate a topic, read a lesson, or get something marked." };
  }
  if (cs.length === 0) {
    return { title: "Start your first IA commentary", href: "#/ia", label: "Start commentary 1",
      text: "It is worth more marks per hour than anything else you can do." };
  }
  if (!portfolio.keyConcepts.ok) {
    return { title: "Fix a key concept clash", href: "#/ia", label: "Open portfolio",
      text: portfolio.keyConcepts.message };
  }
  const failing = portfolio.criterionF?.requirements?.find((r) => r.met === false);
  if (failing) {
    return { title: "Criterion F is losing a mark", href: "#/ia", label: "Open portfolio",
      text: `${failing.label}. That is an admin fix worth a whole mark.` };
  }
  const unmarked = cs.find((c) => !c.markedAt && c.body);
  if (unmarked) {
    return { title: `Get commentary ${unmarked.slot} marked`, href: `#/ia/${unmarked.slot}`, label: "Mark it",
      text: "It has text but has never been marked. Find out where it stands." };
  }
  if (cs.length < 3) {
    return { title: `Start commentary ${cs.length + 1}`, href: "#/ia", label: `Start commentary ${cs.length + 1}`,
      text: "Criterion F cannot be scored until all three exist." };
  }
  if (shaky > 0) {
    return { title: `Review ${shaky} shaky topic${shaky === 1 ? "" : "s"}`, href: "#/lessons",
      label: "Open lessons", text: "You marked these yourself. They are your revision list." };
  }
  if (untouched > mine.length / 2) {
    return { title: "Rate your topics", href: "#/lessons", label: "Rate topics",
      text: "Most are unrated, so there is nothing to prioritise from yet. Rating them turns this into a plan." };
  }
  return { title: "Write a timed exam answer", href: "#/papers", label: "Mark an exam answer",
    text: "Portfolio and topics are in good shape. Practise against the real markbands." };
}
