/**
 * Thin API client.
 *
 * Auth is a session cookie set by the server: HttpOnly, Secure, SameSite=Strict.
 * HttpOnly keeps the token out of reach of any injected script; SameSite=Strict
 * means a cross-site request carries no credentials, so there is no CSRF surface
 * to mitigate. The frontend never sees or stores the token.
 */

export class ApiError extends Error {
  constructor(message, status, code, payload = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    // The server names the offending field and any retry hint; keep them, or
    // the UI can only ever show a generic banner.
    this.field = payload.field || null;
    this.retryAfterSeconds = payload.retryAfterSeconds ?? null;
    this.payload = payload;
  }
}

async function request(path, { method = "GET", body, signal } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      signal,
    });
  } catch (cause) {
    if (cause?.name === "AbortError") throw cause;
    throw new ApiError(
      navigator.onLine === false
        ? "You are offline. This action needs a connection."
        : "Could not reach the server.",
      0, "network"
    );
  }

  let data = null;
  const type = res.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    try { data = await res.json(); } catch { data = null; }
  }

  if (!res.ok) {
    throw new ApiError(
      data?.error || `Request failed (${res.status}).`,
      res.status,
      data?.code || "http_error",
      data || {}
    );
  }
  return data;
}

export const api = {
  signup: (b) => request("/auth/signup", { method: "POST", body: b }),
  login: (b) => request("/auth/login", { method: "POST", body: b }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),
  forgotPassword: (b) => request("/auth/forgot", { method: "POST", body: b }),
  checkReset: (token) => request(`/auth/reset?token=${encodeURIComponent(token)}`),
  resetPassword: (b) => request("/auth/reset", { method: "POST", body: b }),
  changePassword: (b) => request("/auth/password", { method: "POST", body: b }),
  updateProfile: (b) => request("/auth/me", { method: "PATCH", body: b }),
  deleteAccount: () => request("/auth/me", { method: "DELETE" }),

  listCommentaries: () => request("/ia"),
  getCommentary: (id) => request(`/ia/${encodeURIComponent(id)}`),
  saveCommentary: (b) => request("/ia", { method: "POST", body: b }),
  updateCommentary: (id, b) => request(`/ia/${encodeURIComponent(id)}`, { method: "PATCH", body: b }),
  deleteCommentary: (id) => request(`/ia/${encodeURIComponent(id)}`, { method: "DELETE" }),

  gradeIa: (b, signal) => request("/grade/ia", { method: "POST", body: b, signal }),
  gradePaper: (b, signal) => request("/grade/paper", { method: "POST", body: b, signal }),
  gradePaperHistory: () => request("/grade/paper"),

  getAiSettings: () => request("/settings/ai"),
  setAiKey: (b) => request("/settings/ai", { method: "PUT", body: b }),
  clearAiKey: () => request("/settings/ai", { method: "DELETE" }),

  getStats: () => request("/stats"),
  getPractice: (unit) => request(`/practice${unit ? `?unit=${encodeURIComponent(unit)}` : ""}`),
  submitPractice: (b) => request("/practice", { method: "POST", body: b }),

  getProgress: () => request("/progress"),
  setProgress: (b) => request("/progress", { method: "PATCH", body: b }),
};

export { request };
