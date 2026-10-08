/* Simple profiles for the stand-alone CFA study app. A profile is just a username: no password, no account anywhere.
   Everything the app saves (Path progress, outcome ticks, what you've read, case-study answers) is stored in this browser under
   the profile you signed in as, so each username keeps its own progress. To move a profile to another device, export it from
   the profile menu and import the file there.

   Pages call StudyProfile.guard() first: with nobody signed in (a new visit, or after signing out) they go to index.html, which asks
   for the username and comes back. A plain refresh keeps you signed in; set PROMPT_ON_REFRESH to ask again after every refresh. */
(() => {
  "use strict";
  const PROMPT_ON_REFRESH = false;
  const USERS = "l2app.users", LAST = "l2app.last", SESSION = "l2app.session";
  const proto = Storage.prototype, rawGet = proto.getItem, rawSet = proto.setItem, rawDel = proto.removeItem, rawKey = proto.key;
  const own = (k) => String(k).startsWith("l2app.");
  const flat = (s) => String(s || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  const idOf = (s) => flat(s).toLowerCase();
  const valid = (s) => /^[\p{L}\p{N}][\p{L}\p{N} ._'-]{0,23}$/u.test(s);

  // the signed-in name lives in this tab's session (and falls back to the device if the browser has no session storage)
  const sget = () => { try { return sessionStorage.getItem(SESSION); } catch { try { return rawGet.call(localStorage, SESSION); } catch { return null; } } };
  const sset = (v) => { try { v === null ? sessionStorage.removeItem(SESSION) : sessionStorage.setItem(SESSION, v); } catch { try { v === null ? rawDel.call(localStorage, SESSION) : rawSet.call(localStorage, SESSION, v); } catch { /* not kept */ } } };
  function list() { try { const v = JSON.parse(rawGet.call(localStorage, USERS)); return Array.isArray(v) ? v : []; } catch { return []; } }
  const saveList = (l) => { try { rawSet.call(localStorage, USERS, JSON.stringify(l)); } catch { /* not kept */ } };

  let user = null;
  const reload = (() => { try { const n = performance.getEntriesByType("navigation")[0]; return !!n && n.type === "reload"; } catch { return false; } })();
  if (PROMPT_ON_REFRESH && reload) sset(null);
  { const id = sget(); user = id ? list().find((u) => u.id === id) || null : null; }

  // Everything the app keeps in localStorage belongs to the signed-in profile; with nobody signed in, nothing is read or written.
  const ns = (k) => (user ? `l2app.u.${user.id}.${k}` : null);
  proto.getItem = function (k) { if (this !== localStorage || own(k)) return rawGet.call(this, k); const n = ns(k); return n ? rawGet.call(this, n) : null; };
  proto.setItem = function (k, v) { if (this !== localStorage || own(k)) return rawSet.call(this, k, v); const n = ns(k); if (n) rawSet.call(this, n, v); };
  proto.removeItem = function (k) { if (this !== localStorage || own(k)) return rawDel.call(this, k); const n = ns(k); if (n) rawDel.call(this, n); };

  function signIn(name) {
    const nm = flat(name);
    if (!valid(nm)) throw new Error("Use 1 to 24 letters, numbers, spaces or . _ ' - characters, starting with a letter or number.");
    const id = idOf(nm), l = list();
    let u = l.find((x) => x.id === id);
    if (!u) { u = { id, name: nm, created: Date.now() }; l.push(u); }
    u.last = Date.now();
    saveList(l);
    try { rawSet.call(localStorage, LAST, u.name); } catch { /* not kept */ }
    sset(u.id);
    user = u;
    return u;
  }
  // Some browsers give every file opened from a folder its own private storage, so the page after the login can't see who signed in:
  // the login page passes the name along (?as=Name) and the page signs in again by itself, then tidies the address.
  { const as = new URLSearchParams(location.search).get("as");
    if (as !== null) {
      if (!user && valid(flat(as))) { try { signIn(as); } catch { /* the guard sends you to the login */ } }
      try { history.replaceState(null, "", location.pathname + location.hash); } catch { /* the address keeps ?as= */ }
    } }
  function signOut() { sset(null); user = null; location.href = "index.html"; }
  function guard() {
    if (user && (!window.StudyLock || StudyLock.hasKey())) return true;
    const here = (location.pathname.split("/").pop() || "app.html") + location.hash;
    try { window.stop(); } catch { /* the rest of the page just isn't needed */ }
    location.replace("index.html?next=" + encodeURIComponent(here));
    return false;
  }

  // ---- move a profile between devices
  function exportData() {
    const prefix = `l2app.u.${user.id}.`, data = {};
    for (let i = 0; i < localStorage.length; i++) { const k = rawKey.call(localStorage, i); if (k && k.startsWith(prefix)) data[k.slice(prefix.length)] = rawGet.call(localStorage, k); }
    return { app: "cfa-l2-study", version: 1, user: user.name, exported: new Date().toISOString(), data };
  }
  function download() {
    const blob = new Blob([JSON.stringify(exportData(), null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cfa-l2-progress-${user.id.replace(/[^\p{L}\p{N}]+/gu, "-")}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function mergeData(file) {
    return file.text().then((t) => {
      const j = JSON.parse(t);
      if (!j || j.app !== "cfa-l2-study" || typeof j.data !== "object") throw new Error("That isn't a progress file from this app.");
      for (const [k, v] of Object.entries(j.data)) {
        const cur = localStorage.getItem(k);
        if (cur === null) { localStorage.setItem(k, v); continue; }
        try {
          const a = JSON.parse(cur), b = JSON.parse(v);
          if (k === "study.path.v1" && a && b && a.mods && b.mods) {   // per section, the newer copy wins
            for (const [m, s] of Object.entries(b.mods)) if (s && (s.t || 0) > ((a.mods[m] || {}).t || 0)) a.mods[m] = s;
            if (!a.exam && b.exam) a.exam = b.exam;
            a.updated = Date.now();
            localStorage.setItem(k, JSON.stringify(a));
          } else if (k === "site-rapid-v1" && a && b && a.q && b.q) {   // rapid fire: per question, the copy answered last wins
            for (const [id, h] of Object.entries(b.q)) if (Array.isArray(h) && (h[3] || 0) > ((a.q[id] || [])[3] || 0)) a.q[id] = h;
            localStorage.setItem(k, JSON.stringify(a));
          } else if (Array.isArray(a) && Array.isArray(b)) localStorage.setItem(k, JSON.stringify([...new Set([...a, ...b])]));
          else if (a && b && typeof a === "object" && typeof b === "object") localStorage.setItem(k, JSON.stringify({ ...b, ...a }));
        } catch { /* keep what is here */ }
      }
    });
  }

  // ---- the little profile menu in the top bar
  function mountBar(el) {
    if (!el || !user) return;
    el.className = "ubar";
    el.innerHTML = `<button type="button" class="ubtn" aria-haspopup="menu" aria-expanded="false" title="Your profile"><span aria-hidden="true">●</span> <b></b> <span aria-hidden="true">▾</span></button>
      <div class="umenu" role="menu" hidden><div class="uwho">Signed in as <b></b></div>
        <button type="button" role="menuitem" data-u="switch">Switch user or sign out</button>
        <button type="button" role="menuitem" data-u="export">Export my progress</button>
        <button type="button" role="menuitem" data-u="import">Import progress…</button>
        <button type="button" role="menuitem" data-u="lock" hidden>Lock the app on this device</button>
        <input type="file" accept="application/json,.json" hidden></div>`;
    el.querySelector(".ubtn b").textContent = user.name;
    el.querySelector(".uwho b").textContent = user.name;
    if (window.StudyLock && StudyLock.locked && StudyLock.remembered()) el.querySelector("[data-u=lock]").hidden = false;
    const btn = el.querySelector(".ubtn"), menu = el.querySelector(".umenu"), file = el.querySelector("input");
    const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
    btn.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden)); });
    document.addEventListener("click", (e) => { if (!el.contains(e.target)) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    menu.addEventListener("click", (e) => {
      const b = e.target.closest("[data-u]");
      if (!b) return;
      close();
      if (b.dataset.u === "switch") signOut();
      else if (b.dataset.u === "export") download();
      else if (b.dataset.u === "import") file.click();
      else if (b.dataset.u === "lock") { StudyLock.forget(); signOut(); }
    });
    file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      if (!f) return;
      mergeData(f).then(() => { alert("Progress imported. The page will reload."); location.reload(); }).catch((err) => alert(err.message || "Couldn't read that file."));
    });
  }
  const css = document.createElement("style");
  css.textContent = `.ubar{position:relative;margin-left:auto}.ubtn{font:inherit;font-size:14px;cursor:pointer;border:1px solid var(--line-strong,#555);background:var(--card,#222);color:var(--ink,#eee);border-radius:999px;padding:6px 12px;min-height:36px;display:inline-flex;align-items:center;gap:6px;max-width:220px}
.ubtn b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.ubtn:hover{border-color:var(--accent,#8aa8ff)}
.umenu{position:absolute;right:0;top:calc(100% + 6px);z-index:60;min-width:230px;background:var(--card,#222);color:var(--ink,#eee);border:1px solid var(--line-strong,#555);border-radius:12px;padding:6px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.umenu[hidden]{display:none}.uwho{padding:8px 10px;font-size:13px;color:var(--muted,#aaa)}.uwho b{color:var(--ink,#eee)}
.umenu button{display:block;width:100%;text-align:left;font:inherit;font-size:14px;background:none;border:0;color:inherit;border-radius:8px;padding:10px;cursor:pointer;min-height:40px}.umenu button:hover{background:var(--accent-soft,#2a3350)}`;
  document.head.appendChild(css);

  window.StudyProfile = { list, signIn, signOut, guard, mountBar, user: () => user, lastName: () => { try { return rawGet.call(localStorage, LAST) || ""; } catch { return ""; } }, valid: (s) => valid(flat(s)) };
})();
