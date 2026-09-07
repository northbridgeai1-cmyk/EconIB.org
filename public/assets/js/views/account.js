import { mount, esc, toast, wirePasswordToggles } from "../lib/dom.js";
import { api, ApiError } from "../lib/api.js";
import { state, loadUser } from "../lib/store.js";
import { paintUserChip } from "../app.js";

export default async function account({ view }) {
  const user = state.user;
  const ai = await api.getAiSettings();

  mount(view, `
    <div class="view-head">
      <h1>Account</h1>
      <p class="lede">Your year and level decide which topics and which papers EconIB shows you.</p>
    </div>

    <div class="split">
      <aside class="sidebar">
        <div class="sidebar-group">
          <h3>Signed in as</h3>
          <p class="small">${esc(user.email)}</p>
        </div>
        <div class="sidebar-group">
          <h3>AI marking today</h3>
          <p class="small">${esc(state.usage?.used ?? 0)} of ${esc(state.usage?.limit ?? 0)} used. Resets at midnight UTC.</p>
        </div>
      </aside>

      <div>
        <form id="account-form" class="card">
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
              <p class="field-hint">Switching to HL adds three topics and Paper 3.</p>
            </div>
          </div>
          <div class="field">
            <label for="examSession">Exam session</label>
            <input id="examSession" name="examSession" type="text" placeholder="May 2027" value="${esc(user.examSession)}">
          </div>
          <button class="btn btn-primary" type="submit" id="save">Save changes</button>
        </form>

        <section class="card mt-4">
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
        </section>

        <section class="card mt-4" id="ai-card">
          ${renderAi(ai)}
        </section>

        <section class="card mt-4">
          <h2>Sign out</h2>
          <p class="small">Ends this session on this device. Your work stays saved.</p>
          <button class="btn" type="button" id="logout">Sign out</button>
        </section>

        <section class="card mt-4">
          <h2>Delete your account</h2>
          <p class="small">
            Permanently removes your account, your three commentaries, every marked exam
            answer and all topic progress. This cannot be undone and there is no backup.
          </p>
          <button class="btn btn-danger" type="button" id="delete">Delete everything</button>
        </section>
      </div>
    </div>
  `);

  view.querySelector("#account-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = view.querySelector("#save");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      await api.updateProfile(values);
      await loadUser();
      paintUserChip();
      toast("Saved.", "good");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not save.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Save changes";
    }
  });

  wirePasswordToggles(view);

  view.querySelector("#password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const button = view.querySelector("#password-save");
    button.disabled = true;
    button.textContent = "Changing…";
    try {
      const res = await api.changePassword(values);
      form.reset();
      toast(res.message, "good");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not change your password.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Change password";
    }
  });

  wireAi(view, ai);

  view.querySelector("#logout").addEventListener("click", async () => {
    try { await api.logout(); } catch { /* clear the cookie regardless */ }
    location.href = "/";
  });

  view.querySelector("#delete").addEventListener("click", async () => {
    const typed = prompt('This deletes everything permanently. Type DELETE to confirm.');
    if (typed !== "DELETE") return;
    const button = view.querySelector("#delete");
    button.disabled = true;
    button.textContent = "Deleting…";
    try {
      await api.deleteAccount();
      // Navigate only after the request resolves. Firing the redirect first
      // leaves the user in a dead session that still looks live if it failed.
      location.href = "/";
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not delete the account.", "error");
      button.disabled = false;
      button.textContent = "Delete everything";
    }
  });
}


// ---------------------------------------------------------------- AI provider

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
