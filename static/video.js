
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const INK = "#1f2a44", RED = "#c62828", HI = "#ffe58f";
  // the working is written in the same clear face as the tables: the handwriting face was hard to read (the owner, 24 October 2026)
  const HAND = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
  const PLAIN = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
  const q = new URLSearchParams(location.search);
  let S = null, at = 0, playing = false, tok = 0, speed = 1, REF = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const mk = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); (parent || $("layer-ink")).appendChild(e); return e; };

  
  
  // talks, its ring red while it marks up. Only a small pen dot moves over the board, in the colour being drawn with.
  const orb = { x: 1180, y: 60 };
  function orbAt(x, y) { orb.x = x; orb.y = y; const p = $("pen"); p.setAttribute("cx", x); p.setAttribute("cy", y); p.setAttribute("opacity", "1"); }
  function orbPen(red) { $("orb-ring").setAttribute("stroke", red ? RED : "#5b7cfa"); $("orb-halo").setAttribute("fill", red ? RED : "#5b7cfa"); $("pen").setAttribute("fill", red ? RED : "#5b7cfa"); }
  const penOff = () => $("pen").setAttribute("opacity", "0");
  async function orbTo(x, y, ms, t) {
    const x0 = orb.x, y0 = orb.y, d = Math.hypot(x - x0, y - y0), dur = (ms || Math.min(700, 140 + d * 0.9)) / speed, t0 = performance.now();
    if (fast(t)) return orbAt(x, y);
    for (;;) {
      if (t !== tok) return orbAt(x, y);
      const k = Math.min(1, (performance.now() - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      orbAt(x0 + (x - x0) * e, y0 + (y - y0) * e);
      if (k >= 1) return;
      await new Promise(requestAnimationFrame);
    }
  }
  const fast = (t) => t === "instant" || t === "now";   // "instant": an earlier scene redrawn; "now": this scene shown at once (paused)

  // ---------------------------------------------------------------- drawing primitives
  async function drawPath(d, opts, t) {   
    const p = mk("path", { d, fill: "none", stroke: opts.color || INK, "stroke-width": opts.width || 2, "stroke-linecap": "round", "stroke-linejoin": "round", ...(opts.marker ? { "marker-end": opts.marker } : {}) }, opts.layer);
    if (fast(t)) return p;
    const L = p.getTotalLength(), dur = (opts.ms || Math.min(1100, 180 + L * 1.1)) / speed, t0 = performance.now(), mark = p.getAttribute("marker-end");
    if (mark) p.removeAttribute("marker-end");
    p.style.strokeDasharray = L; p.style.strokeDashoffset = L;
    const s = p.getPointAtLength(0); await orbTo(s.x, s.y, 0, t);
    for (;;) {
      const k = t !== tok ? 1 : Math.min(1, (performance.now() - t0) / dur), pt = p.getPointAtLength(L * k);
      p.style.strokeDashoffset = L * (1 - k); orbAt(pt.x, pt.y);
      if (k >= 1) break;
      await new Promise(requestAnimationFrame);
    }
    p.style.strokeDasharray = ""; p.style.strokeDashoffset = "";
    if (mark) p.setAttribute("marker-end", mark);
    return p;
  }
  // The numbers that carry from step to step keep one colour wherever they appear (the script's "ties", in order): in the facts
  
  
  const PAL = ["#1565c0", "#2e7d32", "#e65100", "#6a1b9a", "#00838f", "#827717", "#6d4c41", "#ad1457", "#37474f"];
  let TIE = new Map();
  function pieces(text, plain) {   // [{t, c}]: the text cut where a tied number stands
    const out = [];
    let last = 0;
    if (!plain) for (const m of String(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
      const c = TIE.get(m[0].replace(/,/g, ""));
      if (!c) continue;
      if (m.index > last) out.push({ t: text.slice(last, m.index) });
      out.push({ t: m[0], c }); last = m.index + m[0].length;
    }
    if (last < String(text).length) out.push({ t: String(text).slice(last) });
    return out;
  }
  async function typeText(el, text, t, follow, plain) {   // a text written out, a few letters at a time, tied numbers in their colour
    el.textContent = "";
    const spans = pieces(text, plain).map((p) => { const s = document.createElementNS(NS, "tspan"); if (p.c) { s.setAttribute("fill", p.c); s.setAttribute("font-weight", 700); } el.appendChild(s); return [s, p.t]; });
    if (fast(t)) { spans.forEach(([s, x]) => { s.textContent = x; }); return; }
    const per = 28 / speed;
    let n = 0;
    for (const [s, x] of spans) for (let i = 1; i <= x.length; i++) {
      if (t !== tok) { spans.forEach(([s2, x2]) => { s2.textContent = x2; }); return; }
      s.textContent = x.slice(0, i);
      if (follow && ++n % 3 === 0) { try { const b = el.getBBox(); orbAt(b.x + b.width + 18, b.y + b.height / 2); } catch { /* not laid out yet */ } }
      await sleep(per);
    }
  }
  function box(ref) {   // the board rectangle of a ref
    if (Array.isArray(ref)) return { x: ref[0], y: ref[1], width: 0, height: 0 };
    const e = REF[ref];
    if (!e) return null;
    if (e.box) return e.box;
    try { return e.getBBox(); } catch { return null; }
  }
  const mid = (b) => [b.x + b.width / 2, b.y + b.height / 2];
  function ends(a, b) {   // where an arrow leaves box a and arrives at box b: the facing sides
    const [ax, ay] = mid(a), [bx, by] = mid(b), dx = bx - ax, dy = by - ay;
    if (Math.abs(dx) >= Math.abs(dy) * 1.2) return [[dx > 0 ? a.x + a.width + 6 : a.x - 6, ay], [dx > 0 ? b.x - 8 : b.x + b.width + 8, by]];
    return [[ax, dy > 0 ? a.y + a.height + 6 : a.y - 6], [bx, dy > 0 ? b.y - 8 : b.y + b.height + 8]];
  }

  // ---------------------------------------------------------------- the ops
  // a text wrapped to a width: lines of words, measured on the board
  function wrap(text, size, width, weight) {
    const probe = mk("text", { x: 0, y: -100, "font-size": size, "font-family": PLAIN, "font-weight": weight || 400 }), lines = [];
    let line = "";
    for (const w of String(text).split(/\s+/)) {
      probe.textContent = line ? line + " " + w : w;
      if (line && probe.getComputedTextLength() > width) { lines.push(line); line = w; } else line = probe.textContent;
    }
    if (line) lines.push(line);
    probe.remove();
    return lines;
  }
  const OPS = {
    async question(o, t) {   
      if (REF.q) REF.q.remove();
      if (!fast(t)) { $("side-q").classList.add("lit"); seeInSide($("side-q")); }
      if (o.mode !== "card" || !o.stem) return;
      const g = mk("g", {}); REF.q = g;
      const L = Object.keys(o.options || {}), lines = wrap(o.stem, 28, 900, 600), h = 70 + lines.length * 38 + L.length * 46, y0 = Math.max(120, 360 - h / 2);
      mk("rect", { x: 160, y: y0, width: 960, height: h, rx: 16, fill: "#fff", stroke: "#d8d4ca", "stroke-width": 1.5 }, g);
      const lab = mk("text", { x: 190, y: y0 + 34, "font-size": 15, "font-weight": 700, fill: "#6b7280", "font-family": PLAIN, "letter-spacing": 1.2 }, g); lab.textContent = (o.label || "THE QUESTION").toUpperCase();
      lines.forEach((ln, i) => { const e = mk("text", { x: 190, y: y0 + 74 + i * 38, "font-size": 28, "font-weight": 600, fill: INK, "font-family": PLAIN }, g); e.textContent = ln; });
      L.forEach((k, i) => { const e = mk("text", { x: 210, y: y0 + 82 + lines.length * 38 + i * 46, "font-size": 26, fill: INK, "font-family": PLAIN }, g); e.textContent = `${k}.  ${o.options[k]}`; REF[`q.${k}`] = e; });
      if (!fast(t)) { g.setAttribute("opacity", "0"); for (let i = 1; i <= 10; i++) { g.setAttribute("opacity", (i / 10).toFixed(1)); await sleep(30 / speed); } }
    },
    async case(o, t) {   
      const want = new Set((o.lit || []).map(String));
      let first = null;
      for (const f of document.querySelectorAll("#side .pv-fig, #side .pv-num")) if (want.has(f.dataset.v)) { f.classList.add("lit"); first = first || f; }
      if (first && !fast(t)) { seeInSide(first, true); await sleep(500 / speed); }
    },
    async mark(o, t) {   // a choice beside the board marked: the answer ringed, a tempting wrong one struck through
      const li = document.querySelector(`#side-opts li[data-k="${o.choice}"]`);
      if (li) li.classList.add(o.how === "wrong" ? "wrong" : "right");
      if (!fast(t)) await sleep(350 / speed);
    },
    async tip(o, t) {   
      if (t === "instant") return;
      // under the captions, below the board (the owner, 24 October 2026): never over the working
      // in short bullets (o.points), so a tip reads at a glance (the owner, 24 October 2026); a plain o.text still works
      const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      $("tip-h").textContent = o.title || "Tip";
      $("tip-t").innerHTML = o.points ? `<ul>${o.points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : esc(o.text || "");
      $("tip").hidden = false;
      if (!fast(t)) await sleep((o.ms || 900) / speed);
    },
    async points(o, t) {   // the narrator's points on the board, for a scene that is only talk (no numbers, no working to draw); they
      if (t === "instant") return;   
      const x = o.x ?? 60, size = o.size || 28, step = size * 1.6;   // the line fades in, then the dot moves down to the next
      let y = o.y ?? 170;                                             // (the owner, 24 October 2026: not typed letter by letter)
      for (const it of o.items || []) {
        const g = mk("g", { opacity: fast(t) ? 1 : 0 }, $("layer-say")), cy = y - size * 0.32;
        mk("circle", { cx: x + 8, cy, r: size * 0.15, fill: "#5b7cfa" }, g);
        for (const ln of wrap(it, size, o.w || 1040, 400)) {
          const e = mk("text", { x: x + 32, y, "font-size": size, fill: INK, "font-family": PLAIN }, g); e.textContent = ln; y += step;
        }
        y += size * 0.45;
        if (fast(t)) continue;
        orbAt(x + 8, cy); await sleep(160 / speed);
        for (let i = 1; i <= 8; i++) { g.setAttribute("opacity", (i / 8).toFixed(3)); await sleep(30 / speed); }
        await sleep(420 / speed);
      }
      if (!fast(t)) penOff();
    },
    async title(o, t) {
      const a = mk("text", { x: 40, y: 52, "font-size": o.size || 30, "font-weight": 700, fill: INK, "font-family": PLAIN });   
      await orbTo(60, 40, 0, t); await typeText(a, o.text, t, true);
      if (o.sub) { const b = mk("text", { x: 40, y: 80, "font-size": 16, fill: "#6b7280", "font-family": PLAIN }); await typeText(b, o.sub, t, true); }
    },
    async table(o, t) {
      const colw = o.colw || [200, 120], rowh = o.rowh || 34, w = colw.reduce((a, b) => a + b, 0), h = rowh * o.rows.length, x = o.x, y = o.y;
      const g = mk("g", {}); REF[o.id] = g; g.box = { x, y, width: w, height: h };
      await drawPath(`M${x},${y} H${x + w} V${y + h} H${x} Z`, { layer: g, width: 2.2 }, t);
      for (let r = 1; r < o.rows.length; r++) await drawPath(`M${x},${y + r * rowh} H${x + w}`, { layer: g, width: 1.2, ms: 200 }, t);
      let cx = x;
      for (let c = 0; c < colw.length - 1; c++) { cx += colw[c]; await drawPath(`M${cx},${y} V${y + h}`, { layer: g, width: 1.2, ms: 220 }, t); }
      for (let r = 0; r < o.rows.length; r++) {
        let tx = x;
        for (let c = 0; c < colw.length; c++) {
          const head = o.head && r === 0, right = c > 0 && !head && o.align !== "left";
          const e = mk("text", { x: right ? tx + colw[c] - 10 : tx + 10, y: y + r * rowh + rowh * 0.66, "font-size": o.size || 18, fill: INK, "font-family": PLAIN,
            "font-weight": head ? 700 : 400, "text-anchor": right ? "end" : "start" }, g);
          REF[`${o.id}.${r}.${c}`] = e;
          const txt = (o.rows[r][c] ?? "") + "";
          if (txt) { if (!fast(t)) await orbTo(tx + colw[c] - 6, y + r * rowh + rowh / 2, 160, t); await typeText(e, txt, t, false, head || c === 0); }   // a heading or a row's label is not a value ("Exhibit 2")
          tx += colw[c];
        }
      }
    },
    async cell(o, t) {
      const e = REF[o.ref]; if (!e) return;
      if (o.color === "red") e.setAttribute("fill", RED);
      e.setAttribute("font-weight", 700);
      const b = box(o.ref.split(".")[0]);
      if (b && !fast(t)) await orbTo(Number(e.getAttribute("x")) + 14, Number(e.getAttribute("y")) - 6, 0, t);
      await typeText(e, o.text, t, false, o.color === "red");
    },
    async write(o, t) {
      const red = o.color === "red", e = mk("text", { x: o.x, y: o.y, "font-size": o.size || 22, fill: red ? RED : INK, "font-family": o.hand === false ? PLAIN : HAND, "font-weight": o.bold ? 700 : 400 }, red ? $("layer-red") : null);
      if (o.id) REF[o.id] = e;
      orbPen(red); if (!fast(t)) await orbTo(o.x - 16, o.y - 8, 0, t);
      await typeText(e, o.text, t, true, red); orbPen(false);
    },
    async line(o, t) {
      const a = box(o.from), b = box(o.to); if (!a || !b) return;
      const [p, r] = Array.isArray(o.from) && Array.isArray(o.to) ? [o.from, o.to] : ends(a, b);
      await drawPath(`M${p[0]},${p[1]} L${r[0]},${r[1]}`, { width: 1.6 }, t);
    },
    async arrow(o, t) {
      const a = box(o.from), b = box(o.to); if (!a || !b) return;
      const [p, r] = ends(a, b), bend = o.bend ?? 0.18, mx = (p[0] + r[0]) / 2 - (r[1] - p[1]) * bend, my = (p[1] + r[1]) / 2 + (r[0] - p[0]) * bend;
      orbPen(true);
      await drawPath(`M${p[0]},${p[1]} Q${mx},${my} ${r[0]},${r[1]}`, { color: RED, width: 3, marker: "url(#ah-red)", layer: $("layer-red") }, t);
      orbPen(false);
    },
    async bracket(o, t) {
      const b = box(o.ref); if (!b) return;
      const p = o.pad ?? 8, x0 = b.x - p, y0 = b.y - p, x1 = b.x + b.width + p, y1 = b.y + b.height + p, k = Math.min(24, (x1 - x0) / 4, (y1 - y0) / 3);
      orbPen(true);
      for (const d of [`M${x0},${y0 + k} V${y0} H${x0 + k}`, `M${x1 - k},${y0} H${x1} V${y0 + k}`, `M${x1},${y1 - k} V${y1} H${x1 - k}`, `M${x0 + k},${y1} H${x0} V${y1 - k}`])
        await drawPath(d, { color: RED, width: 3.4, ms: 220, layer: $("layer-red") }, t);
      orbPen(false);
    },
    async circle(o, t) {
      const b = box(o.ref); if (!b) return;
      const [cx, cy] = mid(b), rx = b.width / 2 + 16, ry = b.height / 2 + 12;
      orbPen(true);
      await drawPath(`M${cx + rx},${cy} A${rx},${ry} 0 1 1 ${cx + rx - 0.1},${cy - 4}`, { color: RED, width: 3, layer: $("layer-red") }, t);
      orbPen(false);
    },
    async highlight(o, t) {
      const b = box(o.ref); if (!b) return;
      const r = mk("rect", { x: b.x - 4, y: b.y - 2, width: b.width + 8, height: b.height + 4, rx: 3, fill: o.color || HI, opacity: fast(t) ? .75 : 0 }, $("layer-hi"));
      if (!fast(t)) { await orbTo(b.x + b.width / 2, b.y - 10, 0, t); for (let i = 1; i <= 8; i++) { r.setAttribute("opacity", (.75 * i / 8).toFixed(2)); await sleep(30 / speed); } }
    },
    async strike(o, t) {
      const e = REF[o.ref]; if (!e) return;
      const b = e.getBBox();
      orbPen(true);
      await drawPath(`M${b.x - 3},${b.y + b.height * 0.55} L${b.x + b.width + 3},${b.y + b.height * 0.45}`, { color: RED, width: 2.6, ms: 300, layer: $("layer-red") }, t);
      if (o.text) {
        const anchorEnd = e.getAttribute("text-anchor") === "end";
        e.setAttribute("opacity", ".55");
        const n = mk("text", { x: anchorEnd ? b.x - 10 : b.x + b.width + 10, y: Number(e.getAttribute("y")), "font-size": (Number(e.getAttribute("font-size")) || 18) + 2,
          fill: RED, "font-weight": 700, "font-family": PLAIN, "text-anchor": anchorEnd ? "end" : "start" }, $("layer-red"));
        if (o.id) REF[o.id] = n;
        await typeText(n, o.text, t, true, true);
      }
      orbPen(false);
    },
    async wait(o, t) { if (!fast(t)) await sleep((o.ms || 600) / speed); },
  };

  // ---------------------------------------------------------------- beside the board: the case, the question, what it covers
  // The whole question on the left, there through the whole video (the owner, 24 October 2026: "I want the full question on the left
  // ... then 1 of 4 as we go through it"): a mock's or a practice printout's case and question as parts of the owner's own page
  // pictures (S.mock, from standalone/video_geometry.py), never retyped; otherwise a typed case (S.case: a title and Markdown) and the
  // question's text. Under it, what the question covers, from the notes: a coverage note, not a list of misses. Scenes light the
  
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let MADE = new Set();   // the videos made so far (static/videos/index.json), for the links to the case's other questions
  const PAGEW = (() => { const need = Math.min(890, (innerWidth || 890) * 0.6) * (devicePixelRatio || 1); return [1000, 1300, 1700].find((w) => w >= 0.9 * need) || 1700; })();
  // A part of a page, [page, y0, y1, x0, x1] in points, cut from the page picture, every part at one scale (the printout's text
  
  function crop(M, part, label, flush, prev) {
    const k = M.dpi / 72, W = M.width * k, H = (M.bottom - M.top) * k, [p, y0, y1, x0, x1] = part, fw = M.frame[1] - M.frame[0];
    const rx = x0 * k, ry = (y0 - M.top) * k, rw = Math.max(1, (x1 - x0) * k), rh = Math.max(1, (y1 - y0) * k), pc = (v) => v.toFixed(2);
    const figs = (M.figures || []).filter((f) => f[1] === p && f[3] >= y0 - 1 && f[5] <= y1 + 1 && f[2] >= x0 - 1 && f[4] <= x1 + 1).map((f) =>
      `<span class="pv-fig" data-v="${esc(f[0])}" style="left:${pc((f[2] * k - rx) / rw * 100)}%;top:${pc(((f[3] - M.top) * k - ry) / rh * 100)}%;width:${pc((f[4] - f[2]) * k / rw * 100)}%;height:${pc((f[5] - f[3]) * k / rh * 100)}%"></span>`).join("");
    const width = Math.min(100, (x1 - x0) / fw * 100), indent = flush ? 0 : Math.max(0, Math.min(100 - width, (x0 - M.frame[0]) / fw * 100));
    const src = `mockpage?s=${encodeURIComponent(M.session)}&p=${p}&f=webp&w=${PAGEW}${M.pv ? `&v=${M.pv}` : ""}`;
    return `<div class="pv-crop${prev && prev[0] !== p ? " pg" : ""}" style="width:${pc(width)}%;margin-left:${pc(indent)}%;aspect-ratio:${rw.toFixed(1)}/${rh.toFixed(1)}" role="img" aria-label="${esc(label)}">`
      + `<img src="${src}" alt="" decoding="async" onload="this.parentNode.classList.add('ok')" style="width:${(W / rw * 100).toFixed(3)}%;height:${(H / rh * 100).toFixed(3)}%;left:${(-rx / rw * 100).toFixed(3)}%;top:${(-ry / rh * 100).toFixed(3)}%">${figs}</div>`;
  }
  function sideHead(title, qs, n, idOf) {   // the case's name and the questions it applies to, on the case; beside "Question n · i of N", its
    $("vt").innerHTML = title;                 // questions: this one, and links to those with a video (the owner, 24 October 2026)
    $("case-h").textContent = qs.length > 1 ? `The case · Q${qs[0]}–Q${qs[qs.length - 1]}` : "The case";
    $("qnav").innerHTML = qs.length > 1 ? qs.map((x) => { const id = idOf(x);
      return x === n ? `<span class="on" aria-current="true">Q${x}</span>` : MADE.has(id) ? `<a href="${location.pathname.split("/").pop()}#q=${encodeURIComponent(id)}">Q${x}</a>` : `<span class="off" title="No video for this one yet">Q${x}</span>`; }).join("") : "";
    const nx = qs[qs.indexOf(n) + 1] ?? (typeof n === "number" ? n + 1 : undefined);   // on through the session, case by case
    if (nx !== undefined && MADE.has(idOf(nx))) { $("nextq").href = `${location.pathname.split("/").pop()}#q=${encodeURIComponent(idOf(nx))}`; $("nextq").textContent = `Question ${nx} ›`; $("nextq").hidden = false; }
  }
  function sideMock(M) {
    const qs = M.questions && M.questions.length ? M.questions : [M.n], i = qs.indexOf(M.n);
    const vig = M.vignette ? `Vignette ${M.vignette}${M.vignetteTitle ? `: ${esc(M.vignetteTitle)}` : ""}` : "";   // a mock's session is in the heading above
    sideHead(M.session.startsWith("pq-") ? `<b>${esc(M.sessionTitle)}</b>${vig ? ` · ${vig}` : ""}` : vig, qs, M.n, (x) => S.id.replace(/q\d+$/, `q${x}`));
    if (M.case && M.case.length) { $("case-b").innerHTML = M.case.map((p, j) => crop(M, p, `The case, page ${p[0]} of your printout`, false, M.case[j - 1])).join(""); $("side-case").hidden = false; }
    $("q-h").textContent = qs.length > 1 ? `Question ${M.n} · ${i + 1} of ${qs.length}` : `Question ${M.n}`;
    $("side-stem").innerHTML = `<div class="pv-sheet">${M.stem.map((p, j) => crop(M, p, `Question ${M.n}, from your printout`, false, M.stem[j - 1])).join("")}</div>`;
    const L = Object.keys(M.options || {});
    $("side-opts").innerHTML = L.length ? L.map((k) => `<li data-k="${esc(k)}"><div class="pv-sheet">${M.options[k].map((p) => crop(M, p, `Choice ${k}, from your printout`, true)).join("")}</div></li>`).join("")
      : `<li class="pv-essay">A written answer: the board works a full-mark answer.</li>`;
    $("side-q").hidden = false;
  }
  function sideCase(C, qs, n) {   // a typed case: its name, its text and tables
    sideHead(`<b>${esc(C.title || "The case")}</b>`, qs || [], n, (x) => (C.ids ? C.ids[x - 1] : S.id.replace(/q\d+$/, `q${x}`)));
    $("case-b").innerHTML = mdLite(C.md || ""); $("case-b").classList.add("typed"); $("side-case").hidden = false;
  }
  function sideQuestion(o, head) {   // the question's text, its choices stacked as on the exam
    if (head) $("q-h").textContent = head;
    $("side-stem").innerHTML = `<p>${mdInline(o.stem)}</p>`;
    const L = Object.keys(o.options || {});
    $("side-opts").innerHTML = L.length ? L.map((k) => `<li data-k="${esc(k)}"><b>${esc(k)}.</b> ${mdInline(o.options[k])}</li>`).join("") : `<li class="pv-essay">A written answer: the board works a full-mark answer.</li>`;
    $("side-q").hidden = false;
  }
  function sideCovers(c) {
    if (!c) return;
    $("side-cov-b").innerHTML = (c.module ? `<p class="pv-cov-m"${c.outcome ? ` title="${esc(c.outcome)}"` : ""}>${esc(c.module)}</p>` : "")
      + (c.points && c.points.length ? `<ul>${c.points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
    $("side-cov").hidden = false;
  }
  const mdInline = (x) => esc(x).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<i>$2</i>");   // **bold**, *italics*
  function mdLite(src) {   // a typed case's text: paragraphs, **bold**, *italics*, headings and pipe tables
    const out = [], inl = (x) => mdInline(x).replace(/\d[\d,]*(?:\.\d+)?/g, (n) => `<span class="pv-num" data-v="${n}">${n}</span>`);   
    let para = [], tbl = [];
    const endP = () => { if (para.length) out.push(`<p>${inl(para.join(" "))}</p>`); para = []; };
    const endT = () => {
      if (!tbl.length) return;
      const rows = tbl.filter((r) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(r)).map((r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      const num = (c) => /^[\s(−+$€£-]*[\d.,]+\s*(%|bp|bps|x|×)?\)?$/.test(c);
      out.push(`<div class="pv-tw"><table>${rows.map((r, i) => `<tr>${r.map((c, j) => i ? `<td${j && num(c) ? ' class="r"' : ""}>${inl(c)}</td>` : `<th>${inl(c)}</th>`).join("")}</tr>`).join("")}</table></div>`); tbl = [];
    };
    for (const l of String(src).replace(/\r\n?/g, "\n").split("\n")) {
      if (/^\s*\|/.test(l)) { endP(); tbl.push(l); continue; }
      endT();
      const h = l.match(/^#{1,6}\s+(.*)/);
      if (h) { endP(); out.push(`<h4>${inl(h[1])}</h4>`); } else if (!l.trim()) endP(); else para.push(l.trim());
    }
    endP(); endT();
    return out.join("");
  }
  function seeInSide(el, middle) {   // brings a part of the left column into its view, without moving the page
    const sd = $("side"), a = sd.getBoundingClientRect(), b = el.getBoundingClientRect();
    if (b.top >= a.top && b.bottom <= a.bottom) return;
    sd.scrollBy({ top: b.top - a.top - (middle ? a.height / 3 : 8), behavior: "smooth" });
  }
  function splitter() {   // the line between the columns: drag it (or ← → on it) to give the case or the board more room; kept in this browser
    const main = document.querySelector(".pv-main"), h = $("split");
    const set = (f) => { f = Math.max(0.25, Math.min(0.65, f)); main.style.setProperty("--split", `${(f * 100).toFixed(1)}%`); h.setAttribute("aria-valuenow", String(Math.round(f * 100))); return f; };
    let f = 0.42;
    try { const v = parseFloat(localStorage.getItem("pv-split")); if (v) f = v; } catch { /* the default */ }
    f = set(f);
    const keep = () => { try { localStorage.setItem("pv-split", String(f)); } catch { /* not kept */ } };
    h.addEventListener("pointerdown", (e) => {
      h.setPointerCapture(e.pointerId); h.classList.add("drag");
      const move = (ev) => { const r = main.getBoundingClientRect(); f = set((ev.clientX - r.left) / r.width); };
      const up = () => { h.removeEventListener("pointermove", move); h.removeEventListener("pointerup", up); h.removeEventListener("pointercancel", up); h.classList.remove("drag"); keep(); };
      h.addEventListener("pointermove", move); h.addEventListener("pointerup", up); h.addEventListener("pointercancel", up);
    });
    h.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); f = set(f + (e.key === "ArrowLeft" ? -0.02 : 0.02)); keep(); } });
  }

  // ---------------------------------------------------------------- the voice and the captions
  const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
  const AU = { el: null, nat: !!(window.Site && Site.voice) };
  const canSpeak = "speechSynthesis" in window;
  // sentences, without cutting a number at its decimal point ("discounted by 1.05" stays whole)
  const sentences = (t) => (String(t).replace(/(\d)\.(\d)/g, "$1\u2024$2").match(/[^.!?]+[.!?]+["')]*\s*|[^.!?]+$/g) || [t]).map((x) => x.replace(/\u2024/g, ".").trim()).filter(Boolean);
  // the words as said: a working line's symbols in words for the voice ("2.1% / 0.552" -> "2.1 percent divided by 0.552"); the
  // captions keep them as written
  const spoken = (t) => String(t).replace(/\*\*?/g, "").replace(/[\u2010\u2011]/g, "-")
    .replace(/(^|[\s(=])[−–-](?=\s?[\d.(a-zA-Zθαβσ])/g, "$1minus ").replace(/\s?×\s?/g, " times ").replace(/\s?÷\s?/g, " divided by ")
    .replace(/([\d)%])\s?\/\s?(?=[\d(])/g, "$1 divided by ").replace(/\s\/\s/g, " divided by ").replace(/\s?≈\s?/g, " about ").replace(/\s?→\s?/g, ", so ").replace(/\s?=\s?/g, " equals ")
    .replace(/\s?≤\s?/g, " at most ").replace(/\s?≥\s?/g, " at least ").replace(/\s?<\s?/g, " less than ").replace(/\s?>\s?/g, " more than ")
    .replace(/\s?\+\s?/g, " plus ").replace(/²/g, " squared").replace(/³/g, " cubed").replace(/√/g, "square root of ")
    .replace(/θ/g, "theta").replace(/α/g, "alpha").replace(/β/g, "beta").replace(/σ/g, "sigma").replace(/μ/g, "mu").replace(/Δ/g, "change in ")
    .replace(/(\d)\s?bps?\b/g, "$1 basis points").replace(/\^\(([^)]*)\)/g, " to the power $1").replace(/\^([\w.]+)/g, " to the power $1")
    .replace(/π/g, "pi").replace(/γ/g, "gamma").replace(/(\w)_(\w)/g, "$1 $2").replace(/[\u0302\u0304]/g, " hat").replace(/\s{2,}/g, " ");
  const clipOf = (text) => fetch("speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
    .then((r) => (r.ok && /audio/.test(r.headers.get("Content-Type") || "") ? r.blob() : null)).then((b) => (b && b.size > 200 ? URL.createObjectURL(b) : null)).catch(() => null);
  const clipRetry = (t) => clipOf(t).then((u) => u || sleep(1200).then(() => clipOf(t)));
  function playUrl(url, t) {
    return new Promise((res) => {
      if (t !== tok) return res();
      const a = AU.el; a.playbackRate = speed; a.onended = a.onerror = () => { URL.revokeObjectURL(url); res(); }; a.src = url; a.playbackRate = speed;
      const p = a.play(); if (p && p.catch) p.catch(() => res());
    });
  }
  function sayBrowser(text, t) {
    return new Promise((res) => {
      if (!canSpeak || t !== tok) return res();
      const u = new SpeechSynthesisUtterance(text), vs = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
      const v = vs.find((x) => /natural|neural|premium|enhanced|siri/i.test(x.name)) || vs.find((x) => /samantha|daniel|karen|ava|allison|aria|jenny/i.test(x.name)) || vs[0];
      if (v) u.voice = v;
      u.rate = speed; u.onend = u.onerror = () => res();
      speechSynthesis.speak(u);
    });
  }
  const PRE = new Map();   // the next scene's first sentence, fetched while this scene's last one plays: no gap between scenes
  async function narrate(text, t, after) {
    if (!text) return;
    const parts = sentences(text), voice = on("voice");
    let next = voice && AU.nat ? PRE.get(parts[0]) || clipRetry(spoken(parts[0])) : null;
    PRE.clear();
    for (let i = 0; i < parts.length; i++) {
      if (t !== tok) return;
      $("cap").textContent = parts[i];
      if (!voice) { await sleep(Math.max(1400, parts[i].length * 62) / speed); continue; }
      const url = next ? await next : null;
      if (t !== tok) return;
      next = AU.nat && parts[i + 1] ? clipRetry(spoken(parts[i + 1])) : null;
      if (!next && after && AU.nat) { const f = sentences(after)[0]; if (f) PRE.set(f, clipRetry(spoken(f))); }
      if (url) await playUrl(url, t); else await sayBrowser(spoken(parts[i]), t);
    }
  }
  function hush() { try { if (canSpeak) speechSynthesis.cancel(); } catch { /* nothing speaking */ } if (AU.el) { try { AU.el.pause(); } catch { /* nothing playing */ } } }
  function unlock() {   // while the tap that started it is being handled: lets an iPad play the voice later
    if (AU.nat) { try { AU.el = AU.el || new Audio(); AU.el.src = SILENCE; const p = AU.el.play(); if (p && p.catch) p.catch(() => {}); } catch { AU.nat = false; } }
    else if (canSpeak) { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } catch { /* speaks later */ } }
  }

  // ---------------------------------------------------------------- the player
  let PARTS = [], shown = -1;   // the walkthrough's parts (where each new idea starts); the board shows every scene up to `shown`, finished
  const partAt = (i) => { let k = 0; PARTS.forEach((p, j) => { if (p.i <= i) k = j; }); return k; };
  const base = (i) => { for (let b = i; b > 0; b--) if (S.scenes[b].fresh) return b; return 0; };   // the page scene i is drawn on starts here
  // Voice, captions (CC) and the numbered steps are toggle buttons; each viewer's choice is kept in this browser
  const on = (id) => $(id).getAttribute("aria-pressed") === "true";
  function tog(id, v) { $(id).setAttribute("aria-pressed", String(v)); try { localStorage.setItem(`pv-${id}`, v ? "1" : "0"); } catch { /* not kept */ } shows(); }
  function shows() { $("cap").hidden = !on("caps"); $("steps").hidden = !on("steps-t"); }
  function clear() { for (const id of ["layer-hi", "layer-ink", "layer-red"]) $(id).innerHTML = ""; REF = {}; penOff(); orbPen(false); $("layer-say").innerHTML = ""; $("cap").textContent = ""; $("tip").hidden = true; $("side-q").classList.remove("lit"); for (const li of $("side-opts").children) li.classList.remove("right", "wrong"); for (const f of document.querySelectorAll("#side .lit")) f.classList.remove("lit"); }
  async function runOps(ops, t) { for (const o of ops || []) { if (t !== tok && !fast(t)) return; if (OPS[o.op]) await OPS[o.op](o, t); } }
  function paintSteps() {
    $("steps").innerHTML = S.scenes.map((s, i) => `<button type="button" data-i="${i}" class="${i === at ? "on" : i < at ? "done" : ""}">${i + 1}. ${s.label || "Step"}</button>`).join("");
    const k = partAt(at);   // the progress, part by part, each as wide as its share of the steps
    $("parts").innerHTML = PARTS.map((p, j) => {
      const end = j + 1 < PARTS.length ? PARTS[j + 1].i : S.scenes.length, fill = at >= end ? 100 : at < p.i ? 0 : Math.round(100 * (at - p.i + 1) / (end - p.i));
      return `<button type="button" data-i="${p.i}" style="flex:${end - p.i} 1 0" class="${j === k ? "on" : j < k ? "done" : ""}" title="Part ${j + 1}: ${esc(p.title)}"><span>${esc(p.title)}</span><i style="width:${fill}%"></i></button>`;
    }).join("");
    $("prev").disabled = at === 0; $("next").disabled = at >= S.scenes.length - 1;
  }
  
  // redrawn, the next scene's voice fetched ahead; the narrator's board points give way, and a new part (a scene's `part`) lets the
  // last part's tip go. A jump (the buttons, the parts under the board, the steps) redraws the board at once behind a short fade, as
  // does a `fresh` scene, a new page. No pauses and no cards: the parts under the board are the links (the owner, 24 October 2026).
  async function scene(i, animate) {   // the board as it stands after the scenes before i, then scene i (drawn, or at once)
    const t = ++tok, sc = S.scenes[i], cont = animate && i === shown + 1 && !sc.fresh;   // carrying straight on from the scene just drawn
    shown = -1; hush(); at = i; paintSteps();
    $("layer-say").innerHTML = "";
    if (cont && sc.part) $("tip").hidden = true;
    if (!cont) {
      if (animate) { $("board").classList.add("fading"); await sleep(170); if (t !== tok) return; }
      clear(); for (let j = base(i); j < i; j++) await runOps(S.scenes[j].ops, "instant");
      $("board").classList.remove("fading");
    }
    if (!animate) { await runOps(sc.ops, "now"); $("cap").textContent = sc.say || ""; if (t === tok) shown = i; return; }
    $("orb").classList.add("busy");
    const after = playing && S.scenes[i + 1] ? S.scenes[i + 1].say : "";
    await Promise.all([narrate(sc.say, t, after), runOps(sc.ops, t).then(() => { if (t === tok) penOff(); })]);
    $("orb").classList.remove("busy");
    if (t !== tok) return;
    shown = i; $("side-q").classList.remove("lit");   
    if (playing && i < S.scenes.length - 1) { await sleep(120 / speed); if (t === tok && playing) scene(i + 1, true); }
    else if (i >= S.scenes.length - 1) { playing = false; $("play").textContent = "▶ Play again"; }
  }
  function play() {
    unlock();
    if (playing) { playing = false; tok++; hush(); $("play").textContent = "▶ Play"; scene(at, false); return; }
    playing = true; $("play").textContent = "⏸ Pause";
    scene(at >= S.scenes.length - 1 ? 0 : at, true);   // at the end: from the start again
  }
  function step(d) { const i = Math.max(0, Math.min(S.scenes.length - 1, at + d)); unlock(); scene(i, true); }

  async function load() {
    // the question: ?q=<id>, or #q=<id> (the public copy's sign-in keeps an address's #); ?preview=: a layout check in static/videos/preview/
    try { MADE = new Set((await (await fetch("static/videos/index.json", { cache: "no-store" })).json()).videos || []); } catch { /* no links */ }
    const pre = q.get("preview"), id = pre || q.get("q") || new URLSearchParams(location.hash.slice(1)).get("q") || [...MADE][0] || "mock-a1-q20";
    addEventListener("hashchange", () => location.reload());   // another question of the same page
    try { S = await (await fetch(`static/videos/${pre ? "preview/" : ""}${encodeURIComponent(id)}.json`, { cache: "no-store" })).json(); S.id = S.id || id; }
    catch { $("stage").outerHTML = `<p class="pv-err">There is no video guide for this question yet.</p>`; return; }
    document.title = `${S.short || "Video walkthrough"} · CFA Level II Study`;
    TIE = new Map((S.ties || []).map((n, i) => [String(n), PAL[i % PAL.length]]));
    $("title").textContent = S.heading || "Video walkthrough"; $("sub").textContent = S.sub || "";
    if (S.back) $("back").href = S.back;
    if (S.backLabel) $("back").textContent = `‹ ${S.backLabel}`;
    const q0 = S.question || S.scenes.flatMap((x) => x.ops || []).find((o) => o.op === "question" && o.stem);
    if (S.mock) sideMock(S.mock);
    else { if (S.case) sideCase(S.case, S.case.questions, S.case.n); if (q0) sideQuestion(q0, S.case && S.case.questions ? `Question ${S.case.n} · ${S.case.questions.indexOf(S.case.n) + 1} of ${S.case.questions.length}` : S.qhead || ""); }
    sideCovers(S.covers); splitter();
    PARTS = S.scenes.map((x, i) => (x.part ? { i, ...x.part } : null)).filter(Boolean);
    if (!PARTS.length || PARTS[0].i !== 0) PARTS.unshift({ i: 0, title: "The question" });
    for (const id of ["voice", "caps", "steps-t"]) { try { const v = localStorage.getItem(`pv-${id}`); if (v !== null) $(id).setAttribute("aria-pressed", String(v === "1")); } catch { /* defaults */ } }
    shows();
    paintSteps(); await scene(0, false); $("cap").textContent = "Press Play: the question is worked on the board, step by step.";
    $("tip-x").addEventListener("click", () => { $("tip").hidden = true; });
    $("play").addEventListener("click", play);
    $("prev").addEventListener("click", () => step(-1));
    $("next").addEventListener("click", () => step(1));
    $("restart").addEventListener("click", () => { unlock(); playing = true; $("play").textContent = "⏸ Pause"; scene(0, true); });
    for (const id of ["steps", "parts"]) $(id).addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) { unlock(); scene(+b.dataset.i, true); } });
    for (const id of ["voice", "caps", "steps-t"]) $(id).addEventListener("click", () => { tog(id, !on(id)); if (id === "voice" && !on(id)) hush(); });
    // the speed: − and + in steps of 0.15, from 0.55× to 2.05× (the owner, 24 October 2026), the voice changing at once; kept in this browser
    const setSpeed = (v) => {
      speed = Math.round(Math.min(2.05, Math.max(0.55, v)) * 100) / 100;
      $("speed").textContent = `${speed.toFixed(2)}×`; $("slower").disabled = speed <= 0.55; $("faster").disabled = speed >= 2.05;
      if (AU.el) { try { AU.el.playbackRate = speed; } catch { /* the next sentence takes it */ } }
      try { localStorage.setItem("pv-speed", String(speed)); } catch { /* not kept */ }
    };
    try { const v = parseFloat(localStorage.getItem("pv-speed")); setSpeed(v > 0 ? v : 1); } catch { setSpeed(1); }
    $("slower").addEventListener("click", () => setSpeed(speed - 0.15));
    $("faster").addEventListener("click", () => setSpeed(speed + 0.15));
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("select, input") || (e.key === " " && e.target.closest("button"))) return;   // a focused button takes its own Space
      if (e.key === " ") { e.preventDefault(); play(); }
      else if (e.key === "ArrowRight") step(1); else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "-" || e.key === "_") $("slower").click(); else if (e.key === "+" || e.key === "=") $("faster").click();
    });
  }
  load();
})();
