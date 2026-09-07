import { api, ApiError } from "./lib/api.js";
import { $, esc, wirePasswordToggles } from "./lib/dom.js";

const root = $("#auth-root");
const params = new URLSearchParams(location.search);
let mode = params.get("mode") === "signup" ? "signup"
  : params.get("forgot") ? "forgot"
  : "login";

const YEARS = [
  ["IB1", "IB1 — first year"],
  ["IB2", "IB2 — final year"],
];
const LEVELS = [
  ["SL", "Standard Level"],
  ["HL", "Higher Level"],
];

function options(list, selected) {
  return list.map(([v, label]) =>
    `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(label)}</option>`
  ).join("");
}

function render(values = {}, errors = {}, banner = null) {
  if (mode === "forgot") return renderForgot(values, errors, banner);
  const signup = mode === "signup";
  root.innerHTML = `
    <h1>${signup ? "Create your account" : "Sign in"}</h1>
    <p class="lede">${signup
      ? "You will need this to save your IA portfolio and marked answers."
      : "Welcome back."}</p>
    ${banner ? `<div class="note note-bad"><b>Could not ${signup ? "sign up" : "sign in"}</b><p>${esc(banner)}</p></div>` : ""}
    <form id="auth-form" novalidate>
      ${signup ? `
      <div class="field">
        <label for="name">Your name</label>
        <input id="name" name="name" type="text" autocomplete="name" required
               value="${esc(values.name || "")}" ${errors.name ? 'aria-invalid="true"' : ""}>
        ${errors.name ? `<p class="field-error">${esc(errors.name)}</p>` : ""}
      </div>` : ""}

      <div class="field">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" required
               value="${esc(values.email || "")}" ${errors.email ? 'aria-invalid="true"' : ""}>
        ${errors.email ? `<p class="field-error">${esc(errors.email)}</p>` : ""}
      </div>

      <div class="field">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" required
               autocomplete="${signup ? "new-password" : "current-password"}"
               ${errors.password ? 'aria-invalid="true"' : ""}>
        ${errors.password ? `<p class="field-error">${esc(errors.password)}</p>` : ""}
        <p class="field-hint">${signup
          ? "At least 10 characters. Length beats complexity — a short phrase you will remember is stronger than a mangled word. Use Show to check it before you continue."
          : '<a href="#" id="forgot">I forgot my password</a>'}</p>
      </div>

      ${signup ? `
      <div class="grid-2">
        <div class="field">
          <label for="yearGroup">Year</label>
          <select id="yearGroup" name="yearGroup">${options(YEARS, values.yearGroup || "IB1")}</select>
        </div>
        <div class="field">
          <label for="level">Level</label>
          <select id="level" name="level">${options(LEVELS, values.level || "SL")}</select>
        </div>
      </div>
      <div class="field">
        <label for="examSession">Exam session <span class="small">(optional)</span></label>
        <input id="examSession" name="examSession" type="text" placeholder="May 2027"
               value="${esc(values.examSession || "")}">
      </div>` : ""}

      <button class="btn btn-primary" type="submit" id="submit">
        ${signup ? "Create account" : "Sign in"}
      </button>
    </form>

    <p class="small" class="mt-4">
      ${signup
        ? `Already have an account? <a href="#" id="toggle">Sign in</a>.`
        : `No account yet? <a href="#" id="toggle">Create one</a>.`}
    </p>
  `;

  wirePasswordToggles(root);

  const forgotLink = $("#forgot");
  if (forgotLink) {
    forgotLink.addEventListener("click", (e) => {
      e.preventDefault();
      mode = "forgot";
      render(collect());
    });
  }

  $("#toggle").addEventListener("click", (e) => {
    e.preventDefault();
    mode = signup ? "login" : "signup";
    render(collect());
  });
  $("#auth-form").addEventListener("submit", submit);
  const first = root.querySelector("input[aria-invalid], input");
  if (first) first.focus();
}

function collect() {
  const form = $("#auth-form");
  if (!form) return {};
  const data = Object.fromEntries(new FormData(form).entries());
  delete data.password;
  return data;
}

async function submit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const button = $("#submit");
  button.disabled = true;
  button.textContent = mode === "signup" ? "Creating account…" : "Signing in…";

  try {
    if (mode === "signup") await api.signup(values);
    else await api.login({ email: values.email, password: values.password });
    location.href = "/app";
  } catch (err) {
    const errors = {};
    let banner = err instanceof ApiError ? err.message : "Something went wrong. Try again.";
    const field = err instanceof ApiError ? errorField(err) : null;
    // Only attach to a field that actually exists on this form. Attaching to a
    // name with no matching input silently swallowed the message — an empty
    // submit showed nothing at all until this was caught by testing.
    if (field && form.querySelector(`[name="${CSS.escape(field)}"]`)) {
      errors[field] = err.message;
      banner = null;
    }
    const kept = { ...values };
    delete kept.password;
    render(kept, errors, banner);
  }
}

function errorField(err) {
  // The server names the offending field; fall back to a banner if it did not.
  return err.field || (err.code === "weak_password" ? "password"
    : err.code === "bad_email" || err.code === "email_taken" ? "email" : null);
}

render(mode === "signup" ? { yearGroup: "IB1", level: "SL" } : {});


// --------------------------------------------------------------- forgot password

function renderForgot(values = {}, errors = {}, banner = null) {
  root.innerHTML = `
    <h1>Reset your password</h1>
    <p class="lede">We will email you a link to choose a new one.</p>
    ${banner ? `<div class="note note-bad"><b>Could not send</b><p>${esc(banner)}</p></div>` : ""}
    <form id="forgot-form" novalidate>
      <div class="field">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" required
               value="${esc(values.email || "")}" ${errors.email ? 'aria-invalid="true"' : ""}>
        ${errors.email ? `<p class="field-error">${esc(errors.email)}</p>` : ""}
      </div>
      <button class="btn btn-primary" type="submit" id="submit">Email me a link</button>
    </form>
    <p class="small mt-4"><a href="#" id="toggle">Back to sign in</a></p>`;

  $("#toggle").addEventListener("click", (e) => {
    e.preventDefault();
    mode = "login";
    render({ email: $("#email").value });
  });

  $("#forgot-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("#email").value;
    const button = $("#submit");
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      const res = await api.forgotPassword({ email });
      sent(res.message);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong.";
      if (err instanceof ApiError && err.field === "email") renderForgot({ email }, { email: message });
      else renderForgot({ email }, {}, message);
    }
  });

  $("#email").focus();
}

function sent(message) {
  root.innerHTML = `
    <h1>Check your email</h1>
    <div class="note"><b>Link sent</b><p>${esc(message)}</p></div>
    <p class="small">The link works once and expires in an hour. If nothing arrives in a few
    minutes, check your spam folder, then try again.</p>
    <p class="small mt-4"><a href="/login">Back to sign in</a></p>`;
}
