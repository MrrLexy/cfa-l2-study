
(() => {
  "use strict";
  let PATH = null;
  const RN = { A: "Round A", B: "Round B" };
  const STAGES = [["intro", "Plan"], ["A", "Round A"], ["review", "Review"], ["B", "Round B"], ["done", "Done"]];
  const ORDERP = [];
  const PHASE_OF = {};
  const NUM_OF = {};

  window.PATH_P = fetch("static/study-path.json", { cache: "no-store" })
    .then((r) => { if (!r.ok || !/json/i.test(r.headers.get("content-type") || "")) throw new Error("no path"); return r.json(); })
    .then((d) => {
      PATH = d;
      for (const p of d.phases) for (const k of p.modules) { PHASE_OF[k] = p; NUM_OF[k] = ORDERP.length + 1; ORDERP.push(k); }
      return d;
    })
    .catch(() => { PATH = null; });

  
  const SKEY = "study.path.v1";
  let ST = (() => { try { const s = JSON.parse(localStorage.getItem(SKEY)); if (s && s.mods) return s; } catch { /* first visit */ } return { v: 1, exam: "", mods: {} }; })();
  let pushTimer = 0, serverOK = false;
  const blank = () => ({ stage: "intro", A: {}, B: {}, seen: {}, t: 0 });
  const peek = (k) => ST.mods[k] || blank();
  const ms = (k) => ST.mods[k] || (ST.mods[k] = blank());
  function save(k) {
    if (k) ms(k).t = Date.now();
    ST.updated = Date.now();
    try { localStorage.setItem(SKEY, JSON.stringify(ST)); } catch { /* not remembered */ }
    clearTimeout(pushTimer); pushTimer = setTimeout(push, 1500);
  }
  const pull = () => {};
  const push = () => {};

  // ---------------------------------------------------------------- helpers
  const E = (s) => esc(s);
  const R = (s, inline) => rich(String(s ?? ""), null, !!inline);
  const q = (id) => PATH.questions[id];
  const mod = (k) => PATH.modules[k];
  const cnt = (o) => Object.keys(o).length;
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const shortTitle = (k) => k.replace("Ethical and Professional Standards", "Ethics").replace("Financial Statement Analysis", "FSA")
    .replace("Quantitative Methods", "Quant").replace("Alternative Investments", "Alternatives").replace("Portfolio Management", "Portfolio")
    .replace("Corporate Issuers", "Corporate").replace("Equity Valuation", "Equity");
  const href = (k, st) => "#" + new URLSearchParams({ path: "", ...(k ? { pm: k } : {}), ...(st ? { st } : {}) }).toString().replace("path=", "path");

  function roundStats(k, r) {
    const ids = mod(k).rounds[r], rec = peek(k)[r], byT = {};
    let answered = 0, right = 0;
    for (const id of ids) {
      const t = q(id).t, b = byT[t] || (byT[t] = { n: 0, right: 0, answered: 0, missed: [] });
      b.n++;
      const a = rec[id];
      if (a) { answered++; b.answered++; if (a[1]) { right++; b.right++; } else if (a[0] !== "-") b.missed.push(id); }
    }
    return { n: ids.length, answered, right, byT };
  }
  const roundDone = (k, r) => { const s = roundStats(k, r); return s.n > 0 && s.answered === s.n; };
  function status(k) {
    const s = peek(k), a = cnt(s.A), b = cnt(s.B);
    if (s.stage === "done") return "done";
    if (s.stage === "B") return "B";
    if (s.stage === "review") return "review";
    if (s.stage === "A" || a) return "A";
    return b ? "B" : "new";
  }
  const STATUS_LABEL = { new: "Not started", A: "Round A", review: "Review", B: "Round B", done: "Done" };
  const nextKey = () => ORDERP.find((k) => status(k) !== "done") || null;
  const minutesLeft = () => ORDERP.filter((k) => status(k) !== "done").reduce((t, k) => t + mod(k).minutes, 0);
  const totalQ = () => Object.values(ST.mods).reduce((t, m) => t + cnt(m.A || {}) + cnt(m.B || {}), 0);
  function accuracy() {
    let n = 0, ok = 0;
    for (const m of Object.values(ST.mods)) for (const r of ["A", "B"]) for (const a of Object.values(m[r] || {})) if (a[0] !== "-") { n++; ok += a[1] ? 1 : 0; }
    return { n, ok };
  }
  const guideLink = (k, idx) => "#" + new URLSearchParams({ g: k, ...(idx != null ? { at: "gw" + idx } : {}) }).toString();

  // ---------------------------------------------------------------- navigation (the sidebar in Path mode)
  function nav() {
    if (window.LosView && new URLSearchParams(location.hash.slice(1)).has("los")) return LosView.nav();
    const cur = new URLSearchParams(location.hash.slice(1)).get("pm") || "";
    const done = ORDERP.filter((k) => status(k) === "done").length;
    const open = new Set([...(cur && PHASE_OF[cur] ? [PHASE_OF[cur].id] : []), ...((nextKey() && PHASE_OF[nextKey()]) ? [PHASE_OF[nextKey()].id] : [])]);
    $("nav").innerHTML = `<a class="home ${!cur ? "cur" : ""}" href="#path">Path: start here</a>
      <div class="toc-prog">${done} of ${ORDERP.length} sections done<div class="progress thin"><i style="width:${pct(done, ORDERP.length)}%"></i></div></div>` +
      PATH.phases.map((p, i) => `<details data-v="p-${p.id}" ${open.has(p.id) || (openVols.has("p-" + p.id)) ? "open" : ""}><summary><span class="vn">${i + 1}</span>${E(p.title.replace(/^\d+\.\s*/, ""))}
        <span class="cnt">${p.modules.filter((k) => status(k) === "done").length}/${p.modules.length}</span></summary>
        <div class="mods">${p.modules.map((k) => `<a href="${href(k)}" class="${k === cur ? "cur" : ""}"><span class="mn">${NUM_OF[k]}</span><span class="mt">${E(mod(k).title)}</span>
          ${status(k) === "done" ? `<span class="ok" aria-label="done">✓</span>` : status(k) !== "new" ? `<span class="pdot" title="${STATUS_LABEL[status(k)]}"></span>` : ""}</a>`).join("")}</div></details>`).join("") +
      `<div class="sep"></div><a class="home" href="#guide">Guide (walkthroughs)</a><a class="home" href="#map">Map</a>`;
  }

  // ---------------------------------------------------------------- home
  function home() {
    if (!PATH) return `<div class="path"><p class="offline">The study path hasn't been built yet. Run app/build_path.py.</p></div>`;
    const done = ORDERP.filter((k) => status(k) === "done").length, nk = nextKey(), acc = accuracy();
    const started = ORDERP.some((k) => status(k) !== "new");
    const hrs = Math.round(minutesLeft() / 6) / 10;
    const los = ORDERP.reduce((t, k) => t + mod(k).los.length, 0), topics = ORDERP.reduce((t, k) => t + mod(k).topics.length, 0);
    const qs = cnt(PATH.questions);
    return `<div class="path p-home">
      <div class="crumbs">Path</div>
      <div class="p-hero card">
        <div class="p-hero-l">
          <h2>Your study path</h2>
          <p class="lede">${ORDERP.length} sections in the order that builds understanding. In each one you practice first, review the topics those questions covered, then finish with a fresh set of questions before moving on.</p>
          <div class="badges"><span class="badge ${done ? "good" : ""}"><b>${done}</b> of ${ORDERP.length} sections done</span>
            <span class="badge"><b>${hrs}</b> hours left (estimate)</span>
            ${acc.n ? `<span class="badge"><b>${pct(acc.ok, acc.n)}%</b> right over ${acc.n} answers</span>` : ""}</div>
          <div class="progress p-bar"><i style="width:${pct(done, ORDERP.length)}%"></i></div>
        </div>
        <div class="p-hero-r">
          ${nk ? `<a class="btn primary p-go" href="${href(nk)}">${started ? "Continue" : "Start"}: ${E(mod(nk).title)}</a>
            <div class="muted small">${E(nk)} · about ${mod(nk).minutes} min${status(nk) !== "new" ? ` · you're at ${STATUS_LABEL[status(nk)]}` : ""}</div>`
            : `<div class="p-finished">Every section is done. Well done.</div>`}
        </div>
      </div>
      <details class="p-how card"><summary>How each section works</summary>
        <ol>
          <li><b>Round A.</b> Questions on every topic in the section, with the answer and the reasoning after each one.</li>
          <li><b>Review.</b> The topics those questions covered, weakest first: the learning outcomes, the walkthrough for each, and the questions you missed.</li>
          <li><b>Round B.</b> A different set of questions on the same topics, mostly applied, to check it stuck.</li>
          <li><b>Move on.</b> The next section opens when you finish. You can open any section at any time, and every answer is saved.</li>
        </ol>
        <p class="muted small">Coverage: the ${ORDERP.length} sections hold ${los} official learning outcomes in ${topics} topics; every topic has questions in both rounds (${qs} questions in all, and you don't have to use them all).</p>
      </details>
      ${pacePanel()}
      ${PATH.phases.map(phaseCard).join("")}
    </div>`;
  }
  function phaseCard(p) {
    const done = p.modules.filter((k) => status(k) === "done").length;
    return `<section class="p-phase"><div class="p-phase-h"><h3>${E(p.title)}</h3><span class="muted small">${done} of ${p.modules.length} done</span></div>
      <p class="muted">${E(p.blurb)}</p>
      <div class="p-rows">${p.modules.map((k) => {
        const m = mod(k), st = status(k), a = roundStats(k, "A"), b = roundStats(k, "B");
        const score = st === "done" ? `${pct(a.right, a.n)}% → ${pct(b.right, b.n)}%` : "";
        return `<a class="p-row st-${st}" href="${href(k)}"><span class="pn">${NUM_OF[k]}</span>
          <span class="pt"><b>${E(m.title)}</b><span class="muted small">${E(k)} · ${m.topics.length} topics · about ${m.minutes} min</span></span>
          <span class="ps">${score ? `<span class="pscore" title="Round A to Round B">${score}</span>` : ""}<span class="pchip st-${st}">${STATUS_LABEL[st]}</span></span></a>`;
      }).join("")}</div></section>`;
  }
  function pacePanel() {
    const nk = nextKey(), left = ORDERP.filter((k) => status(k) !== "done").length;
    let line = `<span class="muted">Add your exam date to see the pace it takes.</span>`;
    if (ST.exam && left) {
      const days = Math.ceil((new Date(ST.exam + "T00:00:00") - new Date()) / 864e5);
      if (days > 0) {
        const perWeek = Math.ceil((left * 7) / days * 10) / 10, mins = Math.round(minutesLeft() / days);
        line = `<b>${days}</b> days to go: about <b>${perWeek}</b> sections a week, or roughly <b>${mins} min</b> a day, leaves time to spare only if you keep to it.`;
      } else line = `<span class="muted">That date has passed.</span>`;
    }
    return `<div class="p-pace card"><label for="p-exam">Exam date <input type="date" id="p-exam" value="${E(ST.exam || "")}"></label><span class="p-pace-l">${line}</span></div>`;
  }

  // ---------------------------------------------------------------- one section
  function moduleView(k, forced) {
    if (!PATH || !mod(k)) return `<div class="path"><p class="offline">That section isn't in the path.</p><a href="#path">Back to the path</a></div>`;
    const m = mod(k), s = peek(k), p = PHASE_OF[k], nx = ORDERP[ORDERP.indexOf(k) + 1], pv = ORDERP[ORDERP.indexOf(k) - 1];
    const cur = STAGES.some(([x]) => x === forced) ? forced : (s.stage === "intro" && cnt(s.A) ? "A" : s.stage);
    const stepper = STAGES.map(([id, label], i) => {
      const reached = STAGES.findIndex(([x]) => x === (s.stage === "intro" && cnt(s.A) ? "A" : s.stage)) >= i;
      return `<a class="p-step ${id === cur ? "now" : ""} ${reached && id !== cur ? "seen" : ""}" href="${href(k, id)}" ${id === cur ? 'aria-current="step"' : ""}><i>${i + 1}</i>${label}</a>`;
    }).join("");
    const body = cur === "intro" ? introStage(k) : cur === "A" || cur === "B" ? runnerStage(k, cur) : cur === "review" ? reviewStage(k) : doneStage(k);
    return `<div class="path">
      <div class="crumbs"><a href="#path">Path</a> › ${E(p.title.replace(/^\d+\.\s*/, ""))} › Section ${NUM_OF[k]} of ${ORDERP.length}</div>
      <h2 class="p-title">${E(m.title)}</h2>
      <div class="muted small">${E(k)} · about ${m.minutes} minutes · <a href="${guideLink(k)}">walkthrough in the Guide</a>${window.LosView && LosView.has(k) ? ` · <a href="#los&lm=${encodeURIComponent(k)}">learning outcomes and note cards</a>` : ""}</div>
      <nav class="p-steps" aria-label="Steps in this section">${stepper}</nav>
      <div id="p-stage" data-key="${E(k)}" data-stage="${cur}">${body}</div>
      <nav class="g-pager p-pager"><a href="${pv ? href(pv) : "#path"}" class="prev"><span class="dir">‹ ${pv ? "Previous section" : "Path"}</span>${pv ? E(mod(pv).title) : ""}</a>
        <a href="${nx ? href(nx) : "#path"}" class="next"><span class="dir">${nx ? "Next section" : "Path"} ›</span>${nx ? E(mod(nx).title) : ""}</a></nav>
    </div>`;
  }
  function losList(k, t) {
    const m = mod(k);
    return t.los.length ? `<ul class="p-los">${t.los.map((i) => `<li>${E(m.los[i])}</li>`).join("")}</ul>` : `<p class="muted small">${E(m.note || "")}</p>`;
  }
  function introStage(k) {
    const m = mod(k), a = m.rounds.A.length, b = m.rounds.B.length, started = cnt(peek(k).A) > 0;
    return `<div class="card p-intro"><p class="lede">${E(m.why)}</p>
      <div class="p-topics">${m.topics.map((t, i) => `<div class="p-topic"><h4><span class="tn">${i + 1}</span>${R(t.title, true)}</h4>${losList(k, t)}</div>`).join("")}</div>
      <p class="muted small">${m.topics.length} topics, ${m.los.length ? m.los.length + " official learning outcomes, " : ""}${a} questions in Round A and ${b} in Round B.</p>
      <div class="p-actions"><button class="btn primary" data-act="start" data-key="${E(k)}">${started ? "Continue Round A" : "Start Round A"}</button>
        <a class="btn" href="${guideLink(k)}">Read the walkthrough first</a></div></div>`;
  }

  // ---- the question runner (one round)
  function optHTML(id, letter, rec) {
    const x = q(id), picked = rec && rec[0] === letter, right = x.answer === letter;
    const cls = !rec ? "" : right ? "right" : picked ? "wrong" : "";
    return `<button type="button" class="p-opt ${cls}" data-act="pick" data-id="${E(id)}" data-l="${letter}" ${rec ? "disabled" : ""}><span class="ol">${letter}</span><span class="ot">${R(x.options[letter], true)}</span></button>`;
  }
  function cardHTML(k, r, id, n) {
    const x = q(id), t = mod(k).topics[x.t], rec = peek(k)[r][id];
    return `<article class="p-q ${rec ? (rec[1] ? "ok" : rec[0] === "-" ? "skipped" : "bad") : ""}" id="pq-${id}" data-id="${E(id)}">
      <div class="p-qh"><span class="qn">Q${n}</span><span class="chip plain" title="Topic">${R(t.title, true)}</span></div>
      <div class="p-stem">${R(x.stem)}</div>
      ${window.LosView ? LosView.tag(k, id) : ""}
      <div class="p-opts">${["A", "B", "C"].map((l) => optHTML(id, l, rec)).join("")}</div>
      ${rec ? `<div class="p-expl"><div class="p-verdict">${rec[0] === "-" ? "Skipped" : rec[1] ? "Correct" : `Not quite: the answer is ${x.answer}`}</div><div class="rich">${R(x.explanation)}</div></div>`
             : `<div class="p-skip"><button type="button" class="btn ghost sm" data-act="skip" data-id="${E(id)}">Skip</button></div>`}
    </article>`;
  }
  function runnerStage(k, r) {
    const m = mod(k), ids = m.rounds[r], s = roundStats(k, r);
    let lastSet = null, n = 0;
    const cards = ids.map((id) => {
      const x = q(id); n++;
      let head = "";
      if (x.set && x.set !== lastSet) { const st = PATH.sets[x.set]; head = `<section class="p-vig card"><h4>${R(st.title, true)}</h4><div class="rich">${R(st.vignette)}</div></section>`; }
      lastSet = x.set;
      return head + cardHTML(k, r, id, n);
    }).join("");
    const intro = r === "A"
      ? "Answer each question, then read why. Don't worry about the ones you get wrong: the review comes next and it is built from what you miss."
      : "A different set on the same topics, mostly applied. Answer each one, then read why.";
    return `<div class="p-round"><div class="p-rh"><h3>${RN[r]}</h3><span class="muted" id="p-count">${s.answered} of ${s.n} answered</span></div>
      <p class="muted">${intro}</p><div class="progress p-bar"><i id="p-bar" style="width:${pct(s.answered, s.n)}%"></i></div>
      <div class="p-list">${cards}</div>
      <div class="p-finish card" id="p-finish">${finishHTML(k, r)}</div></div>`;
  }
  function finishHTML(k, r) {
    const s = roundStats(k, r), left = s.n - s.answered;
    if (left) return `<div>${left} question${left === 1 ? "" : "s"} left in this round.</div><div class="muted small">Skipped questions count as answered but not as right. You can finish now with "Skip the rest".</div>
      <div class="p-actions"><button class="btn" data-act="skiprest" data-key="${E(k)}" data-r="${r}">Skip the rest</button></div>`;
    const missed = Object.values(s.byT).reduce((t, b) => t + b.missed.length, 0);
    return `<div><b>${s.right} of ${s.n} right</b> (${pct(s.right, s.n)}%).</div>
      <div class="p-actions"><button class="btn primary" data-act="finish" data-key="${E(k)}" data-r="${r}">${r === "A" ? "Go to the review" : "Finish this section"}</button>
        ${missed ? `<button class="btn" data-act="retry" data-key="${E(k)}" data-r="${r}">Try the ${missed} missed again</button>` : ""}</div>`;
  }

  // ---- the review between the rounds
  // a missed question in the review: the case it belongs to, your pick, the answer and why
  function missedCard(k, id) {
    const x = q(id), you = (peek(k).A[id] || [])[0], st = x.set && PATH.sets[x.set];
    return `<div class="p-missed">
      ${st ? `<details class="pm-case"><summary>Case: ${R(st.title, true)} (show)</summary><div class="rich">${R(st.vignette)}</div></details>` : ""}
      <div class="pm-stem">${R(x.stem, true)}</div>
      ${you && x.options[you] ? `<div class="pm-a you"><b>You picked ${E(you)}</b>${R(x.options[you], true)}</div>` : ""}
      <div class="pm-a ok"><b>Answer ${E(x.answer)}</b>${R(x.options[x.answer], true)}</div>
      ${x.explanation ? `<div class="pm-why rich">${R(x.explanation)}</div>` : ""}
    </div>`;
  }

  function reviewStage(k) {
    const m = mod(k), s = roundStats(k, "A"), nar = narrOf(MODS.get(k));
    if (!cnt(peek(k).A)) return `<div class="card"><p>The review is built from Round A, so start there first.</p><a class="btn primary" href="${href(k, "A")}">Go to Round A</a></div>`;
    const seen = peek(k).seen;
    const order = m.topics.map((t, i) => [i, t]).sort((a, b) => ((s.byT[b[0]] || {}).missed || []).length - ((s.byT[a[0]] || {}).missed || []).length || a[0] - b[0]);
    const cards = order.map(([i, t]) => {
      const b = s.byT[i] || { n: 0, right: 0, answered: 0, missed: [] }, bad = b.missed.length;
      const secs = nar && Array.isArray(nar.walkthrough) ? t.walk.map((w) => [w, nar.walkthrough[w]]).filter(([, x]) => x && typeof x === "object") : [];
      return `<details class="p-rt card ${bad ? "weak" : "solid"}" ${bad ? "open" : ""} data-t="${i}">
        <summary><span class="tn">${i + 1}</span><span class="pt">${R(t.title, true)}</span><span class="pchip ${bad ? "st-A" : "st-done"}">${b.answered ? `${b.right} of ${b.n} right` : "not asked"}</span>
          <label class="p-seen" onclick="event.stopPropagation()"><input type="checkbox" data-act="seen" data-key="${E(k)}" data-t="${i}" ${seen[i] ? "checked" : ""}> reviewed</label></summary>
        <div class="p-rb">
          <div class="sub">What you should be able to do</div>${losList(k, t)}
          ${bad ? `<div class="sub">Questions you missed</div>${b.missed.map((id) => missedCard(k, id)).join("")}` : ""}
          ${secs.length ? `<div class="sub">Read this</div>${secs.map(([w, x]) => `<details class="p-sec"><summary>${R(x.heading || "Walkthrough", true)}</summary><div class="rich g-prose">${rich(String(x.body || ""), linkCtx(MODS.get(k)))}</div>
            <a class="small" href="${guideLink(k, w)}">Open in the Guide</a></details>`).join("")}` : `<p class="muted small"><a href="${guideLink(k)}">Open the module walkthrough in the Guide</a></p>`}
        </div></details>`;
    }).join("");
    const extra = nar ? `${Array.isArray(nar.how_to_think) && nar.how_to_think.length ? `<details class="p-sec card"><summary>How to think about questions on this module</summary><ol class="g-think">${nar.how_to_think.map((x) => `<li><div class="rich">${rich(String(x), linkCtx(MODS.get(k)))}</div></li>`).join("")}</ol></details>` : ""}
      ${Array.isArray(nar.pitfalls) && nar.pitfalls.length ? `<details class="p-sec card"><summary>Mistakes to avoid</summary><ul class="miss">${nar.pitfalls.map((x) => `<li><div class="rich">${rich(String(x), linkCtx(MODS.get(k)))}</div></li>`).join("")}</ul></details>` : ""}` : "";
    return `<div class="p-review"><div class="p-rh"><h3>Review: what Round A covered</h3><span class="muted">${s.right} of ${s.n} right</span></div>
      <p class="muted">Every topic in the section was in Round A, weakest first. Open a topic to see what you should be able to do, the questions you missed and the part of the walkthrough that teaches it. Tick topics as you finish them.</p>
      ${cards}${extra}
      <div class="p-finish card"><div class="p-actions"><button class="btn primary" data-act="toB" data-key="${E(k)}">Start Round B</button>
        <a class="btn" href="${href(k, "A")}">Back to Round A</a></div></div></div>`;
  }

  // ---- the end of a section
  function doneStage(k) {
    const m = mod(k), a = roundStats(k, "A"), b = roundStats(k, "B"), nx = ORDERP[ORDERP.indexOf(k) + 1];
    if (!cnt(peek(k).B)) return `<div class="card"><p>You'll see the summary here once Round B is finished.</p><a class="btn primary" href="${href(k, peek(k).stage === "review" ? "review" : "A")}">Continue</a></div>`;
    const rows = m.topics.map((t, i) => {
      const x = a.byT[i] || { n: 0, right: 0 }, y = b.byT[i] || { n: 0, right: 0 };
      const weak = y.n && y.right < y.n;
      return `<tr class="${weak ? "weak" : ""}"><td>${R(t.title, true)}</td><td>${x.right}/${x.n}</td><td>${y.right}/${y.n}</td>
        <td>${weak ? `<a class="small" href="${guideLink(k, (t.walk || [])[0])}">Look at this again</a>` : "Solid"}</td></tr>`;
    }).join("");
    return `<div class="card p-done"><h3>Section complete</h3>
      <div class="p-scores"><div><div class="big">${pct(a.right, a.n)}%</div><div class="muted small">Round A · ${a.right} of ${a.n}</div></div><div class="arrow">→</div>
        <div><div class="big">${pct(b.right, b.n)}%</div><div class="muted small">Round B · ${b.right} of ${b.n}</div></div></div>
      <table class="p-tab"><thead><tr><th>Topic</th><th>A</th><th>B</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <div class="p-actions">${nx ? `<a class="btn primary" href="${href(nx)}">Next: ${E(mod(nx).title)}</a>` : `<a class="btn primary" href="#path">Back to the path</a>`}
        <button class="btn" data-act="redoB" data-key="${E(k)}">Redo Round B</button><a class="btn ghost" href="${guideLink(k)}">Walkthrough</a></div></div>`;
  }

  // ---------------------------------------------------------------- actions (one delegated handler on the page)
  function repaintFinish(k, r) {
    const s = roundStats(k, r), box = document.getElementById("p-finish");
    if (box) box.innerHTML = finishHTML(k, r);
    const c = document.getElementById("p-count"), b = document.getElementById("p-bar");
    if (c) c.textContent = `${s.answered} of ${s.n} answered`;
    if (b) b.style.width = pct(s.answered, s.n) + "%";
  }
  function record(k, r, id, choice) {
    const x = q(id), rec = ms(k)[r];
    if (rec[id]) return;
    rec[id] = [choice, choice === "-" ? null : choice === x.answer];
    if (ms(k).stage === "intro") ms(k).stage = r;
    save(k);
    const card = document.getElementById("pq-" + id);
    if (card) {
      const n = Number((card.querySelector(".qn") || {}).textContent.slice(1)) || 1;
      const tmp = document.createElement("div"); tmp.innerHTML = cardHTML(k, r, id, n);
      card.replaceWith(tmp.firstElementChild);
      const fresh = document.getElementById("pq-" + id);
      typeset(fresh);
    }
    repaintFinish(k, r);
  }
  function go(h) { if (location.hash === h) render(false); else location.hash = h; }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || MODE !== "path") return;
    const act = b.dataset.act, k = b.dataset.key || (document.getElementById("p-stage") || {}).dataset?.key, r = b.dataset.r || (document.getElementById("p-stage") || {}).dataset?.stage;
    if (act === "pick") record(k, r, b.dataset.id, b.dataset.l);
    else if (act === "skip") record(k, r, b.dataset.id, "-");
    else if (act === "skiprest") { for (const id of mod(k).rounds[r]) if (!peek(k)[r][id]) ms(k)[r][id] = ["-", null]; save(k); render(true); }
    else if (act === "start") { if (ms(k).stage === "intro") ms(k).stage = "A"; save(k); go(href(k, "A")); }
    else if (act === "finish") {
      ms(k).stage = r === "A" ? "review" : "done";
      if (r === "B") ms(k).done = Date.now();
      save(k); go(href(k, ms(k).stage));
    } else if (act === "retry") {
      for (const id of mod(k).rounds[r]) { const a = peek(k)[r][id]; if (a && a[1] === false) delete ms(k)[r][id]; }
      save(k); render(true);
    } else if (act === "toB") { ms(k).stage = "B"; save(k); go(href(k, "B")); }
    else if (act === "redoB") { ms(k).B = {}; ms(k).stage = "B"; delete ms(k).done; save(k); go(href(k, "B")); }
  });
  document.addEventListener("change", (e) => {
    const c = e.target;
    if (MODE !== "path") return;
    if (c.matches && c.matches("[data-act=seen]")) { ms(c.dataset.key).seen[c.dataset.t] = c.checked; save(c.dataset.key); }
    else if (c.id === "p-exam") { ST.exam = c.value; save(); const box = document.querySelector(".p-pace"); if (box) box.outerHTML = pacePanel(); }
  });

  // ---------------------------------------------------------------- what the page calls
  window.PathView = {
    ready: () => !!PATH,
    nav,
    home,
    module: moduleView,
    wire() {
      typeset($("content"));
      const hp = new URLSearchParams(location.hash.slice(1)), qid = hp.get("q"), at = hp.get("at");
      const el = (qid && document.getElementById("pq-" + qid)) || (at && hp.has("los") && document.getElementById("los-" + at));
      if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("p-flash"); const d = el.querySelector("details"); if (d) d.open = true; }
    },
    keys: () => ORDERP,
    state: () => ST,
    api: {  // what the LOS tab (los.js) shares: one progress record, one set of links
      get data() { return PATH; },
      peek, ms, save, mod, q, href, guideLink, status, shortTitle, cnt, pct, ORDERP, PHASE_OF, NUM_OF,
    },
  };
})();
