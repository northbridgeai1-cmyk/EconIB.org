/**
 * Deterministic IA rules.
 *
 * Criterion F and the word limit are decided by arithmetic and dates, not by
 * judgment. They are computed here, identically in the browser, on the server
 * and in the test suite — never sent to a language model, which would turn three
 * certain marks into three guessed ones.
 */

export const IA_WORD_LIMIT = 800;
export const IA_UNITS = [
  { unit: 2, name: "Microeconomics" },
  { unit: 3, name: "Macroeconomics" },
  { unit: 4, name: "The global economy" },
];

/** What the IB excludes from the count but a plain textarea cannot see. */
export const WORD_COUNT_EXCLUSIONS = [
  "Acknowledgments",
  "Contents page",
  "Diagrams",
  "Labels of five words or fewer",
  "Headings on diagrams of ten words or fewer",
  "Tables of statistical data",
  "Equations, formulae and calculations",
  "Citations (which must sit in the body)",
  "References (which must sit in footnotes or endnotes)",
];

/**
 * Count words the way a reader would: whitespace-separated tokens containing at
 * least one letter or digit. Hyphenated and apostrophised words count once.
 *
 * This counts everything you paste. It cannot detect diagram labels or a table
 * of statistics, so if your commentary contains those, your official count is
 * LOWER than this. The UI says so rather than implying a precision we do not have.
 */
export function countWords(text) {
  if (!text) return 0;
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((tok) => /[\p{L}\p{N}]/u.test(tok))
    .length;
}

export function wordCountStatus(text) {
  const words = countWords(text);
  const over = words - IA_WORD_LIMIT;
  if (words === 0) return { words, state: "empty", message: "Nothing to count yet." };
  if (over > 0) {
    return {
      words, over, state: "over",
      message: `${over} word${over === 1 ? "" : "s"} over. Moderators stop reading at ${IA_WORD_LIMIT} — anything past that is not marked.`,
    };
  }
  if (words >= IA_WORD_LIMIT - 40) {
    return { words, state: "near", message: `${IA_WORD_LIMIT - words} words left.` };
  }
  return { words, state: "ok", message: `${IA_WORD_LIMIT - words} words left.` };
}

/**
 * Parse to a UTC calendar date at midnight.
 *
 * These are calendar dates ("the article was published on the 15th"), not
 * instants. Everything below works in UTC so that a browser at a negative
 * offset does not read a date as the previous day and misjudge the one-year
 * boundary by 24 hours.
 */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const ymd = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return new Date(Date.UTC(+ymd[1], +ymd[2] - 1, +ymd[3]));
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Same calendar day one year earlier. 29 Feb falls back to 28 Feb. */
export function oneYearBefore(date) {
  const d = toDate(date);
  if (!d) return null;
  const y = d.getUTCFullYear() - 1;
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m, day));
  // Date.UTC rolls 29 Feb in a non-leap year forward to 1 March; clamp it back.
  if (target.getUTCMonth() !== m) target.setUTCDate(0);
  return target;
}

/**
 * Is the article current? Published no earlier than one year before the
 * commentary was written.
 */
export function checkRecency(publishedAt, writtenAt) {
  const pub = toDate(publishedAt);
  const wrote = toDate(writtenAt);
  if (!pub || !wrote) return { ok: null, reason: "Needs both the article's publication date and the date you wrote the commentary." };
  if (pub > wrote) return { ok: false, reason: "The article is dated after the commentary was written. One of the two dates is wrong." };
  const earliest = oneYearBefore(wrote);
  if (pub < earliest) {
    const days = Math.round((wrote - pub) / 86400000);
    return { ok: false, reason: `Published ${days} days before you wrote — more than a year. This article cannot be used.`, earliest };
  }
  return { ok: true, reason: "Published within a year of the commentary.", earliest };
}

/** Compare sources at publication level so "bbc.co.uk/news/x" and "bbc.co.uk/y" match. */
export function normalizeSource(source) {
  if (!source) return "";
  let s = String(source).trim().toLowerCase();
  const urlLike = s.match(/^(?:https?:\/\/)?(?:www\.)?([^/\s]+)/);
  if (urlLike && urlLike[1].includes(".")) {
    const parts = urlLike[1].split(".").filter(Boolean);
    // Keep the registrable-ish tail: last two labels, or three for co.uk-style.
    const tail = parts.slice(-3);
    if (tail.length === 3 && ["co", "com", "org", "net", "gov", "ac"].includes(tail[1])) return tail.join(".");
    return parts.slice(-2).join(".");
  }
  return s.replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Criterion F, out of 3. One mark per requirement, all judged across the
 * complete portfolio of three.
 *
 * With fewer than three commentaries this returns awarded: null. A partial
 * portfolio has no criterion F score, and reporting one would be a fiction.
 */
export function criterionF(commentaries) {
  const list = Array.isArray(commentaries) ? commentaries : [];
  const complete = list.length === 3;

  const units = list.map((c) => c.unit).filter((u) => u !== null && u !== undefined);
  const validUnits = units.filter((u) => [2, 3, 4].includes(Number(u)));
  const unitsDistinct = validUnits.length === 3 && new Set(validUnits.map(Number)).size === 3;

  const sources = list.map((c) => normalizeSource(c.source)).filter(Boolean);
  const sourcesDistinct = sources.length === 3 && new Set(sources).size === 3;

  const recencyChecks = list.map((c) => checkRecency(c.publishedAt, c.writtenAt));
  const recencyAllOk = recencyChecks.length === 3 && recencyChecks.every((r) => r.ok === true);

  const requirements = [
    {
      id: "units", label: "Each article uses a different syllabus unit",
      met: complete ? unitsDistinct : null,
      detail: describeUnits(list),
    },
    {
      id: "sources", label: "Each article comes from a different source",
      met: complete ? sourcesDistinct : null,
      detail: describeSources(list),
    },
    {
      id: "recency", label: "Each article was published within a year of writing",
      met: complete ? recencyAllOk : null,
      detail: recencyChecks.map((r, i) => `Commentary ${i + 1}: ${r.reason}`).join(" "),
    },
  ];

  return {
    complete,
    awarded: complete ? requirements.filter((r) => r.met === true).length : null,
    max: 3,
    requirements,
    note: complete
      ? null
      : `Criterion F is judged across all three commentaries. You have ${list.length} of 3, so it cannot be scored yet.`,
  };
}

function describeUnits(list) {
  if (!list.length) return "No commentaries yet.";
  const named = list.map((c, i) => {
    const u = IA_UNITS.find((x) => x.unit === Number(c.unit));
    return `${i + 1}: ${u ? u.name : "not set"}`;
  });
  const seen = list.map((c) => Number(c.unit)).filter((u) => [2, 3, 4].includes(u));
  const dupes = seen.filter((u, i) => seen.indexOf(u) !== i);
  const missing = IA_UNITS.filter((u) => !seen.includes(u.unit)).map((u) => u.name);
  let extra = "";
  if (dupes.length) extra = ` Two commentaries use the same unit.${missing.length ? ` ${missing.join(" and ")} not covered.` : ""}`;
  return named.join(", ") + "." + extra;
}

function describeSources(list) {
  if (!list.length) return "No commentaries yet.";
  const norm = list.map((c) => normalizeSource(c.source));
  const dupes = norm.filter((s, i) => s && norm.indexOf(s) !== i);
  const labelled = list.map((c, i) => `${i + 1}: ${c.source || "not set"}`).join(", ");
  return labelled + "." + (dupes.length ? ` Duplicate source: ${[...new Set(dupes)].join(", ")}.` : "");
}

/** Key concepts must differ across the portfolio: a repeat scores 0 on criterion D. */
export function checkKeyConcepts(commentaries) {
  const list = Array.isArray(commentaries) ? commentaries : [];
  const used = list.map((c) => c.keyConcept || null);
  const clashes = [];
  used.forEach((concept, i) => {
    if (!concept) return;
    const first = used.indexOf(concept);
    if (first !== i) clashes.push({ index: i, concept, firstUsedIn: first });
  });
  return {
    clashes,
    ok: clashes.length === 0,
    message: clashes.length
      ? `Key concept reused: ${[...new Set(clashes.map((c) => c.concept))].join(", ")}. A repeat scores 0 on criterion D — that is 3 marks per repeat.`
      : "All key concepts are distinct.",
  };
}

/**
 * Portfolio total out of 45.
 * Returns marked/unmarked counts so the UI can say what the number does not
 * yet include, rather than presenting a partial total as if it were final.
 */
export function portfolioTotal(commentaries) {
  const list = Array.isArray(commentaries) ? commentaries : [];
  const f = criterionF(list);
  const kc = checkKeyConcepts(list);

  let commentaryTotal = 0;
  let markedCount = 0;
  for (const c of list) {
    if (!c.marks) continue;
    markedCount += 1;
    const reused = kc.clashes.some((x) => list[x.index] === c);
    for (const id of ["A", "B", "C", "D", "E"]) {
      const raw = Number(c.marks[id] ?? 0);
      commentaryTotal += id === "D" && reused ? 0 : raw;
    }
  }

  return {
    commentaryTotal,
    criterionF: f.awarded,
    total: commentaryTotal + (f.awarded ?? 0),
    max: 45,
    markedCount,
    expectedCount: 3,
    provisional: markedCount < 3 || !f.complete,
    keyConcepts: kc,
    f,
  };
}
