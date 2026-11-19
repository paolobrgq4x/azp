# PartsPlanner

Piattaforma web per pianificare il riordino dei ricambi di una concessionaria. Parte dalle **liste movimentazione** mensili (con le giacenze a fine mese, correggibili a mano), classifica ogni codice (sotto scorta, eccesso, fermo, in linea), propone un ordine spiegando ogni quantità e conserva i caricamenti precedenti per seguirne l'evoluzione.

Prototipo dimostrativo: i dati presenti sono interamente fittizi, prodotti dal generatore «Dati di prova».

## Come funziona

- Il responsabile di magazzino entra con utente e password, sceglie l'obiettivo, carica le liste movimentazione, conferma o corregge le giacenze, sceglie i codici e ottiene la proposta da confermare riga per riga ed esportare in Excel o PDF. Non sceglie una data: la piattaforma registra giorno e ora del caricamento e lavora sull'ultimo.
- La piattaforma non invia ordini e non è collegata ad altri sistemi.
- I file vengono letti **nel browser**: al server arriva solo l'elenco dei codici con le colonne necessarie. L'incrocio viene calcolato sul server e salvato nel database.
- Ogni concessionaria vede solo i propri dati. L'amministratore vede la rete intera, crea concessionarie e utenti.
- La pagina non carica risorse esterne (Content Security Policy `default-src 'self'`).

## Regole di classificazione

| Stato | Regola |
|---|---|
| Sotto scorta | giacenza + ordini aperti < SMin. Da ordinare = SMax − disponibile |
| Eccesso | giacenza > SMax. Eccedenza = giacenza − SMax, al costo netto |
| Fermo | giacenza > 0 con SMin = SMax = 0 |
| Non in giacenza | codice delle liste senza giacenza |

"Caricamenti nello stato" conta i caricamenti consecutivi in cui il codice è rimasto nello stesso stato.

## Scenari d'ordine

Sono tre. Il **disponibile** è la giacenza più gli ordini aperti. La **vendita regolare** di un codice è il consumo medio mensile × l'indice di regolarità delle vendite ÷ 12: sono i pezzi al mese su cui si può contare. I codici non tenuti a scorta (SMin = SMax = 0), i fermi e quelli senza storico sono sempre esclusi.

| Scenario | Come lavora |
|---|---|
| Pianifica per coprire un periodo (1, 2 o 3 mesi) | Obiettivo = consumo medio mensile × mesi, mai sotto la SMin e mai sopra la SMax. Ordine = obiettivo − disponibile. Non c'è un importo: la spesa è il risultato |
| Pianifica per un importo | 1. I codici sotto la SMin tornano alla SMin (se l'importo non basta: prima la regolarità più alta, poi il consumo più alto). 2. Il resto compra a tutti lo stesso numero di mesi di vendita regolare. 3. Nessun codice supera la SMax; se tutti ci arrivano, il resto non viene speso |
| Pianifica per un importo libero | Come sopra, ma quello che resterebbe non speso sale oltre la SMax, con uno dei quattro modi descritti sotto. La SMax viene superata solo dopo che tutti i codici ci sono arrivati. Tetto per codice facoltativo |

I pezzi sono interi: si assegnano uno alla volta al codice più vicino al suo pezzo successivo. Ogni utente ha le proprie regole di riordino: sopra la proposta solo la stagionalità (correzione del consumo medio, da −50% a +50%) e, nello scenario a periodo, l'arrotondamento; periodo, importo, modo oltre la SMax e consumo minimo si scelgono nei passi di «Nuovo ordine», l'avviso di copertura sopra la tabella di conferma. Peso della regolarità, copertura massima, valore minimo di riga ed esclusione dei codici su richiesta restano ai valori iniziali; di ogni quantità si può aprire il conto passo per passo.

### Oltre la SMax: quattro modi

Nell'importo libero chi ordina sceglie come salire oltre la SMax (regola `overMode`). I primi tre spendono tutto l'importo, salvo i tetti; ognuno dà a tutti i codici gli stessi mesi della propria misura, contati a partire dalla SMax.

- **Aumento per consumo** (`cons`) — misura = consumo medio: tutti salgono degli stessi mesi di scorta.
- **Aumento per regolarità** (`reg`, predefinito; il vecchio `lin`) — misura = consumo × regolarità ÷ 12: i mesi di scorta in più crescono con la regolarità.
- **Aumento misto** (`mix`) — misura = consumo × (regolarità ÷ 12)^peso, con il peso della regolarità scelto da chi ordina (`overWeight`, da 0 a 100% a passi di 10), scelto con una leva: a sinistra il consumo (0% = per consumo), a destra la regolarità (100% = per regolarità).
- **Aumento dinamico** (`dyn`) — per ogni pezzo in più si stima la probabilità di venderlo entro i mesi scelti (`sellMonths`: 2, 3, 4, 6, 9 o 12); si comprano i pezzi dal più probabile da vendere al meno probabile, finché dura l'importo e finché la probabilità resta sopra la probabilità minima di vendita (`sellProb`: dal 50 al 99%). Quello che resta sotto la probabilità minima di vendita non viene speso, e la pagina lo dice.

Fino alla SMax e nel dinamico la regolarità pesa sempre al 100% (`regWeight` resta al valore iniziale); oltre la SMax i primi tre modi usano il proprio peso.

La probabilità: nel periodo il codice vende in media vendita regolare × mesi, e le vendite si contano come eventi indipendenti (distribuzione di Poisson). Il pezzo numero N è venduto se nel periodo si vendono almeno N pezzi. Il calcolo lavora sul logaritmo del rischio, quindi è esatto anche per i codici che vendono centinaia di pezzi al mese. È una stima statistica, non una garanzia. I tetti (mesi oltre la SMax, copertura massima) valgono per entrambi i modi; di ogni riga si può aprire il conto con le probabilità del primo e dell'ultimo pezzo comprato.

## Conferma dell'ordine: quantità modificabili

Nella proposta da confermare ogni riga ha la quantità in un campo modificabile. Cambiandola si aggiornano subito valore della riga, copertura dopo l'ordine e totali, e la riga viene accettata (a zero, rifiutata). La quantità proposta resta indicata sotto il campo; se supera la SMax compare l'avviso «Oltre SMax». Le modifiche restano nel browser finché la proposta di quel codice non cambia; «Torna alle quantità proposte» le annulla. L'Excel dell'ordine confermato riporta quantità proposta, quantità scelta e «Modificata a mano»; nel PDF le quantità cambiate hanno l'asterisco.

## Perimetro della rete

L'amministratore può caricare, in «Amministrazione», un Excel con un elenco di codici valido per tutte le concessionarie. Da quel momento gli utenti possono caricare tutto il magazzino, ma ogni caricamento elabora e salva solo i codici dell'elenco: analisi, scheda codice e ordini lavorano solo su quelli. La colonna del codice si riconosce dal nome (come nelle liste), altrimenti vale la prima colonna; i doppioni si contano una volta.

- Vale dai caricamenti successivi: quelli già fatti restano come sono.
- Prima di salvare la pagina dice quanti codici delle liste entrano nel perimetro; dopo, quanti sono rimasti fuori.
- Ogni caricamento registra quanti codici aveva il perimetro (`perim_n`) e quanti codici dei file sono rimasti fuori (`n_out`).
- L'elenco si può scaricare, sostituire o togliere. Senza elenco si lavora su tutto il magazzino.

## Quali giacenze si usano

- **Giacenze delle liste** — i calcoli partono dalla giacenza che le liste riportano per ogni codice, alla fine del mese precedente.
- **Correzioni a mano** — al passo 3 di «Nuovo ordine» l'utente vede la giacenza di ogni codice e corregge quelle cambiate dopo la chiusura del mese; per quei codici vale la giacenza corretta (`stock_src = manuale`), per gli altri quella delle liste. La giacenza delle liste resta salvata accanto (`giac_lista`).
- **Liste senza giacenze** (colonna assente o vuota) — ogni codice parte da zero; le giacenze si scrivono a mano al passo 3.

Di ogni caricamento si salva da dove vengono le giacenze (`stock_src`) e, se è scritta nell'intestazione della colonna, la data a cui si riferiscono (`stock_ref`). L'origine è scritta in ogni pagina, nell'Excel e nel PDF. I valori `file` e `file_lista` restano per i caricamenti fatti con il vecchio file giacenze.

Limite da conoscere: gli ordini aperti sono sempre quelli delle liste. Se la giacenza corretta a mano comprende pezzi di un ordine arrivato dopo la chiusura delle liste, quei pezzi contano due volte e la proposta per quel codice può risultare più bassa del necessario.

## Tracciato «Export» mensile delle liste

Oltre alla lista disposizione (riga di titolo, «Codice particolare», «Ord. Aperti»…) la piattaforma riconosce l'export mensile: intestazione sulla prima riga, «Annomese», «Particolare», «Particolare Desc», «Prezzo Listino», «Prz Sco Stk», «Giacenza», «Ult Vend», «SMin», «SMax», «Locazione» e altre colonne che vengono ignorate.

- **Data delle giacenze** — «Annomese» (es. 2026/10) indica il mese: le giacenze sono quelle all'ultimo giorno (31/10/2026).
- **Più mesi nello stesso file** — vale solo il mese più recente; le righe dei mesi precedenti sono ignorate e la pagina lo dice.
- **Ordini aperti** — l'export non li riporta: contano zero, e la pagina lo segnala.
- «Particolare» da solo è il codice; «Particolare Desc», «Particolare Sostituente» e «Particolare Codice Merceologico» no.

«Dati di prova» genera solo liste movimentazione, con le giacenze a fine mese, nel tracciato Export mensile o Lista disposizione.

## Struttura

- `server.js` — API (accesso, utenti, concessionarie, caricamenti, analisi, storico codice)
- `logic.js` — regole di incrocio, scenari d'ordine e indicatori
- `db.js` — connessione PostgreSQL e schema (creato all'avvio)
- `public/` — interfaccia (HTML, CSS, JavaScript senza framework)
  - `index.html`, `app.css` — pagina e stile
  - `app.js` — avvio della pagina
  - ogni sezione ha il suo indirizzo (`/nuovo`, `/analisi`, `/regole`…): il server risponde sempre con la stessa pagina, che mostra la sezione giusta; i vecchi indirizzi con il cancelletto (`/#nuovo`) portano allo stesso posto
  - `js/base.js` — funzioni comuni, accesso, menu e navigazione
  - `js/regole.js` — scenari, modi oltre la SMax, spiegazioni dei calcoli
  - `js/nuovo.js` — procedura guidata «Nuovo ordine» (obiettivo, liste, giacenze, codici, risultato)
  - `js/come-funziona.js` — pagina delle istruzioni
  - `js/probabilita.js` — spiegazione del calcolo della probabilità di vendita
  - `js/andamento.js` — rete e analisi codici
  - `js/ordine.js` — scenari d'ordine, conferma ed esportazioni Excel/PDF
  - `js/indicatori.js` — scheda codice
  - `js/pagina-regole.js` — pagina delle regole
  - `js/carica.js` — lettura dei file per «Nuovo ordine», riconoscimento colonne, mesi, giacenze, perimetro
  - `js/prova.js` — generatore di dati di prova
  - `js/admin.js` — amministrazione

## Variabili d'ambiente

| Nome | Uso |
|---|---|
| `DATABASE_URL` | stringa di connessione PostgreSQL (Neon) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME` | creano il primo amministratore al primo avvio; al primo accesso la password va cambiata |
| `NODE_ENV` | `production` su Render (cookie sicuri) |

## Avvio locale

```
npm install
DATABASE_URL=postgres://... ADMIN_USERNAME=admin ADMIN_PASSWORD=unapasswordlunga npm start
```
