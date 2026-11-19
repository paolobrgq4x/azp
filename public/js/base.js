"use strict";
/* PartsPlanner · basi: utilità, stato, accesso, struttura delle pagine e navigazione */

/* ============ Utilità ============ */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtN = (n, d = 0) => (Number(n) || 0).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" });
const fmtE = n => (Number(n) || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" });
const fmtE2 = n => (Number(n) || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, useGrouping: "always" });
const fmtEk = n => { const a = Math.abs(n); return a >= 1e6 ? fmtN(n / 1e6, 2) + " M€" : a >= 1e4 ? fmtN(n / 1e3, 0) + " k€" : fmtE(n); };
const dIt = s => { if (!s) return "–"; const [y, m, d] = s.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const dShort = s => { const [, m, d] = s.slice(0, 10).split("-"); return `${d}/${m}`; };
const romeDay = t => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
const romeTime = t => new Date(t).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
// Un caricamento si indica con la data dei dati e, se è stato caricato quel giorno, con l'ora.
const snapLabel = (d, at) => `${dIt(d)}${at && d && romeDay(at) === String(d).slice(0, 10) ? ` ore ${romeTime(at)}` : ""}`;
// Da dove vengono le giacenze di un caricamento: dalle liste movimentazione (fine del mese precedente) oppure dal file giacenze, più recente.
// Vale per un caricamento e per i risultati che ne riportano l'origine (stock_src, stock_ref). I caricamenti senza origine sono quelli con il file giacenze.
function stockNote(s) {
  if (!s) return "";
  const ref = s.stock_ref ? ` al ${s.stock_ref}` : "";
  if (s.stock_src === "lista") return `Giacenze delle liste movimentazione${ref || " (fine mese precedente)"}`;
  if (s.stock_src === "file_lista") return `Giacenze del file giacenze; per i codici assenti dal file, quelle delle liste${ref}`;
  return "Giacenze del file giacenze";
}
const stockShort = s => (s.stock_src === "lista" ? `giacenze delle liste${s.stock_ref ? ` al ${s.stock_ref}` : ""}` : s.stock_src === "file_lista" ? "giacenze del file e, per i codici assenti, delle liste" : "giacenze del file");
// Data scritta nell'intestazione di una colonna («… al 31/10/2026»), nella forma GG/MM/AAAA; null se non c'è.
function refDate(label) {
  const m = /(?:^|\D)(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?!\d)/.exec(String(label == null ? "" : label));
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100 ? `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${y}` : null;
}
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600); }

/* ============ Attese: barra in alto per ogni richiesta lenta, riquadro con messaggio e avanzamento per le operazioni lunghe ============ */
let PENDING = 0, BARTIMER = null;
function netStart() { if (PENDING++ === 0) BARTIMER = setTimeout(() => document.body.classList.add("loading"), 250); }
function netEnd() { if (--PENDING <= 0) { PENDING = 0; clearTimeout(BARTIMER); document.body.classList.remove("loading"); } }
// busy("testo") mostra il riquadro; busy("testo", 0.4) con la barra al 40%; busy(null) lo toglie.
function busy(text, pct) {
  let el = $("#busy");
  if (text == null) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "busy"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); document.body.appendChild(el); }
  el.innerHTML = `<div class="busyrow"><span class="spin" aria-hidden="true"></span><span>${esc(text)}</span></div>${pct == null ? `<div class="pbar ind"><i></i></div>` : `<div class="pbar"><i style="width:${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%"></i></div>`}`;
}
// Lascia al browser il tempo di mostrare un messaggio prima di un calcolo pesante.
const tick = () => new Promise(r => setTimeout(r, 30));
function apiError(status, data) {
  if (status === 401) { state.me = null; renderLogin("La sessione è scaduta: accedi di nuovo."); return Object.assign(new Error("Sessione scaduta"), { status: 401, silent: true }); }
  return Object.assign(new Error((data && data.error) || "Errore " + status), { status, data });
}
// Invio di dati grandi con l'avanzamento dell'invio (onUp riceve la quota inviata, da 0 a 1; onSent quando l'invio è finito).
function apiUpload(url, body, onUp, onSent) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest(); x.open("POST", url); x.withCredentials = true;
    x.setRequestHeader("X-Req", "1"); x.setRequestHeader("Content-Type", "application/json");
    x.upload.onprogress = e => { if (e.lengthComputable && onUp) onUp(e.loaded / e.total); };
    x.upload.onload = () => { if (onSent) onSent(); };
    x.onload = () => { netEnd(); let d = null; try { d = JSON.parse(x.responseText); } catch (e) {} if (x.status >= 200 && x.status < 300) resolve(d); else reject(apiError(x.status, d)); };
    x.onerror = () => { netEnd(); reject(Object.assign(new Error("Connessione non riuscita. Controlla la rete e riprova."), { status: 0 })); };
    netStart(); x.send(JSON.stringify(body));
  });
}
async function api(method, url, body) {
  const opt = { method, headers: { "X-Req": "1" }, credentials: "same-origin" };
  if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
  let res;
  netStart();
  try { res = await fetch(url, opt); } catch (e) { netEnd(); throw Object.assign(new Error("Connessione non riuscita. Controlla la rete e riprova."), { status: 0 }); }
  netEnd();
  let data = null; try { data = await res.json(); } catch (e) {}
  if (res.status === 401 && url !== "/api/login") { state.me = null; renderLogin("La sessione è scaduta: accedi di nuovo."); throw Object.assign(new Error("Sessione scaduta"), { status: 401, silent: true }); }
  if (!res.ok) throw Object.assign(new Error((data && data.error) || "Errore " + res.status), { status: res.status, data });
  return data;
}
function confirmBox(title, text, okLabel = "Conferma", danger = false) {
  return new Promise(resolve => {
    const m = document.createElement("div"); m.className = "modal";
    m.innerHTML = `<div class="panel" role="dialog" aria-modal="true" aria-labelledby="mt"><h3 id="mt">${esc(title)}</h3><p>${text}</p>
      <div class="actions"><button class="btn" type="button" data-a="0">Annulla</button><button class="btn ${danger ? "danger" : "primary"}" type="button" data-a="1">${esc(okLabel)}</button></div></div>`;
    document.body.appendChild(m);
    const done = v => { m.remove(); resolve(v); };
    m.addEventListener("click", e => { const a = e.target.closest("[data-a]"); if (a) done(a.dataset.a === "1"); else if (e.target === m) done(false); });
    m.addEventListener("keydown", e => { if (e.key === "Escape") done(false); });
    $("[data-a='1']", m).focus();
  });
}
function confirmTyped(title, html, word, extra) {
  return new Promise(resolve => {
    const m = document.createElement("div"); m.className = "modal";
    m.innerHTML = `<form class="panel" role="dialog" aria-modal="true" aria-labelledby="ctt" novalidate><h3 id="ctt">${esc(title)}</h3><p>${html}</p>
      <label class="field" for="ctw">Per confermare scrivi <b class="mono">${esc(word)}</b><input type="text" id="ctw" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <div class="actions"><button class="btn" type="button" data-x>Annulla</button><button class="btn danger" type="submit" id="ctok" disabled>Elimina definitivamente</button></div></form>`;
    document.body.appendChild(m);
    const inp = $("#ctw", m), ok = $("#ctok", m), done = v => { m.remove(); resolve(v); };
    inp.oninput = () => { ok.disabled = inp.value.trim() !== word; };
    $("[data-x]", m).onclick = () => done(false);
    m.addEventListener("keydown", e => { if (e.key === "Escape") done(false); });
    $("form", m).onsubmit = e => { e.preventDefault(); if (inp.value.trim() === word) { const x = extra ? extra() : undefined; done({ extra: x }); } };
    inp.focus();
  });
}
function infoBox(title, html) {
  const m = document.createElement("div"); m.className = "modal";
  m.innerHTML = `<div class="panel" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>${html}<div class="actions"><button class="btn primary" type="button">Chiudi</button></div></div>`;
  document.body.appendChild(m); $("button", m).onclick = () => m.remove(); $("button", m).focus();
}

/* ============ Stato ============ */
const state = {
  me: null, dealers: [], dealerId: null, snapshots: [],
  analisi: { snapId: null, f: "tutti", q: "", sort: null, dir: "asc", offset: 0, limit: 200 },
  codice: "", upload: { A: [], B: [] }, layouts: {}, layoutsDealer: null, ordine: { snapId: null, mode: "amount", budgets: { amount: 50000, free: 50000 }, filters: { groups: [], abc: [], dg: [], q: "" }, result: null, history: [], meta: null }
};
const STATI = { sotto: "Sotto scorta", eccesso: "Eccesso", fermo: "Fermo", ok: "In linea", nostorico: "Senza storico" };
const isAdmin = () => state.me && state.me.user.role === "admin";
const dealerName = id => (state.dealers.find(d => d.id === id) || {}).name || "";

/* ============ Avvio e accesso ============ */
/* Versione: se mentre la pagina è aperta viene pubblicato un aggiornamento, compare un avviso per ricaricarla. */
let appVer = null, verAt = 0;
async function checkVersion(force) {
  if (!force && Date.now() - verAt < 60000) return;
  verAt = Date.now();
  try {
    const r = await fetch("/api/version", { cache: "no-store", credentials: "same-origin" }), v = (await r.json()).v;
    if (!appVer) { appVer = v; return; }
    if (v !== appVer && !$("#newver")) {
      const d = document.createElement("div"); d.id = "newver"; d.className = "newver"; d.setAttribute("role", "status");
      d.innerHTML = `<span>È disponibile una versione aggiornata della piattaforma. Ricarica la pagina per usarla.</span><button class="btn sm primary" type="button">Ricarica</button>`;
      $("button", d).onclick = () => location.reload();
      document.body.appendChild(d);
    }
  } catch (e) {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkVersion(); });
async function boot() {
  checkVersion(true);
  try { state.me = await api("GET", "/api/me"); }
  catch (e) { if (!e.silent) renderLogin(); return; }
  afterLogin();
}
function afterLogin() {
  state.rules = null;
  if (state.me.user.must_change) return renderPassword(true);
  state.dealers = state.me.dealers;
  let saved = null; try { saved = +localStorage.getItem("ig_dealer") || null; } catch (e) {}
  state.dealerId = isAdmin() ? (state.dealers.some(d => d.id === saved) ? saved : null) : state.me.user.dealer_id;
  if (!curView()) history.replaceState(null, "", isAdmin() ? "/rete" : "/nuovo");
  route();
}
function renderLogin(msg) {
  document.title = "Accedi · PartsPlanner";
  $("#root").innerHTML = `<div class="login"><form class="panel" id="lf" novalidate>
    <div><h1>PartsPlanner</h1><p class="muted small">Accesso riservato alla rete.</p></div>
    ${msg ? `<div class="msg">${esc(msg)}</div>` : ""}
    <div class="msg err" id="lerr" hidden></div>
    <label class="field" for="lu">Nome utente<input type="text" id="lu" autocomplete="username" autocapitalize="none" required></label>
    <label class="field" for="lp">Password<input type="password" id="lp" autocomplete="current-password" required></label>
    <button class="btn primary" type="submit" id="lb">Accedi</button></form></div>`;
  $("#lu").focus();
  $("#lf").onsubmit = async e => {
    e.preventDefault(); const b = $("#lb"); b.disabled = true;
    try { await api("POST", "/api/login", { username: $("#lu").value, password: $("#lp").value }); state.me = await api("GET", "/api/me"); afterLogin(); }
    catch (err) { const el = $("#lerr"); el.hidden = false; el.textContent = err.message; b.disabled = false; }
  };
}
function renderPassword(forced) {
  const html = `<form class="panel" id="pf" novalidate>
    <div><h2>${forced ? "Scegli la tua password" : "Cambia password"}</h2>
    <p class="muted small">${forced ? "Al primo accesso la password provvisoria va sostituita." : ""} Almeno 10 caratteri.</p></div>
    <div class="msg err" id="perr" hidden></div>
    <label class="field" for="p0">Password attuale<input type="password" id="p0" autocomplete="current-password"></label>
    <label class="field" for="p1">Nuova password<input type="password" id="p1" autocomplete="new-password"></label>
    <label class="field" for="p2">Ripeti la nuova password<input type="password" id="p2" autocomplete="new-password"></label>
    <div class="row"><button class="btn primary" type="submit">Salva password</button>${forced ? `<button class="link" type="button" id="pout">Esci</button>` : `<button class="btn" type="button" id="pcancel">Annulla</button>`}</div></form>`;
  let host;
  if (forced) { $("#root").innerHTML = `<div class="login">${html}</div>`; host = $("#root"); }
  else { host = document.createElement("div"); host.className = "modal"; host.innerHTML = html; document.body.appendChild(host); }
  $("#p0", host).focus();
  if ($("#pout", host)) $("#pout", host).onclick = logout;
  if ($("#pcancel", host)) $("#pcancel", host).onclick = () => host.remove();
  $("#pf", host).onsubmit = async e => {
    e.preventDefault(); const err = $("#perr", host);
    if ($("#p1", host).value !== $("#p2", host).value) { err.hidden = false; err.textContent = "Le due nuove password non coincidono."; return; }
    try {
      await api("POST", "/api/password", { current: $("#p0", host).value, next: $("#p1", host).value });
      toast("Password aggiornata.");
      if (forced) { state.me = await api("GET", "/api/me"); afterLogin(); } else host.remove();
    } catch (x) { if (!x.silent) { err.hidden = false; err.textContent = x.message; } }
  };
}
async function logout() { try { await api("POST", "/api/logout"); } catch (e) {} state.me = null; history.replaceState(null, "", "/"); renderLogin(); }

/* ============ Struttura ============ */
const VIEWS = [
  { id: "rete", label: "Rete", admin: true },
  { id: "nuovo", label: "Nuovo ordine" },
  { id: "analisi", label: "Analisi codici" },
  { id: "codice", label: "Scheda codice" },
  { id: "regole", label: "Regole" },
  { id: "prova", label: "Dati di prova" },
  { id: "admin", label: "Amministrazione", admin: true },
  { id: "probabilita", label: "Probabilità di vendita", hidden: true }
];
function shell(view) {
  const u = state.me.user;
  const dsel = isAdmin()
    ? `<select id="dsel" aria-label="Concessionaria"><option value="">Scegli concessionaria…</option>${state.dealers.map(d => `<option value="${d.id}"${d.id === state.dealerId ? " selected" : ""}>${esc(d.name)}${d.code ? " · " + esc(d.code) : ""}</option>`).join("")}</select>`
    : `<span class="who">${esc(u.dealer_name || "")}</span>`;
  $("#root").innerHTML = `<header class="topbar"><a class="brand" href="/" title="Torna alla pagina iniziale">PartsPlanner</a>${dsel}
    <span class="who">${esc(u.full_name || u.username)}</span><button class="link" type="button" id="pwd">Password</button><button class="link" type="button" id="out">Esci</button></header>
    <nav class="tabs" aria-label="Sezioni">${VIEWS.filter(v => !v.hidden && (!v.admin || isAdmin())).map(v => `<a href="/${v.id}"${v.id === view ? ' aria-current="page"' : ""}>${v.label}</a>`).join("")}</nav>
    <main id="main"></main>`;
  $("#out").onclick = logout; $("#pwd").onclick = () => renderPassword(false);
  if ($("#dsel")) $("#dsel").onchange = e => {
    state.dealerId = +e.target.value || null; state.analisi.snapId = null; state.snapshots = [];
    try { localStorage.setItem("ig_dealer", state.dealerId || ""); } catch (x) {}
    if (curView() === "rete" || curView() === "admin") go("analisi"); else route();
  };
  document.title = (VIEWS.find(v => v.id === view) || {}).label + " · PartsPlanner";
  return $("#main");
}
function needDealer(main) {
  if (state.dealerId) return false;
  main.innerHTML = `<div class="panel"><h2>Scegli una concessionaria</h2><p class="muted">Usa il menu in alto per scegliere la concessionaria da analizzare${state.dealers.length ? "" : ". Non ne hai ancora creata nessuna: aggiungila da «Amministrazione»"}.</p>
    ${state.dealers.length ? `<div class="chips">${state.dealers.map(d => `<button class="chip" type="button" data-d="${d.id}">${esc(d.name)}</button>`).join("")}</div>` : `<a class="btn" href="#admin">Vai ad Amministrazione</a>`}</div>`;
  $$("[data-d]", main).forEach(b => b.onclick = () => { state.dealerId = +b.dataset.d; try { localStorage.setItem("ig_dealer", state.dealerId); } catch (x) {} route(); });
  return true;
}
async function loadSnapshots() { state.snapshots = await api("GET", `/api/dealers/${state.dealerId}/snapshots`); return state.snapshots; }

// ogni sezione ha il suo indirizzo: /nuovo, /analisi, /regole…
function curView() { return location.pathname.replace(/^\/+|\/+$/g, "") || (location.hash || "#").slice(1); }
function go(view) {
  if (location.pathname !== "/" + view || location.hash) history.pushState(null, "", "/" + view);
  route();
}
function route() {
  if (!state.me) return;
  checkVersion();
  let view = curView();
  // la vecchia pagina «Carica dati» è confluita in «Nuovo ordine»
  if (view === "carica") { view = "nuovo"; history.replaceState(null, "", "/nuovo"); }
  // i vecchi indirizzi con il cancelletto (#nuovo) diventano indirizzi veri (/nuovo)
  if (location.hash && VIEWS.some(v => v.id === view)) history.replaceState(null, "", "/" + view);
  if (!VIEWS.some(v => v.id === view) || (VIEWS.find(v => v.id === view).admin && !isAdmin())) { view = isAdmin() ? "rete" : "nuovo"; history.replaceState(null, "", "/" + view); }
  const main = shell(view);
  const fn = { rete: viewRete, nuovo: viewNuovo, analisi: viewAnalisi, codice: viewCodice, regole: viewRegole, prova: viewProva, admin: viewAdmin, probabilita: viewProbabilita }[view];
  fn(main).catch(e => { if (!e.silent) main.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; });
}
window.addEventListener("hashchange", route);
window.addEventListener("popstate", route);
// i collegamenti interni («/nuovo», «#nuovo») cambiano sezione senza ricaricare la pagina
document.addEventListener("click", e => {
  const a = e.target.closest && e.target.closest("a[href]");
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute("download")) return;
  // il nome PartsPlanner porta alla pagina iniziale: la rete per l'amministratore, il nuovo ordine (dal primo passo) per gli altri
  if (a.getAttribute("href") === "/") { e.preventDefault(); const home = isAdmin() ? "rete" : "nuovo"; if (home === "nuovo" && typeof W !== "undefined") W.step = 1; go(home); return; }
  const m = a.getAttribute("href").match(/^[#/]([a-z]+)$/);
  if (m && VIEWS.some(v => v.id === m[1])) { e.preventDefault(); go(m[1]); }
});
