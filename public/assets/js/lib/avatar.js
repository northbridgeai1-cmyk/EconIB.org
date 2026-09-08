/**
 * Avatars.
 *
 * Twelve generated designs rather than uploads. A school tool that accepts
 * image uploads inherits a moderation problem and a storage bill on day one;
 * a fixed palette has neither, and still lets someone make the account theirs.
 *
 * The initials come from the student's own name, so no two accounts in a class
 * look identical even on the same design.
 */
import { esc } from "./dom.js";

export const AVATARS = [
  { bg: "#12507A", fg: "#FFFFFF", name: "Deep blue" },
  { bg: "#1C6B4A", fg: "#FFFFFF", name: "Green" },
  { bg: "#A05A1E", fg: "#FFFFFF", name: "Amber" },
  { bg: "#6B5B95", fg: "#FFFFFF", name: "Violet" },
  { bg: "#A03226", fg: "#FFFFFF", name: "Red" },
  { bg: "#0F6E72", fg: "#FFFFFF", name: "Teal" },
  { bg: "#4C3FBF", fg: "#FFFFFF", name: "Indigo" },
  { bg: "#8A6209", fg: "#FFFFFF", name: "Ochre" },
  { bg: "#2E4057", fg: "#FFFFFF", name: "Slate" },
  { bg: "#7A2E5D", fg: "#FFFFFF", name: "Plum" },
  { bg: "#16191D", fg: "#FBFAF7", name: "Ink" },
  { bg: "#C6C1FF", fg: "#12306B", name: "Pale" },
];

export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A circular avatar. Always a circle — that is what the shape means here. */
export function avatarSvg(name, index = 0, size = 30) {
  const a = AVATARS[Number(index) % AVATARS.length] || AVATARS[0];
  const text = initials(name);
  return `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 40 40"
       role="img" aria-label="${esc(name || "Account")}">
    <circle cx="20" cy="20" r="20" fill="${a.bg}"/>
    <text x="20" y="21" text-anchor="middle" dominant-baseline="central"
          font-family="system-ui, sans-serif" font-size="${text.length > 1 ? 15 : 18}"
          font-weight="600" fill="${a.fg}">${esc(text)}</text>
  </svg>`;
}
