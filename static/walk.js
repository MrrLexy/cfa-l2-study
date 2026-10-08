/* Guided walkthrough: an answered question explained out loud, one part at a time, with the page following along. The part being
   read is lit up and the rest dimmed, and each number is picked out as it is spoken, in the vignette as well as in the solution (the
   colours of static/ties.js), with a line under the controls saying where the number came from: a row of an exhibit, a sentence of
   the case, or an earlier step. The voice is the browser's own (speechSynthesis); with no voice, or with the voice off, the same
   walkthrough runs silently at reading pace.

   Two modes. Exam: the question, the answer, each step, why, the trap. Learn (the default): the question, then the idea behind it,
   its key terms and how to think about it (found by static/learn.js in the outcome cards, the module guides and the glossary, and
   shown in the card while it runs), then each step, hidden until you ask for it so you can think first, the answer the steps lead to,
   why and why the other answers tempt, the trap, the idea to keep and how it connects.

     Walk.provide((id) => ({ q, module, t, n, got, root, vig, pane, scroller, render, typeset, redraw }))   the question with that id
         q: the question; module: its module; t: its Ties.build result (or null); n: its number; got: the answer given
         root, vig, pane, scroller: functions returning the question's card, the vignette, the pane that scrolls the vignette and the
         one that scrolls the card (each may return null); render(markdown) -> HTML and typeset(element), for the Learn panels;
         redraw: draws the question again (the walkthrough turns the number marks on)
     Walk.bar(id)       the controls, for the end of an answered question's card ("" when nothing was provided); several can be on a page
     Walk.active(id)    whether the walkthrough is on for that question (the page then draws the number marks even when they are off)
     Walk.sync(id)      call after a draw with the answered question on screen (or null): the walkthrough stops when it changes
     Walk.after(id)     call when a question has just been answered: starts the walkthrough if "start as soon as I answer" is on
     Walk.refresh()     paint the walkthrough again after the page redrew part of itself (it stops when its card is gone)

   What the markup needs: data-seg="ask" on the question, data-seg="s0", "s1", ... on the steps, data-seg="expl" on the explanation,
   data-seg="trap" on the trap, and the class "right" on the right answer. Keys: W starts, pauses or shows the next step; Escape closes. */
(function (root) {
  "use strict";
  const isNode = typeof window === "undefined";
  const S = !isNode && window.speechSynthesis ? window.speechSynthesis : null;
  const canSpeak = !!(S && typeof SpeechSynthesisUtterance !== "undefined");
  const PREF = "site-walk";
  const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const P = { rate: 1, voice: "", talk: true, auto: false, mode: "learn", predict: true };
  try { Object.assign(P, JSON.parse(localStorage.getItem(PREF)) || {}); } catch { /* the defaults */ }
  if (!RATES.includes(+P.rate)) P.rate = 1;
  if (P.mode !== "exam") P.mode = "learn";
  const save = () => { try { localStorage.setItem(PREF, JSON.stringify(P)); } catch { /* kept for this visit only */ } };

  // ------------------------------------------------------------------ what is read out: markdown and TeX turned into speech
  // A tied number travels through the conversion as \uE010 id \uE011 number \uE012, so its place in the spoken text is known.
  const A = "\uE010", B = "\uE011", Z = "\uE012";
  const MARK = /\uE010\d+\uE011[^\uE012]*\uE012/;
  const cleanRaw = (r) => String(r).replace(/\{,\}/g, ",").replace(/\\[,;:! ]|~|\s/g, "").replace(/\\%/g, "%");
  const sentinel = (cls, raw) => { const m = /(?:^|\s)tie-(\d+)(?:\s|$)/.exec(cls); return m ? A + m[1] + B + cleanRaw(raw) + Z : cleanRaw(raw); };
  const GREEK = "alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta kappa lambda mu nu xi pi rho sigma tau phi varphi chi psi omega".split(" ");
  function power(x) {
    x = x.replace(/^\s*[−-]\s*/, "minus ");
    const v = x.replace(/\uE010\d+\uE011|\uE012/g, "").trim();
    if (v === "2") return " squared ";
    if (v === "3") return " cubed ";
    if (v === "+") return " plus ";
    if (v === "-" || v === "−") return " minus ";
    if (v === "*") return " star ";
    if (/^[+−-]+$/.test(v)) return " " + [...v].map((c) => (c === "+" ? "plus" : "minus")).join(" ") + " ";   // p^{+-}: up then down
    return ` to the power ${x}, `;
  }
  function texSpeech(tx) {
    let s = String(tx).replace(/\{,\}/g, ",");
    s = s.replace(/\{\\htmlClass\{([^{}]*)\}\{([^{}]*)\}\}/g, (m, c, raw) => sentinel(c, raw));
    s = s.replace(/\\(?:left|right|[bB]igg?[lr]?)(?![a-zA-Z])\s*(?:\\[{}|]|[()[\]|.])?/g, " ")
      .replace(/\\(?:displaystyle|textstyle|limits|nolimits|underbrace|overbrace)(?![a-zA-Z])/g, " ");
    for (let k = 0; k < 60; k++) {
      const before = s;
      s = s.replace(/\\(?:text|mathrm|textbf|textit|mathit|mathbf|operatorname|mbox|textrm|mathsf|boldsymbol|textsf|emph)\s*\{([^{}]*)\}/g, " $1 ")
        .replace(/\\(?:bar|overline|hat|widehat|tilde|widetilde|vec|underline|mathcal|mathbb)\s*\{([^{}]*)\}/g, " $1 ")
        .replace(/\\sqrt\s*\{([^{}]*)\}/g, " the square root of $1, ")
        .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, " $1, divided by $2, ")
        .replace(/_\s*\{([^{}]*)\}/g, " $1 ")
        .replace(/\^\s*\{([^{}]*)\}/g, (m, x) => power(x));
      if (s === before) s = s.replace(/\{([^{}]*)\}/g, " $1 ");
      if (s === before) break;
    }
    s = s.replace(/_\s*\+/g, " plus ").replace(/_\s*[-−]/g, " minus ").replace(/_\s*(\\?[A-Za-z0-9])/g, " $1 ")
      .replace(/\^\s*(\uE010\d+\uE011[^\uE012]*\uE012|[+*−-](?![\d\uE010])|-?\\?[A-Za-z0-9])/g, (m, x) => power(x))
      .replace(/\\(?:times|cdot|ast)(?![a-zA-Z])/g, " times ")
      .replace(/\\div(?![a-zA-Z])/g, " divided by ")
      .replace(/\\pm(?![a-zA-Z])/g, " plus or minus ")
      .replace(/\\(?:approx|simeq|sim)(?![a-zA-Z])/g, " is about ")
      .replace(/\\(?:neq|ne)(?![a-zA-Z])/g, " is not equal to ")
      .replace(/\\(?:geq|ge|geqslant)(?![a-zA-Z])/g, " is at least ")
      .replace(/\\(?:leq|le|leqslant)(?![a-zA-Z])/g, " is at most ")
      .replace(/\\(?:Rightarrow|implies|therefore|Longrightarrow)(?![a-zA-Z])/g, ", so ")
      .replace(/\\(?:to|rightarrow|longrightarrow)(?![a-zA-Z])/g, " to ")
      .replace(/\\%/g, "%").replace(/\\\$/g, "$").replace(/\\&/g, " and ")
      .replace(/\\Delta(?![a-zA-Z])/g, " change in ")
      .replace(/\\sum(?![a-zA-Z])/g, " the sum of ").replace(/\\prod(?![a-zA-Z])/g, " the product of ")
      .replace(/\\ln(?![a-zA-Z])/g, " the natural log of ").replace(/\\log(?![a-zA-Z])/g, " the log of ").replace(/\\exp(?![a-zA-Z])/g, " e to the ")
      .replace(/\\max(?![a-zA-Z])/g, " the larger of ").replace(/\\min(?![a-zA-Z])/g, " the smaller of ")
      .replace(/\\infty(?![a-zA-Z])/g, " infinity ")
      .replace(new RegExp("\\\\(" + GREEK.join("|") + ")(?![a-zA-Z])", "g"), (m, g) => " " + g.replace(/^var/, "") + " ")
      .replace(/\\\\/g, ", ").replace(/&/g, " ").replace(/\\[,;:! ]|\\q?quad(?![a-zA-Z])|~/g, " ")
      .replace(/\\[a-zA-Z]+/g, " ").replace(/\\./g, " ")
      .replace(/=/g, " equals ").replace(/</g, " is less than ").replace(/>/g, " is greater than ")
      .replace(/\+/g, " plus ").replace(/\//g, " divided by ")
      .replace(/(^|[\s\d()[\]\uE012])[-−](?=\s|[\d(.[\uE010]|$)/g, "$1 minus ")
      .replace(/^\s*[-−]/, " minus ")
      .replace(/[()[\]{}|]/g, " ");
    return " " + s + " ";
  }
  function textSpeech(s) {
    return String(s).split("\n").map((l) => {
      if (/^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes("-")) return "";                                 // a table's rule
      if (/^\s*\|/.test(l)) return l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()).filter(Boolean).join(", ") + ".";
      l = l.replace(/^\s*#{1,6}\s+/, "").replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim();
      l = l.replace(OPT, "Option $2");                                                                     // "A is wrong" is not "a is wrong"
      if (l && !/[.!?:;,]["')\]*_]*$/.test(l.replace(new RegExp(MARK.source + "$"), "x."))) l += ".";
      return l;
    }).join(" ")
      .replace(/\*\*|__|`/g, "").replace(/(^|[^\w])[*_]([^*_\n]+)[*_](?!\w)/g, "$1$2")
      .replace(/\bvs\.?(?=\s)/gi, "versus").replace(/\be\.g\.,?/gi, "for example,").replace(/\bi\.e\.,?/gi, "that is,").replace(/\betc\./gi, "and so on.")
      .replace(/\\(bar|hat)\s*\{?([A-Za-z])\}?/g, "$2 $1").replace(/\\([A-Za-z]{2,})/g, " $1 ")      // TeX written into plain text: \bar x, \sigma
      .replace(/±/g, " plus or minus ").replace(/√/g, " the square root of ").replace(/·/g, " times ")
      .replace(/×/g, " times ").replace(/÷/g, " divided by ").replace(/≈/g, " about ").replace(/[→⇒]/g, ", which gives ")
      .replace(/²/g, " squared").replace(/³/g, " cubed").replace(/Δ\s?/g, "change in ")
      .replace(/≥/g, " at least ").replace(/≤/g, " at most ").replace(/≠/g, " not equal to ")
      .replace(/\\([%$&#])/g, "$1").replace(/\|([^|\n]{1,24})\|/g, " the absolute value of $1 ")           // "10.0\%" in plain text; |b1|
      .replace(/\s>\s/g, " greater than ").replace(/\s<\s/g, " less than ")
      .replace(/(^|[\s(])[−–-](?=\s?[\d$\uE010])/g, "$1minus ").replace(/\s[–—]\s|—/g, ", ")
      .replace(/([\d\uE012])\s?bps?\b/gi, "$1 basis points").replace(/([\d\uE012])x\b/g, "$1 times")
      // formulas written as plain text: t_c, e^(−γT), 1.03^(4/12), F = S(1 + i)
      .replace(/\^\{([^{}]*)\}/g, (m, x) => power(x)).replace(/_\{([^{}]*)\}/g, " $1 ")
      .replace(/([\p{L}\p{N})])_\(([\p{L}\p{N},+−-]+)\)/gu, "$1 $2 ")   // a bracket is taken only as a pair, so "(r_f − r_d)" keeps its own
      .replace(/([\p{L}\p{N})])_([\p{L}\p{N},+−-]+?)(?=[^\p{L}\p{N}]|[\p{Lu}]|$)/gu, "$1 $2 ").replace(/([\p{L}\p{N})])_([\p{L}\p{N},+−-]+)/gu, "$1 $2").replace(/\^\(([^()]*)\)/g, (m, x) => power(x))
      .replace(/\^\(((?:[^()]|\([^()]*\))*)\)/g, (m, x) => power(x))                                    // one bracket inside the power: e^((r_f − r_d) × T)
      .replace(/\^\*/g, " star")
      .replace(/\^([+−-]?[\p{L}\p{N}.]+|[+−-])/gu, (m, x) => power(x.replace(/^[−-](?=.)/, "minus ")))
      .replace(/(^|\s)=\s/g, "$1equals ").replace(/\s\+\s/g, " plus ").replace(/\s−\s/g, " minus ").replace(/\s\/\s|([\d)\]\uE012])\/(?=[\d([\uE010])/g, "$1 divided by ")
      .replace(/[{}]/g, " ");
  }
  const OPT = /^(\*\*|__)?([ABC])\1?(?=\s*[:.)]|\s+(?:is|was|would|gets|uses|confuses|ignores|forgets|treats|takes|divides|multiplies|adds|subtracts|applies|reverses|omits|misses|assumes|mixes|leaves|counts|computes|reads|states|has|picks|chooses|doubles|halves|annualizes|discounts|compounds|includes|excludes|drops|swaps|stops|subtracts|nets|scales|rounds|misreads|misapplies|overstates|understates)\b)/;
  const MATH = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$/g;
  // formulas stand aside as \u0001n\u0002 while the text round them is read (the placeholder the pages use, which ties.js skips)
  function speech(src, t) {
    const slots = [];
    const s = String(src ?? "").replace(/\r\n?/g, "\n").replace(MATH, (m, d, i, dd) => {
      const tx = d !== undefined ? d : i !== undefined ? i : dd;
      slots.push(texSpeech(t ? t.tex(tx, false) : tx) + (i === undefined ? ". " : ""));
      return `\u0001${slots.length - 1}\u0002`;
    });
    return textSpeech(t ? t.text(s, false, sentinel) : s).replace(/\u0001(\d+)\u0002/g, (m, k) => slots[+k]);
  }
  // the spoken text with its number marks taken out and remembered by position, cut into sentences
  function finish(str) {
    const s = String(str).replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").replace(/([,;:])(?:\s*[,;:])+/g, "$1")
      .replace(/[,;:]\s*\./g, ".").replace(/\.(?:\s*\.)+/g, ".").replace(/^[\s,.;:]+/, "").trim();
    let text = "";
    const marks = [];
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== A) { text += s[i]; continue; }
      const b = s.indexOf(B, i), z = s.indexOf(Z, b);
      if (b < 0 || z < 0) continue;
      const id = +s.slice(i + 1, b), raw = s.slice(b + 1, z);
      marks.push({ id, s: text.length, e: text.length + raw.length, raw });
      text += raw; i = z;
    }
    const chunks = [];
    let from = 0;
    const cut = (to) => {
      while (to - from > 230) {   // long sentences go in pieces: some voices stop after fifteen seconds or so
        const at = text.lastIndexOf(", ", from + 220);
        if (at <= from + 60) break;
        chunks.push({ s: from, e: at + 1 }); from = at + 2;
      }
      if (text.slice(from, to).trim()) chunks.push({ s: from, e: to });
      from = to;
    };
    const re = /[.!?;](?=\s)/g;
    let m;
    while ((m = re.exec(text))) if (m.index + 1 - from >= 24) cut(m.index + 2);
    cut(text.length);
    return { text, marks, chunks };
  }
  const REF = /\s*\((?:[^()]*\bLM\s*\d[^()]*)\)\s*$/;
  // the parts read out, in order. Exam: the question, the answer, the steps, why, the trap. Learn: the question, the idea behind it,
  // its key terms and how to think about it, then the steps (each one a moment to think first), the answer they lead to, why and
  // why the other answers tempt, the trap, the idea to keep and how it connects.
  function build(cfg, mode) {
    const { q, t, n, got } = cfg, L = cfg.learn || null, learn = mode === "learn", segs = [];
    const add = (kind, label, sel, prefix, src, tt) => { const f = finish(prefix + " " + speech(src, tt === undefined ? t : tt)); if (f.text) segs.push({ kind, label, sel, ...f }); };
    const at = (k) => `[data-seg="${k}"]`;
    const ans = () => add("ans", "The answer", ".opt.right, .p-opt.right",
      (got && got !== "-" && got !== q.answer ? `You chose option ${got}. ` : "") + `${learn ? "So the answer is" : "The answer is"} option ${q.answer}:`, (q.options || {})[q.answer] || "");
    add("ask", "The question", at("ask"), n ? `Question ${n}.` : "The question.", q.stem);
    if (!learn) ans();
    if (learn && L) {
      if (L.idea) add("idea", "The idea", at("l-idea"), "The idea behind it.", L.idea + (L.formula ? `\n\nThe formula, ${L.formula.name}: \\[ ${L.formula.latex} \\]` : ""), null);
      if (L.terms.length) add("terms", "Key terms", at("l-terms"), "Key terms.", L.terms.map((x) => `${x.term}: ${x.def}`).join("\n"), null);
      if (L.think.length) add("think", "How to think", at("l-think"), "How to think about it.", L.think.join("\n"), null);
    }
    (q.steps || []).forEach((x, i) => add("step", `Step ${i + 1}`, at("s" + i), `Step ${i + 1}.`, x));
    if (learn) ans();
    if (q.explanation) add("expl", learn ? "Why, and the traps" : "Why", at("expl"), learn ? "Why it works, and why the other answers are tempting." : "Why.", String(q.explanation).replace(REF, ""));
    if (q.trap) add("trap", "The trap", at("trap"), "The trap.", q.trap + (q.avoid ? "\n\nHow to avoid it: " + q.avoid : ""));
    if (learn && L && L.pitfall) add("keep", "The idea to keep", at("l-keep"), "The idea to keep.", L.pitfall, null);
    if (learn && L && L.connect) add("connect", "How it connects", at("l-connect"), "How it connects.", L.connect, null);
    return segs;
  }
  // Learn mode's own material, shown in the card while the walkthrough runs: above the steps, and after the solution
  const cap1 = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  function guideHref(g) { return ((window.Site && Site.links && Site.links.map) || "app.html") + "#" + new URLSearchParams({ g: g.module, ...(g.at !== null && g.at !== undefined ? { at: "gw" + g.at } : {}) }).toString(); }
  function panels(cfg, L) {
    const r = (s) => (cfg.render ? cfg.render(s) : `<p>${esc(s)}</p>`);
    const top = [
      L.idea ? `<div class="wk-l" data-seg="l-idea"><span class="eyebrow">The idea</span>${L.los ? `<p class="wk-los">Learning outcome: ${esc(cap1(L.los))}</p>` : ""}${r(L.idea)}
        ${L.formula ? `<div class="wk-f"><b>${esc(L.formula.name)}</b>${r("\\[ " + L.formula.latex + " \\]")}</div>` : ""}
        ${L.guide ? `<a class="wk-more" href="${esc(guideHref(L.guide))}">The full explanation, in the Guide ›</a>` : ""}</div>` : "",
      L.terms.length ? `<div class="wk-l" data-seg="l-terms"><span class="eyebrow">Key terms</span><dl>${L.terms.map((x) => `<dt>${esc(x.term)}</dt><dd>${r(x.def)}</dd>`).join("")}</dl></div>` : "",
      L.think.length ? `<div class="wk-l" data-seg="l-think"><span class="eyebrow">How to think about it</span><ul>${L.think.map((x) => `<li>${r(x)}</li>`).join("")}</ul></div>` : "",
    ].join("");
    const bottom = [
      L.pitfall ? `<div class="wk-l" data-seg="l-keep"><span class="eyebrow">The idea to keep</span>${r(L.pitfall)}</div>` : "",
      L.connect ? `<div class="wk-l" data-seg="l-connect"><span class="eyebrow">How it connects</span>${r(L.connect)}</div>` : "",
    ].join("");
    return { top, bottom };
  }

  // ------------------------------------------------------------------ the player
  let provider = null, W = null, menuId = null, lastId = null, pending = 0;
  let voices = [];
  const loadVoices = () => { if (canSpeak) voices = S.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang)); };
  const JUNK = /compact|espeak|novelty|whisper|bad news|good news|bells|boing|bubbles|cellos|deranged|hysterical|organ|trinoids|zarvox|albert|bahh|jester|superstar|wobble|grandma|grandpa|rocko|shelley|flo|eddy|reed|sandy/i;
  const score = (v) => (/natural|neural|premium|enhanced|siri/i.test(v.name) ? 4 : 0) + (/google|samantha|daniel|karen|moira|serena|ava|allison|aria|jenny|guy/i.test(v.name) ? 2 : 0)
    + (/^en[-_]US/i.test(v.lang) ? 1 : 0) + (v.localService ? 1 : 0) - (JUNK.test(v.name) ? 10 : 0);
  function voice() {
    if (!voices.length) loadVoices();
    return voices.find((v) => v.voiceURI === P.voice) || voices.slice().sort((a, b) => score(b) - score(a))[0] || null;
  }
  if (canSpeak) { loadVoices(); try { S.addEventListener("voiceschanged", () => { loadVoices(); if (menuId) paintMenu(); }); } catch { /* old browsers: the list is read when needed */ } }

  const talking = () => P.talk && canSpeak && !(W && W.silent);
  const el = (k) => (W && W.cfg[k] ? W.cfg[k]() : null);
  const cssId = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&"));
  const barOf = (id) => (id ? document.querySelector(`.wkbar[data-wk-id="${cssId(id)}"]`) : null);
  function clear() {
    if (!W) return;
    W.tok++;
    W.timers.forEach(clearTimeout); W.timers = [];
    if (canSpeak && (S.speaking || S.pending)) S.cancel();
  }
  function unlock() { if (talking()) { try { S.cancel(); const u = new SpeechSynthesisUtterance(" "); u.volume = 0; S.speak(u); } catch { /* lets iOS speak later */ } } }
  function start(id) {
    unlock();   // while the click that asked for it is still being handled
    if (P.mode === "learn" && window.Learn && !Learn.ready()) {
      const ask = ++pending, bar = barOf(id), b = bar && bar.querySelector('[data-wk="start"]');
      if (b) { b.disabled = true; b.lastChild.textContent = "Getting the concepts…"; }
      Learn.load().then(() => { if (ask === pending) start(id); });
      return;
    }
    const cfg = provider && provider(id);
    if (!cfg || !cfg.q) return;
    if (W) stop(true);
    const learn = P.mode === "learn" ? (cfg.learn !== undefined ? cfg.learn : window.Learn ? Learn.get(cfg.q, cfg.module) : null) : null;
    const c = { ...cfg, learn };
    W = { id, cfg: c, mode: P.mode, html: learn ? panels(c, learn) : null, segs: build(c, P.mode), i: 0, c: 0, state: "play", now: null, tok: 0, timers: [], silent: false, shown: new Set() };
    if (!W.segs.length) { W = null; return; }
    lastId = id;
    if (cfg.redraw) cfg.redraw();
    run(0, 0);
  }
  function stop(quiet) {
    if (!W) return;
    clear();
    const was = W;
    W = null;
    unpaint(was);
    if (!quiet && was.cfg.redraw) was.cfg.redraw();
  }
  const thinking = (k) => W.mode === "learn" && P.predict && W.segs[k].kind === "step" && !W.shown.has(k);
  function run(i, c, show) {
    clear();
    W.i = Math.max(0, Math.min(i, W.segs.length - 1)); W.c = c || 0; W.now = null;
    if (!show && thinking(W.i)) {   // think first: the step stays hidden until you ask for it
      W.state = "think";
      paint(true);
      if (talking()) {
        const first = !W.segs.slice(0, W.i).some((s) => s.kind === "step");
        const u = new SpeechSynthesisUtterance(first ? "Before the first step: how would you start? Think it through, then show it." : "What comes next? Think it through, then show it.");
        u.rate = P.rate; const v = voice(); if (v) { u.voice = v; u.lang = v.lang; }
        const tok = W.tok;
        W.timers.push(setTimeout(() => { if (W && tok === W.tok) { W.u = u; S.speak(u); } }, 80));
      }
      return;
    }
    W.shown.add(W.i);
    W.state = "play";
    paint(true);
    const tok = W.tok;
    W.timers.push(setTimeout(() => { if (W && tok === W.tok) chunk(); }, 80));
  }
  function chunk() {
    if (!el("root")) return stop(true);   // the question is no longer on the page
    const tok = W.tok, seg = W.segs[W.i], ch = seg.chunks[W.c];
    if (!ch) return onward();
    const cps = 14.5 * P.rate;
    const marks = seg.marks.filter((m) => m.s >= ch.s && m.s < ch.e);
    let real = false, done = false;
    const guess = [];
    marks.forEach((m) => guess.push(setTimeout(() => { if (W && tok === W.tok && !real) now(m.id); }, ((m.s - ch.s) / cps) * 1000 + (talking() ? 250 : 0))));
    W.timers.push(...guess);
    const next = () => {
      if (done || !W || tok !== W.tok) return;
      done = true;
      W.c++;
      if (W.c < seg.chunks.length) chunk();
      else W.timers.push(setTimeout(() => { if (W && tok === W.tok) onward(); }, 500));
    };
    const quietly = () => W.timers.push(setTimeout(next, ((ch.e - ch.s) / cps) * 1000 + 300));
    if (!talking()) return quietly();
    const u = new SpeechSynthesisUtterance(seg.text.slice(ch.s, ch.e));
    u.rate = P.rate;
    const v = voice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
    let began = false;
    u.onstart = () => { began = true; };
    u.onboundary = (e) => {
      if (!W || tok !== W.tok || e.name === "sentence") return;
      if (!real) { real = true; guess.forEach(clearTimeout); }
      const at = ch.s + e.charIndex, m = seg.marks.find((x) => at >= x.s - 1 && at < x.e);
      if (m) now(m.id);
    };
    u.onend = next;
    u.onerror = (e) => { if (W && tok === W.tok && e.error !== "interrupted" && e.error !== "canceled") { W.silent = true; paintBar(); quietly(); } };
    W.u = u;   // held, or some browsers drop its events
    if (S.paused) S.resume();
    S.speak(u);
    // no voice at all (some Linux browsers): carry on silently; and a voice that never says it finished does not stall the walk
    W.timers.push(setTimeout(() => { if (W && tok === W.tok && !began && !done) { S.cancel(); W.silent = true; paintBar(); quietly(); } }, 3000));
    W.timers.push(setTimeout(() => { if (W && tok === W.tok && !done) next(); }, ((ch.e - ch.s) / (cps * 0.4)) * 1000 + 6000));
  }
  function onward() {
    if (W.i < W.segs.length - 1) return run(W.i + 1, 0);
    clear(); W.state = "done"; W.now = null; paint(false);
  }
  function pause() { if (!W || W.state !== "play") return; clear(); W.state = "pause"; paintBar(); }
  function resume() {
    if (!W) return;
    if (W.state === "done") { W.shown = new Set(); return run(0, 0); }
    if (W.state === "think") return run(W.i, 0, true);
    clear(); W.state = "play"; paintBar();
    const tok = W.tok;
    W.timers.push(setTimeout(() => { if (W && tok === W.tok) chunk(); }, 80));
  }
  function now(id) {
    if (!W || W.now === id) return;
    W.now = id;
    markNow(true);
    paintCap();
  }

  // ------------------------------------------------------------------ what the page shows
  function into(target, box, pad) {
    if (!target) return;
    const r = target.getBoundingClientRect();
    const scrolls = box && box.scrollHeight > box.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(box).overflowY);
    const bar = W && barOf(W.id), under = bar ? bar.offsetHeight + 12 : 0;
    if (scrolls) {
      const b = box.getBoundingClientRect();
      if (r.top < b.top + 8 || r.bottom > b.bottom - (pad ? under : 8)) box.scrollBy({ top: r.top - b.top - (pad ? 56 : b.height / 2 - r.height / 2), behavior: "smooth" });
    } else if (pad && (r.top < 64 || r.bottom > window.innerHeight - under)) {
      window.scrollBy({ top: r.top - Math.min(140, window.innerHeight * 0.25), behavior: "smooth" });
    }
  }
  // Learn mode's panels go in above the steps (or the explanation) and just before the controls; a redraw of the card drops them,
  // so they are put back whenever the walkthrough paints
  function ensurePanels(card) {
    if (!W.html) return;
    const add = (where, html, before) => {
      if (!html || card.querySelector(`[data-wk-panel="${where}"]`)) return;
      const box = document.createElement("section");
      box.className = "wk-learn"; box.dataset.wkPanel = where; box.innerHTML = html;
      if (before && before.parentNode) before.parentNode.insertBefore(box, before); else card.appendChild(box);
      if (W.cfg.typeset) W.cfg.typeset(box);
    };
    const s0 = card.querySelector('[data-seg="s0"]');
    add("top", W.html.top, (s0 && (s0.closest(".walk, .p-walk") || s0.parentElement)) || card.querySelector('[data-seg="expl"]') || barOf(W.id));
    const bar = barOf(W.id);
    add("bottom", W.html.bottom, bar && card.contains(bar) ? bar : null);
  }
  function unpaint(w) {
    const card = w.cfg.root && w.cfg.root(), vig = w.cfg.vig && w.cfg.vig();
    for (const x of [card, vig]) if (x) { x.classList.remove("wk-run"); x.querySelectorAll(".wk-on, .wk-now, .wk-veil").forEach((y) => y.classList.remove("wk-on", "wk-now", "wk-veil")); }
    if (card) card.querySelectorAll("[data-wk-panel]").forEach((x) => x.remove());
    if (window.Ties) Ties.focus([card, vig], null);
    const bar = barOf(w.id);
    if (bar) { bar.classList.remove("on"); bar.innerHTML = inner(w.id); }
  }
  function paint(scroll) {
    if (!W) return;
    const card = el("root"), vig = el("vig");
    if (!card) return stop(true);
    ensurePanels(card);
    const live = W.state !== "done", seg = W.segs[W.i];
    card.classList.toggle("wk-run", live);
    card.querySelectorAll(".wk-on").forEach((x) => x.classList.remove("wk-on"));
    const part = live ? card.querySelector(seg.sel) : null;
    if (part) part.classList.add("wk-on");
    // think first: the steps not reached yet, and the explanation that would give them away, stay blurred
    const veil = live && W.mode === "learn" && P.predict;
    W.segs.forEach((s, k) => {
      if (s.kind !== "step" && s.kind !== "expl") return;
      const x = card.querySelector(s.sel);
      if (x) x.classList.toggle("wk-veil", veil && !W.shown.has(k) && (k > W.i || (k === W.i && W.state === "think")));
    });
    const ids = live && W.state !== "think" ? [...new Set(seg.marks.map((m) => m.id))] : [];
    if (window.Ties) Ties.focus([card, vig], ids.length ? ids : null);
    markNow(scroll);
    if (scroll && part) into(part, el("scroller"), true);
    if (scroll && ids.length && vig) {   // the first number the case gives for this part, in view in the vignette
      const first = ids.map((k) => vig.querySelector(".tie-" + k)).find(Boolean);
      if (first) into(first, el("pane"), false);
    }
    paintBar();
  }
  function markNow(scroll) {
    const card = el("root"), vig = el("vig");
    for (const x of [card, vig]) if (x) x.querySelectorAll(".wk-now").forEach((y) => y.classList.remove("wk-now"));
    if (!W || W.now === null || W.state === "done") return;
    for (const x of [card, vig]) if (x) x.querySelectorAll(".tie-" + W.now).forEach((y) => { y.classList.add("on", "wk-now"); });
    if (scroll && vig) { const v = vig.querySelector(".tie-" + W.now); if (v) into(v, el("pane"), false); }
  }
  // under the controls: the prompt while you think, or where the number being read comes from (a row of an exhibit, a sentence
  // of the case, the question, or an earlier step)
  function caption() {
    if (!W || W.state === "done") return "";
    if (W.state === "think") {
      const first = !W.segs.slice(0, W.i).some((s) => s.kind === "step");
      return `<span class="wkthink">${first ? "Before the first step: how would you start?" : "What comes next?"}</span> <span class="src">Think it through, then press Show (or W). Clicking the step shows it too.</span>`;
    }
    if (W.now === null) return "";
    const card = el("root"), vig = el("vig"), id = W.now;
    const inVig = vig && vig.querySelector(".tie-" + id), any = inVig || (card && card.querySelector(".tie-" + id));
    if (!any) return "";
    const chip = `<mark class="${esc((any.getAttribute("class") || "").replace(/\b(?:on|wk-now)\b/g, "").trim())}">${esc(any.textContent)}</mark>`;
    if (inVig) {
      const td = inVig.closest("td, th");
      if (td) {
        const tr = td.parentElement, table = td.closest("table"), head = table && table.tHead && table.tHead.rows[0];
        const col = head && head.cells[td.cellIndex] ? head.cells[td.cellIndex].textContent.trim() : "";
        const row = tr.cells[0] && tr.cells[0] !== td ? tr.cells[0].textContent.trim() : "";
        const wrap = table.closest(".table-wrap"), cap = wrap && wrap.previousElementSibling && wrap.previousElementSibling.classList.contains("cap") ? wrap.previousElementSibling.textContent.trim() : "";
        return `${chip} <span class="src">is in the case${cap ? `, ${esc(cap)}` : ""}: ${esc([row, col].filter(Boolean).join(" · ") || "a table")}</span>`;
      }
      const blk = inVig.closest("li, p") || inVig.parentElement, txt = blk.textContent.replace(/\s+/g, " ").trim();
      const at = Math.max(0, txt.indexOf(inVig.textContent));
      let a = Math.max(0, at - 80), b = Math.min(txt.length, at + inVig.textContent.length + 80);
      if (a > 0) a = txt.indexOf(" ", a) + 1;
      if (b < txt.length) b = Math.max(at + inVig.textContent.length, txt.lastIndexOf(" ", b));
      return `${chip} <span class="src">is in the case: “${a > 0 ? "…" : ""}${esc(txt.slice(a, b))}${b < txt.length ? "…" : ""}”</span>`;
    }
    const k = W.segs.findIndex((s) => { const x = card && card.querySelector(s.sel); return x && x.querySelector(".tie-" + id); });
    const what = k < 0 ? "" : W.segs[k].kind === "ask" ? "is given in the question" : k < W.i ? `was worked out in ${W.segs[k].label.toLowerCase()}` : k === W.i ? "is worked out here" : "";
    return what ? `${chip} <span class="src">${esc(what)}</span>` : "";
  }
  const ICON = {
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5v11l9-5.5z"/></svg>',
    pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>',
    prev: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h2v11H3zM13.5 2.5v11L6 8z"/></svg>',
    next: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 2.5h2v11h-2zM2.5 2.5v11L10 8z"/></svg>',
    voice: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3.5v11L5 10H2z"/><path d="M11 5.2a4 4 0 0 1 0 5.6M12.8 3.5a6.4 6.4 0 0 1 0 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    mute: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3.5v11L5 10H2z"/><path d="M11 5.5l4 5m0-5l-4 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    gear: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.6 1h2.8l.4 1.9 1.3.6 1.7-1 2 2-1 1.7.6 1.3 1.9.4v2.8l-1.9.4-.6 1.3 1 1.7-2 2-1.7-1-1.3.6-.4 1.9H6.6l-.4-1.9-1.3-.6-1.7 1-2-2 1-1.7-.6-1.3L0 9.4V6.6l1.9-.4.6-1.3-1-1.7 2-2 1.7 1 1.3-.6zM8 5.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z"/></svg>',
    again: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5a5.5 5.5 0 1 1-5.2 3.7l1.9.6A3.5 3.5 0 1 0 8 4.5v2L4.5 3.5 8 .5z"/></svg>',
  };
  const modeSwitch = () => `<span class="wkmode" role="group" aria-label="Walkthrough mode">
      <button type="button" data-wk="mode" data-m="learn" aria-pressed="${P.mode === "learn"}" title="The idea behind the question, then each step with a moment to think first, the traps and how it connects">Learn</button>
      <button type="button" data-wk="mode" data-m="exam" aria-pressed="${P.mode === "exam"}" title="The question, the answer and the steps, quickly">Exam</button></span>`;
  function inner(id) {
    const open = menuId === id;
    const gear = `<button type="button" class="wkb" data-wk="menu" aria-expanded="${open}" title="Voice, speed and options" aria-label="Walkthrough settings">${ICON.gear}</button>`;
    const menuBox = `<div class="wkmenu" ${open ? "" : "hidden"}>${open ? menuHTML() : ""}</div>`;
    if (!W || W.id !== id) {
      const what = P.mode === "learn" ? "The idea behind it first, then each step with a moment to think, the traps and how it connects." : "The question, the answer and each step, with every number traced to where it comes from.";
      return `<div class="wkrow"><button type="button" class="btn primary sm wkgo" data-wk="start">${ICON.play}<span>Walk me through it</span></button>${modeSwitch()}
        <span class="wkhint">${esc(what)} ${canSpeak && P.talk ? "Read aloud. " : ""}Key: W</span>${gear}</div>${menuBox}`;
    }
    const st = W.state, seg = W.segs[W.i];
    const dots = W.segs.map((s, k) => `<button type="button" class="wkdot${k < W.i || st === "done" ? " past" : ""}${k === W.i && st !== "done" ? " cur" : ""}" data-wk="go" data-i="${k}" title="${esc(s.label)}" aria-label="Go to: ${esc(s.label)}"></button>`).join("");
    const main = st === "think"
      ? `<button type="button" class="wkb main wide" data-wk="show" aria-label="Show the step">Show ${esc(seg.label.toLowerCase())}</button>`
      : `<button type="button" class="wkb main" data-wk="${st === "play" ? "pause" : "play"}" aria-label="${st === "play" ? "Pause" : st === "done" ? "Play again" : "Play"}">${st === "play" ? ICON.pause : st === "done" ? ICON.again : ICON.play}</button>`;
    const c = caption();
    return `<div class="wkrow" role="group" aria-label="Walkthrough controls">
        <button type="button" class="wkb" data-wk="prev" ${W.i && st !== "done" ? "" : "disabled"} aria-label="Previous part">${ICON.prev}</button>${main}
        <button type="button" class="wkb" data-wk="next" ${W.i < W.segs.length - 1 && st !== "done" ? "" : "disabled"} aria-label="Next part">${ICON.next}</button>
        ${modeSwitch()}<span class="grow"></span>
        <button type="button" class="wkb txt" data-wk="rate" title="Speed: click to change">${P.rate}×</button>
        ${canSpeak ? `<button type="button" class="wkb" data-wk="talk" aria-pressed="${P.talk}" title="${P.talk ? "Turn the voice off (it keeps going silently)" : "Read it aloud"}" aria-label="Voice">${P.talk ? ICON.voice : ICON.mute}</button>` : ""}
        ${gear}<button type="button" class="wkb" data-wk="stop" aria-label="Close the walkthrough" title="Close (Esc)">✕</button></div>
      <div class="wkrow2"><span class="wklab" aria-live="polite"><b>${st === "done" ? "Finished" : esc(seg.label)}</b>${st === "pause" ? ' <span class="muted">paused</span>' : ""}${W.silent && P.talk && st !== "done" ? ' <span class="muted">· silent: no voice here</span>' : ""}</span>
        <span class="wkdots" aria-label="Part ${W.i + 1} of ${W.segs.length}">${dots}</span></div>
      <div class="wkcap" ${c ? "" : "hidden"}>${c}</div>${menuBox}`;
  }
  function menuHTML() {
    const opts = `<label><input type="checkbox" data-wk-set="predict" ${P.predict ? "checked" : ""}> Learn mode: think first (each step stays hidden until you ask for it)</label>
      <label><input type="checkbox" data-wk-set="auto" ${P.auto ? "checked" : ""}> Start the walkthrough as soon as I answer</label>`;
    if (!canSpeak) return `<p class="wkhint">This browser has no voice to read with, so the walkthrough runs silently at reading pace.</p>${opts}`;
    if (!voices.length) loadVoices();
    const v = voice();
    const list = voices.slice().sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
    return `<label>Voice <select data-wk-set="voice">${list.map((x) => `<option value="${esc(x.voiceURI)}" ${v && x.voiceURI === v.voiceURI ? "selected" : ""}>${esc(x.name)} (${esc(x.lang)})</option>`).join("") || "<option>The browser's default</option>"}</select>
        <button type="button" class="wkb txt" data-wk="test">Try it</button></label>
      <label>Speed <select data-wk-set="rate">${RATES.map((r) => `<option value="${r}" ${r === +P.rate ? "selected" : ""}>${r}×</option>`).join("")}</select></label>
      <label><input type="checkbox" data-wk-set="talk" ${P.talk ? "checked" : ""}> Read it aloud (off: the same walkthrough, silently)</label>${opts}
      <p class="wkhint">Voices come with your device. Most devices can add more natural ones in their accessibility or speech settings (look for Spoken Content or Text-to-speech).</p>`;
  }
  function paintBar(id) {
    const bars = id || !W ? [barOf(id)] : [barOf(W.id)];
    for (const bar of bars) if (bar) { bar.classList.toggle("on", !!(W && W.id === bar.dataset.wkId)); bar.innerHTML = inner(bar.dataset.wkId); }
  }
  const paintAll = () => document.querySelectorAll(".wkbar").forEach((bar) => { bar.innerHTML = inner(bar.dataset.wkId); });
  function paintCap() {
    const box = W && barOf(W.id) && barOf(W.id).querySelector(".wkcap");
    if (!box) return paintBar();
    const c = caption();
    box.innerHTML = c; box.hidden = !c;
  }
  function paintMenu() {
    document.querySelectorAll(".wkbar").forEach((bar) => {
      const open = menuId === bar.dataset.wkId, box = bar.querySelector(".wkmenu"), b = bar.querySelector('[data-wk="menu"]');
      if (box) { box.hidden = !open; box.innerHTML = open ? menuHTML() : ""; }
      if (b) b.setAttribute("aria-expanded", open);
    });
  }

  // ------------------------------------------------------------------ controls
  function act(what, b, id) {
    if (what === "start") return start(id);
    if (what === "menu") { menuId = menuId === id ? null : id; return paintMenu(); }
    if (what === "mode") {
      if (P.mode === b.dataset.m) return;
      P.mode = b.dataset.m; save();
      if (W && W.id === id) return start(id);
      return paintAll();
    }
    if (what === "test") {
      if (!canSpeak) return;
      S.cancel();
      const u = new SpeechSynthesisUtterance("The roll return is 2.79 percent, from the near contract at 82.40.");
      const v = voice(); if (v) { u.voice = v; u.lang = v.lang; } u.rate = P.rate;
      if (W && W.state === "play") pause();
      return S.speak(u);
    }
    if (what === "rate") { P.rate = RATES[(RATES.indexOf(+P.rate) + 1) % RATES.length]; save(); if (W && W.state === "play") return run(W.i, W.c, true); return paintBar(); }
    if (what === "talk") { P.talk = !P.talk; save(); if (W) { W.silent = false; if (W.state === "play") return run(W.i, W.c, true); } return paintBar(); }
    if (!W) return;
    if (what === "stop") return stop(false);
    if (what === "pause") return pause();
    if (what === "play" || what === "show") return resume();
    if (what === "prev") return run(W.i - 1, 0);
    if (what === "next") return run(W.i + 1, 0);
    if (what === "go") return run(+b.dataset.i, 0);
  }
  if (!isNode) {
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-wk]");
      if (b) {
        e.stopPropagation(); e.preventDefault();
        if (b.disabled) return;
        const bar = b.closest("[data-wk-id]");
        return act(b.dataset.wk, b, bar ? bar.dataset.wkId : null);
      }
      if (!W || W.state === "done" || e.target.closest(".tie, a, button, select, input, label, summary")) return;
      const card = el("root"), part = e.target.closest("[data-seg]");
      if (card && part && card.contains(part)) {   // click a part to hear it (a hidden step: to show it)
        const k = W.segs.findIndex((s) => card.querySelector(s.sel) === part);
        if (k >= 0) { e.stopPropagation(); return k === W.i && W.state === "think" ? resume() : run(k, 0); }
      }
      setTimeout(() => { if (W) paint(false); }, 0);   // the page may have cleared the highlights on this click
    }, true);
    document.addEventListener("change", (e) => {
      const x = e.target.closest("[data-wk-set]");
      if (!x) return;
      e.stopPropagation();
      const k = x.dataset.wkSet;
      if (k === "voice") P.voice = x.value;
      else if (k === "rate") P.rate = +x.value;
      else P[k] = !!x.checked;
      save();
      if (!W) return;
      W.silent = false;
      if (k === "predict") return paint(false);
      if (W.state === "play" && k !== "auto") run(W.i, W.c, true); else paintBar();
    }, true);
    document.addEventListener("keydown", (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "")) return;
      if (e.key === "Escape" && W) { e.stopPropagation(); return stop(false); }
      if ((e.key === "w" || e.key === "W") && !e.shiftKey) {
        if (W && barOf(W.id)) { e.preventDefault(); e.stopPropagation(); return W.state === "play" ? pause() : resume(); }
        // not running: the question answered last, else the first set of controls in view
        const bars = [...document.querySelectorAll(".wkbar")];
        const bar = barOf(lastId) || bars.find((x) => { const r = x.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; }) || bars[0];
        if (!bar) return;
        e.preventDefault(); e.stopPropagation();
        return start(bar.dataset.wkId);
      }
    }, true);
    window.addEventListener("pagehide", () => { if (canSpeak) S.cancel(); });
    const css = document.createElement("style");
    css.id = "walk-css";
    css.textContent = `
  .wkbar { margin-top: 16px; background: var(--card); border: 1.5px solid var(--line-strong); border-radius: 12px; padding: 8px 10px; }
  .wkbar.on { position: sticky; bottom: 0; z-index: 6; box-shadow: 0 -4px 18px rgba(0, 0, 0, .10); }
  .wkrow, .wkrow2 { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .wkrow2 { gap: 6px 12px; margin-top: 6px; }
  .wkbar [hidden] { display: none !important; }
  .wkrow .grow { flex: 1 1 auto; }
  .wkgo svg, .wkb svg { width: 14px; height: 14px; fill: currentColor; flex: none; }
  .wkb { min-width: 34px; height: 36px; padding: 0 9px; border-radius: 8px; border: 1.5px solid var(--line-strong); background: var(--card); color: var(--ink);
         font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
  .wkb:hover:not(:disabled) { border-color: var(--accent); }
  .wkb:disabled { opacity: .38; cursor: default; }
  .wkb.main { background: var(--accent); border-color: var(--accent); color: var(--on-accent); min-width: 46px; }
  .wkb.wide { padding: 0 14px; }
  .wkb[aria-pressed="false"], .wkb[aria-expanded="true"] { background: var(--sunk); }
  .wkb svg { width: 15px; height: 15px; }
  .wkmode { display: inline-flex; border: 1.5px solid var(--line-strong); border-radius: 8px; overflow: hidden; flex: none; }
  .wkmode button { border: 0; background: none; height: 33px; padding: 0 11px; font: inherit; font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; }
  .wkmode button + button { border-left: 1.5px solid var(--line-strong); }
  .wkmode button[aria-pressed="true"] { background: var(--accent-soft); color: var(--ink); }
  .wklab { font-size: 14px; }
  .wklab .muted { color: var(--muted); font-weight: 500; }
  .wkdots { display: inline-flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .wkdot { width: 11px; height: 11px; padding: 0; border-radius: 50%; border: 1.5px solid var(--line-strong); background: none; cursor: pointer; }
  .wkdot.past { background: var(--line-strong); }
  .wkdot.cur { background: var(--accent); border-color: var(--accent); transform: scale(1.3); }
  .wkhint { font-size: 13.5px; color: var(--muted); margin: 0; flex: 1 1 220px; }
  .wkcap { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); font-size: 14px; line-height: 1.5; }
  .wkcap .src { color: var(--muted); }
  .wkcap .tie { cursor: default; opacity: 1 !important; }
  .wkthink { font-weight: 700; }
  .wkmenu { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); display: grid; gap: 8px; font-size: 14px; }
  .wkmenu label { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .wkmenu select { font: inherit; font-size: 14px; padding: 5px 8px; border-radius: 8px; border: 1px solid var(--line-strong); background: var(--card); color: var(--ink); max-width: 100%; }
  .wk-learn { display: grid; gap: 10px; margin: 14px 0; }
  .wk-l { border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 8px; padding: 10px 14px; background: var(--card); font-size: 15px; line-height: 1.55; }
  .wk-l .eyebrow { display: block; margin-bottom: 4px; }
  .wk-l p { margin: 0 0 .5em; } .wk-l p:last-child { margin-bottom: 0; }
  .wk-l ul { margin: 0; padding-left: 1.2em; } .wk-l li { margin: 0 0 4px; }
  .wk-l dl { margin: 0; } .wk-l dt { font-weight: 700; } .wk-l dd { margin: 0 0 6px; }
  .wk-los { font-size: 13.5px; color: var(--muted); }
  .wk-f { margin-top: 6px; }
  .wk-more { display: inline-block; margin-top: 6px; font-size: 13.5px; font-weight: 600; }
  .wk-veil { filter: blur(6px); user-select: none; }
  .wk-run [data-seg], .wk-run .opt, .wk-run .p-opt { transition: opacity .25s, background-color .25s, box-shadow .25s, filter .3s; }
  .wk-run [data-seg]:not(.wk-on), .wk-run .opt:not(.wk-on), .wk-run .p-opt:not(.wk-on) { opacity: .45; }
  .wk-run [data-seg] { cursor: pointer; }
  .wk-run .wk-on { opacity: 1; box-shadow: 0 0 0 2px var(--accent); border-radius: 8px; background-color: var(--accent-soft); }
  .wk-run li.wk-on { padding: 2px 6px; margin-left: -6px; }
  .wk-run .stem.wk-on, .wk-run .p-stem.wk-on { padding: 4px 8px; margin: -4px -8px; }
  .tie.wk-now { opacity: 1 !important; outline: 3px solid hsl(var(--tie-h) 72% var(--tie-e)) !important; outline-offset: 2px; animation: wkpulse 1.1s ease-out; }
  @keyframes wkpulse { from { transform: scale(1.18); } to { transform: scale(1); } }
  .katex .tie.wk-now { display: inline-block; }
  @media (prefers-reduced-motion: reduce) { .tie.wk-now { animation: none; } .wk-run [data-seg], .wk-run .opt, .wk-run .p-opt { transition: none; } }
  @media (max-width: 520px) { .wkhint { display: none; } .wkrow .wkgo { flex: 1 1 auto; } }
  @media print { .wkbar, .wk-learn { display: none; } }`;
    document.head.appendChild(css);
  }

  const api = {
    supported: canSpeak,
    provide(fn) { provider = fn; },
    bar(id) { return provider && id ? `<div class="wkbar${W && W.id === id ? " on" : ""}" data-wk-id="${esc(id)}">${inner(id)}</div>` : ""; },
    active(id) { return !!(W && W.id === id); },
    sync(id) { if (!W) return; if (W.id !== id) return stop(true); paint(false); },
    after(id) { lastId = id; if (P.auto && id) start(id); },
    refresh() { if (W) paint(false); },
    stop() { stop(false); },
    _build: build, _speech: speech, _finish: finish,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Walk = api;
})(typeof window !== "undefined" ? window : globalThis);
