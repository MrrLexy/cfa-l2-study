/* Stand-alone glue: the study pages ask for their data by address (a path, a map, a glossary, the case studies). Here every one of those
   addresses is answered from the data files bundled with the app (static/data/*.js), and the few that only make sense with a server
   (live progress sync, answer statistics) answer "not available" so the pages carry on without them. */
(() => {
  "use strict";
  const DATA = (window.__STUDY_DATA = window.__STUDY_DATA || {});
  const cache = {}, pending = {}, loading = {};
  // a guided lesson's data file is fetched only when that lesson is opened
  const lazy = (u) => { const m = u.match(/^static\/lessons\/([a-z0-9-]+)\.json$/); return m ? `static/data/lesson-${m[1]}.js` : null; };
  const script = (src) => loading[src] || (loading[src] = new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }));
  const realFetch = window.fetch.bind(window);
  const reply = (body, status) => new Response(body, { status: status || 200, headers: { "Content-Type": "application/json" } });
  window.fetch = (input, init) => {
    const raw = typeof input === "string" ? input : (input && input.url) || "";
    const u = raw.split("?")[0].replace(/^\.\//, "").replace(/^.*?\/(static\/)/, "$1");
    if (u in DATA) return Promise.resolve(reply(cache[u] || (cache[u] = JSON.stringify(DATA[u]))));
    const ENC = window.__STUDY_ENC;   // a passcode-protected copy: the same data, encrypted, opened with the key from the login
    if (ENC && u in ENC) return (pending[u] || (pending[u] = StudyLock.read(ENC[u]))).then((text) => reply(text), () => reply("{}", 500));
    const src = lazy(u);
    if (src && !loading[src]) return script(src).then(() => window.fetch(input, init), () => reply("{}", 404));
    return realFetch(input, init);
  };
  window.Site = { links: { home: "app.html", map: "app.html", cases: "cases.html" }, local: false, fill() {} };
  document.addEventListener("DOMContentLoaded", () => {
    if (window.StudyProfile) StudyProfile.mountBar(document.getElementById("userbar"));
    const here = location.pathname.split("/").pop() || "app.html";
    document.querySelectorAll(".site-nav a").forEach((a) => { if (a.getAttribute("href") === here) a.setAttribute("aria-current", "page"); });
  });
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    const had = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (had && !reloaded) { reloaded = true; location.reload(); } });  // a new version took over
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
