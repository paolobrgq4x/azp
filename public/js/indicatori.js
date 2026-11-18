"use strict";
/* Parts Planning · grafici, pagine Indicatori e Scheda codice */

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
