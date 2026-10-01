
(() => {
  "use strict";
  let D = null;
  window.LOS_P = fetch("static/los-cards.json", { cache: "no-store" })
    .then((r) => { if (!r.ok || !/json/i.test(r.headers.get("content-type") || "")) throw new Error("no cards"); return r.json(); })
    .then((d) => { D = d; return d; })
    .catch(() => { D = null; });

  const A = () => PathView.api;
  const E = (s) => esc(s);
  const R = (s, inline) => rich(String(s ?? ""), null, !!inline);
  const RL = (s, k) => rich(String(s ?? ""), linkCtx(MODS.get(k)));
  const M = (k) => (D && D.modules[k]) || null;
  const P = () => A().data;
  const hrefL = (k, extra) => "#" + new URLSearchParams({ los: "", ...(k ? { lm: k } : {}), ...(extra || {}) }).toString().replace("los=", "los");
  const plain = (s, n) => {
    const t = String(s || "").replace(/\\\[[\s\S]*?\\\]/g, " … ").replace(/\\\(|\\\)/g, "").replace(/\\[a-zA-Z]+/g, "").replace(/[{}^_$]/g, "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
  };

  // ---------------------------------------------------------------- ticks
  const got = (k) => A().peek(k).los || {};
  const isOn = (k, i) => !!got(k)[i];
  const nTicked = (k) => Object.keys(got(k)).filter((i) => M(k) && i < M(k).los.length).length;
  const nTotal = (k) => (M(k) ? M(k).los.length : 0);
  function setOn(k, i, v) {
    const m = A().ms(k);
    m.los = m.los || {};
    if (v) m.los[i] = 1; else delete m.los[i];
    A().save(k);
  }
  function syncCounts() {
    document.querySelectorAll("[data-los-count]").forEach((el) => {
      const k = el.dataset.losCount;
      el.textContent = k === "*" ? `${allTicked()} of ${allTotal()}` : `${nTicked(k)} of ${nTotal(k)}`;
    });
    document.querySelectorAll("[data-los-bar]").forEach((el) => {
      const k = el.dataset.losBar;
      el.style.width = (k === "*" ? A().pct(allTicked(), allTotal()) : A().pct(nTicked(k), nTotal(k))) + "%";
    });
  }
  const allTicked = () => A().ORDERP.reduce((t, k) => t + nTicked(k), 0);
  const allTotal = () => A().ORDERP.reduce((t, k) => t + nTotal(k), 0);
  const secHeading = (k, w) => { const n = narrOf(MODS.get(k)); const s = n && n.walkthrough && n.walkthrough[w]; return s && s.heading ? s.heading : "Walkthrough"; };

  // ---------------------------------------------------------------- pieces
  function answerHTML(k, c) {
    const ans = c.answer.map((a) => `<div class="los-ans-p">${a.h ? `<div class="sub">${R(a.h, true)}</div>` : ""}<div class="rich g-prose">${RL(a.p, k)}</div></div>`).join("");
    const forms = c.formulas.map((f) => `<div class="los-f"><div class="sub">${E(f.name)}</div><div class="rich">${R("\\[" + f.latex + "\\]")}</div>
      ${f.vars.length ? `<ul class="los-vars">${f.vars.map(([l, m]) => `<li>${R("\\(" + l + "\\)", true)}: ${R(m, true)}</li>`).join("")}</ul>` : ""}
      ${f.use ? `<p class="small"><b>Use.</b> ${R(f.use, true)}</p>` : ""}${f.pitfall ? `<p class="small"><b>Watch for.</b> ${R(f.pitfall, true)}</p>` : ""}</div>`).join("");
    const secs = c.sections.slice(0, 6).map((w) => `<a href="${A().guideLink(k, w)}">${E(secHeading(k, w))}</a>`).join("");
    return `${ans || `<p class="muted small">No paragraph of the walkthrough answers this on its own; read the sections below.</p>`}${forms}
      <div class="los-links"><span class="sub">Read more in the Guide</span>${secs}<a href="${A().guideLink(k)}">Whole module</a></div>`;
  }
  function questionsHTML(k, c) {
    const rows = ["A", "B"].flatMap((r) => c.qs[r].map((id) => [r, id]));
    if (!rows.length) return "";
    const s = A().peek(k);
    return `<div class="los-qs"><div class="sub">${c.qs_topic ? "Questions on this outcome's topic" : "Questions that test this outcome"}</div>
      ${rows.map(([r, id]) => {
        const rec = s[r] && s[r][id], x = A().q(id);
        return `<a class="los-q" href="${A().href(k, r)}&q=${encodeURIComponent(id)}"><span class="lq-r">Round ${r}</span><span class="lq-t">${E(plain(x.stem, 110))}</span>
          <span class="lq-s ${rec ? (rec[1] ? "ok" : rec[0] === "-" ? "" : "bad") : ""}">${rec ? (rec[1] ? "✓" : rec[0] === "-" ? "–" : "✗") : ""}</span></a>`;
      }).join("")}</div>`;
  }
  const topicChips = (k, c) => c.topics.map((t) => `<span class="chip plain">${R(P().modules[k].topics[t].title, true)}</span>`).join("");
  const tickBox = (k, i, label) => `<label class="los-check"><input type="checkbox" data-los-k="${E(k)}" data-los-i="${i}" ${isOn(k, i) ? "checked" : ""}><span>${label}</span></label>`;

  // ---------------------------------------------------------------- the question runner shows the outcome it tests
  function tag(k, id) {
    const m = M(k);
    const idx = m && m.q[id];
    if (!idx || !idx.length) return "";
    return `<div class="p-los-tags">${idx.map((i) => `<label class="los-mini"><input type="checkbox" data-los-k="${E(k)}" data-los-i="${i}" ${isOn(k, i) ? "checked" : ""}>
      <span><b>LOS ${i + 1}</b> ${E(m.los[i].text)} <a href="${hrefL(k, { at: i })}" title="Open this outcome and its answer">answer</a></span></label>`).join("")}</div>`;
  }

  // ---------------------------------------------------------------- nav
  function nav() {
    const cur = new URLSearchParams(location.hash.slice(1)).get("lm") || "";
    const ph = P() ? P().phases : [];
    const open = new Set(cur && A().PHASE_OF[cur] ? [A().PHASE_OF[cur].id] : []);
    $("nav").innerHTML = `<a class="home ${!cur ? "cur" : ""}" href="#los">LOS cards: all modules</a>
      <div class="toc-prog"><span data-los-count="*">${allTicked()} of ${allTotal()}</span> outcomes ticked<div class="progress thin"><i data-los-bar="*" style="width:${A().pct(allTicked(), allTotal())}%"></i></div></div>` +
      ph.map((p, i) => `<details data-v="l-${p.id}" ${open.has(p.id) || openVols.has("l-" + p.id) ? "open" : ""}><summary><span class="vn">${i + 1}</span>${E(p.title.replace(/^\d+\.\s*/, ""))}
        <span class="cnt">${p.modules.reduce((t, k) => t + nTicked(k), 0)}/${p.modules.reduce((t, k) => t + nTotal(k), 0)}</span></summary>
        <div class="mods">${p.modules.map((k) => `<a href="${hrefL(k)}" class="${k === cur ? "cur" : ""}"><span class="mn">${A().NUM_OF[k]}</span><span class="mt">${E(A().mod(k).title)}</span>
          ${nTotal(k) && nTicked(k) === nTotal(k) ? `<span class="ok" aria-label="all ticked">✓</span>` : ""}</a>`).join("")}</div></details>`).join("") +
      `<div class="sep"></div><a class="home" href="#path">Path (study in order)</a><a class="home" href="#guide">Guide (walkthroughs)</a><a class="home" href="#map">Map</a>`;
  }

  // ---------------------------------------------------------------- home
  function home() {
    const total = allTotal(), ticked = allTicked();
    const phases = P().phases.map((p) => `<section class="p-phase"><div class="p-phase-h"><h3>${E(p.title)}</h3>
        <span class="muted small">${p.modules.reduce((t, k) => t + nTicked(k), 0)} of ${p.modules.reduce((t, k) => t + nTotal(k), 0)} ticked</span></div>
      <div class="p-rows">${p.modules.map((k) => `<div class="p-row los-mrow"><span class="pn">${A().NUM_OF[k]}</span>
        <div class="pt"><b>${E(A().mod(k).title)}</b><span class="muted small">${E(k)} · ${nTotal(k) || "no"} learning outcomes</span></div>
        <div class="ps"><span class="pscore" data-los-count="${E(k)}">${nTicked(k)} of ${nTotal(k)}</span><a class="btn sm" href="${hrefL(k)}">List</a>
          ${nTotal(k) ? `<a class="btn sm primary" href="${hrefL(k, { mode: "cards" })}">Note cards</a>` : ""}</div></div>`).join("")}</div></section>`).join("");
    return `<div class="path los"><h2>Learning outcomes</h2>
      <div class="card"><p class="lede">All ${total} learning outcomes of Level II, word for word from the curriculum notes. Each has a box to tick, an answer put together from the reviewed Guide,
        the formulas that go with it, and the questions that test it. Two ways through: the <b>list</b>, where you tick what you can do, and <b>note cards</b>, where you read the
        outcome, say the answer, flip and mark it got it or again. Ticks are shared with the Path, and the questions there show which outcome they test.</p>
        <div class="p-bar"><div class="progress"><i data-los-bar="*" style="width:${A().pct(ticked, total)}%"></i></div>
          <div class="muted small"><span data-los-count="*">${ticked} of ${total}</span> outcomes ticked</div></div></div>
      ${phases}</div>`;
  }

  // ---------------------------------------------------------------- one module: the list
  function list(k, r) {
    const m = M(k), pm = P().modules[k], ph = A().PHASE_OF[k], only = r.get("only") === "open";
    const head = `<div class="crumbs"><a href="#los">LOS cards</a> › ${E(ph.title.replace(/^\d+\.\s*/, ""))}</div><h2 class="p-title">${E(pm.title)}</h2>
      <div class="muted small">${E(k)} · <a href="${A().guideLink(k)}">walkthrough in the Guide</a> · <a href="${A().href(k)}">study this section in the Path</a></div>`;
    if (!m.los.length) {
      return `<div class="path los">${head}<div class="card"><p class="muted">${E(pm.note || "This module lists no learning outcomes of its own.")}</p>
        <ul class="p-los">${pm.topics.map((t) => `<li>${R(t.title, true)}</li>`).join("")}</ul></div></div>`;
    }
    const rows = m.los.filter((c) => !only || !isOn(k, c.i)).map((c) => `<article class="los-row ${isOn(k, c.i) ? "on" : ""}" id="los-${c.i}">
      <div class="los-head">${tickBox(k, c.i, `<b>LOS ${c.i + 1}</b>`)}<div class="los-text">${E(c.text)}</div></div>
      <div class="los-meta">${topicChips(k, c)}${c.notes.length ? `<span class="muted small">In the notes: ${E(c.notes.join("; "))}</span>` : ""}</div>
      <details class="los-ans"><summary>Answer, formulas and questions</summary><div class="los-body">${answerHTML(k, c)}${questionsHTML(k, c)}</div></details></article>`).join("");
    const nx = A().ORDERP[A().ORDERP.indexOf(k) + 1], pv = A().ORDERP[A().ORDERP.indexOf(k) - 1];
    return `<div class="path los">${head}
      <div class="los-top"><div class="grow"><div class="progress thin"><i data-los-bar="${E(k)}" style="width:${A().pct(nTicked(k), nTotal(k))}%"></i></div>
        <div class="muted small"><span data-los-count="${E(k)}">${nTicked(k)} of ${nTotal(k)}</span> outcomes ticked</div></div>
        <div class="p-actions"><a class="btn primary" href="${hrefL(k, { mode: "cards" })}">Note cards</a>
          <a class="btn" href="${hrefL(k, only ? {} : { only: "open" })}">${only ? "Show all" : "Only unticked"}</a></div></div>
      ${rows || `<div class="card"><p>Every outcome in this module is ticked.</p></div>`}
      <nav class="g-pager p-pager"><a href="${pv ? hrefL(pv) : "#los"}" class="prev"><span class="dir">‹ ${pv ? "Previous module" : "All modules"}</span>${pv ? E(A().mod(pv).title) : ""}</a>
        <a href="${nx ? hrefL(nx) : "#los"}" class="next"><span class="dir">${nx ? "Next module" : "All modules"} ›</span>${nx ? E(A().mod(nx).title) : ""}</a></nav></div>`;
  }

  // ---------------------------------------------------------------- one module: note cards
  function order(k, r) {
    const m = M(k), only = r.get("only") === "open", cur = Number(r.get("i"));
    return m.los.map((c) => c.i).filter((i) => !only || !isOn(k, i) || i === cur);
  }
  function cards(k, r) {
    const m = M(k), pm = P().modules[k], only = r.get("only") === "open";
    if (!m.los.length) return list(k, r);
    const ord = order(k, r), ex = only ? { only: "open" } : {};
    let pos = ord.indexOf(Number(r.get("i")));
    const head = `<div class="crumbs"><a href="#los">LOS cards</a> › <a href="${hrefL(k)}">${E(pm.title)}</a> › Note cards</div><h2 class="p-title">Note cards</h2>
      <div class="muted small">${E(pm.title)} · <a href="${hrefL(k)}">list view</a> · <a href="${hrefL(k, only ? { mode: "cards" } : { mode: "cards", only: "open" })}">${only ? "show all cards" : "only unticked"}</a></div>`;
    if (pos < 0) pos = 0;
    if (!ord.length) return `<div class="path los">${head}<div class="card"><p>Every outcome in this module is ticked. Nothing left to review.</p><div class="p-actions"><a class="btn primary" href="${hrefL(k, { mode: "cards" })}">Go through all the cards</a>
      <a class="btn" href="${hrefL(k)}">Back to the list</a></div></div></div>`;
    const i = ord[pos], c = m.los[i];
    const step = (p) => hrefL(k, { mode: "cards", i: ord[p], ...ex });
    return `<div class="path los">${head}
      <div class="los-top"><div class="grow"><div class="progress thin"><i style="width:${A().pct(pos + 1, ord.length)}%"></i></div>
        <div class="muted small">Card ${pos + 1} of ${ord.length} · <span data-los-count="${E(k)}">${nTicked(k)} of ${nTotal(k)}</span> ticked</div></div></div>
      <article class="card los-card" id="los-card" data-k="${E(k)}" data-i="${i}" data-pos="${pos}" data-n="${ord.length}">
        <div class="los-eyebrow">Learning outcome ${i + 1} of ${nTotal(k)}</div>
        <div class="los-front">${E(c.text)}</div>
        <div class="los-meta">${topicChips(k, c)}</div>
        <p class="muted small los-hint">Say the answer in your own words first, then flip the card. (Space flips, G is got it, A is again, the arrow keys move.)</p>
        <div class="p-actions"><button class="btn primary" data-los-act="flip">Show the answer</button></div>
        <div class="los-back" hidden>${answerHTML(k, c)}${questionsHTML(k, c)}
          <div class="p-actions los-mark"><button class="btn primary" data-los-act="got">Got it</button><button class="btn" data-los-act="again">Again</button>
            ${tickBox(k, i, "ticked")}</div></div></article>
      <nav class="g-pager p-pager"><a href="${pos > 0 ? step(pos - 1) : hrefL(k)}" class="prev"><span class="dir">‹ ${pos > 0 ? "Previous card" : "List view"}</span></a>
        <a href="${pos + 1 < ord.length ? step(pos + 1) : hrefL(k)}" class="next"><span class="dir">${pos + 1 < ord.length ? "Next card" : "Finish: list view"} ›</span></a></nav></div>`;
  }

  // ---------------------------------------------------------------- what the page calls
  function render(r) {
    if (!D || !P()) return `<div class="path"><p class="offline">The learning outcome cards haven't been built yet. Run app/build_los.py.</p></div>`;
    const k = r.get("lm");
    if (!k) return home();
    if (!M(k)) return `<div class="path"><p class="offline">That module isn't in the cards.</p><a href="#los">Back to all modules</a></div>`;
    return r.get("mode") === "cards" ? cards(k, r) : list(k, r);
  }

  // ---------------------------------------------------------------- actions
  document.addEventListener("change", (e) => {
    const c = e.target;
    if (!c.matches || !c.matches("input[data-los-k]")) return;
    const k = c.dataset.losK, i = Number(c.dataset.losI);
    setOn(k, i, c.checked);
    document.querySelectorAll(`input[data-los-k="${CSS.escape(k)}"][data-los-i="${i}"]`).forEach((x) => { x.checked = c.checked; });
    const row = document.getElementById("los-" + i);
    if (row) row.classList.toggle("on", c.checked);
    syncCounts();
  });
  function cardStep(dir, tick) {
    const el = document.getElementById("los-card");
    if (!el) return;
    const k = el.dataset.k, i = Number(el.dataset.i), pos = Number(el.dataset.pos), n = Number(el.dataset.n);
    const r = new URLSearchParams(location.hash.slice(1));
    if (tick) setOn(k, i, true);
    const ord = order(k, r), np = ord.indexOf(i) + dir;
    const only = r.get("only") === "open";
    if (np < 0) { location.hash = hrefL(k); return; }
    if (np >= ord.length || (only && tick && ord.length === 1)) { location.hash = hrefL(k); return; }
    location.hash = hrefL(k, { mode: "cards", i: ord[np], ...(only ? { only: "open" } : {}) });
  }
  function flip() {
    const el = document.getElementById("los-card");
    if (!el) return;
    const back = el.querySelector(".los-back"), b = el.querySelector("[data-los-act=flip]");
    back.hidden = !back.hidden;
    if (b) b.textContent = back.hidden ? "Show the answer" : "Hide the answer";
    el.classList.toggle("flipped", !back.hidden);
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-los-act]");
    if (!b) return;
    const act = b.dataset.losAct;
    if (act === "flip") flip();
    else if (act === "got") cardStep(1, true);
    else if (act === "again") cardStep(1, false);
  });
  document.addEventListener("keydown", (e) => {
    const h = new URLSearchParams(location.hash.slice(1));
    if (!h.has("los") || h.get("mode") !== "cards" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || "")) || e.target.isContentEditable) return;
    const back = document.querySelector("#los-card .los-back");
    if (e.key === " " || e.key === "Enter") { if (e.target.closest && e.target.closest("a,button,summary")) return; e.preventDefault(); flip(); }
    else if (e.key === "ArrowRight") cardStep(1, false);
    else if (e.key === "ArrowLeft") cardStep(-1, false);
    else if ((e.key === "g" || e.key === "G") && back && !back.hidden) cardStep(1, true);
    else if ((e.key === "a" || e.key === "A") && back && !back.hidden) cardStep(1, false);
  });

  window.LosView = { render, nav, tag, has: (k) => !!(M(k) && M(k).los.length), ready: () => !!D };
})();
