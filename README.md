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
| Acquisti per un importo libero | Come sopra, ma quello che resterebbe non speso sale oltre la SMax, con la stessa proporzione. La SMax viene superata solo dopo che tutti i codici ci sono arrivati. Copertura massima per codice facoltativa |

I pezzi sono interi: si assegnano uno alla volta al codice più vicino al suo pezzo successivo. Ogni utente ha le proprie regole di riordino (correzione del consumo, arrotondamento, esclusioni, avviso di copertura); di ogni quantità si può aprire il conto passo per passo.

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
