/* Trace the numbers. Ties each value a question gives (in its case, an exhibit or the stem) to the places the worked solution
   uses it, and each value worked out on the way to the later steps that use it again. The same value gets the same colour
   everywhere, so the reader can see where a number came from and where it goes. It works on the page's own sources (markdown
   with TeX) while they are rendered and has no data of its own.

     const t = Ties.build({ source: [vignette, stem], solution: [...steps, explanation, trap], options: [a, b, c] });
     t.groups                 [{ id, kind: "given" | "derived", hue, uses }], in the order the solution first uses them
     t.given                  how many of them are values the question gives
     t.tex(src, givenOnly)    the TeX with \htmlClass round each tied number (KaTeX needs `trust` for that command)
     t.text(src, givenOnly)   plain text with private-use placeholders round each tied number; call it before escaping
     t.text(src, givenOnly, fn)   the same, with fn(classes, number) supplying what replaces each tied number
     Ties.html(str)           the placeholders turned into <mark class="tie ..."> (call it after escaping)

   What counts as the same value: equal numbers; a percentage and its decimal (12% and 0.12); a percentage written without its
   sign in a table (12.0 under a "%" heading); basis points and percent (250 bp and 2.5%); and a figure quoted in thousands or
   millions (1.2 million and 1,200,000). Signs are ignored (a loss of 18% and −18%).
   What is never tied: 0, 1 and 2 on their own, subscripts, years such as 2024, and numbers that only label something
   ("Exhibit 2", "Year 3", "Fund 1", "LM 4"). */
(function (root) {
  "use strict";
  const HUES = 8, MAX = 8;   // one colour per value, so never more values than colours
  const NUM = /\d{1,3}(?:(?:,|\{,\})\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+/g;
  const LABEL = /(?:^|[^A-Za-z])(?:exhibits?|tables?|figures?|panels?|questions?|steps?|routes?|statements?|scenarios?|notes?|parts?|lm|los|modules?|readings?|levels?|standards?|sections?|years?|quarters?|periods?|months?|days?|weeks?|stages?|phases?|tiers?|tranches?|class|funds?|bonds?|portfolios?|compan(?:y|ies)|firms?|options?|strateg(?:y|ies)|cases?|methods?|models?|approach(?:es)?|analysts?|assets?|stocks?|projects?|factors?|ifrs|ias|asc|gips|basel|no\.|#|variations?|items?|sets?|rounds?|times?|nodes?|paths?|states?|segments?|units?|divisions?|plants?|loans?|leases?|swaps?|contracts?|trades?|rules?|columns?|rows?|lines?|groups?|types?|plans?|managers?|clients?|accounts?|securit(?:y|ies)|notes?|issues?|series|lots?|buckets?|regimes?|clusters?|folds?|lags?|orders?)[\s*_~\\{}(:]*$/i;
  const N = (v) => String(+(+v).toPrecision(10));
  const digits = (v) => N(v).replace(/[-.]/g, "").replace(/^0+|0+$/g, "").length;

  // parts of a TeX string that hold no values: subscripts, and the arguments of spacing, colour and environment commands
  function texMask(s) {
    const skip = new Uint8Array(s.length);
    const close = (i) => { let d = 0; for (; i < s.length; i++) { if (s[i] === "{" && s[i - 1] !== "\\") d++; else if (s[i] === "}" && s[i - 1] !== "\\" && --d === 0) return i; } return s.length - 1; };
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "_") {
        if (s[i + 1] === "{") { const j = close(i + 1); skip.fill(1, i, j + 1); i = j; }
        else { let j = i + 1; if (s[j] === "\\") { j++; while (/[a-zA-Z]/.test(s[j] || "")) j++; } else j++; skip.fill(1, i, j); i = j - 1; }
      } else if (s[i] === "\\") {
        const m = /^\\(?:hspace|vspace|kern|mkern|hskip|mskip|rule|color|textcolor|begin|end|label|tag|htmlClass|htmlData|htmlId|htmlStyle|phantom|hphantom|vphantom|sqrt(?=\[)|\\(?=\s*\[))\*?/.exec(s.slice(i, i + 14));
        if (!m) continue;
        let j = i + m[0].length;
        while (s[j] === " ") j++;
        if (s[j] === "[") { const e = s.indexOf("]", j); if (e > 0) j = e + 1; }
        if (/^\\(?:sqrt|\\)/.test(m[0])) { skip.fill(1, i, j); i = j - 1; continue; }
        while (s[j] === " ") j++;
        if (s[j] === "{") j = close(j) + 1;
        if (/^\\rule/.test(m[0]) && s[j] === "{") j = close(j) + 1;
        skip.fill(1, i, j); i = j - 1;
      }
    }
    return skip;
  }

  // every number in one stretch of plain text or of TeX: where it is, what it is worth, and whether it is a percentage
  function tokens(s, isMath) {
    const out = [], skip = isMath ? texMask(s) : null;
    let m;
    NUM.lastIndex = 0;
    while ((m = NUM.exec(s))) {
      const i = m.index, raw = m[0];
      let j = i + raw.length;
      const prev = s[i - 1] || "", next = s[j] || "";
      if (skip && skip[i]) continue;
      if (/[A-Za-z0-9_.\u0001]/.test(prev) || (prev === "," && /\d/.test(s[i - 2] || ""))) continue;   // part of a name or of a longer number
      if (s[j] === "\u0002") continue;                                                              // a placeholder of the page's own
      let caret = false;
      if (isMath && prev === "^") { if (raw.length !== 1) continue; caret = true; }
      const val = parseFloat(raw.replace(/\{,\}|,/g, ""));
      if (!isFinite(val)) continue;
      let pct = false, v = val;
      const after = s.slice(j, j + 16);
      let u;
      if ((u = /^(?:\s|\\[,;:! ]|~)*\\?%/.exec(after))) { pct = true; if (!caret) j += u[0].length; }
      else if ((u = /^[\s-]?(?:bps?|basis points?)(?![A-Za-z])/i.exec(after))) { pct = true; v = val / 100; }
      else if (/[A-Za-z]/.test(next) && !/^(?:x|m|mn|bn|k)(?![A-Za-z])/.test(after)) continue;       // 1st, 3rd, 10b
      const plainInt = !pct && /^\d+$/.test(raw);
      if (!pct && (v === 0 || v === 1 || v === 2)) continue;
      if (pct && v === 0) continue;
      if (plainInt && v >= 1990 && v <= 2035) continue;                                             // a year
      if (plainInt && LABEL.test(s.slice(Math.max(0, i - 24), i))) continue;                         // Exhibit 2, Fund 3
      if (!isMath && plainInt && raw.length < 3 && /(?:^|\n)[ \t]*$/.test(s.slice(Math.max(0, i - 6), i)) && /^[.)]\s/.test(s.slice(j, j + 2))) continue;   // "3. " opening a list item
      out.push({ i, j, raw: s.slice(i, j), val: Math.abs(v), pct, caret });
    }
    return out;
  }
  const MATH = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$/g;
  function scan(strs) {
    const out = [];
    for (const src of strs) {
      const s = String(src == null ? "" : src);
      let at = 0, m;
      MATH.lastIndex = 0;
      while ((m = MATH.exec(s))) {
        out.push(...tokens(s.slice(at, m.index), false));
        out.push(...tokens(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3], true));
        at = m.index + m[0].length;
      }
      out.push(...tokens(s.slice(at), false));
    }
    return out;
  }
  const keyOf = (t) => (t.pct ? "p" : "n") + N(t.val);
  const places = (t) => { const m = /\.(\d+)/.exec(t.raw); return m ? m[1].length : 0; };

  function build(parts) {
    const S = scan(parts.source || []), W = scan(parts.solution || []), O = scan(parts.options || []);
    const src = new Set(S.map(keyOf));
    // a percentage and the same figure without its sign count as one value only when one of them carries decimals:
    // 4.60 and 4.60% do, "5 lags" and "5%" do not
    const srcDec = new Set(S.filter((t) => places(t) > 0).map(keyOf));
    // values worked out on the way are told apart by their precision as well: 1.0200 (a factor) is not 1.02 (a price)
    const own = (t) => keyOf(t) + "/" + places(t), sol = new Set(W.map(own));
    // the value a number stands for: the one the question gives when there is one, otherwise its own
    const canon = (t) => {
      const v = t.val, n = "n" + N(v), p = "p" + N(v);
      if (!t.pct) {
        if (src.has(n)) return [n, true, "same"];
        if (src.has("p" + N(v * 100))) return ["p" + N(v * 100), true, "dec-of-pct"];
        if (src.has(p) && (places(t) > 0 || srcDec.has(p))) return [p, true, "nosign"];
        if (digits(v) >= 2) for (const k of [1e3, 1e6, 1e9]) {
          if (v >= 1000 && src.has("n" + N(v / k))) return ["n" + N(v / k), true, "scale"];
          if (src.has("n" + N(v * k))) return ["n" + N(v * k), true, "scale"];
        }
        const d = places(t);
        if (d >= 2 && sol.has("p" + N(v * 100) + "/" + (d - 2))) return ["p" + N(v * 100) + "/" + (d - 2), false, "dec"];   // 0.224 and 22.4%
        if (sol.has(p + "/" + d)) return [p + "/" + d, false, "nosign"];
        return [own(t), false, "own"];
      }
      if (src.has(p)) return [p, true, "same"];
      if (src.has("n" + N(v / 100))) return ["n" + N(v / 100), true, "pct-of-dec"];
      if (src.has(n) && (places(t) > 0 || srcDec.has(n))) return [n, true, "pct-nosign"];
      return [own(t), false, "own"];
    };
    const G = new Map();
    const trace = parts.debug ? [] : null;
    W.forEach((t, at) => {
      const [k, given, rule] = canon(t); const g = G.get(k) || { key: k, given, uses: 0, opts: 0, first: at }; g.uses++; G.set(k, g);
      if (trace) trace.push({ raw: t.raw, key: k, rule });
    });
    O.forEach((t) => { const g = G.get(canon(t)[0]); if (g) g.opts++; });
    let list = [...G.values()].filter((g) => g.given || g.uses > 1 || g.opts > 0).sort((a, b) => a.first - b.first);
    if (list.length > MAX) {   // too many colours to follow: keep what the question gives, then the values reused most
      const keep = new Set(list.filter((g) => g.given).slice(0, MAX));
      for (const g of list.filter((g) => !g.given).sort((a, b) => b.uses + b.opts - a.uses - a.opts)) if (keep.size < MAX) keep.add(g);
      list = list.filter((g) => keep.has(g));
    }
    const byKey = new Map();
    list.forEach((g, id) => { g.id = id; g.hue = id % HUES; g.kind = g.given ? "given" : "derived"; byKey.set(g.key, g); });
    const groupOf = (t, givenOnly) => { const g = byKey.get(canon(t)[0]); return g && (!givenOnly || g.given) ? g : null; };
    const cls = (g) => `tie ${g.given ? "tg" : "td"} h${g.hue} tie-${g.id}`;
    const wrap = (s, isMath, givenOnly, fn) => {
      if (!list.length || !s) return s;
      let out = "", at = 0;
      for (const t of tokens(s, isMath)) {
        const g = groupOf(t, givenOnly);
        if (!g) continue;
        out += s.slice(at, t.i) + (isMath ? `{\\htmlClass{${cls(g)}}{${t.raw}}}` : fn ? fn(cls(g), t.raw) : `\uE000${cls(g)}\uE001${t.raw}\uE002`);
        at = t.j;
      }
      return out + s.slice(at);
    };
    return {
      groups: list.map((g) => ({ id: g.id, kind: g.kind, hue: g.hue, uses: g.uses })),
      trace,
      given: list.filter((g) => g.given).length,
      tex: (s, givenOnly) => wrap(String(s), true, givenOnly),
      text: (s, givenOnly, fn) => wrap(String(s), false, givenOnly, fn),
    };
  }
  const html = (s) => String(s).replace(/\uE000([^\uE001]*)\uE001([^\uE002]*)\uE002/g, '<mark class="$1">$2</mark>');
  // the two KaTeX settings the marks inside formulas need
  const katexOptions = { trust: (c) => c.command === "\\htmlClass", strict: (code) => (code === "htmlExtension" ? "ignore" : "warn") };

  const CSS = `
  :root { --tie-s: 88%; --tie-l: 89%; --tie-e: 40%; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --tie-s: 45%; --tie-l: 25%; --tie-e: 66%; } }
  :root[data-theme="dark"] { --tie-s: 45%; --tie-l: 25%; --tie-e: 66%; }
  .tie { color: inherit; border-radius: 4px; padding: 0 .16em; cursor: pointer; background: hsl(var(--tie-h) var(--tie-s) var(--tie-l));
         box-shadow: inset 0 -2px 0 hsl(var(--tie-h) 72% var(--tie-e)); transition: opacity .12s; }
  .katex .tie { padding: 0 .06em; border-radius: 3px; }
  .tie.td { background: none; box-shadow: inset 0 0 0 1.5px hsl(var(--tie-h) 62% var(--tie-e)); }
  .tie.h0 { --tie-h: 212; } .tie.h1 { --tie-h: 28; } .tie.h2 { --tie-h: 152; } .tie.h3 { --tie-h: 284; }
  .tie.h4 { --tie-h: 344; } .tie.h5 { --tie-h: 186; } .tie.h6 { --tie-h: 50; } .tie.h7 { --tie-h: 252; }
  .tie-focus .tie { opacity: .28; }
  .tie-focus .tie.on { opacity: 1; outline: 2px solid hsl(var(--tie-h) 72% var(--tie-e)); outline-offset: 1px; }
  .tienote { margin: 8px 0 0; font-size: 13.5px; color: var(--muted); }
  .tiekey { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin: 10px 0 8px; font-size: 13.5px; color: var(--muted); }
  .tiekey .tie { cursor: default; }
  @media print { .tie { background: none !important; box-shadow: none !important; padding: 0; } }`;
  function style() {
    if (typeof document === "undefined" || document.getElementById("ties-css")) return;
    const el = document.createElement("style"); el.id = "ties-css"; el.textContent = CSS; document.head.appendChild(el);
  }
  // show one value (or several: an array of ids) everywhere it appears inside the given elements (or none, to clear)
  function focus(scopes, id) {
    const ids = id === null || id === undefined ? [] : [].concat(id);
    for (const el of scopes) {
      if (!el) continue;
      el.querySelectorAll(".tie.on").forEach((x) => x.classList.remove("on"));
      for (const k of ids) el.querySelectorAll(".tie-" + k).forEach((x) => x.classList.add("on"));
      el.classList.toggle("tie-focus", ids.length > 0);
    }
  }
  const idOf = (el) => { const m = el && /(?:^|\s)tie-(\d+)(?:\s|$)/.exec(el.getAttribute("class") || ""); return m ? +m[1] : null; };

  const api = { build, html, katexOptions, style, focus, idOf, tokens, scan };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Ties = api;
})(typeof window !== "undefined" ? window : globalThis);
