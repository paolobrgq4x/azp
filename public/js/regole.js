"use strict";
/* PartsPlanner · scenari, regole di riordino, spiegazione delle quantità */

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
 *       dal più probabile da vendere al meno probabile, finché dura l'importo e finché la probabilità resta sopra la probabilità minima di vendita */
// Ogni modo: valore, nome, descrizione breve, domanda a cui risponde
const OVER = [["cons", "Aumento per consumo", "Tutti i codici salgono degli stessi mesi di scorta. Spende tutto l'importo.", "Voglio gli stessi mesi di scorta per tutti?"],
  ["reg", "Aumento per regolarità", "I mesi in più crescono con la regolarità di vendita. Spende tutto l'importo.", "Voglio premiare chi vende con continuità?"],
  ["mix", "Aumento misto", "Con la leva decidi quanto contano consumo e regolarità. Spende tutto l'importo.", "Voglio decidere io quanto conta la regolarità?"],
  ["dyn", "Aumento dinamico", "Compra prima i pezzi più probabili da vendere e si ferma sotto la probabilità minima: il resto non si spende.", "Quanto posso comprare senza rischiare che resti fermo?"]];
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
const overTxt = r => ({ dyn: `aumento dinamico (rivendita entro ${mm(r.sellMonths)}, probabilità minima di vendita ${fmtN(r.sellProb)}%)`, cons: "aumento per consumo",
  mix: `aumento misto (${levTxt(r.overWeight)})`, reg: "aumento per regolarità" })[overMode(r)];
const overTitle = (mode, r) => (mode !== "free" || !r ? "" : " · " + ({ dyn: `aumento dinamico (${mm(r.sellMonths)}, ${fmtN(r.sellProb)}%)`, cons: "aumento per consumo",
  mix: `aumento misto (${levTxt(r.overWeight)})`, reg: "aumento per regolarità" })[overMode(r)]);
const OVER_DESC = {
  cons: "Per consumo: tutti i codici salgono degli stessi mesi di scorta; la regolarità non conta.",
  reg: "Per regolarità: i mesi di scorta in più crescono con la regolarità. Un codice che vende un mese su due riceve la metà dei mesi di uno che vende tutti i mesi.",
  mix: "Misto: con la leva scegli il bilanciamento tra consumo e regolarità. Tutta a sinistra è come per consumo, tutta a destra come per regolarità.",
  dyn: "Dinamico: si comprano prima i pezzi più probabili da vendere. Sale di più chi vende tanto e con regolarità; chi alla SMax ha già molti mesi di scorta sale poco o niente." };
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
  if (!state.rules) {
    state.rules = { ...RULES_DEF, ...((state.me && state.me.user.rules) || {}) }; state.rules.overMode = overMode(state.rules);   // il vecchio «lin» vale «per regolarità»
    // regole che non si scelgono più: valgono i valori iniziali, così nessuna regola agisce senza che si veda
    const R = state.rules, fixed = { regWeight: RULES_DEF.regWeight, maxTotal: RULES_DEF.maxTotal, minLine: RULES_DEF.minLine, exclOnDemand: RULES_DEF.exclOnDemand };
    if (Object.keys(fixed).some(k => R[k] !== fixed[k])) { Object.assign(R, fixed); saveRules(); }
  }
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
const codici = n => `${fmtN(n)} ${n === 1 ? "codice" : "codici"}`;
const righe = n => `${fmtN(n)} ${n === 1 ? "riga" : "righe"}`;
// percentuale con l'articolo giusto: «il 71%», «l'8%», «l'11%», «l'80%»; agli estremi «più del 99%» e «meno dell'1%»
// i numeri che si leggono con una vocale all'inizio: otto, undici, ottanta, ottocento, ottomila, undicimila…
const vocale = n => { const t = String(Math.floor(Math.abs(n))); return t[0] === "8" || (t.startsWith("11") && t.length % 3 === 2); };
// articolo plurale davanti a un conteggio: «i 16», «gli 8», «gli 11», «gli 80»
const gli = n => (vocale(n) ? "gli " : "i ") + fmtN(n);
const ilPct = v => {
  if (v >= 0.995) return "più del 99%"; if (v < 0.01) return "meno dell'1%";
  const p = Math.floor(v * 100 + 1e-9);
  return (p === 1 || vocale(p) ? "l'" : "il ") + p + "%";
};
function rulesText(r, mode) {
  const parts = [];
  if (mode === "cover") parts.push(`periodo ${orizzLabel(r.months)}`);
  parts.push(mode === "free" ? "SMin rispettata, SMax superabile" : "SMin e SMax rispettate");
  if (mode === "free") parts.push(overTxt(r), r.maxCover ? `al massimo ${oltreTxt(r.maxCover)}` : "nessun limite oltre la SMax");
  parts.push(`stagionalità ${r.consAdj ? pctTxt(r.consAdj) : "nessuna"}`);
  if (mode === "cover") parts.push(`arrotondamento ${ROUND_L[r.round]}`);
  const ex = ["non a scorta", r.exclOnDemand ? "su richiesta" : "", r.minDemand ? `consumo sotto ${fmtN(r.minDemand, 2)} pz/mese` : ""].filter(Boolean);
  parts.push("esclusi: " + ex.join(", "));
  parts.push(`avviso oltre ${fmtM(r.alertMonths)} ${r.alertMonths === 1 ? "mese" : "mesi"}`);
  return parts.join(" · ");
}
const mm = v => `${fmtM(v)} ${v === 1 ? "mese" : "mesi"}`;
/* Regole sopra la proposta: solo la stagionalità (correzione del consumo medio) e, nello scenario a periodo, l'arrotondamento.
 * Periodo, modo oltre la SMax e consumo minimo si scelgono nei passi di «Nuovo ordine»; l'avviso sopra la tabella di conferma. */
const STAG = [-50, -40, -30, -20, -15, -10, -5, 0, 5, 10, 15, 20, 30, 40, 50];
const stagTxt = v => (v ? pctTxt(v) : "nessuna");
const RULE_INFO = {
  consAdj: ["Stagionalità", "Corregge il consumo medio della lista per il periodo dell'anno: con −20% un codice che vende 8 pezzi al mese conta come 6,4; con +20% conta come 9,6. Vale per tutte le proposte e per la Scheda codice."],
  round: ["Arrotondamento", "Nello scenario a periodo il consumo del periodo diventa un numero intero di pezzi. Esempio: 6,4 pezzi diventano 6 al più vicino, 7 per eccesso, 6 per difetto. La SMin resta comunque il minimo."]
};
function renderRules(host, mode, onChange) {
  const r = rules(), cov = mode === "cover";
  const info = k => `<button type="button" class="info" data-info="${k}" aria-label="Che cos'è: ${esc(RULE_INFO[k][0])}">i</button>`;
  const sum = [`stagionalità ${stagTxt(r.consAdj)}`].concat(cov ? [`arrotondamento ${ROUND_L[r.round]}`] : []).join(" · ");
  host.innerHTML = `<details class="panel rulespanel"${state.rulesOpen ? " open" : ""}><summary><span class="rt">Regole di riordino</span><span class="rs">${esc(sum)}</span><span class="rlink">${state.rulesOpen ? "Chiudi" : "Modifica"}</span></summary>
    <div class="rgrid">
      <div class="rctl"><label for="r_stag">Stagionalità ${info("consAdj")}<b id="r_stagv">${esc(stagTxt(r.consAdj))}</b></label>
        <input type="range" id="r_stag" min="0" max="${STAG.length - 1}" step="1" value="${Math.max(0, STAG.indexOf(r.consAdj))}" aria-valuetext="${esc(stagTxt(r.consAdj))}">
        <div class="stagscale small muted"><span>−50%</span><span>nessuna</span><span>+50%</span></div></div>
      ${cov ? `<div class="rctl"><span class="rl">Arrotondamento ${info("round")}</span><div class="chips seg" role="group">${[["nearest", "Al più vicino"], ["up", "Per eccesso"], ["down", "Per difetto"]].map(([v, l]) => `<button type="button" class="chip" data-r="round" data-v="${v}" aria-pressed="${r.round === v}">${l}</button>`).join("")}</div></div>` : ""}
    </div>
    <p class="small eqh" id="eqh" aria-live="polite"></p>
    <div class="row"><button class="btn sm" type="button" id="r_reset">Ripristina i valori iniziali</button><span class="small muted">Valori iniziali: stagionalità nessuna${cov ? " · arrotondamento al pezzo più vicino" : ""}. Ogni modifica ricalcola la proposta e resta salvata per il tuo utente.</span></div></details>`;
  const d = $("details", host);
  d.addEventListener("toggle", () => { state.rulesOpen = d.open; $(".rlink", d).textContent = d.open ? "Chiudi" : "Modifica"; });
  const set = (k, v) => { if (rules()[k] === v) return; rules()[k] = v; saveRules(); onChange(false); };
  const el = $("#r_stag", host), out = $("#r_stagv", host);
  el.oninput = () => { const t = stagTxt(STAG[+el.value]); out.textContent = t; el.setAttribute("aria-valuetext", t); };
  el.onchange = () => set("consAdj", STAG[+el.value]);
  $$("[data-info]", host).forEach(b => b.onclick = ev => {
    ev.preventDefault();
    const box = $("#eqh", host), same = box.dataset.k === b.dataset.info, [name, text] = RULE_INFO[b.dataset.info];
    $$("[data-info]", host).forEach(x => x.setAttribute("aria-pressed", "false"));
    if (same) { box.dataset.k = ""; box.innerHTML = ""; box.classList.remove("on"); return; }
    box.dataset.k = b.dataset.info; box.innerHTML = `<b>${esc(name)}</b>: ${esc(text)}`; box.classList.add("on"); b.setAttribute("aria-pressed", "true");
  });
  $$("[data-r]", host).forEach(b => b.onclick = () => set(b.dataset.r, b.dataset.v));
  $("#r_reset", host).onclick = () => { const x = rules(); x.consAdj = RULES_DEF.consAdj; x.round = RULES_DEF.round; saveRules(); onChange(false); };
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
  // dal conto ai pezzi interi, con gli eventuali pezzi in più comprati con l'ultimo avanzo: la frase si chiude da sola
  const quanti = (x, q, more) => (q === 0
    ? `circa ${f1(x)} pezzi, meno di un pezzo intero${more > 0 ? `. Riceve comunque <b>${pezzi(more)}</b> con l'ultimo avanzo dell'importo` : ", quindi <b>nessuno</b>"}`
    : (Math.abs(x - q) > 0.05 ? `circa ${f1(x)} pezzi, arrotondati per difetto a <b>${pezzi(q)}</b>` : `<b>${pezzi(q)}</b>`) + (more > 0 ? `, più <b>${pezzi(more)}</b> con l'ultimo avanzo dell'importo` : "")) + ".";
  if (c && c.kind === "cover") {
    li.push(`Vende in media <b>${n2(c.cons)}</b> pezzi al mese${c.adj ? `; con la stagionalità al ${pctTxt(c.adj)} si conta <b>${n2(c.ce)}</b>` : ""}.`);
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
      ? (c.w === 0 ? `Vende in media <b>${n2(c.vr)}</b> pezzi al mese. Con il peso della regolarità a 0% l'importo si divide solo in base a queste vendite.`
        : `Vende in media ${n2(c.ce)} pezzi al mese, ma non in tutti i mesi (regolarità ${n2(c.reg)} su 12). Per dividere l'importo fino alla SMax conta quindi come <b>${n2(c.vr)}</b> pezzi al mese${c.w == null || c.w === 100 ? ` (${n2(c.ce)} × ${n2(c.reg)} ÷ 12)` : ` (peso della regolarità ${fmtN(c.w)}%)`}: chi vende con regolarità riceve di più.`)
      : `Vende in media <b>${n2(c.vr)}</b> pezzi al mese. Nei dati manca la regolarità, quindi l'importo si divide in base a queste vendite.`;
    const p2 = c.p2, p3 = c.p3;
    // se il codice è già alla SMax, come si divide l'importo fino alla SMax non conta: la sua misura oltre la SMax è spiegata più sotto
    if (!(p2 && !p2.room && p3 && !p3.dyn && c.level3 != null && c.vr > 0)) li.push(metro);
    if (!(c.vr > 0)) li.push("Non vende: non riceve una parte dell'importo.");
    else if (p2 && !p2.room) li.push(p2.tcap ? `È già al tetto di copertura di ${mesi(p2.tcap)}: non riceve altro.` : c.smin_qty ? "Con la SMin è già arrivato alla SMax: fino alla SMax non c'è altro spazio." : "È già alla SMax: fino alla SMax non c'è altro spazio.");
    else if (p2 && p2.capped) li.push(`Con la sua parte dell'importo riceve <b>${pezzi(p2.qty)}</b> e arriva ${p2.tcap ? `al tetto di copertura di ${mesi(p2.tcap)}` : "alla SMax"}${p3 && p3.qty ? "" : ": lì si ferma"}.`);
    else if (p2) {
      const ideal = c.level * c.vr, whole = Math.min(p2.qty, Math.floor(ideal + 1e-9)), more = p2.qty - whole;
      li.push(`Fino alla SMax l'importo si divide fra i codici in proporzione a queste vendite: ognuno riceve <b>${lv(c.level)} mesi</b> delle proprie vendite. Questo codice riceve quindi ${lv(c.level)} mesi × ${n2(c.vr)} pezzi: ${quanti(ideal, whole, more)}`);
    }
    if (p3 && p3.dyn && c.sell) {
      // aumento dinamico: la probabilità di vendere il primo e l'ultimo pezzo comprato, e quella del pezzo a cui ci si è fermati
      const H = mesi(c.sell.months), last = p3.from + p3.qty - 1;
      const intro = `Oltre la SMax, con l'aumento dinamico, si comprano prima i pezzi più facili da vendere. A questo ritmo il codice vende in media circa ${n1(p3.mu)} pezzi in ${H} e a questo punto ne ha già ${fmtN(p3.from - 1)}.`;
      const stopTxt = n => `Il pezzo numero ${fmtN(n)} avrebbe ${ilPct(p3.pNext)}` + (p3.stop === "soglia" ? `, sotto la probabilità minima scelta (${fmtN(c.sell.prob)}%): qui l'acquisto si ferma.` : ", ma l'importo è già finito.");
      if (p3.qty > 0) {
        li.push(intro);
        li.push(`Il pezzo numero ${fmtN(p3.from)} ha ${ilPct(p3.pFirst)} di probabilità di essere venduto entro ${H}${p3.qty > 1 ? `; l'ultimo pezzo comprato, il numero ${fmtN(last)}, ha ${ilPct(p3.pLast)}` : ""}.${p3.pNext == null ? "" : " " + stopTxt(last + 1)} Riceve quindi <b>${pezzi(p3.qty)}</b>.`);
        if (p3.stop === "tetto") li.push(p3.tcap ? `Si ferma al tetto di copertura di ${mesi(p3.tcap)}.` : c.limit ? `Si ferma al tetto di ${mesi(c.limit)} di vendite medie oltre la SMax.` : "Si ferma al suo massimo.");
      } else if (p3.pNext != null) li.push(`${intro} Il pezzo numero ${fmtN(p3.from)} avrebbe ${ilPct(p3.pNext)} di probabilità di essere venduto entro ${H}${p3.stop === "soglia" ? `, sotto la probabilità minima scelta (${fmtN(c.sell.prob)}%)` : ", ma l'importo è finito sui pezzi più facili da vendere"}: oltre la SMax non riceve niente.`);
      else li.push("Oltre la SMax non riceve niente: è già al suo tetto.");
    } else if (p3 && c.level3 != null) {
      // per consumo, per regolarità o misto: ognuno sale degli stessi mesi della propria misura
      const v3 = p3.vr != null ? p3.vr : c.vr, om = c.over === "lin" || !c.over ? "reg" : c.over;
      const nome = om === "cons" ? "consumo" : om === "mix" ? "vendite pesate" : "vendite regolari";
      const bil = `${fmtN(100 - (c.w3 || 0))}% consumo e ${fmtN(c.w3 || 0)}% regolarità`;
      const come = om === "cons" ? `Questo codice vende ${n2(v3)} pezzi al mese.`
        : om === "mix" ? `Questo codice vende ${n2(c.ce)} pezzi al mese, con una regolarità di ${n2(c.reg)} su 12. Con il bilanciamento scelto (${bil}) conta come ${n2(v3)} pezzi al mese: ${n2(c.ce)} × (${n2(c.reg)} ÷ 12)^${fmtN((c.w3 || 0) / 100, 1)}.`
        : `Questo codice vende ${n2(c.ce)} pezzi al mese, ma non in tutti i mesi: con una regolarità di ${n2(c.reg)} su 12 conta come ${n2(v3)} pezzi al mese (${n2(c.ce)} × ${n2(c.reg)} ÷ 12).`;
      const ideal = Math.max(0, c.level3 * v3 - p3.off), whole = Math.min(p3.qty, Math.floor(ideal + 1e-9)), more = p3.qty - whole;
      const tolti = p3.off ? `, meno ${pezzi(p3.off)} che aveva già oltre la SMax` : "";
      // il tetto di questo codice, a parole
      const tetto = p3.tcap ? `il tetto di copertura è di ${mesi(p3.tcap)}, cioè ${f1(c.ce * p3.tcap)} pezzi in tutto`
        : c.limit ? `il tetto oltre la SMax è di ${mesi(c.limit)} di vendite medie, cioè ${fmtM(c.limit)} × ${n2(c.ce)} = ${f1(c.limit * c.ce)} pezzi${p3.off ? `, e ne aveva già ${fmtN(p3.off)}` : ""}` : "il codice è già al suo massimo";
      if (p3.capped && !p3.qty) li.push(`Oltre la SMax non riceve niente: ${tetto}. Non c'è spazio per un altro pezzo intero.`);
      else if (c.avail3 != null && c.val3 === 0) li.push(`Oltre la SMax. Portati tutti i codici alla SMax, restavano da spendere <b>${fmtE(c.avail3)}</b>: ${c.pm3 > 0 ? "non bastano per un altro pezzo dei codici che possono salire" : "nessun codice può salire oltre la SMax"}.`);
      else if (c.avail3 != null && !(c.pm3 > 0)) {
        // l'importo basta per portare tutti al proprio tetto: non c'è un numero di mesi da spiegare
        li.push(`Oltre la SMax. Portati tutti i codici alla SMax, restavano da spendere <b>${fmtE(c.avail3)}</b>: bastano per portare al proprio tetto tutti i codici che possono salire oltre la SMax.`);
        li.push(p3.capped ? `Per questo codice ${tetto}. Riceve quindi <b>${pezzi(p3.qty)}</b>.` : "Questo codice oltre la SMax non riceve altro.");
      } else {
        if (c.avail3 != null) {
          // da dove viene il numero di mesi: quello che restava, diviso per il valore di un mese dei codici che possono ancora salire
          const X = c.avail3, Z = c.off3 || 0, F = c.fix3 || 0, n = c.n3, r = (X + Z - F) / c.pm3;
          const conto = [fmtE(X), F >= 1 ? `− ${fmtE(F)}` : "", Z >= 1 ? `+ ${fmtE(Z)}` : ""].filter(Boolean).join(" ");
          const chi = F >= 1
            ? ` Di questa somma, ${fmtE(F)} ${Math.round(F) === 1 ? "va" : "vanno"} ai codici che si fermano al proprio tetto. Il resto ${n === 1 ? "va all'unico altro codice che può salire oltre la SMax" : `si divide fra gli altri ${fmtN(n)} codici che possono salire oltre la SMax`}.`
            : n === 1 ? " Questa somma va all'unico codice che può salire oltre la SMax." : ` Questa somma si divide fra ${gli(n)} codici che possono salire oltre la SMax.`;
          const mese = n === 1 ? ` Un mese di ${nome} di quel codice vale ${fmtE(c.pm3)}: i suoi pezzi al mese moltiplicati per il costo.`
            : ` Un mese di ${nome} di tutti questi codici vale ${fmtE(c.pm3)}: per ogni codice si moltiplicano i pezzi al mese per il costo, poi si sommano i risultati.`;
          const gia = Z < 1 ? "" : n === 1 ? ` Quel codice aveva già pezzi oltre la SMax, per un valore di ${fmtE(Z)}: si considerano già acquistati.`
            : ` Alcuni di questi codici avevano già pezzi oltre la SMax, per un valore di ${fmtE(Z)}: si considerano già acquistati.`;
          const esito = n === 1 && Math.abs(c.level3 - r) > 0.05 ? `circa ${lv(r)} mesi di ${nome}. Poiché si ordinano solo pezzi interi, il numero di mesi che fa spendere l'importo è <b>${lv(c.level3)}</b>.`
            : c.level3 > r + 0.05 ? `circa ${lv(r)} mesi di ${nome}. Poiché si ordinano solo pezzi interi, ogni codice perde in media mezzo pezzo: per spendere tutto l'importo il numero di mesi sale a <b>${lv(c.level3)}</b>, uguale per tutti i codici.`
            : c.level3 < r - 0.05 ? `circa ${lv(r)} mesi di ${nome}. Poiché si ordinano solo pezzi interi, l'importo non si divide in parti esatte: il numero di mesi si ferma a <b>${lv(c.level3)}</b>, uguale per tutti i codici.`
            : `<b>${lv(c.level3)} mesi</b> di ${nome}, uguali per tutti i codici.`;
          li.push(`Oltre la SMax. Portati tutti i codici alla SMax, restavano da spendere <b>${fmtE(X)}</b>.${chi}${mese}${gia} Il conto è quindi ${Z >= 1 || F >= 1 ? `(${conto})` : conto} ÷ ${fmtE(c.pm3)} = ${esito}`);
        } else li.push(`Oltre la SMax. Portati tutti i codici alla SMax, quello che restava dell'importo ha dato a ogni codice <b>${lv(c.level3)} mesi</b> di ${nome}.`);
        if (p3.capped && ideal >= p3.qty + 1) {
          li.push(`${come} Gli spetterebbero ${lv(c.level3)} mesi × ${n2(v3)} pezzi${tolti}: circa ${f1(ideal)} pezzi.`);
          li.push(`Ma ${tetto}. Riceve quindi al massimo <b>${pezzi(p3.qty)}</b>.`);
        } else li.push(`${come} Riceve quindi ${lv(c.level3)} mesi × ${n2(v3)} pezzi${tolti}: ${quanti(ideal, whole, more)}`);
      }
    }
  } else {
    li.push(`${ha(l.disp, l.giac, l.ord)}. SMin ${fmtN(l.smin)}, SMax ${fmtN(l.smax)}.`);
    (l.steps || []).forEach(x => li.push(`${esc(x.note.charAt(0).toUpperCase() + x.note.slice(1))}: <b>${pezzi(x.qty)}</b>.`));
  }
  if (l.cons_mese > 0) li.push(`Risultato: prima copriva ${covTxt(l.cover_before)} mesi di vendite, dopo l'ordine <b>${covTxt(l.cover_after)} mesi</b>${l.cons_eff !== l.cons_mese ? " (con la stagionalità)" : ""}.`);
  else li.push("Non vende: non si può dire quanti mesi copre.");
  return `<ol>${li.map(x => `<li>${x}</li>`).join("")}</ol>`;
}
function whyText(l) { const t = document.createElement("div"); t.innerHTML = whyHtml(l); return [...t.querySelectorAll("li")].map(x => x.textContent).join(" "); }
const W = { step: 1, snapId: null, codesMode: "all", codes: [], lookup: null, listName: "", groups: [], abc: [],
  purpose: "cover", budgets: { amount: 50000, free: 50000 }, listOverride: true, seq: 0 };
// ogni scenario a importo ha il suo importo: cambiarne uno non tocca l'altro
const wBudget = () => W.budgets[W.purpose] || 0;
