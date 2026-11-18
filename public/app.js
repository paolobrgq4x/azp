(function () {
"use strict";

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

async function api(method, url, body) {
  const opt = { method, headers: { "X-Req": "1" }, credentials: "same-origin" };
  if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, opt); } catch (e) { throw Object.assign(new Error("Connessione non riuscita. Controlla la rete e riprova."), { status: 0 }); }
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
  codice: "", upload: { A: [], B: [] }, layouts: {}, layoutsDealer: null, kpiSnap: null, ordine: { snapId: null, mode: "amount", budgets: { amount: 50000, free: 50000 }, filters: { groups: [], abc: [], dg: [], q: "" }, result: null, history: [], meta: null }
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
  if (!location.hash) location.hash = isAdmin() ? "#rete" : "#nuovo";
  route();
}
function renderLogin(msg) {
  document.title = "Accedi · Parts Planning";
  $("#root").innerHTML = `<div class="login"><form class="panel" id="lf" novalidate>
    <div><h1>Parts Planning</h1><p class="muted small">Accesso riservato alla rete.</p></div>
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
async function logout() { try { await api("POST", "/api/logout"); } catch (e) {} state.me = null; location.hash = ""; renderLogin(); }

/* ============ Struttura ============ */
const VIEWS = [
  { id: "rete", label: "Rete", admin: true },
  { id: "nuovo", label: "Nuovo ordine" },
  { id: "andamento", label: "Andamento" },
  { id: "kpi", label: "Indicatori" },
  { id: "analisi", label: "Analisi codici" },
  { id: "ordine", label: "Scenari d'ordine" },
  { id: "codice", label: "Scheda codice" },
  { id: "regole", label: "Regole" },
  { id: "carica", label: "Carica dati" },
  { id: "prova", label: "Dati di prova" },
  { id: "admin", label: "Amministrazione", admin: true }
];
function shell(view) {
  const u = state.me.user;
  const dsel = isAdmin()
    ? `<select id="dsel" aria-label="Concessionaria"><option value="">Scegli concessionaria…</option>${state.dealers.map(d => `<option value="${d.id}"${d.id === state.dealerId ? " selected" : ""}>${esc(d.name)}${d.code ? " · " + esc(d.code) : ""}</option>`).join("")}</select>`
    : `<span class="who">${esc(u.dealer_name || "")}</span>`;
  $("#root").innerHTML = `<header class="topbar"><div class="brand"><span class="dot"></span>Parts Planning</div>${dsel}
    <span class="who">${esc(u.full_name || u.username)}</span><button class="link" type="button" id="pwd">Password</button><button class="link" type="button" id="out">Esci</button></header>
    <nav class="tabs" aria-label="Sezioni">${VIEWS.filter(v => !v.admin || isAdmin()).map(v => `<a href="#${v.id}"${v.id === view ? ' aria-current="page"' : ""}>${v.label}</a>`).join("")}</nav>
    <main id="main"></main>`;
  $("#out").onclick = logout; $("#pwd").onclick = () => renderPassword(false);
  if ($("#dsel")) $("#dsel").onchange = e => {
    state.dealerId = +e.target.value || null; state.analisi.snapId = null; state.snapshots = [];
    try { localStorage.setItem("ig_dealer", state.dealerId || ""); } catch (x) {}
    if (location.hash === "#rete" || location.hash === "#admin") location.hash = "#andamento"; else route();
  };
  document.title = (VIEWS.find(v => v.id === view) || {}).label + " · Parts Planning";
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

function route() {
  if (!state.me) return;
  checkVersion();
  let view = (location.hash || "#").slice(1);
  if (!VIEWS.some(v => v.id === view) || (VIEWS.find(v => v.id === view).admin && !isAdmin())) view = isAdmin() ? "rete" : "nuovo";
  const main = shell(view);
  const fn = { rete: viewRete, nuovo: viewNuovo, andamento: viewAndamento, kpi: viewKpi, analisi: viewAnalisi, ordine: viewOrdine, codice: viewCodice, regole: viewRegole, carica: viewCarica, prova: viewProva, admin: viewAdmin }[view];
  fn(main).catch(e => { if (!e.silent) main.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; });
}
window.addEventListener("hashchange", route);

/* ============ Procedura guidata: Nuovo ordine ============
 * 1 Obiettivo -> 2 Liste movimentazione -> 3 Giacenze -> 4 Codici -> 5 Risultato
 * Gli obiettivi sono i tre scenari d'ordine:
 *  cover  : acquisti per coprire un periodo (1, 2 o 3 mesi), rispettando SMin e SMax
 *  amount : acquisti per un importo, rispettando SMin e SMax
 *  free   : acquisti per un importo libero, con facoltà di andare oltre la SMax
 */
const WSTEPS = ["Obiettivo", "Liste movimentazione", "Giacenze", "Codici", "Risultato"];
const ORIZZ = [[1, "1 mese"], [2, "2 mesi"], [3, "3 mesi"]];
const COVER_MAX = [[0, "nessun limite"], [1, "1 mese"], [2, "2 mesi"], [3, "3 mesi"], [4, "4 mesi"], [5, "5 mesi"], [6, "6 mesi"]];
const oltreTxt = m => `${m === 1 ? "1 mese" : fmtN(m) + " mesi"} oltre la SMax`;
const SCENARI = {
  cover: { t: "Acquisti per coprire un periodo", s: "Copro un periodo", d: "Ordino quanto serve per coprire 1, 2 o 3 mesi di vendite. Nessun codice resta sotto la SMin e nessuno supera la SMax." },
  amount: { t: "Acquisti per un importo", s: "Spendo un importo", d: "Spendo una cifra: prima riporto alla SMin i codici che sono sotto, poi divido il resto in proporzione alle vendite regolari. Nessun codice supera la SMax." },
  free: { t: "Acquisti per un importo libero", s: "Importo libero", d: "Come l'importo, con la facoltà di andare oltre la SMax: quello che avanza dopo aver portato tutti i codici alla SMax viene speso comunque, sempre in proporzione alle vendite regolari." }
};

/* ============ Regole di riordino ============
 * Le sceglie ogni utente e restano salvate per lui. Valgono per tutte le proposte d'ordine.
 * SMin e SMax non sono regole: le rispetta lo scenario scelto (solo l'importo libero può superare la SMax). */
const RULES_DEF = { months: 1, consAdj: 0, round: "nearest", minDemand: 0, exclOnDemand: true, minLine: 0, maxCover: 0, alertMonths: 3, regWeight: 100, maxTotal: 0 };
const ROUND_L = { nearest: "al pezzo più vicino", up: "per eccesso", down: "per difetto" };
function rules() { return state.rules || (state.rules = { ...RULES_DEF, ...((state.me && state.me.user.rules) || {}) }); }
let rulesTimer;
function saveRules() {
  clearTimeout(rulesTimer);
  rulesTimer = setTimeout(async () => {
    try { const r = await api("PUT", "/api/me/rules", { rules: rules() }); state.me.user.rules = r.rules; Object.assign(rules(), r.rules); }
    catch (x) { if (!x.silent) toast("Regole non salvate: " + x.message); }
  }, 500);
}
const pctTxt = v => (v > 0 ? "+" : "") + fmtN(v) + "%";
const fmtM = v => fmtN(v, v % 1 ? 1 : 0);
const orizzLabel = m => (ORIZZ.find(o => o[0] === m) || [0, fmtM(m) + " mesi"])[1];
const pezzi = n => `${fmtN(n)} ${n === 1 ? "pezzo" : "pezzi"}`;
function rulesText(r, mode) {
  const parts = [];
  if (mode === "cover") parts.push(`periodo ${orizzLabel(r.months)}`);
  parts.push(mode === "free" ? "SMin rispettata, SMax superabile" : "SMin e SMax rispettate");
  if (mode === "free") parts.push(r.maxCover ? `al massimo ${oltreTxt(r.maxCover)}` : "nessun limite oltre la SMax");
  parts.push(r.consAdj ? `consumo ${pctTxt(r.consAdj)}` : "consumo come da lista");
  if (mode !== "cover" && r.regWeight !== 100) parts.push(`peso della regolarità ${fmtN(r.regWeight)}%`);
  if (r.maxTotal) parts.push(`copertura al massimo ${fmtN(r.maxTotal)} mesi`);
  if (mode === "cover") parts.push(`arrotondamento ${ROUND_L[r.round]}`);
  const ex = ["non a scorta", r.exclOnDemand ? "su richiesta" : "", r.minDemand ? `consumo sotto ${fmtN(r.minDemand, 2)} pz/mese` : "", r.minLine && mode === "cover" ? `righe sotto ${fmtE(r.minLine)}` : ""].filter(Boolean);
  parts.push("esclusi: " + ex.join(", "));
  parts.push(`avviso oltre ${fmtM(r.alertMonths)} mesi`);
  return parts.join(" · ");
}
/* Equalizzatore: un cursore verticale per ogni regola numerica. Ogni cursore scorre su valori fissi, dal basso verso l'alto. */
const mm = v => `${fmtM(v)} ${v === 1 ? "mese" : "mesi"}`;
const EQ = [
  { k: "months", name: "Periodo da coprire", on: m => m === "cover", vals: [1, 2, 3], fmt: mm, help: "Quanti mesi di vendite coprire con l'ordine. Obiettivo di ogni codice = consumo medio × mesi, mai sotto la SMin e mai sopra la SMax. Esempio: consumo 8 pezzi al mese, 2 mesi → obiettivo 16." },
  { k: "consAdj", name: "Correzione del consumo", on: () => true, vals: [-50, -40, -30, -20, -15, -10, -5, 0, 5, 10, 15, 20, 30, 40, 50], fmt: v => v ? pctTxt(v) : "0%", help: "Corregge il consumo medio della lista per stagionalità o andamento: in meno se il periodo che arriva è più lento, in più se è più vivace. Esempio: consumo 8 pezzi al mese con −20% → conta 6,4." },
  { k: "regWeight", name: "Peso della regolarità", on: m => m !== "cover", vals: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], fmt: v => fmtN(v) + "%", help: "Negli scenari a importo decide quanto conta la regolarità nel dividere i soldi. 100%: vendita regolare = consumo × regolarità ÷ 12, quindi i codici che vendono con continuità ricevono di più. 0%: conta solo il consumo. Esempio: consumo 3, regolarità 6 → a 100% vale 1,5 pezzi al mese, a 0% vale 3." },
  { k: "maxTotal", name: "Copertura massima", on: () => true, vals: [2, 3, 4, 5, 6, 9, 12, 0], fmt: v => v ? mm(v) : "nessuna", help: "Tetto in mesi di copertura per ogni codice dopo l'ordine, in tutti gli scenari, anche sotto la SMax. La SMin resta sempre garantita. Esempio: consumo 0,5 pezzi al mese, SMax 6, tetto 6 mesi → al massimo 3 pezzi disponibili." },
  { k: "maxCover", name: "Oltre la SMax", on: m => m === "free", vals: [1, 2, 3, 4, 5, 6, 0], fmt: v => v ? "+" + mm(v) : "nessun limite", help: "Solo nell'importo libero: quanti mesi di consumo ogni codice può avere sopra la SMax. Con un limite, l'importo che non trova posto resta non speso. Esempio: SMax 30, consumo 8, limite 1 mese → al massimo 38 pezzi." },
  { k: "minDemand", name: "Consumo minimo", on: () => true, vals: [0, .05, .1, .2, .3, .5, 1], fmt: v => v ? fmtN(v, 2) + " pz/mese" : "nessuno", help: "Esclude dalla proposta i codici che vendono meno di questo numero di pezzi al mese, compresi quelli sotto la SMin. Esempio: soglia 0,2 → un codice che vende 0,15 pezzi al mese non viene proposto." },
  { k: "minLine", name: "Valore minimo di riga", on: m => m === "cover", vals: [0, 10, 25, 50, 100, 250, 500], fmt: v => v ? fmtE(v) : "nessuno", help: "Nello scenario a periodo toglie le righe che valgono meno di questo importo. Esempio: soglia 100 € → una riga da 8 pezzi a 12 € (96 €) esce dalla proposta." },
  { k: "alertMonths", name: "Avviso oltre", on: () => true, vals: [1, 2, 3, 4, 6, 9, 12], fmt: mm, help: "Non cambia le quantità: segnala in rosso le righe che dopo l'ordine superano questa copertura, per deciderle a mano. Esempio: 3 mesi → una riga che arriva a 4,7 mesi ha l'avviso." }
];
const eqIndex = (e, v) => { let best = 0; e.vals.forEach((x, i) => { if (Math.abs(x - v) < Math.abs(e.vals[best] - v)) best = i; }); return best; };
function renderRules(host, mode, onChange) {
  const r = rules(), cov = mode === "cover", free = mode === "free";
  const seg = (name, cur, opts) => `<div class="chips seg" role="group">${opts.map(([v, l]) => `<button type="button" class="chip" data-r="${name}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join("")}</div>`;
  host.innerHTML = `<details class="panel rulespanel"${state.rulesOpen ? " open" : ""}><summary><span class="rt">Regole di riordino</span><span class="rs">${esc(rulesText(r, mode))}</span><span class="rlink">${state.rulesOpen ? "Chiudi" : "Modifica"}</span></summary>
    <p class="small muted">Sono le regole con cui la piattaforma calcola le quantità. Ogni modifica ricalcola subito la proposta e resta salvata per il tuo utente. Tocca una quantità nella tabella per vedere il conto di quella riga.</p>
    <div class="rgrid">
      <div class="rctl"><span class="rl">SMin e SMax <button type="button" class="info" data-info="smm" aria-label="Che cos'è: SMin e SMax">i</button></span><p class="small muted">${free
        ? "La SMin è rispettata: i codici che sono sotto vengono riportati alla SMin per primi. La SMax può essere superata, ma solo dopo che tutti i codici ci sono arrivati."
        : "Sono rispettate: nessun codice resta sotto la SMin e nessuno supera la SMax. Per andare oltre la SMax serve lo scenario «" + SCENARI.free.t + "»."}</p></div>
    </div>
    <div class="eq" role="group" aria-label="Equalizzatore delle regole">${EQ.filter(e => e.on(mode)).map(e => {
      const i = eqIndex(e, r[e.k]);
      return `<div class="eqc" title="${esc(e.help)}"><span class="eqv" id="eqv_${e.k}">${esc(e.fmt(e.vals[i]))}</span>
        <input type="range" id="eq_${e.k}" min="0" max="${e.vals.length - 1}" step="1" value="${i}" aria-label="${esc(e.name)}" aria-valuetext="${esc(e.fmt(e.vals[i]))}">
        <span class="eqn">${esc(e.name)} <button type="button" class="info" data-info="${e.k}" aria-label="Che cos'è: ${esc(e.name)}">i</button></span></div>`; }).join("")}</div>
    <p class="small eqh" id="eqh" aria-live="polite">Tocca la <span class="info sm">i</span> sotto un cursore per sapere che cos'è quella regola; sopra ogni cursore c'è il valore scelto.</p>
    <div class="rgrid">
      ${cov ? `<div class="rctl"><span class="rl">Arrotondamento del consumo del periodo <button type="button" class="info" data-info="round" aria-label="Che cos'è: arrotondamento">i</button></span>${seg("round", r.round, [["nearest", "Al più vicino"], ["up", "Per eccesso"], ["down", "Per difetto"]])}</div>` : ""}
      <div class="rctl"><span class="rl">Esclusioni <button type="button" class="info" data-info="excl" aria-label="Che cos'è: esclusioni">i</button></span>
        <p class="small muted">I codici non tenuti a scorta (SMin e SMax a zero) sono sempre esclusi.</p>
        <label class="check" for="r_od"><input type="checkbox" id="r_od"${r.exclOnDemand ? " checked" : ""}> Codici segnati come su richiesta</label></div>
    </div>
    <div class="row"><button class="btn sm" type="button" id="r_reset">Ripristina i valori iniziali</button><span class="small muted">Valori iniziali: ${esc(rulesText(RULES_DEF, mode))}.</span></div></details>`;
  const d = $("details", host);
  d.addEventListener("toggle", () => { state.rulesOpen = d.open; $(".rlink", d).textContent = d.open ? "Chiudi" : "Modifica"; });
  const set = (k, v, alertOnly) => { if (rules()[k] === v) return; rules()[k] = v; saveRules(); onChange(alertOnly); };
  EQ.filter(e => e.on(mode)).forEach(e => {
    const el = $("#eq_" + e.k, host), out = $("#eqv_" + e.k, host);
    el.oninput = () => { const t = e.fmt(e.vals[+el.value]); out.textContent = t; el.setAttribute("aria-valuetext", t); };
    el.onchange = () => set(e.k, e.vals[+el.value], e.k === "alertMonths");
  });
  const INFO_EXTRA = {
    smm: ["SMin e SMax", "Sono le scorte minima e massima di ogni codice, come arrivano dalla lista movimentazione. Nessun codice resta sotto la SMin; la SMax si supera solo nello scenario «" + SCENARI.free.t + "». Esempio: SMin 8, SMax 30, disponibili 5 → mancano 3 pezzi per la SMin."],
    round: ["Arrotondamento", "Nello scenario a periodo il consumo del periodo diventa un numero intero di pezzi. Esempio: 6,4 pezzi → 6 al più vicino, 7 per eccesso, 6 per difetto. La SMin resta comunque il minimo."],
    excl: ["Esclusioni", "I codici non tenuti a scorta (SMin e SMax a zero) non entrano mai negli ordini. Con la casella attiva sono esclusi anche i codici segnati come «su richiesta» con il link nella tabella della proposta."]
  };
  $$("[data-info]", host).forEach(b => b.onclick = ev => {
    ev.preventDefault();
    const e = EQ.find(x => x.k === b.dataset.info), [name, text] = e ? [e.name, e.help] : INFO_EXTRA[b.dataset.info];
    const box = $("#eqh", host), same = box.dataset.k === b.dataset.info;
    $$("[data-info]", host).forEach(x => x.setAttribute("aria-pressed", "false"));
    if (same) { box.dataset.k = ""; box.innerHTML = "Tocca la <span class=\"info sm\">i</span> sotto un cursore per sapere che cos'è quella regola; sopra ogni cursore c'è il valore scelto."; box.classList.remove("on"); return; }
    box.dataset.k = b.dataset.info; box.innerHTML = `<b>${esc(name)}</b>: ${esc(text)}`; box.classList.add("on"); b.setAttribute("aria-pressed", "true");
  });
  $$("[data-r]", host).forEach(b => b.onclick = () => set(b.dataset.r, b.dataset.r === "months" ? +b.dataset.v : b.dataset.v));
  const chk = (id, k) => { const el = $("#" + id, host); if (el) el.onchange = () => set(k, el.checked); };
  chk("r_od", "exclOnDemand");
  $("#r_reset", host).onclick = () => { Object.assign(rules(), RULES_DEF); saveRules(); onChange(); };
}
/* Il conto di una riga, passo per passo */
function whyHtml(l) {
  const c = l.calc, n2 = v => fmtN(v, 2), n3 = v => fmtN(v, 3), li = [];
  const mesi = m => `${fmtM(m)} ${m === 1 ? "mese" : "mesi"}`;
  if (c && c.kind === "cover") {
    li.push(`Consumo medio dalla lista movimentazione: <b>${n2(c.cons)}</b> pezzi al mese${c.adj ? `, corretto del ${pctTxt(c.adj)}: <b>${n2(c.ce)}</b>` : ""}.`);
    li.push(`Consumo atteso in ${mesi(c.months)}: ${n2(c.ce)} × ${fmtM(c.months)} = ${n2(c.raw)} pezzi, arrotondati ${ROUND_L[c.round]}: <b>${fmtN(c.rounded)}</b>.`);
    if (c.smin > c.rounded) li.push(`La SMin è ${fmtN(c.smin)}: l'obiettivo sale a <b>${fmtN(c.base)}</b>.`);
    if (c.capped) li.push(`La SMax è ${fmtN(c.smax)}: l'obiettivo scende a <b>${fmtN(Math.min(c.base, c.smax))}</b>.`);
    if (c.tcap) li.push(`Copertura massima ${mesi(c.tcap)}: ${n2(c.ce)} × ${fmtM(c.tcap)} = ${n2(c.ce * c.tcap)}; l'obiettivo scende a <b>${fmtN(c.target)}</b>${c.target === c.smin ? ", la SMin" : ""}.`);
    li.push(`Obiettivo ${fmtN(c.target)} − disponibile ${fmtN(c.disp)} (giacenza ${fmtN(c.giac)} + ordini aperti ${fmtN(c.ord)}) = <b>${pezzi(c.target - c.disp)}</b>.`);
  } else if (c && c.kind === "amount") {
    li.push(`Disponibile: ${fmtN(l.disp)} (giacenza ${fmtN(l.giac)} + ordini aperti ${fmtN(l.ord)}); SMin ${fmtN(l.smin)}, SMax ${fmtN(l.smax)}.`);
    if (c.smin_qty) li.push(`Era sotto la SMin: <b>${pezzi(c.smin_qty)}</b> per tornare alla SMin${l.partial ? ", ma l'importo non è bastato per arrivarci" : ""}.`);
    li.push(c.has_reg
      ? (c.w == null || c.w === 100 ? `Vendita regolare: consumo ${n2(c.ce)} × regolarità ${n2(c.reg)} ÷ 12 = <b>${n2(c.vr)}</b> pezzi al mese.`
        : c.w === 0 ? `Vendita regolare con peso della regolarità 0%: conta solo il consumo, <b>${n2(c.vr)}</b> pezzi al mese.`
        : `Vendita regolare con peso della regolarità ${fmtN(c.w)}%: consumo ${n2(c.ce)} × (regolarità ${n2(c.reg)} ÷ 12)<sup>${fmtN(c.w / 100, 1)}</sup> = <b>${n2(c.vr)}</b> pezzi al mese.`)
      : `Vendita regolare: <b>${n2(c.vr)}</b> pezzi al mese. Nei dati manca l'indice di regolarità, quindi vale il consumo medio.`);
    const p2 = c.p2, p3 = c.p3;
    if (!(c.vr > 0)) li.push("Senza vendite regolari il codice non riceve altri pezzi in proporzione.");
    else if (p2 && !p2.room) li.push(p2.tcap ? `È già alla copertura massima di ${mesi(p2.tcap)}: non riceve altri pezzi.` : c.smin_qty ? "Con la SMin è già alla SMax: entro la SMax non riceve altri pezzi." : "È già alla SMax: entro la SMax non riceve altri pezzi.");
    else if (p2 && p2.capped) li.push(`In proporzione alle vendite regolari: <b>${pezzi(p2.qty)}</b>, ${p2.tcap ? `fino alla copertura massima di ${mesi(p2.tcap)}` : "fino alla SMax"}.`);
    else if (p2) {
      const ideal = c.level * c.vr, whole = Math.min(p2.qty, Math.floor(ideal + 1e-9)), more = p2.qty - whole;
      li.push(`In proporzione: l'importo ha comprato a tutti i codici ${n3(c.level)} mesi di vendita regolare. Per questo codice ${n3(c.level)} × ${n2(c.vr)} = ${n2(ideal)}, cioè <b>${pezzi(whole)}</b> ${whole === 1 ? "intero" : "interi"}${more > 0 ? `, più <b>${pezzi(more)}</b> con l'avanzo dell'importo` : ""}.`);
    }
    if (p3 && c.level3 != null) {
      const ideal = Math.max(0, c.level3 * c.vr - p3.off), whole = Math.min(p3.qty, Math.floor(ideal + 1e-9)), more = p3.qty - whole;
      li.push(`Oltre la SMax: il resto dell'importo ha comprato a tutti altri ${n3(c.level3)} mesi di vendita regolare. Per questo codice ${n3(c.level3)} × ${n2(c.vr)}${p3.off ? ` − ${fmtN(p3.off)} che aveva già sopra la SMax` : ""} = ${n2(ideal)}, cioè <b>${pezzi(whole)}</b> ${whole === 1 ? "intero" : "interi"}${p3.capped ? `: ${p3.tcap ? `si ferma alla copertura massima di ${mesi(p3.tcap)}` : `si ferma al limite di ${oltreTxt(c.limit)}`}` : more > 0 ? `, più <b>${pezzi(more)}</b> con l'avanzo dell'importo` : ""}.`);
    }
  } else {
    li.push(`Disponibile: ${fmtN(l.disp)} (giacenza ${fmtN(l.giac)} + ordini aperti ${fmtN(l.ord)}); SMin ${fmtN(l.smin)}, SMax ${fmtN(l.smax)}.`);
    (l.steps || []).forEach(x => li.push(`${esc(x.note.charAt(0).toUpperCase() + x.note.slice(1))}: <b>${pezzi(x.qty)}</b>.`));
  }
  if (l.cons_mese > 0) li.push(`Copertura: da ${covTxt(l.cover_before)} a <b>${covTxt(l.cover_after)} mesi</b>${l.cons_eff !== l.cons_mese ? " (con il consumo corretto)" : ""}.`);
  else li.push("Nessun consumo registrato: la copertura non si può calcolare.");
  return `<ol>${li.map(x => `<li>${x}</li>`).join("")}</ol>`;
}
function whyText(l) { const t = document.createElement("div"); t.innerHTML = whyHtml(l); return [...t.querySelectorAll("li")].map(x => x.textContent).join(" "); }
const W = { step: 1, snapId: null, codesMode: "all", codes: [], lookup: null, listName: "", groups: [], abc: [],
  purpose: "cover", budgets: { amount: 50000, free: 50000 }, listOverride: true, seq: 0 };
// ogni scenario a importo ha il suo importo: cambiarne uno non tocca l'altro
const wBudget = () => W.budgets[W.purpose] || 0;
async function viewNuovo(main) {
  if (needDealer(main)) return;
  if (!state.snapshots.length) await loadSnapshots();
  if (W.dealer !== state.dealerId) { Object.assign(W, { step: 1, snapId: null, codes: [], lookup: null, codesMode: "all", groups: [], abc: [] }); W.dealer = state.dealerId; state.ordine.history = []; }
  main.innerHTML = `<div class="head"><div><h1>Nuovo ordine</h1><p class="sub">${esc(dealerName(state.dealerId))}. Scegli l'obiettivo, carica i dati più recenti, scegli i codici e ottieni il risultato.</p></div></div>
    <ol class="stepper" aria-label="Avanzamento">${WSTEPS.map((t, k) => `<li class="${k + 1 < W.step ? "done" : k + 1 === W.step ? "cur" : ""}"${k + 1 === W.step ? ' aria-current="step"' : ""}><span class="sn">${k + 1 < W.step ? "✓" : k + 1}</span><span class="st">${t}</span></li>`).join("")}</ol>
    ${W.step > 1 ? `<p class="small muted wgoal">Obiettivo: <b>${esc(SCENARI[W.purpose].t)}</b> · ${esc(W.purpose === "cover" ? orizzLabel(rules().months) : fmtE(wBudget()))} <button class="link" type="button" id="wchg">cambia</button></p>` : ""}
    <div id="wbody"></div>`;
  if ($("#wchg")) $("#wchg").onclick = () => wGo(main, 1);
  ({ 1: wStep1, 2: wStep2, 3: wStep3, 4: wStep4, 5: wStep5 })[W.step]($("#wbody"), main);
}
const wGo = (main, n) => { W.step = n; viewNuovo(main); window.scrollTo(0, 0); };

function wStep1(body, main) {
  const card = (id, inner) => `<label class="choice big${W.purpose === id ? " on" : ""}" for="pp_${id}"><input type="radio" name="pp" id="pp_${id}" value="${id}"${W.purpose === id ? " checked" : ""}><span><b>${SCENARI[id].t}</b><span class="small muted">${SCENARI[id].d}</span><span class="pin">${inner}</span></span></label>`;
  const amount = id => `<input type="text" id="pt_${id}" data-amt="${id}" inputmode="decimal" aria-label="Importo da ordinare in euro" value="${esc(fmtN(W.budgets[id]))}"><span class="small muted">€</span>`;
  body.innerHTML = `<section class="panel"><span class="num mono small muted">PASSO 1 DI 5</span><h2>Qual è l'obiettivo?</h2>
    <div class="choices">
      ${card("cover", `<label class="small muted" for="hm">Periodo</label><select id="hm" aria-label="Periodo da coprire">${ORIZZ.map(([v, l]) => `<option value="${v}"${v === rules().months ? " selected" : ""}>${l}</option>`).join("")}</select>`)}
      ${card("amount", amount("amount"))}
      ${card("free", amount("free"))}
    </div>
    <div class="row" id="pextra"></div></section>
    <div class="wnav"><span></span><button class="btn primary" type="button" id="wnext">Avanti: liste movimentazione</button></div>`;
  const extra = () => {
    $$(".choice", body).forEach(l => l.classList.toggle("on", $("input", l).checked));
    $("#pextra").innerHTML = W.purpose === "free"
      ? `<label class="field" for="pmc">Copertura massima per codice oltre la SMax (facoltativa)<select id="pmc">${COVER_MAX.map(([v, l]) => `<option value="${v}"${v === rules().maxCover ? " selected" : ""}>${l}</option>`).join("")}</select></label>
         <p class="small muted">La SMax viene superata solo dopo che tutti i codici ci sono arrivati. Il limite è in mesi di consumo medio sopra la SMax: con 2 mesi, un codice che vende 3 pezzi al mese può avere al massimo 6 pezzi oltre la SMax. Senza limite l'importo viene speso tutto; con un limite, quello che non trova posto resta non speso.</p>`
      : `<p class="small muted">${W.purpose === "cover" ? "Il risultato propone le quantità che coprono il periodo, da confermare riga per riga." : "Se tutti i codici arrivano alla SMax prima che l'importo sia finito, il resto non viene speso e la piattaforma dice quanto."}</p>`;
  };
  const pick = id => { const r = $("#pp_" + id); if (!r.checked) { r.checked = true; W.purpose = id; extra(); } };
  $$("input[name=pp]", body).forEach(r => r.onchange = () => { W.purpose = r.value; extra(); });
  $("#hm").onchange = e => { rules().months = +e.target.value; saveRules(); };
  $("#hm").addEventListener("focus", () => pick("cover"));
  $$("[data-amt]", body).forEach(i => {
    i.addEventListener("focus", () => pick(i.dataset.amt));
    i.oninput = () => { W.budgets[i.dataset.amt] = parseNum(i.value); };
  });
  extra();
  $("#wnext").onclick = () => {
    if (W.purpose !== "cover") {
      W.budgets[W.purpose] = parseNum($("#pt_" + W.purpose).value);
      if (!(wBudget() > 0)) { toast("Indica un importo maggiore di zero."); return; }
      if ($("#pmc")) { rules().maxCover = +$("#pmc").value; saveRules(); }
    }
    W.result = null; wGo(main, 2);
  };
}
function wStep2(body, main) {
  const U = state.upload, last = state.snapshots[state.snapshots.length - 1];
  const fresh = last && romeDay(last.uploaded_at) === romeDay(Date.now());
  body.innerHTML = `${last ? `<div class="msg${fresh ? "" : " old"}">Ultimo caricamento: ${esc(new Date(last.uploaded_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" }))}${last.uploaded_by_name ? `, da ${esc(last.uploaded_by_name)}` : ""}.${fresh ? "" : " Per un risultato aggiornato conviene caricare le liste e le giacenze più recenti."}
      <div class="row wrow"><button class="btn ${fresh ? "primary" : ""} sm" type="button" id="wuse">Usa questi dati e scegli i codici</button><span class="small muted">oppure carica i file qui sotto</span></div></div>` : ""}
    <section class="step" id="stepA"><span class="num">PASSO 2 DI 5</span><h2>Carica le liste movimentazione</h2>
      <p class="meta">Lista con codice, movimentazione, SMin, SMax, ordini aperti e prezzi. Se riporta anche le giacenze (alla fine del mese precedente), il file giacenze del passo successivo è facoltativo. Se è divisa in più file, aggiungili tutti: vengono uniti. Anche i fogli di uno stesso file con le stesse colonne vengono letti tutti e uniti.</p>
      <div id="listA"></div>
      <div class="row"><label class="btn" for="fileA">Scegli i file Excel</label><input type="file" id="fileA" accept=".xlsx,.xls,.xlsm,.csv" multiple></div>
      <div class="msg err" id="uerr" hidden></div>
    </section>
    <div class="wnav"><button class="btn" type="button" id="wback">Indietro</button><button class="btn primary" type="button" id="wnext">Avanti: giacenze</button></div>`;
  wireSlot("A"); renderSlot("A");
  if ($("#wuse")) $("#wuse").onclick = () => { W.snapId = last.id; W.lookup = null; wGo(main, 4); };
  $("#wback").onclick = () => wGo(main, 1);
  $("#wnext").onclick = () => { if (!slotReady("A")) { toast(state.upload.A.length ? "Completa le colonne obbligatorie del file." : "Carica almeno un file delle liste movimentazione."); return; } wGo(main, 3); };
}
function wireSlot(slot) {
  const inp = $("#file" + slot), step = $("#step" + slot);
  inp.onchange = () => { handleFiles(slot, Array.from(inp.files)); inp.value = ""; };
  step.addEventListener("dragover", e => { e.preventDefault(); step.classList.add("drag"); });
  step.addEventListener("dragleave", () => step.classList.remove("drag"));
  step.addEventListener("drop", e => { e.preventDefault(); step.classList.remove("drag"); handleFiles(slot, Array.from(e.dataTransfer.files)); });
}
function wStep3(body, main) {
  const U = state.upload, opt = listStock().has;
  body.innerHTML = `<section class="step" id="stepB"><span class="num">PASSO 3 DI 5</span><h2>${opt ? "Hai giacenze più recenti? (facoltativo)" : "Carica le giacenze attuali"}</h2>
      <p class="meta">${opt ? "Le liste riportano già le giacenze: puoi salvare così. Se hai un file giacenze più recente caricalo: le sue giacenze sostituiscono quelle delle liste. " : ""}Va bene qualsiasi estrazione del tuo gestionale, purché abbia una colonna con il codice e una con la quantità in giacenza: la piattaforma le riconosce da sola, ti mostra cosa ha letto e ignora tutte le altre colonne. Con più file o più fogli con le stesse colonne, le quantità dello stesso codice si sommano.</p>
      <p class="meta">Liste movimentazione: <b>${esc(U.A.map(s => s.wb.name).join(", "))}</b></p>
      <div id="listB"></div>
      <div class="row"><label class="btn" for="fileB">Scegli i file Excel</label><input type="file" id="fileB" accept=".xlsx,.xls,.xlsm,.csv" multiple></div>
      <div class="msg err" id="uerr" hidden></div>
    </section>
    <div id="stocksum"></div>
    <div class="wnav"><button class="btn" type="button" id="wback">Indietro</button><div class="row"><span class="small muted" id="sstat"></span><button class="btn primary" type="button" id="save">Incrocia e salva</button></div></div>`;
  wireSlot("B"); renderSlot("B"); updateSave();
  $("#wback").onclick = () => wGo(main, 2);
  $("#save").onclick = () => save(r => { W.snapId = r.id; W.lookup = null; wGo(main, 4); });
}
async function wLookup() {
  if (!W.codes.length) { W.lookup = { rows: [], missing: [] }; return; }
  W.lookup = await api("POST", `/api/snapshots/${W.snapId}/lookup`, { codes: W.codes });
}
async function wStep4(body, main) {
  if (!W.snapId) W.snapId = state.snapshots[state.snapshots.length - 1].id;
  const snap = state.snapshots.find(s => s.id === W.snapId);
  const meta = await api("GET", `/api/snapshots/${W.snapId}/filters`);
  const opt = (id, title, text) => `<label class="choice${W.codesMode === id ? " on" : ""}" for="cm_${id}"><input type="radio" name="cm" id="cm_${id}" value="${id}"${W.codesMode === id ? " checked" : ""}><span><b>${title}</b><span class="small muted">${text}</span></span></label>`;
  body.innerHTML = `<section class="panel"><span class="num mono small muted">PASSO 4 DI 5</span><h2>Su quali codici vuoi lavorare?</h2>
      <p class="small muted">Dati del ${esc(snapLabel(snap.week_date, snap.uploaded_at))}: ${fmtN(snap.n_codes)} codici. ${esc(stockNote(snap))}.</p>
      <div class="choices">${opt("all", "Tutti i codici", "La piattaforma valuta l'intero magazzino.")}${opt("manual", "Li scrivo io", "Inserisci i codici uno alla volta o incollane un elenco.")}${opt("excel", "Li carico da un Excel", "Un file con una colonna di codici.")}</div>
      <div id="cbox"></div>
      <details class="filters"${W.groups.length || W.abc.length ? " open" : ""}><summary>Restringi ancora (facoltativo)</summary><div class="fgrid">
        <div><p class="flabel">Gruppo principale <span class="muted">(4ª cifra del codice)</span></p><div class="chips">${meta.groups.map(g => `<button type="button" class="chip" data-g="${g.id}" aria-pressed="${W.groups.includes(g.id)}">${esc((g.id === "X" ? "–" : g.id) + " " + g.label)}<span class="n">${fmtN(g.n)}</span></button>`).join("")}</div></div>
        <div><p class="flabel">Classe ABC sul consumo</p><div class="chips">${[["A", "A · 80% del consumo"], ["B", "B · 15%"], ["C", "C · 5%"]].map(([k, l]) => `<button type="button" class="chip" data-abc="${k}" aria-pressed="${W.abc.includes(k)}">${l}<span class="n">${fmtN(meta.abc[k])}</span></button>`).join("")}</div></div>
      </div></details>
      <details class="filters"><summary>Codici su richiesta</summary><div class="fgrid">
        <label class="field" for="pmd">Escludi i codici con consumo medio inferiore a (pezzi al mese)<input type="text" id="pmd" inputmode="decimal" placeholder="nessuna soglia" value="${rules().minDemand ? esc(fmtN(rules().minDemand, 2)) : ""}"></label>
        <label class="check" for="pov"><input type="checkbox" id="pov"${W.listOverride ? " checked" : ""}> Per i codici che scelgo io, calcola anche quelli segnati su richiesta</label>
        <p class="small muted">I codici segnati come su richiesta sono esclusi, salvo l'opzione qui sopra per i codici scelti. I codici non tenuti a scorta (SMin e SMax a zero) sono sempre esclusi.</p></div></details>
    </section>
    <div class="wnav"><button class="btn" type="button" id="wback">Indietro</button><button class="btn primary" type="button" id="wnext">Calcola l'ordine</button></div>`;
  const tog = (attr, arr) => $$(`[${attr}]`, body).forEach(b => b.onclick = () => { const v = b.getAttribute(attr), k = arr.indexOf(v); if (k >= 0) arr.splice(k, 1); else arr.push(v); b.setAttribute("aria-pressed", k < 0); });
  tog("data-g", W.groups); tog("data-abc", W.abc);
  const renderBox = () => {
    const box = $("#cbox");
    $$(".choices .choice", body).forEach(l => l.classList.toggle("on", $("input", l).checked));
    if (W.codesMode === "all") { box.innerHTML = ""; return; }
    box.innerHTML = `${W.codesMode === "manual"
        ? `<form class="row addcode" id="caf"><label class="field" for="cin">Codice particolare<input type="text" id="cin" autocapitalize="characters" autocomplete="off" placeholder="Un codice, oppure incolla più codici"></label><button class="btn" type="submit">Aggiungi</button></form>`
        : `<div class="row"><label class="btn" for="cfile">Scegli il file Excel con i codici</label><input type="file" id="cfile" accept=".xlsx,.xls,.xlsm,.csv"><span class="small muted">${W.listName ? esc(W.listName) : "La piattaforma cerca la colonna dei codici da sola."}</span></div>`}
      <div id="clist"></div>`;
    if ($("#caf")) $("#caf").onsubmit = async e => { e.preventDefault(); const add = splitCodes($("#cin").value); if (!add.length) return; W.codes = [...new Set(W.codes.concat(add))]; $("#cin").value = ""; await wLookup(); renderList(); $("#cin").focus(); };
    if ($("#cfile")) $("#cfile").onchange = async e => {
      const f = e.target.files[0]; e.target.value = ""; if (!f) return;
      try { const codes = codesFromWorkbook(await readFile(f)); if (!codes.length) { toast("Non ho trovato codici nel file."); return; } W.codes = codes; W.listName = f.name; await wLookup(); renderBox(); }
      catch (x) { if (!x.silent) toast(x.message); }
    };
    renderList();
  };
  const renderList = () => {
    const host = $("#clist"); if (!host) return;
    const L = W.lookup;
    if (!W.codes.length || !L) { host.innerHTML = `<p class="small muted">Nessun codice scelto.</p>`; return; }
    host.innerHTML = `<div class="bar"><p class="small"><b>${fmtN(W.codes.length)}</b> codici scelti · ${fmtN(L.rows.length)} trovati nei dati${L.missing.length ? ` · <span class="miss">${fmtN(L.missing.length)} non trovati</span>` : ""}</p><button class="link" type="button" id="cclear">Svuota</button></div>
      <div class="tablebox flagbox"><table><thead><tr><th>Codice</th><th>Descrizione</th><th>Stato</th><th class="num">Giacenza</th><th class="num">Ord. aperti</th><th class="num">SMin</th><th class="num">SMax</th><th class="num">Consumo/mese</th><th></th></tr></thead><tbody>
      ${L.rows.slice(0, 300).map(r => `<tr><td class="code">${esc(r.code)}</td><td class="desc">${esc(r.descr)}</td><td><span class="pill ${r.status}">${STATI[r.status]}</span>${r.ondemand ? ` <span class="pill off">su richiesta</span>` : ""}</td><td class="num">${fmtN(r.giac)}</td><td class="num">${fmtN(r.ord)}</td><td class="num">${fmtN(r.smin)}</td><td class="num">${fmtN(r.smax)}</td><td class="num">${r.cons_mese ? fmtN(r.cons_mese, 2) : "–"}</td><td><button class="link" type="button" data-rmc="${esc(r.code)}">Togli</button></td></tr>`).join("")}
      ${L.missing.slice(0, 100).map(c => `<tr><td class="code">${esc(c)}</td><td colspan="7" class="miss small">Non presente nei dati caricati</td><td><button class="link" type="button" data-rmc="${esc(c)}">Togli</button></td></tr>`).join("")}
      </tbody></table></div>${L.rows.length > 300 ? `<p class="small muted">A video i primi 300 codici trovati.</p>` : ""}`;
    $("#cclear").onclick = async () => { W.codes = []; W.listName = ""; await wLookup(); renderList(); };
    $$("[data-rmc]", host).forEach(b => b.onclick = () => { const c = b.dataset.rmc; W.codes = W.codes.filter(x => x !== c); L.rows = L.rows.filter(r => r.code !== c); L.missing = L.missing.filter(x => x !== c); renderList(); });
  };
  $$("input[name=cm]", body).forEach(r => r.onchange = () => { W.codesMode = r.value; renderBox(); });
  if (W.codes.length && !W.lookup) await wLookup();
  renderBox();
  $("#wback").onclick = () => wGo(main, 2);
  $("#wnext").onclick = () => {
    if (W.codesMode !== "all" && !(W.lookup && W.lookup.rows.length)) { toast("Indica almeno un codice presente nei dati caricati, oppure scegli «Tutti i codici»."); return; }
    rules().minDemand = parseNum($("#pmd").value); saveRules(); W.listOverride = $("#pov").checked;
    W.result = null; wGo(main, 5);
  };
}
async function wCompute() {
  const codes = W.codesMode === "all" ? [] : W.lookup.rows.map(r => r.code);
  const mode = SCENARI[W.purpose] ? W.purpose : "cover";
  const RR = rules(), seq = ++W.seq;
  const P = { mode, budget: mode === "cover" ? 0 : wBudget(), months: RR.months, maxCover: RR.maxCover, minDemand: RR.minDemand, listOverride: W.listOverride, rules: RR,
    filters: { groups: [...W.groups], abc: [...W.abc], dg: [], q: "", codes } };
  const r = await api("POST", `/api/snapshots/${W.snapId}/scenario`, P);
  if (seq !== W.seq) return false;   // nel frattempo è partito un calcolo più recente
  const scope = [codes.length ? `${fmtN(codes.length)} codici scelti` : "", W.groups.length ? "gruppi " + W.groups.join(", ") : "", W.abc.length ? "classe " + W.abc.join("/") : ""].filter(Boolean).join(" · ");
  r.title = `${SCENARI[mode].t} · ${mode === "cover" ? orizzLabel(RR.months) : fmtE(wBudget())}${mode === "free" && RR.maxCover ? ` (al massimo ${oltreTxt(RR.maxCover)})` : ""}${scope ? " · " + scope : ""}`;
  const O = state.ordine;
  O.result = r; O.show = 100; O.history = [{ title: r.title, s: r.summary, r }].concat((O.history || []).filter(h => h.title !== r.title)).slice(0, 8);
  return true;
}
async function wStep5(body, main) {
  body.innerHTML = `<div class="panel"><p class="muted">Calcolo in corso…</p></div>`;
  await wCompute();
  body.innerHTML = `<div class="wnav top"><span class="num mono small muted">PASSO 5 DI 5 · RISULTATO</span><div class="row">
      <button class="btn sm" type="button" id="wgoal">Cambia obiettivo</button><button class="btn sm" type="button" id="wcodes">Cambia codici</button><button class="btn sm" type="button" id="wnew">Ricomincia</button></div></div>
    <div id="wres"></div><div id="whist"></div>`;
  const recalc = async alertOnly => { if (!alertOnly && !(await wCompute())) return; renderProposal("#wres", recalc); renderHistory("#whist", "#wres", recalc); };
  renderProposal("#wres", recalc); renderHistory("#whist", "#wres", recalc);
  $("#wgoal").onclick = () => wGo(main, 1); $("#wcodes").onclick = () => wGo(main, 4);
  $("#wnew").onclick = () => { Object.assign(W, { step: 1, snapId: null, codes: [], lookup: null, codesMode: "all", groups: [], abc: [], listName: "" }); state.ordine.history = []; wGo(main, 1); };
}

/* ============ Rete (amministratore) ============ */
function trend(cur, prev, upIsBad = true) {
  if (prev == null || cur == null) return `<span class="trend flat">–</span>`;
  const d = cur - prev;
  if (Math.abs(d) < 0.5) return `<span class="trend flat">= stabile</span>`;
  const cls = d > 0 ? (upIsBad ? "up-bad" : "up-good") : (upIsBad ? "down-good" : "down-bad");
  return `<span class="trend ${cls}">${d > 0 ? "▲ +" : "▼ −"}${fmtEk(Math.abs(d))}</span>`;
}
async function viewRete(main) {
  main.innerHTML = `<div class="head"><div><h1>La tua rete</h1><p class="sub">Ultimo caricamento di ogni concessionaria, con la variazione rispetto al precedente.</p></div></div><div class="panel"><p class="muted">Caricamento…</p></div>`;
  const rows = await api("GET", "/api/overview");
  const loaded = rows.filter(r => r.snap_id);
  const tot = k => loaded.reduce((t, r) => t + (r[k] || 0), 0);
  main.innerHTML = `<div class="head"><div><h1>La tua rete</h1><p class="sub">Ultimo caricamento di ogni concessionaria, con la variazione rispetto al precedente.</p></div></div>
  <section class="tiles">
    <div class="tile neutral"><span class="k">Concessionarie con dati</span><span class="v">${fmtN(loaded.length)}<span class="small muted"> / ${fmtN(rows.length)}</span></span><span class="s">Valore a magazzino ${fmtE(tot("val_tot"))}</span></div>
    <div class="tile bad"><span class="k">Da riordinare</span><span class="v">${fmtEk(tot("val_sotto"))}</span><span class="s">${fmtN(tot("n_sotto"))} codici sotto scorta</span></div>
    <div class="tile warn"><span class="k">Eccedenze</span><span class="v">${fmtEk(tot("val_eccesso"))}</span><span class="s">${fmtN(tot("n_eccesso"))} codici sopra SMax</span></div>
    <div class="tile idle"><span class="k">Fermo senza fabbisogno</span><span class="v">${fmtEk(tot("val_fermo"))}</span><span class="s">${fmtN(tot("n_fermo"))} codici</span></div>
  </section>
  <section class="panel"><h2>Concessionarie</h2>
  ${rows.length ? `<div class="tablebox"><table><thead><tr><th>Concessionaria</th><th>Ultimo caricamento</th><th class="num">Caricamenti</th><th class="num">Valore magazzino</th><th class="num">Da riordinare</th><th class="num">Eccedenze</th><th></th><th class="num">Fermo</th><th></th></tr></thead><tbody>
  ${rows.map(r => `<tr class="click" data-d="${r.id}"><td><b>${esc(r.name)}</b>${r.code ? ` <span class="muted mono small">${esc(r.code)}</span>` : ""}</td>
    <td>${r.week_date ? esc(snapLabel(r.week_date, r.uploaded_at)) : `<span class="pill off">Nessun caricamento</span>`}</td><td class="num">${fmtN(r.n_weeks)}</td>
    <td class="num">${r.snap_id ? fmtE(r.val_tot) : "–"}</td><td class="num">${r.snap_id ? fmtE(r.val_sotto) : "–"}</td>
    <td class="num">${r.snap_id ? fmtE(r.val_eccesso) : "–"}</td><td>${r.snap_id ? trend(r.val_eccesso, r.p_val_eccesso) : ""}</td>
    <td class="num">${r.snap_id ? fmtE(r.val_fermo) : "–"}</td><td>${r.snap_id ? trend(r.val_fermo, r.p_val_fermo) : ""}</td></tr>`).join("")}
  </tbody></table></div><p class="small muted">Tocca una riga per aprire l'andamento della concessionaria.</p>` : `<p class="muted">Nessuna concessionaria. Aggiungile da <a href="#admin">Amministrazione</a>.</p>`}</section>`;
  $$("tr[data-d]", main).forEach(tr => tr.onclick = () => { state.dealerId = +tr.dataset.d; try { localStorage.setItem("ig_dealer", state.dealerId); } catch (x) {} location.hash = "#andamento"; });
}

/* ============ Grafico a linea (piccoli multipli) ============ */
function lineChart(host, pts, opt) {
  const W = 520, H = 170, L = 52, R = 14, T = 12, B = 26;
  const ys = pts.map(p => p.y);
  let max = Math.max(...ys, 0), min = Math.min(...ys, 0);
  if (max === min) max = min + 1;
  const step = niceStep((max - min) / 4); max = Math.ceil(max / step) * step; min = Math.floor(min / step) * step;
  const X = i => pts.length === 1 ? L + (W - L - R) / 2 : L + i * (W - L - R) / (pts.length - 1);
  const Y = v => T + (H - T - B) * (1 - (v - min) / (max - min));
  const ticks = []; for (let v = min; v <= max + step / 2; v += step) ticks.push(v);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join("");
  const area = `${line}L${X(pts.length - 1).toFixed(1)},${Y(Math.max(min, 0))}L${X(0).toFixed(1)},${Y(Math.max(min, 0))}Z`;
  const every = Math.max(1, Math.ceil(pts.length / 7));
  const last = pts[pts.length - 1];
  const surf = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#fff";
  host.innerHTML = `<div class="ct"><h3>${esc(opt.title)}</h3><span class="last">${opt.fmt(last.y)}</span></div>
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.title)}, ${pts.length} caricamenti">
    ${ticks.map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${opt.axis(v)}</text>`).join("")}
    ${pts.map((p, i) => (i % every === 0 || i === pts.length - 1) ? `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${esc(p.label)}</text>` : "").join("")}
    <path d="${area}" fill="${opt.color}" fill-opacity="0.12"/>
    <path d="${line}" fill="none" stroke="${opt.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(pts.length - 1)}" cy="${Y(last.y)}" r="4.5" fill="${opt.color}" stroke="${surf}" stroke-width="2"/>
    <line class="hair hl" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
    <circle class="hd" r="4.5" fill="${opt.color}" stroke="${surf}" stroke-width="2" visibility="hidden"/>
    <rect x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent" class="hit"/>
  </svg><div class="tip" hidden></div>`;
  const svg = $("svg", host), tip = $(".tip", host), hl = $(".hl", host), hd = $(".hd", host), hit = $(".hit", host);
  const show = ev => {
    const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) * W / r.width;
    let i = pts.length === 1 ? 0 : Math.round((x - L) / ((W - L - R) / (pts.length - 1)));
    i = Math.max(0, Math.min(pts.length - 1, i));
    hl.setAttribute("x1", X(i)); hl.setAttribute("x2", X(i)); hl.setAttribute("visibility", "visible");
    hd.setAttribute("cx", X(i)); hd.setAttribute("cy", Y(pts[i].y)); hd.setAttribute("visibility", "visible");
    tip.hidden = false; tip.textContent = `${pts[i].full}: ${opt.fmt(pts[i].y)}`;
    const hr = host.getBoundingClientRect();
    tip.style.left = (r.left - hr.left + X(i) * r.width / W) + "px"; tip.style.top = (r.top - hr.top + Y(pts[i].y) * r.height / H) + "px";
  };
  const hide = () => { tip.hidden = true; hl.setAttribute("visibility", "hidden"); hd.setAttribute("visibility", "hidden"); };
  hit.addEventListener("pointermove", show); hit.addEventListener("pointerdown", show); hit.addEventListener("pointerleave", hide);
}
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
const axisE = v => Math.abs(v) >= 1e6 ? fmtN(v / 1e6, 1) + "M" : Math.abs(v) >= 1e3 ? fmtN(v / 1e3, 0) + "k" : fmtN(v);

/* ============ Andamento ============ */
async function viewAndamento(main) {
  if (needDealer(main)) return;
  main.innerHTML = `<div class="panel"><p class="muted">Caricamento…</p></div>`;
  const snaps = await loadSnapshots();
  const name = dealerName(state.dealerId);
  if (!snaps.length) {
    main.innerHTML = `<div class="head"><div><h1>${esc(name)}</h1><p class="sub">Nessun caricamento.</p></div></div>
      <div class="panel"><p>Carica liste movimentazione e giacenze per vedere l'andamento.</p><div><a class="btn primary" href="#carica">Carica dati</a></div></div>`;
    return;
  }
  const L = snaps[snaps.length - 1], P = snaps.length > 1 ? snaps[snaps.length - 2] : null;
  const pv = k => P ? P[k] : null;
  main.innerHTML = `<div class="head"><div><h1>${esc(name)}</h1><p class="sub">Ultimo caricamento: ${esc(snapLabel(L.week_date, L.uploaded_at))} · ${fmtN(snaps.length)} caricamenti in archivio<br>${esc(stockNote(L))}</p></div>
    <div class="row"><a class="btn" href="#analisi">Analizza i codici</a><a class="btn primary" href="#carica">Carica dati</a></div></div>
  <section class="tiles">
    <div class="tile"><span class="k">Valore a magazzino</span><span class="v">${fmtE(L.val_tot)}</span><span class="s">${fmtN(L.n_codes)} codici · ${trend(L.val_tot, pv("val_tot"))}</span></div>
    <div class="tile bad"><span class="k">Sotto scorta</span><span class="v">${fmtN(L.n_sotto)}</span><span class="s">${fmtN(L.pz_sotto)} pezzi · ${fmtE(L.val_sotto)} ${trend(L.val_sotto, pv("val_sotto"))}</span></div>
    <div class="tile warn"><span class="k">In eccesso</span><span class="v">${fmtN(L.n_eccesso)}</span><span class="s">Eccedenza ${fmtE(L.val_eccesso)} ${trend(L.val_eccesso, pv("val_eccesso"))}</span></div>
    <div class="tile idle"><span class="k">Fermi senza fabbisogno</span><span class="v">${fmtN(L.n_fermo)}</span><span class="s">${fmtE(L.val_fermo)} ${trend(L.val_fermo, pv("val_fermo"))}</span></div>
    <div class="tile neutral"><span class="k">Da verificare</span><span class="v">${fmtN(L.n_nogiac + L.n_nostorico)}</span><span class="s">${fmtN(L.n_nogiac)} non in giacenza · ${fmtN(L.n_nostorico)} senza storico</span></div>
  </section>
  <section class="charts">
    <div class="chart" id="c1"></div><div class="chart" id="c2"></div><div class="chart" id="c3"></div><div class="chart" id="c4"></div>
  </section>
  <section class="panel"><h2>Caricamenti</h2><div class="tablebox"><table><thead><tr><th>Dati del</th><th>Caricati da</th><th class="num">Codici</th><th class="num">Valore magazzino</th><th class="num">Sotto scorta</th><th class="num">Eccedenze</th><th class="num">Fermo</th><th></th></tr></thead><tbody>
  ${snaps.slice().reverse().map(s => `<tr><td>${esc(snapLabel(s.week_date, s.uploaded_at))}<br><span class="small muted">${esc(stockShort(s))}</span></td><td class="small">${esc(s.uploaded_by_name || s.uploaded_by_user || "–")}<br><span class="muted">${esc(new Date(s.uploaded_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }))}</span></td>
    <td class="num">${fmtN(s.n_codes)}</td><td class="num">${fmtE(s.val_tot)}</td><td class="num">${fmtN(s.n_sotto)} · ${fmtE(s.val_sotto)}</td><td class="num">${fmtE(s.val_eccesso)}</td><td class="num">${fmtE(s.val_fermo)}</td>
    <td><div class="row"><button class="btn sm" type="button" data-open="${s.id}">Apri</button>${isAdmin() ? `<button class="btn sm danger" type="button" data-del="${s.id}" data-w="${esc(snapLabel(s.week_date, s.uploaded_at))}">Elimina</button>` : ""}</div></td></tr>`).join("")}
  </tbody></table></div></section>`;
  const pts = k => snaps.map(s => ({ y: s[k] || 0, label: dShort(s.week_date), full: snapLabel(s.week_date, s.uploaded_at) }));
  const cs = getComputedStyle(document.documentElement);
  const col = v => cs.getPropertyValue(v).trim();
  lineChart($("#c1"), pts("val_tot"), { title: "Valore a magazzino", color: col("--accent"), fmt: fmtE, axis: axisE });
  lineChart($("#c2"), pts("val_sotto"), { title: "Valore da riordinare (sotto scorta)", color: col("--bad"), fmt: fmtE, axis: axisE });
  lineChart($("#c3"), pts("val_eccesso"), { title: "Valore eccedenze", color: col("--warn"), fmt: fmtE, axis: axisE });
  lineChart($("#c4"), pts("val_fermo"), { title: "Valore fermo senza fabbisogno", color: col("--idle"), fmt: fmtE, axis: axisE });
  $$("[data-open]", main).forEach(b => b.onclick = () => { state.analisi = { ...state.analisi, snapId: +b.dataset.open, offset: 0, f: "tutti" }; location.hash = "#analisi"; });
  $$("[data-del]", main).forEach(b => b.onclick = async () => {
    if (!await confirmBox("Eliminare il caricamento?", `Verranno cancellati tutti i dati del caricamento del ${esc(b.dataset.w)} per ${esc(name)}. L'operazione non si può annullare.`, "Elimina", true)) return;
    try { await api("DELETE", "/api/snapshots/" + b.dataset.del); toast("Caricamento eliminato."); if (state.analisi.snapId === +b.dataset.del) state.analisi.snapId = null; route(); } catch (e) { if (!e.silent) toast(e.message); }
  });
}

/* ============ Analisi codici ============ */
const FILTRI = [
  ["tutti", "Tutti"], ["sotto", "Sotto scorta"], ["eccesso", "Eccesso"], ["fermo", "Fermo"],
  ["nogiac", "Non in giacenza"], ["nostorico", "Senza storico"], ["ok", "In linea"]
];
const FILTRI2 = [["nuovi", "Nuovi problemi rispetto al caricamento precedente"], ["cronici", "Eccesso o fermo da 4+ caricamenti"]];
const FILTRI3 = [["ondemand", "Su richiesta"]];
const ACOLS = [
  ["status", "Stato"], ["code", "Codice"], ["descr", "Descrizione"], ["loc", "Locaz."], ["giac", "Giacenza", 1], ["var", "Var. giacenza", 1],
  ["ord", "Ord. aperti", 1], ["smin", "SMin", 1], ["smax", "SMax", 1], ["delta", "Da ordinare / Eccedenza", 1],
  ["streak", "Caricamenti nello stato", 1], ["cost", "Costo unit.", 1], ["val_giac", "Valore giacenza", 1], ["val_action", "Valore azione", 1]
];
async function viewAnalisi(main) {
  if (needDealer(main)) return;
  main.innerHTML = `<div class="panel"><p class="muted">Caricamento…</p></div>`;
  const snaps = state.snapshots.length ? state.snapshots : await loadSnapshots();
  if (!snaps.length) { main.innerHTML = `<div class="panel"><h2>Nessun caricamento</h2><p class="muted">Carica liste movimentazione e giacenze per iniziare.</p><div><a class="btn primary" href="#carica">Carica dati</a></div></div>`; return; }
  const A = state.analisi;
  if (!snaps.some(s => s.id === A.snapId)) { A.snapId = snaps[snaps.length - 1].id; A.offset = 0; }
  main.innerHTML = `<div class="head"><div><h1>Analisi codici</h1><p class="sub">${esc(dealerName(state.dealerId))}</p></div>
    <label class="field" for="wsel">Dati del<select id="wsel">${snaps.slice().reverse().map(s => `<option value="${s.id}"${s.id === A.snapId ? " selected" : ""}>${esc(snapLabel(s.week_date, s.uploaded_at))}</option>`).join("")}</select></label></div>
  <section class="panel">
    <div class="bar"><div class="chips" id="chips" role="group" aria-label="Filtra per stato"></div>
      <div class="row"><input type="search" id="q" placeholder="Cerca codice o descrizione" aria-label="Cerca codice o descrizione" value="${esc(A.q)}"><button class="btn" type="button" id="xls">Scarica Excel</button></div></div>
    <div class="chips" id="chips2" role="group" aria-label="Filtri sull'evoluzione"></div>
    <p class="small muted" id="astock"></p>
    <div class="tablebox"><table id="tbl"><thead></thead><tbody><tr><td class="empty">Caricamento…</td></tr></tbody></table></div>
    <div class="pager" id="pager"></div>
  </section>
  <section class="panel rules"><h3>Come viene classificato ogni codice</h3><ul>
    <li><b>Disponibile</b> = giacenza + ordini aperti. <b>Sotto scorta</b>: disponibile sotto SMin; quantità suggerita = SMax − disponibile.</li>
    <li><b>Eccesso</b>: giacenza sopra SMax; eccedenza = giacenza − SMax, valorizzata al costo. <b>Fermo</b>: giacenza con SMin e SMax a zero.</li>
    <li><b>Caricamenti nello stato</b>: in quanti caricamenti consecutivi il codice è rimasto nello stesso stato. <b>Var. giacenza</b>: variazione della giacenza rispetto al caricamento precedente.</li>
    <li><b>Non in giacenza</b>: codice dello storico assente nel file giacenze. <b>Senza storico</b>: codice a magazzino che non compare nello storico.</li>
    <li><b>Giacenza</b>: quella del file giacenze, se è stato caricato; altrimenti quella riportata dalle liste movimentazione (fine del mese precedente). Sopra la tabella è scritto quale vale per questi dati.</li></ul></section>`;
  $("#wsel").onchange = e => { A.snapId = +e.target.value; A.offset = 0; loadItems(); };
  let qt; $("#q").oninput = e => { clearTimeout(qt); qt = setTimeout(() => { A.q = e.target.value; A.offset = 0; loadItems(); }, 300); };
  $("#xls").onclick = exportXls;
  await loadItems();
}
async function loadItems() {
  const A = state.analisi;
  const p = new URLSearchParams({ f: A.f, q: A.q, offset: A.offset, limit: A.limit });
  if (A.sort) { p.set("sort", A.sort); p.set("dir", A.dir); }
  const data = await api("GET", `/api/snapshots/${A.snapId}/items?${p}`);
  if (!$("#tbl")) return;
  const c = data.counts, snap = state.snapshots.find(s => s.id === A.snapId);
  $("#astock").textContent = snap ? stockNote(snap) + "." : "";
  $("#chips").innerHTML = FILTRI.map(([k, l]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${A.f === k}">${l}<span class="n">${fmtN(c[k])}</span></button>`).join("");
  const od = FILTRI3.map(([k, l]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${A.f === k}">${l}<span class="n">${fmtN(c[k])}</span></button>`).join("");
  $("#chips2").innerHTML = od + (data.prev_week ? FILTRI2.map(([k, l]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${A.f === k}">${l}<span class="n">${fmtN(c[k])}</span></button>`).join("") + `<span class="small muted">Confronto con il caricamento del ${esc(snapLabel(data.prev_week, data.prev_at))}</span>` : `<span class="small muted">Primo caricamento in archivio: i confronti compariranno dal prossimo.</span>`);
  $$("#chips .chip, #chips2 .chip").forEach(b => b.onclick = () => { A.f = b.dataset.f; A.offset = 0; loadItems(); });
  const t = $("#tbl");
  t.tHead.innerHTML = "<tr>" + ACOLS.map(([k, l, n]) => `<th class="${n ? "num" : ""}" scope="col"><button type="button" data-k="${k}"${A.sort === k ? ` data-dir="${A.dir}"` : ""}>${l}</button></th>`).join("") + "</tr>";
  $$("th button", t).forEach(b => b.onclick = () => { const k = b.dataset.k; if (A.sort === k) A.dir = A.dir === "asc" ? "desc" : "asc"; else { A.sort = k; A.dir = ["code", "descr", "loc", "status"].includes(k) ? "asc" : "desc"; } A.offset = 0; loadItems(); });
  if (!data.rows.length) { t.tBodies[0].innerHTML = `<tr><td colspan="${ACOLS.length}" class="empty">Nessun codice in questa vista.</td></tr>`; $("#pager").innerHTML = ""; return; }
  t.tBodies[0].innerHTML = data.rows.map(r => {
    const d = r.delta > 0 ? `<span class="delta pos">+${fmtN(r.delta)}</span>` : r.delta < 0 ? `<span class="delta neg">${fmtN(r.delta)}</span>` : "–";
    const v = r.prev_giac == null ? `<span class="muted">nuovo</span>` : r.giac - r.prev_giac === 0 ? "=" : (r.giac > r.prev_giac ? "+" : "") + fmtN(r.giac - r.prev_giac);
    const st = `<span class="pill ${r.status}">${STATI[r.status]}</span>${!r.in_b ? ` <span class="pill nogiac" title="Assente nel file giacenze">n.g.</span>` : ""}${r.ondemand ? ` <span class="pill off" title="Escluso dagli scenari d'ordine">su richiesta</span>` : ""}`;
    return `<tr><td>${st}</td><td class="code"><button type="button" data-c="${esc(r.code)}">${esc(r.code)}</button></td><td class="desc">${esc(r.descr)}</td><td class="code">${esc(r.loc)}</td>
      <td class="num"${r.giac_lista != null && r.giac_lista !== r.giac ? ` title="Nelle liste: ${fmtN(r.giac_lista)}"` : ""}>${fmtN(r.giac)}</td><td class="num">${data.prev_week ? v : "–"}</td><td class="num">${fmtN(r.ord)}</td><td class="num">${fmtN(r.smin)}</td><td class="num">${fmtN(r.smax)}</td>
      <td class="num">${d}</td><td class="num">${r.status === "ok" ? "–" : fmtN(r.streak)}</td><td class="num">${r.cost ? fmtE2(r.cost) : "–"}</td><td class="num">${r.val_giac ? fmtE2(r.val_giac) : "–"}</td><td class="num">${r.val_action ? fmtE2(r.val_action) : "–"}</td></tr>`;
  }).join("");
  $$("[data-c]", t).forEach(b => b.onclick = () => { state.codice = b.dataset.c; location.hash = "#codice"; });
  const from = A.offset + 1, to = A.offset + data.rows.length;
  $("#pager").innerHTML = `<span>Righe ${fmtN(from)}–${fmtN(to)} di ${fmtN(data.total)}</span><div class="row">
    <button class="btn sm" type="button" id="pprev"${A.offset ? "" : " disabled"}>Precedenti</button><button class="btn sm" type="button" id="pnext"${to < data.total ? "" : " disabled"}>Successive</button></div>`;
  $("#pprev").onclick = () => { A.offset = Math.max(0, A.offset - A.limit); loadItems(); };
  $("#pnext").onclick = () => { A.offset += A.limit; loadItems(); };
}
async function exportXls() {
  const A = state.analisi, b = $("#xls"); b.disabled = true; b.textContent = "Preparo il file…";
  try {
    const p = new URLSearchParams({ f: A.f, q: A.q, all: "1" }); if (A.sort) { p.set("sort", A.sort); p.set("dir", A.dir); }
    const data = await api("GET", `/api/snapshots/${A.snapId}/items?${p}`);
    const snap = state.snapshots.find(s => s.id === A.snapId);
    const rows = data.rows.map(r => ({
      "Stato": STATI[r.status], "Codice": r.code, "Descrizione": r.descr, "Locazione": r.loc, "DG": r.dg, "Giacenza": r.giac, "Giacenza riportata nelle liste": r.giac_lista == null ? "" : r.giac_lista,
      "Giacenza caricamento precedente": r.prev_giac, "Ordini aperti": r.ord, "SMin": r.smin, "SMax": r.smax, "Da ordinare (+) / Eccedenza (-)": r.delta,
      "Caricamenti nello stato": r.streak, "Costo unitario": r.cost, "Valore giacenza": Math.round(r.val_giac * 100) / 100, "Valore azione": Math.round(r.val_action * 100) / 100,
      "Presente in giacenza": r.in_b ? "Sì" : "No"
    }));
    if (!rows.length) { toast("Nessuna riga da esportare."); return; }
    const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(k => ({ wch: Math.max(10, k.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, "Incrocio");
    const dn = dealerName(state.dealerId).replace(/[^\w\-]+/g, "_");
    XLSX.writeFile(wb, `analisi_${dn}_${snap ? snap.week_date : ""}_${A.f}.xlsx`);
  } catch (e) { if (!e.silent) toast(e.message); }
  finally { b.disabled = false; b.textContent = "Scarica Excel"; }
}

/* ============ Selettore del caricamento condiviso ============ */
function weekSelect(id, snaps, cur) {
  return `<label class="field" for="${id}">Dati del<select id="${id}">${snaps.slice().reverse().map(s => `<option value="${s.id}"${s.id === cur ? " selected" : ""}>${esc(snapLabel(s.week_date, s.uploaded_at))}</option>`).join("")}</select></label>`;
}
function noWeeks(main) { main.innerHTML = `<div class="panel"><h2>Nessun caricamento</h2><p class="muted">Carica liste movimentazione e giacenze per iniziare.</p><div><a class="btn primary" href="#carica">Carica dati</a></div></div>`; }

/* ============ Scenari d'ordine ============ */
const GROUPS = { "0": "Accessori e vernici", "1": "Motore", "2": "Alimentazione e scarico", "3": "Cambio", "4": "Assale anteriore e sterzo",
  "5": "Assale posteriore", "6": "Ruote e freni", "7": "Leve e pedali", "8": "Carrozzeria e clima", "9": "Impianto elettrico", "X": "Altri codici" };
const parseNum = v => {
  let t = String(v).replace(/[^\d,.-]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (!/^-?\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, "");
  return parseFloat(t) || 0;
};
const splitCodes = t => [...new Set(String(t || "").split(/[\s,;]+/).map(x => x.trim().toUpperCase()).filter(x => x.length >= 4 && x.length <= 40))];
/* Trova i codici in un Excel: colonna con intestazione da codice, altrimenti la colonna con più valori dall'aspetto di un codice ricambio */
function codesFromWorkbook(wb) {
  const looks = v => typeof v === "string" ? /^[A-Z0-9][A-Z0-9 .\-]{5,24}$/i.test(v.trim()) && /\d/.test(v) : false;
  let best = { score: 0, codes: [] };
  for (const rows of Object.values(wb.sheets)) {
    const width = Math.max(0, ...rows.slice(0, 50).map(r => (r || []).length));
    for (let c = 0; c < width; c++) {
      let hdr = -1;
      for (let r = 0; r < Math.min(rows.length, 15); r++) if (matchHeader((rows[r] || [])[c], FIELDS_B[0]) >= 2 || matchHeader((rows[r] || [])[c], FIELDS_A[0]) >= 2) { hdr = r; break; }
      const vals = rows.slice(hdr + 1).map(r => (r || [])[c]).filter(v => v != null && v !== "").map(v => String(v).trim().toUpperCase().replace(/\s+/g, ""));
      const good = vals.filter(v => looks(v));
      const score = good.length + (hdr >= 0 ? 1e6 : 0);
      if (good.length && score > best.score) best = { score, codes: [...new Set(hdr >= 0 ? vals : good)] };
    }
  }
  return best.codes;
}
function describeScenario(P) {
  const parts = [`${SCENARI[P.mode].t} · ${P.mode === "cover" ? orizzLabel(P.months) : fmtE(P.budget)}${P.mode === "free" && P.maxCover ? ` (al massimo ${oltreTxt(P.maxCover)})` : ""}`];
  const F = P.filters;
  if (F.groups.length) parts.push(F.groups.map(g => `gruppo ${g === "X" ? "altri" : g} ${GROUPS[g]}`).join(", "));
  if (F.abc.length) parts.push("classe " + F.abc.map(c => c === "N" ? "senza consumo" : c).join("/"));
  if (F.dg.length) parts.push("DG " + F.dg.join(", "));
  if (F.q) parts.push(`«${F.q}»`);
  if (F.codes && F.codes.length) parts.push(`elenco di ${fmtN(F.codes.length)} codici`);
  if (P.minDemand) parts.push(`consumo ≥ ${fmtN(P.minDemand, 2)} pz/mese`);
  return parts.join(" · ");
}
async function viewOrdine(main) {
  if (needDealer(main)) return;
  const snaps = state.snapshots.length ? state.snapshots : await loadSnapshots();
  if (!snaps.length) return noWeeks(main);
  const O = state.ordine;
  O.mode = SCENARI[O.mode] ? O.mode : "amount"; O.budgets = O.budgets || { amount: 50000, free: 50000 }; O.filters = O.filters || { groups: [], abc: [], dg: [], q: "" }; O.filters.codes = O.filters.codes || []; O.listOverride = O.listOverride !== false;
  O.history = O.history || []; O.seq = O.seq || 0;
  if (!snaps.some(s => s.id === O.snapId)) { O.snapId = snaps[snaps.length - 1].id; O.result = null; O.meta = null; O.history = []; }
  if (!O.meta || O.metaSnap !== O.snapId) { O.meta = await api("GET", `/api/snapshots/${O.snapId}/filters`); O.metaSnap = O.snapId; }
  O.flags = await api("GET", `/api/dealers/${state.dealerId}/flags`);
  const M = O.meta, F = O.filters;
  const chip = (attr, id, label, on, n) => `<button type="button" class="chip" ${attr}="${esc(id)}" aria-pressed="${on}">${esc(label)}${n != null ? `<span class="n">${fmtN(n)}</span>` : ""}</button>`;
  main.innerHTML = `<div class="head"><div><h1>Scenari d'ordine</h1><p class="sub">${esc(dealerName(state.dealerId))}. Scegli come vuoi ordinare, restringi i codici con i filtri e confronta gli scenari.</p></div>${weekSelect("ow", snaps, O.snapId)}</div>
  <form class="panel" id="of" novalidate>
    <div class="chips seg" role="group" aria-label="Tipo di scenario">
      ${Object.keys(SCENARI).map(k => chip("data-mode", k, SCENARI[k].s, O.mode === k)).join("")}</div>
    <div class="row" id="params"></div>
    <details class="filters"${F.codes.length ? " open" : ""}><summary>Solo i codici di un elenco${F.codes.length ? ` (${fmtN(F.codes.length)} codici)` : ""}</summary>
      <div class="fgrid">
        <p class="small muted">Scrivi o incolla i codici, oppure carica un Excel: la piattaforma fa i calcoli solo su quelli. Gli altri filtri restano validi.</p>
        <label class="field" for="lpaste">Codici (uno per riga, oppure separati da spazio, virgola o punto e virgola)<textarea id="lpaste" rows="4" placeholder="12385671&#10;45760932">${esc(F.codes.join("\n"))}</textarea></label>
        <div class="row"><label class="btn sm" for="lfile">Carica Excel con i codici</label><input type="file" id="lfile" accept=".xlsx,.xls,.xlsm,.csv"><button class="link" type="button" id="lclear">Svuota elenco</button><span class="small muted" id="linfo">${F.codes.length ? `${fmtN(F.codes.length)} codici${O.listName ? " da " + esc(O.listName) : ""}` : ""}</span></div>
        <label class="check" for="lover"><input type="checkbox" id="lover"${O.listOverride ? " checked" : ""}> Calcola anche i codici dell'elenco segnati su richiesta</label>
      </div></details>
    <details class="filters"${F.groups.length || F.abc.length || F.dg.length || F.q ? " open" : ""}><summary>Filtri sui codici${F.groups.length + F.abc.length + F.dg.length + (F.q ? 1 : 0) ? ` (${F.groups.length + F.abc.length + F.dg.length + (F.q ? 1 : 0)} attivi)` : ""}</summary>
      <div class="fgrid">
        <div><p class="flabel">Gruppo principale <span class="muted">(4ª cifra del codice)</span></p><div class="chips">${M.groups.map(g => chip("data-g", g.id, `${g.id === "X" ? "–" : g.id} ${g.label}`, F.groups.includes(g.id), g.n)).join("")}</div></div>
        <div><p class="flabel">Classe ABC sul consumo</p><div class="chips">${[["A", "A · 80% del consumo"], ["B", "B · 15%"], ["C", "C · 5%"], ["N", "Senza consumo"]].map(([k, l]) => chip("data-abc", k, l, F.abc.includes(k), M.abc[k])).join("")}</div></div>
        ${M.dg.length ? `<div><p class="flabel">DG</p><div class="chips dgbox">${M.dg.map(d => chip("data-dg", d.id, d.id, F.dg.includes(d.id), d.n)).join("")}</div></div>` : ""}
        <label class="field" for="fq">Tipologia o codice contiene<input type="search" id="fq" value="${esc(F.q)}" placeholder="es. FILTRO, PASTIGLIE, 123"></label>
        <div><button class="link" type="button" id="fclear">Togli tutti i filtri</button></div>
      </div></details>
    <details class="filters"><summary>Codici su richiesta (${fmtN(O.flags.length)} segnati a mano)</summary>
      <div class="fgrid">
        <p class="small muted">Le esclusioni dei codici su richiesta o con consumo basso si regolano nel pannello «Regole di riordino», sopra il risultato. I codici non tenuti a scorta (SMin e SMax a zero) sono sempre esclusi.</p>
        <div><p class="flabel">Codici segnati come su richiesta</p><p class="small muted">Sono sempre esclusi dagli scenari e dal livello di servizio. Puoi segnarli dalle righe d'ordine, dalla scheda codice o incollandoli qui.</p>
          <div id="flaglist"></div>
          <label class="field" for="fpaste">Incolla codici (uno per riga, oppure separati da spazio o virgola)<textarea id="fpaste" rows="3"></textarea></label>
          <div class="row"><button class="btn sm" type="button" id="fadd">Segna come su richiesta</button></div></div>
      </div></details>
    <div class="row"><button class="btn primary" type="submit">Calcola scenario</button><span class="small muted" id="odesc"></span></div>
  </form>
  <div id="ores"></div>
  <div id="ohist"></div>
  <section class="panel rules"><h3>Come lavorano gli scenari</h3><ul>
    <li><b>Per tutti</b>: il disponibile è la giacenza più gli ordini aperti. La <b>vendita regolare</b> di un codice è il consumo medio mensile × l'indice di regolarità delle vendite ÷ 12: sono i pezzi al mese su cui si può contare. L'indice va da 0 a 11,99: un valore più alto nel file conta come 11,99. I codici non tenuti a scorta (SMin e SMax a zero), i fermi e quelli senza storico sono sempre esclusi.</li>
    <li><b>Acquisti per coprire un periodo</b> (1, 2 o 3 mesi): per ogni codice l'obiettivo è il consumo medio mensile × i mesi, mai sotto la SMin e mai sopra la SMax. Si ordina la differenza tra l'obiettivo e il disponibile. Non c'è un importo: la spesa è il risultato.</li>
    <li><b>Acquisti per un importo</b>: prima i codici sotto la SMin tornano alla SMin; se l'importo non basta nemmeno per questo, passano prima i codici con la regolarità più alta e, a parità, con il consumo più alto. Il resto compra a tutti lo stesso numero di mesi di vendita regolare: chi vende di più e con più continuità riceve più pezzi. Nessun codice supera la SMax: chi ci arriva si ferma e l'importo prosegue sugli altri. Se tutti arrivano alla SMax, quello che resta non viene speso.</li>
    <li><b>Acquisti per un importo libero</b>: come l'importo, ma quello che resterebbe non speso sale oltre la SMax con la stessa proporzione: ogni codice riceve lo stesso numero di mesi di vendita regolare in più. La SMax viene superata solo dopo che tutti i codici ci sono arrivati. Si può fissare un limite per codice: al massimo da 1 a 6 mesi di consumo medio sopra la SMax.</li>
    <li><b>Pezzi interi</b>: i pezzi si assegnano uno alla volta al codice più vicino al suo pezzo successivo. Se l'importo rimasto non basta per un pezzo di un codice si passa agli altri: per questo può avanzare qualche euro.</li>
    <li><b>Codici su richiesta</b>: sono esclusi quelli segnati a mano dal responsabile e, se imposti una soglia, quelli con consumo medio troppo basso.</li></ul></section>`;
  const renderParams = () => {
    const p = $("#params"), amount = `<label class="field" for="ob">Importo in euro<input type="text" id="ob" inputmode="decimal" value="${esc(fmtN(O.budgets[O.mode]))}"></label>
      <div class="chips">${[10000, 25000, 50000, 100000].map(v => `<button class="chip" type="button" data-b="${v}">${fmtE(v)}</button>`).join("")}</div>`;
    if (O.mode === "cover") p.innerHTML = `<label class="field" for="om">Periodo da coprire<select id="om">${ORIZZ.map(([v, l]) => `<option value="${v}"${v === rules().months ? " selected" : ""}>${l}</option>`).join("")}</select></label>`;
    else if (O.mode === "free") p.innerHTML = `${amount}<label class="field" for="omc">Copertura massima per codice oltre la SMax<select id="omc">${COVER_MAX.map(([v, l]) => `<option value="${v}"${v === rules().maxCover ? " selected" : ""}>${l}</option>`).join("")}</select></label>`;
    else p.innerHTML = amount;
    $("#odesc").textContent = SCENARI[O.mode].d;
    $$("[data-b]", p).forEach(b => b.onclick = () => { $("#ob").value = fmtN(+b.dataset.b); $("#of").requestSubmit(); });
    if ($("#om")) $("#om").onchange = e => { rules().months = +e.target.value; saveRules(); };
    if ($("#omc")) $("#omc").onchange = e => { rules().maxCover = +e.target.value; saveRules(); };
  };
  const readParams = () => {
    if ($("#ob")) O.budgets[O.mode] = parseNum($("#ob").value);
    F.q = $("#fq").value.trim();
    F.codes = splitCodes($("#lpaste").value); O.listOverride = $("#lover").checked;
  };
  renderParams(); renderFlags();
  $("#fadd").onclick = async () => {
    const codes = $("#fpaste").value.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
    if (!codes.length) { toast("Incolla almeno un codice."); return; }
    try { const r = await api("POST", `/api/dealers/${state.dealerId}/flags`, { codes }); $("#fpaste").value = ""; O.flags = await api("GET", `/api/dealers/${state.dealerId}/flags`); renderFlags(); toast(`${fmtN(r.n)} codici segnati come su richiesta.`); }
    catch (x) { if (!x.silent) toast(x.message); }
  };
  $("#lpaste").oninput = () => { const n = splitCodes($("#lpaste").value).length; $("#linfo").textContent = n ? `${fmtN(n)} codici` : ""; O.listName = ""; };
  $("#lclear").onclick = () => { $("#lpaste").value = ""; F.codes = []; O.listName = ""; $("#linfo").textContent = ""; };
  $("#lfile").onchange = async e => {
    const file = e.target.files[0]; e.target.value = ""; if (!file) return;
    try {
      const wb = await readFile(file), codes = codesFromWorkbook(wb);
      if (!codes.length) { toast("Non ho trovato codici nel file: metti i codici in una colonna, con o senza intestazione."); return; }
      $("#lpaste").value = codes.join("\n"); O.listName = file.name; $("#linfo").textContent = `${fmtN(codes.length)} codici da ${file.name}`;
      toast(`${fmtN(codes.length)} codici caricati da ${file.name}.`);
    } catch (x) { toast(x.message); }
  };
  $$("[data-mode]", main).forEach(b => b.onclick = () => { readParams(); O.mode = b.dataset.mode; $$("[data-mode]", main).forEach(x => x.setAttribute("aria-pressed", x === b)); renderParams(); });
  const toggle = (attr, arr) => $$(`[${attr}]`, main).forEach(b => b.onclick = () => {
    const v = b.getAttribute(attr), k = arr.indexOf(v); if (k >= 0) arr.splice(k, 1); else arr.push(v); b.setAttribute("aria-pressed", k < 0);
  });
  toggle("data-g", F.groups); toggle("data-abc", F.abc); toggle("data-dg", F.dg);
  $("#fclear").onclick = () => { F.groups.length = 0; F.abc.length = 0; F.dg.length = 0; F.q = ""; $("#fq").value = ""; $$("[data-g],[data-abc],[data-dg]", main).forEach(b => b.setAttribute("aria-pressed", "false")); };
  $("#ow").onchange = e => { O.snapId = +e.target.value; O.result = null; O.history = []; viewOrdine(main); };
  $("#of").onsubmit = async e => {
    e.preventDefault(); readParams(); renderParams();   // i menu di periodo e copertura seguono le regole, anche se cambiate dal pannello
    if (O.mode !== "cover" && !(O.budgets[O.mode] > 0)) { toast("Indica un importo maggiore di zero."); return; }
    const RR = rules(), seq = ++O.seq;
    const P = { mode: O.mode, budget: O.mode === "cover" ? 0 : O.budgets[O.mode], months: RR.months, maxCover: RR.maxCover, minDemand: RR.minDemand, listOverride: O.listOverride, rules: RR,
      filters: { groups: [...F.groups], abc: [...F.abc], dg: [...F.dg], q: F.q, codes: [...F.codes] } };
    $("#ores").innerHTML = `<div class="panel"><p class="muted">Calcolo in corso…</p></div>`;
    try {
      const r = await api("POST", `/api/snapshots/${O.snapId}/scenario`, P);
      if (seq !== O.seq) return;
      r.title = describeScenario(P);
      O.result = r; O.show = 100; O.history = [{ title: r.title, s: r.summary, r }].concat(O.history.filter(h => h.title !== r.title)).slice(0, 8);
      renderProposal(); renderHistory();
    } catch (x) { if (!x.silent) $("#ores").innerHTML = `<div class="msg err">${esc(x.message)}</div>`; }
  };
  if (O.result) { renderProposal(); renderHistory(); } else $("#of").requestSubmit();
}
function renderFlags() {
  const O = state.ordine, host = $("#flaglist"); if (!host) return;
  host.innerHTML = O.flags.length ? `<div class="tablebox flagbox"><table><thead><tr><th>Codice</th><th>Descrizione</th><th>Nota</th><th>Segnato da</th><th></th></tr></thead><tbody>
    ${O.flags.map(f => `<tr><td class="code">${esc(f.code)}</td><td class="desc">${esc(f.descr || "")}</td><td class="desc small">${esc(f.note || "")}</td><td class="small">${esc(f.full_name || f.username || "")}<br><span class="muted">${esc(dIt((f.set_at || "").slice(0, 10)))}</span></td>
      <td><button class="btn sm" type="button" data-unflag="${esc(f.code)}">Rimetti a scorta</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="small muted">Nessun codice segnato.</p>`;
  $$("[data-unflag]", host).forEach(b => b.onclick = async () => {
    try { await api("DELETE", `/api/dealers/${state.dealerId}/flags/${encodeURIComponent(b.dataset.unflag)}`); O.flags = O.flags.filter(f => f.code !== b.dataset.unflag); renderFlags(); toast("Codice rimesso a scorta."); }
    catch (x) { if (!x.silent) toast(x.message); }
  });
}
function renderHistory(sel = "#ohist", resSel = "#ores", recalc) {
  const H = state.ordine.history, host = $(sel); if (!host) return;
  if (H.length < 2) { host.innerHTML = ""; return; }
  host.innerHTML = `<section class="panel"><h2>Confronto scenari</h2><div class="tablebox"><table><thead><tr><th>Scenario</th><th class="num">Valore</th><th class="num">Righe</th><th class="num">Pezzi</th><th class="num">Codici a zero coperti</th><th class="num">Sotto scorta coperti</th><th></th></tr></thead><tbody>
    ${H.map((h, k) => `<tr${h.r === state.ordine.result ? ' class="cur"' : ""}><td class="desc">${esc(h.title)}</td><td class="num">${fmtE(h.s.spent)}</td><td class="num">${fmtN(h.s.n_lines)}</td><td class="num">${fmtN(h.s.pieces)}</td>
      <td class="num">${fmtN(h.s.zero_cov)} / ${fmtN(h.s.zero_tot)}</td><td class="num">${fmtN(h.s.sotto_cov)} / ${fmtN(h.s.sotto_tot)}</td><td><button class="btn sm" type="button" data-h="${k}">Apri</button></td></tr>`).join("")}
  </tbody></table></div><p class="small muted">Gli scenari restano qui finché non cambi i dati o ricarichi la pagina.</p></section>`;
  $$("[data-h]", host).forEach(b => b.onclick = () => { state.ordine.result = H[+b.dataset.h].r; renderProposal(resSel, recalc); renderHistory(sel, resSel, recalc); $(resSel).scrollIntoView({ behavior: "smooth", block: "start" }); });
}
function renderProposal(sel = "#ores", recalc) {
  const R = state.ordine.result, S = R.summary, host = $(sel); if (!host) return;
  const pct = (a, b) => b ? Math.round(a / b * 100) + "%" : "–";
  const amt = S.mode !== "cover", notes = [];
  if (!amt && S.cut && S.cut.n) notes.push(`<div class="msg">La SMax frena <b>${fmtN(S.cut.n)}</b> codici: per coprire ${esc(orizzLabel(S.months))} servirebbero altri <b>${pezzi(S.cut.pieces)}</b> (${fmtE(S.cut.value)}), che porterebbero la giacenza oltre la SMax. Se succede spesso sugli stessi codici, la loro SMax è più bassa della domanda.</div>`);
  if (amt) {
    const parts = [S.smin.n ? `<b>${fmtE(S.smin.value)}</b> riportano alla SMin ${fmtN(S.smin.n)} codici` : "",
      S.prop.n ? `<b>${fmtE(S.prop.value)}</b> sono divisi in proporzione alle vendite regolari su ${fmtN(S.prop.n)} codici${S.prop.full ? ", tutti arrivati alla SMax" : `: ${fmtN(S.prop.level, 2)} mesi di vendita regolare per ciascuno, salvo chi si è fermato prima alla SMax`}` : "",
      S.extra && S.extra.n ? `<b>${fmtE(S.extra.value)}</b> vanno oltre la SMax su ${fmtN(S.extra.n)} codici: altri ${fmtN(S.extra.level, 2)} mesi di vendita regolare per ciascuno` : ""].filter(Boolean);
    if (S.smin.short) notes.push(`<div class="msg err">L'importo non basta per riportare alla SMin tutti i codici che sono sotto: ne restano fuori <b>${fmtN(S.smin.short)}</b>. Passano prima i codici con la regolarità di vendita più alta e, a parità, con il consumo più alto.</div>`);
    notes.push(`<div class="msg">${parts.length ? "Come è composto l'ordine: " + parts.join("; ") + "." : "Nessun acquisto possibile con l'importo e i codici scelti."}</div>`);
    if (S.left >= 1 && S.prop.full && S.mode === "amount") notes.push(`<div class="msg err">Tutti i codici sono arrivati alla SMax: restano <b>${fmtE(S.left)}</b> non spesi. Per spenderli serve lo scenario «${esc(SCENARI.free.t)}», che può superare la SMax.</div>`);
    if (S.left >= 1 && S.mode === "free" && S.extra && S.extra.full) notes.push(`<div class="msg err">${S.extra.limit
      ? `Con il limite di ${oltreTxt(S.extra.limit)} per codice restano <b>${fmtE(S.left)}</b> non spesi: alza o togli il limite nelle regole, oppure allarga i codici.`
      : `Nessun codice con vendite regolari può ricevere il resto: restano <b>${fmtE(S.left)}</b> non spesi. Allarga i codici o i filtri.`}</div>`);
    if (!S.prop.full && S.need > S.spent + 0.01) notes.push(`<div class="msg">Portare tutti i codici alla SMax costerebbe <b>${fmtE(S.need)}</b>: l'importo ne copre il ${pct(S.spent, S.need)}.</div>`);
    if (S.no_reg) notes.push(`<div class="msg">Nei dati caricati manca l'indice di regolarità delle vendite: la proporzione usa solo il consumo medio mensile.</div>`);
  }
  host.innerHTML = `<div class="scen-title"><h2>${esc(R.title)}</h2><p class="small muted">${esc(stockNote(R))}.</p></div>
  <div id="rbox"></div>
  <section class="tiles">
    <div class="tile"><span class="k">Valore dell'ordine</span><span class="v">${fmtE(S.spent)}</span><span class="s">${amt ? `su ${fmtE(S.budget)} · restano ${fmtE(S.left)}` : `per coprire ${esc(orizzLabel(S.months))} di vendite`}</span></div>
    <div class="tile neutral"><span class="k">Righe d'ordine</span><span class="v">${fmtN(S.n_lines)}</span><span class="s">${fmtN(S.pieces)} pezzi · ${fmtN(S.n_cands)} codici nel perimetro</span></div>
    <div class="tile bad"><span class="k">Codici a zero coperti</span><span class="v">${fmtN(S.zero_cov)}<span class="small muted"> / ${fmtN(S.zero_tot)}</span></span><span class="s">${pct(S.zero_cov, S.zero_tot)} riportati almeno a SMin</span></div>
    <div class="tile warn"><span class="k">Sotto scorta coperti</span><span class="v">${fmtN(S.sotto_cov)}<span class="small muted"> / ${fmtN(S.sotto_tot)}</span></span><span class="s">${pct(S.sotto_cov, S.sotto_tot)} riportati almeno a SMin</span></div>
  </section>
  ${S.list ? `<div class="msg">Elenco di ${fmtN(S.list.n)} codici: ${fmtN(S.list.found)} trovati nei dati, ${fmtN(S.list.n_missing)} non trovati${S.list.no_need ? `, ${fmtN(S.list.no_need)} già coperti, esclusi o senza fabbisogno` : ""}.${S.list.n_missing ? `<br><span class="small">Non trovati: <span class="mono">${S.list.missing.map(esc).join(", ")}${S.list.n_missing > S.list.missing.length ? "…" : ""}</span></span>` : ""}</div>` : ""}
  ${S.excluded && (S.excluded.flag + S.excluded.noparams + S.excluded.low + (S.excluded.minline || 0)) ? `<div class="msg">Esclusi: ${[S.excluded.noparams ? `${fmtN(S.excluded.noparams)} con consumo ma non tenuti a scorta (SMin e SMax a zero)` : "", S.excluded.flag ? `${fmtN(S.excluded.flag)} segnati su richiesta` : "", S.excluded.low ? `${fmtN(S.excluded.low)} sotto la soglia di consumo` : "", S.excluded.minline ? `${fmtN(S.excluded.minline)} righe sotto il valore minimo` : ""].filter(Boolean).join(", ")}.</div>` : ""}
  ${notes.join("\n  ")}
  ${S.by_group.length > 1 ? `<section class="panel"><h3>Valore dell'ordine per gruppo principale</h3><div id="obg"></div></section>` : ""}
  ${R.lines.length ? `<section class="panel" id="odec"></section>` : `<section class="panel"><p class="muted">Nessun codice da ordinare in questo scenario.</p></section>`}`;
  renderRules($("#rbox", host), S.mode, alertOnly => { if (alertOnly) { renderProposal(sel, recalc); return; } if (recalc) recalc(); else $("#of").requestSubmit(); });
  if ($("#obg", host)) bars($("#obg", host), S.by_group.map(g => ({ label: `${g.id === "X" ? "–" : g.id} ${g.label}`, value: g.value, sub: `${fmtN(g.n)} righe` })), { fmt: fmtE });
  if ($("#odec", host)) renderDecision($("#odec", host), R, recalc, sel);
}

/* ============ Tabella di conferma: Sì / No per riga ============ */
const covTxt = v => v == null ? "–" : fmtN(v, 1);
function decKey(R) { return `ig_dec_${state.dealerId}_${R.week}_${R.at || ""}_${R.title}`; }
function lineAlerts(l, th) {
  const a = [];
  // quantità cambiata a mano oltre la SMax: si segnala sempre, anche quando la copertura è nei limiti
  if (l.edited && l.smax > 0 && l.disp + l.qty > l.smax) a.push(`Oltre la SMax di ${fmtN(l.disp + l.qty - l.smax)} pezzi dopo la modifica`);
  if (!(l.cons_mese > 0)) a.push("Nessuna domanda registrata: copertura non calcolabile");
  else if (Math.round(l.cover_after * 10) / 10 > th) a.push(`Copertura dopo l'ordine ${fmtN(l.cover_after, 1)} mesi (oltre ${fmtN(th)})`);
  return a;
}
function moveCells(l) {
  const v = l.prev_giac == null ? null : l.giac - l.prev_giac;
  return `<td class="num">${l.qty_sold != null ? fmtN(l.qty_sold) : "–"}${l.ven_spc ? `<span class="sub">spec. ${fmtN(l.ven_spc)}</span>` : ""}</td>
        <td class="num">${l.last_sale ? esc(dIt(l.last_sale)) : "–"}</td>
        <td class="num">${l.cons_mese ? fmtN(l.cons_mese, 2) : "–"}${l.cons_eff != null && l.cons_mese && Math.abs(l.cons_eff - l.cons_mese) > 1e-9 ? `<span class="sub">considerato ${fmtN(l.cons_eff, 2)}</span>` : ""}${l.regolarita ? `<span class="sub">regolarità ${fmtN(l.regolarita, 2)}</span>` : ""}</td>
        <td class="num">${v == null ? "–" : v === 0 ? "=" : (v > 0 ? "+" : "") + fmtN(v)}${l.prev_giac != null ? `<span class="sub">prima ${fmtN(l.prev_giac)}</span>` : ""}</td>`;
}
const MOVE_TH = `<th class="num" title="Quantità venduta di recente indicata nella lista movimentazione">Venduto recente</th><th class="num" title="Data dell'ultima vendita indicata nella lista movimentazione">Ultima vendita</th><th class="num" title="Consumo medio mensile in pezzi indicato nella lista movimentazione. Sotto: indice di regolarità delle vendite, da 0 a 11,99">Consumo/mese</th><th class="num" title="Variazione della giacenza rispetto al caricamento precedente">Var. giacenza</th>`;
/* Blocca le prime due colonne a sinistra e quelle da «Proposta» in poi a destra.
   Se lo schermo è troppo stretto per entrambi i blocchi, a destra resta bloccata solo l'ultima colonna. */
let freezeActive = null;
function freezeTable(t) {
  if (!t) return;
  const ths = [...t.tHead.rows[0].cells], box = t.parentElement;
  const start = ths.findIndex(th => th.hasAttribute("data-fzstart"));
  const apply = () => {
    if (!t.isConnected) return;
    const rows = [...t.rows].filter(r => !r.classList.contains("whyrow"));
    rows.forEach(r => [...r.cells].forEach(c => { c.classList.remove("fz", "fz-l-edge", "fz-r-edge"); c.style.left = ""; c.style.right = ""; }));
    if (t.scrollWidth <= box.clientWidth + 1) return;
    const w = ths.map(th => th.getBoundingClientRect().width), nLeft = 2;
    const leftW = w[0] + w[1];
    let ri = start >= 0 ? start : ths.length - 1;
    if (leftW + w.slice(ri).reduce((a, b) => a + b, 0) > box.clientWidth - 160) ri = ths.length - 1;
    const pos = []; let acc = 0;
    for (let i = 0; i < nLeft; i++) { pos[i] = { left: Math.floor(acc) }; acc += w[i]; }
    acc = 0; for (let i = ths.length - 1; i >= ri; i--) { pos[i] = { right: Math.floor(acc) }; acc += w[i]; }
    rows.forEach(r => [...r.cells].forEach((c, i) => {
      const p = pos[i]; if (!p) return;
      c.classList.add("fz");
      if (p.left != null) { c.style.left = p.left + "px"; if (i === nLeft - 1) c.classList.add("fz-l-edge"); }
      else { c.style.right = p.right + "px"; if (i === ri) c.classList.add("fz-r-edge"); }
    }));
  };
  apply();
  freezeActive = apply;
}
let freezeTimer;
window.addEventListener("resize", () => { clearTimeout(freezeTimer); freezeTimer = setTimeout(() => { if (freezeActive) freezeActive(); }, 150); });
/* Quantità cambiate a mano nella proposta: R.qedit[codice] = { q: quantità scelta, p: quantità proposta quando è stata cambiata }.
 * Valgono solo finché la proposta di quel codice resta la stessa: se le regole la cambiano, la modifica decade.
 * La riga effettiva ha la quantità scelta, con valore e copertura dopo l'ordine ricalcolati; qty_prop è la quantità proposta. */
const QMAX = 99999;
function effLine(R, l) {
  const e = R.qedit && R.qedit[l.code];
  if (!e || e.p !== l.qty || e.q === l.qty) return { ...l, qty_prop: l.qty, edited: false };
  return { ...l, qty: e.q, qty_prop: l.qty, edited: true, value: e.q * l.cost, cover_after: l.cons_eff > 0 ? (l.disp + e.q) / l.cons_eff : null };
}
function renderDecision(host, R, recalc, sel = "#ores") {
  // le decisioni restano legate alla quantità: se le regole cambiano la quantità, la riga torna da decidere
  if (!R.dec) {
    R.dec = {}; R.decq = {}; R.qedit = {};
    try { const sv = JSON.parse(localStorage.getItem(decKey(R)) || "null"); if (sv && sv.dec) { R.dec = sv.dec; R.decq = sv.q || {}; R.qedit = sv.e && typeof sv.e === "object" ? sv.e : {}; } else if (sv) R.dec = sv; } catch (e) {}
    const qty = new Map(R.lines.map(l => [l.code, l.qty]));
    Object.keys(R.dec).forEach(c => { if (R.decq[c] != null && R.decq[c] !== qty.get(c)) { delete R.dec[c]; delete R.decq[c]; } });
    Object.keys(R.qedit).forEach(c => { const e = R.qedit[c]; if (!e || !Number.isInteger(e.q) || e.q < 0 || e.q > QMAX || e.p !== qty.get(c)) delete R.qedit[c]; });
  }
  const saveDec = () => { R.decq = Object.fromEntries(R.lines.filter(l => R.dec[l.code]).map(l => [l.code, l.qty])); try { localStorage.setItem(decKey(R), JSON.stringify({ dec: R.dec, q: R.decq, e: R.qedit })); } catch (e) {} };
  R.decFilter = R.decFilter || "tutte"; R.decShow = R.decShow || 100;
  const th = rules().alertMonths;
  const rows = R.lines.map(l0 => { const l = effLine(R, l0); return { l, al: lineAlerts(l, th), d: R.dec[l.code] || "" }; });
  const nEd = rows.filter(r => r.l.edited).length;
  const cnt = { tutte: rows.length, alert: rows.filter(r => r.al.length).length, todo: rows.filter(r => !r.d).length, si: rows.filter(r => r.d === "si").length, no: rows.filter(r => r.d === "no").length };
  const acc = rows.filter(r => r.d === "si"), accV = acc.reduce((t, r) => t + r.l.value, 0), accQ = acc.reduce((t, r) => t + r.l.qty, 0);
  const vis = rows.filter(r => R.decFilter === "tutte" || (R.decFilter === "alert" && r.al.length) || (R.decFilter === "todo" && !r.d) || r.d === R.decFilter);
  const grpTxt = l => `${l.grp === "X" ? "–" : l.grp} ${GROUPS[l.grp] || ""}`.trim();
  const filters = [["tutte", "Tutte"], ["alert", "Con avviso"], ["todo", "Da decidere"], ["si", "Accettate"], ["no", "Rifiutate"]];
  host.innerHTML = `<div class="bar"><div><h2>Proposta d'acquisto da confermare</h2><p class="small muted">Per ogni riga scegli <b>Sì</b> o <b>No</b> nell'ultima colonna. Puoi cambiare la quantità: valore della riga, copertura e totali si aggiornano subito, e cambiare la quantità accetta la riga. Codice e colonne da «Quantità» in poi restano fermi mentre scorri la tabella. «Perché» mostra come è stata calcolata la proposta. Quando hai deciso tutte le righe puoi scaricare l'ordine confermato in Excel o PDF.</p></div>
      <label class="field" for="alth">Avviso se la copertura dopo l'ordine supera<select id="alth">${[1, 2, 3, 4, 6, 9, 12].map(v => `<option value="${v}"${v === th ? " selected" : ""}>${v} ${v === 1 ? "mese" : "mesi"}</option>`).join("")}</select></label></div>
    <div class="decsum"><div><span class="k">Righe decise</span><b>${fmtN(cnt.si + cnt.no)} / ${fmtN(cnt.tutte)}</b></div><div><span class="k">Accettate</span><b>${fmtN(cnt.si)} righe · ${fmtN(accQ)} pezzi · ${fmtE(accV)}</b></div>
         <div><span class="k">Rifiutate</span><b>${fmtN(cnt.no)} righe</b></div><div><span class="k">Con avviso</span><b class="${cnt.alert ? "alerttxt" : ""}">${fmtN(cnt.alert)} righe</b></div>
         <div><span class="k">Quantità cambiate</span><b>${fmtN(nEd)} righe</b>${nEd ? `<button class="link small" type="button" id="qreset">Torna alle quantità proposte</button>` : ""}</div>
    </div>
    <div class="bar"><div class="chips" role="group" aria-label="Filtra le righe">${filters.map(([k, l]) => `<button type="button" class="chip" data-df="${k}" aria-pressed="${R.decFilter === k}">${l}<span class="n">${fmtN(cnt[k])}</span></button>`).join("")}</div>
      <div class="row"><button class="btn sm" type="button" data-bulk="okNoAlert">Sì a tutte senza avviso</button><button class="btn sm" type="button" data-bulk="noAlert">No a tutte con avviso</button><button class="btn sm" type="button" data-bulk="allSi">Sì a tutte</button><button class="link" type="button" data-bulk="reset">Azzera</button></div></div>
    ${vis.length ? `<div class="tablebox"><table class="dectab"><thead><tr><th class="num">#</th><th>Codice</th><th>Descrizione</th><th>Gruppo</th><th class="num">Giacenza</th><th class="num">Ord. aperti</th><th class="num">SMin</th><th class="num">SMax</th>${MOVE_TH}<th class="num">Listino</th><th class="num">Netto</th><th class="num">Copertura attuale</th><th class="num" data-fzstart>Quantità</th><th class="num">Valore netto</th><th class="num">Copertura dopo</th><th>Avviso</th><th></th><th>Accetto</th></tr></thead><tbody>
      ${vis.slice(0, R.decShow).map(({ l, al, d }) => `<tr class="${d ? "d-" + d : ""}${al.length ? " has-al" : ""}"><td class="num muted">${l.rank}</td>
        <td class="code"><button type="button" data-c="${esc(l.code)}">${esc(l.code)}</button></td>
        <td class="desc" title="${esc(l.reasons.join(", "))}">${esc(l.descr)}</td>
        <td class="small">${esc(grpTxt(l))}${l.dg ? `<span class="sub">DG ${esc(l.dg)}</span>` : ""}</td>
        <td class="num">${fmtN(l.giac)}</td><td class="num">${l.ord ? fmtN(l.ord) : "–"}</td><td class="num">${fmtN(l.smin)}</td><td class="num">${fmtN(l.smax)}</td>
        ${moveCells(l)}
        <td class="num">${l.listino != null ? fmtE2(l.listino) : "–"}</td><td class="num">${fmtE2(l.cost)}</td>
        <td class="num">${covTxt(l.cover_before)}${l.cover_before != null ? " mesi" : ""}</td>
        <td class="num qcell"><input class="qin${l.edited ? " ed" : ""}" type="number" inputmode="numeric" min="0" max="${QMAX}" step="1" value="${l.qty}" data-qe="${esc(l.code)}" aria-label="Quantità di ${esc(l.code)}">
          <span class="sub">${l.edited ? `proposta ${fmtN(l.qty_prop)}` : l.partial ? "parziale" : ""} <button type="button" class="link small" data-why="${esc(l.code)}" aria-expanded="${R.why === l.code}">perché</button></span></td><td class="num">${fmtE2(l.value)}</td>
        <td class="num">${covTxt(l.cover_after)}${l.cover_after != null ? " mesi" : ""}</td>
        <td>${al.length ? `<span class="alert" title="${esc(al.join(" · "))}">⚠ ${esc(alShort(al, th))}</span>` : ""}</td>
        <td><button class="link small" type="button" data-od="${esc(l.code)}" title="Escludi questo codice da tutti gli scenari">su richiesta</button></td>
        <td><div class="yn" role="group" aria-label="Accetto ${esc(l.code)}"><button type="button" class="ynb si" data-yn="si" data-code="${esc(l.code)}" aria-pressed="${d === "si"}">Sì</button><button type="button" class="ynb no" data-yn="no" data-code="${esc(l.code)}" aria-pressed="${d === "no"}">No</button></div></td></tr>${R.why === l.code ? `<tr class="whyrow"><td colspan="21"><div class="whybox"><b>Come è calcolata la quantità di ${esc(l.code)}</b>${whyHtml(l, R)}</div></td></tr>` : ""}`).join("")}
    </tbody></table></div>${vis.length > R.decShow ? `<div class="pager"><span>Mostrate ${fmtN(R.decShow)} righe su ${fmtN(vis.length)}.</span><button class="btn sm" type="button" id="dmore">Mostra altre 200</button></div>` : ""}` : `<p class="muted">Nessuna riga in questa vista.</p>`}
    <div class="decexp"><div class="small muted" id="dexpmsg">${cnt.todo ? `Mancano <b>${fmtN(cnt.todo)}</b> righe da decidere prima di scaricare l'ordine confermato.` : cnt.si ? `Ordine confermato pronto: ${fmtN(cnt.si)} righe, ${fmtE(accV)}.` : "Nessuna riga accettata."}</div>
      <div class="row"><button class="btn primary" type="button" id="dxls"${cnt.todo || !cnt.si ? " disabled" : ""}>Ordine confermato in Excel</button><button class="btn primary" type="button" id="dpdf"${cnt.todo || !cnt.si ? " disabled" : ""}>Ordine confermato in PDF</button><button class="btn" type="button" id="oxls">Proposta completa in Excel</button></div></div>`;
  freezeTable($("table.dectab", host));
  const rer = () => renderDecision(host, R, recalc, sel);
  $("#alth", host).onchange = e => { rules().alertMonths = +e.target.value; saveRules(); renderProposal(sel, recalc); };
  $$("[data-df]", host).forEach(b => b.onclick = () => { R.decFilter = b.dataset.df; R.decShow = 100; rer(); });
  $$("[data-why]", host).forEach(b => b.onclick = () => { R.why = R.why === b.dataset.why ? null : b.dataset.why; rer(); });
  // quantità cambiata a mano: si applica quando si esce dal campo (o con Invio), poi la tabella si ridisegna
  // e il cursore torna dove l'utente era andato (per esempio con Tab sulla riga successiva)
  const qins = $$("[data-qe]", host);
  const focusQ = code => { const n = code && $(`[data-qe="${CSS.escape(code)}"]`, host); if (n) { n.focus(); n.select(); } };
  // applica la quantità scritta; «go» è il codice su cui portare il cursore dopo (Tab e Maiusc+Tab passano da una quantità all'altra)
  const commitQ = (inp, go) => {
    const c = inp.dataset.qe, l = R.lines.find(x => x.code === c); if (!l) return;
    const v = Math.round(numVal(inp.value)), cur = effLine(R, l).qty;
    if (!Number.isFinite(v) || v < 0 || v > QMAX) { toast(`Quantità non valida: scrivi un numero intero da 0 a ${fmtN(QMAX)}.`); inp.value = cur; return; }
    if (v === cur) { if (go) focusQ(go); return; }
    if (v === l.qty) delete R.qedit[c]; else R.qedit[c] = { q: v, p: l.qty };
    R.dec[c] = v > 0 ? "si" : "no";
    saveDec(); inp.onchange = null; rer(); focusQ(go);
  };
  qins.forEach((inp, i) => {
    inp.onkeydown = e => {
      if (e.key === "Enter") { e.preventDefault(); commitQ(inp, inp.dataset.qe); }
      else if (e.key === "Tab") { const t = qins[i + (e.shiftKey ? -1 : 1)]; if (t) { e.preventDefault(); commitQ(inp, t.dataset.qe); } }
    };
    inp.onchange = () => commitQ(inp, null);
  });
  if ($("#qreset", host)) $("#qreset", host).onclick = async () => { if (!await confirmBox("Tornare alle quantità proposte?", "Le quantità cambiate a mano verranno annullate; le decisioni Sì/No restano.", "Annulla le modifiche", true)) return; R.qedit = {}; saveDec(); rer(); };
  $$("[data-yn]", host).forEach(b => b.onclick = () => { const c = b.dataset.code; R.dec[c] = R.dec[c] === b.dataset.yn ? "" : b.dataset.yn; if (!R.dec[c]) delete R.dec[c]; saveDec(); rer(); });
  $$("[data-bulk]", host).forEach(b => b.onclick = async () => {
    const k = b.dataset.bulk;
    if (k === "reset") { if (!await confirmBox("Azzerare le decisioni?", "Tutte le righe torneranno da decidere e alle quantità proposte.", "Azzera", true)) return; R.dec = {}; R.qedit = {}; }
    // una riga portata a zero resta rifiutata: non c'è niente da ordinare
    else rows.forEach(r => { if (r.l.qty === 0) { R.dec[r.l.code] = "no"; return; } if (k === "allSi" || (k === "okNoAlert" && !r.al.length)) { if (!R.dec[r.l.code] || k === "allSi") R.dec[r.l.code] = "si"; } else if (k === "noAlert" && r.al.length) R.dec[r.l.code] = "no"; });
    saveDec(); rer();
  });
  if ($("#dmore", host)) $("#dmore", host).onclick = () => { R.decShow += 200; rer(); };
  $$("[data-c]", host).forEach(b => b.onclick = () => { state.codice = b.dataset.c; location.hash = "#codice"; });
  $$("[data-od]", host).forEach(b => b.onclick = async () => {
    b.disabled = true;
    try {
      await api("POST", `/api/dealers/${state.dealerId}/flags`, { codes: [b.dataset.od], note: "Escluso da uno scenario d'ordine" });
      state.ordine.flags = await api("GET", `/api/dealers/${state.dealerId}/flags`); renderFlags();
      toast(`${b.dataset.od} segnato come su richiesta: ricalcolo.`); if (recalc) recalc(); else $("#of").requestSubmit();
    } catch (x) { b.disabled = false; if (!x.silent) toast(x.message); }
  });
  $("#oxls", host).onclick = () => exportProposalXls(R);
  $("#dxls", host).onclick = () => exportConfirmedXls(R, rows);
  $("#dpdf", host).onclick = () => exportConfirmedPdf(R, rows);
}
const alShort = (al, th) => (al[0].startsWith("Oltre la SMax") ? "Oltre SMax" : al[0].startsWith("Nessuna") ? "Senza domanda" : "Oltre " + fmtN(th) + " mesi");
function confirmedRows(rows) {
  const th = rules().alertMonths;
  return rows.filter(r => r.d === "si" && r.l.qty > 0).map(({ l, al }) => ({ "Codice particolare": l.code, "Descrizione": l.descr, "Gruppo principale": `${l.grp} ${GROUPS[l.grp] || ""}`.trim(), "DG": l.dg || "",
    "Giacenza attuale": l.giac, "Ordini aperti": l.ord, "SMin": l.smin, "SMax": l.smax, "Venduto recente": l.qty_sold != null ? l.qty_sold : "", "Vendite speciali": l.ven_spc != null ? l.ven_spc : "",
    "Ultima vendita": l.last_sale ? dIt(l.last_sale) : "", "Consumo medio mensile": l.cons_mese || "", "Regolarità vendite (0-11,99)": l.regolarita || "", "Giacenza caricamento precedente": l.prev_giac != null ? l.prev_giac : "",
    "Prezzo listino": l.listino != null ? l.listino : "", "Prezzo netto": l.cost,
    "Copertura attuale (mesi)": l.cover_before == null ? "" : Math.round(l.cover_before * 10) / 10, "Quantità proposta": l.qty_prop != null ? l.qty_prop : l.qty, "Quantità": l.qty, "Modificata a mano": l.edited ? "Sì" : "",
    "Valore netto": Math.round(l.value * 100) / 100, "Valore listino": l.listino != null ? Math.round(l.listino * l.qty * 100) / 100 : "",
    "Copertura dopo (mesi)": l.cover_after == null ? "" : Math.round(l.cover_after * 10) / 10, "Avviso": al.join(" · "), "Come è calcolata": whyText(l) }));
}
function orderMeta(R, rows) {
  const u = state.me.user, accepted = (rows ? rows.filter(r => r.d === "si").map(r => r.l) : R.lines.filter(l => R.dec[l.code] === "si").map(l => effLine(R, l))).filter(l => l.qty > 0);
  return { dealer: dealerName(state.dealerId), week: snapLabel(R.week, R.at), stock: stockNote(R), scen: R.title, user: u.full_name || u.username, date: new Date().toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }),
    n: accepted.length, q: accepted.reduce((t, l) => t + l.qty, 0), v: accepted.reduce((t, l) => t + l.value, 0), vl: accepted.reduce((t, l) => t + (l.listino || 0) * l.qty, 0),
    rejected: R.lines.length - accepted.length };
}
function exportConfirmedXls(R, rows) {
  const M = orderMeta(R, rows), data = confirmedRows(rows), wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data); ws["!cols"] = Object.keys(data[0]).map(k => ({ wch: Math.max(11, k.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, "Ordine confermato");
  const rej = rows.filter(r => r.d === "no" || (r.d === "si" && r.l.qty === 0)).map(({ l, al }) => ({ "Codice particolare": l.code, "Descrizione": l.descr, "Quantità proposta": l.qty_prop != null ? l.qty_prop : l.qty, "Valore netto": Math.round(l.value * 100) / 100, "Avviso": al.join(" · ") }));
  if (rej.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rej), "Righe non accettate");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Ordine confermato"], ["Concessionaria", M.dealer], ["Dati del", M.week], ["Giacenze", M.stock], ["Scenario", M.scen], ["Regole di riordino", rulesText(R.summary.rules || rules(), R.summary.mode)], ["Confermato da", M.user], ["Data", M.date],
    ["Righe accettate", M.n], ["Righe non accettate", M.rejected], ["Quantità cambiate a mano", rows.filter(r => r.d === "si" && r.l.edited && r.l.qty > 0).length], ["Pezzi", M.q], ["Valore netto", Math.round(M.v * 100) / 100], ["Valore a listino", Math.round(M.vl * 100) / 100]]), "Riepilogo");
  XLSX.writeFile(wb, `ordine_confermato_${M.dealer.replace(/[^\w\-]+/g, "_")}_${R.week}.xlsx`);
}
function exportConfirmedPdf(R, rows) {
  const title = "Ordine confermato";
  if (!window.jspdf || !window.jspdf.jsPDF) { toast("Il generatore PDF non si è caricato: ricarica la pagina."); return; }
  const M = orderMeta(R, rows), doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const th = rules().alertMonths, W = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(title, 14, 16);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(80);
  doc.text([`Concessionaria: ${M.dealer}`, `Dati del ${M.week} · ${M.stock}`, `${M.scen}`, `Confermato da ${M.user} il ${M.date}`], 14, 23);
  doc.setFontSize(8); doc.text(doc.splitTextToSize(`Regole di riordino: ${rulesText(R.summary.rules || rules(), R.summary.mode)}`, W - 28).slice(0, 2), 14, 41); doc.setFontSize(9.5);
  doc.setTextColor(20); doc.setFont("helvetica", "bold");
  doc.text(`${fmtN(M.n)} righe · ${fmtN(M.q)} pezzi · valore netto ${fmtE2(M.v)}${M.vl ? ` · a listino ${fmtE2(M.vl)}` : ""}`, W - 14, 23, { align: "right" });
  const conf = rows.filter(r => r.d === "si" && r.l.qty > 0), nEd = conf.filter(r => r.l.edited).length;
  const body = conf.map(({ l, al }) => [l.code, l.descr || "", `${l.grp === "X" ? "–" : l.grp} ${GROUPS[l.grp] || ""}`.trim(), fmtN(l.giac), fmtN(l.smin), fmtN(l.smax), l.cons_mese ? fmtN(l.cons_mese, 2) : "–", l.regolarita ? fmtN(l.regolarita, 2) : "–",
    [l.qty_sold != null ? fmtN(l.qty_sold) : "", l.last_sale ? dIt(l.last_sale) : ""].filter(Boolean).join(" · ") || "–", l.listino != null ? fmtE2(l.listino) : "–", fmtE2(l.cost),
    covTxt(l.cover_before), l.edited ? `${fmtN(l.qty)} *` : fmtN(l.qty), fmtE2(l.value), covTxt(l.cover_after), al.length ? alShort(al, th) : ""]);
  doc.autoTable({
    startY: 49, head: [["Codice", "Descrizione", "Gruppo", "Giacenza", "SMin", "SMax", "Consumo (pz/mese)", "Regolarità", "Venduto / ult. vendita", "Listino", "Netto", "Cop. attuale (mesi)", "Quantità", "Valore netto", "Cop. dopo (mesi)", "Avviso"]], body,
    foot: [["Totale", "", "", "", "", "", "", "", "", "", "", "", fmtN(M.q), fmtE2(M.v), "", ""]], showFoot: "lastPage",
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.4 }, headStyles: { fillColor: [17, 17, 17], textColor: 255 }, footStyles: { fillColor: [236, 239, 242], textColor: 20, fontStyle: "bold" },
    columnStyles: { 0: { font: "courier" }, 1: { cellWidth: 36 }, 2: { cellWidth: 24 }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" }, 10: { halign: "right" }, 11: { halign: "right" }, 12: { halign: "right", fontStyle: "bold" }, 13: { halign: "right" }, 14: { halign: "right" }, 15: { textColor: [198, 40, 40] } },
    alternateRowStyles: { fillColor: [247, 249, 250] }, margin: { left: 14, right: 14 },
    didDrawPage: d => { doc.setFontSize(8); doc.setTextColor(120); doc.text(`Pagina ${doc.internal.getNumberOfPages()}`, W - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" }); doc.text("Parts Planning", 14, doc.internal.pageSize.getHeight() - 8); }
  });
  let y = doc.lastAutoTable.finalY + 8;
  if (nEd) { doc.setFontSize(8); doc.setTextColor(80); doc.text(`* Quantità cambiata a mano rispetto alla proposta (${fmtN(nEd)} ${nEd === 1 ? "riga" : "righe"}); l'Excel riporta anche la quantità proposta.`, 14, y); }
  y += 8;
  if (y < doc.internal.pageSize.getHeight() - 20) { doc.setFontSize(9.5); doc.setTextColor(40); doc.text("Firma del responsabile di magazzino: ______________________________", 14, y); }
  doc.save(`ordine_confermato_${M.dealer.replace(/[^\w\-]+/g, "_")}_${R.week}.pdf`);
}
function exportProposalXls(R) {
  const S = R.summary;
  const rows = R.lines.map(l => ({ "Priorità": l.rank, "Codice": l.code, "Descrizione": l.descr, "Gruppo principale": `${l.grp} ${GROUPS[l.grp] || ""}`.trim(), "Classe ABC": l.cls === "N" ? "" : l.cls, "DG": l.dg, "Locazione": l.loc,
    "Stato": l.tier === 1 ? "A zero" : STATI[l.status], "Giacenza": l.giac, "Ordini aperti": l.ord, "Giacenza caricamento precedente": l.prev_giac != null ? l.prev_giac : "",
    "Venduto recente": l.qty_sold != null ? l.qty_sold : "", "Vendite speciali": l.ven_spc != null ? l.ven_spc : "", "Ultima vendita": l.last_sale ? dIt(l.last_sale) : "",
    "SMin": l.smin, "SMax": l.smax, "Consumo medio mensile": l.cons_mese, "Regolarità vendite (0-11,99)": l.regolarita, "Vendita regolare (pz/mese)": Math.round((l.vr || 0) * 100) / 100,
    "Prezzo listino": l.listino != null ? l.listino : "", "Prezzo netto": l.cost, "Copertura attuale (mesi)": l.cover_before == null ? "" : Math.round(l.cover_before * 10) / 10, "Quantità proposta": l.qty,
    "Parziale": l.partial ? "Sì" : "", "Copertura dopo (mesi)": l.cover_after == null ? "" : Math.round(l.cover_after * 10) / 10,
    "Valore netto": Math.round(l.value * 100) / 100, "Cumulato": Math.round(l.cum * 100) / 100, "Motivo": l.reasons.join(", "), "Come è calcolata": whyText(l), "Decisione": R.dec && R.dec[l.code] ? (R.dec[l.code] === "si" ? "Sì" : "No") : "" }));
  const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = Object.keys(rows[0]).map(k => ({ wch: Math.max(10, k.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, "Proposta");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Scenario", R.title], ["Regole di riordino", rulesText(S.rules || rules(), S.mode)], ["Dati del", snapLabel(R.week, R.at)], ["Giacenze", stockNote(R)], ["Concessionaria", dealerName(state.dealerId)], ["Valore", Math.round(S.spent * 100) / 100], ["Righe", S.n_lines], ["Pezzi", S.pieces]]), "Scenario");
  XLSX.writeFile(wb, `proposta_${dealerName(state.dealerId).replace(/[^\w\-]+/g, "_")}_${R.week}_${S.mode}.xlsx`);
}

/* ============ Barre orizzontali ============ */
function bars(host, items, opt = {}) {
  const max = Math.max(...items.map(i => i.value), 0) || 1;
  host.innerHTML = `<div class="bars">${items.map((i, k) => `<div class="brow" title="${esc(i.label)}: ${esc(opt.fmt ? opt.fmt(i.value) : fmtN(i.value))}${i.sub ? " · " + esc(i.sub) : ""}">
    <span class="bl">${esc(i.label)}</span><span class="btrack"><span class="bfill" data-k="${k}"></span></span><span class="bv">${esc(opt.fmt ? opt.fmt(i.value) : fmtN(i.value))}${i.sub ? `<span class="bs">${esc(i.sub)}</span>` : ""}</span></div>`).join("")}</div>`;
  $$(".bfill", host).forEach(el => { const i = items[+el.dataset.k]; el.style.width = Math.max(i.value > 0 ? 0.6 : 0, i.value / max * 100) + "%"; el.style.background = i.color || opt.color || "var(--chart)"; });
}

/* ============ Dispersione rotazione / copertura (canvas, scale logaritmiche) ============ */
function scatter(host, pts) {
  const cs = getComputedStyle(document.documentElement), col = v => cs.getPropertyValue(v).trim();
  const colors = { ok: col("--good"), sotto: col("--bad"), eccesso: col("--warn"), fermo: col("--idle") };
  host.innerHTML = `<div class="ct"><h3>Rotazione e copertura dei codici a magazzino</h3></div>
    <div class="legend">${["ok", "sotto", "eccesso", "fermo"].map(s => `<span><i class="sw sw-${s}"></i>${STATI[s]}</span>`).join("")}<span class="muted small">Ogni punto è un codice. Scale logaritmiche.</span></div>
    <div class="cwrap"><canvas></canvas><div class="tip" hidden></div></div>`;
  const cv = $("canvas", host), tip = $(".tip", host), wrap = $(".cwrap", host);
  const W = wrap.clientWidth || 600, H = Math.min(380, Math.max(260, W * 0.5)), dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
  const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
  const L = 54, R = 26, T = 10, B = 40;
  const xs = [0.01, 100], ys = [0.1, 240];
  const lx = v => L + (Math.log10(Math.min(Math.max(v, xs[0]), xs[1])) - Math.log10(xs[0])) / (Math.log10(xs[1]) - Math.log10(xs[0])) * (W - L - R);
  const ly = v => T + (1 - (Math.log10(Math.min(Math.max(v, ys[0]), ys[1])) - Math.log10(ys[0])) / (Math.log10(ys[1]) - Math.log10(ys[0]))) * (H - T - B);
  ctx.font = "11px " + cs.getPropertyValue("--f-body"); ctx.fillStyle = col("--muted"); ctx.strokeStyle = col("--line"); ctx.lineWidth = 1;
  [0.01, 0.1, 1, 10, 100].forEach(v => { const x = lx(v); ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, H - B); ctx.stroke(); ctx.textAlign = "center"; ctx.fillText(fmtN(v, v < 0.1 ? 2 : v < 1 ? 1 : 0), x, H - B + 14); });
  [0.1, 1, 3, 12, 60, 240].forEach(v => { const y = ly(v); ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke(); ctx.textAlign = "right"; ctx.fillText(fmtN(v, v < 1 ? 1 : 0), L - 6, y + 4); });
  ctx.textAlign = "center"; ctx.fillText("Consumo medio mensile (pezzi)", L + (W - L - R) / 2, H - 6);
  ctx.save(); ctx.translate(12, T + (H - T - B) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("Mesi di copertura", 0, 0); ctx.restore();
  const plotted = pts.map(p => ({ x: lx(p[0]), y: ly(p[1]), p }));
  ctx.globalAlpha = 0.55;
  for (const s of ["ok", "fermo", "eccesso", "sotto"]) { ctx.fillStyle = colors[s]; for (const q of plotted) if (q.p[2] === s) { ctx.beginPath(); ctx.arc(q.x, q.y, 2.6, 0, 6.283); ctx.fill(); } }
  ctx.globalAlpha = 1;
  cv.addEventListener("pointermove", ev => {
    const r = cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
    let best = null, bd = 100; for (const q of plotted) { const d = (q.x - mx) ** 2 + (q.y - my) ** 2; if (d < bd) { bd = d; best = q; } }
    if (!best) { tip.hidden = true; return; }
    tip.hidden = false; tip.textContent = `${best.p[3]} · ${fmtN(best.p[0], 2)} pz/mese · ${fmtN(best.p[1], 1)} mesi · ${STATI[best.p[2]]}`;
    tip.style.left = best.x + "px"; tip.style.top = best.y + "px";
  });
  cv.addEventListener("pointerleave", () => { tip.hidden = true; });
}

/* ============ Indicatori ============ */
async function viewKpi(main) {
  if (needDealer(main)) return;
  const snaps = state.snapshots.length ? state.snapshots : await loadSnapshots();
  if (!snaps.length) return noWeeks(main);
  if (!snaps.some(s => s.id === state.kpiSnap)) state.kpiSnap = snaps[snaps.length - 1].id;
  main.innerHTML = `<div class="panel"><p class="muted">Calcolo degli indicatori…</p></div>`;
  const [K, T] = await Promise.all([api("GET", `/api/snapshots/${state.kpiSnap}/kpi`), api("GET", `/api/dealers/${state.dealerId}/kpitrend`)]);
  const pc = v => v == null ? "–" : fmtN(v * 100, 1) + "%";
  const st = s => K.by_status.find(x => x.status === s);
  main.innerHTML = `<div class="head"><div><h1>Indicatori</h1><p class="sub">${esc(dealerName(state.dealerId))} · dati del ${esc(snapLabel(K.week, K.at))}<br>${esc(stockNote(K))}</p></div>${weekSelect("kw", snaps, state.kpiSnap)}</div>
  <section class="tiles">
    <div class="tile"><span class="k">Livello di servizio stimato</span><span class="v">${pc(K.service)}</span><span class="s">codici con SMin disponibili a scaffale · ${fmtN(K.n_zero)} a zero su ${fmtN(K.n_dem)}</span></div>
    <div class="tile neutral"><span class="k">Copertura media</span><span class="v">${K.coverage_months == null ? "–" : fmtN(K.coverage_months, 1) + " mesi"}</span><span class="s">valore a magazzino ÷ consumo mensile (${fmtE(K.cons_year / 12)})</span></div>
    <div class="tile warn"><span class="k">Valore immobilizzato</span><span class="v">${pc(K.idle_share)}</span><span class="s">eccedenze e fermo sul valore a magazzino</span></div>
    <div class="tile neutral"><span class="k">Codici in classe A</span><span class="v">${fmtN(K.abc.A.n)}</span><span class="s">fanno l'80% del consumo · ${fmtN(K.abc.A.sotto)} sotto scorta</span></div>
  </section>
  ${T.length > 1 ? `<section class="charts"><div class="chart" id="t1"></div><div class="chart" id="t2"></div></section>` : ""}
  <section class="grid2">
    <div class="panel"><h2>Dove sta il valore del magazzino</h2><div id="b1"></div><p class="small muted">Per i codici in eccesso è indicata la parte sopra SMax.</p></div>
    <div class="panel"><h2>Copertura dei codici a scaffale</h2><div id="b3"></div><p class="small muted">Valore della giacenza per mesi di copertura: giacenza ÷ consumo medio mensile.</p></div>
  </section>
  <section class="grid2">
    <div class="chart" id="pareto"></div>
    <div class="panel"><h2>Classi ABC sul consumo annuo</h2><div class="tablebox"><table><thead><tr><th>Classe</th><th class="num">Codici</th><th class="num">Quota consumo</th><th class="num">Valore a magazzino</th><th class="num">Sotto scorta</th></tr></thead><tbody>
      ${["A", "B", "C"].map(c => { const g = K.abc[c]; return `<tr><td><b>${c}</b> <span class="muted small">${c === "A" ? "primo 80%" : c === "B" ? "successivo 15%" : "ultimo 5%"}</span></td><td class="num">${fmtN(g.n)}</td><td class="num">${pc(K.cons_year ? g.cv / K.cons_year : 0)}</td><td class="num">${fmtE(g.val)}</td><td class="num">${fmtN(g.sotto)}</td></tr>`; }).join("")}
      <tr><td><b>Senza consumo</b></td><td class="num">${fmtN(K.abc_none.n)}</td><td class="num">–</td><td class="num">${fmtE(K.abc_none.val)}</td><td class="num">–</td></tr></tbody></table></div>
      <p class="small muted">Consumo annuo = consumo medio mensile × 12 × costo. I codici A meritano la massima attenzione sulle rotture di stock; quelli senza consumo con giacenza sono candidati al reso o alla svendita.</p></div>
  </section>
  <section class="grid2">
    <div class="panel"><h2>Codici per rotazione</h2><div id="b2"></div><p class="small muted">Rotazione annua stimata: consumo medio mensile × 12.</p></div>
    <div class="panel"><h2>Valore per rotazione</h2><div id="b2v"></div></div>
  </section>
  <div class="chart" id="sc"></div>
  <section class="grid2">
    <div class="panel"><h2>I 20 codici più movimentati</h2><div class="tablebox"><table><thead><tr><th>Codice</th><th>Descrizione</th><th class="num">Consumo/mese</th><th class="num">Giacenza</th><th class="num">Copertura</th><th>Stato</th></tr></thead><tbody>
      ${K.top.map(t => `<tr><td class="code"><button type="button" data-c="${esc(t.code)}">${esc(t.code)}</button></td><td class="desc">${esc(t.descr)}</td><td class="num">${fmtN(t.cons_mese, 2)}</td><td class="num">${fmtN(t.giac)}</td><td class="num">${fmtN(t.months, 1)} mesi</td><td><span class="pill ${t.status}">${STATI[t.status]}</span></td></tr>`).join("")}</tbody></table></div></div>
    <div class="panel"><h2>Tipologie con più valore a magazzino</h2><div id="b4"></div></div>
  </section>
  <p class="small muted">Il consumo medio della lista movimentazione è trattato come pezzi al mese: la rotazione annua è il consumo medio × 12 e la copertura è la giacenza ÷ consumo medio. L'indice di regolarità delle vendite (da 0 a 11,99) non entra in questi indicatori: pesa negli scenari d'ordine a importo. Se nel tuo sistema il consumo medio ha un'altra unità, rotazione e copertura vanno ricalibrate.</p>`;
  $("#kw").onchange = e => { state.kpiSnap = +e.target.value; viewKpi(main); };
  const cs = getComputedStyle(document.documentElement), col = v => cs.getPropertyValue(v).trim();
  if (T.length > 1) {
    lineChart($("#t1"), T.map(t => ({ y: (t.service || 0) * 100, label: dShort(t.week_date), full: snapLabel(t.week_date, t.uploaded_at) })), { title: "Livello di servizio stimato", color: col("--good"), fmt: v => fmtN(v, 1) + "%", axis: v => fmtN(v) + "%" });
    lineChart($("#t2"), T.map(t => ({ y: t.coverage_months || 0, label: dShort(t.week_date), full: snapLabel(t.week_date, t.uploaded_at) })), { title: "Copertura media in mesi", color: col("--accent"), fmt: v => fmtN(v, 1) + " mesi", axis: v => fmtN(v, 1) });
  }
  bars($("#b1"), [
    { label: "In linea", value: st("ok").val, color: col("--good") },
    { label: "Sotto scorta", value: st("sotto").val, color: col("--bad"), sub: `${fmtN(st("sotto").n)} codici` },
    { label: "Eccesso", value: st("eccesso").val, color: col("--warn"), sub: `di cui sopra SMax ${fmtE(st("eccesso").action)}` },
    { label: "Fermo", value: st("fermo").val, color: col("--idle"), sub: `${fmtN(st("fermo").n)} codici` }
  ], { fmt: fmtE });
  bars($("#b3"), K.coverage.map(c => ({ label: c.label, value: c.val, sub: `${fmtN(c.n)} codici`, color: c.label === "Nessuna domanda" ? col("--idle") : c.label === "Oltre 12 mesi" ? col("--warn") : col("--chart") })), { fmt: fmtE });
  bars($("#b2"), K.rotation.map(r => ({ label: r.label, value: r.n })), { fmt: v => fmtN(v) });
  bars($("#b2v"), K.rotation.map(r => ({ label: r.label, value: r.val })), { fmt: fmtE });
  bars($("#b4"), K.types.map(t => ({ label: t.label, value: t.val, sub: t.idle ? `immobilizzati ${fmtE(t.idle)}` : "" })), { fmt: fmtE });
  lineChart($("#pareto"), K.curve.map(p => ({ y: p.y * 100, label: fmtN(p.x * 100) + "%", full: `${fmtN(p.x * 100, 1)}% dei codici` })), { title: "Curva di Pareto del consumo", color: col("--accent"), fmt: v => fmtN(v, 1) + "% del consumo", axis: v => fmtN(v) + "%" });
  scatter($("#sc"), K.scatter);
  $$("[data-c]", main).forEach(b => b.onclick = () => { state.codice = b.dataset.c; location.hash = "#codice"; });
}

/* ============ Scheda codice ============ */
async function viewCodice(main) {
  if (needDealer(main)) return;
  main.innerHTML = `<div class="head"><div><h1>Scheda codice</h1><p class="sub">Situazione di un codice in ${esc(dealerName(state.dealerId))}: quanti pezzi programmare per 15, 30, 45, 60, 75 o 90 giorni e come è cambiato, caricamento dopo caricamento.</p></div></div>
  <form class="panel" id="cf"><div class="row"><label class="field" for="cq">Codice particolare<input type="text" id="cq" value="${esc(state.codice)}" autocapitalize="characters" placeholder="Es. 12385671"></label><button class="btn primary" type="submit">Mostra</button></div></form>
  <div id="cres"></div>`;
  $("#cf").onsubmit = e => { e.preventDefault(); state.codice = $("#cq").value.trim().toUpperCase(); showCode(); };
  if (state.codice) await showCode(); else $("#cq").focus();
}
/* Quanti pezzi programmare per un codice: consumo del periodo scelto, con le regole dell'utente (correzione del consumo e arrotondamento).
   Un mese vale 30 giorni. Si mostra sia il risultato entro SMin e SMax sia quello del solo consumo. */
const GIORNI = [15, 30, 45, 60, 75, 90];
const ROUNDF = { nearest: x => Math.round(x), up: x => Math.ceil(x - 1e-9), down: x => Math.floor(x + 1e-9) };
function renderProgram(host, d, last) {
  if (last.snap_id !== d.latest) { host.innerHTML = `<h2>Quanti pezzi programmare</h2><p class="muted">Il codice non compare nell'ultimo caricamento: carica dati aggiornati per programmarlo.</p>`; return; }
  const r = rules(), days = state.progDays || 30, n2 = v => fmtN(v, 2);
  const cons = +last.cons_mese || 0, ce = cons * (1 + r.consAdj / 100), disp = (+last.giac || 0) + (+last.ord || 0);
  const raw = ce * days / 30, rounded = ROUNDF[r.round](raw);
  const smin = +last.smin || 0, smax = Math.max(+last.smax || 0, smin), stock = smin > 0 || smax > 0;
  const tStock = stock ? Math.min(Math.max(rounded, smin), smax) : rounded;
  const qStock = Math.max(0, Math.ceil(tStock - disp - 1e-9)), qFree = Math.max(0, Math.ceil(rounded - disp - 1e-9));
  const cov = q => (ce > 0 ? covTxt((disp + q) / ce) + " mesi" : "–");
  const li = [`Consumo medio: <b>${n2(cons)}</b> pezzi al mese${r.consAdj ? `, corretto del ${pctTxt(r.consAdj)}: <b>${n2(ce)}</b>` : ""}.`,
    `Consumo in ${days} giorni: ${n2(ce)} × ${days} ÷ 30 = ${n2(raw)} pezzi, arrotondati ${ROUND_L[r.round]}: <b>${fmtN(rounded)}</b>.`,
    `Disponibile: ${fmtN(disp)} (giacenza ${fmtN(last.giac)} + ordini aperti ${fmtN(last.ord)}).`];
  if (stock) {
    if (smin > rounded) li.push(`La SMin è ${fmtN(smin)}: l'obiettivo sale a <b>${fmtN(tStock)}</b>.`);
    else if (rounded > smax) li.push(`La SMax è ${fmtN(smax)}: l'obiettivo scende a <b>${fmtN(tStock)}</b>.`);
    li.push(`Obiettivo ${fmtN(tStock)} − disponibile ${fmtN(disp)} = <b>${pezzi(qStock)}</b>.`);
  } else li.push("Il codice non è tenuto a scorta (SMin e SMax a zero): conta solo il consumo.");
  host.innerHTML = `<h2>Quanti pezzi programmare</h2>
    <p class="small muted">Per coprire il consumo del periodo scelto, con le tue regole di riordino (correzione del consumo e arrotondamento). Un mese vale 30 giorni.</p>
    <div class="chips seg" role="group" aria-label="Periodo da coprire">${GIORNI.map(g => `<button type="button" class="chip" data-gg="${g}" aria-pressed="${g === days}">${g} giorni</button>`).join("")}</div>
    <section class="tiles">
      ${stock ? `<div class="tile neutral"><span class="k">Da programmare entro SMin e SMax</span><span class="v">${pezzi(qStock)}</span><span class="s">${qStock ? `${fmtE2(qStock * last.cost)} · ` : ""}copertura dopo ${cov(qStock)}</span></div>` : ""}
      <div class="tile neutral"><span class="k">${stock ? "Solo per il consumo, senza SMin e SMax" : "Da programmare per il consumo"}</span><span class="v">${pezzi(qFree)}</span><span class="s">${qFree ? `${fmtE2(qFree * last.cost)} · ` : ""}copertura dopo ${cov(qFree)}</span></div>
    </section>
    <div class="whybox"><b>Come è calcolato</b><ol>${li.map(x => `<li>${x}</li>`).join("")}</ol></div>
    ${cons > 0 ? "" : `<p class="small muted">Nessun consumo registrato: per il consumo non serve programmare pezzi${stock ? "; resta solo l'eventuale reintegro della SMin" : ""}.</p>`}`;
  $$("[data-gg]", host).forEach(b => b.onclick = () => { state.progDays = +b.dataset.gg; renderProgram(host, d, last); });
}
async function showCode() {
  const out = $("#cres"); out.innerHTML = `<p class="muted">Caricamento…</p>`;
  const d = await api("GET", `/api/history?dealer=${state.dealerId}&code=${encodeURIComponent(state.codice)}`);
  if (!d.rows.length) {
    out.innerHTML = `<div class="panel"><p>Il codice <b class="mono">${esc(d.code)}</b> non compare nei dati caricati.</p>${d.suggest.length ? `<p class="small muted">Codici che iniziano così:</p><div class="chips">${d.suggest.map(s => `<button class="chip mono" type="button" data-s="${esc(s)}">${esc(s)}</button>`).join("")}</div>` : ""}</div>`;
    $$("[data-s]", out).forEach(b => b.onclick = () => { state.codice = b.dataset.s; $("#cq").value = state.codice; showCode(); });
    return;
  }
  const last = d.rows[d.rows.length - 1];
  out.innerHTML = `<div class="panel flagpanel"><div class="row">${d.flag
      ? `<p><span class="pill off">Su richiesta</span> Escluso dagli scenari d'ordine${d.flag.note ? ` · ${esc(d.flag.note)}` : ""} · segnato da ${esc(d.flag.full_name || d.flag.username || "–")} il ${esc(dIt(String(d.flag.set_at).slice(0, 10)))}</p><button class="btn sm" type="button" id="cflag">Rimetti a scorta</button>`
      : `<p class="muted">Codice gestito a scorta. Se è un ricambio che ordini solo su richiesta del cliente, escludilo dagli scenari d'ordine.</p><button class="btn sm" type="button" id="cflag">Segna come su richiesta</button>`}</div></div>
  <section class="tiles">
    <div class="tile"><span class="k">${esc(last.descr || "Codice")}</span><span class="v mono">${esc(d.code)}</span><span class="s">Locazione ${esc(last.loc || "–")} · costo ${fmtE2(last.cost)}</span></div>
    <div class="tile ${last.status === "sotto" ? "bad" : last.status === "eccesso" ? "warn" : last.status === "fermo" ? "idle" : "neutral"}"><span class="k">Stato attuale</span><span class="v">${STATI[last.status]}</span><span class="s">${last.status === "ok" ? "" : `da ${fmtN(last.streak)} ${last.streak === 1 ? "caricamento" : "caricamenti"} · `}dati del ${esc(snapLabel(last.week_date, last.uploaded_at))}</span></div>
    <div class="tile neutral"><span class="k">Giacenza / SMin / SMax</span><span class="v">${fmtN(last.giac)} <span class="small muted">/ ${fmtN(last.smin)} / ${fmtN(last.smax)}</span></span><span class="s">${fmtN(last.ord)} in ordine${last.giac_lista != null && last.stock_src !== "lista" ? ` · nelle liste: ${fmtN(last.giac_lista)}` : ""}<br>${esc(stockShort(last))}</span></div>
  </section>
  <section class="panel" id="cprog"></section>
  <div class="chart" id="cc"></div>
  <section class="panel"><h2>Caricamento per caricamento</h2><div class="tablebox"><table><thead><tr><th>Dati del</th><th>Stato</th><th class="num">Giacenza</th><th class="num">Nelle liste</th><th class="num">Ord. aperti</th><th class="num">SMin</th><th class="num">SMax</th><th class="num">Da ordinare / Eccedenza</th><th class="num">Valore giacenza</th></tr></thead><tbody>
  ${d.rows.slice().reverse().map(r => `<tr><td>${esc(snapLabel(r.week_date, r.uploaded_at))}</td><td><span class="pill ${r.status}">${STATI[r.status]}</span>${!r.in_b ? ` <span class="pill nogiac">n.g.</span>` : ""}</td><td class="num">${fmtN(r.giac)}</td><td class="num">${r.giac_lista == null ? "–" : fmtN(r.giac_lista)}</td><td class="num">${fmtN(r.ord)}</td><td class="num">${fmtN(r.smin)}</td><td class="num">${fmtN(r.smax)}</td><td class="num">${r.delta > 0 ? "+" : ""}${r.delta ? fmtN(r.delta) : "–"}</td><td class="num">${fmtE2(r.val_giac)}</td></tr>`).join("")}
  </tbody></table></div>${d.rows.length < d.weeks.length ? `<p class="small muted">Il codice compare in ${fmtN(d.rows.length)} caricamenti su ${fmtN(d.weeks.length)}.</p>` : ""}</section>`;
  $("#cflag").onclick = async () => {
    try {
      if (d.flag) await api("DELETE", `/api/dealers/${state.dealerId}/flags/${encodeURIComponent(d.code)}`);
      else await api("POST", `/api/dealers/${state.dealerId}/flags`, { codes: [d.code], note: "Segnato dalla scheda codice" });
      toast(d.flag ? "Codice rimesso a scorta." : "Codice segnato come su richiesta."); showCode();
    } catch (x) { if (!x.silent) toast(x.message); }
  };
  renderProgram($("#cprog"), d, last);
  const cs = getComputedStyle(document.documentElement);
  lineChart($("#cc"), d.rows.map(r => ({ y: r.giac, label: dShort(r.week_date), full: snapLabel(r.week_date, r.uploaded_at) })),
    { title: `Giacenza per caricamento (SMin ${fmtN(last.smin)} · SMax ${fmtN(last.smax)} nell'ultimo)`, color: cs.getPropertyValue("--accent").trim(), fmt: v => fmtN(v) + " pz", axis: v => fmtN(v) });
}

/* ============ Regole di approvvigionamento (pagina di sola lettura) ============ */
async function viewRegole(main) {
  const r = rules(), modes = Object.keys(SCENARI);
  // Gli esempi usano sempre gli stessi quattro codici; i numeri degli scenari sono quelli che dà il motore di calcolo.
  const ex = t => `<div class="ex"><b>Esempio</b> ${t}</div>`;
  main.innerHTML = `<div class="head"><div><h1>Regole di approvvigionamento</h1><p class="sub">Come la piattaforma classifica i codici e calcola le quantità da ordinare nei tre scenari. Ogni regola ha un esempio.</p></div></div>
  <section class="panel"><h3>I codici degli esempi</h3><p class="small muted">Quattro codici inventati, usati in tutti gli esempi della pagina.</p>
    <div class="tablebox"><table><thead><tr><th>Codice</th><th class="num">Costo</th><th class="num">Consumo medio (pz/mese)</th><th class="num">Regolarità</th><th class="num">SMin</th><th class="num">SMax</th><th class="num">Giacenza</th><th class="num">Ordini aperti</th></tr></thead><tbody>
      <tr><td>Filtro olio</td><td class="num">10 €</td><td class="num">8</td><td class="num">9</td><td class="num">8</td><td class="num">30</td><td class="num">3</td><td class="num">2</td></tr>
      <tr><td>Candela</td><td class="num">12 €</td><td class="num">10</td><td class="num">6</td><td class="num">10</td><td class="num">40</td><td class="num">12</td><td class="num">0</td></tr>
      <tr><td>Pastiglie freno</td><td class="num">40 €</td><td class="num">3</td><td class="num">8</td><td class="num">3</td><td class="num">10</td><td class="num">0</td><td class="num">0</td></tr>
      <tr><td>Batteria</td><td class="num">90 €</td><td class="num">1</td><td class="num">3</td><td class="num">1</td><td class="num">3</td><td class="num">0</td><td class="num">0</td></tr>
    </tbody></table></div></section>
  <section class="panel rules"><h3>Le basi</h3><ul>
    <li><b>Disponibile</b> = giacenza + ordini aperti.${ex("Filtro olio: 3 in giacenza + 2 ordinati = 5 disponibili.")}</li>
    <li><b>Vendita regolare</b> = consumo medio mensile × indice di regolarità delle vendite ÷ 12: sono i pezzi al mese su cui si può contare. L'indice va da 0 a 11,99; un valore più alto nel file conta come 11,99. Se nei dati manca l'indice, conta solo il consumo medio.${ex("Filtro olio: 8 × 9 ÷ 12 = 6 pezzi al mese. Candela: 10 × 6 ÷ 12 = 5. Pastiglie: 3 × 8 ÷ 12 = 2. Batteria: 1 × 3 ÷ 12 = 0,25. Un codice con regolarità 13,5 nel file viene letto come 11,99.")}</li>
    <li><b>Sempre esclusi</b> dagli scenari: i codici non tenuti a scorta (SMin e SMax a zero), i fermi, quelli senza storico e quelli segnati come «su richiesta».${ex("un codice con SMin 0 e SMax 0 che vende 0,4 pezzi al mese non entra mai in un ordine, nemmeno con un importo alto.")}</li></ul></section>
  <section class="panel rules"><h3>Quali giacenze si usano</h3><ul>
    <li><b>Solo le liste movimentazione</b>: se riportano la giacenza di ogni codice, alla fine del mese precedente, i calcoli partono da quella. Il file giacenze non serve.${ex("la lista di fine ottobre riporta 3 filtri olio: la piattaforma parte da 3.")}</li>
    <li><b>Liste e file giacenze</b>: il file giacenze è la fotografia di oggi e sostituisce le giacenze delle liste. Costi, SMin, SMax, consumo, regolarità e ordini aperti restano quelli delle liste.${ex("la lista di fine ottobre riporta 3 filtri olio, il file giacenze del 15 novembre ne riporta 1. La piattaforma parte da 1: disponibile = 1 + 2 ordinati = 3.")}</li>
    <li><b>Codici con giacenza nelle liste ma assenti dal file giacenze</b>: contano come esauriti, cioè a giacenza zero. Se il file giacenze è parziale si può tenere per loro la giacenza delle liste; quando i codici assenti sono più di un quarto di quelli con giacenza, la piattaforma chiede di scegliere prima di salvare.${ex("12 candele nella lista, nessuna riga nel file giacenze: valgono 0, oppure 12 se scegli di tenere la giacenza delle liste.")}</li>
    <li><b>Liste senza giacenze</b> (colonna assente o vuota): il file giacenze è obbligatorio, altrimenti ogni codice risulterebbe a zero.</li>
    <li><b>Ordini aperti</b>: sono sempre quelli delle liste. Se un ordine è arrivato dopo la data delle liste, i suoi pezzi sono già nella giacenza del file e contano ancora come ordine aperto: per quel codice la proposta può essere più bassa del necessario.${ex("lista: 3 filtri olio e 2 ordinati. I 2 sono arrivati e il file giacenze ne riporta 5: il disponibile calcolato è 5 + 2 = 7, quello vero è 5.")}</li>
    <li>In ogni pagina, nell'Excel e nel PDF è scritto quali giacenze sono state usate.</li></ul></section>
  <section class="panel rules"><h3>Come viene classificato ogni codice</h3><ul>
    <li><b>Sotto scorta</b>: disponibile sotto la SMin.${ex("Filtro olio: 5 disponibili, SMin 8.")}</li>
    <li><b>A zero</b>: disponibile a zero con SMin sopra zero; nella tabella della proposta compaiono in cima.${ex("Pastiglie e batteria: 0 disponibili, SMin 3 e 1.")}</li>
    <li><b>Eccesso</b>: giacenza sopra la SMax; l'eccedenza è valorizzata al costo.${ex("se le candele in giacenza fossero 45 con SMax 40, l'eccedenza sarebbe 5 pezzi × 12 € = 60 €.")}</li>
    <li><b>Fermo</b>: giacenza con SMin e SMax a zero.${ex("2 pezzi a magazzino di un codice con SMin 0 e SMax 0.")}</li>
    <li><b>In linea</b>: tra SMin e SMax.${ex("Candela: 12 disponibili, SMin 10, SMax 40.")}</li>
    <li><b>Non in giacenza</b>: codice delle liste assente nel file giacenze. <b>Senza storico</b>: codice a magazzino che non compare nelle liste.${ex("un codice presente solo nel file giacenze, con 3 pezzi, è «senza storico»: senza prezzo né scorte non entra negli ordini.")}</li></ul></section>
  <section class="panel rules"><h3>A. ${esc(SCENARI.cover.t)} (1, 2 o 3 mesi)</h3><ul>
    <li>Obiettivo di ogni codice = consumo medio mensile × mesi, mai sotto la SMin e mai sopra la SMax.</li>
    <li>Si ordina obiettivo − disponibile. Non c'è un importo: la spesa è il risultato.</li></ul>
    ${ex(`<b>1 mese</b>: filtro olio 8 × 1 = 8 − 5 disponibili = <b>3</b>; pastiglie 3 − 0 = <b>3</b>; batteria 1 − 0 = <b>1</b>; candela niente (obiettivo 10, ne ha 12). Spesa 240 €.<br>
      <b>3 mesi</b>: filtro 24 − 5 = <b>19</b>; candela 30 − 12 = <b>18</b>; pastiglie <b>9</b>; batteria <b>3</b>. Spesa 1.036 €.<br>
      <b>Tetto SMax</b>: se le pastiglie vendessero 4 pezzi al mese, per 3 mesi ne servirebbero 12, ma la SMax è 10: se ne ordinano 10.`)}</section>
  <section class="panel rules"><h3>B. ${esc(SCENARI.amount.t)} (entro SMin e SMax)</h3><ol>
    <li><b>SMin</b>: prima si riportano alla SMin i codici che sono sotto. Se l'importo non basta, passano prima quelli con la regolarità più alta e, a parità, con il consumo più alto.${ex("con 150 €: filtro olio (regolarità 9) 3 pezzi = 30 €, poi pastiglie (regolarità 8) 3 pezzi = 120 €. L'importo è finito: la batteria (regolarità 3) resta a zero.")}</li>
    <li><b>Proporzione</b>: il resto compra a tutti lo stesso numero di mesi di vendita regolare. Chi vende di più e con più continuità riceve più pezzi.${ex("con 1.000 €: 240 € riportano tutti alla SMin; i 760 € restanti comprano circa 4 mesi di vendita regolare. Candela 4 × 5 = 20 pezzi, filtro 4 × 6 = 24, pastiglie 4 × 2 = 8, batteria 4 × 0,25 = 1.")}</li>
    <li><b>SMax</b>: chi arriva alla SMax si ferma e l'importo prosegue sugli altri. Se tutti arrivano alla SMax, il resto non si spende e la piattaforma dice quanto.${ex("con 1.000 € il filtro si ferma a 22 pezzi (arriva a 30, la sua SMax) invece di 24, le pastiglie a 7 (arrivano a 10) invece di 8. Con 1.500 € tutti arrivano alla SMax spendendo 1.256 €: i 244 € restanti non vengono spesi.")}</li></ol></section>
  <section class="panel rules"><h3>C. ${esc(SCENARI.free.t)} (anche oltre la SMax)</h3><ul>
    <li>Come B; quello che B lascerebbe non speso va oltre la SMax con la stessa proporzione: ogni codice riceve gli stessi mesi in più di vendita regolare.${ex("con 2.146 €: 1.256 € portano tutti alla SMax, come in B; gli 890 € restanti comprano 4 mesi di vendita regolare oltre la SMax. Filtro olio +24 (4 × 6), candela +20 (4 × 5), pastiglie +8 (4 × 2), batteria +1 (4 × 0,25).")}</li>
    <li>La SMax viene superata solo dopo che tutti i codici ci sono arrivati.${ex("con 1.000 € in importo libero il risultato è uguale a B: non tutti sono arrivati alla SMax, quindi nessuno la supera.")}</li>
    <li>Limite facoltativo: da 1 a 6 mesi di consumo medio sopra la SMax per codice. Con il limite, quello che non trova posto resta non speso.${ex("con 3.000 € e limite 1 mese: filtro al massimo 30 + 8 = 38, candela 40 + 10 = 50, pastiglie 10 + 3 = 13, batteria 3 + 1 = 4. Si spendono 1.666 €; 1.334 € restano non spesi.")}</li></ul></section>
  <section class="panel rules"><h3>Pezzi interi</h3><ul>
    <li>I pezzi si assegnano uno alla volta al codice più vicino al suo pezzo successivo. Se l'avanzo non basta per un pezzo di un codice si passa agli altri: per questo negli scenari a importo possono restare pochi euro.${ex("con 1.000 €, arrivati a quasi 4 mesi restano 32 €. Toccherebbe alla batteria (1 pezzo a 4 mesi), ma costa 90 €: si passa oltre, e le candele ricevono il 20° e il 21° pezzo (24 €). Avanzano 8 €; spesa 992 €.")}</li></ul></section>
  <section class="panel rules"><h3>Regole che ogni utente può cambiare</h3><ul>
    <li><b>Peso della regolarità</b>, da 0% a 100%, negli scenari a importo: quanto conta la regolarità nel dividere l'importo. A 100% la vendita regolare è consumo × regolarità ÷ 12; a 0% conta solo il consumo; in mezzo la regolarità pesa meno.${ex("con 1.000 € e peso 100% le candele ricevono 21 pezzi e la batteria 1; con peso 0% i codici poco regolari guadagnano spazio: candele 19, batteria 3 (arriva alla SMax), filtro olio 18 invece di 25.")}</li>
    <li><b>Copertura massima</b>, da 2 a 12 mesi o nessuna, in tutti gli scenari: dopo l'ordine nessun codice supera quella copertura, nemmeno sotto la SMax; la SMin resta sempre garantita.${ex("periodo di 3 mesi con copertura massima 2 mesi: filtro olio 16 pezzi (2 × 8) invece di 24, candela 20 invece di 30. In uno scenario a importo, quello che non trova posto resta non speso: con 1.500 € si spendono 626 €.")}</li>
    <li><b>Correzione del consumo medio</b>, da −50% a +50%, per stagionalità o andamento.${ex("con −20% il filtro olio conta 8 × 0,8 = 6,4 pezzi al mese invece di 8.")}</li>
    <li><b>Arrotondamento</b> nello scenario a periodo: al pezzo più vicino, per eccesso o per difetto.${ex("6,4 pezzi diventano 6 (più vicino), 7 (per eccesso) o 6 (per difetto). La SMin resta il pavimento: il filtro arriva comunque a 8.")}</li>
    <li><b>Righe sotto un valore</b> nello scenario a periodo: le righe che valgono meno vengono tolte.${ex("2 mesi con soglia 100 €: la riga delle candele (8 pezzi × 12 € = 96 €) esce dalla proposta.")}</li>
    <li><b>Esclusioni</b>: codici su richiesta e soglia minima di consumo medio.${ex("con soglia 0,5 pezzi al mese, un codice che ne vende 0,3 non viene proposto.")}</li>
    <li><b>Avviso</b> sulle righe che dopo l'ordine superano un certo numero di mesi di copertura (di base 3).${ex("con 1.000 € il filtro olio arriva a 30 pezzi = 3,75 mesi di consumo, le pastiglie a 3,3 mesi e le candele a 3,3: le tre righe hanno l'avviso «oltre 3 mesi». La batteria, a 1 mese, no.")}</li>
    <li>Si cambiano con l'<b>equalizzatore</b> del pannello «Regole di riordino», sopra ogni proposta in «Nuovo ordine» e in «Scenari d'ordine»: un cursore per regola, il valore scelto sopra il cursore. Ogni spostamento ricalcola la proposta e resta salvato per il tuo utente.</li></ul></section>
  <section class="panel rules"><h3>Quanti pezzi programmare per un codice</h3><ul>
    <li>Nella «Scheda codice» scegli il periodo: 15, 30, 45, 60, 75 o 90 giorni (un mese vale 30 giorni). La piattaforma calcola consumo del periodo − disponibile, con la tua correzione del consumo e il tuo arrotondamento, e mostra due risultati: entro SMin e SMax, e solo per il consumo.${ex("filtro olio, 45 giorni: 8 × 45 ÷ 30 = 12 pezzi − 5 disponibili = 7 da programmare. A 90 giorni: 24 − 5 = 19. Con una SMax di 20, entro SMin e SMax sarebbero 15.")}</li></ul></section>
  <section class="panel"><h3>Le tue regole adesso</h3><ul class="small">${modes.map(m => `<li><b>${esc(SCENARI[m].t)}</b>: ${esc(rulesText(r, m))}</li>`).join("")}</ul></section>
  <section class="panel rules"><h3>Dopo il calcolo</h3><ul>
    <li>Ogni quantità della proposta si apre per vedere il conto passo passo. Ogni riga si accetta o si rifiuta; l'ordine confermato si scarica in Excel o PDF.${ex("nella proposta da 1.000 € tocca il 21 delle candele: vedi disponibile, vendita regolare, mesi comprati e il pezzo in più arrivato con l'avanzo.")}</li></ul></section>`;
}

/* ============ Caricamento dei dati ============ */
const FIELDS_A = [
  // «Particolare» da solo è il codice; «Particolare Desc», «Particolare Sostituente», «Particolare Codice Merceologico» no
  { key: "code", label: "Codice", req: true, syn: ["codice particolare", "particolare", "codice", "cod particolare", "part number", "partnumber", "articolo", "stampanr.rc", "stampanr"],
    neg: ["desc", "famigl", "sostitu", "merceolog", "categ", "gruppo"] },
  { key: "desc", label: "Descrizione", syn: ["descrizione", "particolare desc", "particolare descrizione", "descr", "desc"] },
  { key: "loc", label: "Locazione", syn: ["locaz", "locazione", "ubicazione"] },
  { key: "dg", label: "DG", syn: ["dg"] },
  { key: "cost", label: "Prezzo netto (costo)", syn: ["sco stk eur", "prz sco stk", "sco stk", "costo", "prezzo netto", "costo medio"] },
  { key: "listino", label: "Prezzo di listino", syn: ["prezzo listino eur", "prezzo listino", "listino"] },
  { key: "ord", label: "Ordini aperti", syn: ["ord. aperti", "ordini aperti", "ord aperti", "in ordine"] },
  // giacenza riportata dalla lista (alla fine del mese precedente): facoltativa; se c'è, il file giacenze non è indispensabile
  { key: "giac", label: "Giacenza riportata nella lista", syn: ["giac cross aggiornate al", "giac cross", "giacenze cross", "giacenza cross", "giacenza", "giacenze", "giac", "g.dispo.", "g.dispo", "esistenza", "stock"],
    neg: ["min", "max", "mass", "valore", "importo", "prezzo", "costo", "ordin", "impegn", "media", "sicur", "riord"] },
  { key: "smin", label: "Scorta minima", req: true, syn: ["smin", "scorta min", "scorta minima"] },
  { key: "smax", label: "Scorta massima", req: true, syn: ["smax", "scorta max", "scorta massima"] },
  { key: "regolarita", label: "Regolarità vendite (indice)", syn: ["regolarità vendite", "regolarita vendite", "indice di regolarità", "regolarità", "regolarita"], hs: ["1sqy7ce"] },
  { key: "cons_mese", label: "Consumo medio mensile", syn: ["consumo medio mensile", "consumo medio", "consumo mensile", "consumo mese"], hs: ["1ji1e61"] },
  { key: "qtaven", label: "Venduto / ultima vendita", syn: ["qtaven/ultven", "qtaven", "qta ven", "ult vend", "ultven", "venduto"] },
  { key: "venspc", label: "Vendite speciali", syn: ["ven spc", "venspc", "vendite speciali"] },
  { key: "fab", label: "FAB", syn: ["fab"] }
];
// Per il file giacenze: «syn» sono i nomi con cui la colonna può presentarsi, «neg» le parole che la escludono (es. «giacenza minima» non è la giacenza).
const FIELDS_B = [
  { key: "code", label: "Codice", req: true,
    syn: ["stampanr.rc", "stampanr", "codice particolare", "codice articolo", "codice ricambio", "codice materiale", "codice prodotto", "codice", "cod. articolo", "cod. particolare", "numero particolare", "particolare", "part number", "partnumber", "part no", "articolo", "ricambio", "materiale", "referenza", "riferimento", "item", "sku", "cod", "art", "pn"],
    neg: ["descr", "fornit", "client", "ubic", "locaz", "magazz", "sostit", "gruppo", "famigl", "categ", "ean", "barcode", "iva", "sconto"] },
  { key: "giac", label: "Giacenza", req: true,
    syn: ["g.dispo.", "g.dispo", "giacenza disponibile", "giacenza attuale", "giacenza fisica", "giacenza reale", "giacenza", "giac", "qta giacenza", "qta disponibile", "quantità disponibile", "quantità in giacenza", "disponibile", "disponibilità", "dispo", "esistenza", "quantità", "qta", "q.tà", "qty", "stock", "on hand", "saldo", "rimanenza"],
    neg: ["min", "max", "mass", "prezzo", "costo", "listino", "valore", "importo", "ordin", "impegn", "prenot", "vendut", "vendit", "consum", "media", "sconto", "riord", "sicur", "transit", "arriv", "fabb", "lotto", "peso", "cod"] },
  { key: "desc", label: "Descrizione", syn: ["descrizione", "descr", "desc", "denominazione", "designazione", "testo breve"] }
];
const norm = s => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
const fp = s => { let x = 0x811c9dc5; for (const c of s) { x ^= c.charCodeAt(0); x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(36); };
function matchHeader(cell, f) {
  const h = norm(cell); if (!h) return 0; let best = 0;
  if (f.hs && f.hs.includes(fp(h))) return 3;
  for (const s of f.syn) { const n = norm(s); if (!n) continue;
    if (h === n) best = Math.max(best, 3); else if (h.startsWith(n) && n.length >= 4) best = Math.max(best, 2); else if (h.includes(n) && n.length >= 5) best = Math.max(best, 1); }
  return best;
}
const headScore = (cell, f) => { if (f.neg) { const h = norm(cell); if (h && f.neg.some(x => h.includes(x))) return 0; } return matchHeader(cell, f); };
function analyseSheet(rows, fields) {
  let best = { headerRow: 0, map: {}, score: -1 };
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const row = rows[r] || [], map = {}, used = new Set(); let score = 0;
    for (const f of fields) { let bc = -1, bs = 0; row.forEach((c, i) => { if (used.has(i)) return; const s = headScore(c, f); if (s > bs) { bs = s; bc = i; } }); if (bc >= 0) { map[f.key] = bc; used.add(bc); score += bs * (f.req ? 2 : 1); } }
    if (score > best.score) best = { headerRow: r, map, score };
  }
  return best;
}
const colL = i => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
/* ============ Riconoscimento delle colonne del file giacenze ============
 * Ogni utente può estrarre dal proprio gestionale un file diverso: cambiano i nomi, l'ordine e il numero delle colonne.
 * Del file giacenze servono solo il codice e la quantità (più la descrizione, se c'è): tutte le altre colonne vengono ignorate.
 * Le due colonne si riconoscono così, nell'ordine:
 *   1. tracciato già confermato: se un file con la stessa intestazione è già stato caricato per la concessionaria, vale la scelta fatta allora;
 *   2. liste movimentazione: il codice è la colonna i cui valori si ritrovano tra i codici delle liste scelte;
 *   3. nome della colonna;
 *   4. contenuto: codici alfanumerici senza ripetizioni, quantità intere non negative (non contatori, date, prezzi o codici numerici).
 * Il risultato è sempre mostrato con le prime righe lette; quando la scelta non è sicura la piattaforma chiede una conferma.
 */
const codeKey = v => String(v == null ? "" : v).trim().toUpperCase().replace(/\s+/g, "").slice(0, 40);   // la stessa forma usata dal server
const alnum = c => c.replace(/[^A-Z0-9]/g, "");
const UNITA = /(pz|pzi|nr|pc|pcs|stk|cad)\.?$/i;
// Numero scritto in una cella: virgola o punto decimale, separatori delle migliaia, segno anche in coda, unità di misura in coda.
function numVal(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (v == null || typeof v === "boolean") return NaN;
  let s = String(v).replace(/[\s ]/g, "").replace(UNITA, "");
  if (!s) return NaN;
  let neg = false;
  if (s[0] === "-") { neg = true; s = s.slice(1); } else if (s[0] === "+") s = s.slice(1); else if (s[s.length - 1] === "-") { neg = true; s = s.slice(0, -1); }
  if (!/^\d[\d.,]*$/.test(s)) return NaN;
  const dot = s.lastIndexOf("."), com = s.lastIndexOf(",");
  if (dot >= 0 && com >= 0) s = dot > com ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");   // con tutti e due i segni, l'ultimo è il decimale
  else if (com >= 0) s = s.indexOf(",") !== com ? s.replace(/,/g, "") : s.replace(",", ".");                 // più virgole: migliaia; una sola: decimale
  else if (dot >= 0 && s.indexOf(".") !== dot) s = s.replace(/\./g, "");                                     // più punti: migliaia
  const n = parseFloat(s);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}
// Quantità di una cella: il numero scritto; se c'è altro testo vale la parte numerica iniziale; cella vuota = zero; NaN se non è un numero.
const qtyOf = v => { const n = numVal(v); if (Number.isFinite(n)) return n; if (v == null || v === "") return 0; const p = parseFloat(String(v).replace(",", ".")); return Number.isFinite(p) ? p : NaN; };

// Codici delle liste movimentazione scelte in questa pagina: servono a trovare la colonna del codice nel file giacenze.
let wbSeq = 0;
const wbIds = new WeakMap(), wbId = wb => { if (!wbIds.has(wb)) wbIds.set(wb, ++wbSeq); return wbIds.get(wb); };
let KNOWN = { key: null, exact: new Set(), loose: new Map() };
function knownCodes() {
  const key = state.upload.A.map(s => [wbId(s.wb), s.sheet, s.headerRow, s.map.code].join(":")).join("|");
  if (key === KNOWN.key) return KNOWN;
  const exact = new Set(), loose = new Map();
  for (const s of state.upload.A) {
    if (s.map.code == null) continue;
    const rows = s.wb.sheets[s.sheet] || [];
    for (let i = s.headerRow + 1; i < rows.length; i++) { const c = codeKey((rows[i] || [])[s.map.code]); if (c) exact.add(c); }
  }
  for (const c of exact) { const k = alnum(c); if (k) loose.set(k, loose.has(k) && loose.get(k) !== c ? null : c); }
  return (KNOWN = { key, exact, loose });
}
// Il codice come è scritto nelle liste: uguale, oppure uguale a meno di punti, trattini e barre (solo se corrisponde a un codice solo).
const toKnown = (c, K) => (K.exact.has(c) ? c : K.loose.get(alnum(c)) || null);

// Che cosa contiene ogni colonna, sulle prime 400 righe con dati a partire da «from».
function colStats(rows, from, K) {
  const take = [];
  for (let i = Math.max(0, from); i < rows.length && take.length < 400; i++) { const r = rows[i]; if (r && r.some(v => v != null && v !== "")) take.push(r); }
  const nc = Math.min(80, take.reduce((m, r) => Math.max(m, r.length), 0)), S = [];
  for (let j = 0; j < nc; j++) {
    const st = { j, ne: 0, num: 0, int: 0, neg: 0, big: 0, nz: 0, seq: 0, known: 0, mix: 0, uniq: 0, nuniq: 0, med: 0 }, seen = new Set(), nums = [];
    let prev = null;
    for (const r of take) {
      const v = r[j]; if (v == null || v === "") { prev = null; continue; }
      st.ne++;
      const n = numVal(v);
      if (Number.isFinite(n)) { st.num++; nums.push(n); if (Number.isInteger(n)) st.int++; if (n < 0) st.neg++; if (n !== 0) st.nz++; if (Math.abs(n) >= 1e5) st.big++; if (prev != null && n - prev === 1) st.seq++; prev = n; } else prev = null;
      const c = codeKey(v);
      if (c) { seen.add(c); if (K.exact.size && toKnown(c, K)) st.known++; if (c.length >= 4 && /[A-Z]/.test(c) && /\d/.test(c)) st.mix++; }
    }
    st.uniq = seen.size; st.nuniq = new Set(nums).size; nums.sort((a, b) => a - b); st.med = nums.length ? nums[nums.length >> 1] : 0;
    S.push(st);
  }
  return { S, n: take.length };
}
const share = (a, b) => (b ? a / b : 0);
// Colonna della giacenza: prima per nome; poi per contenuto, cioè numeri interi non negativi che non siano un contatore, una data, un codice o un prezzo.
function pickQty(S, n, code, hdr, byName) {
  const fG = FIELDS_B[1];
  const c = S.filter(s => s.j !== code && s.ne >= Math.min(3, n)).map(s => {
    const h = norm(hdr[s.j]), bad = !!h && fG.neg.some(x => h.includes(x)), nm = h && !bad ? matchHeader(hdr[s.j], fG) : 0;
    return { j: s.j, nm, int: share(s.int, s.num), numShare: share(s.num, s.ne),
      sc: 100 * nm - (bad ? 100 : 0) + 20 * share(s.int, s.num) + 10 * (1 - share(s.neg, s.num)) + 5 * share(s.nz, s.num) + 5 * share(s.ne, n)
        - (share(s.seq, s.ne) >= 0.9 ? 30 : 0) - (share(s.big, s.num) >= 0.5 ? 30 : 0) - (s.med >= 1000 ? 30 : 0) - (s.num >= 10 && s.nuniq <= 1 ? 30 : 0) };   // una colonna con lo stesso numero su tutte le righe non è una giacenza
  }).filter(x => x.numShare >= (x.nm ? 0.5 : 0.9)).sort((x, y) => y.sc - x.sc || x.j - y.j);
  const top = c[0];
  if (top && top.nm > 0) return { j: top.j, how: "nome", unsure: c.some(x => x !== top && x.nm >= top.nm) };
  if (byName != null && byName !== code) return { j: byName, how: "nome", unsure: true };   // il nome c'è, ma la colonna contiene pochi numeri
  if (top && top.sc > 0) return { j: top.j, how: "contenuto", unsure: top.int < 0.9 || c.some(x => x !== top && x.sc > 0 && x.sc >= top.sc - 15) };
  return { j: null, how: null, unsure: false };
}
// Prima riga di dati di un file senza intestazione riconosciuta: la prima con un codice e una quantità numerica.
function dataStart(rows, code, giac, K) {
  if (code == null) return 0;
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const r = rows[i] || [], c = codeKey(r[code]); if (!c) continue;
    const q = giac == null ? null : r[giac], empty = q == null || q === "";
    if (!empty ? Number.isFinite(numVal(q)) : (K.exact.size ? !!toKnown(c, K) : /\d/.test(c) && c.length <= 25 && r.filter(v => v != null && v !== "").length >= 2)) return i;
  }
  return 0;
}
function detectB(rows, out, noNames) {
  const K = knownCodes(), named = !noNames && out.score > 0, nameScore = named ? out.score : 0;
  const { S, n } = colStats(rows, named ? out.headerRow + 1 : 0, K);
  if (!named) { out.map = {}; out.headerRow = -1; }
  out.named = named; out.how = {}; out.uncertain = false; out.score = nameScore;
  if (!n) return;
  let hdr = named ? rows[out.headerRow] || [] : [];
  // Codice: la colonna che si ritrova nelle liste movimentazione; altrimenti il nome; altrimenti la forma (codici alfanumerici senza ripetizioni).
  let code = out.map.code != null ? out.map.code : null, howC = code != null ? "nome" : null;
  const inLists = S.filter(s => s.known >= 3 && share(s.known, s.ne) >= 0.2).sort((x, y) => share(y.known, y.ne) - share(x.known, x.ne) || (y.j === code) - (x.j === code) || x.j - y.j)[0];
  if (inLists) {
    if (named && toKnown(codeKey(hdr[inLists.j]), K)) return detectB(rows, out, true);   // la riga presa per intestazione era una riga di dati
    code = inLists.j; howC = "liste";
  } else if (code == null) {
    const c = S.filter(s => s.ne >= 0.6 * n && share(s.uniq, s.ne) >= 0.9 && (share(s.mix, s.ne) >= 0.3 || (share(s.int, s.ne) >= 0.9 && s.med >= 10000 && share(s.seq, s.ne) < 0.5)))
      .sort((x, y) => (2 * share(y.mix, y.ne) + share(y.uniq, y.ne)) - (2 * share(x.mix, x.ne) + share(x.uniq, x.ne)) || x.j - y.j)[0];
    if (c) { code = c.j; howC = "contenuto"; out.uncertain = true; }
  }
  let q = pickQty(S, n, code, hdr, named ? out.map.giac : null), desc = named ? out.map.desc : null;
  if (!named) {
    let start = dataStart(rows, code, q.j, K);
    hdr = start > 0 ? rows[start - 1] || [] : [];
    q = pickQty(S, n, code, hdr, null);
    start = dataStart(rows, code, q.j, K);
    out.headerRow = start - 1;
    desc = hdr.findIndex(h => matchHeader(h, FIELDS_B[2]) > 0); if (desc < 0) desc = null;
  }
  if (q.unsure) out.uncertain = true;
  out.map = {};
  if (code != null) out.map.code = code;
  if (q.j != null) out.map.giac = q.j;
  if (desc != null && desc !== code && desc !== q.j) out.map.desc = desc;
  out.how = { code: howC, giac: q.how };
  out.score = nameScore + (code != null ? 3 : 0) + (q.j != null ? 3 : 0) + Math.min(1, n / 400);
}
// Impronta del tracciato: i nomi delle colonne della riga di intestazione, nell'ordine. Senza intestazione non c'è impronta.
function layoutSig(rows, headerRow) {
  const h = (rows[headerRow] || []).map(norm); while (h.length && !h[h.length - 1]) h.pop();
  if (h.filter(Boolean).length < 2) return null;
  const s = h.join("|");
  return h.length + ":" + fp(s) + ":" + fp(s.split("").reverse().join(""));
}
async function loadLayouts() {
  if (state.layoutsDealer === state.dealerId) return;
  try {
    const rows = await api("GET", `/api/dealers/${state.dealerId}/layouts`), L = {};
    rows.forEach(r => { L[r.kind + ":" + r.sig] = r.map; });
    state.layouts = L; state.layoutsDealer = state.dealerId;
  } catch (e) { state.layouts = {}; state.layoutsDealer = null; }
}
/* Analisi di un foglio: riga di intestazione e colonne. Per le liste movimentazione conta il nome delle colonne; per le giacenze anche il contenuto.
   fresh = true ignora il tracciato ricordato. */
function analyse(slot, rows, fresh) {
  const fields = slot === "A" ? FIELDS_A : FIELDS_B, a = analyseSheet(rows, fields);
  const out = { headerRow: a.headerRow, map: a.map, score: a.score, named: a.score > 0, how: {}, uncertain: false, memory: false, manual: false, confirmed: false };
  if (slot === "B") detectB(rows, out);
  out.sig = layoutSig(rows, out.headerRow);
  const mem = !fresh && out.sig && state.layoutsDealer === state.dealerId ? state.layouts[slot + ":" + out.sig] : null;
  if (mem) {
    const map = {};
    for (const f of fields) if (Number.isInteger(mem[f.key]) && mem[f.key] >= 0 && mem[f.key] < 500) map[f.key] = mem[f.key];
    // la giacenza delle liste è una colonna aggiunta in seguito: i tracciati ricordati prima non la conoscono, e allora vale quella riconosciuta adesso
    if (slot === "A" && map.giac == null && out.map.giac != null && !Object.values(map).includes(out.map.giac)) map.giac = out.map.giac;
    // si segnala solo quando serve: se oggi il riconoscimento darebbe le stesse colonne, e senza dubbi, non c'è niente da ricordare
    const same = fields.every(f => map[f.key] === out.map[f.key]);
    if (fields.every(f => !f.req || map[f.key] != null) && (!same || out.uncertain)) { out.map = map; out.memory = true; out.uncertain = false; out.how = {}; }
  }
  return out;
}
// Controllo di quello che si leggerà dal file giacenze con le colonne scelte.
function checkB(s) {
  const K = knownCodes(), key = [s.sheet, s.headerRow, s.map.code, s.map.giac, s.map.desc, K.key].join("|");
  if (s.chk && s.chk.key === key) return s.chk;
  const rows = s.wb.sheets[s.sheet] || [], c = s.map.code, g = s.map.giac, d = s.map.desc, seen = new Set();
  const r = { key, rows: 0, codes: 0, known: 0, nonNum: 0, neg: 0, dec: 0, dup: 0, pieces: 0, sample: [], hasLists: K.exact.size > 0 };
  if (c != null) for (let i = s.headerRow + 1; i < rows.length; i++) {
    const row = rows[i] || [], k = codeKey(row[c]); if (!k) continue;
    r.rows++;
    if (seen.has(k)) r.dup++; else { seen.add(k); if (r.hasLists && toKnown(k, K)) r.known++; }
    if (g != null) { const n = qtyOf(row[g]); if (!Number.isFinite(n)) r.nonNum++; else { if (n < 0) r.neg++; if (!Number.isInteger(n)) r.dec++; r.pieces += n; } }
    if (r.sample.length < 5) r.sample.push([k, g == null ? null : row[g], d == null ? null : row[d]]);
  }
  r.codes = seen.size;
  return (s.chk = r);
}
const lowMatch = c => c.hasLists && c.codes >= 5 && c.known / c.codes < 0.3;
// Serve una conferma quando la scelta delle colonne non è sicura, o quando quasi nessun codice si ritrova nelle liste.
const needConfirm = s => !s.confirmed && !s.manual && s.map.code != null && s.map.giac != null && ((s.uncertain && !s.memory) || lowMatch(checkB(s)));
// Quando cambiano le liste movimentazione, le giacenze già scelte vengono riconosciute di nuovo (non quelle scelte a mano o ricordate).
function redetectB() {
  for (const s of state.upload.B) {
    if (s.manual || s.memory) continue;
    const a = analyse("B", s.wb.sheets[s.sheet] || [], s.fresh), same = ["code", "giac", "desc"].every(k => a.map[k] === s.map[k]) && a.headerRow === s.headerRow;
    Object.assign(s, a, { confirmed: same && s.confirmed });
  }
  renderSlot("B"); updateSave();
}
const HOW = { liste: "trovata confrontando i codici con le liste movimentazione", nome: "riconosciuta dal nome", contenuto: "riconosciuta dal contenuto" };
function recogHtml(s, k, ask) {
  const hdr = (s.wb.sheets[s.sheet] || [])[s.headerRow] || [], c = checkB(s), m = s.map;
  const col = i => `colonna ${colL(i)}${hdr[i] != null && hdr[i] !== "" ? ` «${esc(hdr[i])}»` : ""}`;
  const how = key => (s.manual ? "scelta da te" : s.memory ? "" : HOW[s.how[key]] || "");
  const line = (lab, key) => `<b>${lab}</b>: ${col(m[key])}${how(key) ? ` <span class="muted">· ${how(key)}</span>` : ""}`;
  const warn = [], rh = n => (n === 1 ? "riga ha" : "righe hanno");
  const low = lowMatch(c);
  if (low) warn.push(`${c.known ? `Solo ${fmtN(c.known)} codici su ${fmtN(c.codes)} compaiono` : `Nessuno dei ${fmtN(c.codes)} codici compare`} nelle liste movimentazione: controlla che la colonna del codice sia quella giusta e che il file sia della stessa concessionaria.`);
  if (s.uncertain && ask) warn.push("La scelta delle colonne non è sicura: più colonne potrebbero contenere il codice o la giacenza. Controlla le prime righe lette e conferma, oppure cambia le colonne.");
  if (c.nonNum) warn.push(`${fmtN(c.nonNum)} ${rh(c.nonNum)} una giacenza che non è un numero: ${c.nonNum === 1 ? "conta" : "contano"} come zero.`);
  if (c.dec) warn.push(`${fmtN(c.dec)} ${rh(c.dec)} una giacenza con decimali: controlla che non sia una colonna di prezzi.`);
  if (c.neg) warn.push(`${fmtN(c.neg)} ${rh(c.neg)} una giacenza negativa.`);
  const info = [`${fmtN(c.rows)} righe con un codice`, c.hasLists ? `${fmtN(c.known)} codici su ${fmtN(c.codes)} presenti nelle liste movimentazione` : `${fmtN(c.codes)} codici diversi`, `${fmtN(c.pieces, Number.isInteger(c.pieces) ? 0 : 2)} pezzi in tutto`];
  if (c.dup) info.push(`${fmtN(c.dup)} righe con un codice ripetuto: le quantità si sommano`);
  const qCell = v => { if (v == null || v === "") return `<td class="num">0</td>`; const n = qtyOf(v); return Number.isFinite(n) ? `<td class="num">${fmtN(n, Number.isInteger(n) ? 0 : 2)}</td>` : `<td class="num miss">${esc(String(v).slice(0, 20))}</td>`; };
  return `<div class="recog"><p class="small">${line("Codice", "code")}<br>${line("Giacenza", "giac")}${m.desc != null ? `<br>${line("Descrizione", "desc")}` : ""}</p>
    <div class="tablebox"><table class="prev"><thead><tr><th>Codice letto</th><th class="num">Giacenza letta</th>${m.desc != null ? "<th>Descrizione</th>" : ""}</tr></thead>
      <tbody>${c.sample.map(r => `<tr><td class="mono">${esc(r[0])}</td>${qCell(r[1])}${m.desc != null ? `<td>${esc(r[2] == null ? "" : String(r[2]).slice(0, 60))}</td>` : ""}</tr>`).join("")}</tbody></table></div>
    <p class="small muted">${info.join(" · ")}. Le altre colonne del file vengono ignorate.</p>
    ${warn.map(w => `<p class="small miss">${esc(w)}</p>`).join("")}
    ${ask ? `<div class="okrow"><button class="btn sm primary" type="button" data-ok="${k}">${s.uncertain || !low ? "Le colonne sono giuste" : "Uso comunque questo file"}</button><span class="small muted">${s.uncertain || !low ? "oppure cambiale qui sotto" : "oppure toglilo, o cambia le colonne qui sotto"}</span></div>` : ""}</div>`;
}
// Le prime righe del file giacenze con tutte le colonne, per scegliere a colpo d'occhio: in evidenza il codice e la giacenza.
function wideHtml(s) {
  const rows = s.wb.sheets[s.sheet] || [], hdr = rows[s.headerRow] || [], first = rows.slice(s.headerRow + 1, s.headerRow + 6);
  const tot = first.reduce((m, r) => Math.max(m, (r || []).length), hdr.length), pick = [s.map.code, s.map.giac].filter(i => i != null);
  const cols = [...new Set(Array.from({ length: Math.min(12, tot) }, (_, i) => i).concat(pick))].sort((a, b) => a - b);
  const cell = v => esc(v == null ? "" : String(v).slice(0, 24)), cls = i => (pick.includes(i) ? ' class="pick"' : "");
  if (!first.length) return "";
  return `<p class="small muted">Le prime righe del file${tot > cols.length ? ` (${cols.length} colonne su ${tot})` : ""}; in evidenza le colonne scelte.</p>
    <div class="tablebox"><table class="prev"><thead><tr>${cols.map(i => `<th${cls(i)}>${colL(i)}${hdr[i] != null && hdr[i] !== "" ? " · " + cell(hdr[i]) : ""}${i === s.map.code ? " · codice" : i === s.map.giac ? " · giacenza" : ""}</th>`).join("")}</tr></thead>
      <tbody>${first.map(r => `<tr>${cols.map(i => `<td${cls(i)}>${cell((r || [])[i])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function readFile(file) {
  return new Promise((res, rej) => {
    if (typeof XLSX === "undefined") return rej(new Error("Il lettore Excel non si è caricato. Ricarica la pagina."));
    const fr = new FileReader();
    fr.onload = () => { try {
      // raw: nei file di testo (CSV) i valori restano come sono scritti; altrimenti «3,00» verrebbe letto 300, «0012345» perderebbe gli zeri
      // e «1-2» diventerebbe una data. I numeri si interpretano dopo, con la virgola decimale. Per i file Excel non cambia nulla.
      const wb = XLSX.read(new Uint8Array(fr.result), { type: "array", raw: true }); const sheets = {};
      wb.SheetNames.forEach(n => { sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null, raw: true, blankrows: false }); });
      res({ name: file.name, sheets });
    } catch (e) { rej(new Error(`Non riesco a leggere «${file.name}». Deve essere un Excel (.xlsx o .xls) non protetto da password.`)); } };
    fr.onerror = () => rej(new Error("Lettura del file non riuscita.")); fr.readAsArrayBuffer(file);
  });
}
async function viewCarica(main) {
  if (needDealer(main)) return;
  const U = state.upload;
  main.innerHTML = `<div class="head"><div><h1>Carica dati</h1><p class="sub">${esc(dealerName(state.dealerId))}. Carica le liste movimentazione più recenti. Il file giacenze serve se le liste non riportano le giacenze, oppure se ne hai uno più recente. I file vengono letti sul tuo computer; sulla piattaforma viene salvato solo il risultato dell'incrocio, con data e ora del caricamento.</p></div></div>
  <div class="msg err" id="uerr" hidden></div>
  <section class="grid2">
    <div class="step" id="stepA"><span class="num">PASSO 1</span><h3>Storico movimentazione</h3><p class="meta">Lista disposizione con codice, SMin, SMax, ordini aperti e costo. Se riporta anche le giacenze (alla fine del mese precedente), puoi calcolare già con questa. Puoi scegliere più file: vengono uniti. Anche i fogli di uno stesso file con le stesse colonne vengono letti tutti e uniti.</p>
      <div id="listA"></div>
      <label class="btn" for="fileA">Aggiungi file storico</label><input type="file" id="fileA" accept=".xlsx,.xls,.xlsm,.csv" multiple></div>
    <div class="step" id="stepB"><span class="num">PASSO 2</span><h3>Giacenza attuale</h3><p class="meta">Le giacenze di oggi sostituiscono quelle riportate dalle liste: è facoltativo se le liste le riportano, obbligatorio se non le riportano. Va bene qualsiasi estrazione del tuo gestionale, purché abbia una colonna con il codice e una con la quantità in giacenza: la piattaforma le riconosce da sola, ti mostra cosa ha letto e ignora tutte le altre colonne. Con più file o più fogli con le stesse colonne, le quantità dello stesso codice si sommano.</p>
      <div id="listB"></div>
      <label class="btn" for="fileB">Aggiungi file giacenza</label><input type="file" id="fileB" accept=".xlsx,.xls,.xlsm,.csv" multiple></div>
  </section>
  <div id="stocksum"></div>
  <div class="row"><button class="btn primary" type="button" id="save" disabled>Incrocia e salva</button><span class="small muted" id="sstat"></span></div>`;
  ["A", "B"].forEach(slot => {
    const inp = $("#file" + slot), step = $("#step" + slot);
    inp.onchange = () => { handleFiles(slot, Array.from(inp.files)); inp.value = ""; };
    step.addEventListener("dragover", e => { e.preventDefault(); step.classList.add("drag"); });
    step.addEventListener("dragleave", () => step.classList.remove("drag"));
    step.addEventListener("drop", e => { e.preventDefault(); step.classList.remove("drag"); handleFiles(slot, Array.from(e.dataTransfer.files)); });
    renderSlot(slot);
  });
  updateSave();
  $("#save").onclick = () => save(false);
}
async function handleFiles(slot, files) {
  if (!files.length) return; const err = $("#uerr"); err.hidden = true;
  const fields = slot === "A" ? FIELDS_A : FIELDS_B;
  await loadLayouts();
  for (const file of files) {
    try {
      const wb = await readFile(file);
      const all = Object.entries(wb.sheets).map(([name, rows]) => ({ sheet: name, rows, ...analyse(slot, rows) }));
      const best = all.reduce((x, y) => (y.score > x.score ? y : x));
      // Fogli con la stessa intestazione del foglio migliore e con dati: si leggono tutti, con le stesse colonne, come se fossero file separati.
      const sig = a => (a.rows[a.headerRow] || []).map(v => String(v == null ? "" : v).trim().toUpperCase()).join("|");
      const req = a => fields.every(f => !f.req || a.map[f.key] != null), bestSig = sig(best);
      const same = all.filter(a => a === best || (a.rows.length > a.headerRow + 1 && sig(a) === bestSig && (bestSig ? req(best) : req(a) && a.map.code === best.map.code && a.map.giac === best.map.giac)));
      for (const a of same) {
        const e = { wb, sheet: a.sheet, headerRow: a.headerRow, named: a.named, sig: a.sig };
        for (const k of ["map", "how", "uncertain", "memory", "manual", "confirmed"]) e[k] = a === best || !bestSig ? a[k] : best[k];
        e.map = { ...e.map };
        state.upload[slot].push(e);
      }
      if (same.length > 1) toast(`«${file.name}»: letti ${same.length} fogli con le stesse colonne (${same.map(a => a.sheet).join(", ")}).`);
    } catch (e) { err.hidden = false; err.textContent = e.message; }
  }
  // I file vengono sempre uniti in ordine alfabetico (i fogli di uno stesso file restano nel loro ordine): lo stesso insieme di file dà lo stesso risultato, in qualsiasi ordine vengano scelti.
  state.upload[slot].sort((x, y) => (x.wb.name < y.wb.name ? -1 : x.wb.name > y.wb.name ? 1 : 0));
  renderSlot(slot); updateSave();
  if (slot === "A") redetectB();
}
function entryMissing(slot, s) { return (slot === "A" ? FIELDS_A : FIELDS_B).filter(f => f.req && s.map[f.key] == null).map(f => f.label); }
function renderSlot(slot) {
  const list = state.upload[slot], fields = slot === "A" ? FIELDS_A : FIELDS_B, host = $("#list" + slot);
  if (!host) return;
  $("#step" + slot).classList.toggle("done", slotReady(slot));
  host.innerHTML = list.map((s, k) => {
    const rows = s.wb.sheets[s.sheet] || [], n = Math.max(0, rows.length - s.headerRow - 1), miss = entryMissing(slot, s);
    const header = rows[s.headerRow] || [], names = Object.keys(s.wb.sheets), noCons = slot === "A" && s.map.cons_mese == null;
    const first = rows.slice(s.headerRow + 1, s.headerRow + 31), ncol = Math.min(120, first.reduce((m, r) => Math.max(m, (r || []).length), header.length));
    // nome di una colonna nei menu: l'intestazione, oppure la lettera della colonna con un valore di esempio
    const colName = i => { const h = header[i]; if (h != null && h !== "") return String(h); const r = first.find(x => x && x[i] != null && x[i] !== ""); return `Colonna ${colL(i)}${r ? ` (es. ${String(r[i]).slice(0, 18)})` : ""}`; };
    const ask = slot === "B" && needConfirm(s);
    let map = names.length > 1 ? `<label for="sh${slot}${k}">Foglio</label><select id="sh${slot}${k}" data-sh="${k}">${names.map(x => `<option${x === s.sheet ? " selected" : ""}>${esc(x)}</option>`).join("")}</select>` : "";
    for (const f of fields) map += `<label for="m${slot}${k}_${f.key}" class="${f.req ? "req" : ""}">${esc(f.label)}</label><select id="m${slot}${k}_${f.key}" data-e="${k}" data-k="${f.key}"><option value="">— nessuna —</option>${Array.from({ length: ncol }, (_, i) => `<option value="${i}"${s.map[f.key] === i ? " selected" : ""}>${esc(colName(i))}</option>`).join("")}</select>`;
    return `<div class="fileent"><div class="row"><p class="meta"><b>${esc(s.wb.name)}</b><br>Foglio «${esc(s.sheet)}», ${fmtN(n)} righe${s.headerRow < 0 ? ", senza riga di intestazione" : ""}${s.memory ? `<br>Colonne come nell'ultimo caricamento di un file con questa intestazione. <button class="link" type="button" data-re="${k}">Riconosci di nuovo</button>` : ""}${miss.length ? `<br><span class="miss">Mancano: ${esc(miss.join(", "))}.</span>` : ""}${noCons ? `<br><span class="miss">Consumo medio non riconosciuto: senza questa colonna coperture e scenari d'ordine non si possono calcolare.</span>` : ""}</p><button class="link" type="button" data-rm="${k}">Togli</button></div>
      ${slot === "B" && !miss.length ? recogHtml(s, k, ask) : ""}
      <details data-d="${k}"${miss.length || noCons || ask || s.mapOpen ? " open" : ""}><summary>${slot === "B" ? "Cambia le colonne" : "Colonne riconosciute"}</summary><div class="map">${map}</div>${slot === "B" ? wideHtml(s) : ""}</details></div>`;
  }).join("");
  const again = () => { renderSlot(slot); updateSave(); if (slot === "A") redetectB(); };
  // il riquadro delle colonne resta aperto finché non lo si richiude
  $$("details[data-d]", host).forEach(d => d.addEventListener("toggle", () => { list[+d.dataset.d].mapOpen = d.open; }));
  $$("[data-rm]", host).forEach(b => b.onclick = () => { list.splice(+b.dataset.rm, 1); again(); });
  $$("[data-sh]", host).forEach(el => el.onchange = () => { const s = list[+el.dataset.sh]; Object.assign(s, { sheet: el.value }, analyse(slot, s.wb.sheets[el.value] || [])); again(); });
  $$("[data-re]", host).forEach(b => b.onclick = () => { const s = list[+b.dataset.re]; Object.assign(s, analyse(slot, s.wb.sheets[s.sheet] || [], true), { fresh: true }); again(); });
  // i fogli di uno stesso file con la stessa intestazione vanno insieme: una conferma o una scelta vale per tutti
  const twins = s => (s.sig ? list.filter(x => x.wb === s.wb && x.sig === s.sig) : [s]);
  $$("[data-ok]", host).forEach(b => b.onclick = () => { twins(list[+b.dataset.ok]).forEach(x => { x.confirmed = true; }); again(); });
  $$("select[data-k]", host).forEach(el => el.onchange = () => {
    const s0 = list[+el.dataset.e], all = twins(s0);
    for (const s of all) {
      if (el.value === "") delete s.map[el.dataset.k]; else s.map[el.dataset.k] = +el.value;
      // una scelta fatta a mano vale come conferma; senza intestazione riconosciuta, la prima riga di dati dipende dalle colonne scelte
      Object.assign(s, { manual: true, memory: false, uncertain: false, confirmed: true });
      if (slot === "B" && !s.named) { const rows = s.wb.sheets[s.sheet] || []; s.headerRow = dataStart(rows, s.map.code, s.map.giac, knownCodes()) - 1; s.sig = layoutSig(rows, s.headerRow); }
    }
    s0.mapOpen = true;
    again();
  });
}
/* ============ Mese di riferimento delle liste ============
 * Alcune estrazioni hanno una colonna «Annomese» (2026/10): le giacenze sono quelle all'ultimo giorno di quel mese.
 * Se un file contiene più mesi, per ogni codice vale solo il mese più recente: le righe dei mesi precedenti vengono ignorate.
 */
const MESE_HDR = ["annomese", "annomes", "meseanno", "mese", "periodo", "meserif", "meseriferimento", "mesediriferimento"];
const monthKey = (y, mo) => (y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 ? y * 12 + mo - 1 : null);
function parseMonth(v) {
  if (v == null || v === "") return null;
  const t = String(v).trim(); let m;
  if ((m = /^(\d{4})\s*[\/.\-]?\s*(\d{1,2})$/.exec(t))) return monthKey(+m[1], +m[2]);
  if ((m = /^(\d{1,2})\s*[\/.\-]\s*(\d{4})$/.exec(t))) return monthKey(+m[2], +m[1]);
  return null;
}
const monthEndOf = k => { const y = Math.floor(k / 12), mo = k % 12 + 1, d = new Date(y, mo, 0).getDate(); return `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${y}`; };
const monthLabel = k => `${String(k % 12 + 1).padStart(2, "0")}/${Math.floor(k / 12)}`;
function monthsOf(s) {
  const rows = s.wb.sheets[s.sheet] || [], key = [s.sheet, s.headerRow, s.map.code].join("|");
  if (s.mth && s.mth.key === key) return s.mth;
  const hdr = rows[s.headerRow] || [], o = { key, col: null, latest: null, n: 0, drop: 0 };
  const col = hdr.findIndex((h, i) => MESE_HDR.includes(norm(h)) && !Object.values(s.map).includes(i));
  if (col >= 0 && s.map.code != null) {
    const seen = new Map();
    for (let i = s.headerRow + 1; i < rows.length; i++) { const r = rows[i] || []; if (r[s.map.code] == null || r[s.map.code] === "") continue; const k = parseMonth(r[col]); if (k != null) seen.set(k, (seen.get(k) || 0) + 1); }
    if (seen.size) { o.col = col; o.latest = Math.max(...seen.keys()); o.n = seen.size; for (const [k, c] of seen) if (k !== o.latest) o.drop += c; }
  }
  return (s.mth = o);
}
// riga da usare: se il file ha più mesi, solo quelle del mese più recente (le righe senza mese restano)
const rowOk = (mi, r) => mi.n < 2 || parseMonth(r[mi.col]) == null || parseMonth(r[mi.col]) === mi.latest;
/* ============ Quali giacenze usare ============
 * Le liste movimentazione possono riportare la giacenza di ogni codice alla fine del mese precedente; il file giacenze è la fotografia di oggi.
 *   - solo le liste: si calcola con le giacenze delle liste;
 *   - liste e file giacenze: valgono le giacenze del file, più recenti. Costi, scorte, consumi e ordini aperti restano quelli delle liste.
 * Se le liste non riportano le giacenze (colonna assente o vuota), il file giacenze è obbligatorio.
 */
const nz = v => { const n = typeof v === "number" ? v : numVal(v); return Number.isFinite(n) ? n : 0; };
let LSTOCK = { key: null }, SCMP = { key: null };
// Giacenze riportate dalle liste scelte: valgono se ogni lista ha la colonna e almeno un codice con giacenza diversa da zero.
function listStock() {
  const U = state.upload, key = U.A.map(s => [wbId(s.wb), s.sheet, s.headerRow, s.map.code, s.map.giac].join(":")).join("|");
  if (LSTOCK.key === key) return LSTOCK;
  const r = { key, has: U.A.length > 0, nocol: 0, codes: 0, pieces: 0, ref: null, months: 0, drop: 0, latest: null }, refs = new Set();
  for (const s of U.A) {
    const rows = s.wb.sheets[s.sheet] || [], c = s.map.code, g = s.map.giac, mi = monthsOf(s); let pos = 0;
    if (mi.n) { r.months = Math.max(r.months, mi.n); r.drop += mi.drop; r.latest = r.latest == null ? mi.latest : Math.max(r.latest, mi.latest); }
    if (c != null && g != null) {
      for (let i = s.headerRow + 1; i < rows.length; i++) { const row = rows[i] || []; if (row[c] == null || row[c] === "" || !rowOk(mi, row)) continue; const q = nz(row[g]); if (q) { pos++; r.pieces += q; } }
      const d = refDate((rows[s.headerRow] || [])[g]) || (mi.latest != null ? monthEndOf(mi.latest) : null); if (d) refs.add(d);
    }
    if (!pos) { r.has = false; if (g == null) r.nocol++; }
    r.codes += pos;
  }
  if (refs.size === 1) r.ref = [...refs][0];
  return (LSTOCK = r);
}
// Confronto, per i codici delle liste, tra la giacenza riportata dalle liste e quella del file giacenze.
function stockCompare() {
  const U = state.upload;
  if (!U.A.length || !U.B.length || !slotReady("A") || !slotReady("B")) return null;
  const K = knownCodes(), key = listStock().key + "#" + U.B.map(s => [wbId(s.wb), s.sheet, s.headerRow, s.map.code, s.map.giac].join(":")).join("|") + "#" + K.key;
  if (SCMP.key === key) return SCMP;
  const B = new Map(); for (const r of extract("B")) { const c = codeKey(r[0]); B.set(c, (B.get(c) || 0) + r[1]); }
  const seen = new Set(), o = { key, codes: 0, changed: 0, up: 0, down: 0, valList: 0, valFile: 0, withList: 0, miss: 0, missPieces: 0, missVal: 0 };
  for (const r of extract("A")) {
    const c = codeKey(r[0]); if (!c || seen.has(c)) continue; seen.add(c); o.codes++;
    const hasL = !(r[14] == null || r[14] === ""), gl = hasL ? nz(r[14]) : 0, inB = B.has(c), gf = inB ? B.get(c) : 0, cost = nz(r[4]);
    o.valFile += gf * cost; o.valList += gl * cost;
    if (gl > 0) o.withList++;
    if (!inB) { if (gl > 0) { o.miss++; o.missPieces += gl; o.missVal += gl * cost; } }
    else if (hasL && gf !== gl) { o.changed++; if (gf > gl) o.up++; else o.down++; }
  }
  return (SCMP = o);
}
// Codici con giacenza nelle liste ma assenti dal file giacenze: di solito sono pochi (esauriti nel frattempo).
// Se sono molti il file giacenze è probabilmente parziale, e prima di salvare serve una scelta.
const manyMissing = c => !!c && c.miss >= 10 && c.miss / c.withList > 0.25;
// La scelta vale solo per i file con cui è stata fatta: se cambiano le liste o le giacenze, si riparte.
const missChoice = () => { const U = state.upload, c = stockCompare(); return c && U.missKey === c.key && (U.miss === "lista" || U.miss === "zero") ? U.miss : null; };
const needMissChoice = () => listStock().has && manyMissing(stockCompare()) && !missChoice();
// Le giacenze sono a posto con un file giacenze in ordine, oppure, senza file, quando le liste le riportano.
const stockReady = () => (state.upload.B.length ? slotReady("B") && !needMissChoice() : listStock().has);
function stockSumHtml() {
  const h = stockSumCore(); if (!h) return h;
  const U = state.upload, LS = listStock(), notes = [];
  if (LS.months > 1) notes.push(`Le liste contengono ${fmtN(LS.months)} mesi: uso solo il più recente (${monthLabel(LS.latest)}); ${fmtN(LS.drop)} righe dei mesi precedenti sono ignorate.`);
  if (U.A.every(s => s.map.ord == null)) notes.push("Le liste non hanno la colonna degli ordini aperti: per la piattaforma sono zero. Se ci sono ordini in arrivo, la proposta può ordinarli di nuovo.");
  return notes.length ? h.replace(/<\/div>$/, notes.map(n => `<p class="small">${esc(n)}</p>`).join("") + "</div>") : h;
}
function stockSumCore() {
  const U = state.upload, LS = listStock();
  if (!U.A.length || !slotReady("A")) return "";
  const ref = LS.ref ? `al ${esc(LS.ref)}` : "alla fine del mese precedente";
  if (!U.B.length) return LS.has
    ? `<div class="stocksum"><p><b>Giacenze: quelle delle liste movimentazione</b>, ${ref}. ${fmtN(LS.codes)} codici con giacenza, ${fmtN(LS.pieces, Number.isInteger(LS.pieces) ? 0 : 2)} pezzi.</p>
        <p class="small muted">Il file giacenze è facoltativo: se ne hai uno più recente aggiungilo, e le sue giacenze sostituiscono quelle delle liste.</p></div>`
    : `<div class="stocksum warn"><p><b>Serve il file giacenze.</b> Le liste movimentazione non riportano le giacenze (${LS.nocol ? "la colonna non c'è" : "la colonna è vuota"}): senza il file giacenze ogni codice risulterebbe a zero.</p></div>`;
  if (!slotReady("B")) return "";
  if (!LS.has) return `<div class="stocksum"><p><b>Giacenze: quelle del file giacenze.</b> Le liste movimentazione non le riportano.</p></div>`;
  const c = stockCompare(), many = manyMissing(c), ch = missChoice() || (many ? null : "zero");
  const valFile = c.valFile + (ch === "lista" ? c.missVal : 0);
  return `<div class="stocksum${many && !ch ? " warn" : ""}"><p><b>Giacenze: quelle del file giacenze</b>, più recenti di quelle delle liste (${ref}). Costi, SMin, SMax, consumi e ordini aperti restano quelli delle liste.</p>
    <p class="small">Rispetto alle liste la giacenza è cambiata per <b>${fmtN(c.changed)}</b> codici su ${fmtN(c.codes)}: ${fmtN(c.down)} in calo, ${fmtN(c.up)} in aumento. Valore al costo: da ${fmtE(c.valList)} a ${fmtE(valFile)}.</p>
    ${c.miss ? `<fieldset class="missbox"><legend><b>${fmtN(c.miss)} ${c.miss === 1 ? "codice ha" : "codici hanno"} giacenza nelle liste ma non ${c.miss === 1 ? "è" : "sono"} nel file giacenze</b> (${fmtN(c.missPieces, Number.isInteger(c.missPieces) ? 0 : 2)} pezzi, ${fmtE(c.missVal)}).${many ? " Sono molti: il file giacenze potrebbe essere parziale. Scegli come trattarli." : ""}</legend>
      <label class="check" for="mz"><input type="radio" name="miss" id="mz" value="zero"${ch === "zero" ? " checked" : ""}> Sono esauriti: giacenza zero</label>
      <label class="check" for="ml"><input type="radio" name="miss" id="ml" value="lista"${ch === "lista" ? " checked" : ""}> Il file giacenze è parziale: per loro tengo la giacenza delle liste</label></fieldset>` : ""}</div>`;
}
function renderStockSum() {
  const h = $("#stocksum"); if (!h) return;
  h.innerHTML = stockSumHtml();
  $$("input[name=miss]", h).forEach(el => el.onchange = () => { state.upload.miss = el.value; state.upload.missKey = (stockCompare() || {}).key; updateSave(); });
}
const slotReady = slot => state.upload[slot].length > 0 && state.upload[slot].every(s => !entryMissing(slot, s).length && !(slot === "B" && needConfirm(s)));
function updateSave() {
  renderStockSum();
  const b = $("#save"); if (!b) return;
  const U = state.upload, ok = slotReady("A") && stockReady(); b.disabled = !ok;
  // senza file giacenze si salva con le giacenze delle liste, se le riportano
  b.textContent = !U.B.length && slotReady("A") && listStock().has ? "Salva con le giacenze delle liste" : "Incrocia e salva";
  $("#sstat").textContent = ok ? "" : !U.A.length ? "Manca lo storico." : !slotReady("A") ? "Completa le colonne obbligatorie." : !U.B.length ? "Manca il file giacenze: le liste non riportano le giacenze."
    : U.B.some(s => !entryMissing("B", s).length && needConfirm(s)) ? "Conferma le colonne del file giacenze." : !slotReady("B") ? "Completa le colonne obbligatorie." : "Scegli come trattare i codici assenti dal file giacenze.";
}
// Numeri scritti come testo (file CSV, celle di testo): «12,50», «1.250,00». Tutto il resto passa com'è.
const numCell = v => { if (typeof v !== "string") return v; const n = numVal(v); return Number.isFinite(n) ? n : v; };
function extract(slot) {
  const out = [], K = slot === "B" ? knownCodes() : null;
  for (const s of state.upload[slot]) {
    const rows = s.wb.sheets[s.sheet], m = s.map, g = (r, k) => m[k] == null ? null : r[m[k]], mi = slot === "A" ? monthsOf(s) : { n: 0 };
    for (let i = s.headerRow + 1; i < rows.length; i++) {
      const r = rows[i] || [], c = g(r, "code"); if (c == null || c === "" || !rowOk(mi, r)) continue;
      if (slot === "A") out.push([c, g(r, "desc"), g(r, "loc"), g(r, "dg"), numCell(g(r, "cost")), numCell(g(r, "ord")), numCell(g(r, "smin")), numCell(g(r, "smax")), numCell(g(r, "regolarita")), numCell(g(r, "cons_mese")), numCell(g(r, "listino")), numCell(g(r, "qtaven")), numCell(g(r, "venspc")), numCell(g(r, "fab")), numCell(g(r, "giac"))]);
      else {
        // giacenze: il codice nella forma delle liste movimentazione, la quantità come numero; nient'altro
        const k = codeKey(c), q = qtyOf(g(r, "giac"));
        if (k) out.push([toKnown(k, K) || k, Number.isFinite(q) ? q : 0, g(r, "desc")]);
      }
    }
  }
  return out;
}
async function save(onDone) {
  const b = $("#save"), st = $("#sstat"), err = $("#uerr"), U = state.upload;
  b.disabled = true; st.textContent = "Incrocio e salvataggio in corso…"; err.hidden = true;
  try {
    const names = k => [...new Set(U[k].map(s => s.wb.name))].join(", ");
    // i tracciati usati (intestazione → colonne) vengono ricordati per la concessionaria
    const layouts = []; for (const k of ["A", "B"]) for (const s of U[k]) if (s.sig) layouts.push({ kind: k, sig: s.sig, map: s.map });
    // senza file giacenze valgono le giacenze riportate dalle liste; con il file, la scelta per i codici che nel file non ci sono
    const useB = U.B.length > 0, LS = listStock();
    const r = await api("POST", "/api/snapshots", { dealer_id: state.dealerId, file_a: names("A"), file_b: useB ? names("B") : "", rowsA: extract("A"), rowsB: useB ? extract("B") : null,
      missing: useB && missChoice() === "lista" ? "lista" : "zero", stock_ref: LS.has ? LS.ref : null, layouts });
    if (state.layoutsDealer === state.dealerId) layouts.forEach(l => { state.layouts[l.kind + ":" + l.sig] = { ...l.map }; });
    U.A = []; U.B = []; U.miss = null; U.missKey = null;
    toast(`Dati salvati: ${fmtN(r.kpi.n_codes)} codici${r.dup ? `, ${fmtN(r.dup)} doppioni nello storico contati una volta` : ""}. ${stockNote(r)}.`);
    await loadSnapshots(); state.analisi = { ...state.analisi, snapId: r.id, offset: 0, f: "tutti", q: "", sort: null };
    if (onDone) return onDone(r);
    location.hash = "#analisi";
  } catch (e) {
    if (e.silent) return;
    err.hidden = false; err.textContent = e.message; st.textContent = ""; b.disabled = false;
  }
}

/* ============ Generatore di dati di prova ============
 * Crea liste movimentazione e giacenze fittizie con la stessa struttura dei file reali,
 * per uno o più caricamenti successivi che evolvono nel tempo. Tutto avviene nel browser: nulla viene salvato.
 */
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// Codici di prova: 8 cifre, la quarta è il gruppo principale (da 0 a 9).
// [gruppo, descrizione, listino minimo, listino massimo]
const G_PARTS = [["8", "RIVEST.", 380, 720], ["8", "PARAURTI ANT.", 290, 650], ["8", "PARAURTI POST.", 270, 610], ["6", "PASTIGLIE FRENO", 48, 160], ["6", "DISCO FRENO", 55, 240],
  ["6", "PINZA FRENO", 160, 520], ["1", "FILTRO OLIO", 9, 28], ["1", "FILTRO ARIA", 18, 55], ["8", "FILTRO ABITACOLO", 16, 48], ["2", "FILTRO CARB.", 24, 90],
  ["9", "PROIETTORE", 320, 1450], ["9", "FANALE POST.", 140, 480], ["8", "SPECCHIO EST.", 45, 260], ["1", "RADIATORE", 210, 560], ["5", "AMMORTIZZ.", 95, 310],
  ["4", "BRACCIO OSCILL.", 85, 280], ["9", "SPAZZOLA TERG.", 14, 46], ["9", "CANDELA", 9, 32], ["2", "SILENZIATORE", 180, 640], ["1", "GUARNIZIONE", 6, 85],
  ["1", "CINGHIA DENT.", 55, 160], ["1", "POMPA ACQUA", 90, 260], ["9", "SENSORE", 35, 210], ["9", "SENSORE PARCH.", 45, 120], ["8", "PARAFANGO", 160, 420],
  ["8", "PORTIERA", 520, 1250], ["8", "MODANATURA", 28, 140], ["8", "MANIGLIA", 30, 120], ["9", "MOTORINO ALZAC.", 85, 230], ["8", "COMPRESSORE CLIMA", 420, 980],
  ["9", "BATTERIA", 110, 290], ["4", "MOLLA ELICOID.", 40, 130], ["4", "CUSCINETTO RUOTA", 75, 210], ["6", "CERCHIO", 180, 690], ["8", "RIVEST. SEDILE", 140, 520],
  ["8", "PANNELLO PORTA", 160, 480], ["1", "SUPPORTO MOTORE", 60, 220], ["1", "TURBOCOMPRESSORE", 950, 2400], ["3", "KIT FRIZIONE", 260, 720], ["0", "BULLONE", 1, 9],
  ["7", "LEVA FRENO MANO", 35, 140], ["7", "PEDALIERA", 60, 210], ["3", "SUPPORTO CAMBIO", 45, 160], ["0", "VERNICE RITOCCO", 12, 38], ["5", "MOZZO POST.", 70, 230]];
const G_GRP = ["KDA", "KDB", "KMA", "KMB", "ZUB", "OEL", "REI"];
const G_HDR_A = ["DG", "Codice particolare", "Descrizione", "Locaz", "Prezzo listino EUR", "Sco STK EUR", "QtaVen/UltVen", "Ven Spc", "Giac Cross Aggiornate al ", "Ord. Aperti", "FAB", "Regolarità vendite", "Consumo medio mensile", "SMin", "SMax", "Scad"];
const G_HDR_B = ["Stampanr.RC", "Gr.M.", "Descrizione", "Tipomerce", "G.dispo.", "GrpOmog."];
// Intestazione delle liste di prova: se riportano le giacenze, la colonna dice a che data (la fine del mese scorso).
const G_COL_GIAC = 8;
const monthEnd = () => { const d = new Date(), e = new Date(d.getFullYear(), d.getMonth(), 0); return `${String(e.getDate()).padStart(2, "0")}/${String(e.getMonth() + 1).padStart(2, "0")}/${e.getFullYear()}`; };
// Tracciato «Export» mensile: una riga per codice, intestazione sulla prima riga, «Annomese» con il mese delle giacenze, niente ordini aperti.
const G_HDR_X = ["Annomese", "Organizzato", "DG", "Aut Blk Man", "Particolare", "Particolare Desc", "Partic Famiglia", "Sostituente", "Particolare Sostituente", "Prezzo Listino", "Prz Sco Stk", "Giacenza", "Prezzo Totale", "Ult Vend", "FAB", "Regolarità vendite", "Consumo medio mensile", "SMin", "SMax", "GV", "Locazione", "Particolare Codice Merceologico"];
const TRACCIATI_A = [["export", "Export mensile (Annomese, Particolare, Giacenza…)"], ["lista", "Lista disposizione (titolo, Codice particolare, Ord. Aperti…)"]];
const prevMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`; };
const hcode = c => { let h = 0; for (const ch of String(c)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const FAM = ["RCP", "RCO", "KDA", "KAB", "ECA", "KGA", "NNA", "KDT"], GVS = ["1", "2", "3", "3", "5A", "5C"];
/* Forma dei dati nell'export: codici come quelli dei ricambi (tre caratteri, il gruppo principale, cinque cifre, a volte lettere in coda;
 * qualche normalizzato «N  9…»), DG di quattro caratteri, locazioni come A01HJ. Il gruppo principale resta il quarto carattere del codice.
 * La stessa conversione vale per le liste e per il file giacenze, così i codici dei due file coincidono. */
const X_PRE = ["1K0", "1T0", "1S0", "2K5", "3C0", "3G0", "5G0", "5Q0", "5N0", "6R0", "7N0", "03L", "03N", "04E", "04L", "06K", "0AM", "2Q0"];
const X_SUF = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "P", "Q", "R", "S", "T"];
const X_MERC = ["01 - RICAMBI", "01 - RICAMBI", "01 - RICAMBI", "02 - RICAMBI", "03 - RICAMBI", "03 - RICAMBI", "04 - RICAMBI", "06 - RICAMBI", "08 - RICAMBI"];
function codeMapper(seed) {
  const R = rng(seed ^ 0x5a17), used = new Set(), map = new Map(), pick = a => a[Math.floor(R() * a.length)], d = n => { let t = ""; for (let i = 0; i < n; i++) t += Math.floor(R() * 10); return t; };
  return c => {
    if (map.has(c)) return map.get(c);
    const g = String(c)[3] || "0"; let x;
    do {
      const u = R();
      x = u < .03 ? `N  9${pick(["0", "1"])}${g}${d(5)}` : `${pick(X_PRE)}${g}${d(5)}${u < .45 ? "" : u < .85 ? pick(X_SUF) : pick(X_SUF) + pick(X_SUF)}`;
    } while (used.has(x.replace(/\s+/g, "")));
    used.add(x.replace(/\s+/g, "")); map.set(c, x); return x;
  };
}
const xDG = dg => { const h = hcode(dg); return "H" + "MNPRSZ"[h % 6] + ((h >>> 3) % 3 === 0 ? "ZZ" : String((h >>> 5) % 40 + 1).padStart(2, "0")); };
const xLoc = loc => { if (!loc) return null; const h = hcode(loc), L = "ABCDEFGHJ", A = "ABCDEFGHIJKLMNPRS0123456789"; return `${"AB"[h % 2]}${String((h >>> 1) % 20 + 1).padStart(2, "0")}${L[(h >>> 6) % L.length]}${A[(h >>> 10) % A.length]}`; };
// da una riga della lista disposizione (DG, codice, descrizione, locazione, listino, netto, venduto, ven. speciali, giacenza, ordini, FAB, regolarità, consumo, SMin, SMax, scad.) a una riga dell'export
function exportRows(A, cm) {
  const am = prevMonth(), C = cm || (c => c);
  return [G_HDR_X].concat(A.map(r => { const h = hcode(r[1]), g = r[8];
    return [am, "00999", xDG(r[0]), h % 7 === 0 ? "A" : "V", C(r[1]), r[2], FAM[h % FAM.length], null, null, r[4], r[5], g, g == null ? null : Math.round(g * r[5] * 100) / 100, r[6], r[10], r[11], r[12], r[13], r[14], GVS[(h >>> 5) % GVS.length], xLoc(r[3]), X_MERC[(h >>> 9) % X_MERC.length]]; }));
}
const hdrA = withStock => G_HDR_A.map((h, i) => (i === G_COL_GIAC && withStock ? h + monthEnd() : h));
function generateData(o) {
  const R = rng(o.seed), pick = a => a[Math.floor(R() * a.length)], ri = (a, b) => a + Math.floor(R() * (b - a + 1)), rf = (a, b) => a + R() * (b - a);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
  const poisson = l => { if (l <= 0) return 0; if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss())); let k = 0, p = 1; const L = Math.exp(-l); do { k++; p *= R(); } while (p > L); return k - 1; };
  const r2 = v => Math.round(v * 100) / 100;
  const used = new Set(), DGS = [];
  for (let n = 1; n < 40; n++) DGS.push("H" + String(n).padStart(3, "0")); for (let n = 1; n < 15; n++) DGS.push("A" + String(n).padStart(3, "0")); for (let n = 1; n < 10; n++) DGS.push("M" + String(n).padStart(3, "0"));
  // 8 cifre: tre casuali, il gruppo principale, quattro casuali
  const newCode = () => { for (;;) { const pt = pick(G_PARTS), c = String(ri(100, 999)) + pt[0] + String(ri(0, 9999)).padStart(4, "0"); if (!used.has(c)) { used.add(c); return [c, pt]; } } };
  const loc = () => R() < .08 ? null : R() < .15 ? `${pick("ABHJKM".split(""))}${ri(1, 9)}${pick("ABCDEFG".split(""))}${ri(1, 9)}` : `${pick("ABHJKM".split(""))}${String(ri(1, 30)).padStart(2, "0")}${pick("ABCDEF".split(""))}${ri(1, 6)}`;
  // profilo: quota di codici a scorta sotto SMin e sopra SMax, e quota di codici non a scorta con pezzi fermi, nel primo caricamento
  const prof = { equilibrato: [.25, .12, .2], alto: [.08, .35, .35], scarico: [.45, .04, .08] }[o.profile] || [.25, .12, .2];
  // moltiplicatori: qM per il consumo (e quindi scorte e regolarità), qG per le giacenze
  const qM = o.qM || 1, qG = o.qG || 1;
  const today = new Date(), ymd = d => +`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  // Fasce di costo: i ricambi economici si vendono di più, si tengono a scorta anche se vendono poco e si riordinano in lotti più grandi.
  //   costo        vendite   regolarità minima per la scorta   lotto (mesi di consumo tra SMin e SMax)
  const band = c => c < 20 ? { k: 2.5, thr: 1.6, lot: 3 } : c < 100 ? { k: 1.2, thr: 2.5, lot: 2 } : c < 500 ? { k: .7, thr: 3.3, lot: 1 } : { k: .4, thr: 4.3, lot: .5 };
  const A = [];
  for (let n = 0; n < o.nA; n++) {
    const [c, pt] = newCode(), listino = r2(rf(pt[2], pt[3])), costo = r2(listino * rf(.55, .62)), bd = band(costo);
    // consumo medio mensile: un quarto dei codici non vende da mesi; gli altri hanno vendite molto diverse (pochi codici vendono molto)
    const cons_mese = R() < .25 ? 0 : Math.max(.01, r2(Math.exp(Math.log(.25) + 1.25 * gauss()) * bd.k * qM));
    // indice di regolarità delle vendite (da 0 a 11,99): ogni mese si moltiplica per 0,9 e sale di 1,2 se il codice ha venduto,
    // quindi a regime vale circa 12 × quota dei mesi con almeno una vendita, cioè 12 × (1 − e^(−consumo)), un po' meno perché le vendite arrivano a gruppi.
    // Il consumo medio dimentica in fretta (×0,7 al mese), la regolarità lentamente: chi non vende da mesi ha consumo 0 ma regolarità ancora sopra zero.
    // A zero restano solo i codici mai venduti.
    const regolarita = Math.min(11.99, r2(cons_mese > 0 ? 12 * (1 - Math.exp(-cons_mese)) * rf(.8, 1) : R() < .9 ? rf(.05, 2.5) : 0));
    // scorta: solo i codici abbastanza regolari per la loro fascia di costo; SMin = un mese di consumo, SMax = SMin + il lotto di riordino
    const stock = cons_mese > 0 && regolarita >= bd.thr;
    const smin = stock ? Math.max(1, Math.round(cons_mese)) : 0;
    const smax = stock ? smin + Math.round(cons_mese * bd.lot) : 0;
    // venduto recente: pezzi venduti negli ultimi 12 mesi; per chi non vende da mesi, la data dell'ultima vendita
    const qv = cons_mese > 0 ? poisson(cons_mese * 12) : regolarita > 0 ? ymd(new Date(today.getFullYear(), today.getMonth() - ri(4, 30), ri(1, 28))) : 0;
    A.push({ dg: pick(DGS), code: c, desc: pt[1], loc: loc(), listino, costo, qv, vspc: R() < .97 ? 0 : ri(1, 2), ord: 0, fab: 0, regolarita, cons_mese, smin, smax, scad: R() < .94 ? "N" : "S" });
  }
  const giacOf = s => { const g = giac0(s) * qG, u = R(); return Math.floor(g + (qG === 1 ? 0 : u)); };   // arrotondamento casuale: in media la giacenza è proprio g
  const giac0 = s => {
    if (s.smax === 0) return R() < prof[2] ? ri(1, 3) : 0;   // non a scorta: di solito niente, a volte pezzi fermi
    const r = R();
    if (r < prof[0]) return ri(0, s.smin - 1);
    if (r < 1 - prof[1]) return ri(s.smin, s.smax);
    return s.smax + ri(1, Math.max(1, Math.round(s.smax * .8)));
  };
  const nInA = Math.min(o.nA, Math.round(o.nB * .955)), nExtra = Math.max(0, o.nB - nInA);
  const order = A.map((_, i) => i).sort((x, y) => (A[x].smax === 0) - (A[y].smax === 0) || R() - .5);   // i codici con scorta entrano per primi in giacenza
  const inB = new Set(order.slice(0, nInA));
  const B = new Map();
  A.forEach((s, i) => {
    if (!inB.has(i)) return;
    const g = giacOf(s);
    if (s.smax && g < s.smin && R() < .3) s.ord = s.smax - g;   // per alcuni codici sotto scorta il riordino è già partito
    s.fab = Math.max(0, s.smin - g - s.ord);
    B.set(s.code, [s.code, R() < .85 ? "V" : pick(["A", "S", "Z"]), s.desc, R() < .92 ? "R" : "Z", g, pick(G_GRP)]);
  });
  for (let k = 0; k < nExtra; k++) { const [c, pt] = newCode(); B.set(c, [c, "V", pt[1], "R", R() < .5 ? 0 : ri(1, 3), pick(G_GRP)]); }
  const weeks = [];
  // Giacenza riportata dalla lista (fine del mese precedente), ricavata all'indietro da quella di oggi, circa due settimane dopo:
  // i pezzi venduti nel frattempo (mezzo mese di consumo) c'erano ancora, mentre i riordini arrivati nel frattempo non c'erano.
  // Un codice a scorta riceve un lotto ogni «lot» mesi, quindi in mezzo mese lo riceve con probabilità 0,5 / lot: così arrivi e vendite
  // si compensano e il valore del magazzino resta più o meno lo stesso tra le due date.
  // Qualche codice che oggi non è nel file giacenze a fine mese aveva ancora dei pezzi: nel frattempo è andato esaurito.
  const listG = s => {
    const b = B.get(s.code), sold = poisson(s.cons_mese * .5);
    if (!b) return sold;
    const arr = s.smax && b[4] >= s.smin && !s.ord && R() < Math.min(1, .5 / band(s.costo).lot) ? Math.max(1, s.smax - s.smin) : 0;
    return Math.max(0, b[4] + sold - arr);
  };
  const snap = () => ({ A: A.map(s => [s.dg, s.code, s.desc, s.loc, s.listino, s.costo, s.qv, s.vspc, o.listStock === false ? null : listG(s), s.ord, s.fab, s.regolarita, s.cons_mese, s.smin, s.smax, s.scad]), B: [...B.values()].map(r => r.slice()) });
  weeks.push(snap());
  // da un caricamento all'altro passa circa una settimana: arrivano gli ordini, si vende secondo il consumo, si riordina chi scende sotto la SMin
  for (let w = 1; w < o.weeks; w++) {
    for (const s of A) {
      const g = B.get(s.code); if (!g) continue;
      if (s.ord && R() < .7) { g[4] += s.ord; s.ord = 0; }
      g[4] = Math.max(0, g[4] - poisson(s.cons_mese * 12 / 52));
      if (s.smax && g[4] + s.ord < s.smin && R() < .6) s.ord = s.smax - g[4];
      s.fab = Math.max(0, s.smin - g[4] - s.ord);
    }
    weeks.push(snap());
  }
  return weeks;
}
// Valori dell'ultimo caricamento generato: venduto annuo delle liste (consumo × 12 × costo) e valore delle giacenze al costo.
function measureData(weeks) {
  const w = weeks[weeks.length - 1], cost = new Map(w.A.map(x => [x[1], x[5]]));
  let mov = 0, stock = 0;
  for (const x of w.A) mov += (x[12] || 0) * 12 * x[5];
  for (const x of w.B) stock += (x[4] || 0) * (cost.get(x[0]) || 0);
  return { mov, stock };
}
// Genera i dati e, se indicati, avvicina venduto annuo e valore delle giacenze agli importi voluti.
function generateTarget(o) {
  const clamp = v => Math.min(1000, Math.max(.01, v));
  let qM = 1, qG = 1, weeks = generateData({ ...o, qM, qG }), m = measureData(weeks);
  for (let i = 0; o.mov > 0 && m.mov > 0 && i < 10 && Math.abs(m.mov / o.mov - 1) > .005; i++) { qM = clamp(qM * o.mov / m.mov); weeks = generateData({ ...o, qM, qG }); m = measureData(weeks); }
  for (let i = 0; o.stock > 0 && m.stock > 0 && i < 10 && Math.abs(m.stock / o.stock - 1) > .005; i++) { qG = clamp(qG * o.stock / m.stock); weeks = generateData({ ...o, qM, qG }); m = measureData(weeks); }
  return { weeks, ...m };
}
/* Tracciati del file giacenze di prova: stessi dati, colonne diverse, per provare il riconoscimento delle colonne.
   Le colonne in più (impegnato, in arrivo, costo…) hanno valori ricavati dal codice, sempre uguali per lo stesso codice. */
const TRACCIATI = [["std", "Standard (6 colonne)"], ["altro", "Altro gestionale: nomi e ordine diversi, colonne in più"], ["sigle", "Colonne con sigle (Q1, Q2, Q3): la piattaforma chiede conferma"], ["nohdr", "Solo dati, senza riga di intestazione"]];
function stockSheet(B, fmt) {
  const hc = c => { let x = 0; for (const ch of String(c)) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x; };
  const imp = x => (x % 5 === 0 ? 1 + x % 3 : 0), arr = x => (x % 7 === 0 ? 1 + x % 4 : 0), costo = x => Math.round((5 + (x % 40000) / 100) * 100) / 100;
  if (fmt === "nohdr") return B.map(r => [r[0], r[2], r[4]]);
  if (fmt === "altro") return [["SITUAZIONE DI MAGAZZINO"], ["Magazzino", "Ubicazione", "Denominazione", "Articolo", "UM", "Impegnato", "Esistenza", "In arrivo", "Costo medio", "Ultimo movimento"]]
    .concat(B.map(r => { const x = hc(r[0]); return ["01", `S${x % 40 + 1}-${(x >>> 6) % 9 + 1}`, r[2], r[0], "PZ", imp(x), r[4], arr(x), costo(x), 46000 + x % 300]; }));
  if (fmt === "sigle") return [["Mag", "Rif", "Testo", "Q1", "Q2", "Q3", "Val"]].concat(B.map(r => { const x = hc(r[0]); return ["01", r[0], r[2], imp(x), r[4], arr(x), costo(x)]; }));
  return [G_HDR_B].concat(B);
}
async function viewProva(main) {
  const P = state.prova || (state.prova = { nA: 15000, nB: 13000, mov: 0, stock: 0, weeks: 1, profile: "equilibrato", fmtA: "export", fmtB: "std", listStock: true, seed: Math.floor(Math.random() * 1e6) });
  main.innerHTML = `<div class="head"><div><h1>Dati di prova</h1><p class="sub">Genera liste movimentazione e giacenze fittizie, con la stessa struttura dei file reali, per provare la piattaforma senza usare dati veri. I file vengono creati sul tuo computer: nulla viene salvato sulla piattaforma.</p></div></div>
  <form class="panel" id="gf" novalidate>
    <div class="grid2">
      <label class="field" for="gna">Liste movimentazione: numero di codici<input type="text" id="gna" inputmode="numeric" value="${esc(fmtN(P.nA))}"></label>
      <label class="field" for="gmv">Liste movimentazione: volume in euro (venduto annuo al netto)<input type="text" id="gmv" inputmode="decimal" placeholder="automatico" value="${P.mov ? esc(fmtN(P.mov)) : ""}"></label>
      <label class="field" for="gnb">Giacenze: numero di codici<input type="text" id="gnb" inputmode="numeric" value="${esc(fmtN(P.nB))}"></label>
      <label class="field" for="gst">Giacenze: volume in euro (valore a magazzino al netto)<input type="text" id="gst" inputmode="decimal" placeholder="automatico" value="${P.stock ? esc(fmtN(P.stock)) : ""}"></label>
    </div>
    <div class="grid3">
      <label class="field" for="gpr">Situazione del magazzino<select id="gpr">${[["equilibrato", "Equilibrata"], ["alto", "Magazzino alto (molti eccessi)"], ["scarico", "Magazzino scarico (molti sotto scorta)"]].map(([v, l]) => `<option value="${v}"${v === P.profile ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="field" for="gw">Caricamenti<select id="gw">${[1, 2, 4, 6, 8].map(v => `<option value="${v}"${v === P.weeks ? " selected" : ""}>${v === 1 ? "1 (solo i dati più recenti)" : v + " successivi"}</option>`).join("")}</select></label>
      <label class="field" for="gseed">Seme (stessi numeri = stessi dati)<input type="text" id="gseed" inputmode="numeric" value="${P.seed}"></label>
    </div>
    <label class="field" for="gfa">Tracciato delle liste movimentazione<select id="gfa">${TRACCIATI_A.map(([v, l]) => `<option value="${v}"${v === (P.fmtA || "export") ? " selected" : ""}>${l}</option>`).join("")}</select></label>
    <label class="field" for="gfb">Tracciato del file giacenze<select id="gfb">${TRACCIATI.map(([v, l]) => `<option value="${v}"${v === (P.fmtB || "std") ? " selected" : ""}>${l}</option>`).join("")}</select></label>
    <label class="field" for="gls">Giacenze riportate nelle liste movimentazione<select id="gls"><option value="1"${P.listStock !== false ? " selected" : ""}>Sì, alla fine del mese scorso: il file giacenze è facoltativo</option><option value="0"${P.listStock === false ? " selected" : ""}>No, colonna vuota: il file giacenze è obbligatorio</option></select></label>
    <div class="row"><button class="btn primary" type="submit" id="gbtn">Genera e scarica</button><span class="small muted" id="gstat"></span></div>
  </form>
  <section class="panel rules"><h3>Come sono fatti i file</h3><ul>
    <li><b>Lista movimentazione</b>, due tracciati. «Export mensile»: come il file mensile reale, foglio «Export», intestazione sulla prima riga e 22 colonne da Annomese a Codice merceologico, codici nella forma dei ricambi (per esempio 5Q0819669 o 03N115562B, a volte normalizzati «N  9…»); Annomese è il mese scorso e la colonna Giacenza riporta le giacenze all'ultimo giorno di quel mese; non c'è la colonna degli ordini aperti. «Lista disposizione»: foglio «Liste Movimentazione», riga di titolo e 16 colonne da DG a Scad, con gli ordini aperti.</li>
    <li><b>Giacenze</b>: foglio «GIACENZA CROSS», con le 6 colonne da Stampanr.RC a GrpOmog.</li>
    <li><b>Giacenze riportate nelle liste</b>: la lista ha una colonna con la giacenza di ogni codice alla fine del mese scorso; il file giacenze è la situazione di oggi, circa due settimane dopo. Tra le due date si è venduto, per qualche codice è arrivato un riordino e qualche codice è andato esaurito e non compare più nel file giacenze. Puoi caricare solo la lista, e i calcoli usano le sue giacenze, oppure anche il file giacenze, che le sostituisce. Con la colonna vuota il file giacenze è obbligatorio.</li>
    <li><b>Tracciato del file giacenze</b>: gli stessi dati si possono avere in forme diverse, per provare che la piattaforma trova da sola codice e giacenza. «Altro gestionale» ha un titolo, colonne con altri nomi e in altro ordine, più impegnato, in arrivo, costo e data; «sigle» ha nomi che non dicono niente e tre colonne di quantità, quindi la prima volta la piattaforma chiede conferma e poi se ne ricorda; «solo dati» non ha intestazione.</li>
    <li><b>Volumi in euro</b> (facoltativi): il venduto annuo è consumo medio mensile × 12 × prezzo netto di tutti i codici delle liste; il valore a magazzino è giacenza × prezzo netto. La piattaforma adatta le quantità (consumi, SMin, SMax e giacenze) per avvicinarsi agli importi, senza cambiare i prezzi. Con più caricamenti, gli importi valgono per l'ultimo. Lasciati vuoti, i volumi escono da soli in base al numero di codici.</li>
    <li>Codici con il formato dei codici ricambio, circa 40 tipologie (filtri, freni, carrozzeria, elettrico…), prezzi di listino e netti. Circa il 4% dei codici a magazzino non compare nelle liste, come accade nella realtà.</li>
    <li><b>Numeri coerenti tra loro</b>: un quarto dei codici non vende da mesi, gli altri vendono in modo molto diverso, i ricambi economici più di quelli costosi. La regolarità segue il consumo (chi vende 0,3 pezzi al mese sta intorno a 3, chi ne vende 3 o più vicino a 12). Un codice è a scorta solo se la sua regolarità supera una soglia che cresce con il costo: 1,6 sotto 20 €, 2,5 fino a 100 €, 3,3 fino a 500 €, 4,3 oltre. SMin = un mese di consumo (almeno 1 pezzo); SMax = SMin + il lotto di riordino, di 3, 2, 1 o mezzo mese di consumo secondo la stessa fascia. «Venduto» è il numero di pezzi degli ultimi 12 mesi; per i codici che non vendono da mesi c'è la data dell'ultima vendita.</li>
    <li>Con più caricamenti, i dati evolvono da uno all'altro: vendite, arrivi degli ordini aperti, riordini e qualche revisione delle scorte. Così si vedono muoversi andamento, indicatori e confronti.</li>
    <li>Ricevi un unico file .zip con due Excel per ogni caricamento: liste movimentazione e giacenze. Caricali in «Nuovo ordine» o in «Carica dati»; con più caricamenti, uno alla volta e in ordine di numero.</li></ul></section>`;
  $("#gf").onsubmit = async e => {
    e.preventDefault();
    const n = v => Math.round(parseNum(v));
    P.nA = Math.min(60000, Math.max(100, n($("#gna").value))); P.nB = Math.min(60000, Math.max(50, n($("#gnb").value)));
    P.mov = Math.min(1e9, Math.max(0, n($("#gmv").value))); P.stock = Math.min(1e9, Math.max(0, n($("#gst").value)));
    P.weeks = +$("#gw").value; P.profile = $("#gpr").value; P.seed = n($("#gseed").value) || 1; P.fmtB = TRACCIATI.some(t => t[0] === $("#gfb").value) ? $("#gfb").value : "std"; P.listStock = $("#gls").value !== "0"; P.fmtA = $("#gfa").value === "lista" ? "lista" : "export";
    if (!window.JSZip) { toast("Il generatore non si è caricato: ricarica la pagina."); return; }
    const b = $("#gbtn"), st = $("#gstat"); b.disabled = true;
    try {
      st.textContent = "Genero i dati…"; await new Promise(r => setTimeout(r, 30));
      const G = generateTarget(P), weeks = G.weeks, zip = new window.JSZip(), cm = P.fmtA !== "lista" ? codeMapper(P.seed) : null;
      for (let w = 0; w < weeks.length; w++) {
        const tag = weeks.length > 1 ? `caricamento_${w + 1}` : "dati";
        st.textContent = `Preparo il caricamento ${w + 1} di ${weeks.length}…`; await new Promise(r => setTimeout(r, 30));
        const wa = XLSX.utils.book_new(), ex = P.fmtA !== "lista";
        const sa = XLSX.utils.aoa_to_sheet(ex ? exportRows(weeks[w].A, cm) : [["LISTA MOVIMENTAZIONE"], hdrA(P.listStock !== false)].concat(weeks[w].A));
        XLSX.utils.book_append_sheet(wa, sa, ex ? "Export" : "Liste Movimentazione");
        zip.file(`${tag}_1_lista_movimentazione.xlsx`, XLSX.write(wa, { bookType: "xlsx", type: "array" }));
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stockSheet(cm ? weeks[w].B.map(r => [cm(r[0])].concat(r.slice(1))) : weeks[w].B, P.fmtB)), P.fmtB === "std" ? "GIACENZA CROSS" : "Giacenze");
        zip.file(`${tag}_2_giacenze.xlsx`, XLSX.write(wb, { bookType: "xlsx", type: "array" }));
      }
      st.textContent = "Comprimo i file…";
      const blob = await zip.generateAsync({ type: "blob" }), url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = `dati_di_prova_${P.nA}_codici${P.weeks > 1 ? `_${P.weeks}_caricamenti` : ""}.zip`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      st.textContent = `Fatto: ${weeks.length * 2} file Excel in un unico .zip. ${weeks.length > 1 ? "Ultimo caricamento: venduto" : "Venduto"} annuo ${fmtE(G.mov)}, valore a magazzino ${fmtE(G.stock)}.`;
    } catch (x) { st.textContent = ""; toast("Generazione non riuscita: " + x.message); }
    finally { b.disabled = false; }
  };
}

/* ============ Amministrazione ============ */
async function viewAdmin(main) {
  main.innerHTML = `<div class="panel"><p class="muted">Caricamento…</p></div>`;
  const [dealers, users, uploads] = await Promise.all([api("GET", "/api/dealers"), api("GET", "/api/users"), api("GET", "/api/uploads")]);
  state.dealers = dealers.map(d => ({ id: d.id, name: d.name, code: d.code }));
  main.innerHTML = `<div class="head"><div><h1>Amministrazione</h1><p class="sub">Concessionarie, utenti e dati caricati. Ogni responsabile di magazzino vede e carica solo i dati della sua concessionaria.</p></div></div>
  <section class="grid2">
    <form class="panel" id="df"><h2>Nuova concessionaria</h2><div class="row">
      <label class="field" for="dn">Ragione sociale<input type="text" id="dn" required></label>
      <label class="field" for="dc">Codice (facoltativo)<input type="text" id="dc" maxlength="20"></label>
      <button class="btn primary" type="submit">Aggiungi</button></div></form>
    <form class="panel" id="uf"><h2>Nuovo utente</h2><div class="row">
      <label class="field" for="uu">Nome utente<input type="text" id="uu" autocapitalize="none" placeholder="es. mario.rossi" required></label>
      <label class="field" for="un">Nome e cognome<input type="text" id="un"></label>
      <label class="field" for="ur">Ruolo<select id="ur"><option value="dealer">Responsabile magazzino</option><option value="admin">Amministratore</option></select></label>
      <label class="field" for="ud">Concessionaria<select id="ud">${dealers.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select></label>
      <button class="btn primary" type="submit">Crea utente</button></div></form>
  </section>
  <section class="panel"><h2>Concessionarie</h2>${dealers.length ? `<div class="tablebox"><table><thead><tr><th>Concessionaria</th><th>Codice</th><th class="num">Caricamenti</th><th class="num">Utenti attivi</th><th></th></tr></thead><tbody>
    ${dealers.map(d => `<tr><td><b>${esc(d.name)}</b></td><td class="mono">${esc(d.code || "–")}</td><td class="num">${fmtN(d.n_weeks)}</td><td class="num">${fmtN(d.n_users)}</td><td><div class="row"><button class="btn sm" type="button" data-ed="${d.id}">Rinomina</button><button class="btn sm danger" type="button" data-wipe="${d.id}"${d.n_weeks ? "" : " disabled"}>Svuota dati</button><button class="btn sm danger" type="button" data-deld="${d.id}">Elimina</button></div></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Nessuna concessionaria.</p>`}</section>
  <section class="panel"><div class="bar"><div><h2>Caricamenti</h2><p class="small muted">Ogni riga è un caricamento di liste movimentazione e giacenze. I file Excel originali non vengono conservati: eliminando un caricamento si cancellano tutti i dati ricavati da quei file.</p></div>
      <div class="row"><select id="upd" aria-label="Filtra per concessionaria"><option value="">Tutte le concessionarie</option>${dealers.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select><button class="btn danger" type="button" id="updel" disabled>Elimina selezionate</button></div></div>
    <div id="uplist"></div></section>
  <section class="panel"><h2>Utenti</h2><div class="tablebox"><table><thead><tr><th>Utente</th><th>Nome</th><th>Ruolo</th><th>Concessionaria</th><th>Ultimo accesso</th><th>Stato</th><th></th></tr></thead><tbody>
    ${users.map(u => `<tr><td class="mono">${esc(u.username)}</td><td>${esc(u.full_name || "")}</td><td>${u.role === "admin" ? "Amministratore" : "Responsabile magazzino"}</td><td>${esc(u.dealer_name || "–")}</td>
      <td class="small">${u.last_login ? esc(new Date(u.last_login).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })) : "mai"}</td>
      <td>${u.active ? `<span class="pill ok">Attivo</span>` : `<span class="pill off">Disattivato</span>`}</td>
      <td><div class="row"><button class="btn sm" type="button" data-reset="${u.id}">Nuova password</button>${u.id !== state.me.user.id ? `<button class="btn sm" type="button" data-act="${u.id}" data-v="${u.active ? 0 : 1}">${u.active ? "Disattiva" : "Riattiva"}</button><button class="btn sm danger" type="button" data-delu="${u.id}" data-name="${esc(u.username)}">Elimina</button>` : ""}</div></td></tr>`).join("")}
  </tbody></table></div></section>`;
  const ur = $("#ur"), ud = $("#ud"); ur.onchange = () => { ud.disabled = ur.value === "admin"; };
  $("#df").onsubmit = async e => { e.preventDefault(); try { await api("POST", "/api/dealers", { name: $("#dn").value, code: $("#dc").value }); toast("Concessionaria aggiunta."); state.me = await api("GET", "/api/me"); state.dealers = state.me.dealers; route(); } catch (x) { if (!x.silent) toast(x.message); } };
  $("#uf").onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await api("POST", "/api/users", { username: $("#uu").value, full_name: $("#un").value, role: ur.value, dealer_id: +ud.value });
      infoBox("Utente creato", `<p>Comunica queste credenziali al responsabile. Al primo accesso dovrà scegliere una password sua. La password provvisoria non verrà più mostrata.</p><p class="small muted">Nome utente</p><div class="secret">${esc(r.username)}</div><p class="small muted">Password provvisoria</p><div class="secret">${esc(r.password)}</div><p class="small muted">Indirizzo: ${esc(location.origin)}</p>`);
      viewAdmin(main);
    } catch (x) { if (!x.silent) toast(x.message); }
  };
  $$("[data-reset]", main).forEach(b => b.onclick = async () => {
    if (!await confirmBox("Generare una nuova password?", "La password attuale smetterà di funzionare e l'utente verrà disconnesso.", "Genera")) return;
    try { const r = await api("POST", `/api/users/${b.dataset.reset}/reset`); infoBox("Nuova password provvisoria", `<p class="small muted">Utente</p><div class="secret">${esc(r.username)}</div><p class="small muted">Password provvisoria</p><div class="secret">${esc(r.password)}</div>`); } catch (x) { if (!x.silent) toast(x.message); }
  });
  $$("[data-act]", main).forEach(b => b.onclick = async () => { try { await api("POST", `/api/users/${b.dataset.act}/active`, { active: b.dataset.v === "1" }); viewAdmin(main); } catch (x) { if (!x.silent) toast(x.message); } });
  const sel = new Set();
  const renderUploads = () => {
    const f = +$("#upd").value || 0, list = uploads.filter(u => !f || u.dealer_id === f), host = $("#uplist");
    host.innerHTML = list.length ? `<div class="tablebox flagbox"><table><thead><tr><th><input type="checkbox" id="upall" aria-label="Seleziona tutte"></th><th>Concessionaria</th><th>Dati del</th><th>File caricati</th><th>Caricati da</th><th class="num">Codici</th></tr></thead><tbody>
      ${list.map(u => `<tr><td><input type="checkbox" data-up="${u.id}"${sel.has(u.id) ? " checked" : ""} aria-label="Seleziona"></td><td>${esc(u.dealer_name)}</td><td>${esc(snapLabel(u.week_date, u.uploaded_at))}</td>
        <td class="small">${esc(u.file_a || "–")}<br><span class="muted">${esc(u.file_b || stockShort(u))}</span></td><td class="small">${esc(u.uploaded_by_name || u.uploaded_by_user || "utente eliminato")}<br><span class="muted">${esc(new Date(u.uploaded_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }))}</span></td><td class="num">${fmtN(u.n_codes)}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">Nessun caricamento.</p>`;
    const upd = () => { $("#updel").disabled = !sel.size; $("#updel").textContent = sel.size ? `Elimina selezionate (${fmtN(sel.size)})` : "Elimina selezionate"; };
    $$("[data-up]", host).forEach(c => c.onchange = () => { const id = +c.dataset.up; if (c.checked) sel.add(id); else sel.delete(id); upd(); });
    if ($("#upall")) $("#upall").onchange = e => { list.forEach(u => e.target.checked ? sel.add(u.id) : sel.delete(u.id)); renderUploads(); };
    upd();
  };
  $("#upd").onchange = () => { sel.clear(); renderUploads(); };
  renderUploads();
  $("#updel").onclick = async () => {
    const n = sel.size; if (!n) return;
    if (!await confirmTyped("Eliminare i caricamenti selezionati?", `Verranno cancellati <b>${fmtN(n)}</b> caricamenti con tutti i codici, gli indicatori e lo storico ricavati da quei file. L'operazione non si può annullare.`, "ELIMINA")) return;
    try { const r = await api("POST", "/api/snapshots/delete", { ids: [...sel] }); toast(`${fmtN(r.n)} caricamenti eliminati.`); state.snapshots = []; viewAdmin(main); } catch (x) { if (!x.silent) toast(x.message); }
  };
  $$("[data-wipe]", main).forEach(b => b.onclick = async () => {
    const d = dealers.find(x => x.id === +b.dataset.wipe);
    const ok = await confirmTyped(`Svuotare i dati di ${d.name}?`, `Verranno cancellati tutti i <b>${fmtN(d.n_weeks)}</b> caricamenti e il relativo storico. Concessionaria e utenti restano. <label class="check" for="wflags"><input type="checkbox" id="wflags"> Cancella anche l'elenco dei codici su richiesta</label>`, d.name, () => $("#wflags") && $("#wflags").checked);
    if (!ok) return;
    try { const r = await api("DELETE", `/api/dealers/${d.id}/data${ok.extra ? "?flags=1" : ""}`); toast(`Cancellati ${fmtN(r.weeks)} caricamenti${r.flags ? ` e ${fmtN(r.flags)} codici su richiesta` : ""}.`); state.snapshots = []; viewAdmin(main); } catch (x) { if (!x.silent) toast(x.message); }
  });
  $$("[data-deld]", main).forEach(b => b.onclick = async () => {
    const d = dealers.find(x => x.id === +b.dataset.deld);
    if (!await confirmTyped(`Eliminare ${d.name}?`, `Verranno cancellati la concessionaria, i suoi <b>${fmtN(d.n_weeks)}</b> caricamenti con tutto lo storico, l'elenco dei codici su richiesta e i suoi <b>${fmtN(d.n_users)}</b> utenti responsabili. L'operazione non si può annullare.`, d.name)) return;
    try { const r = await api("DELETE", `/api/dealers/${d.id}`); toast(`Concessionaria eliminata${r.users ? ` con ${fmtN(r.users)} utenti` : ""}.`); if (state.dealerId === d.id) { state.dealerId = null; try { localStorage.removeItem("ig_dealer"); } catch (e) {} } state.snapshots = []; state.me = await api("GET", "/api/me"); state.dealers = state.me.dealers; route(); } catch (x) { if (!x.silent) toast(x.message); }
  });
  $$("[data-delu]", main).forEach(b => b.onclick = async () => {
    if (!await confirmBox("Eliminare l'utente?", `L'utente <b>${esc(b.dataset.name)}</b> verrà cancellato definitivamente e non potrà più accedere. I dati che ha caricato restano. Se vuoi solo bloccarlo temporaneamente, usa «Disattiva».`, "Elimina", true)) return;
    try { await api("DELETE", `/api/users/${b.dataset.delu}`); toast("Utente eliminato."); viewAdmin(main); } catch (x) { if (!x.silent) toast(x.message); }
  });
  $$("[data-ed]", main).forEach(b => b.onclick = () => {
    const d = dealers.find(x => x.id === +b.dataset.ed);
    const m = document.createElement("div"); m.className = "modal";
    m.innerHTML = `<form class="panel"><h3>Rinomina concessionaria</h3><label class="field" for="en">Ragione sociale<input type="text" id="en" value="${esc(d.name)}"></label><label class="field" for="ec">Codice<input type="text" id="ec" value="${esc(d.code || "")}"></label><div class="actions"><button class="btn" type="button" id="ex">Annulla</button><button class="btn primary" type="submit">Salva</button></div></form>`;
    document.body.appendChild(m); $("#en", m).focus(); $("#ex", m).onclick = () => m.remove();
    $("form", m).onsubmit = async e => { e.preventDefault(); try { await api("PATCH", `/api/dealers/${d.id}`, { name: $("#en", m).value, code: $("#ec", m).value }); m.remove(); state.me = await api("GET", "/api/me"); state.dealers = state.me.dealers; route(); } catch (x) { if (!x.silent) toast(x.message); } };
  });
}

boot();
})();
