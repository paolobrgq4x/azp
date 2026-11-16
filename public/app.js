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
function isoWeek(s) {
  const [y, m, d] = s.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, d));
  const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day + 3);
  const fy = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((dt - fy) / 864e5 - 3 + ((fy.getUTCDay() + 6) % 7)) / 7);
}
const weekLabel = s => `Settimana ${isoWeek(s)} · ${dIt(s)}`;
function mondayISO(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
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
  codice: "", upload: { A: [], B: [], week: mondayISO() }, kpiSnap: null, ordine: { snapId: null, mode: "budget", budget: 50000, fill: true, months: 1, level: "smin", keepMin: true, cap: 0, filters: { groups: [], abc: [], dg: [], q: "" }, result: null, history: [], meta: null }
};
const STATI = { sotto: "Sotto scorta", eccesso: "Eccesso", fermo: "Fermo", ok: "In linea", nostorico: "Senza storico" };
const isAdmin = () => state.me && state.me.user.role === "admin";
const dealerName = id => (state.dealers.find(d => d.id === id) || {}).name || "";

/* ============ Avvio e accesso ============ */
async function boot() {
  try { state.me = await api("GET", "/api/me"); }
  catch (e) { if (!e.silent) renderLogin(); return; }
  afterLogin();
}
function afterLogin() {
  if (state.me.user.must_change) return renderPassword(true);
  state.dealers = state.me.dealers;
  let saved = null; try { saved = +localStorage.getItem("ig_dealer") || null; } catch (e) {}
  state.dealerId = isAdmin() ? (state.dealers.some(d => d.id === saved) ? saved : null) : state.me.user.dealer_id;
  if (!location.hash) location.hash = isAdmin() ? "#rete" : "#nuovo";
  route();
}
function renderLogin(msg) {
  document.title = "Accedi · Incrocio Giacenze Ricambi";
  $("#root").innerHTML = `<div class="login"><form class="panel" id="lf" novalidate>
    <div><h1>Incrocio giacenze ricambi</h1><p class="muted small">Accesso riservato alla rete.</p></div>
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
  { id: "carica", label: "Carica settimana" },
  { id: "prova", label: "Dati di prova" },
  { id: "admin", label: "Amministrazione", admin: true }
];
function shell(view) {
  const u = state.me.user;
  const dsel = isAdmin()
    ? `<select id="dsel" aria-label="Concessionaria"><option value="">Scegli concessionaria…</option>${state.dealers.map(d => `<option value="${d.id}"${d.id === state.dealerId ? " selected" : ""}>${esc(d.name)}${d.code ? " · " + esc(d.code) : ""}</option>`).join("")}</select>`
    : `<span class="who">${esc(u.dealer_name || "")}</span>`;
  $("#root").innerHTML = `<header class="topbar"><div class="brand"><span class="dot"></span>Incrocio giacenze</div>${dsel}
    <span class="who">${esc(u.full_name || u.username)}</span><button class="link" type="button" id="pwd">Password</button><button class="link" type="button" id="out">Esci</button></header>
    <nav class="tabs" aria-label="Sezioni">${VIEWS.filter(v => !v.admin || isAdmin()).map(v => `<a href="#${v.id}"${v.id === view ? ' aria-current="page"' : ""}>${v.label}</a>`).join("")}</nav>
    <main id="main"></main>`;
  $("#out").onclick = logout; $("#pwd").onclick = () => renderPassword(false);
  if ($("#dsel")) $("#dsel").onchange = e => {
    state.dealerId = +e.target.value || null; state.analisi.snapId = null; state.snapshots = [];
    try { localStorage.setItem("ig_dealer", state.dealerId || ""); } catch (x) {}
    if (location.hash === "#rete" || location.hash === "#admin") location.hash = "#andamento"; else route();
  };
  document.title = (VIEWS.find(v => v.id === view) || {}).label + " · Incrocio Giacenze Ricambi";
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
  let view = (location.hash || "#").slice(1);
  if (!VIEWS.some(v => v.id === view) || (VIEWS.find(v => v.id === view).admin && !isAdmin())) view = isAdmin() ? "rete" : "nuovo";
  const main = shell(view);
  const fn = { rete: viewRete, nuovo: viewNuovo, andamento: viewAndamento, kpi: viewKpi, analisi: viewAnalisi, ordine: viewOrdine, codice: viewCodice, carica: viewCarica, prova: viewProva, admin: viewAdmin }[view];
  fn(main).catch(e => { if (!e.silent) main.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; });
}
window.addEventListener("hashchange", route);

/* ============ Procedura guidata: Nuovo ordine ============
 * 1 Obiettivo -> 2 Liste movimentazione -> 3 Giacenze -> 4 Codici -> 5 Risultato
 * Obiettivi:
 *  monitor : monitoraggio del potenziale d'ordine nell'orizzonte (sola lettura, con le settimane in cui servirà ordinare)
 *  plan    : pianificazione degli ordini per adeguare le giacenze all'orizzonte (copertura della domanda, almeno SMin), con conferma Sì/No
 *  target  : ordine di un importo fisso, a prescindere dall'incremento delle giacenze (nessun orizzonte), con conferma Sì/No
 */
const WSTEPS = ["Obiettivo", "Liste movimentazione", "Giacenze", "Codici", "Risultato"];
const ORIZZ = [[0.5, "2 settimane"], [1, "1 mese"], [2, "2 mesi"], [3, "3 mesi (trimestre)"], [6, "6 mesi"], [12, "12 mesi"]];
const OBIETTIVI = {
  monitor: { t: "Monitoraggio potenziale ordini", d: "Vedo quanto e quando servirà ordinare nell'orizzonte scelto, senza impegni: nessuna conferma riga per riga." },
  plan: { t: "Pianificazione ordini per adeguare le giacenze", d: "Preparo gli ordini che coprono la domanda dell'orizzonte, tenendo almeno la SMin. Confermo ogni riga con Sì o No." },
  target: { t: "Ordine di un importo, a prescindere dalle giacenze", d: "Devo ordinare una cifra precisa anche se il magazzino è coperto: prima i bisogni veri, poi il resto in proporzione alla movimentazione." }
};
const W = { step: 1, snapId: null, codesMode: "all", codes: [], lookup: null, listName: "", groups: [], abc: [],
  purpose: "plan", months: 1, budget: 50000, maxCover: 0, includeNoParams: false, minDemand: 0, listOverride: true };
const orizzLabel = m => (ORIZZ.find(o => o[0] === m) || [0, fmtN(m, 1) + " mesi"])[1];
async function viewNuovo(main) {
  if (needDealer(main)) return;
  if (!state.snapshots.length) await loadSnapshots();
  if (W.dealer !== state.dealerId) { Object.assign(W, { step: 1, snapId: null, codes: [], lookup: null, codesMode: "all", groups: [], abc: [] }); W.dealer = state.dealerId; state.ordine.history = []; }
  main.innerHTML = `<div class="head"><div><h1>Nuovo ordine</h1><p class="sub">${esc(dealerName(state.dealerId))}. Scegli l'obiettivo, carica i dati della settimana, scegli i codici e ottieni il risultato.</p></div></div>
    <ol class="stepper" aria-label="Avanzamento">${WSTEPS.map((t, k) => `<li class="${k + 1 < W.step ? "done" : k + 1 === W.step ? "cur" : ""}"${k + 1 === W.step ? ' aria-current="step"' : ""}><span class="sn">${k + 1 < W.step ? "✓" : k + 1}</span><span class="st">${t}</span></li>`).join("")}</ol>
    ${W.step > 1 ? `<p class="small muted wgoal">Obiettivo: <b>${esc(OBIETTIVI[W.purpose].t)}</b>${W.purpose === "target" ? ` · ${esc(fmtE(W.budget))}` : ` · orizzonte ${esc(orizzLabel(W.months))}`} <button class="link" type="button" id="wchg">cambia</button></p>` : ""}
    <div id="wbody"></div>`;
  if ($("#wchg")) $("#wchg").onclick = () => wGo(main, 1);
  ({ 1: wStep1, 2: wStep2, 3: wStep3, 4: wStep4, 5: wStep5 })[W.step]($("#wbody"), main);
}
const wGo = (main, n) => { W.step = n; viewNuovo(main); window.scrollTo(0, 0); };

function wStep1(body, main) {
  const card = (id, inner) => `<label class="choice big${W.purpose === id ? " on" : ""}" for="pp_${id}"><input type="radio" name="pp" id="pp_${id}" value="${id}"${W.purpose === id ? " checked" : ""}><span><b>${OBIETTIVI[id].t}</b><span class="small muted">${OBIETTIVI[id].d}</span><span class="pin">${inner}</span></span></label>`;
  const hor = id => `<label class="small muted" for="hm_${id}">Orizzonte</label><select id="hm_${id}" data-hor aria-label="Orizzonte temporale">${ORIZZ.map(([v, l]) => `<option value="${v}"${v === W.months ? " selected" : ""}>${l}</option>`).join("")}</select>`;
  body.innerHTML = `<section class="panel"><span class="num mono small muted">PASSO 1 DI 5</span><h2>Qual è l'obiettivo?</h2>
    <div class="choices">
      ${card("monitor", hor("monitor"))}
      ${card("plan", hor("plan"))}
      ${card("target", `<input type="text" id="pt" inputmode="decimal" aria-label="Importo da ordinare in euro" value="${esc(fmtN(W.budget))}"><span class="small muted">€</span>`)}
    </div>
    <div class="row" id="pextra"></div></section>
    <div class="wnav"><span></span><button class="btn primary" type="button" id="wnext">Avanti: liste movimentazione</button></div>`;
  const extra = () => {
    $$(".choice", body).forEach(l => l.classList.toggle("on", $("input", l).checked));
    $("#pextra").innerHTML = W.purpose === "target"
      ? `<label class="field" for="pmc">Copertura massima per codice (facoltativa)<select id="pmc">${[[0, "nessun limite: raggiungi l'importo"], [6, "6 mesi"], [9, "9 mesi"], [12, "12 mesi"], [18, "18 mesi"], [24, "24 mesi"]].map(([v, l]) => `<option value="${v}"${v === (W.maxCover || 0) ? " selected" : ""}>${l}</option>`).join("")}</select></label>
         <p class="small muted">Questo obiettivo non usa un orizzonte: l'importo viene raggiunto comunque, in proporzione alla movimentazione dei codici.</p>`
      : `<p class="small muted">${W.purpose === "monitor" ? "Il risultato mostra il potenziale d'ordine e in quale settimana servirà ordinare ogni codice." : "Il risultato propone le quantità da ordinare per coprire l'orizzonte, da confermare riga per riga, con la spalmatura settimanale."}</p>`;
  };
  $$("input[name=pp]", body).forEach(r => r.onchange = () => { W.purpose = r.value; extra(); });
  $$("[data-hor]", body).forEach(s => { s.onchange = () => { W.months = +s.value; $$("[data-hor]", body).forEach(x => { x.value = s.value; }); }; s.addEventListener("focus", () => { const r = $("#pp_" + s.id.slice(3)); if (!r.checked) { r.checked = true; W.purpose = r.value; extra(); } }); });
  $("#pt").addEventListener("focus", () => { const r = $("#pp_target"); if (!r.checked) { r.checked = true; W.purpose = "target"; extra(); } });
  extra();
  $("#wnext").onclick = () => {
    if (W.purpose === "target") { W.budget = parseNum($("#pt").value); if ($("#pmc")) W.maxCover = +$("#pmc").value; if (!(W.budget > 0)) { toast("Indica un importo maggiore di zero."); return; } }
    W.result = null; wGo(main, 2);
  };
}
function wStep2(body, main) {
  const U = state.upload, cur = mondayISO(), last = state.snapshots[state.snapshots.length - 1];
  const already = last && last.week_date >= cur;
  body.innerHTML = `${last ? `<div class="msg${already ? "" : " old"}">${already ? `I dati della ${esc(weekLabel(last.week_date))} sono già stati caricati` : `L'ultima settimana caricata è la ${esc(weekLabel(last.week_date))}, caricata`}${last.uploaded_by_name ? ` da ${esc(last.uploaded_by_name)}` : ""} il ${esc(new Date(last.uploaded_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }))}.${already ? "" : " Per un risultato aggiornato conviene caricare i dati di questa settimana."}
      <div class="row wrow"><button class="btn ${already ? "primary" : ""} sm" type="button" id="wuse">Usa questi dati e scegli i codici</button><span class="small muted">oppure carica i file qui sotto</span></div></div>` : ""}
    <section class="step" id="stepA"><span class="num">PASSO 2 DI 5</span><h2>Carica le liste movimentazione</h2>
      <p class="meta">Lista con codice, movimentazione, SMin, SMax, ordini aperti e prezzi. Se è divisa in più file, aggiungili tutti: vengono uniti.</p>
      <label class="field wk" for="wk">Settimana di riferimento<input type="date" id="wk" value="${U.week}"></label><p class="meta" id="wkl"></p>
      <div id="listA"></div>
      <div class="row"><label class="btn" for="fileA">Scegli i file Excel</label><input type="file" id="fileA" accept=".xlsx,.xls,.xlsm,.csv" multiple></div>
      <div class="msg err" id="uerr" hidden></div>
    </section>
    <div class="wnav"><button class="btn" type="button" id="wback">Indietro</button><button class="btn primary" type="button" id="wnext">Avanti: giacenze</button></div>`;
  const wk = $("#wk"), upd = () => { const v = wk.value; if (v) { const [y, m, d] = v.split("-").map(Number); U.week = mondayISO(new Date(y, m - 1, d)); $("#wkl").textContent = weekLabel(U.week) + " (lunedì)"; } };
  wk.onchange = upd; upd();
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
  const U = state.upload;
  body.innerHTML = `<section class="step" id="stepB"><span class="num">PASSO 3 DI 5</span><h2>Carica le giacenze attuali</h2>
      <p class="meta">Fotografia del magazzino con codice e quantità disponibile. Con più file, le quantità dello stesso codice si sommano.</p>
      <p class="meta">Liste movimentazione: <b>${esc(U.A.map(s => s.wb.name).join(", "))}</b> · ${esc(weekLabel(U.week))}</p>
      <div id="listB"></div>
      <div class="row"><label class="btn" for="fileB">Scegli i file Excel</label><input type="file" id="fileB" accept=".xlsx,.xls,.xlsm,.csv" multiple></div>
      <div class="msg err" id="uerr" hidden></div>
    </section>
    <div class="wnav"><button class="btn" type="button" id="wback">Indietro</button><div class="row"><span class="small muted" id="sstat"></span><button class="btn primary" type="button" id="save">Incrocia e salva la settimana</button></div></div>`;
  wireSlot("B"); renderSlot("B"); updateSave();
  $("#wback").onclick = () => wGo(main, 2);
  $("#save").onclick = () => save(false, r => { W.snapId = r.id; W.lookup = null; wGo(main, 4); });
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
      <p class="small muted">Dati della ${esc(weekLabel(snap.week_date))}: ${fmtN(snap.n_codes)} codici.</p>
      <div class="choices">${opt("all", "Tutti i codici", "La piattaforma valuta l'intero magazzino.")}${opt("manual", "Li scrivo io", "Inserisci i codici uno alla volta o incollane un elenco.")}${opt("excel", "Li carico da un Excel", "Un file con una colonna di codici.")}</div>
      <div id="cbox"></div>
      <details class="filters"${W.groups.length || W.abc.length ? " open" : ""}><summary>Restringi ancora (facoltativo)</summary><div class="fgrid">
        <div><p class="flabel">Gruppo principale <span class="muted">(4ª cifra del codice)</span></p><div class="chips">${meta.groups.map(g => `<button type="button" class="chip" data-g="${g.id}" aria-pressed="${W.groups.includes(g.id)}">${esc((g.id === "X" ? "–" : g.id) + " " + g.label)}<span class="n">${fmtN(g.n)}</span></button>`).join("")}</div></div>
        <div><p class="flabel">Classe ABC sul consumo</p><div class="chips">${[["A", "A · 80% del consumo"], ["B", "B · 15%"], ["C", "C · 5%"]].map(([k, l]) => `<button type="button" class="chip" data-abc="${k}" aria-pressed="${W.abc.includes(k)}">${l}<span class="n">${fmtN(meta.abc[k])}</span></button>`).join("")}</div></div>
      </div></details>
      <details class="filters"><summary>Codici su richiesta</summary><div class="fgrid">
        <label class="check" for="pnp"><input type="checkbox" id="pnp"${W.includeNoParams ? "" : " checked"}> Escludi i codici non tenuti a scorta (SMin e SMax a zero)</label>
        <label class="field" for="pmd">Escludi i codici con consumo medio inferiore a (pezzi al mese)<input type="text" id="pmd" inputmode="decimal" placeholder="nessuna soglia" value="${W.minDemand ? esc(fmtN(W.minDemand, 2)) : ""}"></label>
        <label class="check" for="pov"><input type="checkbox" id="pov"${W.listOverride ? " checked" : ""}> Per i codici che scelgo io, calcola anche quelli su richiesta o senza SMin/SMax</label>
        <p class="small muted">I codici segnati come su richiesta sono sempre esclusi, salvo l'opzione qui sopra per i codici scelti.</p></div></details>
    </section>
    <div class="wnav"><button class="btn" type="button" id="wback">Indietro</button><button class="btn primary" type="button" id="wnext">${W.purpose === "monitor" ? "Mostra il potenziale" : "Calcola l'ordine"}</button></div>`;
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
    host.innerHTML = `<div class="bar"><p class="small"><b>${fmtN(W.codes.length)}</b> codici scelti · ${fmtN(L.rows.length)} trovati nella settimana${L.missing.length ? ` · <span class="miss">${fmtN(L.missing.length)} non trovati</span>` : ""}</p><button class="link" type="button" id="cclear">Svuota</button></div>
      <div class="tablebox flagbox"><table><thead><tr><th>Codice</th><th>Descrizione</th><th>Stato</th><th class="num">Giacenza</th><th class="num">Ord. aperti</th><th class="num">SMin</th><th class="num">SMax</th><th class="num">Consumo/mese</th><th></th></tr></thead><tbody>
      ${L.rows.slice(0, 300).map(r => `<tr><td class="code">${esc(r.code)}</td><td class="desc">${esc(r.descr)}</td><td><span class="pill ${r.status}">${STATI[r.status]}</span>${r.ondemand ? ` <span class="pill off">su richiesta</span>` : ""}</td><td class="num">${fmtN(r.giac)}</td><td class="num">${fmtN(r.ord)}</td><td class="num">${fmtN(r.smin)}</td><td class="num">${fmtN(r.smax)}</td><td class="num">${r.cons_mese ? fmtN(r.cons_mese, 2) : "–"}</td><td><button class="link" type="button" data-rmc="${esc(r.code)}">Togli</button></td></tr>`).join("")}
      ${L.missing.slice(0, 100).map(c => `<tr><td class="code">${esc(c)}</td><td colspan="7" class="miss small">Non presente nei dati di questa settimana</td><td><button class="link" type="button" data-rmc="${esc(c)}">Togli</button></td></tr>`).join("")}
      </tbody></table></div>${L.rows.length > 300 ? `<p class="small muted">A video i primi 300 codici trovati.</p>` : ""}`;
    $("#cclear").onclick = async () => { W.codes = []; W.listName = ""; await wLookup(); renderList(); };
    $$("[data-rmc]", host).forEach(b => b.onclick = () => { const c = b.dataset.rmc; W.codes = W.codes.filter(x => x !== c); L.rows = L.rows.filter(r => r.code !== c); L.missing = L.missing.filter(x => x !== c); renderList(); });
  };
  $$("input[name=cm]", body).forEach(r => r.onchange = () => { W.codesMode = r.value; renderBox(); });
  if (W.codes.length && !W.lookup) await wLookup();
  renderBox();
  $("#wback").onclick = () => wGo(main, 2);
  $("#wnext").onclick = () => {
    if (W.codesMode !== "all" && !(W.lookup && W.lookup.rows.length)) { toast("Indica almeno un codice presente nei dati della settimana, oppure scegli «Tutti i codici»."); return; }
    W.includeNoParams = !$("#pnp").checked; W.minDemand = parseNum($("#pmd").value); W.listOverride = $("#pov").checked;
    W.result = null; wGo(main, 5);
  };
}
async function wCompute() {
  const codes = W.codesMode === "all" ? [] : W.lookup.rows.map(r => r.code);
  const mode = W.purpose === "target" ? "target" : "cover";
  const P = { mode, budget: mode === "target" ? W.budget : 0, cap: 0, months: W.months, keepMin: true, fill: true, maxCover: W.maxCover || 0,
    includeNoParams: W.includeNoParams, minDemand: W.minDemand, listOverride: W.listOverride, filters: { groups: [...W.groups], abc: [...W.abc], dg: [], q: "", codes } };
  const r = await api("POST", `/api/snapshots/${W.snapId}/scenario`, P);
  const scope = [codes.length ? `${fmtN(codes.length)} codici scelti` : "", W.groups.length ? "gruppi " + W.groups.join(", ") : "", W.abc.length ? "classe " + W.abc.join("/") : ""].filter(Boolean).join(" · ");
  r.title = `${OBIETTIVI[W.purpose].t}${W.purpose === "target" ? ` · ${fmtE(W.budget)}` : ` · orizzonte ${orizzLabel(W.months)}`}${scope ? " · " + scope : ""}`;
  r.view = W.purpose;
  r.horizonWeeks = W.purpose === "target" ? null : Math.max(2, Math.round(W.months * 4.33));
  const O = state.ordine;
  O.result = r; O.show = 100; O.history = [{ title: r.title, s: r.summary, r }].concat((O.history || []).filter(h => h.title !== r.title)).slice(0, 8);
}
async function wStep5(body, main) {
  body.innerHTML = `<div class="panel"><p class="muted">Calcolo in corso…</p></div>`;
  await wCompute();
  body.innerHTML = `<div class="wnav top"><span class="num mono small muted">PASSO 5 DI 5 · RISULTATO</span><div class="row">
      <button class="btn sm" type="button" id="wgoal">Cambia obiettivo</button><button class="btn sm" type="button" id="wcodes">Cambia codici</button><button class="btn sm" type="button" id="wnew">Ricomincia</button></div></div>
    <div id="wres"></div><div id="whist"></div>`;
  const recalc = async () => { await wCompute(); renderProposal("#wres", recalc); renderHistory("#whist", "#wres", recalc); };
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
  main.innerHTML = `<div class="head"><div><h1>La tua rete</h1><p class="sub">Ultima settimana caricata da ogni concessionaria, con la variazione rispetto alla precedente.</p></div></div><div class="panel"><p class="muted">Caricamento…</p></div>`;
  const rows = await api("GET", "/api/overview");
  const loaded = rows.filter(r => r.snap_id);
  const tot = k => loaded.reduce((t, r) => t + (r[k] || 0), 0);
  main.innerHTML = `<div class="head"><div><h1>La tua rete</h1><p class="sub">Ultima settimana caricata da ogni concessionaria, con la variazione rispetto alla precedente.</p></div></div>
  <section class="tiles">
    <div class="tile neutral"><span class="k">Concessionarie con dati</span><span class="v">${fmtN(loaded.length)}<span class="small muted"> / ${fmtN(rows.length)}</span></span><span class="s">Valore a magazzino ${fmtE(tot("val_tot"))}</span></div>
    <div class="tile bad"><span class="k">Da riordinare</span><span class="v">${fmtEk(tot("val_sotto"))}</span><span class="s">${fmtN(tot("n_sotto"))} codici sotto scorta</span></div>
    <div class="tile warn"><span class="k">Eccedenze</span><span class="v">${fmtEk(tot("val_eccesso"))}</span><span class="s">${fmtN(tot("n_eccesso"))} codici sopra SMax</span></div>
    <div class="tile idle"><span class="k">Fermo senza fabbisogno</span><span class="v">${fmtEk(tot("val_fermo"))}</span><span class="s">${fmtN(tot("n_fermo"))} codici</span></div>
  </section>
  <section class="panel"><h2>Concessionarie</h2>
  ${rows.length ? `<div class="tablebox"><table><thead><tr><th>Concessionaria</th><th>Ultima settimana</th><th class="num">Settimane</th><th class="num">Valore magazzino</th><th class="num">Da riordinare</th><th class="num">Eccedenze</th><th></th><th class="num">Fermo</th><th></th></tr></thead><tbody>
  ${rows.map(r => `<tr class="click" data-d="${r.id}"><td><b>${esc(r.name)}</b>${r.code ? ` <span class="muted mono small">${esc(r.code)}</span>` : ""}</td>
    <td>${r.week_date ? esc(weekLabel(r.week_date)) : `<span class="pill off">Nessun caricamento</span>`}</td><td class="num">${fmtN(r.n_weeks)}</td>
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
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.title)}, ${pts.length} settimane">
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
    main.innerHTML = `<div class="head"><div><h1>${esc(name)}</h1><p class="sub">Nessuna settimana caricata.</p></div></div>
      <div class="panel"><p>Carica la prima settimana per vedere l'andamento: storico movimentazione e giacenza attuale.</p><div><a class="btn primary" href="#carica">Carica settimana</a></div></div>`;
    return;
  }
  const L = snaps[snaps.length - 1], P = snaps.length > 1 ? snaps[snaps.length - 2] : null;
  const pv = k => P ? P[k] : null;
  main.innerHTML = `<div class="head"><div><h1>${esc(name)}</h1><p class="sub">${esc(weekLabel(L.week_date))} · ${fmtN(snaps.length)} settimane in archivio</p></div>
    <div class="row"><a class="btn" href="#analisi">Analizza i codici</a><a class="btn primary" href="#carica">Carica settimana</a></div></div>
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
  <section class="panel"><h2>Settimane caricate</h2><div class="tablebox"><table><thead><tr><th>Settimana</th><th>Caricata da</th><th class="num">Codici</th><th class="num">Valore magazzino</th><th class="num">Sotto scorta</th><th class="num">Eccedenze</th><th class="num">Fermo</th><th></th></tr></thead><tbody>
  ${snaps.slice().reverse().map(s => `<tr><td>${esc(weekLabel(s.week_date))}</td><td class="small">${esc(s.uploaded_by_name || s.uploaded_by_user || "–")}<br><span class="muted">${esc(new Date(s.uploaded_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }))}</span></td>
    <td class="num">${fmtN(s.n_codes)}</td><td class="num">${fmtE(s.val_tot)}</td><td class="num">${fmtN(s.n_sotto)} · ${fmtE(s.val_sotto)}</td><td class="num">${fmtE(s.val_eccesso)}</td><td class="num">${fmtE(s.val_fermo)}</td>
    <td><div class="row"><button class="btn sm" type="button" data-open="${s.id}">Apri</button>${isAdmin() ? `<button class="btn sm danger" type="button" data-del="${s.id}" data-w="${s.week_date}">Elimina</button>` : ""}</div></td></tr>`).join("")}
  </tbody></table></div></section>`;
  const pts = k => snaps.map(s => ({ y: s[k] || 0, label: dShort(s.week_date), full: weekLabel(s.week_date) }));
  const cs = getComputedStyle(document.documentElement);
  const col = v => cs.getPropertyValue(v).trim();
  lineChart($("#c1"), pts("val_tot"), { title: "Valore a magazzino", color: col("--accent"), fmt: fmtE, axis: axisE });
  lineChart($("#c2"), pts("val_sotto"), { title: "Valore da riordinare (sotto scorta)", color: col("--bad"), fmt: fmtE, axis: axisE });
  lineChart($("#c3"), pts("val_eccesso"), { title: "Valore eccedenze", color: col("--warn"), fmt: fmtE, axis: axisE });
  lineChart($("#c4"), pts("val_fermo"), { title: "Valore fermo senza fabbisogno", color: col("--idle"), fmt: fmtE, axis: axisE });
  $$("[data-open]", main).forEach(b => b.onclick = () => { state.analisi = { ...state.analisi, snapId: +b.dataset.open, offset: 0, f: "tutti" }; location.hash = "#analisi"; });
  $$("[data-del]", main).forEach(b => b.onclick = async () => {
    if (!await confirmBox("Eliminare la settimana?", `Verranno cancellati tutti i dati della ${esc(weekLabel(b.dataset.w))} per ${esc(name)}. L'operazione non si può annullare.`, "Elimina", true)) return;
    try { await api("DELETE", "/api/snapshots/" + b.dataset.del); toast("Settimana eliminata."); if (state.analisi.snapId === +b.dataset.del) state.analisi.snapId = null; route(); } catch (e) { if (!e.silent) toast(e.message); }
  });
}

/* ============ Analisi codici ============ */
const FILTRI = [
  ["tutti", "Tutti"], ["sotto", "Sotto scorta"], ["eccesso", "Eccesso"], ["fermo", "Fermo"],
  ["nogiac", "Non in giacenza"], ["nostorico", "Senza storico"], ["ok", "In linea"]
];
const FILTRI2 = [["nuovi", "Nuovi problemi questa settimana"], ["cronici", "Eccesso o fermo da 4+ settimane"]];
const FILTRI3 = [["ondemand", "Su richiesta"]];
const ACOLS = [
  ["status", "Stato"], ["code", "Codice"], ["descr", "Descrizione"], ["loc", "Locaz."], ["giac", "Giacenza", 1], ["var", "Var. sett.", 1],
  ["ord", "Ord. aperti", 1], ["smin", "SMin", 1], ["smax", "SMax", 1], ["delta", "Da ordinare / Eccedenza", 1],
  ["streak", "Settimane nello stato", 1], ["cost", "Costo unit.", 1], ["val_giac", "Valore giacenza", 1], ["val_action", "Valore azione", 1]
];
async function viewAnalisi(main) {
  if (needDealer(main)) return;
  main.innerHTML = `<div class="panel"><p class="muted">Caricamento…</p></div>`;
  const snaps = state.snapshots.length ? state.snapshots : await loadSnapshots();
  if (!snaps.length) { main.innerHTML = `<div class="panel"><h2>Nessuna settimana caricata</h2><p class="muted">Carica storico e giacenza per iniziare.</p><div><a class="btn primary" href="#carica">Carica settimana</a></div></div>`; return; }
  const A = state.analisi;
  if (!snaps.some(s => s.id === A.snapId)) { A.snapId = snaps[snaps.length - 1].id; A.offset = 0; }
  main.innerHTML = `<div class="head"><div><h1>Analisi codici</h1><p class="sub">${esc(dealerName(state.dealerId))}</p></div>
    <label class="field" for="wsel">Settimana<select id="wsel">${snaps.slice().reverse().map(s => `<option value="${s.id}"${s.id === A.snapId ? " selected" : ""}>${esc(weekLabel(s.week_date))}</option>`).join("")}</select></label></div>
  <section class="panel">
    <div class="bar"><div class="chips" id="chips" role="group" aria-label="Filtra per stato"></div>
      <div class="row"><input type="search" id="q" placeholder="Cerca codice o descrizione" aria-label="Cerca codice o descrizione" value="${esc(A.q)}"><button class="btn" type="button" id="xls">Scarica Excel</button></div></div>
    <div class="chips" id="chips2" role="group" aria-label="Filtri sull'evoluzione"></div>
    <div class="tablebox"><table id="tbl"><thead></thead><tbody><tr><td class="empty">Caricamento…</td></tr></tbody></table></div>
    <div class="pager" id="pager"></div>
  </section>
  <section class="panel rules"><h3>Come viene classificato ogni codice</h3><ul>
    <li><b>Disponibile</b> = giacenza + ordini aperti. <b>Sotto scorta</b>: disponibile sotto SMin; quantità suggerita = SMax − disponibile.</li>
    <li><b>Eccesso</b>: giacenza sopra SMax; eccedenza = giacenza − SMax, valorizzata al costo. <b>Fermo</b>: giacenza con SMin e SMax a zero.</li>
    <li><b>Settimane nello stato</b>: per quante settimane consecutive il codice è rimasto nello stesso stato. <b>Var. sett.</b>: variazione della giacenza rispetto alla settimana caricata prima.</li>
    <li><b>Non in giacenza</b>: codice dello storico assente nel file giacenze. <b>Senza storico</b>: codice a magazzino che non compare nello storico.</li></ul></section>`;
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
  const c = data.counts;
  $("#chips").innerHTML = FILTRI.map(([k, l]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${A.f === k}">${l}<span class="n">${fmtN(c[k])}</span></button>`).join("");
  const od = FILTRI3.map(([k, l]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${A.f === k}">${l}<span class="n">${fmtN(c[k])}</span></button>`).join("");
  $("#chips2").innerHTML = od + (data.prev_week ? FILTRI2.map(([k, l]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${A.f === k}">${l}<span class="n">${fmtN(c[k])}</span></button>`).join("") + `<span class="small muted">Confronto con la ${esc(weekLabel(data.prev_week))}</span>` : `<span class="small muted">Prima settimana in archivio: i confronti compariranno dalla prossima.</span>`);
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
      <td class="num">${fmtN(r.giac)}</td><td class="num">${data.prev_week ? v : "–"}</td><td class="num">${fmtN(r.ord)}</td><td class="num">${fmtN(r.smin)}</td><td class="num">${fmtN(r.smax)}</td>
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
      "Stato": STATI[r.status], "Codice": r.code, "Descrizione": r.descr, "Locazione": r.loc, "DG": r.dg, "Giacenza": r.giac,
      "Giacenza sett. prec.": r.prev_giac, "Ordini aperti": r.ord, "SMin": r.smin, "SMax": r.smax, "Da ordinare (+) / Eccedenza (-)": r.delta,
      "Settimane nello stato": r.streak, "Costo unitario": r.cost, "Valore giacenza": Math.round(r.val_giac * 100) / 100, "Valore azione": Math.round(r.val_action * 100) / 100,
      "Presente in giacenza": r.in_b ? "Sì" : "No"
    }));
    if (!rows.length) { toast("Nessuna riga da esportare."); return; }
    const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(k => ({ wch: Math.max(10, k.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, "Incrocio");
    const dn = dealerName(state.dealerId).replace(/[^\w\-]+/g, "_");
    XLSX.writeFile(wb, `incrocio_${dn}_${snap ? snap.week_date : ""}_${A.f}.xlsx`);
  } catch (e) { if (!e.silent) toast(e.message); }
  finally { b.disabled = false; b.textContent = "Scarica Excel"; }
}

/* ============ Selettore settimana condiviso ============ */
function weekSelect(id, snaps, cur) {
  return `<label class="field" for="${id}">Settimana<select id="${id}">${snaps.slice().reverse().map(s => `<option value="${s.id}"${s.id === cur ? " selected" : ""}>${esc(weekLabel(s.week_date))}</option>`).join("")}</select></label>`;
}
function noWeeks(main) { main.innerHTML = `<div class="panel"><h2>Nessuna settimana caricata</h2><p class="muted">Carica storico e giacenza per iniziare.</p><div><a class="btn primary" href="#carica">Carica settimana</a></div></div>`; }

/* ============ Scenari d'ordine ============ */
const GROUPS = { "0": "Accessori e vernici", "1": "Motore", "2": "Alimentazione e scarico", "3": "Cambio", "4": "Assale anteriore e sterzo",
  "5": "Assale posteriore", "6": "Ruote e freni", "7": "Leve e pedali", "8": "Carrozzeria e clima", "9": "Impianto elettrico", "X": "Altri codici" };
const MESI = [[0.5, "2 settimane"], [1, "1 mese"], [2, "2 mesi"], [3, "3 mesi (trimestre)"], [6, "6 mesi"]];
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
  const parts = [];
  if (P.mode === "budget") parts.push(`Budget ${fmtE(P.budget)}${P.fill ? "" : " (solo fino a SMin)"}`);
  if (P.mode === "cover") parts.push(`Copertura ${(MESI.find(m => m[0] === P.months) || [0, fmtN(P.months, 1) + " mesi"])[1]}${P.cap ? ", tetto " + fmtE(P.cap) : ""}`);
  if (P.mode === "level") parts.push(`Riporto a ${P.level === "smax" ? "SMax" : "SMin"}${P.cap ? ", tetto " + fmtE(P.cap) : ""}`);
  if (P.mode === "target") parts.push(`Obiettivo d'acquisto ${fmtE(P.budget)}${P.maxCover ? ` (copertura max ${fmtN(P.maxCover)} mesi)` : ""}`);
  const F = P.filters;
  if (F.groups.length) parts.push(F.groups.map(g => `gruppo ${g === "X" ? "altri" : g} ${GROUPS[g]}`).join(", "));
  if (F.abc.length) parts.push("classe " + F.abc.map(c => c === "N" ? "senza consumo" : c).join("/"));
  if (F.dg.length) parts.push("DG " + F.dg.join(", "));
  if (F.q) parts.push(`«${F.q}»`);
  if (F.codes && F.codes.length) parts.push(`elenco di ${fmtN(F.codes.length)} codici`);
  if (P.includeNoParams) parts.push("inclusi codici senza SMin/SMax");
  if (P.minDemand) parts.push(`consumo ≥ ${fmtN(P.minDemand, 2)} pz/mese`);
  return parts.join(" · ");
}
async function viewOrdine(main) {
  if (needDealer(main)) return;
  const snaps = state.snapshots.length ? state.snapshots : await loadSnapshots();
  if (!snaps.length) return noWeeks(main);
  const O = state.ordine;
  O.mode = O.mode || "budget"; O.months = O.months || 1; O.level = O.level || "smin"; O.filters = O.filters || { groups: [], abc: [], dg: [], q: "" }; O.filters.codes = O.filters.codes || []; O.listOverride = O.listOverride !== false;
  O.history = O.history || []; O.keepMin = O.keepMin !== false; O.cap = O.cap || 0; O.includeNoParams = !!O.includeNoParams; O.minDemand = O.minDemand || 0; O.maxCover = O.maxCover || 0;
  if (!snaps.some(s => s.id === O.snapId)) { O.snapId = snaps[snaps.length - 1].id; O.result = null; O.meta = null; O.history = []; }
  if (!O.meta || O.metaSnap !== O.snapId) { O.meta = await api("GET", `/api/snapshots/${O.snapId}/filters`); O.metaSnap = O.snapId; }
  O.flags = await api("GET", `/api/dealers/${state.dealerId}/flags`);
  const M = O.meta, F = O.filters;
  const chip = (attr, id, label, on, n) => `<button type="button" class="chip" ${attr}="${esc(id)}" aria-pressed="${on}">${esc(label)}${n != null ? `<span class="n">${fmtN(n)}</span>` : ""}</button>`;
  main.innerHTML = `<div class="head"><div><h1>Scenari d'ordine</h1><p class="sub">${esc(dealerName(state.dealerId))}. Scegli come vuoi ordinare, restringi i codici con i filtri e confronta gli scenari.</p></div>${weekSelect("ow", snaps, O.snapId)}</div>
  <form class="panel" id="of" novalidate>
    <div class="chips seg" role="group" aria-label="Tipo di scenario">
      ${chip("data-mode", "budget", "Spendo un budget", O.mode === "budget")}${chip("data-mode", "cover", "Copro N mesi di domanda", O.mode === "cover")}${chip("data-mode", "level", "Riporto a scorta", O.mode === "level")}${chip("data-mode", "target", "Raggiungo un obiettivo d'acquisto", O.mode === "target")}</div>
    <div class="row" id="params"></div>
    <details class="filters"${F.codes.length ? " open" : ""}><summary>Solo i codici di un elenco${F.codes.length ? ` (${fmtN(F.codes.length)} codici)` : ""}</summary>
      <div class="fgrid">
        <p class="small muted">Scrivi o incolla i codici, oppure carica un Excel: la piattaforma fa i calcoli solo su quelli. Gli altri filtri restano validi.</p>
        <label class="field" for="lpaste">Codici (uno per riga, oppure separati da spazio, virgola o punto e virgola)<textarea id="lpaste" rows="4" placeholder="AAA000111B&#10;AAA000222">${esc(F.codes.join("\n"))}</textarea></label>
        <div class="row"><label class="btn sm" for="lfile">Carica Excel con i codici</label><input type="file" id="lfile" accept=".xlsx,.xls,.xlsm,.csv"><button class="link" type="button" id="lclear">Svuota elenco</button><span class="small muted" id="linfo">${F.codes.length ? `${fmtN(F.codes.length)} codici${O.listName ? " da " + esc(O.listName) : ""}` : ""}</span></div>
        <label class="check" for="lover"><input type="checkbox" id="lover"${O.listOverride ? " checked" : ""}> Calcola anche i codici dell'elenco segnati su richiesta o senza SMin/SMax</label>
      </div></details>
    <details class="filters"${F.groups.length || F.abc.length || F.dg.length || F.q ? " open" : ""}><summary>Filtri sui codici${F.groups.length + F.abc.length + F.dg.length + (F.q ? 1 : 0) ? ` (${F.groups.length + F.abc.length + F.dg.length + (F.q ? 1 : 0)} attivi)` : ""}</summary>
      <div class="fgrid">
        <div><p class="flabel">Gruppo principale <span class="muted">(4ª cifra del codice)</span></p><div class="chips">${M.groups.map(g => chip("data-g", g.id, `${g.id === "X" ? "–" : g.id} ${g.label}`, F.groups.includes(g.id), g.n)).join("")}</div></div>
        <div><p class="flabel">Classe ABC sul consumo</p><div class="chips">${[["A", "A · 80% del consumo"], ["B", "B · 15%"], ["C", "C · 5%"], ["N", "Senza consumo"]].map(([k, l]) => chip("data-abc", k, l, F.abc.includes(k), M.abc[k])).join("")}</div></div>
        ${M.dg.length ? `<div><p class="flabel">DG</p><div class="chips dgbox">${M.dg.map(d => chip("data-dg", d.id, d.id, F.dg.includes(d.id), d.n)).join("")}</div></div>` : ""}
        <label class="field" for="fq">Tipologia o codice contiene<input type="search" id="fq" value="${esc(F.q)}" placeholder="es. FILTRO, PASTIGLIE, 5G0"></label>
        <div><button class="link" type="button" id="fclear">Togli tutti i filtri</button></div>
      </div></details>
    <details class="filters"><summary>Codici su richiesta: esclusioni (${fmtN(O.flags.length)} segnati a mano)</summary>
      <div class="fgrid">
        <label class="check" for="onp"><input type="checkbox" id="onp"${O.includeNoParams ? "" : " checked"}> Escludi i codici non tenuti a scorta (SMin e SMax a zero)</label>
        <label class="field" for="omd">Escludi i codici con consumo medio inferiore a (pezzi al mese, facoltativo)<input type="text" id="omd" inputmode="decimal" placeholder="nessuna soglia" value="${O.minDemand ? esc(fmtN(O.minDemand, 2)) : ""}"></label>
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
    <li><b>Spendo un budget</b>: prima i codici a zero con fabbisogno, poi quelli sotto SMin portati a SMin; con quello che avanza, se scegli l'opzione, fino a SMax. Si ferma al budget.</li>
    <li><b>Copro N mesi di domanda</b>: per ogni codice con domanda, ordina quanto serve per coprire il periodo (consumo medio mensile × mesi), tenendo almeno la SMin se scegli l'opzione. Qui si possono riordinare anche codici sopra SMax, se la loro domanda lo giustifica.</li>
    <li><b>Riporto a scorta</b>: riporta tutti i codici filtrati a SMin oppure a SMax.</li>
    <li><b>Raggiungo un obiettivo d'acquisto</b>: per quando bisogna ordinare un importo anche a magazzino coperto. Prima i bisogni veri (a zero, sotto SMin, fino a SMax), poi il resto in anticipo sui codici che ruotano di più, portandoli tutti alla stessa copertura in mesi: le quantità restano proporzionali alla movimentazione, quindi un codice venduto una volta l'anno riceve al più un pezzo, e solo quando la copertura sale abbastanza. L'importo viene raggiunto anche se il magazzino è già alto; la copertura massima è facoltativa.</li>
    <li><b>Codici su richiesta</b>: sono esclusi quelli segnati a mano dal responsabile, quelli non tenuti a scorta (SMin e SMax a zero) e, se imposti una soglia, quelli con consumo medio troppo basso. Nella copertura la domanda del periodo è arrotondata al pezzo più vicino: sotto mezzo pezzo atteso non si ordina, salvo che serva per arrivare alla SMin.</li>
    <li>Quando c'è un tetto di spesa, l'ordine di priorità è sempre: codici a zero, sotto SMin, poi gli altri; a parità vincono domanda più alta rispetto al costo e persistenza sotto scorta. Fermi e codici senza storico sono sempre esclusi.</li>
    <li>La <b>domanda</b> è il consumo medio mensile in pezzi della lista movimentazione. L'indice di regolarità delle vendite (da 0 a 12) è mostrato accanto al consumo come informazione: non entra nelle quantità.</li></ul></section>`;
  const renderParams = () => {
    const p = $("#params");
    if (O.mode === "budget") p.innerHTML = `<label class="field" for="ob">Budget in euro<input type="text" id="ob" inputmode="decimal" value="${esc(fmtN(O.budget))}"></label>
      <div class="chips">${[10000, 25000, 50000, 100000].map(v => `<button class="chip" type="button" data-b="${v}">${fmtE(v)}</button>`).join("")}</div>
      <label class="check" for="ofill"><input type="checkbox" id="ofill"${O.fill ? " checked" : ""}> Se avanza budget, porta i codici fino alla SMax</label>`;
    else if (O.mode === "cover") p.innerHTML = `<label class="field" for="om">Periodo da coprire<select id="om">${MESI.map(([v, l]) => `<option value="${v}"${v === O.months ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="check" for="okeep"><input type="checkbox" id="okeep"${O.keepMin ? " checked" : ""}> Tieni almeno la SMin</label>
      <label class="field" for="ocap">Tetto di spesa (facoltativo)<input type="text" id="ocap" inputmode="decimal" placeholder="nessuno" value="${O.cap ? esc(fmtN(O.cap)) : ""}"></label>`;
    else if (O.mode === "target") p.innerHTML = `<label class="field" for="ob">Importo da ordinare in euro<input type="text" id="ob" inputmode="decimal" value="${esc(fmtN(O.budget))}"></label>
      <label class="field" for="omc">Copertura massima per codice (facoltativa)<select id="omc">${[[0, "nessun limite: raggiungi l'importo"], [6, "6 mesi"], [9, "9 mesi"], [12, "12 mesi"], [18, "18 mesi"], [24, "24 mesi"]].map(([v, l]) => `<option value="${v}"${v === O.maxCover ? " selected" : ""}>${l}</option>`).join("")}</select></label>`;
    else p.innerHTML = `<label class="field" for="olv">Livello da raggiungere<select id="olv"><option value="smin"${O.level === "smin" ? " selected" : ""}>SMin</option><option value="smax"${O.level === "smax" ? " selected" : ""}>SMax</option></select></label>
      <label class="field" for="ocap">Tetto di spesa (facoltativo)<input type="text" id="ocap" inputmode="decimal" placeholder="nessuno" value="${O.cap ? esc(fmtN(O.cap)) : ""}"></label>`;
    $$("[data-b]", p).forEach(b => b.onclick = () => { $("#ob").value = fmtN(+b.dataset.b); $("#of").requestSubmit(); });
  };
  const readParams = () => {
    if ($("#ob")) O.budget = parseNum($("#ob").value);
    if ($("#ofill")) O.fill = $("#ofill").checked;
    if ($("#om")) O.months = +$("#om").value;
    if ($("#okeep")) O.keepMin = $("#okeep").checked;
    if ($("#olv")) O.level = $("#olv").value;
    if ($("#ocap")) O.cap = parseNum($("#ocap").value);
    if ($("#omc")) O.maxCover = +$("#omc").value;
    F.q = $("#fq").value.trim();
    O.includeNoParams = !$("#onp").checked; O.minDemand = parseNum($("#omd").value);
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
    e.preventDefault(); readParams();
    if ((O.mode === "budget" || O.mode === "target") && !(O.budget > 0)) { toast("Indica un importo maggiore di zero."); return; }
    const P = { mode: O.mode, budget: O.mode === "budget" || O.mode === "target" ? O.budget : O.cap, maxCover: O.maxCover, cap: O.cap, months: O.months, level: O.level, fill: O.fill, keepMin: O.keepMin,
      includeNoParams: O.includeNoParams, minDemand: O.minDemand, listOverride: O.listOverride,
      filters: { groups: [...F.groups], abc: [...F.abc], dg: [...F.dg], q: F.q, codes: [...F.codes] } };
    $("#ores").innerHTML = `<div class="panel"><p class="muted">Calcolo in corso…</p></div>`;
    try {
      const r = await api("POST", `/api/snapshots/${O.snapId}/scenario`, P);
      r.title = describeScenario({ ...P, budget: O.budget });
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
  </tbody></table></div><p class="small muted">Gli scenari restano qui finché non cambi settimana o ricarichi la pagina.</p></section>`;
  $$("[data-h]", host).forEach(b => b.onclick = () => { state.ordine.result = H[+b.dataset.h].r; renderProposal(resSel, recalc); renderHistory(sel, resSel, recalc); $(resSel).scrollIntoView({ behavior: "smooth", block: "start" }); });
}
/* ============ Spalmatura settimanale ============
 * Per ogni riga: la parte urgente (per tornare a SMin) arriva nella prima settimana;
 * poi si simula la giacenza che scende con la domanda settimanale (consumo medio mensile × 12 / 52) e,
 * nelle settimane in cui si può consegnare, si fa arrivare quanto serve per non scendere
 * sotto la SMin fino alla consegna successiva. Ciò che non serve entro l'orizzonte resta "non necessario per ora".
 */
function phaseLines(lines, weeks, freq) {
  return lines.map(l => {
    const sched = new Array(weeks).fill(0), d = (l.cons_mese || 0) * 12 / 52, disp = l.giac + l.ord;
    if (!(d > 0)) { sched[0] = l.qty; return { l, sched, later: 0 }; }
    const urgent = Math.min(l.qty, Math.max(0, Math.ceil(l.smin - disp)));
    let rest = l.qty - urgent, s = disp + urgent; sched[0] = urgent;
    const floor = l.smin > 0 ? l.smin : 0;
    for (let w = 0; w < weeks; w++) {
      if (rest > 0 && w % freq === 0) {
        const projected = s - d * Math.min(freq, weeks - w);
        if (projected < floor) { const q = Math.min(rest, Math.ceil(floor - projected - 1e-9)); if (q > 0) { sched[w] += q; s += q; rest -= q; } }
      }
      s -= d;
    }
    return { l, sched, later: rest };
  });
}
function weekDates(base, n) {
  const [y, m, d] = base.split("-").map(Number);
  return Array.from({ length: n }, (_, k) => { const dt = new Date(Date.UTC(y, m - 1, d + 7 * (k + 1))); return dt.toISOString().slice(0, 10); });
}
function renderPhase(host, R) {
  const O = state.ordine, S = R.summary;
  if (!O.phase || O.phase.key !== R) O.phase = { key: R, weeks: R.horizonWeeks ? Math.min(52, R.horizonWeeks) : S.mode === "cover" ? Math.min(26, Math.max(2, Math.round(S.months * 4.33))) : 4, freq: 1 };
  const P = O.phase, ph = phaseLines(R.lines, P.weeks, P.freq), dates = weekDates(R.week, P.weeks);
  const totQ = dates.map((_, w) => ph.reduce((t, x) => t + x.sched[w], 0));
  const totV = dates.map((_, w) => ph.reduce((t, x) => t + x.sched[w] * x.l.cost, 0));
  const laterQ = ph.reduce((t, x) => t + x.later, 0), laterV = ph.reduce((t, x) => t + x.later * x.l.cost, 0), nLater = ph.filter(x => x.later > 0).length;
  const lab = s => `Sett. ${isoWeek(s)} · ${dShort(s)}`;
  host.innerHTML = `<div class="bar"><div><h2>Spalmatura settimanale</h2><p class="small muted">Quando ordinare ogni pezzo perché arrivi quando serve, seguendo la domanda settimanale.</p></div>
      <div class="row"><label class="field" for="phw">Orizzonte<select id="phw">${[...new Set([2, 4, 6, 8, 13, 26, 52, P.weeks])].sort((a, b) => a - b).map(n => `<option value="${n}"${n === P.weeks ? " selected" : ""}>${n} settimane${n === 13 ? " (trimestre)" : ""}</option>`).join("")}</select></label>
      <label class="field" for="phf">Consegne<select id="phf"><option value="1"${P.freq === 1 ? " selected" : ""}>ogni settimana</option><option value="2"${P.freq === 2 ? " selected" : ""}>ogni 2 settimane</option><option value="4"${P.freq === 4 ? " selected" : ""}>ogni 4 settimane</option></select></label></div></div>
    <div class="grid2"><div><h3 class="small muted">Valore da ordinare per settimana</h3><div id="phbars"></div></div>
      <div class="msg">${laterQ ? (S.mode === "target" ? `<b>${fmtN(laterQ)} pezzi</b> (${fmtE(laterV)}) su ${fmtN(nLater)} codici coprono domanda <b>oltre ${fmtN(P.weeks)} settimane</b>: sono l'anticipo per l'obiettivo, da ordinare entro la scadenza; arriveranno a magazzino prima di servire.` : `<b>${fmtN(laterQ)} pezzi</b> (${fmtE(laterV)}) su ${fmtN(nLater)} codici <b>non servono entro ${fmtN(P.weeks)} settimane</b> con la domanda attuale: puoi rimandarli o allungare l'orizzonte.`) : `Tutti i pezzi dell'ordine servono entro ${fmtN(P.weeks)} settimane.`}
        <br><span class="small">La prima settimana contiene la parte urgente, cioè quanto serve per tornare alla SMin. I codici senza domanda registrata vanno tutti nella prima settimana.</span></div></div>
    <div class="tablebox"><table><thead><tr><th>Codice</th><th>Descrizione</th><th class="num">Totale</th>${dates.map(s => `<th class="num">${esc(lab(s))}</th>`).join("")}<th class="num">${R.summary.mode === "target" ? "Anticipo obiettivo" : "Non necessario per ora"}</th></tr></thead><tbody>
      ${ph.slice(0, O.show || 100).map(x => `<tr><td class="code">${esc(x.l.code)}</td><td class="desc">${esc(x.l.descr)}</td><td class="num"><b>${fmtN(x.l.qty)}</b></td>${x.sched.map(q => `<td class="num${q ? "" : " muted"}">${q ? fmtN(q) : "·"}</td>`).join("")}<td class="num">${x.later ? fmtN(x.later) : "–"}</td></tr>`).join("")}
      <tr class="tot"><td colspan="2"><b>Totale pezzi</b></td><td class="num"><b>${fmtN(S.pieces)}</b></td>${totQ.map(q => `<td class="num"><b>${fmtN(q)}</b></td>`).join("")}<td class="num"><b>${fmtN(laterQ)}</b></td></tr>
      <tr class="tot"><td colspan="2"><b>Totale valore</b></td><td class="num"><b>${fmtE(S.spent)}</b></td>${totV.map(v => `<td class="num">${fmtE(v)}</td>`).join("")}<td class="num">${fmtE(laterV)}</td></tr>
    </tbody></table></div>${R.lines.length > (O.show || 100) ? `<p class="small muted">A video le prime ${fmtN(O.show || 100)} righe; i totali e il file Excel comprendono tutte le righe.</p>` : ""}`;
  bars($("#phbars", host), dates.map((s, w) => ({ label: lab(s), value: totV[w], sub: `${fmtN(totQ[w])} pezzi` })).concat(laterQ ? [{ label: "Non necessario per ora", value: laterV, sub: `${fmtN(laterQ)} pezzi`, color: "var(--gray)" }] : []), { fmt: fmtE });
  $("#phw", host).onchange = e => { P.weeks = +e.target.value; renderPhase(host, R); };
  $("#phf", host).onchange = e => { P.freq = +e.target.value; renderPhase(host, R); };
  return { ph, dates, lab };
}

function renderProposal(sel = "#ores", recalc) {
  const R = state.ordine.result, S = R.summary, host = $(sel); if (!host) return;
  const pct = (a, b) => b ? Math.round(a / b * 100) + "%" : "–";
  const capped = S.budget != null && S.spent + 0.01 < S.need;
  host.innerHTML = `<div class="scen-title"><h2>${esc(R.title)}</h2></div>
  <section class="tiles">
    <div class="tile"><span class="k">${R.view === "monitor" ? "Potenziale d'ordine" : "Valore dell'ordine"}</span><span class="v">${fmtE(S.spent)}</span><span class="s">${S.budget != null ? `su ${fmtE(S.budget)} · ${S.mode === "target" ? "restano" : "avanzano"} ${fmtE(S.left)}` : S.mode === "cover" ? `per coprire ${esc((MESI.find(m => m[0] === S.months) || ORIZZ.find(m => m[0] === S.months) || [0, fmtN(S.months, 1) + " mesi"])[1])} di domanda` : "senza tetto di spesa"}</span></div>
    <div class="tile neutral"><span class="k">Righe d'ordine</span><span class="v">${fmtN(S.n_lines)}</span><span class="s">${fmtN(S.pieces)} pezzi · ${fmtN(S.n_cands)} codici nel perimetro</span></div>
    <div class="tile bad"><span class="k">Codici a zero coperti</span><span class="v">${fmtN(S.zero_cov)}<span class="small muted"> / ${fmtN(S.zero_tot)}</span></span><span class="s">${pct(S.zero_cov, S.zero_tot)} riportati almeno a SMin</span></div>
    <div class="tile warn"><span class="k">Sotto scorta coperti</span><span class="v">${fmtN(S.sotto_cov)}<span class="small muted"> / ${fmtN(S.sotto_tot)}</span></span><span class="s">${pct(S.sotto_cov, S.sotto_tot)} riportati almeno a SMin</span></div>
  </section>
  ${S.list ? `<div class="msg">Elenco di ${fmtN(S.list.n)} codici: ${fmtN(S.list.found)} trovati nella settimana, ${fmtN(S.list.n_missing)} non trovati${S.list.no_need ? `, ${fmtN(S.list.no_need)} già coperti o senza fabbisogno` : ""}.${S.list.n_missing ? `<br><span class="small">Non trovati: <span class="mono">${S.list.missing.map(esc).join(", ")}${S.list.n_missing > S.list.missing.length ? "…" : ""}</span></span>` : ""}</div>` : ""}
  ${S.excluded && (S.excluded.flag + S.excluded.noparams + S.excluded.low) ? `<div class="msg">Esclusi come su richiesta: ${[S.excluded.flag ? `${fmtN(S.excluded.flag)} segnati a mano` : "", S.excluded.noparams ? `${fmtN(S.excluded.noparams)} con domanda ma senza SMin/SMax` : "", S.excluded.low ? `${fmtN(S.excluded.low)} sotto la soglia di consumo` : ""].filter(Boolean).join(", ")}.</div>` : ""}
  ${S.target ? `<div class="msg ${S.target.capped ? "err" : ""}">${S.target.n ? `<b>${fmtE(S.target.value)}</b> su ${fmtN(S.target.n)} codici sono <b>acquisti in anticipo per l'obiettivo</b>: i codici con domanda sono stati portati tutti a circa <b>${fmtN(S.target.level, 1)} mesi</b> di copertura, in proporzione a quanto si vendono.` : (S.left < Math.max(1, (S.budget || 0) * 0.01) ? `Tutto l'importo è servito per i bisogni veri (codici a zero e sotto scorta): non è rimasto nulla da distribuire in anticipo.` : `Nessun acquisto in anticipo possibile con i codici e i limiti scelti.`)}
    ${S.target.capped ? (S.target.max_cover ? `<br>Senza superare ${fmtN(S.target.max_cover)} mesi di copertura restano da spendere <b>${fmtE(S.target.unspent)}</b>: togli o alza la copertura massima, oppure allarga i codici.` : `<br>Non ci sono abbastanza codici con domanda per spendere tutto: restano <b>${fmtE(S.target.unspent)}</b>. Allarga i codici o i filtri.`) : ""}</div>` : ""}
  ${capped && S.mode !== "target" ? `<div class="msg">Lo scenario completo, senza tetto, varrebbe <b>${fmtE(S.need)}</b>: il budget ne copre il ${pct(S.spent, S.need)}.</div>` : ""}
  ${S.by_group.length > 1 ? `<section class="panel"><h3>Valore dell'ordine per gruppo principale</h3><div id="obg"></div></section>` : ""}
  ${R.lines.length ? `<section class="panel" id="odec"></section>${R.view === "target" ? "" : `<section class="panel" id="phase"></section>`}` : `<section class="panel"><p class="muted">Nessun codice da ordinare in questo scenario.</p></section>`}`;
  if ($("#phase", host)) renderPhase($("#phase", host), R);
  if ($("#obg", host)) bars($("#obg", host), S.by_group.map(g => ({ label: `${g.id === "X" ? "–" : g.id} ${g.label}`, value: g.value, sub: `${fmtN(g.n)} righe` })), { fmt: fmtE });
  if ($("#odec", host)) renderDecision($("#odec", host), R, recalc);
}

/* ============ Tabella di conferma: Sì / No per riga ============ */
const covTxt = v => v == null ? "–" : fmtN(v, 1);
function decKey(R) { return `ig_dec_${state.dealerId}_${R.week}_${R.title}`; }
function lineAlerts(l, th) {
  const a = [];
  if (!(l.cons_mese > 0)) a.push("Nessuna domanda registrata: copertura non calcolabile");
  else if (Math.round(l.cover_after * 10) / 10 > th) a.push(`Copertura dopo l'ordine ${fmtN(l.cover_after, 1)} mesi (oltre ${fmtN(th)})`);
  return a;
}
function moveCells(l) {
  const v = l.prev_giac == null ? null : l.giac - l.prev_giac;
  return `<td class="num">${l.qty_sold != null ? fmtN(l.qty_sold) : "–"}${l.ven_spc ? `<span class="sub">spec. ${fmtN(l.ven_spc)}</span>` : ""}</td>
        <td class="num">${l.last_sale ? esc(dIt(l.last_sale)) : "–"}</td>
        <td class="num">${l.cons_mese ? fmtN(l.cons_mese, 2) : "–"}${l.regolarita ? `<span class="sub">regolarità ${fmtN(l.regolarita, 1)}</span>` : ""}</td>
        <td class="num">${v == null ? "–" : v === 0 ? "=" : (v > 0 ? "+" : "") + fmtN(v)}${l.prev_giac != null ? `<span class="sub">prima ${fmtN(l.prev_giac)}</span>` : ""}</td>`;
}
const MOVE_TH = `<th class="num" title="Quantità venduta di recente indicata nella lista movimentazione">Venduto recente</th><th class="num" title="Data dell'ultima vendita indicata nella lista movimentazione">Ultima vendita</th><th class="num" title="Consumo medio mensile in pezzi indicato nella lista movimentazione. Sotto: indice di regolarità delle vendite, da 0 a 12">Consumo/mese</th><th class="num" title="Variazione della giacenza rispetto alla settimana caricata prima">Var. giacenza</th>`;
/* Blocca le prime due colonne a sinistra e quelle da «Proposta» in poi a destra.
   Se lo schermo è troppo stretto per entrambi i blocchi, a destra resta bloccata solo l'ultima colonna. */
let freezeActive = null;
function freezeTable(t) {
  if (!t) return;
  const ths = [...t.tHead.rows[0].cells], box = t.parentElement;
  const start = ths.findIndex(th => th.hasAttribute("data-fzstart"));
  const apply = () => {
    if (!t.isConnected) return;
    const rows = [...t.rows];
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
function renderDecision(host, R, recalc) {
  const O = state.ordine, ro = R.view === "monitor";
  O.alertMonths = O.alertMonths || 3;
  if (!R.dec) { R.dec = {}; try { const sv = localStorage.getItem(decKey(R)); if (sv) R.dec = JSON.parse(sv) || {}; } catch (e) {} }
  const saveDec = () => { try { localStorage.setItem(decKey(R), JSON.stringify(R.dec)); } catch (e) {} };
  R.decFilter = R.decFilter || "tutte"; R.decShow = R.decShow || 100;
  const th = O.alertMonths;
  let when = null;
  if (ro) {
    const wk = R.horizonWeeks || 4, ph = phaseLines(R.lines, wk, 1), dates = weekDates(R.week, wk);
    when = new Map(ph.map(x => { const k = x.sched.findIndex(q => q > 0); return [x.l.code, k < 0 ? null : { k, d: dates[k] }]; }));
  }
  const rows = R.lines.map(l => ({ l, al: lineAlerts(l, th), d: ro ? "si" : (R.dec[l.code] || ""), w: when ? when.get(l.code) : null }));
  const cnt = { tutte: rows.length, alert: rows.filter(r => r.al.length).length, todo: rows.filter(r => !r.d).length, si: rows.filter(r => r.d === "si").length, no: rows.filter(r => r.d === "no").length,
    subito: rows.filter(r => r.w && r.w.k === 0).length };
  const acc = rows.filter(r => r.d === "si"), accV = acc.reduce((t, r) => t + r.l.value, 0), accQ = acc.reduce((t, r) => t + r.l.qty, 0);
  const vis = rows.filter(r => R.decFilter === "tutte" || (R.decFilter === "alert" && r.al.length) || (R.decFilter === "todo" && !r.d) || (R.decFilter === "subito" && r.w && r.w.k === 0) || (!ro && r.d === R.decFilter));
  const grpTxt = l => `${l.grp === "X" ? "–" : l.grp} ${GROUPS[l.grp] || ""}`.trim();
  const filters = ro ? [["tutte", "Tutte"], ["subito", "Da ordinare subito"], ["alert", "Con avviso"]] : [["tutte", "Tutte"], ["alert", "Con avviso"], ["todo", "Da decidere"], ["si", "Accettate"], ["no", "Rifiutate"]];
  host.innerHTML = `<div class="bar"><div><h2>${ro ? "Potenziale d'ordine per codice" : "Proposta d'acquisto da confermare"}</h2><p class="small muted">${ro
      ? "Sola consultazione: per ogni codice la quantità che servirà nell'orizzonte e la settimana in cui conviene ordinarla. Il motivo compare passando sulla descrizione."
      : "Per ogni riga scegli <b>Sì</b> o <b>No</b> nell'ultima colonna. Codice e colonne da «Proposta» in poi restano fermi mentre scorri la tabella. Il motivo della proposta compare passando sulla descrizione. Quando hai deciso tutte le righe puoi scaricare l'ordine confermato in Excel o PDF."}</p></div>
      <label class="field" for="alth">Avviso se la copertura dopo l'ordine supera<select id="alth">${[1, 2, 3, 4, 6, 9, 12].map(v => `<option value="${v}"${v === th ? " selected" : ""}>${v} ${v === 1 ? "mese" : "mesi"}</option>`).join("")}</select></label></div>
    <div class="decsum">${ro
      ? `<div><span class="k">Codici con potenziale</span><b>${fmtN(cnt.tutte)}</b></div><div><span class="k">Valore potenziale</span><b>${fmtN(accQ)} pezzi · ${fmtE(accV)}</b></div>
         <div><span class="k">Da ordinare subito</span><b>${fmtN(cnt.subito)} codici</b></div><div><span class="k">Con avviso</span><b class="${cnt.alert ? "alerttxt" : ""}">${fmtN(cnt.alert)} righe</b></div>`
      : `<div><span class="k">Righe decise</span><b>${fmtN(cnt.si + cnt.no)} / ${fmtN(cnt.tutte)}</b></div><div><span class="k">Accettate</span><b>${fmtN(cnt.si)} righe · ${fmtN(accQ)} pezzi · ${fmtE(accV)}</b></div>
         <div><span class="k">Rifiutate</span><b>${fmtN(cnt.no)} righe</b></div><div><span class="k">Con avviso</span><b class="${cnt.alert ? "alerttxt" : ""}">${fmtN(cnt.alert)} righe</b></div>`}
    </div>
    <div class="bar"><div class="chips" role="group" aria-label="Filtra le righe">${filters.map(([k, l]) => `<button type="button" class="chip" data-df="${k}" aria-pressed="${R.decFilter === k}">${l}<span class="n">${fmtN(cnt[k])}</span></button>`).join("")}</div>
      ${ro ? "" : `<div class="row"><button class="btn sm" type="button" data-bulk="okNoAlert">Sì a tutte senza avviso</button><button class="btn sm" type="button" data-bulk="noAlert">No a tutte con avviso</button><button class="btn sm" type="button" data-bulk="allSi">Sì a tutte</button><button class="link" type="button" data-bulk="reset">Azzera</button></div>`}</div>
    ${vis.length ? `<div class="tablebox"><table class="dectab"><thead><tr><th class="num">#</th><th>Codice</th><th>Descrizione</th><th>Gruppo</th><th class="num">Giacenza</th><th class="num">Ord. aperti</th>${MOVE_TH}<th class="num">Listino</th><th class="num">Netto</th><th class="num">Copertura attuale</th><th class="num" data-fzstart>${ro ? "Potenziale" : "Proposta"}</th><th class="num">Valore netto</th><th class="num">Copertura dopo</th>${ro ? "<th>Quando ordinare</th>" : ""}<th>Avviso</th><th></th>${ro ? "" : `<th>Accetto</th>`}</tr></thead><tbody>
      ${vis.slice(0, R.decShow).map(({ l, al, d, w }) => `<tr class="${!ro && d ? "d-" + d : ""}${al.length ? " has-al" : ""}"><td class="num muted">${l.rank}</td>
        <td class="code"><button type="button" data-c="${esc(l.code)}">${esc(l.code)}</button></td>
        <td class="desc" title="${esc(l.reasons.join(", "))}">${esc(l.descr)}</td>
        <td class="small">${esc(grpTxt(l))}${l.dg ? `<span class="sub">DG ${esc(l.dg)}</span>` : ""}</td>
        <td class="num">${fmtN(l.giac)}</td><td class="num">${l.ord ? fmtN(l.ord) : "–"}</td>
        ${moveCells(l)}
        <td class="num">${l.listino != null ? fmtE2(l.listino) : "–"}</td><td class="num">${fmtE2(l.cost)}</td>
        <td class="num">${covTxt(l.cover_before)}${l.cover_before != null ? " mesi" : ""}</td>
        <td class="num"><b>${fmtN(l.qty)}</b>${l.partial ? `<span class="sub">parziale</span>` : ""}</td><td class="num">${fmtE2(l.value)}</td>
        <td class="num">${covTxt(l.cover_after)}${l.cover_after != null ? " mesi" : ""}</td>
        ${ro ? `<td class="small">${w ? (w.k === 0 ? `<b>Subito</b><span class="sub">sett. ${isoWeek(w.d)}</span>` : `Sett. ${isoWeek(w.d)}<span class="sub">${esc(dIt(w.d))}</span>`) : `<span class="muted">oltre l'orizzonte</span>`}</td>` : ""}
        <td>${al.length ? `<span class="alert" title="${esc(al.join(" · "))}">⚠ ${esc(al[0].startsWith("Nessuna") ? "Senza domanda" : "Oltre " + fmtN(th) + " mesi")}</span>` : ""}</td>
        <td><button class="link small" type="button" data-od="${esc(l.code)}" title="Escludi questo codice da tutti gli scenari">su richiesta</button></td>
        ${ro ? "" : `<td><div class="yn" role="group" aria-label="Accetto ${esc(l.code)}"><button type="button" class="ynb si" data-yn="si" data-code="${esc(l.code)}" aria-pressed="${d === "si"}">Sì</button><button type="button" class="ynb no" data-yn="no" data-code="${esc(l.code)}" aria-pressed="${d === "no"}">No</button></div></td>`}</tr>`).join("")}
    </tbody></table></div>${vis.length > R.decShow ? `<div class="pager"><span>Mostrate ${fmtN(R.decShow)} righe su ${fmtN(vis.length)}.</span><button class="btn sm" type="button" id="dmore">Mostra altre 200</button></div>` : ""}` : `<p class="muted">Nessuna riga in questa vista.</p>`}
    <div class="decexp">${ro
      ? `<div class="small muted">Per trasformare il potenziale in un ordine, scegli l'obiettivo «Pianificazione ordini per adeguare le giacenze».</div><div class="row"><button class="btn primary" type="button" id="oxls">Scarica in Excel</button><button class="btn primary" type="button" id="dpdf">Scarica in PDF</button></div>`
      : `<div class="small muted" id="dexpmsg">${cnt.todo ? `Mancano <b>${fmtN(cnt.todo)}</b> righe da decidere prima di scaricare l'ordine confermato.` : cnt.si ? `Ordine confermato pronto: ${fmtN(cnt.si)} righe, ${fmtE(accV)}.` : "Nessuna riga accettata."}</div>
      <div class="row"><button class="btn primary" type="button" id="dxls"${cnt.todo || !cnt.si ? " disabled" : ""}>Ordine confermato in Excel</button><button class="btn primary" type="button" id="dpdf"${cnt.todo || !cnt.si ? " disabled" : ""}>Ordine confermato in PDF</button><button class="btn" type="button" id="oxls">Proposta completa in Excel</button></div>`}</div>`;
  freezeTable($("table.dectab", host));
  const rer = () => renderDecision(host, R, recalc);
  $("#alth", host).onchange = e => { O.alertMonths = +e.target.value; rer(); };
  $$("[data-df]", host).forEach(b => b.onclick = () => { R.decFilter = b.dataset.df; R.decShow = 100; rer(); });
  $$("[data-yn]", host).forEach(b => b.onclick = () => { const c = b.dataset.code; R.dec[c] = R.dec[c] === b.dataset.yn ? "" : b.dataset.yn; if (!R.dec[c]) delete R.dec[c]; saveDec(); rer(); });
  $$("[data-bulk]", host).forEach(b => b.onclick = async () => {
    const k = b.dataset.bulk;
    if (k === "reset") { if (!await confirmBox("Azzerare le decisioni?", "Tutte le righe torneranno da decidere.", "Azzera", true)) return; R.dec = {}; }
    else rows.forEach(r => { if (k === "allSi" || (k === "okNoAlert" && !r.al.length)) { if (!R.dec[r.l.code] || k === "allSi") R.dec[r.l.code] = "si"; } else if (k === "noAlert" && r.al.length) R.dec[r.l.code] = "no"; });
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
  $("#oxls", host).onclick = () => exportProposalXls(R, when);
  if ($("#dxls", host)) $("#dxls", host).onclick = () => exportConfirmedXls(R, rows);
  if ($("#dpdf", host)) $("#dpdf", host).onclick = () => exportConfirmedPdf(R, rows, ro ? "Potenziale ordini" : "Ordine confermato");
}
function confirmedRows(rows) {
  const th = state.ordine.alertMonths || 3;
  return rows.filter(r => r.d === "si").map(({ l, al }) => ({ "Codice particolare": l.code, "Descrizione": l.descr, "Gruppo principale": `${l.grp} ${GROUPS[l.grp] || ""}`.trim(), "DG": l.dg || "",
    "Giacenza attuale": l.giac, "Ordini aperti": l.ord, "Venduto recente": l.qty_sold != null ? l.qty_sold : "", "Vendite speciali": l.ven_spc != null ? l.ven_spc : "",
    "Ultima vendita": l.last_sale ? dIt(l.last_sale) : "", "Consumo medio mensile": l.cons_mese || "", "Regolarità vendite (0-12)": l.regolarita || "", "Giacenza settimana precedente": l.prev_giac != null ? l.prev_giac : "",
    "Prezzo listino": l.listino != null ? l.listino : "", "Prezzo netto": l.cost,
    "Copertura attuale (mesi)": l.cover_before == null ? "" : Math.round(l.cover_before * 10) / 10, "Quantità": l.qty,
    "Valore netto": Math.round(l.value * 100) / 100, "Valore listino": l.listino != null ? Math.round(l.listino * l.qty * 100) / 100 : "",
    "Copertura dopo (mesi)": l.cover_after == null ? "" : Math.round(l.cover_after * 10) / 10, "Avviso": al.join(" · ") }));
}
function orderMeta(R, rows) {
  const u = state.me.user, accepted = rows ? rows.filter(r => r.d === "si").map(r => r.l) : R.lines.filter(l => R.dec[l.code] === "si");
  return { dealer: dealerName(state.dealerId), week: weekLabel(R.week), scen: R.title, user: u.full_name || u.username, date: new Date().toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }),
    n: accepted.length, q: accepted.reduce((t, l) => t + l.qty, 0), v: accepted.reduce((t, l) => t + l.value, 0), vl: accepted.reduce((t, l) => t + (l.listino || 0) * l.qty, 0),
    rejected: R.lines.length - accepted.length };
}
function exportConfirmedXls(R, rows) {
  const M = orderMeta(R, rows), data = confirmedRows(rows), wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data); ws["!cols"] = Object.keys(data[0]).map(k => ({ wch: Math.max(11, k.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, "Ordine confermato");
  const rej = rows.filter(r => r.d === "no").map(({ l, al }) => ({ "Codice particolare": l.code, "Descrizione": l.descr, "Quantità proposta": l.qty, "Valore netto": Math.round(l.value * 100) / 100, "Avviso": al.join(" · ") }));
  if (rej.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rej), "Righe non accettate");
  const acc = R.lines.filter(l => R.dec[l.code] === "si"), P = state.ordine.phase || { weeks: 4, freq: 1 };
  const ph = phaseLines(acc, P.weeks, P.freq), dates = weekDates(R.week, P.weeks), lab = s => `Sett. ${isoWeek(s)} (${dIt(s)})`;
  const cal = []; dates.forEach((d, w) => ph.forEach(x => { if (x.sched[w]) cal.push({ "Settimana": lab(d), "Codice": x.l.code, "Descrizione": x.l.descr, "Quantità": x.sched[w], "Valore netto": Math.round(x.sched[w] * x.l.cost * 100) / 100 }); }));
  ph.forEach(x => { if (x.later) cal.push({ "Settimana": state.ordine.result && R.summary.mode === "target" ? "Anticipo obiettivo" : "Oltre l'orizzonte", "Codice": x.l.code, "Descrizione": x.l.descr, "Quantità": x.later, "Valore netto": Math.round(x.later * x.l.cost * 100) / 100 }); });
  if (cal.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cal), "Calendario ordini");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Ordine confermato"], ["Concessionaria", M.dealer], ["Dati della", M.week], ["Scenario", M.scen], ["Confermato da", M.user], ["Data", M.date],
    ["Righe accettate", M.n], ["Righe non accettate", M.rejected], ["Pezzi", M.q], ["Valore netto", Math.round(M.v * 100) / 100], ["Valore a listino", Math.round(M.vl * 100) / 100]]), "Riepilogo");
  XLSX.writeFile(wb, `ordine_confermato_${M.dealer.replace(/[^\w\-]+/g, "_")}_${R.week}.xlsx`);
}
function exportConfirmedPdf(R, rows, title = "Ordine confermato") {
  if (!window.jspdf || !window.jspdf.jsPDF) { toast("Il generatore PDF non si è caricato: ricarica la pagina."); return; }
  const M = orderMeta(R, rows), doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const th = state.ordine.alertMonths || 3, W = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(title, 14, 16);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(80);
  doc.text([`Concessionaria: ${M.dealer}`, `Dati della ${M.week}`, `${M.scen}`, `${title === "Ordine confermato" ? "Confermato" : "Estratto"} da ${M.user} il ${M.date}`], 14, 23);
  doc.setTextColor(20); doc.setFont("helvetica", "bold");
  doc.text(`${fmtN(M.n)} righe · ${fmtN(M.q)} pezzi · valore netto ${fmtE2(M.v)}${M.vl ? ` · a listino ${fmtE2(M.vl)}` : ""}`, W - 14, 23, { align: "right" });
  const body = rows.filter(r => r.d === "si").map(({ l, al }) => [l.code, l.descr || "", `${l.grp === "X" ? "–" : l.grp} ${GROUPS[l.grp] || ""}`.trim(), fmtN(l.giac),
    [l.qty_sold != null ? fmtN(l.qty_sold) : "", l.last_sale ? dIt(l.last_sale) : ""].filter(Boolean).join(" · ") || "–", l.listino != null ? fmtE2(l.listino) : "–", fmtE2(l.cost),
    covTxt(l.cover_before), fmtN(l.qty), fmtE2(l.value), covTxt(l.cover_after), al.length ? (al[0].startsWith("Nessuna") ? "Senza domanda" : `Oltre ${fmtN(th)} mesi`) : ""]);
  doc.autoTable({
    startY: 43, head: [["Codice", "Descrizione", "Gruppo", "Giacenza", "Venduto / ult. vendita", "Listino", "Netto", "Cop. attuale (mesi)", "Quantità", "Valore netto", "Cop. dopo (mesi)", "Avviso"]], body,
    foot: [["Totale", "", "", "", "", "", "", "", fmtN(M.q), fmtE2(M.v), "", ""]], showFoot: "lastPage",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.6 }, headStyles: { fillColor: [17, 17, 17], textColor: 255 }, footStyles: { fillColor: [236, 239, 242], textColor: 20, fontStyle: "bold" },
    columnStyles: { 0: { font: "courier" }, 1: { cellWidth: 48 }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right", fontStyle: "bold" }, 9: { halign: "right" }, 10: { halign: "right" }, 11: { textColor: [198, 40, 40] } },
    alternateRowStyles: { fillColor: [247, 249, 250] }, margin: { left: 14, right: 14 },
    didDrawPage: d => { doc.setFontSize(8); doc.setTextColor(120); doc.text(`Pagina ${doc.internal.getNumberOfPages()}`, W - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" }); doc.text("Incrocio giacenze ricambi", 14, doc.internal.pageSize.getHeight() - 8); }
  });
  const y = doc.lastAutoTable.finalY + 14;
  if (y < doc.internal.pageSize.getHeight() - 20) { doc.setFontSize(9.5); doc.setTextColor(40); doc.text("Firma del responsabile di magazzino: ______________________________", 14, y); }
  doc.save(`${title === "Ordine confermato" ? "ordine_confermato" : "potenziale_ordini"}_${M.dealer.replace(/[^\w\-]+/g, "_")}_${R.week}.pdf`);
}
function exportProposalXls(R, when) {
  const S = R.summary;
  const rows = R.lines.map(l => ({ "Priorità": l.rank, "Codice": l.code, "Descrizione": l.descr, "Gruppo principale": `${l.grp} ${GROUPS[l.grp] || ""}`.trim(), "Classe ABC": l.cls === "N" ? "" : l.cls, "DG": l.dg, "Locazione": l.loc,
    "Stato": l.tier === 1 ? "A zero" : STATI[l.status], "Giacenza": l.giac, "Ordini aperti": l.ord, "Giacenza settimana precedente": l.prev_giac != null ? l.prev_giac : "",
    "Venduto recente": l.qty_sold != null ? l.qty_sold : "", "Vendite speciali": l.ven_spc != null ? l.ven_spc : "", "Ultima vendita": l.last_sale ? dIt(l.last_sale) : "",
    "SMin": l.smin, "SMax": l.smax, "Consumo medio mensile": l.cons_mese, "Regolarità vendite (0-12)": l.regolarita,
    "Prezzo listino": l.listino != null ? l.listino : "", "Prezzo netto": l.cost, "Copertura attuale (mesi)": l.cover_before == null ? "" : Math.round(l.cover_before * 10) / 10, "Quantità proposta": l.qty,
    "Parziale": l.partial ? "Sì" : "", "Copertura dopo (mesi)": l.cover_after == null ? "" : Math.round(l.cover_after * 10) / 10,
    "Valore netto": Math.round(l.value * 100) / 100, "Cumulato": Math.round(l.cum * 100) / 100, "Motivo": l.reasons.join(", "), ...(when ? { "Quando ordinare": when.get(l.code) ? (when.get(l.code).k === 0 ? "Subito" : `Sett. ${isoWeek(when.get(l.code).d)} (${dIt(when.get(l.code).d)})`) : "Oltre l'orizzonte" } : { "Decisione": R.dec && R.dec[l.code] ? (R.dec[l.code] === "si" ? "Sì" : "No") : "" }) }));
  const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = Object.keys(rows[0]).map(k => ({ wch: Math.max(10, k.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, "Proposta");
  const P = state.ordine.phase || { weeks: 4, freq: 1 }, ph = phaseLines(R.lines, P.weeks, P.freq), dates = weekDates(R.week, P.weeks), lab = s => `Sett. ${isoWeek(s)} (${dIt(s)})`;
  const wide = ph.map(x => { const o = { "Codice": x.l.code, "Descrizione": x.l.descr, "Totale": x.l.qty }; dates.forEach((d, w) => { o[lab(d)] = x.sched[w] || ""; }); o[S.mode === "target" ? "Anticipo obiettivo" : "Non necessario per ora"] = x.later || ""; return o; });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wide), "Spalmatura");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Scenario", R.title], ["Settimana", weekLabel(R.week)], ["Concessionaria", dealerName(state.dealerId)], ["Valore", Math.round(S.spent * 100) / 100], ["Righe", S.n_lines], ["Pezzi", S.pieces]]), "Scenario");
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
  main.innerHTML = `<div class="head"><div><h1>Indicatori</h1><p class="sub">${esc(dealerName(state.dealerId))} · ${esc(weekLabel(K.week))}</p></div>${weekSelect("kw", snaps, state.kpiSnap)}</div>
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
  <p class="small muted">Il consumo medio della lista movimentazione è trattato come pezzi al mese: la rotazione annua è il consumo medio × 12 e la copertura è la giacenza ÷ consumo medio. L'indice di regolarità delle vendite (da 0 a 12) è solo informativo. Se nel tuo sistema il consumo medio ha un'altra unità, rotazione e copertura vanno ricalibrate.</p>`;
  $("#kw").onchange = e => { state.kpiSnap = +e.target.value; viewKpi(main); };
  const cs = getComputedStyle(document.documentElement), col = v => cs.getPropertyValue(v).trim();
  if (T.length > 1) {
    lineChart($("#t1"), T.map(t => ({ y: (t.service || 0) * 100, label: dShort(t.week_date), full: weekLabel(t.week_date) })), { title: "Livello di servizio stimato", color: col("--good"), fmt: v => fmtN(v, 1) + "%", axis: v => fmtN(v) + "%" });
    lineChart($("#t2"), T.map(t => ({ y: t.coverage_months || 0, label: dShort(t.week_date), full: weekLabel(t.week_date) })), { title: "Copertura media in mesi", color: col("--accent"), fmt: v => fmtN(v, 1) + " mesi", axis: v => fmtN(v, 1) });
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
  main.innerHTML = `<div class="head"><div><h1>Scheda codice</h1><p class="sub">Evoluzione settimana per settimana di un codice in ${esc(dealerName(state.dealerId))}.</p></div></div>
  <form class="panel" id="cf"><div class="row"><label class="field" for="cq">Codice particolare<input type="text" id="cq" value="${esc(state.codice)}" autocapitalize="characters" placeholder="Es. AAA000111B"></label><button class="btn primary" type="submit">Mostra</button></div></form>
  <div id="cres"></div>`;
  $("#cf").onsubmit = e => { e.preventDefault(); state.codice = $("#cq").value.trim().toUpperCase(); showCode(); };
  if (state.codice) await showCode(); else $("#cq").focus();
}
async function showCode() {
  const out = $("#cres"); out.innerHTML = `<p class="muted">Caricamento…</p>`;
  const d = await api("GET", `/api/history?dealer=${state.dealerId}&code=${encodeURIComponent(state.codice)}`);
  if (!d.rows.length) {
    out.innerHTML = `<div class="panel"><p>Il codice <b class="mono">${esc(d.code)}</b> non compare nelle settimane caricate.</p>${d.suggest.length ? `<p class="small muted">Codici che iniziano così:</p><div class="chips">${d.suggest.map(s => `<button class="chip mono" type="button" data-s="${esc(s)}">${esc(s)}</button>`).join("")}</div>` : ""}</div>`;
    $$("[data-s]", out).forEach(b => b.onclick = () => { state.codice = b.dataset.s; $("#cq").value = state.codice; showCode(); });
    return;
  }
  const last = d.rows[d.rows.length - 1];
  out.innerHTML = `<div class="panel flagpanel"><div class="row">${d.flag
      ? `<p><span class="pill off">Su richiesta</span> Escluso dagli scenari d'ordine${d.flag.note ? ` · ${esc(d.flag.note)}` : ""} · segnato da ${esc(d.flag.full_name || d.flag.username || "–")} il ${esc(dIt(String(d.flag.set_at).slice(0, 10)))}</p><button class="btn sm" type="button" id="cflag">Rimetti a scorta</button>`
      : `<p class="muted">Codice gestito a scorta. Se è un ricambio che ordini solo su richiesta del cliente, escludilo dagli scenari d'ordine.</p><button class="btn sm" type="button" id="cflag">Segna come su richiesta</button>`}</div></div>
  <section class="tiles">
    <div class="tile"><span class="k">${esc(last.descr || "Codice")}</span><span class="v mono">${esc(d.code)}</span><span class="s">Locazione ${esc(last.loc || "–")} · costo ${fmtE2(last.cost)}</span></div>
    <div class="tile ${last.status === "sotto" ? "bad" : last.status === "eccesso" ? "warn" : last.status === "fermo" ? "idle" : "neutral"}"><span class="k">Stato attuale</span><span class="v">${STATI[last.status]}</span><span class="s">${last.status === "ok" ? "" : `da ${fmtN(last.streak)} settimane · `}${esc(weekLabel(last.week_date))}</span></div>
    <div class="tile neutral"><span class="k">Giacenza / SMin / SMax</span><span class="v">${fmtN(last.giac)} <span class="small muted">/ ${fmtN(last.smin)} / ${fmtN(last.smax)}</span></span><span class="s">${fmtN(last.ord)} in ordine</span></div>
  </section>
  <div class="chart" id="cc"></div>
  <section class="panel"><h2>Settimana per settimana</h2><div class="tablebox"><table><thead><tr><th>Settimana</th><th>Stato</th><th class="num">Giacenza</th><th class="num">Ord. aperti</th><th class="num">SMin</th><th class="num">SMax</th><th class="num">Da ordinare / Eccedenza</th><th class="num">Valore giacenza</th></tr></thead><tbody>
  ${d.rows.slice().reverse().map(r => `<tr><td>${esc(weekLabel(r.week_date))}</td><td><span class="pill ${r.status}">${STATI[r.status]}</span>${!r.in_b ? ` <span class="pill nogiac">n.g.</span>` : ""}</td><td class="num">${fmtN(r.giac)}</td><td class="num">${fmtN(r.ord)}</td><td class="num">${fmtN(r.smin)}</td><td class="num">${fmtN(r.smax)}</td><td class="num">${r.delta > 0 ? "+" : ""}${r.delta ? fmtN(r.delta) : "–"}</td><td class="num">${fmtE2(r.val_giac)}</td></tr>`).join("")}
  </tbody></table></div>${d.rows.length < d.weeks.length ? `<p class="small muted">Il codice compare in ${fmtN(d.rows.length)} settimane su ${fmtN(d.weeks.length)} caricate.</p>` : ""}</section>`;
  $("#cflag").onclick = async () => {
    try {
      if (d.flag) await api("DELETE", `/api/dealers/${state.dealerId}/flags/${encodeURIComponent(d.code)}`);
      else await api("POST", `/api/dealers/${state.dealerId}/flags`, { codes: [d.code], note: "Segnato dalla scheda codice" });
      toast(d.flag ? "Codice rimesso a scorta." : "Codice segnato come su richiesta."); showCode();
    } catch (x) { if (!x.silent) toast(x.message); }
  };
  const cs = getComputedStyle(document.documentElement);
  lineChart($("#cc"), d.rows.map(r => ({ y: r.giac, label: dShort(r.week_date), full: weekLabel(r.week_date) })),
    { title: `Giacenza settimanale (SMin ${fmtN(last.smin)} · SMax ${fmtN(last.smax)} nell'ultima settimana)`, color: cs.getPropertyValue("--accent").trim(), fmt: v => fmtN(v) + " pz", axis: v => fmtN(v) });
}

/* ============ Caricamento settimana ============ */
const FIELDS_A = [
  { key: "code", label: "Codice", req: true, syn: ["codice particolare", "codice", "cod particolare", "part number", "partnumber", "articolo", "stampanr.rc", "stampanr"] },
  { key: "desc", label: "Descrizione", syn: ["descrizione", "desc"] },
  { key: "loc", label: "Locazione", syn: ["locaz", "locazione", "ubicazione"] },
  { key: "dg", label: "DG", syn: ["dg"] },
  { key: "cost", label: "Prezzo netto (costo)", syn: ["sco stk eur", "sco stk", "costo", "prezzo netto", "costo medio"] },
  { key: "listino", label: "Prezzo di listino", syn: ["prezzo listino eur", "prezzo listino", "listino"] },
  { key: "ord", label: "Ordini aperti", syn: ["ord. aperti", "ordini aperti", "ord aperti", "in ordine"] },
  { key: "smin", label: "Scorta minima", req: true, syn: ["smin", "scorta min", "scorta minima"] },
  { key: "smax", label: "Scorta massima", req: true, syn: ["smax", "scorta max", "scorta massima"] },
  { key: "regolarita", label: "Regolarità vendite (indice)", syn: ["regolarità vendite", "regolarita vendite", "indice di regolarità", "regolarità", "regolarita"], hs: ["1sqy7ce"] },
  { key: "cons_mese", label: "Consumo medio mensile", syn: ["consumo medio mensile", "consumo medio", "consumo mensile", "consumo mese"], hs: ["1ji1e61"] },
  { key: "qtaven", label: "Venduto / ultima vendita", syn: ["qtaven/ultven", "qtaven", "qta ven", "ultven", "venduto"] },
  { key: "venspc", label: "Vendite speciali", syn: ["ven spc", "venspc", "vendite speciali"] },
  { key: "fab", label: "FAB", syn: ["fab"] }
];
const FIELDS_B = [
  { key: "code", label: "Codice", req: true, syn: ["stampanr.rc", "stampanr", "codice particolare", "codice", "part number", "partnumber", "articolo"] },
  { key: "giac", label: "Giacenza", req: true, syn: ["g.dispo.", "g.dispo", "giacenza disponibile", "giacenza", "disponibile", "dispo", "qta"] },
  { key: "desc", label: "Descrizione", syn: ["descrizione", "desc"] }
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
function analyseSheet(rows, fields) {
  let best = { headerRow: 0, map: {}, score: -1 };
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const row = rows[r] || [], map = {}, used = new Set(); let score = 0;
    for (const f of fields) { let bc = -1, bs = 0; row.forEach((c, i) => { if (used.has(i)) return; const s = matchHeader(c, f); if (s > bs) { bs = s; bc = i; } }); if (bc >= 0) { map[f.key] = bc; used.add(bc); score += bs * (f.req ? 2 : 1); } }
    if (score > best.score) best = { headerRow: r, map, score };
  }
  return best;
}
const colL = i => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function readFile(file) {
  return new Promise((res, rej) => {
    if (typeof XLSX === "undefined") return rej(new Error("Il lettore Excel non si è caricato. Ricarica la pagina."));
    const fr = new FileReader();
    fr.onload = () => { try {
      const wb = XLSX.read(new Uint8Array(fr.result), { type: "array" }); const sheets = {};
      wb.SheetNames.forEach(n => { sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null, raw: true, blankrows: false }); });
      res({ name: file.name, sheets });
    } catch (e) { rej(new Error(`Non riesco a leggere «${file.name}». Deve essere un Excel (.xlsx o .xls) non protetto da password.`)); } };
    fr.onerror = () => rej(new Error("Lettura del file non riuscita.")); fr.readAsArrayBuffer(file);
  });
}
async function viewCarica(main) {
  if (needDealer(main)) return;
  const U = state.upload;
  main.innerHTML = `<div class="head"><div><h1>Carica settimana</h1><p class="sub">${esc(dealerName(state.dealerId))}. I file vengono letti sul tuo computer; sulla piattaforma viene salvato solo il risultato dell'incrocio.</p></div></div>
  <div class="msg err" id="uerr" hidden></div>
  <section class="grid3">
    <div class="step" id="stepW"><span class="num">PASSO 1</span><h3>Settimana di riferimento</h3>
      <label class="field" for="wk">Una data qualsiasi della settimana<input type="date" id="wk" value="${U.week}"></label><p class="meta" id="wkl"></p></div>
    <div class="step" id="stepA"><span class="num">PASSO 2</span><h3>Storico movimentazione</h3><p class="meta">Lista disposizione con codice, SMin, SMax, ordini aperti e costo. Puoi scegliere più file: vengono uniti.</p>
      <div id="listA"></div>
      <label class="btn" for="fileA">Aggiungi file storico</label><input type="file" id="fileA" accept=".xlsx,.xls,.xlsm,.csv" multiple></div>
    <div class="step" id="stepB"><span class="num">PASSO 3</span><h3>Giacenza attuale</h3><p class="meta">Codice e quantità disponibile. Con più file, le quantità dello stesso codice si sommano.</p>
      <div id="listB"></div>
      <label class="btn" for="fileB">Aggiungi file giacenza</label><input type="file" id="fileB" accept=".xlsx,.xls,.xlsm,.csv" multiple></div>
  </section>
  <div class="row"><button class="btn primary" type="button" id="save" disabled>Incrocia e salva la settimana</button><span class="small muted" id="sstat"></span></div>`;
  const wk = $("#wk"), upd = () => { const v = wk.value; if (v) { const [y, m, d] = v.split("-").map(Number); U.week = mondayISO(new Date(y, m - 1, d)); $("#wkl").textContent = weekLabel(U.week) + " (lunedì)"; $("#stepW").classList.add("done"); } };
  wk.onchange = upd; upd();
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
  for (const file of files) {
    try {
      const wb = await readFile(file);
      let best = null;
      for (const [name, rows] of Object.entries(wb.sheets)) { const a = analyseSheet(rows, fields); if (!best || a.score > best.score) best = { sheet: name, ...a }; }
      state.upload[slot].push({ wb, sheet: best.sheet, headerRow: best.headerRow, map: best.map });
    } catch (e) { err.hidden = false; err.textContent = e.message; }
  }
  // I file vengono sempre uniti in ordine alfabetico: lo stesso insieme di file dà lo stesso risultato, in qualsiasi ordine vengano scelti.
  state.upload[slot].sort((x, y) => (x.wb.name < y.wb.name ? -1 : x.wb.name > y.wb.name ? 1 : 0));
  renderSlot(slot); updateSave();
}
function entryMissing(slot, s) { return (slot === "A" ? FIELDS_A : FIELDS_B).filter(f => f.req && s.map[f.key] == null).map(f => f.label); }
function renderSlot(slot) {
  const list = state.upload[slot], fields = slot === "A" ? FIELDS_A : FIELDS_B, host = $("#list" + slot);
  if (!host) return;
  $("#step" + slot).classList.toggle("done", list.length > 0 && list.every(s => !entryMissing(slot, s).length));
  host.innerHTML = list.map((s, k) => {
    const rows = s.wb.sheets[s.sheet] || [], n = Math.max(0, rows.length - s.headerRow - 1), miss = entryMissing(slot, s);
    const header = rows[s.headerRow] || [], names = Object.keys(s.wb.sheets), noCons = slot === "A" && s.map.cons_mese == null;
    let map = names.length > 1 ? `<label for="sh${slot}${k}">Foglio</label><select id="sh${slot}${k}" data-sh="${k}">${names.map(x => `<option${x === s.sheet ? " selected" : ""}>${esc(x)}</option>`).join("")}</select>` : "";
    for (const f of fields) map += `<label for="m${slot}${k}_${f.key}" class="${f.req ? "req" : ""}">${esc(f.label)}</label><select id="m${slot}${k}_${f.key}" data-e="${k}" data-k="${f.key}"><option value="">— nessuna —</option>${header.map((h, i) => `<option value="${i}"${s.map[f.key] === i ? " selected" : ""}>${esc(h == null || h === "" ? "Colonna " + colL(i) : h)}</option>`).join("")}</select>`;
    return `<div class="fileent"><div class="row"><p class="meta"><b>${esc(s.wb.name)}</b><br>Foglio «${esc(s.sheet)}», ${fmtN(n)} righe${miss.length ? `<br><span class="miss">Mancano: ${esc(miss.join(", "))}.</span>` : ""}${noCons ? `<br><span class="miss">Consumo medio non riconosciuto: senza questa colonna coperture e pianificazione non si possono calcolare.</span>` : ""}</p><button class="link" type="button" data-rm="${k}">Togli</button></div>
      <details${miss.length || noCons ? " open" : ""}><summary>Colonne riconosciute</summary><div class="map">${map}</div></details></div>`;
  }).join("");
  $$("[data-rm]", host).forEach(b => b.onclick = () => { list.splice(+b.dataset.rm, 1); renderSlot(slot); updateSave(); });
  $$("[data-sh]", host).forEach(el => el.onchange = () => { const s = list[+el.dataset.sh], a = analyseSheet(s.wb.sheets[el.value], fields); Object.assign(s, { sheet: el.value, headerRow: a.headerRow, map: a.map }); renderSlot(slot); updateSave(); });
  $$("select[data-k]", host).forEach(el => el.onchange = () => { const s = list[+el.dataset.e]; if (el.value === "") delete s.map[el.dataset.k]; else s.map[el.dataset.k] = +el.value; renderSlot(slot); updateSave(); });
}
const slotReady = slot => state.upload[slot].length > 0 && state.upload[slot].every(s => !entryMissing(slot, s).length);
function updateSave() { const b = $("#save"); if (!b) return; const ok = slotReady("A") && slotReady("B"); b.disabled = !ok; $("#sstat").textContent = ok ? "" : !state.upload.A.length ? "Manca lo storico." : !state.upload.B.length ? "Manca la giacenza." : "Completa le colonne obbligatorie."; }
function extract(slot) {
  const out = [];
  for (const s of state.upload[slot]) {
    const rows = s.wb.sheets[s.sheet], m = s.map, g = (r, k) => m[k] == null ? null : r[m[k]];
    for (let i = s.headerRow + 1; i < rows.length; i++) {
      const r = rows[i] || [], c = g(r, "code"); if (c == null || c === "") continue;
      out.push(slot === "A" ? [c, g(r, "desc"), g(r, "loc"), g(r, "dg"), g(r, "cost"), g(r, "ord"), g(r, "smin"), g(r, "smax"), g(r, "regolarita"), g(r, "cons_mese"), g(r, "listino"), g(r, "qtaven"), g(r, "venspc"), g(r, "fab")] : [c, g(r, "giac"), g(r, "desc")]);
    }
  }
  return out;
}
async function save(replace, onDone) {
  const b = $("#save"), st = $("#sstat"), err = $("#uerr"), U = state.upload;
  b.disabled = true; st.textContent = "Incrocio e salvataggio in corso…"; err.hidden = true;
  try {
    const names = k => U[k].map(s => s.wb.name).join(", ");
    const r = await api("POST", "/api/snapshots", { dealer_id: state.dealerId, week: U.week, file_a: names("A"), file_b: names("B"), rowsA: extract("A"), rowsB: extract("B"), replace });
    U.A = []; U.B = [];
    toast(`Salvata la ${weekLabel(r.week)}: ${fmtN(r.kpi.n_codes)} codici${r.dup ? `, ${fmtN(r.dup)} doppioni nello storico contati una volta` : ""}.`);
    await loadSnapshots(); state.analisi = { ...state.analisi, snapId: r.id, offset: 0, f: "tutti", q: "", sort: null };
    if (onDone) return onDone(r);
    location.hash = "#analisi";
  } catch (e) {
    if (e.silent) return;
    if (e.status === 409) {
      st.textContent = "";
      if (await confirmBox("Settimana già caricata", `Per la ${esc(weekLabel(U.week))} i dati ci sono già. Vuoi sostituirli con questi file?`, "Sostituisci")) return save(true, onDone);
      b.disabled = false; return;
    }
    err.hidden = false; err.textContent = e.message; st.textContent = ""; b.disabled = false;
  }
}

/* ============ Generatore di dati di prova ============
 * Crea liste movimentazione e giacenze fittizie con la stessa struttura dei file reali,
 * per una o più settimane che evolvono nel tempo. Tutto avviene nel browser: nulla viene salvato.
 */
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const G_PREFIX = ["1K0", "1K1", "1T0", "2G0", "2K5", "2Q0", "3C0", "3G0", "3V0", "5E0", "5F0", "5G0", "5K0", "5N0", "5Q0", "5TA", "6F0", "6R0", "7H0", "7N0", "81A", "8V0", "4K0", "2GA", "5H0", "11A", "1EA", "6Q0"];
const G_PARTS = [["807", "RIVEST.", 380, 720, 1], ["807", "PARAURTI ANT.", 290, 650, 1], ["807", "PARAURTI POST.", 270, 610, 1], ["698", "PASTIGLIE FRENO", 48, 160, 0], ["615", "DISCO FRENO", 55, 240, 0],
  ["611", "PINZA FRENO", 160, 520, 0], ["115", "FILTRO OLIO", 9, 28, 0], ["129", "FILTRO ARIA", 18, 55, 0], ["819", "FILTRO ABITACOLO", 16, 48, 0], ["127", "FILTRO CARB.", 24, 90, 0],
  ["941", "PROIETTORE", 320, 1450, 0], ["945", "FANALE POST.", 140, 480, 0], ["857", "SPECCHIO EST.", 45, 260, 1], ["121", "RADIATORE", 210, 560, 0], ["413", "AMMORTIZZ.", 95, 310, 0],
  ["407", "BRACCIO OSCILL.", 85, 280, 0], ["955", "SPAZZOLA TERG.", 14, 46, 0], ["905", "CANDELA", 9, 32, 0], ["253", "SILENZIATORE", 180, 640, 0], ["103", "GUARNIZIONE", 6, 85, 0],
  ["109", "CINGHIA DENT.", 55, 160, 0], ["121", "POMPA ACQUA", 90, 260, 0], ["906", "SENSORE", 35, 210, 0], ["919", "SENSORE PARCH.", 45, 120, 1], ["821", "PARAFANGO", 160, 420, 0],
  ["831", "PORTIERA", 520, 1250, 0], ["853", "MODANATURA", 28, 140, 1], ["837", "MANIGLIA", 30, 120, 1], ["959", "MOTORINO ALZAC.", 85, 230, 0], ["820", "COMPRESSORE CLIMA", 420, 980, 0],
  ["915", "BATTERIA", 110, 290, 0], ["411", "MOLLA ELICOID.", 40, 130, 0], ["498", "CUSCINETTO RUOTA", 75, 210, 0], ["601", "CERCHIO", 180, 690, 0], ["881", "RIVEST. SEDILE", 140, 520, 1],
  ["867", "PANNELLO PORTA", 160, 480, 1], ["199", "SUPPORTO MOTORE", 60, 220, 0], ["145", "TURBOCOMPRESSORE", 950, 2400, 0], ["141", "KIT FRIZIONE", 260, 720, 0], ["511", "BULLONE", 1, 9, 0]];
const G_COLORS = ["GRU", "9B9", "041", "2ZZ", "9AX", "ZQ4", "XX", "Y20", "82V", "B41"], G_GRP = ["KDA", "KDB", "KMA", "KMB", "ZUB", "OEL", "REI"], G_LET = "ABCDEFGHJKLMNPQRST";
const G_HDR_A = ["DG", "Codice particolare", "Descrizione", "Locaz", "Prezzo listino EUR", "Sco STK EUR", "QtaVen/UltVen", "Ven Spc", "Giac Cross Aggiornate al ", "Ord. Aperti", "FAB", "Regolarità vendite", "Consumo medio mensile", "SMin", "SMax", "Scad"];
const G_HDR_B = ["Stampanr.RC", "Gr.M.", "Descrizione", "Tipomerce", "G.dispo.", "GrpOmog."];
function generateData(o) {
  const R = rng(o.seed), pick = a => a[Math.floor(R() * a.length)], ri = (a, b) => a + Math.floor(R() * (b - a + 1)), rf = (a, b) => a + R() * (b - a);
  const used = new Set(), DGS = [];
  for (let n = 1; n < 40; n++) DGS.push("H" + String(n).padStart(3, "0")); for (let n = 1; n < 15; n++) DGS.push("A" + String(n).padStart(3, "0")); for (let n = 1; n < 10; n++) DGS.push("M" + String(n).padStart(3, "0"));
  const newCode = () => { for (;;) { const pr = pick(G_PREFIX), pt = pick(G_PARTS), sub = String(ri(1, 999)).padStart(3, "0");
    const idx = R() < .35 ? "" : Array.from({ length: R() < .67 ? 1 : 2 }, () => pick(G_LET.split(""))).join("");
    const col = pt[4] && R() < .75 ? pick(G_COLORS) : ""; const c = pr + pt[0] + sub + idx + col; if (!used.has(c)) { used.add(c); return [c, pt]; } } };
  const loc = () => R() < .08 ? null : R() < .15 ? `${pick("ABHJKM".split(""))}${ri(1, 9)}${pick("ABCDEFG".split(""))}${ri(1, 9)}` : `${pick("ABHJKM".split(""))}${String(ri(1, 30)).padStart(2, "0")}${pick("ABCDEF".split(""))}${ri(1, 6)}`;
  // profilo: quota di codici sotto SMin e sopra SMax nella prima settimana
  const prof = { equilibrato: [.25, .12, .2], alto: [.08, .35, .35], scarico: [.45, .04, .08] }[o.profile] || [.25, .12, .2];
  const A = [];
  for (let k = 0; k < o.nA; k++) {
    const [c, pt] = newCode(), listino = Math.round(rf(pt[2], pt[3]) * 100) / 100, costo = Math.round(listino * rf(.55, .62) * 100) / 100;
    const r = R(), smax = r < .45 ? 0 : r < .8 ? ri(1, 3) : r < .95 ? ri(4, 10) : ri(11, 40);
    const smin = smax === 0 ? 0 : Math.max(1, Math.round(smax * rf(.5, .8)));
    const ord = R() < .9 || smax === 0 ? 0 : ri(1, Math.max(1, smin));
    // consumo medio mensile: per i codici a scorta la SMin è il consumo arrotondato per eccesso; gli altri si vendono poco o nulla
    const cons_mese = Math.round((smax ? Math.max(.3, smin - rf(.05, .95)) : R() < .3 ? 0 : rf(.02, .45)) * 100) / 100;
    // indice di regolarità delle vendite (da 0 a 12): alto per i codici a scorta, basso per gli altri
    const regolarita = Math.round((smax ? rf(6.5, 11.99) : cons_mese ? rf(.3, 5.9) : 0) * 100) / 100;
    const qv = R() < .12 ? +`2026${String(ri(1, 10)).padStart(2, "0")}${String(ri(1, 28)).padStart(2, "0")}` : R() < .6 ? ri(0, Math.max(1, smax * 2)) : 0;
    A.push({ dg: pick(DGS), code: c, desc: pt[1], loc: loc(), listino, costo, qv, vspc: R() < .95 ? 0 : ri(1, 3), ord, fab: 0, regolarita, cons_mese, smin, smax, scad: R() < .94 ? "N" : "S" });
  }
  const giacOf = s => {
    if (s.smax === 0) return R() < (1 - prof[2]) ? 0 : ri(1, 5);
    const r = R();
    if (r < prof[0]) return ri(0, Math.max(0, s.smin - 1));
    if (r < 1 - prof[1]) return ri(s.smin, s.smax);
    return s.smax + ri(1, Math.max(2, s.smax * 2));
  };
  const nInA = Math.min(o.nA, Math.round(o.nB * .955)), nExtra = Math.max(0, o.nB - nInA);
  const order = A.map((_, i) => i).sort((x, y) => (A[x].smax === 0) - (A[y].smax === 0) || R() - .5);   // i codici con scorta entrano per primi in giacenza
  const inB = new Set(order.slice(0, nInA));
  const B = new Map();
  A.forEach((s, i) => { if (!inB.has(i)) return; const g = giacOf(s); s.fab = Math.max(0, s.smin - g - s.ord); B.set(s.code, [s.code, R() < .85 ? "V" : pick(["A", "S", "Z"]), s.desc, R() < .92 ? "R" : "Z", g, pick(G_GRP)]); });
  for (let k = 0; k < nExtra; k++) { const [c, pt] = newCode(); B.set(c, [c, "V", pt[1], "R", R() < .5 ? 0 : ri(1, 6), pick(G_GRP)]); }
  const weeks = [];
  const snap = () => ({ A: A.map(s => [s.dg, s.code, s.desc, s.loc, s.listino, s.costo, s.qv, s.vspc, null, s.ord, s.fab, s.regolarita, s.cons_mese, s.smin, s.smax, s.scad]), B: [...B.values()].map(r => r.slice()) });
  weeks.push(snap());
  for (let w = 1; w < o.weeks; w++) {
    for (const s of A) {
      const g = B.get(s.code);
      if (s.ord && g && R() < .7) { g[4] += s.ord; s.ord = 0; }
      if (g && g[4] > 0 && R() < (s.smax ? .35 : .05)) g[4] -= ri(1, Math.min(g[4], 2));
      if (g && s.smax && g[4] + s.ord < s.smin && R() < .6) s.ord = s.smax - g[4];
      if (R() < .03) { s.smax = Math.max(0, s.smax + (R() < .5 ? -1 : 1)); s.smin = Math.min(s.smin, s.smax); }
      s.fab = g ? Math.max(0, s.smin - g[4] - s.ord) : s.smin;
    }
    for (const g of B.values()) if (g[4] > 0 && R() < .02) g[4] = 0;
    weeks.push(snap());
  }
  return weeks;
}
async function viewProva(main) {
  const P = state.prova || (state.prova = { nA: 15000, nB: 13000, weeks: 4, profile: "equilibrato", start: (() => { const d = new Date(); d.setDate(d.getDate() - 7 * 3); return mondayISO(d); })(), seed: Math.floor(Math.random() * 1e6) });
  main.innerHTML = `<div class="head"><div><h1>Dati di prova</h1><p class="sub">Genera liste movimentazione e giacenze fittizie, con la stessa struttura dei file reali, per provare la piattaforma senza usare dati veri. I file vengono creati sul tuo computer: nulla viene salvato sulla piattaforma.</p></div></div>
  <form class="panel" id="gf" novalidate>
    <div class="grid3">
      <label class="field" for="gna">Codici nelle liste movimentazione<input type="text" id="gna" inputmode="numeric" value="${esc(fmtN(P.nA))}"></label>
      <label class="field" for="gnb">Codici nelle giacenze<input type="text" id="gnb" inputmode="numeric" value="${esc(fmtN(P.nB))}"></label>
      <label class="field" for="gpr">Situazione del magazzino<select id="gpr">${[["equilibrato", "Equilibrata"], ["alto", "Magazzino alto (molti eccessi)"], ["scarico", "Magazzino scarico (molti sotto scorta)"]].map(([v, l]) => `<option value="${v}"${v === P.profile ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="field" for="gw">Settimane<select id="gw">${[1, 2, 4, 6, 8].map(v => `<option value="${v}"${v === P.weeks ? " selected" : ""}>${v} ${v === 1 ? "settimana" : "settimane"}</option>`).join("")}</select></label>
      <label class="field" for="gs">Prima settimana (lunedì)<input type="date" id="gs" value="${P.start}"></label>
      <label class="field" for="gseed">Seme (stessi numeri = stessi dati)<input type="text" id="gseed" inputmode="numeric" value="${P.seed}"></label>
    </div>
    <div class="row"><button class="btn primary" type="submit" id="gbtn">Genera e scarica</button><span class="small muted" id="gstat"></span></div>
  </form>
  <section class="panel rules"><h3>Come sono fatti i file</h3><ul>
    <li><b>Lista movimentazione</b>: foglio «Liste Movimentazione», riga di titolo e le 16 colonne da DG a Scad, come nei file reali.</li>
    <li><b>Giacenze</b>: foglio «GIACENZA CROSS», con le 6 colonne da Stampanr.RC a GrpOmog.</li>
    <li>Codici con il formato dei codici ricambio, circa 40 tipologie (filtri, freni, carrozzeria, elettrico…), prezzi di listino e netti, SMin, SMax, consumo medio mensile e indice di regolarità coerenti tra loro. Circa il 4% dei codici a magazzino non compare nelle liste, come accade nella realtà.</li>
    <li>Con più settimane, i dati evolvono: vendite, arrivi degli ordini aperti, riordini e qualche revisione delle scorte. Così si vedono muoversi andamento, indicatori e confronti.</li>
    <li>Ricevi un unico file .zip con due Excel per ogni settimana. Caricali in «Nuovo ordine» o in «Carica settimana», una settimana alla volta e in ordine di data.</li></ul></section>`;
  $("#gf").onsubmit = async e => {
    e.preventDefault();
    const n = v => Math.round(parseNum(v));
    P.nA = Math.min(60000, Math.max(100, n($("#gna").value))); P.nB = Math.min(60000, Math.max(50, n($("#gnb").value)));
    P.weeks = +$("#gw").value; P.profile = $("#gpr").value; P.start = mondayISO(new Date($("#gs").value + "T12:00:00")); P.seed = n($("#gseed").value) || 1;
    if (!window.JSZip) { toast("Il generatore non si è caricato: ricarica la pagina."); return; }
    const b = $("#gbtn"), st = $("#gstat"); b.disabled = true;
    try {
      st.textContent = "Genero i dati…"; await new Promise(r => setTimeout(r, 30));
      const weeks = generateData(P), zip = new window.JSZip();
      for (let w = 0; w < weeks.length; w++) {
        const d = new Date(P.start + "T12:00:00"); d.setDate(d.getDate() + 7 * w); const iso = mondayISO(d), tag = `settimana_${String(isoWeek(iso)).padStart(2, "0")}_${iso}`;
        st.textContent = `Preparo la settimana ${w + 1} di ${weeks.length}…`; await new Promise(r => setTimeout(r, 30));
        const wa = XLSX.utils.book_new(), sa = XLSX.utils.aoa_to_sheet([["LISTA MOVIMENTAZIONE"], G_HDR_A].concat(weeks[w].A));
        XLSX.utils.book_append_sheet(wa, sa, "Liste Movimentazione");
        zip.file(`${tag}_1_lista_movimentazione.xlsx`, XLSX.write(wa, { bookType: "xlsx", type: "array" }));
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([G_HDR_B].concat(weeks[w].B)), "GIACENZA CROSS");
        zip.file(`${tag}_2_giacenze.xlsx`, XLSX.write(wb, { bookType: "xlsx", type: "array" }));
      }
      st.textContent = "Comprimo i file…";
      const blob = await zip.generateAsync({ type: "blob" }), url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = `dati_di_prova_${P.nA}_codici_${P.weeks}_settimane.zip`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      st.textContent = `Fatto: ${weeks.length * 2} file Excel in un unico .zip.`;
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
  <section class="panel"><h2>Concessionarie</h2>${dealers.length ? `<div class="tablebox"><table><thead><tr><th>Concessionaria</th><th>Codice</th><th class="num">Settimane caricate</th><th class="num">Utenti attivi</th><th></th></tr></thead><tbody>
    ${dealers.map(d => `<tr><td><b>${esc(d.name)}</b></td><td class="mono">${esc(d.code || "–")}</td><td class="num">${fmtN(d.n_weeks)}</td><td class="num">${fmtN(d.n_users)}</td><td><div class="row"><button class="btn sm" type="button" data-ed="${d.id}">Rinomina</button><button class="btn sm danger" type="button" data-wipe="${d.id}"${d.n_weeks ? "" : " disabled"}>Svuota dati</button><button class="btn sm danger" type="button" data-deld="${d.id}">Elimina</button></div></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Nessuna concessionaria.</p>`}</section>
  <section class="panel"><div class="bar"><div><h2>Settimane caricate</h2><p class="small muted">Ogni riga è un caricamento di liste movimentazione e giacenze. I file Excel originali non vengono conservati: eliminando una settimana si cancellano tutti i dati ricavati da quei file.</p></div>
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
    host.innerHTML = list.length ? `<div class="tablebox flagbox"><table><thead><tr><th><input type="checkbox" id="upall" aria-label="Seleziona tutte"></th><th>Concessionaria</th><th>Settimana</th><th>File caricati</th><th>Caricata da</th><th class="num">Codici</th></tr></thead><tbody>
      ${list.map(u => `<tr><td><input type="checkbox" data-up="${u.id}"${sel.has(u.id) ? " checked" : ""} aria-label="Seleziona"></td><td>${esc(u.dealer_name)}</td><td>${esc(weekLabel(u.week_date))}</td>
        <td class="small">${esc(u.file_a || "–")}<br><span class="muted">${esc(u.file_b || "")}</span></td><td class="small">${esc(u.uploaded_by_name || u.uploaded_by_user || "utente eliminato")}<br><span class="muted">${esc(new Date(u.uploaded_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }))}</span></td><td class="num">${fmtN(u.n_codes)}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">Nessuna settimana caricata.</p>`;
    const upd = () => { $("#updel").disabled = !sel.size; $("#updel").textContent = sel.size ? `Elimina selezionate (${fmtN(sel.size)})` : "Elimina selezionate"; };
    $$("[data-up]", host).forEach(c => c.onchange = () => { const id = +c.dataset.up; if (c.checked) sel.add(id); else sel.delete(id); upd(); });
    if ($("#upall")) $("#upall").onchange = e => { list.forEach(u => e.target.checked ? sel.add(u.id) : sel.delete(u.id)); renderUploads(); };
    upd();
  };
  $("#upd").onchange = () => { sel.clear(); renderUploads(); };
  renderUploads();
  $("#updel").onclick = async () => {
    const n = sel.size; if (!n) return;
    if (!await confirmTyped("Eliminare le settimane selezionate?", `Verranno cancellate <b>${fmtN(n)}</b> settimane con tutti i codici, gli indicatori e lo storico ricavati da quei file. L'operazione non si può annullare.`, "ELIMINA")) return;
    try { const r = await api("POST", "/api/snapshots/delete", { ids: [...sel] }); toast(`${fmtN(r.n)} settimane eliminate.`); state.snapshots = []; viewAdmin(main); } catch (x) { if (!x.silent) toast(x.message); }
  };
  $$("[data-wipe]", main).forEach(b => b.onclick = async () => {
    const d = dealers.find(x => x.id === +b.dataset.wipe);
    const ok = await confirmTyped(`Svuotare i dati di ${d.name}?`, `Verranno cancellate tutte le <b>${fmtN(d.n_weeks)}</b> settimane caricate e il relativo storico. Concessionaria e utenti restano. <label class="check" for="wflags"><input type="checkbox" id="wflags"> Cancella anche l'elenco dei codici su richiesta</label>`, d.name, () => $("#wflags") && $("#wflags").checked);
    if (!ok) return;
    try { const r = await api("DELETE", `/api/dealers/${d.id}/data${ok.extra ? "?flags=1" : ""}`); toast(`Cancellate ${fmtN(r.weeks)} settimane${r.flags ? ` e ${fmtN(r.flags)} codici su richiesta` : ""}.`); state.snapshots = []; viewAdmin(main); } catch (x) { if (!x.silent) toast(x.message); }
  });
  $$("[data-deld]", main).forEach(b => b.onclick = async () => {
    const d = dealers.find(x => x.id === +b.dataset.deld);
    if (!await confirmTyped(`Eliminare ${d.name}?`, `Verranno cancellati la concessionaria, le sue <b>${fmtN(d.n_weeks)}</b> settimane con tutto lo storico, l'elenco dei codici su richiesta e i suoi <b>${fmtN(d.n_users)}</b> utenti responsabili. L'operazione non si può annullare.`, d.name)) return;
    try { const r = await api("DELETE", `/api/dealers/${d.id}`); toast(`Concessionaria eliminata${r.users ? ` con ${fmtN(r.users)} utenti` : ""}.`); if (state.dealerId === d.id) { state.dealerId = null; try { localStorage.removeItem("ig_dealer"); } catch (e) {} } state.snapshots = []; state.me = await api("GET", "/api/me"); state.dealers = state.me.dealers; route(); } catch (x) { if (!x.silent) toast(x.message); }
  });
  $$("[data-delu]", main).forEach(b => b.onclick = async () => {
    if (!await confirmBox("Eliminare l'utente?", `L'utente <b>${esc(b.dataset.name)}</b> verrà cancellato definitivamente e non potrà più accedere. Le settimane che ha caricato restano. Se vuoi solo bloccarlo temporaneamente, usa «Disattiva».`, "Elimina", true)) return;
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
