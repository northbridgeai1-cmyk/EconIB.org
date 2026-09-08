import { mount, esc, toast, wirePasswordToggles } from "../lib/dom.js";
import { api, ApiError } from "../lib/api.js";
import { state, loadUser } from "../lib/store.js";
import { deriveVerifier, checkPassword } from "../lib/pwcrypto.js";
import { avatarSvg, AVATARS } from "../lib/avatar.js";
import { paintUserChip } from "../app.js";

/**
 * Settings, with a menu down the left.
 *
 * One long scrolling page mixes "change my year group" with "delete
 * everything", and the second is far too easy to reach by accident. Separate
 * sections keep the destructive things somewhere you have to choose to go.
 */
const SECTIONS = [
  { id: "profile", label: "Account", title: "Your account" },
  { id: "appearance", label: "Appearance", title: "Appearance" },
  { id: "marking", label: "Marking", title: "Who marks your work" },
  { id: "security", label: "Security", title: "Password" },
  { id: "privacy", label: "Privacy & data", title: "Privacy and your data" },
];

export default async function settings({ view, parts }) {
  const section = SECTIONS.some((s) => s.id === parts[0]) ? parts[0] : "profile";
  const user = state.user;
  const ai = section === "marking" ? await api.getAiSettings() : null;

  mount(view, `
    <div class="view-head">
      <h1>Settings</h1>
    </div>
    <div class="study">
      <nav class="tree" aria-label="Settings">
        <div class="tree-unit">
          ${SECTIONS.map((s) => `<a href="#/settings/${s.id}"
              ${s.id === section ? 'aria-current="page"' : ""}>
              <span>${esc(s.label)}</span></a>`).join("")}
        </div>
      </nav>
      <div id="settings-panel">${panel(section, user, ai)}</div>
    </div>`);

  wire(section, view, user, ai);
}

function panel(section, user, ai) {
  if (section === "appearance") return appearancePanel(user);
  if (section === "marking") return markingPanel(ai);
  if (section === "security") return securityPanel();
  if (section === "privacy") return privacyPanel(user);
  return profilePanel(user);
}

// ------------------------------------------------------------------ profile

function profilePanel(user) {
  return `
    <section class="card">
      <div class="row mb-4">
        <span id="avatar-preview">${avatarSvg(user.name, user.avatar, 56)}</span>
        <div>
          <h2>${esc(user.name)}</h2>
          <p class="small">${esc(user.email)}</p>
        </div>
      </div>
      <form id="profile-form">
        <div class="field">
          <label for="name">Name</label>
          <input id="name" name="name" type="text" value="${esc(user.name)}" required>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="yearGroup">Year</label>
            <select id="yearGroup" name="yearGroup">
              <option value="IB1"${user.yearGroup === "IB1" ? " selected" : ""}>IB1 — first year</option>
              <option value="IB2"${user.yearGroup === "IB2" ? " selected" : ""}>IB2 — final year</option>
            </select>
          </div>
          <div class="field">
            <label for="level">Level</label>
            <select id="level" name="level">
              <option value="SL"${user.level === "SL" ? " selected" : ""}>Standard Level</option>
              <option value="HL"${user.level === "HL" ? " selected" : ""}>Higher Level</option>
            </select>
            <p class="field-hint">HL adds three topics and Paper 3.</p>
          </div>
        </div>
        <div class="field">
          <label for="examSession">Exam session</label>
          <input id="examSession" name="examSession" type="text" placeholder="May 2027" value="${esc(user.examSession)}">
        </div>
        <button class="btn btn-primary" type="submit" id="profile-save">Save changes</button>
      </form>
    </section>`;
}

// --------------------------------------------------------------- appearance

function appearancePanel(user) {
  return `
    <section class="card">
      <h2>Your avatar</h2>
      <p class="small">Pick a colour. Your initials come from your name.</p>
      <div class="avatar-grid mt-4" id="avatar-grid">
        ${AVATARS.map((a, i) => `
          <button type="button" class="avatar-option" data-avatar="${i}"
                  aria-pressed="${i === (user.avatar ?? 0)}" aria-label="${esc(a.name)}">
            ${avatarSvg(user.name, i, 44)}
          </button>`).join("")}
      </div>
    </section>

    <section class="card mt-4">
      <h2>Colour theme</h2>
      <p class="small">The theme button sits in the header. It follows your device by default.</p>
    </section>`;
}

// ------------------------------------------------------------------ privacy

function privacyPanel(user) {
  return `
    <section class="card">
      <h2>What EconIB stores</h2>
      <ul class="prose">
        <li>Your name, email, year and level.</li>
        <li>Your IA commentaries and marked exam answers — your work, kept so you can come back to it.</li>
        <li>Which topics you have rated, and your streak and XP.</li>
        <li>Your own API key, if you added one, encrypted so it cannot be read back.</li>
      </ul>
      <p class="small">Your password is never stored. It is stretched in your browser and only a
      hash of the result reaches the server, so nobody here can read it — including us.</p>
      <p class="small"><a href="/terms">Terms and privacy</a></p>
    </section>

    <section class="card mt-4">
      <h2>Sign out</h2>
      <p class="small">Ends this session on this device. Your work stays saved.</p>
      <button class="btn" type="button" id="logout">Sign out</button>
    </section>

    <section class="card mt-4">
      <h2>Delete your account</h2>
      <p class="small">
        Permanently removes your account, your commentaries, every marked answer,
        your progress and your streak. This cannot be undone and there is no backup.
      </p>
      <button class="btn btn-danger" type="button" id="delete">Delete everything</button>
    </section>`;
}

// ----------------------------------------------------------------- security

function securityPanel() {
  return `
    <section class="card">
      <h2>Change your password</h2>
      <form id="password-form">
        <div class="field">
          <label for="currentPassword">Current password</label>
          <input id="currentPassword" name="currentPassword" type="password" autocomplete="current-password" required>
        </div>
        <div class="field">
          <label for="newPassword">New password</label>
          <input id="newPassword" name="newPassword" type="password" autocomplete="new-password" required>
          <p class="field-hint">At least 10 characters. Use Show to check it before saving.</p>
        </div>
        <button class="btn" type="submit" id="password-save">Change password</button>
        <p class="field-hint">Your other devices will be signed out. This one stays signed in.</p>
      </form>
    </section>`;
}

function markingPanel(ai) {
  return `<section class="card" id="ai-card">${renderAi(ai)}</section>`;
}

// -------------------------------------------------------------------- wiring

function wire(section, view, user, ai) {
  wirePasswordToggles(view);

  const profileForm = view.querySelector("#profile-form");
  if (profileForm) profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = view.querySelector("#profile-save");
    button.disabled = true; button.textContent = "Saving…";
    try {
      await api.updateProfile(Object.fromEntries(new FormData(event.currentTarget).entries()));
      await loadUser();
      paintUserChip();
      toast("Saved.", "good");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not save.", "error");
    } finally {
      button.disabled = false; button.textContent = "Save changes";
    }
  });

  const grid = view.querySelector("#avatar-grid");
  if (grid) grid.addEventListener("click", async (event) => {
    const button = event.target.closest(".avatar-option");
    if (!button) return;
    const chosen = Number(button.dataset.avatar);
    for (const b of grid.querySelectorAll(".avatar-option")) {
      b.setAttribute("aria-pressed", String(Number(b.dataset.avatar) === chosen));
    }
    try {
      await api.updateProfile({ avatar: chosen });
      await loadUser();
      paintUserChip();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not save that avatar.", "error");
    }
  });

  const pwForm = view.querySelector("#password-form");
  if (pwForm) pwForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const button = view.querySelector("#password-save");
    button.disabled = true;
    try {
      const strength = checkPassword(values.newPassword);
      if (!strength.ok) { toast(strength.message, "error"); return; }
      button.textContent = "Securing…";
      const [currentVerifier, newVerifier] = await Promise.all([
        deriveVerifier(user.email, values.currentPassword),
        deriveVerifier(user.email, values.newPassword),
      ]);
      const res = await api.changePassword({ currentVerifier, newVerifier });
      form.reset();
      toast(res.message, "good");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not change your password.", "error");
    } finally {
      button.disabled = false; button.textContent = "Change password";
    }
  });

  const logout = view.querySelector("#logout");
  if (logout) logout.addEventListener("click", async () => {
    try { await api.logout(); } catch { /* clear the cookie regardless */ }
    location.href = "/";
  });

  const del = view.querySelector("#delete");
  if (del) del.addEventListener("click", async () => {
    if (prompt("This deletes everything permanently. Type DELETE to confirm.") !== "DELETE") return;
    del.disabled = true; del.textContent = "Deleting…";
    try {
      await api.deleteAccount();
      location.href = "/";
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not delete the account.", "error");
      del.disabled = false; del.textContent = "Delete everything";
    }
  });

  if (section === "marking") wireAi(view, ai);
}
// ---------------------------------------------------- AI provider (lifted)

function renderAi(ai) {
  const { providers, current, shared } = ai;
  const chosenId = current.provider || (providers.find((p) => p.free) || providers[0]).id;
  const chosen = providers.find((p) => p.id === chosenId) || providers[0];

  return `
    <h2>Who marks your work</h2>

    ${shared ? `<p class="small">
      Shared default: <strong>${esc(shared.label)}</strong>${shared.configured ? "" : " — not configured on this deployment"}.
      ${shared.estimatedMarkingsPerDay
        ? `Its free tier covers roughly <strong>${esc(shared.estimatedMarkingsPerDay)} markings a day across everyone using EconIB</strong>, because free tiers cap tokens per day, not just requests. Add your own key and you are not competing for that.`
        : ""}
    </p>` : ""}

    ${current.usingOwnKey
      ? `<div class="note note-good-ish">
           <b>Using your own key</b>
           <p>${esc(providers.find((p) => p.id === current.provider)?.label || current.provider)} ·
              <span class="mono">${esc(current.model || "")}</span> ·
              key <span class="mono">${esc(current.keyHint || "")}</span></p>
           <p class="small">Your key is encrypted before it is stored and is never sent back to this page.</p>
         </div>
         <button class="btn btn-danger btn-sm" type="button" id="ai-clear">Remove my key</button>
         <hr>`
      : ""}

    <h3 class="mt-4">${current.usingOwnKey ? "Replace your key" : "Use your own key"}</h3>
    <p class="small">
      Free keys are quick to create and mean you never wait on a shared limit.
      It stays yours: your quota, your provider's data policy.
    </p>

    <form id="ai-form">
      <div class="grid-2">
        <div class="field">
          <label for="ai-provider">Provider</label>
          <select id="ai-provider" name="provider">
            ${providers.map((p) => `<option value="${esc(p.id)}"${p.id === chosenId ? " selected" : ""}>
                ${esc(p.label)}${p.free ? " — free tier" : " — paid"}
              </option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="ai-model">Model</label>
          <select id="ai-model" name="model">
            ${chosen.models.map((m) => `<option value="${esc(m.id)}"${m.id === chosen.defaultModel ? " selected" : ""}>
                ${esc(m.label)}
              </option>`).join("")}
          </select>
        </div>
      </div>

      <div id="ai-policy">${policyNote(chosen)}</div>

      <div class="field">
        <label for="ai-key">API key</label>
        <input id="ai-key" name="apiKey" type="password" autocomplete="off" spellcheck="false"
               placeholder="Paste your key">
        <p class="field-hint">
          Get one at <a href="${esc(chosen.keyUrl)}" target="_blank" rel="noopener noreferrer">${esc(chosen.keyUrl)}</a>.
        </p>
      </div>

      <button class="btn btn-primary" type="submit" id="ai-save">Save key</button>
    </form>`;
}

function policyNote(provider) {
  const risky = provider.dataPolicyRisk === "high";
  return `<div class="note ${risky ? "note-bad" : ""}">
      <b>${risky ? "Read this before using this provider" : "Data policy"}</b>
      <p>${esc(provider.dataPolicy)}</p>
      <p class="small">${esc(provider.reliabilityNote)}</p>
    </div>`;
}

function wireAi(view, ai) {
  const form = view.querySelector("#ai-form");
  if (!form) return;

  const providerSelect = view.querySelector("#ai-provider");
  providerSelect.addEventListener("change", () => {
    const p = ai.providers.find((x) => x.id === providerSelect.value);
    const modelSelect = view.querySelector("#ai-model");
    modelSelect.innerHTML = p.models
      .map((m) => `<option value="${esc(m.id)}"${m.id === p.defaultModel ? " selected" : ""}>${esc(m.label)}</option>`)
      .join("");
    view.querySelector("#ai-policy").innerHTML = policyNote(p);
    const hint = form.querySelector(".field-hint");
    if (hint) hint.innerHTML = `Get one at <a href="${esc(p.keyUrl)}" target="_blank" rel="noopener noreferrer">${esc(p.keyUrl)}</a>.`;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    const button = view.querySelector("#ai-save");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await api.setAiKey(values);
      toast("Key saved. Your markings now use it.", "good");
      location.reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not save that key.", "error");
      button.disabled = false;
      button.textContent = "Save key";
    }
  });

  const clear = view.querySelector("#ai-clear");
  if (clear) {
    clear.addEventListener("click", async () => {
      if (!confirm("Remove your API key? Marking will fall back to the shared key and its daily limit.")) return;
      try {
        await api.clearAiKey();
        toast("Key removed.", "good");
        location.reload();
      } catch (err) {
        toast(err instanceof ApiError ? err.message : "Could not remove the key.", "error");
      }
    });
  }
}