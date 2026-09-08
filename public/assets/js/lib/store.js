/**
 * Application state.
 *
 * Static syllabus data is fetched once and cached for the page's lifetime.
 * User data is fetched per view so a second tab cannot serve stale marks.
 */
import { api } from "./api.js";

const cache = new Map();

async function loadJson(path) {
  if (cache.has(path)) return cache.get(path);
  const promise = fetch(path, { credentials: "same-origin" }).then((res) => {
    if (!res.ok) throw new Error(`Could not load ${path}`);
    return res.json();
  });
  cache.set(path, promise);
  try {
    return await promise;
  } catch (err) {
    cache.delete(path); // a failed load must not be cached as permanent
    throw err;
  }
}

export const data = {
  syllabus: () => loadJson("/assets/data/syllabus.json"),
  rubrics: () => loadJson("/assets/data/rubrics.json"),
  commandTerms: () => loadJson("/assets/data/command-terms.json"),
  keyConcepts: () => loadJson("/assets/data/key-concepts.json"),
  assessment: () => loadJson("/assets/data/assessment.json"),
};

export const state = {
  user: null,
  usage: null,
  progress: null,
};

export async function loadUser() {
  const { user, usage } = await api.me();
  state.user = user;
  state.usage = usage;
  return user;
}

export async function loadProgress() {
  if (state.progress) return state.progress;
  const { progress } = await api.getProgress();
  state.progress = progress;
  return progress;
}

export async function setProgress(topicCode, nextState) {
  const res = await api.setProgress({ topicCode, state: nextState });
  if (state.progress) state.progress[topicCode] = nextState;
  return res;
}

/** Topics the signed-in student actually studies. */
export function topicsFor(syllabus, level) {
  return syllabus.topics.filter((t) => (level === "HL" ? true : !t.hlOnly));
}
