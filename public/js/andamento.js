"use strict";
/* PartsPlanner · pagine Rete e Analisi codici */

/* ============ Rete (amministratore) ============ */
function trend(cur, prev, upIsBad = true) {
  if (prev == null || cur == null) return `<span class="trend flat">–</span>`;
  const d = cur - prev;
  if (Math.abs(d) < 0.5) return `<span class="trend flat">= stabile</span>`;
  const cls = d > 0 ? (upIsBad ? "up-bad" : "up-good") : (upIsBad ? "down-good" : "down-bad");
  return `<span class="trend ${cls}">${d > 0 ? "▲ +" : "▼ −"}${fmtEk(Math.abs(d))}</span>`;
}
async function viewRete(main) {
  main.innerHTML = `<div class="head"><div><h1>La tua rete</h1><p class="sub">Ultimo caricamento di ogni concessionaria, con la variazione rispetto al precedente.</p></div></div><div class="panel"><p class="muted">Caricamento…</p></div>`;
  const rows = await api("GET", "/api/overview");
  const loaded = rows.filter(r => r.snap_id);
  const tot = k => loaded.reduce((t, r) => t + (r[k] || 0), 0);
  main.innerHTML = `<div class="head"><div><h1>La tua rete</h1><p class="sub">Ultimo caricamento di ogni concessionaria, con la variazione rispetto al precedente.</p></div></div>
  <section class="tiles">
    <div class="tile neutral"><span class="k">Concessionarie con dati</span><span class="v">${fmtN(loaded.length)}<span class="small muted"> / ${fmtN(rows.length)}</span></span><span class="s">Valore a magazzino ${fmtE(tot("val_tot"))}</span></div>
    <div class="tile bad"><span class="k">Da riordinare</span><span class="v">${fmtEk(tot("val_sotto"))}</span><span class="s">${fmtN(tot("n_sotto"))} codici sotto scorta</span></div>
    <div class="tile warn"><span class="k">Eccedenze</span><span class="v">${fmtEk(tot("val_eccesso"))}</span><span class="s">${fmtN(tot("n_eccesso"))} codici sopra SMax</span></div>
    <div class="tile idle"><span class="k">Fermo senza fabbisogno</span><span class="v">${fmtEk(tot("val_fermo"))}</span><span class="s">${fmtN(tot("n_fermo"))} codici</span></div>
  </section>
  <section class="panel"><h2>Concessionarie</h2>
  ${rows.length ? `<div class="tablebox"><table><thead><tr><th>Concessionaria</th><th>Ultimo caricamento</th><th class="num">Caricamenti</th><th class="num">Valore magazzino</th><th class="num">Da riordinare</th><th class="num">Eccedenze</th><th></th><th class="num">Fermo</th><th></th></tr></thead><tbody>
  ${rows.map(r => `<tr class="click" data-d="${r.id}"><td><b>${esc(r.name)}</b>${r.code ? ` <span class="muted mono small">${esc(r.code)}</span>` : ""}</td>
    <td>${r.week_date ? esc(snapLabel(r.week_date, r.uploaded_at)) : `<span class="pill off">Nessun caricamento</span>`}</td><td class="num">${fmtN(r.n_weeks)}</td>
    <td class="num">${r.snap_id ? fmtE(r.val_tot) : "–"}</td><td class="num">${r.snap_id ? fmtE(r.val_sotto) : "–"}</td>
    <td class="num">${r.snap_id ? fmtE(r.val_eccesso) : "–"}</td><td>${r.snap_id ? trend(r.val_eccesso, r.p_val_eccesso) : ""}</td>
    <td class="num">${r.snap_id ? fmtE(r.val_fermo) : "–"}</td><td>${r.snap_id ? trend(r.val_fermo, r.p_val_fermo) : ""}</td></tr>`).join("")}
  </tbody></table></div><p class="small muted">Tocca una riga per aprire l'analisi dei codici della concessionaria.</p>` : `<p class="muted">Nessuna concessionaria. Aggiungile da <a href="#admin">Amministrazione</a>.</p>`}</section>`;
  $$("tr[data-d]", main).forEach(tr => tr.onclick = () => { state.dealerId = +tr.dataset.d; try { localStorage.setItem("ig_dealer", state.dealerId); } catch (x) {} go("analisi"); });
}

/* ============ Grafico a linea (piccoli multipli) ============ */
function lineChart(host, pts, opt) {
  const W = 520, H = 170, L = 52, R = 14, T = 12, B = 26;
  const ys = pts.map(p => p.y);
  let max = Math.max(...ys, 0), min = Math.min(...ys, 0);
  if (max === min) max = min + 1;
  const step = niceStep((max - min) / 4); max = Math.ceil(max / step) * step; min = Math.floor(min / step) * step;
  const X = i => pts.length === 1 ? L + (W - L - R) / 2 : L + i * (W - L - R) / (pts.length - 1);
  const Y = v => T + (H - T - B) * (1 - (v - min) / (max - min));
  const ticks = []; for (let v = min; v <= max + step / 2; v += step) ticks.push(v);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join("");
  const area = `${line}L${X(pts.length - 1).toFixed(1)},${Y(Math.max(min, 0))}L${X(0).toFixed(1)},${Y(Math.max(min, 0))}Z`;
  const every = Math.max(1, Math.ceil(pts.length / 7));
  const last = pts[pts.length - 1];
  const surf = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#fff";
  host.innerHTML = `<div class="ct"><h3>${esc(opt.title)}</h3><span class="last">${opt.fmt(last.y)}</span></div>
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.title)}, ${pts.length} caricamenti">
    ${ticks.map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${opt.axis(v)}</text>`).join("")}
    ${pts.map((p, i) => (i % every === 0 || i === pts.length - 1) ? `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${esc(p.label)}</text>` : "").join("")}
    <path d="${area}" fill="${opt.color}" fill-opacity="0.12"/>
    <path d="${line}" fill="none" stroke="${opt.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(pts.length - 1)}" cy="${Y(last.y)}" r="4.5" fill="${opt.color}" stroke="${surf}" stroke-width="2"/>
    <line class="hair hl" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
    <circle class="hd" r="4.5" fill="${opt.color}" stroke="${surf}" stroke-width="2" visibility="hidden"/>
    <rect x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent" class="hit"/>
  </svg><div class="tip" hidden></div>`;
  const svg = $("svg", host), tip = $(".tip", host), hl = $(".hl", host), hd = $(".hd", host), hit = $(".hit", host);
  const show = ev => {
    const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) * W / r.width;
    let i = pts.length === 1 ? 0 : Math.round((x - L) / ((W - L - R) / (pts.length - 1)));
    i = Math.max(0, Math.min(pts.length - 1, i));
    hl.setAttribute("x1", X(i)); hl.setAttribute("x2", X(i)); hl.setAttribute("visibility", "visible");
    hd.setAttribute("cx", X(i)); hd.setAttribute("cy", Y(pts[i].y)); hd.setAttribute("visibility", "visible");
    tip.hidden = false; tip.textContent = `${pts[i].full}: ${opt.fmt(pts[i].y)}`;
    const hr = host.getBoundingClientRect();
    tip.style.left = (r.left - hr.left + X(i) * r.width / W) + "px"; tip.style.top = (r.top - hr.top + Y(pts[i].y) * r.height / H) + "px";
  };
  const hide = () => { tip.hidden = true; hl.setAttribute("visibility", "hidden"); hd.setAttribute("visibility", "hidden"); };
  hit.addEventListener("pointermove", show); hit.addEventListener("pointerdown", show); hit.addEventListener("pointerleave", hide);
}
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
const axisE = v => Math.abs(v) >= 1e6 ? fmtN(v / 1e6, 1) + "M" : Math.abs(v) >= 1e3 ? fmtN(v / 1e3, 0) + "k" : fmtN(v);

/* ============ Analisi codici ============ */
// giacenze usate e perimetro della rete del caricamento scelto
function snapNote(snaps, id) {
  const S = snaps.find(s => s.id === id) || {};
  return esc(stockNote(S)) + (S.perim_n ? ` · perimetro della rete: ${fmtN(S.perim_n)} codici` : "");
}
const FILTRI = [
  ["tutti", "Tutti"], ["sotto", "Sotto scorta"], ["eccesso", "Eccesso"], ["fermo", "Fermo"],
  ["nogiac", "Non in giacenza"], ["nostorico", "Senza storico"], ["ok", "In linea"]
];
const FILTRI2 = [["nuovi", "Nuovi problemi rispetto al caricamento precedente"], ["cronici", "Eccesso o fermo da 4+ caricamenti"]];
const FILTRI3 = [["ondemand", "Su richiesta"]];
const ACOLS = [
  ["status", "Stato"], ["code", "Codice"], ["descr", "Descrizione"], ["loc", "Locaz."], ["giac", "Giacenza", 1], ["var", "Var. giacenza", 1],
  ["ord", "Ord. aperti", 1], ["smin", "SMin", 1], ["smax", "SMax", 1], ["delta", "Da ordinare / Eccedenza", 1],
  ["streak", "Caricamenti nello stato", 1], ["cost", "Costo unit.", 1], ["val_giac", "Valore giacenza", 1], ["val_action", "Valore azione", 1]
];
async function viewAnalisi(main) {
  if (needDealer(main)) return;
  main.innerHTML = `<div class="panel"><p class="muted">Caricamento…</p></div>`;
  const snaps = state.snapshots.length ? state.snapshots : await loadSnapshots();
  if (!snaps.length) { main.innerHTML = `<div class="panel"><h2>Nessun caricamento</h2><p class="muted">Carica liste movimentazione e giacenze per iniziare.</p><div><a class="btn primary" href="#carica">Carica dati</a></div></div>`; return; }
  const A = state.analisi;
  if (!snaps.some(s => s.id === A.snapId)) { A.snapId = snaps[snaps.length - 1].id; A.offset = 0; }
  main.innerHTML = `<div class="head"><div><h1>Analisi codici</h1><p class="sub">${esc(dealerName(state.dealerId))}<br><span id="asnap">${snapNote(snaps, A.snapId)}</span></p></div>
    <label class="field" for="wsel">Dati del<select id="wsel">${snaps.slice().reverse().map(s => `<option value="${s.id}"${s.id === A.snapId ? " selected" : ""}>${esc(snapLabel(s.week_date, s.uploaded_at))}</option>`).join("")}</select></label></div>
  <section class="panel">
    <div class="bar"><div class="chips" id="chips" role="group" aria-label="Filtra per stato"></div>
      <div class="row"><input type="search" id="q" placeholder="Cerca codice o descrizione" aria-label="Cerca codice o descrizione" value="${esc(A.q)}"><button class="btn" type="button" id="xls">Scarica Excel</button></div></div>
    <div class="chips" id="chips2" role="group" aria-label="Filtri sull'evoluzione"></div>
    <p class="small muted" id="astock"></p>
    <div class="tablebox"><table id="tbl"><thead></thead><tbody><tr><td class="empty">Caricamento…</td></tr></tbody></table></div>
    <div class="pager" id="pager"></div>
  </section>
  <section class="panel rules"><h3>Come viene classificato ogni codice</h3><ul>
    <li><b>Disponibile</b> = giacenza + ordini aperti. <b>Sotto scorta</b>: disponibile sotto SMin; quantità suggerita = SMax − disponibile.</li>
    <li><b>Eccesso</b>: giacenza sopra SMax; eccedenza = giacenza − SMax, valorizzata al costo. <b>Fermo</b>: giacenza con SMin e SMax a zero.</li>
    <li><b>Caricamenti nello stato</b>: in quanti caricamenti consecutivi il codice è rimasto nello stesso stato. <b>Var. giacenza</b>: variazione della giacenza rispetto al caricamento precedente.</li>
    <li><b>Non in giacenza</b>: codice dello storico assente nel file giacenze. <b>Senza storico</b>: codice a magazzino che non compare nello storico.</li>
    <li><b>Giacenza</b>: quella del file giacenze, se è stato caricato; altrimenti quella riportata dalle liste movimentazione (fine del mese precedente). Sopra la tabella è scritto quale vale per questi dati.</li></ul></section>`;
  $("#wsel").onchange = e => { A.snapId = +e.target.value; A.offset = 0; $("#asnap").innerHTML = snapNote(snaps, A.snapId); loadItems(); };
  let qt; $("#q").oninput = e => { clearTimeout(qt); qt = setTimeout(() => { A.q = e.target.value; A.offset = 0; loadItems(); }, 300); };
  $("#xls").onclick = exportXls;
  await loadItems();
}
async function loadItems() {
  const A = state.analisi;
  const p = new URLSearchParams({ f: A.f, q: A.q, offset: A.offset, limit: A.limit });
  if (A.sort) { p.set("sort", A.sort); p.set("dir", A.dir); }
  const data = await api("GET", `/api/snapshots/${A.snapId}/items?${p}`);
  if (!$("#tbl")) return;
  const c = data.counts, snap = state.snapshots.find(s => s.id === A.snapId);
  $("#astock").textContent = snap ? stockNote(snap) + "." : "";
  $("#chips").innerHTML = FILTRI.map(([k, l]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${A.f === k}">${l}<span class="n">${fmtN(c[k])}</span></button>`).join("");
  const od = FILTRI3.map(([k, l]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${A.f === k}">${l}<span class="n">${fmtN(c[k])}</span></button>`).join("");
  $("#chips2").innerHTML = od + (data.prev_week ? FILTRI2.map(([k, l]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${A.f === k}">${l}<span class="n">${fmtN(c[k])}</span></button>`).join("") + `<span class="small muted">Confronto con il caricamento del ${esc(snapLabel(data.prev_week, data.prev_at))}</span>` : `<span class="small muted">Primo caricamento in archivio: i confronti compariranno dal prossimo.</span>`);
  $$("#chips .chip, #chips2 .chip").forEach(b => b.onclick = () => { A.f = b.dataset.f; A.offset = 0; loadItems(); });
  const t = $("#tbl");
  t.tHead.innerHTML = "<tr>" + ACOLS.map(([k, l, n]) => `<th class="${n ? "num" : ""}" scope="col"><button type="button" data-k="${k}"${A.sort === k ? ` data-dir="${A.dir}"` : ""}>${l}</button></th>`).join("") + "</tr>";
  $$("th button", t).forEach(b => b.onclick = () => { const k = b.dataset.k; if (A.sort === k) A.dir = A.dir === "asc" ? "desc" : "asc"; else { A.sort = k; A.dir = ["code", "descr", "loc", "status"].includes(k) ? "asc" : "desc"; } A.offset = 0; loadItems(); });
  if (!data.rows.length) { t.tBodies[0].innerHTML = `<tr><td colspan="${ACOLS.length}" class="empty">Nessun codice in questa vista.</td></tr>`; $("#pager").innerHTML = ""; return; }
  t.tBodies[0].innerHTML = data.rows.map(r => {
    const d = r.delta > 0 ? `<span class="delta pos">+${fmtN(r.delta)}</span>` : r.delta < 0 ? `<span class="delta neg">${fmtN(r.delta)}</span>` : "–";
    const v = r.prev_giac == null ? `<span class="muted">nuovo</span>` : r.giac - r.prev_giac === 0 ? "=" : (r.giac > r.prev_giac ? "+" : "") + fmtN(r.giac - r.prev_giac);
    const st = `<span class="pill ${r.status}">${STATI[r.status]}</span>${!r.in_b ? ` <span class="pill nogiac" title="Assente nel file giacenze">n.g.</span>` : ""}${r.ondemand ? ` <span class="pill off" title="Escluso dagli scenari d'ordine">su richiesta</span>` : ""}`;
    return `<tr><td>${st}</td><td class="code"><button type="button" data-c="${esc(r.code)}">${esc(r.code)}</button></td><td class="desc">${esc(r.descr)}</td><td class="code">${esc(r.loc)}</td>
      <td class="num"${r.giac_lista != null && r.giac_lista !== r.giac ? ` title="Nelle liste: ${fmtN(r.giac_lista)}"` : ""}>${fmtN(r.giac)}</td><td class="num">${data.prev_week ? v : "–"}</td><td class="num">${fmtN(r.ord)}</td><td class="num">${fmtN(r.smin)}</td><td class="num">${fmtN(r.smax)}</td>
      <td class="num">${d}</td><td class="num">${r.status === "ok" ? "–" : fmtN(r.streak)}</td><td class="num">${r.cost ? fmtE2(r.cost) : "–"}</td><td class="num">${r.val_giac ? fmtE2(r.val_giac) : "–"}</td><td class="num">${r.val_action ? fmtE2(r.val_action) : "–"}</td></tr>`;
  }).join("");
  $$("[data-c]", t).forEach(b => b.onclick = () => { state.codice = b.dataset.c; go("codice"); });
  const from = A.offset + 1, to = A.offset + data.rows.length;
  $("#pager").innerHTML = `<span>Righe ${fmtN(from)}–${fmtN(to)} di ${fmtN(data.total)}</span><div class="row">
    <button class="btn sm" type="button" id="pprev"${A.offset ? "" : " disabled"}>Precedenti</button><button class="btn sm" type="button" id="pnext"${to < data.total ? "" : " disabled"}>Successive</button></div>`;
  $("#pprev").onclick = () => { A.offset = Math.max(0, A.offset - A.limit); loadItems(); };
  $("#pnext").onclick = () => { A.offset += A.limit; loadItems(); };
}
async function exportXls() {
  const A = state.analisi, b = $("#xls"); b.disabled = true; b.textContent = "Preparo il file…";
  try {
    const p = new URLSearchParams({ f: A.f, q: A.q, all: "1" }); if (A.sort) { p.set("sort", A.sort); p.set("dir", A.dir); }
    const data = await api("GET", `/api/snapshots/${A.snapId}/items?${p}`);
    const snap = state.snapshots.find(s => s.id === A.snapId);
    const rows = data.rows.map(r => ({
      "Stato": STATI[r.status], "Codice": r.code, "Descrizione": r.descr, "Locazione": r.loc, "DG": r.dg, "Giacenza": r.giac, "Giacenza riportata nelle liste": r.giac_lista == null ? "" : r.giac_lista,
      "Giacenza caricamento precedente": r.prev_giac, "Ordini aperti": r.ord, "SMin": r.smin, "SMax": r.smax, "Da ordinare (+) / Eccedenza (-)": r.delta,
      "Caricamenti nello stato": r.streak, "Costo unitario": r.cost, "Valore giacenza": Math.round(r.val_giac * 100) / 100, "Valore azione": Math.round(r.val_action * 100) / 100,
      "Presente in giacenza": r.in_b ? "Sì" : "No"
    }));
    if (!rows.length) { toast("Nessuna riga da esportare."); return; }
    const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(k => ({ wch: Math.max(10, k.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, "Incrocio");
    const dn = dealerName(state.dealerId).replace(/[^\w\-]+/g, "_");
    XLSX.writeFile(wb, `analisi_${dn}_${snap ? snap.week_date : ""}_${A.f}.xlsx`);
  } catch (e) { if (!e.silent) toast(e.message); }
  finally { b.disabled = false; b.textContent = "Scarica Excel"; }
}

/* ============ Selettore del caricamento condiviso ============ */
function weekSelect(id, snaps, cur) {
  return `<label class="field" for="${id}">Dati del<select id="${id}">${snaps.slice().reverse().map(s => `<option value="${s.id}"${s.id === cur ? " selected" : ""}>${esc(snapLabel(s.week_date, s.uploaded_at))}</option>`).join("")}</select></label>`;
}
function noWeeks(main) { main.innerHTML = `<div class="panel"><h2>Nessun caricamento</h2><p class="muted">Carica liste movimentazione e giacenze per iniziare.</p><div><a class="btn primary" href="#carica">Carica dati</a></div></div>`; }
