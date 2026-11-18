"use strict";
/* PartsPlanner · procedura guidata «Nuovo ordine» */

async function viewNuovo(main) {
  if (needDealer(main)) return;
  if (!state.snapshots.length) await loadSnapshots();
  if (W.dealer !== state.dealerId) { Object.assign(W, { step: 1, snapId: null, codes: [], lookup: null, codesMode: "all", groups: [], abc: [] }); W.dealer = state.dealerId; state.ordine.history = []; }
  main.innerHTML = `<div class="head"><div><h1>Nuovo ordine</h1><p class="sub">${esc(dealerName(state.dealerId))}. Scegli l'obiettivo, carica i dati più recenti, scegli i codici e ottieni il risultato.</p></div></div>
    <ol class="stepper" aria-label="Avanzamento">${WSTEPS.map((t, k) => `<li class="${k + 1 < W.step ? "done" : k + 1 === W.step ? "cur" : ""}"${k + 1 === W.step ? ' aria-current="step"' : ""}><span class="sn">${k + 1 < W.step ? "✓" : k + 1}</span><span class="st">${t}</span></li>`).join("")}</ol>
    ${W.step > 1 ? `<p class="small muted wgoal">Obiettivo: <b>${esc(SCENARI[W.purpose].t)}</b> · ${esc(W.purpose === "cover" ? orizzLabel(rules().months) : fmtE(wBudget()))} <button class="link" type="button" id="wchg">cambia</button></p>` : ""}
    <div id="wbody"></div>`;
  if ($("#wchg")) $("#wchg").onclick = () => wGo(main, 1);
  ({ 1: wStep1, 2: wStep2, 3: wStep3, 4: wStep4, 5: wStep5 })[W.step]($("#wbody"), main);
}
const wGo = (main, n) => { W.step = n; viewNuovo(main); window.scrollTo(0, 0); };

function wStep1(body, main) {
  const card = (id, inner) => `<label class="choice big${W.purpose === id ? " on" : ""}" for="pp_${id}"><input type="radio" name="pp" id="pp_${id}" value="${id}"${W.purpose === id ? " checked" : ""}><span><b>${SCENARI[id].t}</b><span class="small muted">${SCENARI[id].d}</span><span class="pin">${inner}</span></span></label>`;
  const amount = id => `<input type="text" id="pt_${id}" data-amt="${id}" inputmode="decimal" aria-label="Importo da ordinare in euro" value="${esc(fmtN(W.budgets[id]))}"><span class="small muted">€</span>`;
  body.innerHTML = `<section class="panel"><span class="num mono small muted">PASSO 1 DI 5</span><h2>Qual è l'obiettivo?</h2>
    <div class="choices">
      ${card("cover", `<label class="small muted" for="hm">Periodo</label><select id="hm" aria-label="Periodo da coprire">${ORIZZ.map(([v, l]) => `<option value="${v}"${v === rules().months ? " selected" : ""}>${l}</option>`).join("")}</select>`)}
      ${card("amount", amount("amount"))}
      ${card("free", amount("free"))}
    </div>
    <div class="row" id="pextra"></div></section>
    <div class="wnav"><span></span><button class="btn primary" type="button" id="wnext">Avanti: liste movimentazione</button></div>`;
  const extra = () => {
    $$(".choice", body).forEach(l => l.classList.toggle("on", $("input", l).checked));
    $("#pextra").innerHTML = W.purpose === "free"
      ? overFields("p") + `<p class="small muted">La SMax viene superata solo dopo che tutti i codici ci sono arrivati. ${overHelp(rules())} Il tetto è in mesi di consumo medio sopra la SMax: con 2 mesi, un codice che vende 3 pezzi al mese può avere al massimo 6 pezzi oltre la SMax.</p>`
      : `<p class="small muted">${W.purpose === "cover" ? "Il risultato propone le quantità che coprono il periodo, da confermare riga per riga." : "Se tutti i codici arrivano alla SMax prima che l'importo sia finito, il resto non viene speso e la piattaforma dice quanto."}</p>`;
  };
  const extraAll = () => { extra(); overBind("p", extraAll); };
  const pick = id => { const r = $("#pp_" + id); if (!r.checked) { r.checked = true; W.purpose = id; extraAll(); } };
  $$("input[name=pp]", body).forEach(r => r.onchange = () => { W.purpose = r.value; extraAll(); });
  $("#hm").onchange = e => { rules().months = +e.target.value; saveRules(); };
  $("#hm").addEventListener("focus", () => pick("cover"));
  $$("[data-amt]", body).forEach(i => {
    i.addEventListener("focus", () => pick(i.dataset.amt));
    i.oninput = () => { W.budgets[i.dataset.amt] = parseNum(i.value); };
  });
  extraAll();
  $("#wnext").onclick = () => {
    if (W.purpose !== "cover") {
      W.budgets[W.purpose] = parseNum($("#pt_" + W.purpose).value);
      if (!(wBudget() > 0)) { toast("Indica un importo maggiore di zero."); return; }
      if ($("#pmc")) { overRead("p"); saveRules(); }
    }
    W.result = null; wGo(main, 2);
  };
}
/* Campi per l'importo libero: come salire oltre la SMax (quattro modi), il peso del misto, i due parametri del dinamico e il tetto per codice.
 * «x» è il prefisso degli id: «p» nella procedura guidata, «o» nella pagina degli scenari. */
function overFields(x) {
  const r = rules(), om = overMode(r), dyn = om === "dyn", opt = (list, cur, f) => list.map(v => `<option value="${v}"${v === cur ? " selected" : ""}>${f(v)}</option>`).join("");
  return `<fieldset class="overset"><legend>Come salire oltre la SMax</legend><div class="choices over">${OVER.map(([v, l, d, q]) => `<label class="choice${v === om ? " on" : ""}" for="${x}om_${v}"><input type="radio" name="${x}om" id="${x}om_${v}" value="${v}"${v === om ? " checked" : ""}><span><span class="q">${q}</span><b>${l}</b><span class="small muted">${d}</span></span></label>`).join("")}</div></fieldset>
    ${om === "mix" ? leverHtml(x + "ow", r.overWeight) : ""}
    ${dyn ? `<label class="field" for="${x}sm">Rivendere i pezzi in più entro<select id="${x}sm">${opt(SELL_MONTHS, r.sellMonths, mm)}</select></label>
    <label class="field" for="${x}sp">Probabilità minima di vendita<select id="${x}sp">${opt(SELL_PROB, r.sellProb, v => v + "%")}</select></label>` : ""}
    <label class="field" for="${x}mc">Tetto per codice oltre la SMax (facoltativo)<select id="${x}mc">${COVER_MAX.map(([v, l]) => `<option value="${v}"${v === r.maxCover ? " selected" : ""}>${l}</option>`).join("")}</select></label>`;
}
const overHelp = r => (overMode(r) === "dyn"
  ? "Con l'aumento dinamico, per ogni pezzo in più la piattaforma stima la probabilità di venderlo entro i mesi scelti e compra i pezzi dal più probabile da vendere al meno probabile: sale di più chi vende tanto e con regolarità. Si ferma quando finisce l'importo o quando la probabilità scende sotto la probabilità minima di vendita: quello che resta non viene speso."
  : OVER_DESC[overMode(r)] + " Senza tetto l'importo viene speso tutto; con un tetto, quello che non trova posto resta non speso.");
function overRead(x) {
  const r = rules(), g = id => $("#" + x + id);
  const om = $(`input[name=${x}om]:checked`); if (om) r.overMode = overMode({ overMode: om.value });
  if (g("ow")) r.overWeight = OVER_W[+g("ow").value] ?? 50;
  if (g("sm")) r.sellMonths = +g("sm").value;
  if (g("sp")) r.sellProb = +g("sp").value;
  if (g("mc")) r.maxCover = +g("mc").value;
}
// ogni scelta si salva subito; cambiando il modo i campi si ridisegnano (i due parametri servono solo al dinamico)
function overBind(x, redraw) {
  $$(`input[name=${x}om]`).forEach(el => el.onchange = () => { overRead(x); saveRules(); redraw(); });
  ["sm", "sp", "mc"].forEach(id => { const el = $("#" + x + id); if (el) el.onchange = () => { overRead(x); saveRules(); }; });
  leverBind($("#" + x + "ow"), () => { overRead(x); saveRules(); });
}
function wStep2(body, main) {
  if (!state.perim) loadPerim().then(() => { if (typeof updateSave === "function") updateSave(); });
  const U = state.upload, last = state.snapshots[state.snapshots.length - 1];
  const fresh = last && romeDay(last.uploaded_at) === romeDay(Date.now());
  body.innerHTML = `${last ? `<div class="msg${fresh ? "" : " old"}">Ultimo caricamento: ${esc(new Date(last.uploaded_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" }))}${last.uploaded_by_name ? `, da ${esc(last.uploaded_by_name)}` : ""}.${fresh ? "" : " Per un risultato aggiornato conviene caricare le liste e le giacenze più recenti."}
      <div class="row wrow"><button class="btn ${fresh ? "primary" : ""} sm" type="button" id="wuse">Usa questi dati e scegli i codici</button><span class="small muted">oppure carica i file qui sotto</span></div></div>` : ""}
    <section class="step" id="stepA"><span class="num">PASSO 2 DI 5</span><h2>Carica le liste movimentazione</h2>
      <p class="meta">Lista con codice, movimentazione, SMin, SMax, ordini aperti e prezzi. Se riporta anche le giacenze (alla fine del mese precedente), il file giacenze del passo successivo è facoltativo. Se è divisa in più file, aggiungili tutti: vengono uniti. Anche i fogli di uno stesso file con le stesse colonne vengono letti tutti e uniti.</p>
      <div id="listA"></div>
      <div class="row"><label class="btn" for="fileA">Scegli i file Excel</label><input type="file" id="fileA" accept=".xlsx,.xls,.xlsm,.csv" multiple></div>
      <div class="msg err" id="uerr" hidden></div>
    </section>
    <div class="wnav"><button class="btn" type="button" id="wback">Indietro</button><button class="btn primary" type="button" id="wnext">Avanti: giacenze</button></div>`;
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
  const U = state.upload, opt = listStock().has;
  body.innerHTML = `<section class="step" id="stepB"><span class="num">PASSO 3 DI 5</span><h2>${opt ? "Hai giacenze più recenti? (facoltativo)" : "Carica le giacenze attuali"}</h2>
      <p class="meta">${opt ? "Le liste riportano già le giacenze: puoi salvare così. Se hai un file giacenze più recente caricalo: le sue giacenze sostituiscono quelle delle liste. " : ""}Va bene qualsiasi estrazione del tuo gestionale, purché abbia una colonna con il codice e una con la quantità in giacenza: la piattaforma le riconosce da sola, ti mostra cosa ha letto e ignora tutte le altre colonne. Con più file o più fogli con le stesse colonne, le quantità dello stesso codice si sommano.</p>
      <p class="meta">Liste movimentazione: <b>${esc(U.A.map(s => s.wb.name).join(", "))}</b></p>
      <div id="listB"></div>
      <div class="row"><label class="btn" for="fileB">Scegli i file Excel</label><input type="file" id="fileB" accept=".xlsx,.xls,.xlsm,.csv" multiple></div>
      <div class="msg err" id="uerr" hidden></div>
    </section>
    <div id="stocksum"></div>
    <div class="wnav"><button class="btn" type="button" id="wback">Indietro</button><div class="row"><span class="small muted" id="sstat"></span><button class="btn primary" type="button" id="save">Incrocia e salva</button></div></div>`;
  wireSlot("B"); renderSlot("B"); updateSave();
  $("#wback").onclick = () => wGo(main, 2);
  $("#save").onclick = () => save(r => { W.snapId = r.id; W.lookup = null; wGo(main, 4); });
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
      <p class="small muted">Dati del ${esc(snapLabel(snap.week_date, snap.uploaded_at))}: ${fmtN(snap.n_codes)} codici. ${esc(stockNote(snap))}.</p>
      <div class="choices">${opt("all", "Tutti i codici", "La piattaforma valuta l'intero magazzino.")}${opt("manual", "Li scrivo io", "Inserisci i codici uno alla volta o incollane un elenco.")}${opt("excel", "Li carico da un Excel", "Un file con una colonna di codici.")}</div>
      <div id="cbox"></div>
      <details class="filters"${W.groups.length || W.abc.length ? " open" : ""}><summary>Restringi ancora (facoltativo)</summary><div class="fgrid">
        <div><p class="flabel">Gruppo principale <span class="muted">(4ª cifra del codice)</span></p><div class="chips">${meta.groups.map(g => `<button type="button" class="chip" data-g="${g.id}" aria-pressed="${W.groups.includes(g.id)}">${esc((g.id === "X" ? "–" : g.id) + " " + g.label)}<span class="n">${fmtN(g.n)}</span></button>`).join("")}</div></div>
        <div><p class="flabel">Classe ABC sul consumo</p><div class="chips">${[["A", "A · 80% del consumo"], ["B", "B · 15%"], ["C", "C · 5%"]].map(([k, l]) => `<button type="button" class="chip" data-abc="${k}" aria-pressed="${W.abc.includes(k)}">${l}<span class="n">${fmtN(meta.abc[k])}</span></button>`).join("")}</div></div>
      </div></details>
      <details class="filters"><summary>Codici su richiesta</summary><div class="fgrid">
        <label class="field" for="pmd">Escludi i codici con consumo medio inferiore a (pezzi al mese)<input type="text" id="pmd" inputmode="decimal" placeholder="nessuna soglia" value="${rules().minDemand ? esc(fmtN(rules().minDemand, 2)) : ""}"></label>
        <label class="check" for="pov"><input type="checkbox" id="pov"${W.listOverride ? " checked" : ""}> Per i codici che scelgo io, calcola anche quelli segnati su richiesta</label>
        <p class="small muted">I codici segnati come su richiesta sono esclusi, salvo l'opzione qui sopra per i codici scelti. I codici non tenuti a scorta (SMin e SMax a zero) sono sempre esclusi.</p></div></details>
    </section>
    <div class="wnav"><button class="btn" type="button" id="wback">Indietro</button><button class="btn primary" type="button" id="wnext">Calcola l'ordine</button></div>`;
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
    host.innerHTML = `<div class="bar"><p class="small"><b>${fmtN(W.codes.length)}</b> codici scelti · ${fmtN(L.rows.length)} trovati nei dati${L.missing.length ? ` · <span class="miss">${fmtN(L.missing.length)} non trovati</span>` : ""}</p><button class="link" type="button" id="cclear">Svuota</button></div>
      <div class="tablebox flagbox"><table><thead><tr><th>Codice</th><th>Descrizione</th><th>Stato</th><th class="num">Giacenza</th><th class="num">Ord. aperti</th><th class="num">SMin</th><th class="num">SMax</th><th class="num">Consumo/mese</th><th></th></tr></thead><tbody>
      ${L.rows.slice(0, 300).map(r => `<tr><td class="code">${esc(r.code)}</td><td class="desc">${esc(r.descr)}</td><td><span class="pill ${r.status}">${STATI[r.status]}</span>${r.ondemand ? ` <span class="pill off">su richiesta</span>` : ""}</td><td class="num">${fmtN(r.giac)}</td><td class="num">${fmtN(r.ord)}</td><td class="num">${fmtN(r.smin)}</td><td class="num">${fmtN(r.smax)}</td><td class="num">${r.cons_mese ? fmtN(r.cons_mese, 2) : "–"}</td><td><button class="link" type="button" data-rmc="${esc(r.code)}">Togli</button></td></tr>`).join("")}
      ${L.missing.slice(0, 100).map(c => `<tr><td class="code">${esc(c)}</td><td colspan="7" class="miss small">Non presente nei dati caricati</td><td><button class="link" type="button" data-rmc="${esc(c)}">Togli</button></td></tr>`).join("")}
      </tbody></table></div>${L.rows.length > 300 ? `<p class="small muted">A video i primi 300 codici trovati.</p>` : ""}`;
    $("#cclear").onclick = async () => { W.codes = []; W.listName = ""; await wLookup(); renderList(); };
    $$("[data-rmc]", host).forEach(b => b.onclick = () => { const c = b.dataset.rmc; W.codes = W.codes.filter(x => x !== c); L.rows = L.rows.filter(r => r.code !== c); L.missing = L.missing.filter(x => x !== c); renderList(); });
  };
  $$("input[name=cm]", body).forEach(r => r.onchange = () => { W.codesMode = r.value; renderBox(); });
  if (W.codes.length && !W.lookup) await wLookup();
  renderBox();
  $("#wback").onclick = () => wGo(main, 2);
  $("#wnext").onclick = () => {
    if (W.codesMode !== "all" && !(W.lookup && W.lookup.rows.length)) { toast("Indica almeno un codice presente nei dati caricati, oppure scegli «Tutti i codici»."); return; }
    rules().minDemand = parseNum($("#pmd").value); saveRules(); W.listOverride = $("#pov").checked;
    W.result = null; wGo(main, 5);
  };
}
async function wCompute() {
  const codes = W.codesMode === "all" ? [] : W.lookup.rows.map(r => r.code);
  const mode = SCENARI[W.purpose] ? W.purpose : "cover";
  const RR = rules(), seq = ++W.seq;
  const P = { mode, budget: mode === "cover" ? 0 : wBudget(), months: RR.months, maxCover: RR.maxCover, minDemand: RR.minDemand, listOverride: W.listOverride, rules: RR,
    filters: { groups: [...W.groups], abc: [...W.abc], dg: [], q: "", codes } };
  const r = await api("POST", `/api/snapshots/${W.snapId}/scenario`, P);
  if (seq !== W.seq) return false;   // nel frattempo è partito un calcolo più recente
  const scope = [codes.length ? `${fmtN(codes.length)} codici scelti` : "", W.groups.length ? "gruppi " + W.groups.join(", ") : "", W.abc.length ? "classe " + W.abc.join("/") : ""].filter(Boolean).join(" · ");
  r.title = `${SCENARI[mode].t} · ${mode === "cover" ? orizzLabel(RR.months) : fmtE(wBudget())}${mode === "free" && RR.maxCover ? ` (al massimo ${oltreTxt(RR.maxCover)})` : ""}${overTitle(mode, RR)}${scope ? " · " + scope : ""}`;
  const O = state.ordine;
  O.result = r; O.show = 100; O.history = [{ title: r.title, s: r.summary, r }].concat((O.history || []).filter(h => h.title !== r.title)).slice(0, 8);
  return true;
}
async function wStep5(body, main) {
  body.innerHTML = `<div class="panel"><p class="muted">Calcolo in corso…</p></div>`;
  await wCompute();
  body.innerHTML = `<div class="wnav top"><span class="num mono small muted">PASSO 5 DI 5 · RISULTATO</span><div class="row">
      <button class="btn sm" type="button" id="wgoal">Cambia obiettivo</button><button class="btn sm" type="button" id="wcodes">Cambia codici</button><button class="btn sm" type="button" id="wnew">Ricomincia</button></div></div>
    <div id="wres"></div><div id="whist"></div>`;
  const recalc = async alertOnly => { if (!alertOnly && !(await wCompute())) return; renderProposal("#wres", recalc); renderHistory("#whist", "#wres", recalc); };
  renderProposal("#wres", recalc); renderHistory("#whist", "#wres", recalc);
  $("#wgoal").onclick = () => wGo(main, 1); $("#wcodes").onclick = () => wGo(main, 4);
  $("#wnew").onclick = () => { Object.assign(W, { step: 1, snapId: null, codes: [], lookup: null, codesMode: "all", groups: [], abc: [], listName: "" }); state.ordine.history = []; wGo(main, 1); };
}
