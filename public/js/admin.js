"use strict";
/* Parts Planning · pagina Amministrazione */

/* ============ Amministrazione ============ */
// Codici di un file per il perimetro: la colonna del codice si riconosce dal nome (come nelle liste), altrimenti è la prima colonna.
function perimCodes(wb) {
  for (const name of Object.keys(wb.sheets)) {
    const rows = wb.sheets[name] || []; if (!rows.length) continue;
    const a = analyseSheet(rows, [FIELDS_A[0]]), named = a.map.code != null && a.score > 0;
    const col = named ? a.map.code : 0, from = named ? a.headerRow + 1 : 0, hdr = named ? (rows[a.headerRow] || [])[col] : null;
    const codes = [], seen = new Set();
    for (let i = from; i < rows.length; i++) { const c = codeKey((rows[i] || [])[col]); if (!c || seen.has(c) || !/[0-9]/.test(c)) continue; seen.add(c); codes.push(c); }
    if (codes.length) return { sheet: name, col, hdr, codes };
  }
  return null;
}
async function renderPerim(host) {
  const P = await loadPerim(true);
  host.innerHTML = `<div class="bar"><div><h2>Perimetro della rete</h2><p class="small muted">Un elenco di codici valido per tutte le concessionarie: gli utenti possono caricare tutto il magazzino, ma la piattaforma elabora e salva solo questi codici. Vale dai caricamenti successivi; quelli già fatti restano come sono. Senza elenco si lavora su tutto il magazzino.</p></div></div>
    ${P.active ? `<div class="msg">Perimetro attivo: <b>${fmtN(P.n)} codici</b>${P.file ? ` da «${esc(P.file)}»` : ""}${P.set_at ? `, caricato il ${esc(new Date(P.set_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" }))}` : ""}${P.set_by ? ` da ${esc(P.set_by)}` : ""}.</div>` : `<div class="msg">Nessun perimetro: si lavora su tutto il magazzino.</div>`}
    <div class="row"><label class="btn" for="pfile">${P.active ? "Sostituisci con un altro Excel" : "Carica l'Excel dei codici"}</label><input type="file" id="pfile" accept=".xlsx,.xls,.xlsm,.csv">
      ${P.active ? `<button class="btn" type="button" id="pdl">Scarica l'elenco</button><button class="btn danger" type="button" id="prm">Togli il perimetro</button>` : ""}</div>
    <div id="pprev"></div>`;
  $("#pfile", host).onchange = async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    const box = $("#pprev", host);
    try {
      const wb = await readFile(f), got = perimCodes(wb);
      if (!got) { box.innerHTML = `<div class="msg err">Nel file non ho trovato codici.</div>`; return; }
      box.innerHTML = `<div class="msg"><b>${fmtN(got.codes.length)} codici</b> nel foglio «${esc(got.sheet)}», colonna ${colL(got.col)}${got.hdr ? ` «${esc(got.hdr)}»` : ""}. Primi codici: <span class="mono">${got.codes.slice(0, 8).map(esc).join(", ")}</span>${got.codes.length > 8 ? "…" : ""}</div>
        <div class="row"><button class="btn primary" type="button" id="psave">Usa questi ${fmtN(got.codes.length)} codici come perimetro</button><button class="link" type="button" id="pno">Annulla</button></div>`;
      $("#pno", host).onclick = () => { box.innerHTML = ""; };
      $("#psave", host).onclick = async () => {
        if (!await confirmBox("Usare questo perimetro?", `Da ora tutte le concessionarie avranno elaborati solo questi ${fmtN(got.codes.length)} codici. I caricamenti già fatti non cambiano.`, "Usa il perimetro")) return;
        try { await api("PUT", "/api/perimeter", { codes: got.codes, file: f.name }); toast(`Perimetro salvato: ${fmtN(got.codes.length)} codici.`); renderPerim(host); }
        catch (x) { if (!x.silent) toast(x.message); }
      };
    } catch (x) { box.innerHTML = `<div class="msg err">${esc(x.message)}</div>`; }
  };
  if ($("#pdl", host)) $("#pdl", host).onclick = () => {
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Codice particolare"]].concat([...P.set].sort().map(c => [c]))), "Perimetro");
    XLSX.writeFile(wb, "perimetro_rete.xlsx");
  };
  if ($("#prm", host)) $("#prm", host).onclick = async () => {
    if (!await confirmBox("Togliere il perimetro?", "Dai prossimi caricamenti si tornerà a lavorare su tutto il magazzino. I caricamenti già fatti non cambiano.", "Togli il perimetro", true)) return;
    try { await api("DELETE", "/api/perimeter"); toast("Perimetro tolto."); renderPerim(host); } catch (x) { if (!x.silent) toast(x.message); }
  };
}
async function viewAdmin(main) {
  main.innerHTML = `<div class="panel"><p class="muted">Caricamento…</p></div>`;
  const [dealers, users, uploads] = await Promise.all([api("GET", "/api/dealers"), api("GET", "/api/users"), api("GET", "/api/uploads")]);
  state.dealers = dealers.map(d => ({ id: d.id, name: d.name, code: d.code }));
  main.innerHTML = `<div class="head"><div><h1>Amministrazione</h1><p class="sub">Concessionarie, utenti e dati caricati. Ogni responsabile di magazzino vede e carica solo i dati della sua concessionaria.</p></div></div>
  <section class="grid2">
    <form class="panel" id="df"><h2>Nuova concessionaria</h2><div class="row">
      <label class="field" for="dn">Ragione sociale<input type="text" id="dn" required></label>
      <label class="field" for="dc">Codice (facoltativo)<input type="text" id="dc" maxlength="20"></label>
      <button class="btn primary" type="submit">Aggiungi</button></div></form>
    <form class="panel" id="uf"><h2>Nuovo utente</h2><div class="row">
      <label class="field" for="uu">Nome utente<input type="text" id="uu" autocapitalize="none" placeholder="es. mario.rossi" required></label>
      <label class="field" for="un">Nome e cognome<input type="text" id="un"></label>
      <label class="field" for="ur">Ruolo<select id="ur"><option value="dealer">Responsabile magazzino</option><option value="admin">Amministratore</option></select></label>
      <label class="field" for="ud">Concessionaria<select id="ud">${dealers.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select></label>
      <button class="btn primary" type="submit">Crea utente</button></div></form>
  </section>
  <section class="panel" id="perim"></section>
  <section class="panel"><h2>Concessionarie</h2>${dealers.length ? `<div class="tablebox"><table><thead><tr><th>Concessionaria</th><th>Codice</th><th class="num">Caricamenti</th><th class="num">Utenti attivi</th><th></th></tr></thead><tbody>
    ${dealers.map(d => `<tr><td><b>${esc(d.name)}</b></td><td class="mono">${esc(d.code || "–")}</td><td class="num">${fmtN(d.n_weeks)}</td><td class="num">${fmtN(d.n_users)}</td><td><div class="row"><button class="btn sm" type="button" data-ed="${d.id}">Rinomina</button><button class="btn sm danger" type="button" data-wipe="${d.id}"${d.n_weeks ? "" : " disabled"}>Svuota dati</button><button class="btn sm danger" type="button" data-deld="${d.id}">Elimina</button></div></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Nessuna concessionaria.</p>`}</section>
  <section class="panel"><div class="bar"><div><h2>Caricamenti</h2><p class="small muted">Ogni riga è un caricamento di liste movimentazione e giacenze. I file Excel originali non vengono conservati: eliminando un caricamento si cancellano tutti i dati ricavati da quei file.</p></div>
      <div class="row"><select id="upd" aria-label="Filtra per concessionaria"><option value="">Tutte le concessionarie</option>${dealers.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select><button class="btn danger" type="button" id="updel" disabled>Elimina selezionate</button></div></div>
    <div id="uplist"></div></section>
  <section class="panel"><h2>Utenti</h2><div class="tablebox"><table><thead><tr><th>Utente</th><th>Nome</th><th>Ruolo</th><th>Concessionaria</th><th>Ultimo accesso</th><th>Stato</th><th></th></tr></thead><tbody>
    ${users.map(u => `<tr><td class="mono">${esc(u.username)}</td><td>${esc(u.full_name || "")}</td><td>${u.role === "admin" ? "Amministratore" : "Responsabile magazzino"}</td><td>${esc(u.dealer_name || "–")}</td>
      <td class="small">${u.last_login ? esc(new Date(u.last_login).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })) : "mai"}</td>
      <td>${u.active ? `<span class="pill ok">Attivo</span>` : `<span class="pill off">Disattivato</span>`}</td>
      <td><div class="row"><button class="btn sm" type="button" data-reset="${u.id}">Nuova password</button>${u.id !== state.me.user.id ? `<button class="btn sm" type="button" data-act="${u.id}" data-v="${u.active ? 0 : 1}">${u.active ? "Disattiva" : "Riattiva"}</button><button class="btn sm danger" type="button" data-delu="${u.id}" data-name="${esc(u.username)}">Elimina</button>` : ""}</div></td></tr>`).join("")}
  </tbody></table></div></section>`;
  renderPerim($("#perim"));
  const ur = $("#ur"), ud = $("#ud"); ur.onchange = () => { ud.disabled = ur.value === "admin"; };
  $("#df").onsubmit = async e => { e.preventDefault(); try { await api("POST", "/api/dealers", { name: $("#dn").value, code: $("#dc").value }); toast("Concessionaria aggiunta."); state.me = await api("GET", "/api/me"); state.dealers = state.me.dealers; route(); } catch (x) { if (!x.silent) toast(x.message); } };
  $("#uf").onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await api("POST", "/api/users", { username: $("#uu").value, full_name: $("#un").value, role: ur.value, dealer_id: +ud.value });
      infoBox("Utente creato", `<p>Comunica queste credenziali al responsabile. Al primo accesso dovrà scegliere una password sua. La password provvisoria non verrà più mostrata.</p><p class="small muted">Nome utente</p><div class="secret">${esc(r.username)}</div><p class="small muted">Password provvisoria</p><div class="secret">${esc(r.password)}</div><p class="small muted">Indirizzo: ${esc(location.origin)}</p>`);
      viewAdmin(main);
    } catch (x) { if (!x.silent) toast(x.message); }
  };
  $$("[data-reset]", main).forEach(b => b.onclick = async () => {
    if (!await confirmBox("Generare una nuova password?", "La password attuale smetterà di funzionare e l'utente verrà disconnesso.", "Genera")) return;
    try { const r = await api("POST", `/api/users/${b.dataset.reset}/reset`); infoBox("Nuova password provvisoria", `<p class="small muted">Utente</p><div class="secret">${esc(r.username)}</div><p class="small muted">Password provvisoria</p><div class="secret">${esc(r.password)}</div>`); } catch (x) { if (!x.silent) toast(x.message); }
  });
  $$("[data-act]", main).forEach(b => b.onclick = async () => { try { await api("POST", `/api/users/${b.dataset.act}/active`, { active: b.dataset.v === "1" }); viewAdmin(main); } catch (x) { if (!x.silent) toast(x.message); } });
  const sel = new Set();
  const renderUploads = () => {
    const f = +$("#upd").value || 0, list = uploads.filter(u => !f || u.dealer_id === f), host = $("#uplist");
    host.innerHTML = list.length ? `<div class="tablebox flagbox"><table><thead><tr><th><input type="checkbox" id="upall" aria-label="Seleziona tutte"></th><th>Concessionaria</th><th>Dati del</th><th>File caricati</th><th>Caricati da</th><th class="num">Codici</th></tr></thead><tbody>
      ${list.map(u => `<tr><td><input type="checkbox" data-up="${u.id}"${sel.has(u.id) ? " checked" : ""} aria-label="Seleziona"></td><td>${esc(u.dealer_name)}</td><td>${esc(snapLabel(u.week_date, u.uploaded_at))}</td>
        <td class="small">${esc(u.file_a || "–")}<br><span class="muted">${esc(u.file_b || stockShort(u))}</span></td><td class="small">${esc(u.uploaded_by_name || u.uploaded_by_user || "utente eliminato")}<br><span class="muted">${esc(new Date(u.uploaded_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }))}</span></td><td class="num">${fmtN(u.n_codes)}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">Nessun caricamento.</p>`;
    const upd = () => { $("#updel").disabled = !sel.size; $("#updel").textContent = sel.size ? `Elimina selezionate (${fmtN(sel.size)})` : "Elimina selezionate"; };
    $$("[data-up]", host).forEach(c => c.onchange = () => { const id = +c.dataset.up; if (c.checked) sel.add(id); else sel.delete(id); upd(); });
    if ($("#upall")) $("#upall").onchange = e => { list.forEach(u => e.target.checked ? sel.add(u.id) : sel.delete(u.id)); renderUploads(); };
    upd();
  };
  $("#upd").onchange = () => { sel.clear(); renderUploads(); };
  renderUploads();
  $("#updel").onclick = async () => {
    const n = sel.size; if (!n) return;
    if (!await confirmTyped("Eliminare i caricamenti selezionati?", `Verranno cancellati <b>${fmtN(n)}</b> caricamenti con tutti i codici, lo storico e i calcoli ricavati da quei file. L'operazione non si può annullare.`, "ELIMINA")) return;
    try { const r = await api("POST", "/api/snapshots/delete", { ids: [...sel] }); toast(`${fmtN(r.n)} caricamenti eliminati.`); state.snapshots = []; viewAdmin(main); } catch (x) { if (!x.silent) toast(x.message); }
  };
  $$("[data-wipe]", main).forEach(b => b.onclick = async () => {
    const d = dealers.find(x => x.id === +b.dataset.wipe);
    const ok = await confirmTyped(`Svuotare i dati di ${d.name}?`, `Verranno cancellati tutti i <b>${fmtN(d.n_weeks)}</b> caricamenti e il relativo storico. Concessionaria e utenti restano. <label class="check" for="wflags"><input type="checkbox" id="wflags"> Cancella anche l'elenco dei codici su richiesta</label>`, d.name, () => $("#wflags") && $("#wflags").checked);
    if (!ok) return;
    try { const r = await api("DELETE", `/api/dealers/${d.id}/data${ok.extra ? "?flags=1" : ""}`); toast(`Cancellati ${fmtN(r.weeks)} caricamenti${r.flags ? ` e ${fmtN(r.flags)} codici su richiesta` : ""}.`); state.snapshots = []; viewAdmin(main); } catch (x) { if (!x.silent) toast(x.message); }
  });
  $$("[data-deld]", main).forEach(b => b.onclick = async () => {
    const d = dealers.find(x => x.id === +b.dataset.deld);
    if (!await confirmTyped(`Eliminare ${d.name}?`, `Verranno cancellati la concessionaria, i suoi <b>${fmtN(d.n_weeks)}</b> caricamenti con tutto lo storico, l'elenco dei codici su richiesta e i suoi <b>${fmtN(d.n_users)}</b> utenti responsabili. L'operazione non si può annullare.`, d.name)) return;
    try { const r = await api("DELETE", `/api/dealers/${d.id}`); toast(`Concessionaria eliminata${r.users ? ` con ${fmtN(r.users)} utenti` : ""}.`); if (state.dealerId === d.id) { state.dealerId = null; try { localStorage.removeItem("ig_dealer"); } catch (e) {} } state.snapshots = []; state.me = await api("GET", "/api/me"); state.dealers = state.me.dealers; route(); } catch (x) { if (!x.silent) toast(x.message); }
  });
  $$("[data-delu]", main).forEach(b => b.onclick = async () => {
    if (!await confirmBox("Eliminare l'utente?", `L'utente <b>${esc(b.dataset.name)}</b> verrà cancellato definitivamente e non potrà più accedere. I dati che ha caricato restano. Se vuoi solo bloccarlo temporaneamente, usa «Disattiva».`, "Elimina", true)) return;
    try { await api("DELETE", `/api/users/${b.dataset.delu}`); toast("Utente eliminato."); viewAdmin(main); } catch (x) { if (!x.silent) toast(x.message); }
  });
  $$("[data-ed]", main).forEach(b => b.onclick = () => {
    const d = dealers.find(x => x.id === +b.dataset.ed);
    const m = document.createElement("div"); m.className = "modal";
    m.innerHTML = `<form class="panel"><h3>Rinomina concessionaria</h3><label class="field" for="en">Ragione sociale<input type="text" id="en" value="${esc(d.name)}"></label><label class="field" for="ec">Codice<input type="text" id="ec" value="${esc(d.code || "")}"></label><div class="actions"><button class="btn" type="button" id="ex">Annulla</button><button class="btn primary" type="submit">Salva</button></div></form>`;
    document.body.appendChild(m); $("#en", m).focus(); $("#ex", m).onclick = () => m.remove();
    $("form", m).onsubmit = async e => { e.preventDefault(); try { await api("PATCH", `/api/dealers/${d.id}`, { name: $("#en", m).value, code: $("#ec", m).value }); m.remove(); state.me = await api("GET", "/api/me"); state.dealers = state.me.dealers; route(); } catch (x) { if (!x.silent) toast(x.message); } };
  });
}
