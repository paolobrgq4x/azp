"use strict";
/*
 * Regole di incrocio tra storico movimentazione (A) e giacenza attuale (B).
 *   Disponibile = giacenza + ordini aperti
 *   fermo     : giacenza > 0 con SMin = 0 e SMax = 0
 *   sotto     : disponibile < SMin            -> da ordinare = max(SMax, SMin) - disponibile
 *   eccesso   : giacenza > SMax               -> eccedenza = giacenza - SMax
 *   ok        : altrimenti
 *   nostorico : codice con giacenza > 0 presente solo nel file giacenze
 * in_b = false segnala un codice dello storico assente nel file giacenze (giacenza considerata 0).
 *
 * Quali giacenze: le liste movimentazione possono riportare la giacenza di ogni codice alla fine del mese precedente.
 *   - senza file giacenze valgono quelle delle liste;
 *   - con il file giacenze, più recente, valgono quelle del file; costi, scorte, consumi e ordini aperti restano quelli delle liste.
 */

const MAX_ROWS = 150000;

const num = v => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const str = (v, max = 120) => (v === null || v === undefined ? "" : String(v)).slice(0, max);
function saleField(v) {
  if (v === null || v === undefined || v === "") return { qty: null, date: null };
  if (v instanceof Date && !isNaN(v)) return { qty: null, date: v.toISOString().slice(0, 10) };
  const n = num(v);
  if (n >= 19000101 && n <= 21001231 && Number.isInteger(n)) {
    const s = String(n), y = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6, 8);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return { qty: null, date: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` };
  }
  return { qty: n, date: null };
}
// Spareggio fisso: a parità esatta di priorità vince il codice che viene prima in ordine alfabetico.
// Così il risultato non dipende mai dall'ordine in cui il database restituisce le righe.
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const code = v => String(v === null || v === undefined ? "" : v).trim().toUpperCase().replace(/\s+/g, "").slice(0, 40);
// Pezzi all'anno stimati: consumo medio mensile × 12.
const annuo = i => (i.cons_mese > 0 ? i.cons_mese * 12 : 0);

/**
 * rowsA: [code, desc, loc, dg, cost, ord, smin, smax, regolarita, cons_mese, listino, qtaven_ultven, ven_spc, fab]
 * regolarita = indice di regolarità delle vendite (da 0 a 11,99: più è alto, più il codice si vende con continuità).
 *              Non entra nell'incrocio; negli scenari a importo dà la vendita regolare (consumo × regolarità / 12).
 * cons_mese  = consumo medio mensile in pezzi. È la base di coperture, scenari e indicatori.
 * La colonna QtaVen/UltVen contiene la quantità venduta di recente oppure, se è nel formato AAAAMMGG,
 * la data dell'ultima vendita.
 * In coda a ogni riga di rowsA (posizione 14) c'è la giacenza riportata dalla lista, vuota se la lista non la riporta.
 * rowsB: [code, giac, desc]; null se il file giacenze non è stato caricato: allora valgono le giacenze delle liste.
 * opts.missing: come trattare i codici delle liste assenti dal file giacenze:
 *   "zero"  (predefinito) giacenza zero: il codice è esaurito;
 *   "lista" resta la giacenza della lista: serve quando il file giacenze è parziale.
 */
function cross(rowsA, rowsB, opts) {
  const useFile = rowsB !== null && rowsB !== undefined;
  if (!Array.isArray(rowsA) || (useFile && !Array.isArray(rowsB))) throw new Error("Formato dati non valido.");
  if (rowsA.length > MAX_ROWS || (useFile && rowsB.length > MAX_ROWS)) throw new Error("File troppo grandi (massimo 150.000 righe).");
  const keep = useFile && !!opts && opts.missing === "lista";

  const giac = new Map(), bDesc = new Map();
  for (const r of useFile ? rowsB : []) {
    if (!Array.isArray(r)) continue;
    const c = code(r[0]); if (!c) continue;
    giac.set(c, (giac.get(c) || 0) + num(r[1]));
    if (!bDesc.has(c) && r[2] != null) bDesc.set(c, str(r[2]));
  }

  const seen = new Set(), items = [];
  let dup = 0, nList = 0, nListPos = 0;
  for (const r of rowsA) {
    if (!Array.isArray(r)) continue;
    const c = code(r[0]); if (!c) continue;
    if (seen.has(c)) { dup++; continue; }
    seen.add(c);
    // giacenza riportata dalla lista: null se la cella è vuota
    const hasL = !(r[14] === null || r[14] === undefined || r[14] === ""), gl = hasL ? num(r[14]) : null;
    if (hasL) { nList++; if (gl !== 0) nListPos++; }
    // senza file giacenze ogni codice ha la giacenza della lista; con il file, chi non c'è è a zero (oppure resta alla giacenza della lista)
    const inB = useFile ? giac.has(c) : true;
    const g = useFile ? (inB ? giac.get(c) : keep && hasL ? gl : 0) : hasL ? gl : 0;
    const cost = num(r[4]), ord = num(r[5]), smin = num(r[6]), smax = num(r[7]);
    const disp = g + ord, sf = saleField(r[11]);
    let status = "ok", delta = 0, val = 0;
    if (g > 0 && smin === 0 && smax === 0) { status = "fermo"; delta = -g; val = g * cost; }
    else if (disp < smin) { status = "sotto"; delta = Math.max(smax, smin) - disp; val = delta * cost; }
    else if (g > smax) { status = "eccesso"; delta = -(g - smax); val = (g - smax) * cost; }
    items.push({
      code: c, descr: str(r[1]), loc: str(r[2], 20), dg: str(r[3], 20), status, in_b: inB,
      giac: g, ord, smin, smax, delta, cost, val_giac: g * cost, val_action: val, regolarita: Math.max(0, num(r[8])), cons_mese: Math.max(0, num(r[9])), listino: r[10] == null || r[10] === "" ? null : num(r[10]),
      qty_sold: sf.qty, last_sale: sf.date, ven_spc: r[12] == null || r[12] === "" ? null : num(r[12]), fab: r[13] == null || r[13] === "" ? null : num(r[13]), giac_lista: gl
    });
  }
  // Senza file giacenze servono le giacenze delle liste: se non ci sono, ogni codice risulterebbe a zero.
  if (!useFile && !nListPos) throw new Error("Le liste movimentazione non riportano le giacenze: carica anche il file giacenze.");
  for (const [c, q] of giac) {
    if (seen.has(c) || q <= 0) continue;
    items.push({ code: c, descr: bDesc.get(c) || "", loc: "", dg: "", status: "nostorico", in_b: true,
      giac: q, ord: 0, smin: 0, smax: 0, delta: 0, cost: 0, val_giac: 0, val_action: 0, regolarita: 0, cons_mese: 0, listino: null, qty_sold: null, last_sale: null, ven_spc: null, fab: null, giac_lista: null });
  }

  const by = s => items.filter(i => i.status === s);
  const sum = (a, k) => a.reduce((t, i) => t + i[k], 0);
  const sotto = by("sotto"), ecc = by("eccesso"), fermo = by("fermo");
  const kpi = {
    n_codes: items.filter(i => i.status !== "nostorico").length,
    val_tot: sum(items, "val_giac"),
    n_sotto: sotto.length, pz_sotto: sum(sotto, "delta"), val_sotto: sum(sotto, "val_action"),
    n_eccesso: ecc.length, val_eccesso: sum(ecc, "val_action"),
    n_fermo: fermo.length, val_fermo: sum(fermo, "val_action"),
    n_nogiac: items.filter(i => !i.in_b).length,
    n_nostorico: by("nostorico").length
  };
  // da dove vengono le giacenze: "lista", "file", oppure "file_lista" (file, e lista per i codici che nel file non ci sono)
  const src = !useFile ? "lista" : keep && nList ? "file_lista" : "file";
  return { items, kpi, dup, stock: { src, n_list: nList } };
}

/* Gruppo principale: quarta cifra del codice particolare (es. 12385671 -> 8). */
const GROUPS = { "0": "Accessori e vernici", "1": "Motore", "2": "Alimentazione e scarico", "3": "Cambio", "4": "Assale anteriore e sterzo",
  "5": "Assale posteriore", "6": "Ruote e freni", "7": "Leve e pedali", "8": "Carrozzeria e clima", "9": "Impianto elettrico" };
const mainGroup = code => { const c = String(code || "")[3]; return c >= "0" && c <= "9" ? c : "X"; };

function abcMap(items) {
  const cons = items.filter(i => i.status !== "nostorico").map(i => ({ code: i.code, cv: annuo(i) * i.cost })).filter(x => x.cv > 0).sort((a, b) => b.cv - a.cv || cmp(a.code, b.code));
  const tot = cons.reduce((t, x) => t + x.cv, 0); const m = new Map(); let cum = 0;
  for (const x of cons) { const sh = tot ? cum / tot : 0; m.set(x.code, sh < 0.8 ? "A" : sh < 0.95 ? "B" : "C"); cum += x.cv; }
  return m;
}

/* Valori disponibili per i filtri di un caricamento */
function filterValues(items) {
  const abc = abcMap(items), g = {}, dg = {}, cl = { A: 0, B: 0, C: 0, N: 0 };
  for (const i of items) {
    if (i.status === "nostorico") continue;
    const k = mainGroup(i.code); g[k] = (g[k] || 0) + 1;
    if (i.dg) dg[i.dg] = (dg[i.dg] || 0) + 1;
    cl[abc.get(i.code) || "N"]++;
  }
  return {
    groups: Object.keys(g).sort().map(k => ({ id: k, label: GROUPS[k] || "Altri codici", n: g[k] })),
    dg: Object.entries(dg).sort((a, b) => b[1] - a[1] || cmp(a[0], b[0])).slice(0, 60).map(([id, n]) => ({ id, n })),
    abc: cl
  };
}

/*
 * Scenari d'ordine. Sono tre.
 *  cover  : acquisti per coprire un periodo (1, 2 o 3 mesi), rispettando SMin e SMax.
 *  amount : acquisti per un importo, rispettando SMin e SMax.
 *  free   : acquisti per un importo libero: come amount, e quello che resta dopo aver portato tutti alla SMax va oltre la SMax.
 *
 * Valgono per tutti e tre:
 *  disponibile      = giacenza + ordini aperti
 *  consumo          = consumo medio mensile in pezzi, con l'eventuale correzione scelta nelle regole
 *  vendita regolare = consumo × regolarità delle vendite / 12: i pezzi al mese su cui si può contare
 *  i codici non tenuti a scorta (SMin e SMax a zero) sono sempre esclusi, come i fermi e quelli senza storico.
 *
 * cover: obiettivo = consumo × mesi (arrotondato come scelto nelle regole), mai sotto la SMin e mai sopra la SMax;
 *        ordine = obiettivo − disponibile.
 *
 * amount, in tre passi:
 *  1. i codici sotto la SMin tornano alla SMin; se l'importo non basta nemmeno per questo, passa prima chi ha la regolarità
 *     più alta e, a parità, il consumo più alto;
 *  2. il resto compra a tutti lo stesso numero di mesi di vendita regolare: sale un livello in mesi, uguale per tutti, e ogni
 *     codice riceve un pezzo ogni volta che livello × vendita regolare raggiunge il suo pezzo successivo;
 *  3. nessun codice supera la SMax: chi ci arriva si ferma e l'importo prosegue sugli altri. Se tutti sono alla SMax,
 *     quello che resta non viene speso.
 *
 * free: come amount; l'importo che amount lascerebbe non speso sale oltre la SMax con la regola del passo 2, contando i mesi
 *       a partire dalla SMax (chi è già sopra la SMax parte in ritardo). Limite facoltativo: da 1 a 6 mesi di consumo sopra la SMax per codice.
 *
 * Ordine delle righe: prima i codici che erano sotto la SMin, poi regolarità più alta e, a parità, consumo più alto.
 * Filtri: gruppo principale, DG, classe ABC, testo su codice o descrizione, elenco di codici.
 */
// L'indice di regolarità va da 0 a 11,99: un valore più alto nel file viene letto come 11,99.
const REG_MAX = 11.99;
const MODES = ["cover", "amount", "free"];
const MONTHS = [1, 2, 3];
const MAX_COVER = [0, 1, 2, 3, 4, 5, 6];   // mesi di consumo oltre la SMax; 0 = nessun limite

/* Coda con priorità (heap binario): in cima la voce con il livello più basso. */
function heapPush(h, x, less) {
  h.push(x);
  let i = h.length - 1;
  while (i > 0) { const up = (i - 1) >> 1; if (!less(h[i], h[up])) break; [h[i], h[up]] = [h[up], h[i]]; i = up; }
}
function heapPop(h, less) {
  const top = h[0], last = h.pop();
  if (h.length) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < h.length && less(h[l], h[m])) m = l;
      if (r < h.length && less(h[r], h[m])) m = r;
      if (m === i) break;
      [h[i], h[m]] = [h[m], h[i]]; i = m;
    }
  }
  return top;
}

/*
 * Distribuzione di un importo in proporzione alla vendita regolare, a pezzi interi.
 * Ogni voce ha: vr (vendita regolare in pezzi al mese), cost, cap (pezzi che può ancora ricevere, anche Infinity) e
 * off (pezzi di ritardo: il codice riceve il primo pezzo quando livello × vr arriva a off + 1).
 * Il livello è in mesi ed è uguale per tutti: a ogni livello un codice ha ricevuto i pezzi interi di livello × vr − off.
 * Il grosso si trova per bisezione (il livello più alto che l'importo può pagare). I pezzi che restano vanno uno alla volta
 * al codice il cui pezzo successivo arriva al livello più basso; chi costa più dell'importo rimasto viene saltato.
 * Il livello restituito è quello comune: fin lì ogni codice ha ricevuto tutti i suoi pezzi interi. I pezzi dati dopo il primo
 * salto sono l'avanzo dell'importo, speso sui codici che ancora può pagare.
 * Scrive in ogni voce q (pezzi ricevuti) e short (non arrivata al suo massimo).
 */
function spread(entries, money, tie) {
  const E = entries.filter(e => e.vr > 0 && e.cap > 0 && e.cost > 0);
  for (const e of entries) { e.q = 0; e.short = false; }
  if (!E.length || !(money >= 0.01)) return { left: Math.max(0, money), level: 0, full: !E.length, n: 0, value: 0 };
  const at = (e, m) => Math.min(e.cap, Math.max(0, Math.floor(m * e.vr - e.off + 1e-9)));
  const costAt = m => { let t = 0; for (const e of E) t += at(e, m) * e.cost; return t; };
  const finite = E.every(e => Number.isFinite(e.cap));
  let lo = 0, hi = finite ? E.reduce((t, e) => Math.max(t, (e.cap + e.off) / e.vr), 0) : 1;
  if (!finite) for (let n = 0; n < 200 && costAt(hi) <= money; n++) hi *= 2;
  if (finite && costAt(hi) <= money + 1e-9) lo = hi;      // l'importo basta per portare tutti al loro massimo
  else for (let n = 0; n < 64; n++) { const mid = (lo + hi) / 2; if (costAt(mid) <= money + 1e-9) lo = mid; else hi = mid; }
  let left = money, level = lo, skipped = false;
  for (const e of E) { e.q = at(e, lo); left -= e.q * e.cost; }
  const next = e => (e.off + e.q + 1) / e.vr;
  const less = (a, b) => a.lv < b.lv || (a.lv === b.lv && tie(a.e.c, b.e.c) < 0);
  const heap = [];
  for (const e of E) if (e.q < e.cap) heapPush(heap, { lv: next(e), e }, less);
  while (heap.length && left >= 0.01) {
    const { lv, e } = heapPop(heap, less);
    if (e.cost > left + 1e-9) { skipped = true; continue; }   // l'importo rimasto non basta più per questo codice
    e.q++; left -= e.cost; if (!skipped) level = lv;
    if (e.q < e.cap) heapPush(heap, { lv: next(e), e }, less);
  }
  let n = 0, value = 0;
  for (const e of E) { if (e.q > 0) { n++; value += e.q * e.cost; } e.short = e.q < e.cap; }
  return { left: Math.max(0, left), level, full: E.every(e => e.q >= e.cap), n, value };
}

function scenario(items, p) {
  const abc = abcMap(items);
  const f = p.filters || {};
  const q = String(f.q || "").trim().toUpperCase();
  const list = f.codes && f.codes.length ? new Set(f.codes) : null;
  const inFilter = i => (!list || list.has(i.code))
    && (!f.groups || !f.groups.length || f.groups.includes(mainGroup(i.code)))
    && (!f.dg || !f.dg.length || f.dg.includes(i.dg))
    && (!f.abc || !f.abc.length || f.abc.includes(abc.get(i.code) || "N"))
    && (!q || i.code.includes(q) || String(i.descr || "").toUpperCase().includes(q));
  const tierOf = i => { const d = i.giac + i.ord; return d <= 0 && i.smin > 0 ? 1 : d < i.smin ? 2 : d < i.smax ? 3 : 4; };
  const R = cleanRules(p.rules);
  const mode = MODES.includes(p.mode) ? p.mode : "amount";
  const months = MONTHS.includes(+p.months) ? +p.months : R.months;
  const maxCover = mode !== "free" ? 0 : p.maxCover != null ? cleanCover(p.maxCover) : R.maxCover;
  const flagged = R.exclOnDemand ? (p.flagged || new Set()) : new Set();
  const minDemand = p.minDemand != null ? Math.max(0, +p.minDemand || 0) : R.minDemand;
  const k = 1 + R.consAdj / 100, roundFn = ROUND[R.round];
  const excluded = { flag: 0, noparams: 0, low: 0, minline: 0 };
  const forced = !!(list && p.listOverride);   // codici scelti a mano: valgono anche se segnati su richiesta

  const cands = [];
  for (const i of items) {
    if (i.status === "fermo" || i.status === "nostorico" || !(i.cost > 0)) continue;
    if (!inFilter(i)) continue;
    // non tenuti a scorta (SMin e SMax a zero): sempre esclusi
    if (!(i.smin > 0) && !(i.smax > 0)) { if (i.cons_mese > 0) excluded.noparams++; continue; }
    if (flagged.has(i.code) && !forced) { excluded.flag++; continue; }
    if (minDemand > 0 && i.cons_mese < minDemand) { excluded.low++; continue; }   // soglia in pezzi al mese
    cands.push({ ...i, regolarita: Math.min(REG_MAX, Math.max(0, num(i.regolarita))), cons_eff: Math.max(0, i.cons_mese) * k, tier: tierOf(i), disp: i.giac + i.ord,
      top: Math.max(i.smax, i.smin), cls: abc.get(i.code) || "N", grp: mainGroup(i.code) });
  }
  // Senza indice di regolarità nei dati la vendita regolare è il consumo: tutti i codici contano come regolari.
  const hasReg = cands.some(c => c.regolarita > 0);
  // Peso della regolarità: 100% = consumo × regolarità ÷ 12; 0% = solo consumo; in mezzo la regolarità conta meno (esponente).
  const wReg = R.regWeight / 100;
  for (const c of cands) {
    c.vr = c.cons_eff * (hasReg ? Math.pow(c.regolarita / 12, wReg) : 1);
    // tetto della giacenza disponibile dopo l'ordine per la copertura massima totale; mai sotto la SMin
    c.ceil = R.maxTotal ? Math.max(c.smin, Math.floor(R.maxTotal * c.cons_eff + 1e-9)) : Infinity;
  }
  // Precedenza: regolarità più alta, poi consumo più alto; a parità esatta l'ordine alfabetico del codice.
  const byReg = (a, b) => b.regolarita - a.regolarita || b.cons_mese - a.cons_mese || cmp(a.code, b.code);
  const mesiTxt = m => `${m.toLocaleString("it-IT", { maximumFractionDigits: 1 })} ${m === 1 ? "mese" : "mesi"}`;

  const lines = new Map();
  const add = (c, qty, note) => {
    let l = lines.get(c.code);
    if (!l) {
      const why = [];
      if (c.tier === 1) why.push("A zero con fabbisogno"); else if (c.tier === 2) why.push("Sotto SMin");
      if (c.status === "sotto" && c.streak > 1) why.push(`da ${c.streak} caricamenti`);
      if (c.status === "eccesso") why.push("già sopra SMax");
      if (c.cons_mese > 0) why.push(`consumo medio ${c.cons_mese.toLocaleString("it-IT", { maximumFractionDigits: 2 })} pz/mese${R.consAdj ? ` (considerato ${c.cons_eff.toLocaleString("it-IT", { maximumFractionDigits: 2 })}, ${R.consAdj > 0 ? "+" : ""}${R.consAdj}%)` : ""}`);
      l = { rank: 0, code: c.code, descr: c.descr, loc: c.loc, dg: c.dg, grp: c.grp, cls: c.cls, status: c.status, in_b: c.in_b, tier: c.tier,
        giac: c.giac, ord: c.ord, smin: c.smin, smax: c.smax, cons_mese: c.cons_mese, cons_eff: c.cons_eff, regolarita: c.regolarita, vr: c.vr, cost: c.cost, calc: null,
        disp: c.disp, listino: c.listino, streak: c.streak, qty: 0, value: 0, reasons: why, partial: false, steps: [],
        qty_sold: c.qty_sold, last_sale: c.last_sale, ven_spc: c.ven_spc, fab: c.fab, prev_giac: c.prev_giac,
        cover_before: c.cons_eff > 0 ? c.disp / c.cons_eff : null };
      lines.set(c.code, l);
    }
    l.qty += qty; l.value += qty * c.cost;
    l.steps.push({ note, qty });
    if (!l.reasons.includes(note) && !(note === "A zero con fabbisogno" || note === "Sotto SMin")) l.reasons.push(note);
    return l;
  };
  const got = c => { const l = lines.get(c.code); return l ? l.qty : 0; };

  let budget = null, left = null, need = 0, cut = null, smin = null, prop = null, extra = null;
  if (mode === "cover") {
    // Obiettivo secondo la domanda del periodo: consumo × mesi, arrotondato come scelto; mai sotto la SMin, mai sopra la SMax.
    let rows = cands.map(c => {
      const raw = c.cons_eff * months, rounded = roundFn(raw), base = Math.max(rounded, c.smin), atTop = Math.min(base, c.top), target = Math.min(atTop, c.ceil);
      return { c, qty: Math.ceil(target - c.disp - 1e-9), calc: { kind: "cover", cons: c.cons_mese, adj: R.consAdj, ce: c.cons_eff, months, raw, round: R.round, rounded,
        smin: c.smin, base, smax: c.top, capped: atTop < base, tcap: target < atTop ? R.maxTotal : 0, target, giac: c.giac, ord: c.ord, disp: c.disp } };
    });
    // Quanto la SMax ha tolto rispetto alla domanda del periodo: è il segnale di una SMax più bassa della domanda.
    cut = { n: 0, pieces: 0, value: 0 };
    for (const { c, calc } of rows) {
      if (!calc.capped) continue;
      const lost = Math.max(0, Math.ceil(calc.base - c.disp - 1e-9)) - Math.max(0, Math.ceil(Math.min(calc.base, calc.smax) - c.disp - 1e-9));
      if (lost > 0) { cut.n++; cut.pieces += lost; cut.value += lost * c.cost; }
    }
    rows = rows.filter(x => x.qty > 0);
    if (R.minLine > 0) { const keep = rows.filter(x => x.qty * x.c.cost >= R.minLine - 1e-9); excluded.minline = rows.length - keep.length; rows = keep; }   // valore minimo di riga
    for (const x of rows) { add(x.c, x.qty, `Copertura di ${mesiTxt(months)}`).calc = x.calc; need += x.qty * x.c.cost; }
  } else {
    budget = Math.max(0, +p.budget || 0); left = budget;
    need = cands.reduce((t, c) => t + Math.max(0, Math.ceil(c.top - c.disp - 1e-9)) * c.cost, 0);   // quanto costa portare tutti alla SMax
    // Passo 1: i codici sotto la SMin tornano alla SMin, in ordine di precedenza.
    smin = { n: 0, value: 0, short: 0 };
    for (const c of cands.filter(c => c.disp < c.smin).sort(byReg)) {
      const want = Math.ceil(c.smin - c.disp - 1e-9), n = Math.min(want, Math.floor((left + 1e-9) / c.cost));
      if (n > 0) { const l = add(c, n, c.tier === 1 ? "A zero con fabbisogno" : "Sotto SMin"); left -= n * c.cost; smin.n++; smin.value += n * c.cost; if (n < want) l.partial = true; }
      if (n < want) smin.short++;
    }
    // Passo 2: il resto in mesi uguali di vendita regolare, senza superare la SMax.
    const E2 = cands.map(c => ({ c, vr: c.vr, cost: c.cost, off: 0, cap: Math.max(0, Math.floor(Math.min(c.top, c.ceil) - c.disp - got(c) + 1e-9)), tcap: c.ceil < c.top }));
    const s2 = spread(E2, left, byReg);
    left = s2.left; prop = { level: s2.level, n: s2.n, value: s2.value, full: s2.full };
    const info = new Map();
    for (const e of E2) {
      if (e.q > 0) add(e.c, e.q, "In proporzione alle vendite regolari");
      info.set(e.c.code, { p2: { qty: e.q, room: e.cap, capped: e.cap > 0 && e.q >= e.cap, short: e.short, tcap: e.tcap ? R.maxTotal : 0 } });
    }
    // Passo 3 (solo importo libero): quello che resta dopo aver portato tutti alla SMax sale oltre la SMax.
    if (mode === "free" && s2.full && left >= 0.01) {
      const E3 = cands.map(c => {
        const have = c.disp + got(c);
        const lim = Math.min(maxCover ? Math.floor(c.top + maxCover * c.cons_eff + 1e-9) : Infinity, c.ceil);
        return { c, vr: c.vr, cost: c.cost, off: Math.max(0, have - c.top), cap: Number.isFinite(lim) ? Math.max(0, lim - have) : Infinity, tcap: c.ceil < (maxCover ? Math.floor(c.top + maxCover * c.cons_eff + 1e-9) : Infinity) };
      });
      const s3 = spread(E3, left, byReg);
      left = s3.left; extra = { level: s3.level, n: s3.n, value: s3.value, full: s3.full, limit: maxCover || null };
      for (const e of E3) {
        if (e.q > 0) add(e.c, e.q, "Oltre la SMax");
        if (e.vr > 0) info.get(e.c.code).p3 = { qty: e.q, off: e.off, room: Number.isFinite(e.cap) ? e.cap : null, capped: Number.isFinite(e.cap) && e.q >= e.cap, short: e.short, tcap: e.tcap ? R.maxTotal : 0 };
      }
    }
    for (const l of lines.values()) {
      const c = info.get(l.code) || {}, first = l.steps.find(s => s.note === "A zero con fabbisogno" || s.note === "Sotto SMin");
      l.calc = { kind: "amount", reg: l.regolarita, has_reg: hasReg, w: R.regWeight, ce: l.cons_eff, vr: l.vr, smin_qty: first ? first.qty : 0, level: prop.level, p2: c.p2 || null,
        level3: extra ? extra.level : null, p3: c.p3 || null, limit: extra ? extra.limit : null };
    }
  }

  // Ordine delle righe: prima chi era sotto la SMin, poi regolarità e consumo.
  const front = l => (l.tier <= 2 ? 0 : 1);
  const out = [...lines.values()].sort((a, b) => front(a) - front(b) || byReg(a, b));
  let cum = 0;
  out.forEach((l, n) => { l.rank = n + 1; cum += l.value; l.cum = cum; l.cover_after = l.cons_eff > 0 ? (l.disp + l.qty) / l.cons_eff : null; });
  const t1 = cands.filter(c => c.tier === 1), t2 = cands.filter(c => c.tier === 2);
  const okMin = c => { const l = lines.get(c.code); return l && c.disp + l.qty >= c.smin; };
  const spent = out.reduce((t, l) => t + l.value, 0);
  const byGroup = {};
  for (const l of out) { const g = byGroup[l.grp] || (byGroup[l.grp] = { id: l.grp, label: GROUPS[l.grp] || "Altri codici", n: 0, value: 0 }); g.n++; g.value += l.value; }
  let listInfo = null;
  if (list) {
    const present = new Set(items.map(i => i.code));
    const missing = [...list].filter(c => !present.has(c));
    listInfo = { n: list.size, found: list.size - missing.length, missing: missing.slice(0, 50), n_missing: missing.length,
      no_need: [...list].filter(c => present.has(c) && !lines.has(c)).length };
  }
  return {
    lines: out,
    summary: {
      list: listInfo, mode, months, rules: { ...R, months, maxCover, minDemand }, budget, spent, left: left == null ? null : Math.max(0, budget - spent), need,
      cut, smin, prop, extra, no_reg: !hasReg, n_cands: cands.length, excluded, n_lines: out.length, pieces: out.reduce((t, l) => t + l.qty, 0),
      zero_tot: t1.length, zero_cov: t1.filter(okMin).length, sotto_tot: t2.length, sotto_cov: t2.filter(okMin).length,
      by_group: Object.values(byGroup).sort((a, b) => b.value - a.value || cmp(a.id, b.id))
    }
  };
}

/* Regole di riordino: le sceglie ogni utente, valgono per le proposte d'ordine.
 * SMin e SMax non sono regole: le rispetta lo scenario scelto (solo l'importo libero può superare la SMax).
 * months       periodo da coprire nello scenario a periodo: 1, 2 o 3 mesi
 * consAdj      correzione del consumo medio in percentuale (da -50 a +50)
 * round        arrotondamento del consumo del periodo: "nearest" al più vicino, "up" per eccesso, "down" per difetto
 * minDemand    escludi i codici con consumo medio sotto questa soglia (pezzi al mese)
 * exclOnDemand escludi i codici segnati come su richiesta
 * minLine      escludi le righe di valore inferiore (euro, scenario a periodo)
 * maxCover     importo libero: al massimo SMax + maxCover mesi di consumo per codice (da 1 a 6; 0 = nessun limite)
 * regWeight    peso della regolarità nella vendita regolare, da 0 a 100%: vendita regolare = consumo × (regolarità ÷ 12)^(peso)
 * maxTotal     copertura massima totale in mesi di consumo, in tutti gli scenari (mai sotto la SMin; 0 = nessun tetto)
 * alertMonths  avviso se la copertura dopo l'ordine supera questi mesi */
const RULES_DEFAULT = { months: 1, consAdj: 0, round: "nearest", minDemand: 0, exclOnDemand: true, minLine: 0, maxCover: 0, alertMonths: 3, regWeight: 100, maxTotal: 0 };
const cleanCover = v => (MAX_COVER.includes(+v) ? +v : 0);
// Copertura massima totale (mesi di consumo), in tutti gli scenari: nessun codice la supera, ma la SMin resta garantita. 0 = nessun tetto.
const MAX_TOTAL = [0, 2, 3, 4, 5, 6, 9, 12];
function cleanRules(r) {
  r = r && typeof r === "object" ? r : {};
  const n = (v, lo, hi, d) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  const b = (v, d) => (typeof v === "boolean" ? v : d);
  const D = RULES_DEFAULT;
  return {
    months: MONTHS.includes(+r.months) ? +r.months : D.months, consAdj: Math.round(n(r.consAdj, -50, 50, D.consAdj)),
    round: ["nearest", "up", "down"].includes(r.round) ? r.round : D.round,
    minDemand: n(r.minDemand, 0, 1000, D.minDemand), exclOnDemand: b(r.exclOnDemand, D.exclOnDemand), minLine: n(r.minLine, 0, 1e6, D.minLine),
    maxCover: cleanCover(r.maxCover), alertMonths: n(r.alertMonths, 0.5, 24, D.alertMonths),
    regWeight: Math.round(n(r.regWeight, 0, 100, D.regWeight)), maxTotal: MAX_TOTAL.includes(+r.maxTotal) ? +r.maxTotal : D.maxTotal
  };
}
const ROUND = { nearest: x => Math.round(x), up: x => Math.ceil(x - 1e-9), down: x => Math.floor(x + 1e-9) };

/* Indicatori di un caricamento. La rotazione annua è il consumo medio mensile × 12. */
function kpis(items, flagged = new Set(), sampleCap = 5000) {
  const hist = items.filter(i => i.status !== "nostorico");
  const sum = (a, f) => a.reduce((t, i) => t + f(i), 0);
  const valTot = sum(items, i => i.val_giac);

  const byStatus = ["ok", "sotto", "eccesso", "fermo", "nostorico"].map(s => {
    const a = items.filter(i => i.status === s);
    return { status: s, n: a.length, val: sum(a, i => i.val_giac), action: sum(a, i => i.val_action) };
  });

  const rotB = [["Nessuna domanda", v => v <= 0], ["Fino a 1 pz/anno", v => v > 0 && v <= 1], ["1–3 pz/anno", v => v > 1 && v <= 3],
    ["3–6 pz/anno", v => v > 3 && v <= 6], ["6–12 pz/anno", v => v > 6 && v <= 12], ["12–24 pz/anno", v => v > 12 && v <= 24], ["Oltre 24 pz/anno", v => v > 24]];
  const rotation = rotB.map(([label, f]) => { const a = hist.filter(i => f(annuo(i))); return { label, n: a.length, val: sum(a, i => i.val_giac) }; });

  const withStock = hist.filter(i => i.giac > 0);
  const months = i => i.cons_mese > 0 ? i.giac / i.cons_mese : Infinity;
  const covB = [["Meno di 1 mese", m => m < 1], ["1–3 mesi", m => m >= 1 && m < 3], ["3–6 mesi", m => m >= 3 && m < 6], ["6–12 mesi", m => m >= 6 && m < 12],
    ["Oltre 12 mesi", m => m >= 12 && m !== Infinity], ["Nessuna domanda", m => m === Infinity]];
  const coverage = covB.map(([label, f]) => { const a = withStock.filter(i => f(months(i))); return { label, n: a.length, val: sum(a, i => i.val_giac) }; });

  const cons = hist.map(i => ({ i, cv: annuo(i) * i.cost })).filter(x => x.cv > 0).sort((a, b) => b.cv - a.cv || cmp(a.i.code, b.i.code));
  const cvTot = sum(cons, x => x.cv);
  const abc = { A: { n: 0, val: 0, cv: 0, sotto: 0 }, B: { n: 0, val: 0, cv: 0, sotto: 0 }, C: { n: 0, val: 0, cv: 0, sotto: 0 } };
  const curve = [{ x: 0, y: 0 }];
  let cum = 0; const stepN = Math.max(1, Math.floor(cons.length / 40));
  cons.forEach((x, k) => {
    const share = cvTot ? cum / cvTot : 0;
    const cls = share < 0.8 ? "A" : share < 0.95 ? "B" : "C";
    cum += x.cv;
    const g = abc[cls]; g.n++; g.val += x.i.val_giac; g.cv += x.cv; if (x.i.status === "sotto") g.sotto++;
    if ((k + 1) % stepN === 0 || k === cons.length - 1) curve.push({ x: (k + 1) / cons.length, y: cvTot ? cum / cvTot : 0 });
  });
  const noCons = hist.filter(i => !(annuo(i) * i.cost > 0));

  const top = hist.filter(i => i.cons_mese > 0).sort((a, b) => b.cons_mese - a.cons_mese || cmp(a.code, b.code)).slice(0, 20)
    .map(i => ({ code: i.code, descr: i.descr, cons_mese: i.cons_mese, regolarita: i.regolarita, giac: i.giac, ord: i.ord, smin: i.smin, smax: i.smax, status: i.status, cost: i.cost, months: i.giac / i.cons_mese }));

  const types = new Map();
  for (const i of hist) {
    const k = (i.descr || "Senza descrizione").trim() || "Senza descrizione";
    const t = types.get(k) || { label: k, n: 0, val: 0, idle: 0 };
    t.n++; t.val += i.val_giac; if (i.status === "eccesso" || i.status === "fermo") t.idle += i.val_action; types.set(k, t);
  }
  const typesTop = [...types.values()].sort((a, b) => b.val - a.val || cmp(a.label, b.label)).slice(0, 12);

  let pts = withStock.filter(i => i.cons_mese > 0).map(i => [i.cons_mese, months(i), i.status, i.code, i.val_giac]);
  if (pts.length > sampleCap) { pts.sort((a, b) => b[4] - a[4] || cmp(a[3], b[3])); pts = pts.slice(0, sampleCap); }

  const dem = hist.filter(i => i.smin > 0 && !flagged.has(i.code));
  const service = dem.length ? dem.filter(i => i.giac > 0).length / dem.length : null;
  const monthlyCons = cvTot / 12;
  return {
    val_tot: valTot, n_codes: hist.length, service, n_dem: dem.length, n_zero: dem.filter(i => i.giac <= 0).length,
    coverage_months: monthlyCons > 0 ? valTot / monthlyCons : null, cons_year: cvTot,
    idle_share: valTot ? (byStatus[2].action + byStatus[3].action) / valTot : 0,
    by_status: byStatus, rotation, coverage, abc, abc_none: { n: noCons.length, val: sum(noCons, i => i.val_giac) }, curve, top, types: typesTop, scatter: pts
  };
}

module.exports = { REG_MAX, MAX_TOTAL, RULES_DEFAULT, MODES, MONTHS, MAX_COVER, cleanRules, cross, scenario, filterValues, kpis, GROUPS };
