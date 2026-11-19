"use strict";
/* PartsPlanner · pagina «Come funziona»: istruzioni per il responsabile di magazzino e per l'amministratore */

async function viewComeFunziona(main) {
  const S = [
    ["cf-breve", "In breve"], ["cf-inizio", "Prima di iniziare"], ["cf-ordine", "Nuovo ordine, passo per passo"],
    ["cf-risultato", "Leggere e confermare la proposta"], ["cf-pagine", "Le altre pagine"], ...(isAdmin() ? [["cf-admin", "Per l'amministratore"]] : []), ["cf-domande", "Domande frequenti"],
  ];
  const sec = (id, title, body) => `<section class="panel guida" id="${id}"><h2>${title}</h2>${body}</section>`;
  const passo = (n, t, body) => `<div class="gstep"><span class="gnum">${n}</span><div><h3>${t}</h3>${body}</div></div>`;
  main.innerHTML = `<div class="head"><div><h1>Come funziona</h1><p class="sub">Le istruzioni per usare PartsPlanner: dal caricamento delle liste movimentazione all'ordine confermato in Excel o PDF.</p></div></div>
  <nav class="gindex" aria-label="Indice">${S.map(([id, t]) => `<button type="button" class="chip" data-goto="${id}">${t}</button>`).join("")}</nav>
  ${sec("cf-breve", "In breve", `<p>PartsPlanner incrocia le <b>liste movimentazione</b> della concessionaria con le <b>giacenze</b> e propone quanti pezzi pianificare per ogni codice, rispettando SMin e SMax. Ogni quantità ha la sua spiegazione. Sei tu a decidere riga per riga che cosa confermare; alla fine scarichi l'ordine in Excel o in PDF. La piattaforma non invia ordini a nessuno.</p>`)}
  ${sec("cf-inizio", "Prima di iniziare", `<ul>
    <li><b>Accesso</b>: entri con nome utente e password personali. Al primo accesso la password provvisoria va cambiata; puoi cambiarla quando vuoi da <b>Password</b>, in alto a destra.</li>
    <li><b>Che cosa serve</b>: l'export mensile delle liste movimentazione. Le giacenze cambiate dopo la chiusura del mese si correggono a mano al passo 3.</li>
    <li><b>I file restano sul tuo computer</b>: gli Excel vengono letti nel browser; alla piattaforma arrivano solo le righe che servono al calcolo.</li>
    <li><b>Per provare senza dati veri</b>: la pagina <b>Dati di prova</b> crea liste movimentazione e giacenze inventate, con la stessa struttura dei file reali.</li>
    <li>Cliccando su <b>PartsPlanner</b>, in alto a sinistra, torni sempre alla pagina iniziale.</li></ul>`)}
  ${sec("cf-ordine", "Nuovo ordine, passo per passo", `<p>La pagina <b>Nuovo ordine</b> ti guida in cinque passi. La barra in alto mostra a che punto sei; i passi già fatti si riaprono cliccandoli.</p>
    ${passo(1, "Obiettivo", `<p>Scegli che cosa vuoi ottenere:</p><ul>
      <li><b>Pianifica per coprire un periodo</b>: quanto serve per 1, 2 o 3 mesi di vendite, senza scendere sotto la SMin né superare la SMax.</li>
      <li><b>Pianifica per un importo</b>: indichi una cifra; prima si riportano alla SMin i codici sotto scorta, poi il resto si divide in proporzione alle vendite regolari. Nessun codice supera la SMax.</li>
      <li><b>Pianifica per un importo libero</b>: come il precedente, ma si può andare oltre la SMax. Scegli come salire oltre la SMax fra quattro riquadri; l'etichetta in fondo a ognuno dice se l'importo viene speso tutto.</li></ul>
      <p>Con l'importo libero puoi anche fissare un <b>tetto per codice</b> oltre la SMax e la soglia dell'<b>avviso</b> di copertura. Il riquadro «Pianifica in base alle probabilità di vendita» ha un link che spiega come si calcola la probabilità.</p>`)}
    ${passo(2, "Liste movimentazione", `<p>Premi <b>Scegli i file Excel</b> e carica l'export. Se la lista è divisa in più file, aggiungili tutti: vengono uniti. La piattaforma riconosce da sola le colonne; se ne manca una obbligatoria te lo chiede.</p>
      <p>Se i dati dell'ultimo caricamento vanno ancora bene, premi <b>Usa questi dati e scegli i codici</b> e salti direttamente al passo 4.</p>`)}
    ${passo(3, "Giacenze", `<p>La piattaforma mostra la giacenza di ogni codice come la riportano le liste movimentazione, cioè a fine mese. Se da allora qualcosa è cambiato:</p><ul>
      <li>cerca il codice per codice, descrizione o locazione e scrivi la giacenza di oggi nella colonna <b>Giacenza attuale</b>; le righe corrette si colorano;</li>
      <li><b>Solo i codici corretti</b> mostra solo quelli che hai cambiato; <b>Annulla le correzioni</b> le toglie tutte.</li></ul>
      <p>Se non è cambiato niente premi <b>Conferma e salva</b>; con delle correzioni il pulsante diventa <b>Salva con N correzioni</b>. Solo la giacenza cambia: costi, SMin, SMax, consumi e ordini aperti restano quelli delle liste, e la giacenza delle liste resta salvata accanto a quella corretta. Il caricamento resta nello storico con data e ora.</p>
      <p class="small muted">Se le liste non riportano le giacenze, a questo passo la piattaforma chiede invece il file giacenze del gestionale.</p>`)}
    ${passo(4, "Codici", `<p>Scegli su quali codici lavorare: <b>Tutti i codici</b>, <b>Li scrivo io</b> (anche incollando un elenco) oppure <b>Li carico da un Excel</b>. In <b>Restringi ancora</b> puoi limitarti ad alcuni gruppi principali o alle classi ABC; in <b>Codici su richiesta</b> puoi escludere i codici che vendono troppo poco.</p>`)}
    ${passo(5, "Risultato", `<p>La piattaforma calcola la proposta. In alto trovi il valore dell'ordine, le righe, i codici a zero e sotto scorta coperti, come è composto l'importo e quali codici sono stati esclusi e perché. Sotto c'è la tabella da confermare, spiegata nella sezione successiva.</p>
      <p>Con <b>Cambia obiettivo</b> o <b>Cambia codici</b> provi un'altra ipotesi: le proposte calcolate si confrontano nel riquadro <b>Confronto scenari</b>. <b>Ricomincia</b> riparte da zero.</p>`)}`)}
  ${sec("cf-risultato", "Leggere e confermare la proposta", `<ul>
    <li><b>Regole di riordino</b>: con <b>Modifica</b> cambi la stagionalità (più o meno consumo rispetto alla media) e, nei piani per periodo, l'arrotondamento dei pezzi. La proposta si ricalcola subito.</li>
    <li><b>Ordinare la tabella</b>: clicca sull'intestazione di una colonna; di partenza le righe sono ordinate per valore netto, dal più alto al più basso.</li>
    <li><b>Perché</b>: sotto ogni quantità, il link <b>perché</b> spiega il conto con i numeri di quel codice.</li>
    <li><b>Quantità</b>: puoi cambiarla a mano; il valore e la copertura si aggiornano. <b>Torna alle quantità proposte</b> annulla le modifiche.</li>
    <li><b>Avviso</b>: segnala le righe la cui copertura dopo l'ordine supera la soglia scelta.</li>
    <li><b>Sì / No</b>: decidi riga per riga. I pulsanti <b>Sì a tutte senza avviso</b>, <b>No a tutte con avviso</b> e <b>Sì a tutte</b> decidono in blocco; la «i» accanto a ognuno spiega che cosa fa. I filtri sopra la tabella mostrano solo le righe con avviso, da decidere, accettate o rifiutate.</li>
    <li><b>Scaricare</b>: quando tutte le righe sono decise e almeno una è accettata si attivano <b>Ordine confermato in Excel</b> e <b>Ordine confermato in PDF</b>. <b>Proposta completa in Excel</b> scarica invece tutte le righe proposte, decise o no.</li></ul>`)}
  ${sec("cf-pagine", "Le altre pagine", `<ul>
    <li><b>Analisi codici</b>: tutti i codici dell'ultimo caricamento divisi per stato (sotto scorta, eccesso, fermo, non in giacenza, senza storico, in linea), con il confronto rispetto al caricamento precedente e l'export in Excel.</li>
    <li><b>Scheda codice</b>: scrivi un codice e vedi quanti pezzi programmare per 15, 30, 45, 60, 75 o 90 giorni, con consumo, regolarità e l'andamento caricamento dopo caricamento.</li>
    <li><b>Regole</b>: come la piattaforma classifica i codici e calcola le quantità nei tre obiettivi, con un esempio per ogni regola.</li>
    <li><b>Dati di prova</b>: crea file fittizi per provare la piattaforma senza dati veri.</li></ul>`)}
  ${isAdmin() ? sec("cf-admin", "Per l'amministratore", `<ul>
    <li><b>Rete</b>: l'ultimo caricamento di ogni concessionaria, con valore a magazzino, da riordinare, eccedenze e fermo, e la variazione rispetto al caricamento precedente. Il menu in alto sceglie la concessionaria su cui lavorare.</li>
    <li><b>Amministrazione</b>: crei concessionarie e utenti (ogni responsabile di magazzino vede solo la sua concessionaria), generi una nuova password provvisoria per un utente, cancelli caricamenti o i dati di una concessionaria.</li>
    <li><b>Perimetro della rete</b>: un elenco di codici valido per tutte le concessionarie; dai caricamenti successivi la piattaforma elabora solo quei codici.</li></ul>`) : ""}
  ${sec("cf-domande", "Domande frequenti", `<dl class="faq">
    <dt>Perché un codice con vendite non riceve pezzi?</dt><dd>Se SMin e SMax sono a zero il codice non è tenuto a scorta e resta escluso; il riepilogo del risultato elenca le esclusioni. Nei primi due obiettivi, inoltre, un codice già alla SMax non riceve altro.</dd>
    <dt>Perché resta una parte dell'importo non spesa?</dt><dd>Con «Pianifica per un importo» non si supera la SMax: quando tutti i codici ci arrivano, il resto avanza. Con l'importo libero può avanzare se hai scelto le probabilità di vendita o un tetto per codice.</dd>
    <dt>I miei dati escono dalla piattaforma?</dt><dd>No. Ogni concessionaria vede solo i propri dati, la piattaforma non è collegata ad altri sistemi e non invia ordini: l'ordine esce solo come file Excel o PDF che scarichi tu.</dd>
    <dt>Posso tornare a un passo già fatto?</dt><dd>Sì: clicca il passo nella barra in alto. I file caricati restano disponibili finché non premi «Ricomincia» o cambi concessionaria.</dd></dl>`)}`;
  $$(".gindex [data-goto]", main).forEach(b => b.onclick = () => { const t = document.getElementById(b.dataset.goto); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); });
}
