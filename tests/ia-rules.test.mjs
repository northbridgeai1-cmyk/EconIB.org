import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countWords, wordCountStatus, oneYearBefore, checkRecency,
  normalizeSource, criterionF, checkKeyConcepts, portfolioTotal, IA_WORD_LIMIT,
} from "../public/assets/js/lib/ia-rules.js";

test("countWords ignores punctuation-only tokens and collapses whitespace", () => {
  assert.equal(countWords("The price of rice rose."), 5);
  assert.equal(countWords("  spaced   out \n\n words "), 3);
  assert.equal(countWords("— – * ; :"), 0, "punctuation alone is not a word");
  assert.equal(countWords("cost-push inflation"), 2, "hyphenated words count once");
  assert.equal(countWords("firm's output"), 2);
  assert.equal(countWords(""), 0);
  assert.equal(countWords(null), 0);
});

test("wordCountStatus flags over, near and under the 800 limit", () => {
  assert.equal(wordCountStatus("").state, "empty");
  assert.equal(wordCountStatus("word ".repeat(500)).state, "ok");
  assert.equal(wordCountStatus("word ".repeat(IA_WORD_LIMIT - 10)).state, "near");
  const exact = wordCountStatus("word ".repeat(IA_WORD_LIMIT));
  assert.equal(exact.words, IA_WORD_LIMIT);
  assert.notEqual(exact.state, "over", "exactly 800 is within the limit, not over");
  const over = wordCountStatus("word ".repeat(IA_WORD_LIMIT + 25));
  assert.equal(over.state, "over");
  assert.equal(over.over, 25);
});

test("oneYearBefore handles 29 February without inventing 30 February", () => {
  const leap = oneYearBefore("2024-02-29");
  assert.equal(leap.getUTCMonth(), 1, "still February");
  assert.equal(leap.getUTCDate(), 28, "clamps to 28 Feb, not 1 March");
  const plain = oneYearBefore("2025-06-15");
  assert.equal(plain.getUTCFullYear(), 2024);
  assert.equal(plain.getUTCMonth(), 5);
  assert.equal(plain.getUTCDate(), 15, "must not drift a day in a negative-offset timezone");
});

test("checkRecency accepts exactly one year and rejects a day older", () => {
  const wrote = "2025-06-15";
  assert.equal(checkRecency("2025-06-15", wrote).ok, true, "same day is current");
  assert.equal(checkRecency("2024-06-15", wrote).ok, true, "exactly one year is allowed");
  assert.equal(checkRecency("2024-06-14", wrote).ok, false, "one year and a day is not");
  assert.equal(checkRecency("2025-08-01", wrote).ok, false, "article cannot postdate the commentary");
  assert.equal(checkRecency(null, wrote).ok, null, "missing date is unknown, not a failure");
  assert.equal(checkRecency("not-a-date", wrote).ok, null);
});

test("normalizeSource compares publications, not URLs", () => {
  assert.equal(normalizeSource("https://www.bbc.co.uk/news/business-123"), "bbc.co.uk");
  assert.equal(
    normalizeSource("https://bbc.co.uk/other"),
    normalizeSource("https://www.bbc.co.uk/news/business-123"),
    "same publication, different articles, must collide"
  );
  assert.equal(normalizeSource("https://www.ft.com/content/abc"), "ft.com");
  assert.equal(normalizeSource("https://edition.cnn.com/2025/business"), "cnn.com",
    "a subdomain is the same publication");
  assert.equal(
    normalizeSource("https://news.bbc.co.uk/story"),
    normalizeSource("https://www.bbc.co.uk/other"),
    "news.bbc.co.uk and bbc.co.uk are one source, so using both fails criterion F"
  );
  assert.notEqual(normalizeSource("ft.com"), normalizeSource("bbc.co.uk"));
  assert.equal(normalizeSource("The Economist"), "the economist");
  assert.equal(normalizeSource(""), "");
});

const portfolio = (over = {}) => [
  { unit: 2, source: "https://ft.com/a", publishedAt: "2025-05-01", writtenAt: "2025-06-01", keyConcept: "efficiency" },
  { unit: 3, source: "https://bbc.co.uk/b", publishedAt: "2025-05-10", writtenAt: "2025-06-05", keyConcept: "intervention" },
  { unit: 4, source: "https://reuters.com/c", publishedAt: "2025-05-20", writtenAt: "2025-06-10", keyConcept: "interdependence" },
].map((c, i) => ({ ...c, ...(over[i] || {}) }));

test("criterionF awards 3 for a fully compliant portfolio", () => {
  const f = criterionF(portfolio());
  assert.equal(f.awarded, 3);
  assert.ok(f.requirements.every((r) => r.met === true));
});

test("criterionF is null, not zero, before three commentaries exist", () => {
  const f = criterionF(portfolio().slice(0, 2));
  assert.equal(f.awarded, null, "a partial portfolio has no score, and 0 would be a lie");
  assert.equal(f.complete, false);
  assert.match(f.note, /2 of 3/);
});

test("criterionF docks one mark per failed requirement, independently", () => {
  assert.equal(criterionF(portfolio({ 1: { unit: 2 } })).awarded, 2, "duplicate unit costs one mark");
  assert.equal(criterionF(portfolio({ 1: { source: "https://ft.com/z" } })).awarded, 2, "duplicate source costs one mark");
  assert.equal(criterionF(portfolio({ 2: { publishedAt: "2020-01-01" } })).awarded, 2, "stale article costs one mark");
  const twoBad = criterionF(portfolio({ 1: { unit: 2 }, 2: { source: "https://ft.com/z" } }));
  assert.equal(twoBad.awarded, 1, "two failures cost two marks");
});

test("a repeated key concept is detected and zeroes criterion D for the repeat", () => {
  const clash = portfolio({ 2: { keyConcept: "efficiency" } });
  const kc = checkKeyConcepts(clash);
  assert.equal(kc.ok, false);
  assert.equal(kc.clashes.length, 1);
  assert.equal(kc.clashes[0].index, 2);
  assert.equal(kc.clashes[0].firstUsedIn, 0);

  const marks = { A: 3, B: 2, C: 3, D: 3, E: 3 };
  const withMarks = clash.map((c) => ({ ...c, marks }));
  const total = portfolioTotal(withMarks);
  assert.equal(total.commentaryTotal, 14 + 14 + 11, "the repeat loses its 3 criterion D marks");
  assert.equal(total.total, 14 + 14 + 11 + 3);
});

test("portfolioTotal reaches exactly 45 for a perfect compliant portfolio", () => {
  const marks = { A: 3, B: 2, C: 3, D: 3, E: 3 };
  const total = portfolioTotal(portfolio().map((c) => ({ ...c, marks })));
  assert.equal(total.commentaryTotal, 42);
  assert.equal(total.criterionF, 3);
  assert.equal(total.total, 45);
  assert.equal(total.max, 45);
  assert.equal(total.provisional, false);
});

test("portfolioTotal marks itself provisional while incomplete", () => {
  const marks = { A: 3, B: 2, C: 3, D: 3, E: 3 };
  const partial = portfolioTotal(portfolio().slice(0, 2).map((c) => ({ ...c, marks })));
  assert.equal(partial.provisional, true, "an incomplete total must not read as final");
  assert.equal(partial.criterionF, null);
  assert.equal(partial.markedCount, 2);
});
