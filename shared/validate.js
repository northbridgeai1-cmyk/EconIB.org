/**
 * Input validation.
 *
 * Everything is length-clamped and pattern-checked here, on the server, before
 * it reaches the database. The client's copy of these rules is a convenience;
 * this one is the rule.
 */
import { badRequest } from "./http.js";

export const LIMITS = {
  email: 254,
  name: 80,
  password: 200,
  title: 300,
  source: 200,
  url: 2000,
  body: 20000,       // ~3x the 800-word limit, so an over-long draft still saves
  question: 4000,
  answer: 30000,
  examSession: 40,
};

export function str(value, field, { max, required = true, trim = true, name } = {}) {
  const key = name || field;
  if (value === null || value === undefined) {
    if (required) throw badRequest(`${field} is required.`, "missing_field", { field: key });
    return "";
  }
  if (typeof value !== "string") throw badRequest(`${field} must be text.`, "bad_field", { field: key });
  let s = trim ? value.trim() : value;
  if (required && !s) throw badRequest(`${field} is required.`, "missing_field", { field: key });
  if (max && s.length > max) throw badRequest(`${field} must be ${max} characters or fewer.`, "too_long", { field: key, max });
  return s;
}

// Deliberately permissive: the shape check is a typo guard, not an
// authorisation control. Deliverability is proven by sending, not by a regex.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;

export function email(value) {
  const s = str(value, "Email", { max: LIMITS.email }).toLowerCase();
  if (!EMAIL_RE.test(s)) throw badRequest("That does not look like an email address.", "bad_email", { field: "email" });
  return s;
}

export function password(value) {
  if (typeof value !== "string") throw badRequest("Password is required.", "missing_field", { field: "password" });
  if (value.length < 10) {
    throw badRequest("Use at least 10 characters. Length beats complexity.", "weak_password", { field: "password" });
  }
  if (value.length > LIMITS.password) {
    throw badRequest(`Passwords must be ${LIMITS.password} characters or fewer.`, "too_long", { field: "password" });
  }
  return value;
}

/**
 * @param label  what the student sees ("Key concept")
 * @param name   the form field it maps to ("keyConcept") — the client attaches
 *               the error to this input, so a label here silently loses it
 */
export function oneOf(value, allowed, label, name) {
  if (!allowed.includes(value)) {
    throw badRequest(`${label} must be one of: ${allowed.join(", ")}.`, "bad_field", { field: name || label });
  }
  return value;
}

export function optionalDate(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw badRequest(`${field} must be a date.`, "bad_date", { field });
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw badRequest(`${field} is not a real date.`, "bad_date", { field });
  if (d.getUTCFullYear() < 1990 || d > new Date(Date.now() + 86400000)) {
    throw badRequest(`${field} is outside the range we accept.`, "bad_date", { field });
  }
  return s;
}

export function optionalUrl(value) {
  if (!value) return "";
  const s = str(value, "Article link", { max: LIMITS.url, required: false });
  if (!s) return "";
  let u;
  try { u = new URL(s); } catch { throw badRequest("That article link is not a valid URL.", "bad_url", { field: "articleUrl" }); }
  if (!["http:", "https:"].includes(u.protocol)) {
    throw badRequest("Article links must start with http:// or https://.", "bad_url", { field: "articleUrl" });
  }
  return u.toString();
}

export function intIn(value, min, max, label, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw badRequest(`${label} must be a whole number between ${min} and ${max}.`, "bad_field", { field: name || label });
  }
  return n;
}
