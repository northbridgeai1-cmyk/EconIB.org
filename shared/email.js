/**
 * Transactional email, via Resend.
 *
 * If no provider is configured this FAILS CLOSED and says so, rather than
 * pretending to have sent a reset link. A password reset that silently does
 * nothing is worse than one that is switched off, because the user waits for an
 * email that was never going to arrive.
 */
import { HttpError } from "./http.js";

export function emailConfigured(env) {
  return Boolean(env.RESEND_API_KEY && env.RESET_FROM_EMAIL);
}

export async function sendEmail(env, { to, subject, text, html }) {
  if (!emailConfigured(env)) {
    throw new HttpError(
      503,
      "Password reset email is not set up on this deployment yet. Ask whoever runs EconIB to reset your password.",
      "email_unconfigured"
    );
  }

  let res;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: env.RESET_FROM_EMAIL, to: [to], subject, text, html }),
    });
  } catch {
    throw new HttpError(502, "Could not send the email. Try again shortly.", "email_upstream");
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("resend error", res.status, detail.slice(0, 300));
    if (res.status === 401 || res.status === 403) {
      throw new HttpError(503, "Email is misconfigured on this deployment.", "email_auth");
    }
    throw new HttpError(502, "Could not send the email. Try again shortly.", "email_upstream");
  }
}

export function resetEmail({ name, link, minutes }) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const text = [
    greeting,
    "",
    "Someone asked to reset the password on your EconIB account.",
    "",
    "Open this link to choose a new one:",
    link,
    "",
    `The link works once and expires in ${minutes} minutes.`,
    "",
    "If this was not you, ignore this email. Your password has not changed.",
    "",
    "EconIB",
  ].join("\n");

  // Plain and boring on purpose: a password email that looks like marketing
  // trains people to click links in emails that look like marketing.
  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#16191D">
  <p>${escapeHtml(greeting)}</p>
  <p>Someone asked to reset the password on your EconIB account.</p>
  <p><a href="${escapeHtml(link)}" style="color:#12507A">Choose a new password</a></p>
  <p style="font-size:13px;color:#5A6470">The link works once and expires in ${minutes} minutes.
  If this was not you, ignore this email — your password has not changed.</p>
  <p style="font-size:13px;color:#5A6470">EconIB</p>
</div>`;

  return { text, html };
}

function escapeHtml(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
