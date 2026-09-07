import { api, ApiError } from "./lib/api.js";
import { $, esc, wirePasswordToggles } from "./lib/dom.js";
import { deriveVerifier, checkPassword } from "./lib/pwcrypto.js";

const root = $("#reset-root");
const token = new URLSearchParams(location.search).get("token") || "";

async function start() {
  if (!token) return dead("This link is missing its code. Use the link from the email exactly as it was sent.");
  let valid = false;
  try {
    ({ valid } = await api.checkReset(token));
  } catch {
    return dead("We could not check that link. Try again in a moment.");
  }
  if (!valid) {
    return dead("This link has expired or has already been used. Reset links last one hour and work once.");
  }
  form();
}

function dead(message) {
  root.innerHTML = `
    <h1>That link does not work</h1>
    <div class="note note-bad"><b>Link not usable</b><p>${esc(message)}</p></div>
    <a class="btn btn-primary" href="/login?forgot=1">Ask for a new link</a>
    <p class="small mt-4"><a href="/login">Back to sign in</a></p>`;
}

function form(errors = {}, banner = null) {
  root.innerHTML = `
    <h1>Choose a new password</h1>
    <p class="lede">This link works once.</p>
    ${banner ? `<div class="note note-bad"><b>Could not save</b><p>${esc(banner)}</p></div>` : ""}
    <form id="reset-form" novalidate>
      <div class="field">
        <label for="password">New password</label>
        <input id="password" name="password" type="password" autocomplete="new-password" required
               ${errors.password ? 'aria-invalid="true"' : ""}>
        ${errors.password ? `<p class="field-error">${esc(errors.password)}</p>` : ""}
        <p class="field-hint">At least 10 characters. Use Show to check it before you save.</p>
      </div>
      <button class="btn btn-primary" type="submit" id="submit">Save new password</button>
    </form>
    <p class="small mt-4"><a href="/login">Back to sign in</a></p>`;

  wirePasswordToggles(root);
  $("#reset-form").addEventListener("submit", submit);
  $("#password").focus();
}

async function submit(event) {
  event.preventDefault();
  const password = $("#password").value;
  const button = $("#submit");

  const strength = checkPassword(password);
  if (!strength.ok) return form({ password: strength.message });

  button.disabled = true;
  button.textContent = "Securing your password…";
  try {
    // The reset endpoint needs the email to derive the same verifier, and the
    // token identifies the account, so the server returns it with the check.
    const { email } = await api.checkReset(token);
    const verifier = await deriveVerifier(email, password);
    button.textContent = "Saving…";
    await api.resetPassword({ token, verifier });
    // The server signs us in, so go straight to the app rather than making
    // someone type the password they just chose.
    location.href = "/app";
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Something went wrong.";
    if (err instanceof ApiError && err.field === "password") form({ password: message });
    else if (err instanceof ApiError && err.code === "bad_reset_token") dead(message);
    else form({}, message);
  }
}

start();
