/**
 * Feedback for things the student just achieved.
 *
 * A number that changes silently teaches nothing. These exist so that finishing
 * something is visibly worth having done — which is the only reason anyone comes
 * back to a study tool in October for an exam in May.
 *
 * All of it is suppressed under prefers-reduced-motion by the stylesheet, and
 * none of it blocks the interface.
 */
import { el, esc } from "./dom.js";

function host() {
  let h = document.getElementById("reward-host");
  if (!h) {
    h = el("div", { id: "reward-host", "aria-live": "polite" });
    document.body.append(h);
  }
  return h;
}

/** "+40 XP" floating up from the middle of the screen. */
export function showXp(amount) {
  if (!amount) return;
  const node = el("div", { class: "reward-pop", text: `+${amount} XP` });
  host().append(node);
  setTimeout(() => node.remove(), 1500);
}

/** A level-up is rare enough to deserve stopping for. */
export function showLevelUp(level) {
  const box = el("div", { class: "level-up", role: "status" });
  box.innerHTML = `
    <span class="lv">${esc(level.level)}</span>
    <h3>Level ${esc(level.level)} — ${esc(level.name)}</h3>
    <p class="small">${level.next
      ? `${esc(level.next.at - level.xpIntoLevel - level.at)} XP to ${esc(level.next.name)}.`
      : "You have reached the top level."}</p>`;
  const h = host();
  h.append(box);
  const close = () => box.remove();
  box.addEventListener("click", close);
  setTimeout(close, 3600);
}

/**
 * Count a number up to its value. Purely cosmetic, so it degrades to setting
 * the final number if motion is not wanted.
 */
export function countUp(node, to, { duration = 700 } = {}) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || to <= 0) { node.textContent = String(to); return; }
  const start = performance.now();
  const from = Number(node.textContent.replace(/\D/g, "")) || 0;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    // Ease out, so it decelerates into the final value rather than stopping dead.
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Handle whatever the server said the student just earned. */
export function celebrate(reward) {
  if (!reward) return;
  if (reward.gained) showXp(reward.gained);
  if (reward.levelledUp) setTimeout(() => showLevelUp(reward.levelledUp), 500);
}

/** A progress ring, drawn as a real fraction of a circle. */
export function ring(percent, label) {
  const C = 176; // 2πr for r=28
  const offset = C - (Math.max(0, Math.min(100, percent)) / 100) * C;
  return `<div class="ring-wrap">
      <svg class="ring" width="68" height="68" viewBox="0 0 68 68" aria-hidden="true">
        <circle class="ring-track" cx="34" cy="34" r="28"></circle>
        <circle class="ring-fill" cx="34" cy="34" r="28" stroke-dashoffset="${offset}"></circle>
      </svg>
      <span class="ring-text">${esc(label)}</span>
    </div>`;
}
