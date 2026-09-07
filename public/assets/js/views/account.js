import { mount, esc, toast } from "../lib/dom.js";
import { api, ApiError } from "../lib/api.js";
import { state, loadUser } from "../lib/store.js";
import { paintUserChip } from "../app.js";

export default async function account({ view }) {
  const user = state.user;

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
