/** Shared rendering pieces for the marking views. */
import { esc } from "../lib/dom.js";

/** A mark drawn as a position on its scale. The number is readable alone. */
export function meter(value, max, { label = "" } = {}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const tone = pct >= 80 ? "is-good" : pct >= 55 ? "" : pct >= 35 ? "is-warn" : "is-bad";
  return `
    <div>
      ${label ? `<p class="eyebrow">${esc(label)}</p>` : ""}
      <div class="meter">
        <span class="meter-value">${esc(value)}</span>
        <span class="meter-max">/ ${esc(max)}</span>
      </div>
      <div class="bar" role="img" aria-label="${esc(value)} out of ${esc(max)}">
        <div class="bar-fill ${tone}" data-pct="${pct}"></div>
      </div>
    </div>`;
}

/** Provisional totals must never read as final. */
export function provisionalNote(total) {
  if (!total.provisional) return "";
  const bits = [];
  if (total.markedCount < total.expectedCount) {
    bits.push(`${total.markedCount} of ${total.expectedCount} commentaries have been marked`);
  }
  if (total.criterionF === null) bits.push("criterion F cannot be scored until all three exist");
  return `<div class="note note-warn"><b>Not a final total</b><p>${esc(bits.join(", "))}. This number will change.</p></div>`;
}

/** The full ladder, with where you are and the one rung that matters next. */
export function ladder(dimension) {
  const rows = dimension.rungs
    ? dimension.rungs.map((text, i) => renderRung(i, text, dimension.rung))
    : [];
  return `<ol class="ladder">${rows.join("")}</ol>`;
}

function renderRung(index, text, current) {
  const cls = index === current ? "is-here" : index === current + 1 ? "is-next" : "";
  return `<li class="${cls}">
      <span class="rung-n">${index}</span>
      <span>${esc(text)}</span>
    </li>`;
}

export function criterionBlock(c) {
  return `
    <div class="criterion">
      <div class="criterion-head">
        <span class="criterion-id">${esc(c.id)}</span>
        <span class="criterion-name">${esc(c.name)}</span>
        <span class="criterion-mark">${esc(c.mark)}<span class="meter-max"> / ${esc(c.max)}</span></span>
      </div>
      <div class="criterion-body">
        <p>${esc(c.levelText)}</p>
        ${c.evidence ? `<blockquote class="evidence">${esc(c.evidence)}</blockquote>` : ""}
        ${c.whyNotHigher ? `<p class="gap"><b>What is missing</b>${esc(c.whyNotHigher)}</p>` : ""}
        ${c.nextStep ? `<p class="small"><strong>Do this:</strong> ${esc(c.nextStep)}</p>` : ""}
      </div>
    </div>`;
}

export function wordCounter(status) {
  const cls = status.state === "over" ? "is-over" : status.state === "near" ? "is-near"
    : status.state === "empty" ? "" : "is-ok";
  return `<span class="counter ${cls}">
      <span class="counter-n">${esc(status.words)}</span>
      <span>/ 800 words</span>
    </span>
    <span class="small">${esc(status.message)}</span>`;
}

export function requirementRow(req) {
  const met = req.met === true ? "met" : req.met === false ? "unmet" : "unknown";
  const glyph = req.met === true ? "1" : req.met === false ? "0" : "?";
  return `<div class="req">
      <span class="req-mark ${met}">${glyph}</span>
      <span class="req-text"><b>${esc(req.label)}</b>${esc(req.detail || "")}</span>
    </div>`;
}

/** Set bar widths without inline style strings in markup. */
export function paintBars(root) {
  for (const bar of root.querySelectorAll(".bar-fill[data-pct]")) {
    bar.style.width = `${bar.dataset.pct}%`;
  }
}

export const UNIT_NAMES = { 2: "Microeconomics", 3: "Macroeconomics", 4: "The global economy" };

/**
 * Who produced this mark, and how far to trust it.
 *
 * A student cannot tell a strong model's mark from a weak one's unless the page
 * says so, and will otherwise treat both as equally authoritative.
 */
export function markedByNote(markedBy) {
  if (!markedBy) return "";
  const tone = markedBy.reliability === "high" ? "" : markedBy.reliability === "low" ? "note-bad" : "note-warn";
  const chip = markedBy.reliability === "high" ? "chip-good"
    : markedBy.reliability === "low" ? "chip-bad" : "chip-warn";
  return `<div class="note ${tone}">
      <b>Marked by ${esc(markedBy.provider)}</b>
      <p>
        <span class="chip ${chip}">${esc(markedBy.reliability)} reliability</span>
        <span class="mono small">${esc(markedBy.model)}</span>
        ${markedBy.source === "byok" ? '<span class="chip">your key</span>' : '<span class="chip">shared key</span>'}
      </p>
      <p>${esc(markedBy.reliabilityNote)}</p>
    </div>`;
}
