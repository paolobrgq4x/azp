"use strict";
const { Pool, types } = require("pg");

types.setTypeParser(1082, v => v);            // date -> "YYYY-MM-DD"
types.setTypeParser(1700, v => parseFloat(v)); // numeric -> number
types.setTypeParser(20, v => parseInt(v, 10)); // bigint (count) -> number

if (!process.env.DATABASE_URL) {
  console.error("Manca la variabile DATABASE_URL.");
  process.exit(1);
}
const local = /localhost|127\.0\.0\.1|\/tmp/.test(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: local ? false : { rejectUnauthorized: true },
  max: 5,
  idleTimeoutMillis: 30000
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS dealers (
  id serial PRIMARY KEY,
  name text NOT NULL,
  code text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  username text UNIQUE NOT NULL,
  full_name text,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','dealer')),
  dealer_id int REFERENCES dealers(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  must_change boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login timestamptz
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS snapshots (
  id serial PRIMARY KEY,
  dealer_id int NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  week_date date NOT NULL,
  uploaded_by int REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  file_a text, file_b text,
  n_codes int, val_tot float8,
  n_sotto int, pz_sotto float8, val_sotto float8,
  n_eccesso int, val_eccesso float8,
  n_fermo int, val_fermo float8,
  n_nogiac int, n_nostorico int
);
CREATE TABLE IF NOT EXISTS items (
  snapshot_id int NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  code text NOT NULL,
  descr text, loc text, dg text,
  status text NOT NULL,
  in_b boolean NOT NULL,
  giac float8, ord float8, smin float8, smax float8, delta float8,
  cost float8, val_giac float8, val_action float8, regolarita float8, cons_mese float8,
  streak int NOT NULL DEFAULT 1,
  prev_giac float8,
  PRIMARY KEY (snapshot_id, code)
);
CREATE TABLE IF NOT EXISTS code_flags (
  dealer_id int NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  code text NOT NULL,
  note text,
  set_by int REFERENCES users(id) ON DELETE SET NULL,
  set_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dealer_id, code)
);
-- Tracciati dei file già caricati: per ogni concessionaria, le colonne usate con una certa intestazione (impronta).
CREATE TABLE IF NOT EXISTS layouts (
  dealer_id int NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('A','B')),
  sig text NOT NULL,
  map jsonb NOT NULL,
  set_by int REFERENCES users(id) ON DELETE SET NULL,
  set_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dealer_id, kind, sig)
);
CREATE INDEX IF NOT EXISTS items_code_idx ON items (code, snapshot_id);
-- Nomi precedenti delle due colonne: vengono rinominate una sola volta, i dati restano dove sono.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'items' AND column_name = 'dom_anno')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'items' AND column_name = 'regolarita') THEN
    ALTER TABLE items RENAME COLUMN dom_anno TO regolarita;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'items' AND column_name = 'dato_agg')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'items' AND column_name = 'cons_mese') THEN
    ALTER TABLE items RENAME COLUMN dato_agg TO cons_mese;
  END IF;
END $$;
ALTER TABLE items ADD COLUMN IF NOT EXISTS listino float8;
-- Regole di riordino scelte da ogni utente (null = valori iniziali)
ALTER TABLE users ADD COLUMN IF NOT EXISTS rules jsonb;
ALTER TABLE items ADD COLUMN IF NOT EXISTS qty_sold float8;
ALTER TABLE items ADD COLUMN IF NOT EXISTS last_sale date;
ALTER TABLE items ADD COLUMN IF NOT EXISTS ven_spc float8;
ALTER TABLE items ADD COLUMN IF NOT EXISTS fab float8;
CREATE INDEX IF NOT EXISTS sessions_exp_idx ON sessions (expires_at);
-- Ogni caricamento è una riga a sé (week_date = giorno del caricamento), anche più volte nello stesso giorno.
ALTER TABLE snapshots DROP CONSTRAINT IF EXISTS snapshots_dealer_id_week_date_key;
CREATE INDEX IF NOT EXISTS snapshots_order_idx ON snapshots (dealer_id, week_date, uploaded_at, id);
-- Giacenze: quelle riportate dalle liste (fine mese precedente) accanto a quelle usate nei calcoli.
--   stock_src: da dove vengono le giacenze del caricamento ('lista', 'file', 'file_lista'); vuoto nei caricamenti precedenti (file giacenze)
--   stock_ref: data a cui si riferiscono le giacenze delle liste, se è scritta nell'intestazione della colonna
ALTER TABLE items ADD COLUMN IF NOT EXISTS giac_lista float8;
ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS stock_src text;
ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS stock_ref text;
-- Perimetro della rete: se l'amministratore carica un elenco di codici, i caricamenti elaborano solo quei codici.
CREATE TABLE IF NOT EXISTS perimeter (code text PRIMARY KEY);
CREATE TABLE IF NOT EXISTS settings (k text PRIMARY KEY, v jsonb NOT NULL, set_by int REFERENCES users(id) ON DELETE SET NULL, set_at timestamptz NOT NULL DEFAULT now());
-- per ogni caricamento: quanti codici c'erano nel perimetro (vuoto = nessun perimetro) e quanti codici dei file sono rimasti fuori
ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS perim_n int;
ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS n_out int;
`;

async function migrate() { await pool.query(SCHEMA); }

async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally { c.release(); }
}

module.exports = { pool, migrate, tx };
