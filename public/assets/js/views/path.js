import { mount, esc, toast } from "../lib/dom.js";
import { api, ApiError } from "../lib/api.js";
import { data, state, loadProgress, topicsFor } from "../lib/store.js";
import { celebrate, countUp } from "../lib/reward.js";

/**
 * The path: the whole course as one journey rather than a list of links.
 *
 * Nodes are deliberately NOT locked behind one another. A student whose class
 * is on Unit 4 in October has to be able to go straight there — gating topics
 * behind a sequence would make the site useless to anyone not starting at 1.1
 * on day one. The path shows where you are and what is left; it withholds
 * nothing.
 *
 * The three things a student came here for sit on one screen: the streak and
 * what it is about to pay, the course itself, and what the XP can be spent on.
 */
export default async function path({ view }) {
  const syllabus = await data.syllabus();
  let progress = await loadProgress();
  // The path still works signed out of nothing but rewards — a failed rewards
  // call must not blank the map, which is the actual content.
  let [rewards, shop] = await Promise.all([
    api.getRewards().catch(() => null),
    api.getShop().catch(() => null),
  ]);

  const mine = topicsFor(syllabus, state.user.level);
  render();

  async function refresh() {
    [progress, rewards, shop] = await Promise.all([
      loadProgress(),
      api.getRewards().catch(() => rewards),
      api.getShop().catch(() => shop),
    ]);
    render();
  }

  function render() {
    const done = mine.filter((t) => progress[t.code] === 2).length;
    const next = mine.find((t) => (progress[t.code] || 0) !== 2);

    mount(view, `
      <div class="view-head">
        <h1>Your path</h1>
        <p class="lede">${next
          ? `${esc(done)} of ${esc(mine.length)} topics solid. Next up: ${esc(next.code)} ${esc(next.title)}.`
          : "Every topic marked solid. Now keep them there."}</p>
      </div>

      ${rewards ? streakCard(rewards) : ""}

      <div class="path">
        ${syllabus.units.map((u) => unitSection(u, next)).join("")}
      </div>

      ${shop ? shopCard(shop) : ""}
    `);

    for (const n of view.querySelectorAll("[data-count]")) countUp(n, Number(n.dataset.count));
    wire();
  }

  function unitSection(u, next) {
    const topics = mine.filter((t) => t.unit === u.unit);
    if (!topics.length) return "";
    const done = topics.filter((t) => progress[t.code] === 2).length;

    return `
      <section class="path-unit" style="--unit: var(--u${esc(u.unit)}); --unit-wash: var(--u${esc(u.unit)}-wash)">
        <div class="path-banner">
          <span class="path-unit-name">Unit ${esc(u.unit)} · ${esc(u.title)}</span>
          <span class="path-unit-count mono">${esc(done)}/${esc(topics.length)}</span>
        </div>
        <ol class="path-nodes">
          ${topics.map((t, i) => node(t, i, next)).join("")}
          <li class="path-node is-goal" style="--offset:0px">
            <a href="#/practice/${esc(u.unit)}">
              <span class="node-dot" aria-hidden="true">★</span>
              <span class="node-label">Practise Unit ${esc(u.unit)}</span>
            </a>
          </li>
        </ol>
      </section>`;
  }

  function node(t, i, next) {
    const st = progress[t.code] || 0;
    const isNext = next && t.code === next.code;
    // A gentle wave rather than a sawtooth: a repeating +/- offset would snap
    // back to the left every fourth node and read as a mistake.
    const offset = Math.round(Math.sin((i * Math.PI) / 3) * 46);
    const said = ["not started", "shaky", "solid"][st];
    return `
      <li class="path-node ${esc(["is-todo", "is-shaky", "is-done"][st])}${isNext ? " is-next" : ""}"
          style="--offset:${esc(offset)}px">
        <a href="#/lessons/${esc(t.code)}">
          <span class="node-dot" aria-hidden="true">${st === 2 ? "✓" : esc(t.code)}</span>
          <span class="node-label">${esc(t.title)}</span>
          <span class="sr-only">${esc(t.code)}, ${esc(said)}</span>
        </a>
      </li>`;
  }

  function streakCard(r) {
    return `
      <section class="card streak-card">
        <div class="row-between">
          <div>
            <h2>${r.streak > 0
              ? `${esc(r.streak)} day streak`
              : "No streak yet"}</h2>
            <p class="small">${r.next
              ? `${esc(r.next.daysAway)} more day${r.next.daysAway === 1 ? "" : "s"} to ${esc(r.next.name)} — ${esc(r.next.xp)} XP.`
              : "Every milestone reached."}</p>
          </div>
          ${r.longestStreak > r.streak
            ? `<span class="chip">best ${esc(r.longestStreak)}</span>` : ""}
        </div>

        ${r.available.length ? `<div class="claims">
          ${r.available.map((m) => `
            <div class="claim">
              <span class="claim-days mono">${esc(m.days)}d</span>
              <span class="claim-text"><b>${esc(m.name)}</b> ${esc(m.blurb)}</span>
              <button class="btn btn-primary btn-sm" type="button" data-claim="${esc(m.days)}">
                Claim ${esc(m.xp)} XP
              </button>
            </div>`).join("")}
        </div>` : ""}

        <ol class="pips" aria-label="Streak milestones">
          ${r.milestones.map((m) => `
            <li class="pip${m.claimed ? " is-claimed" : m.reached ? " is-ready" : ""}">
              <span class="pip-dot" aria-hidden="true"></span>
              <span class="pip-days mono">${esc(m.days)}</span>
              <span class="sr-only">${esc(m.name)}, ${esc(m.xp)} XP, ${
                m.claimed ? "claimed" : m.reached ? "ready to claim" : "not reached"}</span>
            </li>`).join("")}
        </ol>
      </section>`;
  }

  function shopCard(s) {
    return `
      <section class="card shop-card" id="shop">
        <div class="row-between">
          <h2>XP market</h2>
          <span class="chip chip-good mono"><span data-count="${esc(s.balance)}">0</span> XP</span>
        </div>
        <p class="small">
          Cosmetic only. Nothing sold here changes what you can learn or how your
          work is marked — being able to buy better feedback would make the
          feedback worthless. Spending never lowers your level, which is worked
          out from XP earned, not XP held.
        </p>
        <div class="shop-grid">
          ${s.items.map((i) => `
            <div class="shop-item${i.owned ? " is-owned" : ""}">
              <span class="shop-name">${esc(i.name)}</span>
              <span class="shop-blurb small">${esc(i.blurb)}</span>
              ${i.owned
                ? `<span class="chip chip-good">Owned</span>`
                : `<button class="btn btn-sm${i.ok ? " btn-primary" : ""}" type="button"
                       data-buy="${esc(i.id)}"${i.ok ? "" : " disabled"}>
                     ${esc(i.cost)} XP
                   </button>
                   ${i.ok ? "" : `<span class="shop-reason small">${esc(i.reason)}</span>`}`}
            </div>`).join("")}
        </div>
      </section>`;
  }

  /**
   * Listeners go on the sections, which mount() replaces on every render, so
   * they cannot accumulate the way a listener on the persistent #view would.
   */
  function wire() {
    view.querySelector(".streak-card")?.addEventListener("click", async (event) => {
      const btn = event.target.closest("[data-claim]");
      if (!btn) return;
      btn.disabled = true;
      try {
        const res = await api.claimMilestone(Number(btn.dataset.claim));
        celebrate(res.reward);
        toast(`${res.milestone.name} — ${res.milestone.xp} XP.`, "good");
        await refresh();
      } catch (err) {
        btn.disabled = false;
        toast(err instanceof ApiError ? err.message : "Could not claim that.", "error");
      }
    });

    view.querySelector(".shop-card")?.addEventListener("click", async (event) => {
      const btn = event.target.closest("[data-buy]");
      if (!btn) return;
      btn.disabled = true;
      try {
        await api.buyItem(btn.dataset.buy);
        toast("Bought. Pick it in Settings.", "good");
        await refresh();
      } catch (err) {
        btn.disabled = false;
        toast(err instanceof ApiError ? err.message : "Could not buy that.", "error");
      }
    });
  }
}
