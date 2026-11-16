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
 * regolarita = indice di regolarità delle vendite (da 0 a 12: più è alto, più il codice si vende con continuità).
 *              È solo informativo: non entra nel calcolo delle quantità.
 * cons_mese  = consumo medio mensile in pezzi. È la base di coperture, scenari e indicatori.
 * La colonna QtaVen/UltVen contiene la quantità venduta di recente oppure, se è nel formato AAAAMMGG,
 * la data dell'ultima vendita.
 * rowsB: [code, giac, desc]
 */
function cross(rowsA, rowsB) {
  if (!Array.isArray(rowsA) || !Array.isArray(rowsB)) throw new Error("Formato dati non valido.");
  if (rowsA.length > MAX_ROWS || rowsB.length > MAX_ROWS) throw new Error("File troppo grandi (massimo 150.000 righe).");

  const giac = new Map(), bDesc = new Map();
  for (const r of rowsB) {
    if (!Array.isArray(r)) continue;
    const c = code(r[0]); if (!c) continue;
    giac.set(c, (giac.get(c) || 0) + num(r[1]));
    if (!bDesc.has(c) && r[2] != null) bDesc.set(c, str(r[2]));
  }

  const seen = new Set(), items = [];
  let dup = 0;
  for (const r of rowsA) {
    if (!Array.isArray(r)) continue;
    const c = code(r[0]); if (!c) continue;
    if (seen.has(c)) { dup++; continue; }
    seen.add(c);
    const inB = giac.has(c);
    const g = inB ? giac.get(c) : 0;
    const cost = num(r[4]), ord = num(r[5]), smin = num(r[6]), smax = num(r[7]);
    const disp = g + ord, sf = saleField(r[11]);
    let status = "ok", delta = 0, val = 0;
    if (g > 0 && smin === 0 && smax === 0) { status = "fermo"; delta = -g; val = g * cost; }
    else if (disp < smin) { status = "sotto"; delta = Math.max(smax, smin) - disp; val = delta * cost; }
    else if (g > smax) { status = "eccesso"; delta = -(g - smax); val = (g - smax) * cost; }
    items.push({
      code: c, descr: str(r[1]), loc: str(r[2], 20), dg: str(r[3], 20), status, in_b: inB,
      giac: g, ord, smin, smax, delta, cost, val_giac: g * cost, val_action: val, regolarita: Math.max(0, num(r[8])), cons_mese: Math.max(0, num(r[9])), listino: r[10] == null || r[10] === "" ? null : num(r[10]),
      qty_sold: sf.qty, last_sale: sf.date, ven_spc: r[12] == null || r[12] === "" ? null : num(r[12]), fab: r[13] == null || r[13] === "" ? null : num(r[13])
    });
  }
  for (const [c, q] of giac) {
    if (seen.has(c) || q <= 0) continue;
    items.push({ code: c, descr: bDesc.get(c) || "", loc: "", dg: "", status: "nostorico", in_b: true,
      giac: q, ord: 0, smin: 0, smax: 0, delta: 0, cost: 0, val_giac: 0, val_action: 0, regolarita: 0, cons_mese: 0, listino: null, qty_sold: null, last_sale: null, ven_spc: null, fab: null });
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
  return { items, kpi, dup };
}

/* Gruppo principale: quarta cifra del codice particolare (es. AAA 8 00111 -> 8). */
const GROUPS = { "0": "Accessori e vernici", "1": "Motore", "2": "Alimentazione e scarico", "3": "Cambio", "4": "Assale anteriore e sterzo",
  "5": "Assale posteriore", "6": "Ruote e freni", "7": "Leve e pedali", "8": "Carrozzeria e clima", "9": "Impianto elettrico" };
const mainGroup = code => { const c = String(code || "")[3]; return c >= "0" && c <= "9" ? c : "X"; };

function abcMap(items) {
  const cons = items.filter(i => i.status !== "nostorico").map(i => ({ code: i.code, cv: annuo(i) * i.cost })).filter(x => x.cv > 0).sort((a, b) => b.cv - a.cv || cmp(a.code, b.code));
  const tot = cons.reduce((t, x) => t + x.cv, 0); const m = new Map(); let cum = 0;
  for (const x of cons) { const sh = tot ? cum / tot : 0; m.set(x.code, sh < 0.8 ? "A" : sh < 0.95 ? "B" : "C"); cum += x.cv; }
  return m;
}

/* Valori disponibili per i filtri di una settimana */
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
 * Scenari d'ordine. La domanda è il consumo medio mensile in pezzi (cons_mese).
 *  budget : fase 1 codici a zero con fabbisogno e sotto SMin portati a SMin; fase 2 (facoltativa) fino a SMax; si ferma al budget.
 *  cover  : per ogni codice con domanda, obiettivo = domanda di N mesi (almeno SMin se richiesto); tetto di spesa facoltativo.
 *  level  : tutti i codici riportati a SMin oppure a SMax; tetto di spesa facoltativo.
 * Ordine di priorità: codici a zero, poi sotto SMin, poi il resto; a parità vince domanda x persistenza / radice del costo.
 * Filtri: gruppo principale, DG, classe ABC, testo su codice o descrizione.
 */
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
  const months = Math.min(24, Math.max(0.25, +p.months || 1));
  const flagged = p.flagged || new Set();
  const minDemand = Math.max(0, +p.minDemand || 0);
  const excluded = { flag: 0, noparams: 0, low: 0 };

  const cands = [];
  for (const i of items) {
    if (i.status === "fermo" || i.status === "nostorico" || !(i.cost > 0)) continue;
    if (p.mode !== "cover" && p.mode !== "target" && i.status === "eccesso") continue;
    if (!inFilter(i)) continue;
    // Codici su richiesta: segnati dal responsabile, senza SMin e SMax, o con consumo sotto soglia
    const forced = list && p.listOverride;   // codici scelti esplicitamente: niente esclusioni automatiche
    if (flagged.has(i.code) && !forced) { if (i.smin > 0 || i.cons_mese > 0) excluded.flag++; continue; }
    if (i.smin === 0 && i.smax === 0 && !p.includeNoParams && !forced) { if (p.mode === "cover" && i.cons_mese > 0) excluded.noparams++; continue; }
    if (minDemand > 0 && i.cons_mese < minDemand) { excluded.low++; continue; }   // soglia in pezzi al mese
    const persist = i.status === "sotto" ? 1 + 0.15 * Math.min(Math.max(i.streak - 1, 0), 6) : 1;
    cands.push({ ...i, tier: tierOf(i), disp: i.giac + i.ord, cls: abc.get(i.code) || "N", grp: mainGroup(i.code),
      score: (i.cons_mese > 0 ? annuo(i) : 0.5) * persist / Math.sqrt(i.cost) });
  }
  const byPrio = (a, b) => (a.c.tier <= 2 ? a.c.tier : 3) - (b.c.tier <= 2 ? b.c.tier : 3) || b.c.score - a.c.score || cmp(a.c.code, b.c.code);
  let steps = [];
  if (p.mode === "budget" || p.mode === "target") {
    const p1 = cands.filter(c => c.tier <= 2 && c.smin > 0).map(c => ({ c, qty: Math.ceil(c.smin - c.disp), note: c.tier === 1 ? "A zero con fabbisogno" : "Sotto SMin" })).filter(x => x.qty > 0).sort(byPrio);
    const p2 = p.fill === false && p.mode === "budget" ? [] : cands.filter(c => c.status !== "eccesso").map(c => ({ c, qty: Math.ceil(c.smax - Math.max(c.disp, c.tier <= 2 ? c.smin : c.disp)), note: c.tier <= 2 ? "completato fino a SMax" : "riempimento fino a SMax" }))
      .filter(x => x.qty > 0).sort((a, b) => b.c.score - a.c.score || cmp(a.c.code, b.c.code));
    steps = p1.concat(p2);
  } else if (p.mode === "level") {
    const toMax = p.level === "smax";
    steps = cands.map(c => ({ c, qty: Math.ceil((toMax ? Math.max(c.smax, c.smin) : c.smin) - c.disp), note: toMax ? "Riporto a SMax" : "Riporto a SMin" })).filter(x => x.qty > 0).sort(byPrio);
  } else {
    // entrano i codici con consumo e, se si tiene la SMin, anche quelli con SMin ma senza consumo registrato
    steps = cands.filter(c => c.cons_mese > 0 || (p.keepMin !== false && c.smin > 0)).map(c => {
      // consumo atteso nel periodo arrotondato al pezzo più vicino: sotto mezzo pezzo non si ordina, salvo SMin
      const target = Math.max(Math.round(c.cons_mese * months), p.keepMin === false ? 0 : c.smin);
      return { c, qty: Math.ceil(target - c.disp), note: `Copertura di ${months.toLocaleString("it-IT")} ${months === 1 ? "mese" : "mesi"}` };
    }).filter(x => x.qty > 0).sort(byPrio);
  }

  const need = steps.reduce((t, x) => t + x.qty * x.c.cost, 0);
  const cap = p.mode === "budget" || p.mode === "target" ? Math.max(0, +p.budget || 0) : (+p.budget > 0 ? +p.budget : Infinity);
  let left = cap;
  const lines = new Map();
  const add = (x, q) => {
    left -= q * x.c.cost;
    let l = lines.get(x.c.code);
    if (!l) {
      const c = x.c, why = [];
      if (c.tier === 1) why.push("A zero con fabbisogno"); else if (c.tier === 2) why.push("Sotto SMin");
      if (c.status === "sotto" && c.streak > 1) why.push(`da ${c.streak} settimane`);
      if (c.status === "eccesso") why.push("già sopra SMax");
      if (c.cons_mese > 0) why.push(`consumo medio ${c.cons_mese.toLocaleString("it-IT", { maximumFractionDigits: 2 })} pz/mese`);
      l = { rank: lines.size + 1, code: c.code, descr: c.descr, loc: c.loc, dg: c.dg, grp: c.grp, cls: c.cls, status: c.status, in_b: c.in_b, tier: c.tier,
        giac: c.giac, ord: c.ord, smin: c.smin, smax: c.smax, cons_mese: c.cons_mese, regolarita: c.regolarita, cost: c.cost, listino: c.listino, streak: c.streak, qty: 0, value: 0, reasons: why, partial: false,
        qty_sold: c.qty_sold, last_sale: c.last_sale, ven_spc: c.ven_spc, fab: c.fab, prev_giac: c.prev_giac,
        cover_before: c.cons_mese > 0 ? (c.giac + c.ord) / c.cons_mese : null };
      lines.set(c.code, l);
    }
    l.qty += q; l.value += q * x.c.cost;
    if (!l.reasons.includes(x.note) && !(x.note === "A zero con fabbisogno" || x.note === "Sotto SMin")) l.reasons.push(x.note);
    if (q < x.qty) l.partial = true;
  };
  for (const x of steps) {
    if (left < 0.01) break;
    const q = Math.min(x.qty, Math.floor((left + 1e-9) / x.c.cost));
    if (q > 0) add(x, q);
  }

  /* Obiettivo d'acquisto: il budget che resta va in anticipo sui codici che ruotano di più,
     portandoli tutti alla stessa copertura in mesi (prima quelli con copertura più bassa),
     entro una rotazione minima e una copertura massima. */
  let target = null;
  if (p.mode === "target" && left >= 0.01) {
    // Nessuna soglia di rotazione: la proporzione la dà il livellamento (quantità = copertura x domanda).
    // Copertura massima facoltativa: senza limite il livello sale finché l'importo è raggiunto.
    const minRot = Math.max(0, +p.minRot || 0), maxCov = +p.maxCover > 0 ? Math.min(120, +p.maxCover) : Infinity;
    const pool = cands.filter(c => c.cons_mese > 0 && annuo(c) >= minRot).map(c => {
      const l = lines.get(c.code); return { c, m: c.cons_mese, base: c.disp + (l ? l.qty : 0) };
    });
    const qtyAt = (x, C) => Math.max(0, Math.floor(C * x.m - x.base + 1e-9));
    const costAt = C => pool.reduce((t, x) => t + qtyAt(x, C) * x.c.cost, 0);
    let lo = 0, hi = isFinite(maxCov) ? maxCov : 12;
    if (!isFinite(maxCov)) while (costAt(hi) < left && hi < 1200) hi *= 2;
    if (costAt(hi) <= left) lo = hi;
    else for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (costAt(mid) <= left) lo = mid; else hi = mid; }
    const alloc = new Map();
    for (const x of pool) { const q = qtyAt(x, lo); if (q > 0) alloc.set(x, q); }
    let spent3 = 0; for (const [x, q] of alloc) spent3 += q * x.c.cost;
    let rem = left - spent3;
    // rifinitura: un pezzo in più solo ai codici che sarebbero i prossimi a riceverlo (copertura successiva
    // vicina al livello raggiunto), così i codici lenti non ricevono pezzi solo perché costano poco
    const tol = Math.max(0.5, lo * 0.1);
    const next = pool.map(x => ({ x, cov: (x.base + (alloc.get(x) || 0) + 1) / x.m })).filter(y => y.cov <= Math.min(maxCov, lo + tol) + 1e-9).sort((a, b) => a.cov - b.cov || cmp(a.x.c.code, b.x.c.code));
    for (const y of next) { if (y.x.c.cost <= rem + 1e-9) { alloc.set(y.x, (alloc.get(y.x) || 0) + 1); rem -= y.x.c.cost; } }
    const note = `anticipo per l'obiettivo (copertura fino a ${lo.toLocaleString("it-IT", { maximumFractionDigits: 1 })} mesi)`;
    const order = [...alloc.entries()].sort((a, b) => (a[0].base / a[0].m) - (b[0].base / b[0].m) || cmp(a[0].c.code, b[0].c.code));
    let n3 = 0, v3 = 0;
    for (const [x, q] of order) { add({ c: x.c, qty: q, note }, q); n3++; v3 += q * x.c.cost; }
    target = { level: lo, max_cover: isFinite(maxCov) ? maxCov : null, min_rot: minRot, n: n3, value: v3, pool: pool.length, unspent: Math.max(0, left),
      capped: isFinite(maxCov) ? left >= 1 && lo >= maxCov - 1e-9 : left > Math.max(100, 0.01 * cap) };
  }
  const out = [...lines.values()];
  let cum = 0;
  for (const l of out) { cum += l.value; l.cum = cum; l.cover_after = l.cons_mese > 0 ? (l.giac + l.ord + l.qty) / l.cons_mese : null; }
  const t1 = cands.filter(c => c.tier === 1), t2 = cands.filter(c => c.tier === 2);
  const okMin = c => { const l = lines.get(c.code); return l && c.disp + l.qty >= c.smin; };
  const spent = cap === Infinity ? need : cap - left;
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
      list: listInfo, target, mode: p.mode, months, level: p.level, budget: cap === Infinity ? null : cap, spent: p.mode === "target" ? spent : Math.min(spent, need), left: cap === Infinity ? null : Math.max(0, left),
      need, n_cands: cands.length, excluded, n_lines: out.length, pieces: out.reduce((t, l) => t + l.qty, 0),
      zero_tot: t1.length, zero_cov: t1.filter(okMin).length, sotto_tot: t2.length, sotto_cov: t2.filter(okMin).length,
      by_group: Object.values(byGroup).sort((a, b) => b.value - a.value || cmp(a.id, b.id))
    }
  };
}

/* Indicatori di una settimana. La rotazione annua è il consumo medio mensile × 12. */
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

module.exports = { cross, scenario, filterValues, kpis, GROUPS };
