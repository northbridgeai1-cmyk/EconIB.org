import { mount, esc } from "../lib/dom.js";
import { data } from "../lib/store.js";

export default async function reference({ view, parts }) {
  const [terms, concepts] = await Promise.all([data.commandTerms(), data.keyConcepts()]);
  const tab = parts[0] === "concepts" ? "concepts" : "terms";

  mount(view, `
    <div class="view-head">
      <h1>Reference</h1>
      <p class="lede">The two things worth knowing cold: what each command term is actually asking for, and which key concept fits which article.</p>
    </div>

    <nav class="nav mt-4" aria-label="Reference sections">
      <a href="#/reference" aria-current="${tab === "terms" ? "page" : "false"}">Command terms</a>
      <a href="#/reference/concepts" aria-current="${tab === "concepts" ? "page" : "false"}">Key concepts</a>
    </nav>

    ${tab === "terms" ? renderTerms(terms) : renderConcepts(concepts)}
  `);
}

function renderTerms(terms) {
  const groups = ["AO1", "AO2", "AO3", "AO4"];
  const names = {
    AO1: "Knowledge and understanding",
    AO2: "Application and analysis",
    AO3: "Synthesis and evaluation",
    AO4: "Use and application of appropriate skills",
  };
  return `
    <div class="note mt-4"><b>The rule that saves marks</b><p>${esc(terms.rule)}</p></div>
    ${groups.map((ao) => `
      <section class="mt-4">
        <h2>${esc(ao)} — ${esc(names[ao])}</h2>
        <div class="card card-tight mt-4">
          ${terms.terms.filter((t) => t.ao === ao).map((t) => `
            <div class="criterion">
              <div class="criterion-head">
                <span class="criterion-name">${esc(t.term)}</span>
                <span class="chip">${esc(t.ao)}</span>
              </div>
              <div class="criterion-body">
                <p>${esc(t.means)}</p>
                <p class="gap"><b>Common trap</b>${esc(t.trap)}</p>
              </div>
            </div>`).join("")}
        </div>
      </section>`).join("")}
    <p class="small mt-4">Command terms and their assessment-objective levels are features of the syllabus; the guidance is EconIB's own.</p>`;
}

function renderConcepts(concepts) {
  return `
    <div class="note note-warn mt-4">
      <b>The three-marks-per-repeat rule</b>
      <p>${esc(concepts.rule)}</p>
    </div>
    ${concepts.concepts.map((c) => `
      <section class="card mt-4">
        <h2>${esc(c.name)}</h2>
        <p class="lede">${esc(c.short)}</p>
        <p>${esc(c.long)}</p>
        <p class="gap"><b>Using it in the IA</b>${esc(c.iaLens)}</p>
        <p class="small">Fits well with topics ${c.pairsWith.map((code) =>
          `<a href="#/lessons/${esc(code)}">${esc(code)}</a>`).join(", ")}</p>
      </section>`).join("")}`;
}
