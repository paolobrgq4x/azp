# Parts Planning

Piattaforma di pianificazione ricambi (nata come «Incrocio giacenze ricambi»).

Piattaforma web che incrocia lo **storico movimentazione** (lista disposizione) e la **giacenza attuale** di una concessionaria, classifica ogni codice (sotto scorta, eccesso, fermo, in linea) e conserva i caricamenti precedenti per seguirne l'evoluzione.

## Come funziona

- Il responsabile di magazzino entra con utente e password e carica le liste movimentazione e le giacenze più recenti. Non sceglie una data: la piattaforma registra giorno e ora del caricamento e lavora sull'ultimo.
- I file vengono letti **nel browser**: al server arriva solo l'elenco dei codici con le colonne necessarie. L'incrocio viene calcolato sul server e salvato nel database.
- Ogni concessionaria vede solo i propri dati. L'amministratore vede la rete intera, crea concessionarie e utenti.
- La pagina non carica risorse esterne (Content Security Policy `default-src 'self'`).

## Regole di classificazione

| Stato | Regola |
|---|---|
| Sotto scorta | giacenza + ordini aperti < SMin. Da ordinare = SMax − disponibile |
| Eccesso | giacenza > SMax. Eccedenza = giacenza − SMax, al costo Sco STK |
| Fermo | giacenza > 0 con SMin = SMax = 0 |
| Non in giacenza | codice dello storico assente nel file giacenze |
| Senza storico | codice con giacenza che non compare nello storico |

"Caricamenti nello stato" conta i caricamenti consecutivi in cui il codice è rimasto nello stesso stato.

## Scenari d'ordine

Sono tre. Il **disponibile** è la giacenza più gli ordini aperti. La **vendita regolare** di un codice è il consumo medio mensile × l'indice di regolarità delle vendite ÷ 12: sono i pezzi al mese su cui si può contare. I codici non tenuti a scorta (SMin = SMax = 0), i fermi e quelli senza storico sono sempre esclusi.

| Scenario | Come lavora |
|---|---|
| Acquisti per coprire un periodo (1, 2 o 3 mesi) | Obiettivo = consumo medio mensile × mesi, mai sotto la SMin e mai sopra la SMax. Ordine = obiettivo − disponibile. Non c'è un importo: la spesa è il risultato |
| Acquisti per un importo | 1. I codici sotto la SMin tornano alla SMin (se l'importo non basta: prima la regolarità più alta, poi il consumo più alto). 2. Il resto compra a tutti lo stesso numero di mesi di vendita regolare. 3. Nessun codice supera la SMax; se tutti ci arrivano, il resto non viene speso |
| Acquisti per un importo libero | Come sopra, ma quello che resterebbe non speso sale oltre la SMax, con uno dei quattro modi descritti sotto. La SMax viene superata solo dopo che tutti i codici ci sono arrivati. Tetto per codice facoltativo |

I pezzi sono interi: si assegnano uno alla volta al codice più vicino al suo pezzo successivo. Ogni utente ha le proprie regole di riordino (correzione del consumo, arrotondamento, esclusioni, avviso di copertura); di ogni quantità si può aprire il conto passo per passo.

### Oltre la SMax: quattro modi

Nell'importo libero chi ordina sceglie come salire oltre la SMax (regola `overMode`). I primi tre spendono tutto l'importo, salvo i tetti; ognuno dà a tutti i codici gli stessi mesi della propria misura, contati a partire dalla SMax.

- **Aumento per consumo** (`cons`) — misura = consumo medio: tutti salgono degli stessi mesi di scorta.
- **Aumento per regolarità** (`reg`, predefinito; il vecchio `lin`) — misura = consumo × regolarità ÷ 12: i mesi di scorta in più crescono con la regolarità.
- **Aumento misto** (`mix`) — misura = consumo × (regolarità ÷ 12)^peso, con il peso della regolarità scelto da chi ordina (`overWeight`, da 0 a 100% a passi di 10), scelto con una leva: a sinistra il consumo (0% = per consumo), a destra la regolarità (100% = per regolarità).
- **Aumento dinamico** (`dyn`) — per ogni pezzo in più si stima la probabilità di venderlo entro i mesi scelti (`sellMonths`: 2, 3, 4, 6, 9 o 12); si comprano i pezzi dal più sicuro al meno sicuro, finché dura l'importo e finché la probabilità resta sopra la certezza minima (`sellProb`: dal 50 al 99%). Quello che resta sotto la certezza minima non viene speso, e la pagina lo dice.

Il peso della regolarità generale (`regWeight`) vale fino alla SMax e per il dinamico; oltre la SMax i primi tre modi usano il proprio peso.

La probabilità: nel periodo il codice vende in media vendita regolare × mesi, e le vendite si contano come eventi indipendenti (distribuzione di Poisson). Il pezzo numero N è venduto se nel periodo si vendono almeno N pezzi. Il calcolo lavora sul logaritmo del rischio, quindi è esatto anche per i codici che vendono centinaia di pezzi al mese. È una stima statistica, non una garanzia. I tetti (mesi oltre la SMax, copertura massima) valgono per entrambi i modi; di ogni riga si può aprire il conto con le probabilità del primo e dell'ultimo pezzo comprato.

## Conferma dell'ordine: quantità modificabili

Nella proposta da confermare ogni riga ha la quantità in un campo modificabile. Cambiandola si aggiornano subito valore della riga, copertura dopo l'ordine e totali, e la riga viene accettata (a zero, rifiutata). La quantità proposta resta indicata sotto il campo; se supera la SMax compare l'avviso «Oltre SMax». Le modifiche restano nel browser finché la proposta di quel codice non cambia; «Torna alle quantità proposte» le annulla. L'Excel dell'ordine confermato riporta quantità proposta, quantità scelta e «Modificata a mano»; nel PDF le quantità cambiate hanno l'asterisco.

## Quali giacenze si usano

Le liste movimentazione possono riportare, in una colonna, la giacenza di ogni codice alla fine del mese precedente; il file giacenze è la situazione al momento dell'estrazione.

- **Solo le liste** — se riportano le giacenze, i calcoli partono da quelle: il file giacenze è facoltativo.
- **Liste e file giacenze** — valgono le giacenze del file, più recenti. Costi, SMin, SMax, consumo, regolarità e ordini aperti restano quelli delle liste. Prima di salvare la pagina mostra il confronto: quanti codici sono cambiati, in calo e in aumento, e il valore al costo prima e dopo.
- **Codici con giacenza nelle liste ma assenti dal file giacenze** — contano come esauriti (giacenza zero). Se il file è parziale si può tenere per loro la giacenza delle liste; quando gli assenti superano un quarto dei codici con giacenza, la scelta è obbligatoria.
- **Liste senza giacenze** (colonna assente o vuota) — il file giacenze è obbligatorio.

Di ogni caricamento si salva da dove vengono le giacenze (`stock_src`: `lista`, `file`, `file_lista`) e, se è scritta nell'intestazione della colonna, la data a cui si riferiscono quelle delle liste (`stock_ref`); per ogni codice resta anche la giacenza riportata dalla lista (`giac_lista`). L'origine è scritta in ogni pagina, nell'Excel e nel PDF.

Limite da conoscere: gli ordini aperti sono sempre quelli delle liste. Un ordine arrivato dopo la data delle liste è già nella giacenza del file e conta ancora come ordine aperto: per quel codice la proposta può risultare più bassa del necessario.

## Tracciato «Export» mensile delle liste

Oltre alla lista disposizione (riga di titolo, «Codice particolare», «Ord. Aperti»…) la piattaforma riconosce l'export mensile: intestazione sulla prima riga, «Annomese», «Particolare», «Particolare Desc», «Prezzo Listino», «Prz Sco Stk», «Giacenza», «Ult Vend», «SMin», «SMax», «Locazione» e altre colonne che vengono ignorate.

- **Data delle giacenze** — «Annomese» (es. 2026/10) indica il mese: le giacenze sono quelle all'ultimo giorno (31/10/2026).
- **Più mesi nello stesso file** — vale solo il mese più recente; le righe dei mesi precedenti sono ignorate e la pagina lo dice.
- **Ordini aperti** — l'export non li riporta: contano zero, e la pagina lo segnala prima di salvare.
- «Particolare» da solo è il codice; «Particolare Desc», «Particolare Sostituente» e «Particolare Codice Merceologico» no.

## File delle giacenze: qualsiasi tracciato

Ogni utente può estrarre le giacenze dal proprio gestionale in una forma diversa. Del file servono solo due colonne, il **codice** e la **quantità in giacenza** (più la descrizione, se c'è): tutte le altre vengono ignorate. Le colonne si riconoscono così, nell'ordine:

1. **Tracciato già confermato** — se un file con la stessa intestazione è già stato caricato per la concessionaria con colonne diverse da quelle che la piattaforma sceglierebbe da sola, o dopo una conferma, valgono le colonne usate allora (tabella `layouts`).
2. **Liste movimentazione** — il codice è la colonna i cui valori si ritrovano tra i codici delle liste scelte, anche se scritti con punti, trattini o spazi.
3. **Nome della colonna** — un elenco di nomi possibili, con le parole che escludono («giacenza minima» non è la giacenza).
4. **Contenuto** — codici senza ripetizioni; quantità intere non negative, scartando contatori di riga, date, prezzi e codici numerici.

La pagina mostra sempre le colonne scelte, le prime righe lette e quanti codici si ritrovano nelle liste. Se la scelta non è sicura (più colonne plausibili, o quasi nessun codice in comune con le liste) chiede una conferma prima di salvare; le colonne si possono sempre cambiare a mano. Funziona anche con file senza riga di intestazione e con file CSV all'italiana (punto e virgola, virgola decimale): nei CSV i valori vengono letti come sono scritti, così «3,00» resta 3 e i codici non perdono gli zeri iniziali.

In «Dati di prova» il file giacenze si può generare in quattro tracciati diversi per provare il riconoscimento.

## Struttura

- `server.js` — API (accesso, utenti, concessionarie, caricamenti, analisi, storico codice)
- `logic.js` — regole di incrocio, scenari d'ordine e indicatori
- `db.js` — connessione PostgreSQL e schema (creato all'avvio)
- `public/` — interfaccia (HTML, CSS, JavaScript senza framework)

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
