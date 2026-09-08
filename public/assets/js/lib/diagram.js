/**
 * Economics diagram primitives.
 *
 * Every diagram is drawn in one coordinate space (0-100 on both axes, origin
 * bottom-left) and rendered as inline SVG, so:
 *   - it inherits the page's theme through CSS custom properties rather than
 *     baking in colours that break in dark mode
 *   - it scales without blurring, unlike a screenshot of a textbook
 *   - it works offline, with no image requests
 *
 * The point of these is not decoration. In IB Economics the diagram carries
 * marks: criterion A of the IA is diagrams, and a Paper 1 answer without one
 * cannot reach the top band. A student needs to see the shape, the labels and
 * the shaded areas they are expected to reproduce by hand.
 */

const W = 340;   // viewBox width
const H = 260;   // viewBox height
const PAD = { l: 46, r: 18, t: 16, b: 40 };

/** Map diagram space (0-100, y up) to SVG space (y down). */
export function px(x) { return PAD.l + (x / 100) * (W - PAD.l - PAD.r); }
export function py(y) { return H - PAD.b - (y / 100) * (H - PAD.t - PAD.b); }

const esc = (v) => String(v ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The axes, with their economic names. Unlabelled axes lose marks. */
export function axes({ x = "Quantity", y = "Price" } = {}) {
  return `
    <line x1="${px(0)}" y1="${py(0)}" x2="${px(103)}" y2="${py(0)}" class="dg-axis"/>
    <line x1="${px(0)}" y1="${py(0)}" x2="${px(0)}" y2="${py(103)}" class="dg-axis"/>
    <text x="${px(103)}" y="${py(0) + 20}" class="dg-axis-label" text-anchor="end">${esc(x)}</text>
    <text x="${px(0) - 8}" y="${py(106)}" class="dg-axis-label" text-anchor="end">${esc(y)}</text>`;
}

/** A straight line between two points in diagram space. */
export function line(x1, y1, x2, y2, cls = "dg-curve") {
  return `<line x1="${px(x1)}" y1="${py(y1)}" x2="${px(x2)}" y2="${py(y2)}" class="${cls}"/>`;
}

/** A quadratic curve, for cost curves and the PPC. */
export function curve(x1, y1, cx, cy, x2, y2, cls = "dg-curve") {
  return `<path d="M ${px(x1)} ${py(y1)} Q ${px(cx)} ${py(cy)} ${px(x2)} ${py(y2)}" class="${cls}"/>`;
}

/** Dashed guide lines from a point to both axes — how an equilibrium is read off. */
export function guides(x, y) {
  return `
    <line x1="${px(0)}" y1="${py(y)}" x2="${px(x)}" y2="${py(y)}" class="dg-guide"/>
    <line x1="${px(x)}" y1="${py(0)}" x2="${px(x)}" y2="${py(y)}" class="dg-guide"/>`;
}

export function dot(x, y) {
  return `<circle cx="${px(x)}" cy="${py(y)}" r="3" class="dg-dot"/>`;
}

/** A curve label, nudged clear of the line it names. */
export function label(x, y, text, { anchor = "start", dx = 0, dy = 0, cls = "dg-label" } = {}) {
  return `<text x="${px(x) + dx}" y="${py(y) + dy}" class="${cls}" text-anchor="${anchor}">${esc(text)}</text>`;
}

/** Axis tick labels, e.g. P1 on the price axis. */
export function tickY(y, text) {
  return `<text x="${px(0) - 7}" y="${py(y) + 4}" class="dg-tick" text-anchor="end">${esc(text)}</text>`;
}
export function tickX(x, text) {
  return `<text x="${px(x)}" y="${py(0) + 15}" class="dg-tick" text-anchor="middle">${esc(text)}</text>`;
}

/** A filled polygon — welfare loss, surplus, tax revenue. */
export function area(points, cls = "dg-area") {
  const d = points.map(([x, y], i) => `${i ? "L" : "M"} ${px(x)} ${py(y)}`).join(" ");
  return `<path d="${d} Z" class="${cls}"/>`;
}

/** An arrow showing a curve shifting, so the direction is unambiguous. */
export function shift(x1, y1, x2, y2) {
  return `<line x1="${px(x1)}" y1="${py(y1)}" x2="${px(x2)}" y2="${py(y2)}"
            class="dg-shift" marker-end="url(#dg-shift-head)"/>`;
}

let uid = 0;

/** Wrap parts into a complete, accessible SVG. */
export function svg(parts, { title, desc }) {
  const id = `dg-t-${++uid}`;
  return `<svg viewBox="0 0 ${W} ${H}" class="dg" role="img"
       aria-labelledby="${id}" preserveAspectRatio="xMidYMid meet">
    <title id="${id}">${esc(title)}</title>
    ${desc ? `<desc>${esc(desc)}</desc>` : ""}
    <defs>
      <marker id="dg-shift-head" viewBox="0 0 8 8" refX="6.5" refY="4"
              markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0,1 L7,4 L0,7 Z" class="dg-shifthead"/>
      </marker>
    </defs>
    ${parts.join("\n    ")}
  </svg>`;
}
