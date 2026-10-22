/*
 * rpj-shim.js: lets BIG RPJ's apps run as plain web pages.
 * The apps were built for Claude's artifact viewer, which provides window.claude.use("sample" | "db" | "user").
 * This file provides the same calls, but routes them to your own relay server (Cloudflare Worker):
 *   sample -> POST /ai   (the Anthropic key stays on the server)
 *   db     -> GET/PUT /data (your progress, saved in Cloudflare KV)
 * The relay only answers when this browser knows your app passcode. You enter it once; it's kept in this browser.
 * Load it first:  <script src="../rpj-shim.js" data-app="cissp"></script>
 */
(function () {
  "use strict";
  var RELAY = "https://rpj-relay.REPLACE-ME.workers.dev"; // set after the Worker is deployed
  var APP = (document.currentScript && document.currentScript.dataset.app) || "app";
  var PASS_KEY = "rpj-pass", URL_KEY = "rpj-relay";

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function relay() { var u = (ls(URL_KEY) || RELAY || "").replace(/\/+$/, ""); return /REPLACE-ME/.test(u) ? "" : u; }
  function pass() { return ls(PASS_KEY) || ""; }

  /* ---------- unlock panel: one small pill, never in the way ---------- */
  var waiters = [];
  function ready() { return !!(relay() && pass()); }
  function whenReady() { return ready() ? Promise.resolve() : new Promise(function (r) { waiters.push(r); showPill(); }); }
  var pill = null;
  function css() {
    if (document.getElementById("rpj-shim-css")) return;
    var s = document.createElement("style"); s.id = "rpj-shim-css";
    s.textContent = "#rpj-pill{position:fixed;right:max(12px,env(safe-area-inset-right,0px));bottom:calc(92px + env(safe-area-inset-bottom,0px));z-index:2147483000;font:600 13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}" +
      "#rpj-pill button.p{border:0;border-radius:999px;padding:9px 14px;background:#111827;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.3);cursor:pointer}" +
      "#rpj-pill form{background:#111827;color:#fff;border-radius:14px;padding:12px;display:grid;gap:8px;width:min(300px,calc(100vw - 32px));box-shadow:0 10px 30px rgba(0,0,0,.4)}" +
      "#rpj-pill input{font:15px -apple-system,BlinkMacSystemFont,sans-serif;padding:9px 10px;border-radius:8px;border:1px solid #374151;background:#0b1220;color:#fff}" +
      "#rpj-pill form button{border:0;border-radius:8px;padding:9px;background:#f2b84b;color:#1a1205;font-weight:700;cursor:pointer}" +
      "#rpj-pill small{color:#9ca3af;font-weight:500;line-height:1.35}#rpj-pill .x{background:none;border:0;color:#9ca3af;cursor:pointer;justify-self:end;padding:0}";
    document.head.appendChild(s);
  }
  function showPill(open, msg) {
    if (!document.body) { document.addEventListener("DOMContentLoaded", function () { showPill(open, msg); }); return; }
    css();
    if (!pill) { pill = document.createElement("div"); pill.id = "rpj-pill"; document.body.appendChild(pill); }
    if (!open) { pill.innerHTML = '<button class="p" type="button">🔒 Unlock AI + sync</button>'; pill.firstChild.onclick = function () { showPill(true); }; return; }
    var needUrl = !relay();
    pill.innerHTML = '<form><button class="x" type="button" aria-label="Close">✕</button>' +
      '<b>Unlock your apps</b><small>' + (msg || "Enter your app passcode once. It stays in this browser only.") + '</small>' +
      (needUrl ? '<input id="rpj-url" placeholder="Relay URL (https://…workers.dev)" autocomplete="off">' : "") +
      '<input id="rpj-pw" type="password" placeholder="App passcode" autocomplete="current-password">' +
      '<button type="submit">Unlock</button></form>';
    var f = pill.querySelector("form");
    pill.querySelector(".x").onclick = function () { showPill(false); };
    f.onsubmit = function (e) {
      e.preventDefault();
      var u = pill.querySelector("#rpj-url"), p = pill.querySelector("#rpj-pw").value.trim();
      if (u && u.value.trim()) ls(URL_KEY, u.value.trim());
      if (!p) return;
      ls(PASS_KEY, p);
      call("GET", "/data?k=" + encodeURIComponent(APP + ":ping")).then(function () {
        pill.remove(); pill = null; var w = waiters; waiters = []; w.forEach(function (r) { r(); });
      }).catch(function (err) {
        ls(PASS_KEY, null); showPill(true, err && err.code === "not_granted" ? "That passcode didn't work. Try again." : "Couldn't reach your relay server. Check the URL and your connection.");
      });
    };
    setTimeout(function () { var i = pill && pill.querySelector(needUrl ? "#rpj-url" : "#rpj-pw"); if (i) i.focus(); }, 0);
  }

  /* ---------- talking to the relay ---------- */
  function call(method, path, body) {
    return fetch(relay() + path, {
      method: method,
      headers: Object.assign({ "x-app-pass": pass() }, body !== undefined ? { "content-type": "application/json" } : {}),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.ok) return d;
        if (r.status === 401) { ls(PASS_KEY, null); showPill(false); throw { code: "not_granted", message: "Passcode needed" }; }
        if (r.status === 429) throw { code: "rate_limited", message: "Busy, try again shortly" };
        throw { code: d.error || "http_" + r.status, message: d.error || "Request failed" };
      });
    }, function () { throw { code: "network", message: "Can't reach the relay server" }; });
  }

  /* sample: same call shape as Claude's artifact runtime */
  function sample(input, opts) {
    opts = opts || {};
    var messages = typeof input === "string" ? [{ role: "user", content: input }] : input;
    return whenReady().then(function () {
      return call("POST", "/ai", { messages: messages, tier: opts.modelTier || "default", max_tokens: 1800 });
    }).then(function (d) {
      var text = d.text || "";
      if (opts.onText) try { opts.onText({ text: text, delta: text }); } catch (e) {}
      return { text: text, truncated: !!d.truncated };
    });
  }
  sample.json = function (input, opts) {
    return sample(input, opts).then(function (r) {
      var t = r.text, a = t.indexOf("{"), b = t.lastIndexOf("}"), a2 = t.indexOf("["), b2 = t.lastIndexOf("]");
      var s = (a >= 0 && (a2 < 0 || a < a2)) ? t.slice(a, b + 1) : t.slice(a2, b2 + 1);
      try { return JSON.parse(s); } catch (e) { throw { code: "invalid_json", message: "Bad JSON from AI", text: t }; }
    });
  };
  sample.limits = function () { return Promise.resolve({ images: false }); };

  /* db: documents keyed by path, namespaced per app */
  function docRef(path) {
    var key = APP + ":" + path;
    var live = /^intel/.test(path); // the Training Arc news feed isn't served here; the app falls back to news.json
    return {
      id: path.split("/").pop(),
      get: function () {
        if (live) return Promise.reject({ code: "unavailable" });
        return whenReady().then(function () { return call("GET", "/data?k=" + encodeURIComponent(key)); })
          .then(function (d) { return { exists: !!d.exists, id: path.split("/").pop(), data: function () { return d.data; } }; });
      },
      set: function (v) {
        return whenReady().then(function () { return call("PUT", "/data?k=" + encodeURIComponent(key), v); });
      },
      update: function (patch) { var self = this; return self.get().then(function (s) { return self.set(Object.assign({}, s.exists ? s.data() : {}, patch)); }); },
      onSnapshot: function (cb, err) {
        if (live) { setTimeout(function () { err && err({ code: "unavailable" }); }, 0); return function () {}; }
        this.get().then(cb, function (e) { err && err(e); }); return function () {};
      },
    };
  }
  function collection(path) {
    var q = {
      doc: function (id) { return docRef(path + "/" + id); },
      where: function () { return q; }, orderBy: function () { return q; }, limit: function () { return q; },
      get: function () { return Promise.reject({ code: "unavailable" }); },
      onSnapshot: function (cb, err) { setTimeout(function () { err && err({ code: "unavailable" }); }, 0); return function () {}; },
    };
    return q;
  }
  var db = { doc: docRef, collection: collection };
  var user = {
    id: function () { return Promise.resolve("rpj"); }, me: function () { return Promise.resolve({ id: "rpj", name: "BIG RPJ" }); },
    isOwner: function () { return true; }, canEdit: function () { return true; }, can: function () { return true; },
    profiles: function () { return Promise.resolve({}); },
  };

  window.claude = {
    use: function (name) {
      if (name === "sample") return Promise.resolve(sample);
      if (name === "db") return Promise.resolve(db);
      if (name === "user") return Promise.resolve(user);
      return Promise.resolve(null);
    },
  };
  if (!ready()) showPill(false);
})();
