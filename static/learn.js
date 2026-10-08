/* The concepts behind a question, for the guided walkthrough's Learn mode (static/walk.js). Nothing here is written for a question:
   it finds, in the material the app already has, what teaches the idea the question tests.

     the idea      the learning outcome the question tests (by its wording for a case question, by its topic for a Path question)
                   and the paragraph of that outcome's answer closest to the question, with its formula when one fits
     key terms     glossary terms the question and its solution use (longest first, at most three)
     how to think  the module's "how to think" points closest to the question (at most two)
     to keep       the module pitfall closest to the question
     connects      the sentence of the module's connections closest to the question

     Learn.load()       fetches the material (the study path, the outcome cards, the module guides, the glossary); call any time
     Learn.ready()      whether it has arrived
     Learn.get(q, module)   { los, idea, formula, terms, think, pitfall, connect, guide } for a question, or null before load()
         q: the question (id, stem, options, steps, explanation, and los for a case question); module: its module, e.g. "Fixed Income 3" */
(function (root) {
  "use strict";
  let D = null, loading = null;
  const memo = new Map();
  const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  function load() {
    if (loading) return loading;
    loading = Promise.all(["static/study-path.json", "static/los-cards.json", "static/guide-narratives.json", "static/glossary.json"].map(get)).then((all) => prepare(...all));
    return loading;
  }
  function prepare(path, los, guide, gloss) {
    const terms = ((gloss && gloss.terms) || []).filter((t) => !t.see && t.def && String(t.term).length >= 5).map((t) => ({
      term: t.term, def: t.def,
      re: new RegExp("(?:^|[^A-Za-z])" + String(t.term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+") + "(?:s|es)?(?![A-Za-z])", "i"),
    }));
    D = { path: path || {}, los: (los && los.modules) || {}, guide: (guide && guide.modules) || {}, terms };
    return D;
  }

  // how close two pieces of text are: the words they share, over the size of the candidate
  const STOP = new Set(("that this with from which what when where while their there these those than then into onto over under about above below would could should "
    + "have been being were they them your most more less least each every other only also very much many such same both either neither does doing done using used uses "
    + "upon closest correct statement best following because since will shall must might based given whose whom likely least none true false answer option options question "
    + "analyst company firm case").split(" "));
  const stem = (w) => w.replace(/(?:ies|es|s|ing|ed|ly)$/, "");
  const bag = (s) => new Set((String(s || "").toLowerCase().replace(/\\[a-z]+/g, " ").match(/[a-z][a-z-]{3,}/g) || []).filter((w) => !STOP.has(w)).map(stem));
  function score(qb, s) { const b = bag(s); let n = 0; for (const w of b) if (qb.has(w)) n++; return n / Math.sqrt(Math.max(4, b.size)); }
  const shared = (qb, s) => { let n = 0; for (const w of bag(s)) if (qb.has(w)) n++; return n; };
  const ranked = (qb, arr, f) => arr.map((x) => [score(qb, f ? f(x) : x), x]).sort((a, b) => b[0] - a[0]);
  // a long paragraph cut to whole sentences
  function trim(s, max) {
    s = String(s || "").trim();
    if (s.length <= max) return s;
    const cut = s.slice(0, max);
    let at = -1;   // the last sentence end, not the dot of a list number ("4.")
    for (const m of cut.matchAll(/\.(?=\s)/g)) if (!/(?:^|\s)\d+$/.test(cut.slice(0, m.index))) at = m.index;
    return at > max * 0.4 ? cut.slice(0, at + 1) : cut.replace(/\s+\S*$/, "") + "…";
  }
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  function build(q, module) {
    const pq = q.id && D.path.questions ? D.path.questions[q.id] : null;
    module = module || q.module || (pq && pq.module) || "";
    const text = [q.stem, ...Object.values(q.options || {}), ...(q.steps || []), q.explanation].join(" "), qb = bag(text);
    const m = D.los[module], pm = D.path.modules && D.path.modules[module], g = D.guide[module] || {};
    // the learning outcome: by its wording for a case question, else among the outcomes of the question's topic, else the module's
    let cands = [];
    if (m) {
      if (q.los) cands = m.los.filter((l) => norm(l.text) === norm(q.los));
      const topic = pq && pm && pm.topics ? pm.topics[pq.t] : null;
      if (!cands.length && topic) cands = (topic.los || []).map((i) => m.los.find((l) => l.i === i)).filter(Boolean);
      if (!cands.length) cands = m.los;
    }
    const lo = (ranked(qb, cands, (l) => l.text + " " + (l.answer || []).map((a) => a.p).join(" "))[0] || [])[1] || null;
    // its answer opens with the idea; another paragraph only when it is clearly closer to the question
    let idea = "";
    if (lo && (lo.answer || []).length) {
      const ps = lo.answer.map((a) => a.p).filter(Boolean), r = ranked(qb, ps);
      const first = score(qb, ps[0]);
      idea = trim(first >= 0.6 * r[0][0] ? ps[0] : r[0][1], 720);
    }
    const f = lo && (lo.formulas || []).length ? ranked(qb, lo.formulas, (x) => x.name + " " + x.latex)[0] : null;
    const formula = f && f[0] >= 1.2 ? { name: f[1].name, latex: f[1].latex } : null;
    // glossary terms: longest first, none that sits inside one already chosen
    const terms = [];
    for (const t of D.terms.filter((x) => x.re.test(text)).sort((a, b) => b.term.length - a.term.length)) {
      if (terms.length >= 3) break;
      if (terms.some((x) => x.term.toLowerCase().includes(t.term.toLowerCase()))) continue;
      terms.push({ term: t.term, def: trim(t.def, 320) });
    }
    // a point, a pitfall or a connection is shown only when it clearly shares the question's subject (three or more of its words):
    // read against a spread of questions, weaker matches were off the subject about half the time, and none is better than one that misleads
    const close = (x) => x[0] >= 0.8 && shared(qb, x[1]) >= 3;
    const think = ranked(qb, (g.how_to_think || []).map(String)).filter(close).slice(0, 2).map((x) => x[1]);
    // a pitfall that only repeats the question's own trap adds nothing
    const own = bag((q.trap || "") + " " + (q.avoid || ""));
    const echo = (p) => { const b = bag(p); let n = 0; for (const w of b) if (own.has(w)) n++; return own.size > 0 && n >= 0.5 * b.size; };
    const pit = ranked(qb, (g.pitfalls || []).map(String)).filter((x) => close(x) && !echo(x[1]))[0];
    // (cut into sentences without a look-behind, which older phones and tablets cannot read; a sentence that opens with "It" or "Its" has lost its subject)
    const con = ranked(qb, String(g.connections || "").replace(/\.\s+(?=[A-Z])/g, ".\u0001").split("\u0001").filter(Boolean))
      .filter((x) => x[0] >= 1.2 && !/^(?:It|Its|They|Their|This|These)\b/.test(x[1]))[0];
    // the part of the module's guide that teaches the outcome
    let at = null;
    if (lo && pm && pm.topics) { const tp = pm.topics.find((t) => (t.los || []).includes(lo.i)); if (tp && (tp.walk || []).length) at = tp.walk[0]; }
    return {
      los: lo ? lo.text : "", idea, formula, terms, think, pitfall: pit ? pit[1] : "", connect: con ? con[1] : "",
      guide: module && D.guide[module] ? { module, at } : null,
    };
  }
  const api = {
    load, ready: () => !!D,
    get(q, module) {
      if (!D || !q) return null;
      const k = (q.id || q.stem) + "|" + (module || "");
      if (!memo.has(k)) memo.set(k, build(q, module));
      return memo.get(k);
    },
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    api._prepare = prepare;   // for tests: the four data files, already parsed
    api._bag = bag; api._score = score;
  } else {
    root.Learn = api;
    // fetched quietly once the page has settled, so it is there when a walkthrough starts
    const later = () => setTimeout(() => load(), 1500);
    if (document.readyState === "complete") later(); else window.addEventListener("load", later);
  }
})(typeof window !== "undefined" ? window : globalThis);
