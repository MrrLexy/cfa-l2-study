/* The passcode gate of a protected build. static/lock-config.js says whether this copy is locked (window.STUDY_LOCK, or null) and, if
   so, holds the public lock data: the salt, the number of rounds and a small check blob. The passcode itself is never in any file:
   what you type is turned into a key in this browser (PBKDF2), the check blob proves it is right, and the key (not the passcode)
   is kept for the session, or on this device if "keep me unlocked" is ticked. The study material is then decrypted on demand. */
(() => {
  "use strict";
  const CFG = window.STUDY_LOCK || null;
  const SKEY = "l2app.key";
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const toB64 = (u8) => { let s = ""; u8.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
  const read = (st) => { try { return st.getItem(SKEY); } catch { return null; } };
  const stored = () => {
    if (!CFG) return null;
    for (const st of [sessionStorage, localStorage]) { const v = read(st); if (v && v.startsWith(CFG.id + ":")) return v.slice(CFG.id.length + 1); }
    return null;
  };
  let keyP = null;
  const cryptoKey = () => keyP || (keyP = (async () => {
    const raw = stored();
    if (!raw) throw new Error("locked");
    return crypto.subtle.importKey("raw", b64(raw), "AES-GCM", false, ["decrypt"]);
  })());
  async function open(blob, key) {
    const bytes = b64(blob);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
    return new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  }
  function forget() { for (const st of [sessionStorage, localStorage]) { try { st.removeItem(SKEY); } catch { /* nothing kept */ } } keyP = null; }
  async function unlock(pass, remember) {
    if (!window.crypto || !crypto.subtle || typeof DecompressionStream === "undefined") throw new Error("This browser can't unlock the app (it needs a recent Safari, Chrome or Firefox, and https or a local file).");
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(pass || "").trim()), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: b64(CFG.salt), iterations: CFG.iter, hash: "SHA-256" }, base, 256);
    const key = await crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["decrypt"]);
    let ok = false;
    try { ok = (await open(CFG.check, key)) === "cfa-l2-ok"; } catch { ok = false; }
    if (!ok) throw new Error("That passcode isn't right.");
    forget();
    try { (remember ? localStorage : sessionStorage).setItem(SKEY, CFG.id + ":" + toB64(new Uint8Array(bits))); } catch { throw new Error("This browser won't keep the passcode, so the app can't open here."); }
    keyP = Promise.resolve(key);
  }
  // the study data: decrypted when a page asks for it; a key that no longer fits (a new build with a new passcode) sends you back to the login
  function readBlob(blob) {
    return cryptoKey().then((k) => open(blob, k)).catch((e) => {
      forget();
      const here = (location.pathname.split("/").pop() || "app.html") + location.hash;
      try { window.stop(); } catch { /* fine */ }
      location.replace("index.html?next=" + encodeURIComponent(here));
      throw e;
    });
  }
  window.StudyLock = { locked: !!CFG, hasKey: () => !CFG || !!stored(), remembered: () => { try { return !!read(localStorage) && !!stored(); } catch { return false; } }, unlock, forget, read: readBlob };
})();
