# Incrocio giacenze ricambi

Piattaforma web che incrocia ogni settimana lo **storico movimentazione** (lista disposizione) e la **giacenza attuale** di una concessionaria, classifica ogni codice (sotto scorta, eccesso, fermo, in linea) e conserva lo storico per seguirne l'evoluzione.

## Come funziona

- Il responsabile di magazzino entra con utente e password, sceglie la settimana e carica i due file Excel.
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

"Settimane nello stato" conta le settimane consecutive in cui il codice è rimasto nello stesso stato.

## Struttura

- `server.js` — API (accesso, utenti, concessionarie, caricamenti, analisi, storico codice)
- `logic.js` — regole di incrocio
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
