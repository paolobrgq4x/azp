"use strict";
/* Parts Planning · generatore di dati di prova */

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
    // da 1 a 60.000 codici; il file giacenze non può avere molti più codici delle liste (al massimo il 10% in più, o 10 codici)
    const wantB = Math.min(60000, Math.max(1, n($("#gnb").value)) || 1);
    P.nA = Math.min(60000, Math.max(1, n($("#gna").value) || 1)); P.nB = Math.min(wantB, Math.max(P.nA + 10, Math.round(P.nA * 1.1)));
    $("#gna").value = fmtN(P.nA); $("#gnb").value = fmtN(P.nB);
    const capB = P.nB < wantB ? ` Il file giacenze è stato portato a ${fmtN(P.nB)} codici: non può averne molti più delle liste.` : "";
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
      st.textContent = `Fatto: ${weeks.length * 2} file Excel in un unico .zip, ${fmtN(P.nA)} ${P.nA === 1 ? "codice" : "codici"} nelle liste e ${fmtN(G.weeks[G.weeks.length - 1].B.length)} nel file giacenze.${capB} ${weeks.length > 1 ? "Ultimo caricamento: venduto" : "Venduto"} annuo ${fmtE(G.mov)}, valore a magazzino ${fmtE(G.stock)}.`;
    } catch (x) { st.textContent = ""; toast("Generazione non riuscita: " + x.message); }
    finally { b.disabled = false; }
  };
}
