"use strict";
/* Parts Planning · caricamento dei file: lettura, riconoscimento delle colonne, giacenze, perimetro */

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
  await loadPerim();
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
/* ============ Perimetro della rete ============
 * Se l'amministratore ha caricato un elenco di codici, ogni caricamento elabora solo quei codici (lo applica il server).
 * Qui serve per dire prima di salvare quanti codici dei file verranno elaborati. */
async function loadPerim(force) {
  if (state.perim && !force) return state.perim;
  try {
    const P = await api("GET", "/api/perimeter");
    P.set = P.active ? new Set((await api("GET", "/api/perimeter/codes")).codes) : null;
    state.perim = P;
  } catch (e) { state.perim = { active: false, set: null }; }
  return state.perim;
}
function perimNote() {
  const P = state.perim; if (!P || !P.active || !P.set || !state.upload.A.length) return "";
  const seen = new Set(); let inP = 0;
  for (const r of extract("A")) { const c = codeKey(r[0]); if (!c || seen.has(c)) continue; seen.add(c); if (P.set.has(c)) inP++; }
  return `Perimetro della rete: l'amministratore ha scelto ${fmtN(P.n)} codici e vengono elaborati solo quelli. Delle tue liste ne entrano ${fmtN(inP)} su ${fmtN(seen.size)}; gli altri ${fmtN(seen.size - inP)} non vengono salvati.`;
}
function stockSumHtml() {
  const h = stockSumCore(); if (!h) return h;
  const U = state.upload, LS = listStock(), notes = [];
  const pn = perimNote(); if (pn) notes.push(pn);
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
    toast(`Dati salvati: ${fmtN(r.kpi.n_codes)} codici${r.dup ? `, ${fmtN(r.dup)} doppioni nello storico contati una volta` : ""}. ${stockNote(r)}.${r.perim_n ? ` Perimetro della rete: ${fmtN(r.n_out)} codici dei file sono rimasti fuori.` : ""}`);
    await loadSnapshots(); state.analisi = { ...state.analisi, snapId: r.id, offset: 0, f: "tutti", q: "", sort: null };
    if (onDone) return onDone(r);
    go("analisi");
  } catch (e) {
    if (e.silent) return;
    err.hidden = false; err.textContent = e.message; st.textContent = ""; b.disabled = false;
  }
}
