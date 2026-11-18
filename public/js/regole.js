"use strict";
/* PartsPlanner · scenari, regole di riordino ed equalizzatore, spiegazione delle quantità */

/* ============ Procedura guidata: Nuovo ordine ============
 * 1 Obiettivo -> 2 Liste movimentazione -> 3 Giacenze -> 4 Codici -> 5 Risultato
 * Gli obiettivi sono i tre scenari d'ordine:
 *  cover  : acquisti per coprire un periodo (1, 2 o 3 mesi), rispettando SMin e SMax
 *  amount : acquisti per un importo, rispettando SMin e SMax
 *  free   : acquisti per un importo libero, con facoltà di andare oltre la SMax
 */
const WSTEPS = ["Obiettivo", "Liste movimentazione", "Giacenze", "Codici", "Risultato"];
const ORIZZ = [[1, "1 mese"], [2, "2 mesi"], [3, "3 mesi"]];
// tetto per codice oltre la SMax: da 1 a 6 mesi e, dopo i 6 mesi, «nessun limite» (lo stesso ordine del cursore nelle regole)
const COVER_MAX = [[1, "1 mese"], [2, "2 mesi"], [3, "3 mesi"], [4, "4 mesi"], [5, "5 mesi"], [6, "6 mesi"], [0, "nessun limite"]];
const oltreTxt = m => `${m === 1 ? "1 mese" : fmtN(m) + " mesi"} oltre la SMax`;
/* Oltre la SMax, nell'importo libero, si sale in uno di quattro modi, a scelta di chi ordina:
 *  cons aumento per consumo: tutti i codici salgono degli stessi mesi di scorta
 *  reg  aumento per regolarità: i mesi di scorta in più crescono con la regolarità (consumo × regolarità ÷ 12)
 *  mix  aumento misto: come per regolarità, con il peso della regolarità scelto da chi ordina (0% = per consumo, 100% = per regolarità)
 *  dyn  aumento dinamico: per ogni pezzo in più si stima la probabilità di venderlo entro i mesi scelti; si comprano i pezzi
 *       dal più sicuro al meno sicuro, finché dura l'importo e finché la probabilità resta sopra la certezza minima */
const OVER = [["cons", "Aumento per consumo", "tutti salgono degli stessi mesi di scorta"], ["reg", "Aumento per regolarità", "sale di più chi vende con continuità"],
  ["mix", "Aumento misto", "bilanci tu consumo e regolarità"], ["dyn", "Aumento dinamico", "prima i pezzi più sicuri da rivendere"]];
const OVER_W = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
// Leva dell'aumento misto: a sinistra il consumo, a destra la regolarità. Il valore salvato è il peso della regolarità (overWeight).
const levTxt = w => `${fmtN(100 - w)}% consumo · ${fmtN(w)}% regolarità`;
const leverHtml = (id, w) => `<div class="lever"><label for="${id}">Bilanciamento: <b id="${id}v">${levTxt(w)}</b></label>
  <div class="levrow"><span>Consumo</span><input type="range" id="${id}" min="0" max="${OVER_W.length - 1}" step="1" value="${Math.max(0, OVER_W.indexOf(w))}" aria-valuetext="${levTxt(w)}"><span>Regolarità</span></div></div>`;
function leverBind(el, onSet) {
  if (!el) return;
  const out = document.getElementById(el.id + "v");
  el.oninput = () => { const t = levTxt(OVER_W[+el.value]); out.textContent = t; el.setAttribute("aria-valuetext", t); };
  el.onchange = () => onSet(OVER_W[+el.value]);
}
const overMode = r => (OVER.some(o => o[0] === r.overMode) ? r.overMode : "reg");
const SELL_MONTHS = [2, 3, 4, 6, 9, 12], SELL_PROB = [50, 60, 70, 80, 90, 95, 99];
const overTxt = r => ({ dyn: `aumento dinamico (rivendita entro ${mm(r.sellMonths)}, certezza minima ${fmtN(r.sellProb)}%)`, cons: "aumento per consumo",
  mix: `aumento misto (${levTxt(r.overWeight)})`, reg: "aumento per regolarità" })[overMode(r)];
const overTitle = (mode, r) => (mode !== "free" || !r ? "" : " · " + ({ dyn: `aumento dinamico (${mm(r.sellMonths)}, ${fmtN(r.sellProb)}%)`, cons: "aumento per consumo",
  mix: `aumento misto (${levTxt(r.overWeight)})`, reg: "aumento per regolarità" })[overMode(r)]);
const OVER_DESC = {
  cons: "Per consumo: tutti i codici salgono degli stessi mesi di scorta; la regolarità non conta.",
  reg: "Per regolarità: i mesi di scorta in più crescono con la regolarità. Un codice che vende un mese su due riceve la metà dei mesi di uno che vende tutti i mesi.",
  mix: "Misto: con la leva scegli il bilanciamento tra consumo e regolarità. Tutta a sinistra è come per consumo, tutta a destra come per regolarità.",
  dyn: "Dinamico: si comprano prima i pezzi più sicuri da rivendere. Sale di più chi vende tanto e con regolarità; chi alla SMax ha già molti mesi di scorta sale poco o niente." };
// probabilità scritta per difetto, così un pezzo sotto la soglia non sembra mai sopra
const probTxt = v => (v >= 0.995 ? "oltre 99%" : v < 0.01 ? "meno di 1%" : Math.floor(v * 100 + 1e-9) + "%");
const SCENARI = {
  cover: { t: "Acquisti per coprire un periodo", s: "Copro un periodo", d: "Ordino quanto serve per coprire 1, 2 o 3 mesi di vendite. Nessun codice resta sotto la SMin e nessuno supera la SMax." },
  amount: { t: "Acquisti per un importo", s: "Spendo un importo", d: "Spendo una cifra: prima riporto alla SMin i codici che sono sotto, poi divido il resto in proporzione alle vendite regolari. Nessun codice supera la SMax." },
  free: { t: "Acquisti per un importo libero", s: "Importo libero", d: "Come l'importo, con la facoltà di andare oltre la SMax: quello che avanza dopo aver portato tutti i codici alla SMax viene speso comunque. Scegli tu come: per consumo, per regolarità, misto o dinamico." }
};

/* ============ Regole di riordino ============
 * Le sceglie ogni utente e restano salvate per lui. Valgono per tutte le proposte d'ordine.
 * SMin e SMax non sono regole: le rispetta lo scenario scelto (solo l'importo libero può superare la SMax). */
const RULES_DEF = { months: 1, consAdj: 0, round: "nearest", minDemand: 0, exclOnDemand: true, minLine: 0, maxCover: 0, alertMonths: 3, regWeight: 100, maxTotal: 0,
  overMode: "reg", overWeight: 50, sellMonths: 6, sellProb: 80 };
const ROUND_L = { nearest: "al pezzo più vicino", up: "per eccesso", down: "per difetto" };
function rules() {
  if (!state.rules) { state.rules = { ...RULES_DEF, ...((state.me && state.me.user.rules) || {}) }; state.rules.overMode = overMode(state.rules); }   // il vecchio «lin» vale «per regolarità»
  return state.rules;
}
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
  if (mode === "free") parts.push(overTxt(r), r.maxCover ? `al massimo ${oltreTxt(r.maxCover)}` : "nessun limite oltre la SMax");
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
  { k: "sellMonths", name: "Rivendere entro", on: (m, r) => m === "free" && r.overMode === "dyn", vals: SELL_MONTHS, fmt: mm, help: "Solo con l'aumento dinamico: entro quanti mesi vuoi rivendere i pezzi comprati oltre la SMax. Più mesi, più pezzi ammessi. Esempio: un codice che vende 2 pezzi al mese in 6 mesi ne vende in media 12, in 12 mesi 24." },
  { k: "sellProb", name: "Certezza minima", on: (m, r) => m === "free" && r.overMode === "dyn", vals: SELL_PROB, fmt: v => fmtN(v) + "%", help: "Solo con l'aumento dinamico: la probabilità minima che ogni pezzo in più sia venduto entro i mesi scelti. I pezzi sotto questa soglia non si comprano e quella parte di importo resta non spesa. Esempio: 80% vuol dire quattro volte su cinque." },
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
      ${free ? `<div class="rctl"><span class="rl">Come salire oltre la SMax <button type="button" class="info" data-info="over" aria-label="Che cos'è: i quattro modi oltre la SMax">i</button></span>${seg("overMode", overMode(r), OVER.map(([v, l]) => [v, l.replace("Aumento ", "")]))}
        <p class="small muted">${OVER_DESC[overMode(r)]}</p>${overMode(r) === "mix" ? leverHtml("r_lev", r.overWeight) : ""}</div>` : ""}
    </div>
    <div class="eq" role="group" aria-label="Equalizzatore delle regole">${EQ.filter(e => e.on(mode, r)).map(e => {
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
  EQ.filter(e => e.on(mode, r)).forEach(e => {
    const el = $("#eq_" + e.k, host), out = $("#eqv_" + e.k, host);
    el.oninput = () => { const t = e.fmt(e.vals[+el.value]); out.textContent = t; el.setAttribute("aria-valuetext", t); };
    el.onchange = () => set(e.k, e.vals[+el.value], e.k === "alertMonths");
  });
  const INFO_EXTRA = {
    smm: ["SMin e SMax", "Sono le scorte minima e massima di ogni codice, come arrivano dalla lista movimentazione. Nessun codice resta sotto la SMin; la SMax si supera solo nello scenario «" + SCENARI.free.t + "». Esempio: SMin 8, SMax 30, disponibili 5 → mancano 3 pezzi per la SMin."],
    round: ["Arrotondamento", "Nello scenario a periodo il consumo del periodo diventa un numero intero di pezzi. Esempio: 6,4 pezzi → 6 al più vicino, 7 per eccesso, 6 per difetto. La SMin resta comunque il minimo."],
    over: ["I quattro modi oltre la SMax", "Valgono solo oltre la SMax, nell'importo libero. Per consumo: tutti salgono degli stessi mesi di scorta. Per regolarità: i mesi in più crescono con la regolarità. Misto: con una leva scegli il bilanciamento tra consumo e regolarità. Dinamico: per ogni pezzo in più la piattaforma stima la probabilità di venderlo entro i mesi che scegli e compra i pezzi dal più sicuro al meno sicuro; si ferma quando finisce l'importo o quando la probabilità scende sotto la certezza minima. Esempio con 6 mesi e 80%: chi vende 100 pezzi al mese può arrivare a circa 5,8 mesi di scorta, chi ne vende 1 a 4 mesi, chi ne vende 0,2 non riceve niente."],
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
  leverBind($("#r_lev", host), v => set("overWeight", v));
  $("#r_reset", host).onclick = () => { Object.assign(rules(), RULES_DEF); saveRules(); onChange(); };
}
/* Il conto di una riga, passo per passo */
// Spiegazione della quantità proposta, in passi semplici: da dove parte il codice, quanto vende, come è stato diviso l'importo, dove si ferma.
function whyHtml(l) {
  const c = l.calc, n1 = v => fmtN(v, 1), n2 = v => fmtN(v, 2), li = [];
  const mesi = m => `${fmtM(m)} ${m === 1 ? "mese" : "mesi"}`;
  const ha = (d, g, o) => (d ? `Ne ha già <b>${fmtN(d)}</b>${o ? ` (${fmtN(g)} a magazzino + ${fmtN(o)} già ordinati)` : ""}` : "Non ne ha nessuno");
  const lv = v => fmtN(v, v < 10 ? 2 : 1);   // livello comune in mesi: due decimali quando è piccolo, così il prodotto torna
  // il prodotto è calcolato sui valori non arrotondati: si scrive con un decimale e «circa», così torna con i numeri mostrati
  const f1 = v => fmtN(Math.floor(v * 10 + 1e-9) / 10, 1);   // per difetto, così «circa 34,9 → 34» non diventa «circa 35,0 → 34»
  const interi = (x, q) => (q === 0 ? `circa ${f1(x)}: non arriva a un pezzo intero, quindi <b>nessun pezzo</b>` : `circa ${f1(x)} → <b>${pezzi(q)}</b>${Math.abs(x - q) > 0.05 ? " (si ordinano solo pezzi interi)" : ""}`);
  if (c && c.kind === "cover") {
    li.push(`Vende in media <b>${n2(c.cons)}</b> pezzi al mese${c.adj ? `; con la correzione del ${pctTxt(c.adj)} si conta <b>${n2(c.ce)}</b>` : ""}.`);
    li.push(`Per coprire ${mesi(c.months)} servono ${n2(c.ce)} × ${fmtM(c.months)} = ${n2(c.raw)} pezzi, arrotondati ${ROUND_L[c.round]}: <b>${fmtN(c.rounded)}</b>.`);
    if (c.smin > c.rounded) li.push(`Non si scende sotto la SMin, che è ${fmtN(c.smin)}: l'obiettivo diventa <b>${fmtN(c.base)}</b>.`);
    if (c.capped) li.push(`Non si supera la SMax, che è ${fmtN(c.smax)}: l'obiettivo diventa <b>${fmtN(Math.min(c.base, c.smax))}</b>.`);
    if (c.tcap) li.push(`Tetto di copertura di ${mesi(c.tcap)}: al massimo ${n2(c.ce)} × ${fmtM(c.tcap)} = ${n2(c.ce * c.tcap)} pezzi in tutto, quindi l'obiettivo diventa <b>${fmtN(c.target)}</b>${c.target === c.smin ? " (la SMin)" : ""}.`);
    li.push(`${ha(c.disp, c.giac, c.ord)}: ne ordina ${fmtN(c.target)} − ${fmtN(c.disp)} = <b>${pezzi(c.target - c.disp)}</b>.`);
  } else if (c && c.kind === "amount") {
    li.push(`${ha(l.disp, l.giac, l.ord)}. SMin ${fmtN(l.smin)}, SMax ${fmtN(l.smax)}.`);
    if (c.smin_qty) li.push(`Era sotto la SMin: per prima cosa riceve <b>${pezzi(c.smin_qty)}</b> per tornarci${l.partial ? ", ma l'importo non è bastato per arrivarci del tutto" : ""}.`);
    // la «vendita regolare» è il metro con cui si divide l'importo: chi vende tutti i mesi conta per intero, chi vende ogni tanto conta meno
    const metro = c.has_reg
      ? (c.w === 0 ? `Vende in media <b>${n2(c.vr)}</b> pezzi al mese. Con il peso della regolarità a 0% l'importo si divide solo in base a questo.`
        : `Vende in media ${n2(c.ce)} pezzi al mese, ma non tutti i mesi (regolarità ${n2(c.reg)} su 12). Per dividere l'importo conta quindi come se ne vendesse <b>${n2(c.vr)}</b> al mese${c.w == null || c.w === 100 ? ` (${n2(c.ce)} × ${n2(c.reg)} ÷ 12)` : ` (peso della regolarità ${fmtN(c.w)}%)`}: chi vende in modo regolare riceve di più.`)
      : `Vende in media <b>${n2(c.vr)}</b> pezzi al mese. Nei dati manca la regolarità, quindi l'importo si divide in base a questo.`;
    li.push(metro);
    const p2 = c.p2, p3 = c.p3;
    if (!(c.vr > 0)) li.push("Non vende: non riceve una parte dell'importo.");
    else if (p2 && !p2.room) li.push(p2.tcap ? `È già al tetto di copertura di ${mesi(p2.tcap)}: non riceve altro.` : c.smin_qty ? "Con la SMin è già arrivato alla SMax: fino alla SMax non c'è altro spazio." : "È già alla SMax: fino alla SMax non c'è altro spazio.");
    else if (p2 && p2.capped) li.push(`Con la sua parte dell'importo riceve <b>${pezzi(p2.qty)}</b> e arriva ${p2.tcap ? `al tetto di copertura di ${mesi(p2.tcap)}` : "alla SMax"}${p3 && p3.qty ? "" : ": lì si ferma"}.`);
    else if (p2) {
      const ideal = c.level * c.vr, whole = Math.min(p2.qty, Math.floor(ideal + 1e-9)), more = p2.qty - whole;
      li.push(`L'importo è stato diviso tra tutti i codici in proporzione a queste vendite: ognuno ha ricevuto <b>${lv(c.level)} mesi</b> delle sue vendite. Per questo codice ${lv(c.level)} × ${n2(c.vr)} = ${interi(ideal, whole)}${more > 0 ? `, più <b>${pezzi(more)}</b> con l'ultimo avanzo dell'importo` : ""}.`);
    }
    if (p3 && p3.dyn && c.sell) {
      // aumento dinamico: la probabilità di vendere il primo e l'ultimo pezzo comprato, e quella del pezzo a cui ci si è fermati
      const H = mesi(c.sell.months), last = p3.from + p3.qty - 1;
      const intro = `Oltre la SMax, aumento dinamico: si comprano prima i pezzi più sicuri da rivendere. A quel ritmo in ${H} vende in media circa ${n1(p3.mu)} pezzi; con quelli fin qui ne ha ${fmtN(p3.from - 1)}.`;
      if (p3.qty > 0) {
        li.push(intro);
        li.push(`Probabilità di vendere entro ${H} il pezzo numero ${fmtN(p3.from)}: ${probTxt(p3.pFirst)}.${p3.qty > 1 ? ` Il numero ${fmtN(last)}: ${probTxt(p3.pLast)}.` : ""}${p3.pNext == null ? "" : p3.stop === "soglia" ? ` Il numero ${fmtN(last + 1)}: ${probTxt(p3.pNext)}, sotto la certezza minima (${fmtN(c.sell.prob)}%): lì si ferma.` : ` Il numero ${fmtN(last + 1)} avrebbe ${probTxt(p3.pNext)}, ma l'importo è finito prima.`} Riceve <b>${pezzi(p3.qty)}</b>.`);
        if (p3.stop === "tetto") li.push(p3.tcap ? `Si ferma al tetto di copertura di ${mesi(p3.tcap)}.` : c.limit ? `Si ferma al tetto di ${mesi(c.limit)} di vendite medie oltre la SMax.` : "Si ferma al suo massimo.");
      } else if (p3.pNext != null) li.push(`${intro} Probabilità di vendere entro ${H} il pezzo numero ${fmtN(p3.from)}: ${probTxt(p3.pNext)}${p3.stop === "soglia" ? `, sotto la certezza minima (${fmtN(c.sell.prob)}%)` : ": l'importo è finito sui pezzi più sicuri"}. Oltre la SMax non riceve niente.`);
      else li.push("Oltre la SMax non riceve niente: è già al suo tetto.");
    } else if (p3 && c.level3 != null) {
      // per consumo, per regolarità o misto: ognuno sale degli stessi mesi della propria misura
      const v3 = p3.vr != null ? p3.vr : c.vr, om = c.over === "lin" || !c.over ? "reg" : c.over;
      const misura = om === "cons" ? `mesi di consumo (aumento per consumo: tutti salgono degli stessi mesi di scorta)`
        : om === "mix" ? `mesi di vendita pesata (aumento misto, ${levTxt(c.w3)}: conta come se vendesse ${n2(v3)} pezzi al mese)`
        : `mesi di vendite regolari (aumento per regolarità)`;
      const ideal = Math.max(0, c.level3 * v3 - p3.off), whole = Math.min(p3.qty, Math.floor(ideal + 1e-9)), more = p3.qty - whole;
      li.push(`Oltre la SMax: quando tutti i codici sono arrivati alla SMax, il resto dell'importo ha dato a tutti <b>${lv(c.level3)}</b> ${misura}. Per questo codice ${lv(c.level3)} × ${n2(v3)}${p3.off ? ` − ${fmtN(p3.off)} che aveva già sopra la SMax` : ""} = ${p3.capped && ideal >= p3.qty + 1 ? `circa ${n1(ideal)} pezzi, ma c'è un tetto` : interi(ideal, whole)}${more > 0 && !p3.capped ? `, più <b>${pezzi(more)}</b> con l'ultimo avanzo dell'importo` : ""}.`);
      if (p3.capped) li.push(p3.tcap ? `Tetto di copertura di ${mesi(p3.tcap)}: non può avere più di ${n1(c.ce * p3.tcap)} pezzi in tutto, quindi oltre la SMax riceve al massimo <b>${pezzi(p3.qty)}</b>.`
        : `Tetto oltre la SMax: al massimo ${mesi(c.limit)} di vendite medie, cioè ${fmtM(c.limit)} × ${n2(c.ce)} = ${n1(c.limit * c.ce)} pezzi. Oltre la SMax riceve quindi al massimo <b>${pezzi(p3.qty)}</b>${ideal >= p3.qty + 1 ? "" : ", gli stessi del calcolo sopra"}.`);
    }
  } else {
    li.push(`${ha(l.disp, l.giac, l.ord)}. SMin ${fmtN(l.smin)}, SMax ${fmtN(l.smax)}.`);
    (l.steps || []).forEach(x => li.push(`${esc(x.note.charAt(0).toUpperCase() + x.note.slice(1))}: <b>${pezzi(x.qty)}</b>.`));
  }
  if (l.cons_mese > 0) li.push(`Risultato: prima copriva ${covTxt(l.cover_before)} mesi di vendite, dopo l'ordine <b>${covTxt(l.cover_after)} mesi</b>${l.cons_eff !== l.cons_mese ? " (con la correzione del consumo)" : ""}.`);
  else li.push("Non vende: non si può dire quanti mesi copre.");
  return `<ol>${li.map(x => `<li>${x}</li>`).join("")}</ol>`;
}
function whyText(l) { const t = document.createElement("div"); t.innerHTML = whyHtml(l); return [...t.querySelectorAll("li")].map(x => x.textContent).join(" "); }
const W = { step: 1, snapId: null, codesMode: "all", codes: [], lookup: null, listName: "", groups: [], abc: [],
  purpose: "cover", budgets: { amount: 50000, free: 50000 }, listOverride: true, seq: 0 };
// ogni scenario a importo ha il suo importo: cambiarne uno non tocca l'altro
const wBudget = () => W.budgets[W.purpose] || 0;
