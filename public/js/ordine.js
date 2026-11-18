"use strict";
/* PartsPlanner · tabella di conferma dell'ordine, Excel e PDF */

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
  const parts = [`${SCENARI[P.mode].t} · ${P.mode === "cover" ? orizzLabel(P.months) : fmtE(P.budget)}${P.mode === "free" && P.maxCover ? ` (al massimo ${oltreTxt(P.maxCover)})` : ""}${overTitle(P.mode, P.rules)}`];
  const F = P.filters;
  if (F.groups.length) parts.push(F.groups.map(g => `gruppo ${g === "X" ? "altri" : g} ${GROUPS[g]}`).join(", "));
  if (F.abc.length) parts.push("classe " + F.abc.map(c => c === "N" ? "senza consumo" : c).join("/"));
  if (F.dg.length) parts.push("DG " + F.dg.join(", "));
  if (F.q) parts.push(`«${F.q}»`);
  if (F.codes && F.codes.length) parts.push(`elenco di ${codici(F.codes.length)}`);
  if (P.minDemand) parts.push(`consumo ≥ ${fmtN(P.minDemand, 2)} pz/mese`);
  return parts.join(" · ");
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
  if (!amt && S.cut && S.cut.n) notes.push(`<div class="msg">La SMax frena <b>${codici(S.cut.n)}</b>: per coprire ${esc(orizzLabel(S.months))} servirebbero altri <b>${pezzi(S.cut.pieces)}</b> (${fmtE(S.cut.value)}), che porterebbero la giacenza oltre la SMax. Se succede spesso sugli stessi codici, la loro SMax è più bassa della domanda.</div>`);
  if (amt) {
    const parts = [S.smin.n ? `<b>${fmtE(S.smin.value)}</b> riportano alla SMin ${codici(S.smin.n)}` : "",
      S.prop.n ? `<b>${fmtE(S.prop.value)}</b> sono divisi in proporzione alle vendite regolari su ${codici(S.prop.n)}${S.prop.full ? ", tutti arrivati alla SMax" : `: ${fmtN(S.prop.level, 2)} mesi di vendita regolare per ciascuno, salvo chi si è fermato prima alla SMax`}` : "",
      S.extra && S.extra.n ? (S.extra.mode === "dyn"
        ? `<b>${fmtE(S.extra.value)}</b> vanno oltre la SMax su ${codici(S.extra.n)} con l'aumento dinamico: probabilità di vendita entro ${mm(S.extra.months)} di ogni pezzo comprato, almeno ${probTxt(S.extra.level).replace("oltre ", "")}`
        : `<b>${fmtE(S.extra.value)}</b> vanno oltre la SMax su ${codici(S.extra.n)} con l'${overTxt({ overMode: S.extra.mode === "lin" ? "reg" : S.extra.mode, overWeight: S.extra.w })}: ${S.extra.mode === "cons"
          ? `tutti salgono di altri ${fmtN(S.extra.level, 2)} mesi di scorta`
          : `altri ${fmtN(S.extra.level, 2)} mesi ${S.extra.mode === "mix" ? "di vendita pesata" : "di vendita regolare"} per ciascuno`}, salvo chi si è fermato prima a un tetto`) : ""].filter(Boolean);
    if (S.smin.short) notes.push(`<div class="msg err">L'importo non basta per riportare alla SMin tutti i codici che sono sotto: ne restano fuori <b>${fmtN(S.smin.short)}</b>. Passano prima i codici con la regolarità di vendita più alta e, a parità, con il consumo più alto.</div>`);
    notes.push(`<div class="msg">${parts.length ? "Come è composto l'ordine: " + parts.join("; ") + "." : "Nessun pezzo da pianificare con l'importo e i codici scelti."}</div>`);
    if (S.left >= 1 && S.prop.full && S.mode === "amount") notes.push(`<div class="msg err">Tutti i codici sono arrivati alla SMax: restano <b>${fmtE(S.left)}</b> non spesi. Per spenderli serve lo scenario «${esc(SCENARI.free.t)}», che può superare la SMax.</div>`);
    if (S.left >= 1 && S.mode === "free" && S.extra && S.extra.full) notes.push(`<div class="msg err">${S.extra.mode === "dyn" && S.extra.stop === "soglia"
      ? `Aumento dinamico: con probabilità minima di vendita ${fmtN(S.extra.prob)}% entro ${mm(S.extra.months)} non ci sono altri pezzi da comprare. Restano <b>${fmtE(S.left)}</b> non spesi: oltre questa cifra il rischio di non rivendere supera quello che hai scelto. Per spenderli abbassa la probabilità minima di vendita, allunga i mesi oppure allarga i codici.`
      : S.extra.mode === "dyn" && S.extra.stop === "limite"
      ? `Aumento dinamico: il calcolo si è fermato al numero massimo di pezzi che può assegnare. Restano <b>${fmtE(S.left)}</b> non spesi: controlla l'importo e i consumi dei codici.`
      : S.extra.limit
      ? `Con il limite di ${oltreTxt(S.extra.limit)} per codice restano <b>${fmtE(S.left)}</b> non spesi: alza o togli il limite nelle regole, oppure allarga i codici.`
      : `Nessun codice con vendite regolari può ricevere il resto: restano <b>${fmtE(S.left)}</b> non spesi. Allarga i codici o i filtri.`}</div>`);
    if (!S.prop.full && S.need > S.spent + 0.01) notes.push(`<div class="msg">Portare tutti i codici alla SMax costerebbe <b>${fmtE(S.need)}</b>: l'importo ne copre il ${pct(S.spent, S.need)}.</div>`);
    if (S.no_reg) notes.push(`<div class="msg">Nei dati caricati manca l'indice di regolarità delle vendite: la proporzione usa solo il consumo medio mensile.</div>`);
  }
  host.innerHTML = `<div class="scen-title"><h2>${esc(R.title)}</h2><p class="small muted">${esc(stockNote(R))}.</p></div>
  <div id="rbox"></div>
  <section class="tiles">
    <div class="tile"><span class="k">Valore dell'ordine</span><span class="v">${fmtE(S.spent)}</span><span class="s">${amt ? `su ${fmtE(S.budget)} · restano ${fmtE(S.left)}` : `per coprire ${esc(orizzLabel(S.months))} di vendite`}</span></div>
    <div class="tile neutral"><span class="k">Righe d'ordine</span><span class="v">${fmtN(S.n_lines)}</span><span class="s">${pezzi(S.pieces)} · ${codici(S.n_cands)} nel perimetro</span></div>
    <div class="tile bad"><span class="k">Codici a zero coperti</span><span class="v">${fmtN(S.zero_cov)}<span class="small muted"> / ${fmtN(S.zero_tot)}</span></span><span class="s">${pct(S.zero_cov, S.zero_tot)} riportati almeno a SMin</span></div>
    <div class="tile warn"><span class="k">Sotto scorta coperti</span><span class="v">${fmtN(S.sotto_cov)}<span class="small muted"> / ${fmtN(S.sotto_tot)}</span></span><span class="s">${pct(S.sotto_cov, S.sotto_tot)} riportati almeno a SMin</span></div>
  </section>
  ${S.list ? `<div class="msg">Elenco di ${codici(S.list.n)}: ${fmtN(S.list.found)} trovati nei dati, ${fmtN(S.list.n_missing)} non trovati${S.list.no_need ? `, ${fmtN(S.list.no_need)} già coperti, esclusi o senza fabbisogno` : ""}.${S.list.n_missing ? `<br><span class="small">Non trovati: <span class="mono">${S.list.missing.map(esc).join(", ")}${S.list.n_missing > S.list.missing.length ? "…" : ""}</span></span>` : ""}</div>` : ""}
  ${S.excluded && (S.excluded.flag + S.excluded.noparams + S.excluded.low + (S.excluded.minline || 0)) ? `<div class="msg">Esclusi: ${[S.excluded.noparams ? `${fmtN(S.excluded.noparams)} con consumo ma non tenuti a scorta (SMin e SMax a zero)` : "", S.excluded.flag ? `${fmtN(S.excluded.flag)} segnati su richiesta` : "", S.excluded.low ? `${fmtN(S.excluded.low)} sotto la soglia di consumo` : "", S.excluded.minline ? `${righe(S.excluded.minline)} sotto il valore minimo` : ""].filter(Boolean).join(", ")}.</div>` : ""}
  ${notes.join("\n  ")}
  ${S.by_group.length > 1 ? `<section class="panel"><h3>Valore dell'ordine per gruppo principale</h3><div id="obg"></div></section>` : ""}
  ${R.lines.length ? `<section class="panel" id="odec"></section>` : `<section class="panel"><p class="muted">Nessun codice da ordinare in questo scenario.</p></section>`}`;
  renderRules($("#rbox", host), S.mode, alertOnly => { if (alertOnly) { renderProposal(sel, recalc); return; } if (recalc) recalc(); else $("#of").requestSubmit(); });
  if ($("#obg", host)) bars($("#obg", host), S.by_group.map(g => ({ label: `${g.id === "X" ? "–" : g.id} ${g.label}`, value: g.value, sub: `${righe(g.n)}` })), { fmt: fmtE });
  if ($("#odec", host)) renderDecision($("#odec", host), R, recalc, sel);
}

/* ============ Tabella di conferma: Sì / No per riga ============ */
const covTxt = v => v == null ? "–" : fmtN(v, 1);
function decKey(R) { return `ig_dec_${state.dealerId}_${R.week}_${R.at || ""}_${R.title}`; }
function lineAlerts(l, th) {
  const a = [];
  // quantità cambiata a mano oltre la SMax: si segnala sempre, anche quando la copertura è nei limiti
  if (l.edited && l.smax > 0 && l.disp + l.qty > l.smax) a.push(`Oltre la SMax di ${pezzi(l.disp + l.qty - l.smax)} dopo la modifica`);
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
// scelte in blocco nella tabella di conferma, con la spiegazione che compare toccando la «i»
const BULK = [
  ["okNoAlert", "Sì a tutte senza avviso", "Accetta le righe ancora da decidere che non hanno un avviso. Le righe con un avviso restano da decidere e le scelte già fatte non cambiano."],
  ["noAlert", "No a tutte con avviso", "Rifiuta tutte le righe che hanno un avviso: copertura dopo l'ordine oltre la soglia scelta, nessuna domanda registrata, oppure quantità cambiata a mano oltre la SMax. Le altre righe non cambiano."],
  ["allSi", "Sì a tutte", "Accetta tutte le righe, anche quelle con un avviso e quelle che avevi già rifiutato. Le righe portate a zero pezzi restano rifiutate."]
];
/* Ordinamento della tabella di conferma: si tocca un'intestazione. I numeri partono dal più grande, i testi dalla A.
 * Di base: valore netto, dal più grande al più piccolo. Le celle vuote restano in fondo. */
const DEC_SORT = ["rank", "code", "descr", "grp", "giac", "ord", "smin", "smax", "qty_sold", "last_sale", "cons_mese", "vgiac", "listino", "cost", "cover_before", "qty", "value", "cover_after", "alert", "dec"];
const DEC_TEXT = new Set(["code", "descr", "grp", "dec"]);
function decVal(r, k) {
  const l = r.l;
  if (k === "vgiac") return l.prev_giac == null ? null : l.giac - l.prev_giac;
  if (k === "alert") return r.al.length;
  if (k === "dec") return r.d || null;
  if (k === "last_sale") return l.last_sale ? String(l.last_sale) : null;
  const v = l[k]; return v === undefined || v === "" ? null : v;
}
function sortDec(rows, S) {
  const txt = DEC_TEXT.has(S.k) || S.k === "last_sale";
  return rows.slice().sort((a, b) => {
    const x = decVal(a, S.k), y = decVal(b, S.k);
    if (x == null || y == null) return x == null && y == null ? a.l.rank - b.l.rank : x == null ? 1 : -1;
    const c = txt ? String(x).localeCompare(String(y), "it", { numeric: true }) : x - y;
    return c * S.dir || a.l.rank - b.l.rank;
  });
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
  R.decSort = R.decSort || { k: "value", dir: -1 };
  // l'ordine si calcola quando si sceglie la colonna; cambiare una quantità o una decisione non sposta le righe
  let rows = R.lines.map(l0 => { const l = effLine(R, l0); return { l, al: lineAlerts(l, th), d: R.dec[l.code] || "" }; });
  const sk = R.decSort.k + ":" + R.decSort.dir;
  if (!R.decOrder || R.decOrderKey !== sk || R.decOrder.length !== rows.length) { R.decOrder = sortDec(rows, R.decSort).map(r => r.l.code); R.decOrderKey = sk; }
  const pos = new Map(R.decOrder.map((c, i) => [c, i])); rows = rows.slice().sort((a, b) => (pos.get(a.l.code) ?? 1e9) - (pos.get(b.l.code) ?? 1e9));
  const nEd = rows.filter(r => r.l.edited).length;
  const cnt = { tutte: rows.length, alert: rows.filter(r => r.al.length).length, todo: rows.filter(r => !r.d).length, si: rows.filter(r => r.d === "si").length, no: rows.filter(r => r.d === "no").length };
  const acc = rows.filter(r => r.d === "si"), accV = acc.reduce((t, r) => t + r.l.value, 0), accQ = acc.reduce((t, r) => t + r.l.qty, 0);
  const vis = rows.filter(r => R.decFilter === "tutte" || (R.decFilter === "alert" && r.al.length) || (R.decFilter === "todo" && !r.d) || r.d === R.decFilter);
  const grpTxt = l => `${l.grp === "X" ? "–" : l.grp} ${GROUPS[l.grp] || ""}`.trim();
  const filters = [["tutte", "Tutte"], ["alert", "Con avviso"], ["todo", "Da decidere"], ["si", "Accettate"], ["no", "Rifiutate"]];
  host.innerHTML = `<div class="bar"><div><h2>Pianificazione da confermare</h2><p class="small muted">Per ogni riga scegli <b>Sì</b> o <b>No</b> nell'ultima colonna. Puoi cambiare la quantità: valore della riga, copertura e totali si aggiornano subito, e cambiare la quantità accetta la riga. Codice e colonne da «Quantità» in poi restano fermi mentre scorri la tabella. «Perché» mostra come è stata calcolata la proposta. Quando hai deciso tutte le righe puoi scaricare l'ordine confermato in Excel o PDF.</p></div>
      <label class="field" for="alth">Avviso se la copertura dopo l'ordine supera<select id="alth">${[1, 2, 3, 4, 6, 9, 12].map(v => `<option value="${v}"${v === th ? " selected" : ""}>${v} ${v === 1 ? "mese" : "mesi"}</option>`).join("")}</select></label></div>
    <div class="decsum"><div><span class="k">Righe decise</span><b>${fmtN(cnt.si + cnt.no)} / ${fmtN(cnt.tutte)}</b></div><div><span class="k">Accettate</span><b>${righe(cnt.si)} · ${pezzi(accQ)} · ${fmtE(accV)}</b></div>
         <div><span class="k">Rifiutate</span><b>${righe(cnt.no)}</b></div><div><span class="k">Con avviso</span><b class="${cnt.alert ? "alerttxt" : ""}">${righe(cnt.alert)}</b></div>
         <div><span class="k">Quantità cambiate</span><b>${righe(nEd)}</b>${nEd ? `<button class="link small" type="button" id="qreset">Torna alle quantità proposte</button>` : ""}</div>
    </div>
    <div class="bar"><div class="chips" role="group" aria-label="Filtra le righe">${filters.map(([k, l]) => `<button type="button" class="chip" data-df="${k}" aria-pressed="${R.decFilter === k}">${l}<span class="n">${fmtN(cnt[k])}</span></button>`).join("")}</div>
      <div class="row">${BULK.map(([k, l, i]) => `<span class="bulk"><button class="btn sm" type="button" data-bulk="${k}">${l}</button><button class="ibtn" type="button" data-binfo="${k}" aria-label="Cosa fa «${l}»" aria-expanded="${R.binfo === k}" title="${esc(i)}">i</button></span>`).join("")}<button class="link" type="button" data-bulk="reset">Azzera</button></div></div>
    ${R.binfo ? `<p class="msg small" id="binfo">${esc((BULK.find(b => b[0] === R.binfo) || [])[2] || "")}</p>` : ""}
    ${vis.length ? `<div class="tablebox"><table class="dectab"><thead><tr><th class="num" title="Priorità con cui la proposta ha speso l'importo">#</th><th>Codice</th><th>Descrizione</th><th>Gruppo</th><th class="num">Giacenza</th><th class="num">Ord. aperti</th><th class="num">SMin</th><th class="num">SMax</th>${MOVE_TH}<th class="num">Listino</th><th class="num">Netto</th><th class="num">Copertura attuale</th><th class="num" data-fzstart>Quantità</th><th class="num">Valore netto</th><th class="num">Copertura dopo</th><th>Avviso</th><th>Accetto</th></tr></thead><tbody>
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
        <td><div class="yn" role="group" aria-label="Accetto ${esc(l.code)}"><button type="button" class="ynb si" data-yn="si" data-code="${esc(l.code)}" aria-pressed="${d === "si"}">Sì</button><button type="button" class="ynb no" data-yn="no" data-code="${esc(l.code)}" aria-pressed="${d === "no"}">No</button></div></td></tr>${R.why === l.code ? `<tr class="whyrow"><td colspan="21"><div class="whybox"><b>Come è calcolata la quantità di ${esc(l.code)}</b>${whyHtml(l, R)}</div></td></tr>` : ""}`).join("")}
    </tbody></table></div>${vis.length > R.decShow ? `<div class="pager"><span>Mostrate ${righe(R.decShow)} su ${fmtN(vis.length)}.</span><button class="btn sm" type="button" id="dmore">Mostra altre 200</button></div>` : ""}` : `<p class="muted">Nessuna riga in questa vista.</p>`}
    <div class="decexp"><div class="small muted" id="dexpmsg">${cnt.todo ? `${cnt.todo === 1 ? "Manca" : "Mancano"} <b>${righe(cnt.todo)}</b> da decidere prima di scaricare l'ordine confermato.` : cnt.si ? `Ordine confermato pronto: ${righe(cnt.si)}, ${fmtE(accV)}.` : "Nessuna riga accettata."}</div>
      <div class="row"><button class="btn primary" type="button" id="dxls"${cnt.todo || !cnt.si ? " disabled" : ""}>Ordine confermato in Excel</button><button class="btn primary" type="button" id="dpdf"${cnt.todo || !cnt.si ? " disabled" : ""}>Ordine confermato in PDF</button><button class="btn" type="button" id="oxls">Proposta completa in Excel</button></div></div>`;
  // intestazioni ordinabili: freccia sulla colonna scelta
  $$("table.dectab thead th", host).forEach((th, i) => {
    const k = DEC_SORT[i]; if (!k) return;
    const on = R.decSort.k === k;
    th.classList.add("sortable"); th.tabIndex = 0; th.setAttribute("aria-sort", on ? (R.decSort.dir < 0 ? "descending" : "ascending") : "none");
    if (on) th.insertAdjacentHTML("beforeend", `<span class="sarr" aria-hidden="true">${R.decSort.dir < 0 ? "▼" : "▲"}</span>`);
    if (!th.title) th.title = "Tocca per ordinare";
    const go = () => { R.decSort = on ? { k, dir: -R.decSort.dir } : { k, dir: DEC_TEXT.has(k) ? 1 : -1 }; R.decShow = 100; rer(); };
    th.onclick = go; th.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  });
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
  $$("[data-binfo]", host).forEach(b => b.onclick = () => { R.binfo = R.binfo === b.dataset.binfo ? null : b.dataset.binfo; rer(); });
  $$("[data-bulk]", host).forEach(b => b.onclick = async () => {
    const k = b.dataset.bulk;
    if (k === "reset") { if (!await confirmBox("Azzerare le decisioni?", "Tutte le righe torneranno da decidere e alle quantità proposte.", "Azzera", true)) return; R.dec = {}; R.qedit = {}; }
    // una riga portata a zero resta rifiutata: non c'è niente da ordinare
    else rows.forEach(r => { if (r.l.qty === 0) { R.dec[r.l.code] = "no"; return; } if (k === "allSi" || (k === "okNoAlert" && !r.al.length)) { if (!R.dec[r.l.code] || k === "allSi") R.dec[r.l.code] = "si"; } else if (k === "noAlert" && r.al.length) R.dec[r.l.code] = "no"; });
    saveDec(); rer();
  });
  if ($("#dmore", host)) $("#dmore", host).onclick = () => { R.decShow += 200; rer(); };
  $$("[data-c]", host).forEach(b => b.onclick = () => { state.codice = b.dataset.c; go("codice"); });
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
  doc.text(`${righe(M.n)} · ${pezzi(M.q)} · valore netto ${fmtE2(M.v)}${M.vl ? ` · a listino ${fmtE2(M.vl)}` : ""}`, W - 14, 23, { align: "right" });
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
    didDrawPage: d => { doc.setFontSize(8); doc.setTextColor(120); doc.text(`Pagina ${doc.internal.getNumberOfPages()}`, W - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" }); doc.text("PartsPlanner", 14, doc.internal.pageSize.getHeight() - 8); }
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
