"use strict";
/* Parts Planning · barre orizzontali e pagina Scheda codice */

/* ============ Barre orizzontali ============ */
function bars(host, items, opt = {}) {
  const max = Math.max(...items.map(i => i.value), 0) || 1;
  host.innerHTML = `<div class="bars">${items.map((i, k) => `<div class="brow" title="${esc(i.label)}: ${esc(opt.fmt ? opt.fmt(i.value) : fmtN(i.value))}${i.sub ? " · " + esc(i.sub) : ""}">
    <span class="bl">${esc(i.label)}</span><span class="btrack"><span class="bfill" data-k="${k}"></span></span><span class="bv">${esc(opt.fmt ? opt.fmt(i.value) : fmtN(i.value))}${i.sub ? `<span class="bs">${esc(i.sub)}</span>` : ""}</span></div>`).join("")}</div>`;
  $$(".bfill", host).forEach(el => { const i = items[+el.dataset.k]; el.style.width = Math.max(i.value > 0 ? 0.6 : 0, i.value / max * 100) + "%"; el.style.background = i.color || opt.color || "var(--chart)"; });
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
