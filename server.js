"use strict";
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const { pool, migrate, tx } = require("./db");
const { cross, scenario, filterValues, kpis, cleanRules, MODES } = require("./logic");

const PORT = process.env.PORT || 10000;
const PROD = process.env.NODE_ENV === "production";
const SESSION_DAYS = 7;

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

/* ---------- Intestazioni di sicurezza: nessuna risorsa esterna è ammessa ---------- */
app.use((req, res, next) => {
  res.set({
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
    ...(PROD ? { "Strict-Transport-Security": "max-age=31536000" } : {})
  });
  next();
});

app.get("/salute", (req, res) => res.type("text").send("ok"));
app.get("/robots.txt", (req, res) => res.type("text").send("User-agent: *\nDisallow: /\n"));

/* La libreria che legge gli Excel viene servita da qui: i file restano nel browser fino al salvataggio. */
const XLSX_FILE = require.resolve("xlsx/dist/xlsx.full.min.js");
app.get("/vendor/xlsx.full.min.js", (req, res) => res.set("Cache-Control", "public, max-age=86400").sendFile(XLSX_FILE));
const distOf = pkg => path.dirname(require.resolve(pkg));
const PDF_FILES = { "jspdf.umd.min.js": path.join(distOf("jspdf"), "jspdf.umd.min.js"), "jspdf.plugin.autotable.min.js": path.join(distOf("jspdf-autotable"), "jspdf.plugin.autotable.min.js"),
  "jszip.min.js": require.resolve("jszip/dist/jszip.min.js") };
app.get("/vendor/:f", (req, res, next) => PDF_FILES[req.params.f] ? res.set("Cache-Control", "public, max-age=86400").sendFile(PDF_FILES[req.params.f]) : next());
// Le pagine e gli script si ricontrollano sempre sul server, così dopo un aggiornamento non resta in uso una copia vecchia.
app.use(express.static(path.join(__dirname, "public"), { index: "index.html", maxAge: 0, setHeaders: res => res.set("Cache-Control", "no-cache") }));
// Versione delle pagine pubblicate: una pagina rimasta aperta la confronta con la sua e propone di ricaricare.
const VERSION = crypto.createHash("sha256").update(["app.js", "app.css", "index.html"].map(f => require("fs").readFileSync(path.join(__dirname, "public", f))).join("")).digest("hex").slice(0, 12);
app.get("/api/version", (req, res) => res.set("Cache-Control", "no-store").json({ v: VERSION }));

/* ---------- Utilità ---------- */
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const normCode = v => String(v == null ? "" : v).trim().toUpperCase().replace(/\s+/g, "").slice(0, 40);
const parseCookies = h => Object.fromEntries((h || "").split(/;\s*/).filter(Boolean).map(p => { const i = p.indexOf("="); return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))]; }));
const tempPassword = () => {
  const a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(14), b => a[b % a.length]).join("");
};
const fail = (res, code, msg) => res.status(code).json({ error: msg });
const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e); fail(res, 500, "Errore interno. Riprova tra poco."); });

/* ---------- Sessione e protezione ---------- */
app.use("/api", (req, res, next) => {
  if (req.method !== "GET" && req.get("X-Req") !== "1") return fail(res, 403, "Richiesta non valida.");
  next();
});

async function loadUser(req) {
  const sid = parseCookies(req.headers.cookie).sid;
  if (!sid) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.full_name, u.role, u.dealer_id, u.must_change, u.rules, d.name AS dealer_name
       FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN dealers d ON d.id = u.dealer_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`, [sha(sid)]);
  return rows[0] || null;
}
const auth = (adminOnly = false) => (req, res, next) => {
  loadUser(req).then(u => {
    if (!u) return fail(res, 401, "Sessione scaduta: accedi di nuovo.");
    if (u.must_change && !["/api/me", "/api/password", "/api/logout"].includes(req.originalUrl.split("?")[0])) return fail(res, 403, "Devi prima cambiare la password.");
    if (adminOnly && u.role !== "admin") return fail(res, 403, "Funzione riservata all'amministratore.");
    req.user = u; next();
  }).catch(e => { console.error(e); fail(res, 500, "Errore interno. Riprova tra poco."); });
};
const canSee = (u, dealerId) => u.role === "admin" || u.dealer_id === dealerId;

function setSession(res, token) {
  res.set("Set-Cookie", `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${PROD ? "; Secure" : ""}`);
}

const attempts = new Map();
function limited(key) {
  const now = Date.now(), a = (attempts.get(key) || []).filter(t => now - t < 15 * 60e3);
  attempts.set(key, a);
  return a.length >= 8;
}

const small = express.json({ limit: "200kb" });
const big = express.json({ limit: "60mb" });

app.post("/api/login", small, wrap(async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const keyIp = "ip:" + req.ip, keyU = "u:" + username;
  if (limited(keyIp) || limited(keyU)) return fail(res, 429, "Troppi tentativi. Riprova tra 15 minuti.");
  const { rows } = await pool.query("SELECT id, password_hash, active FROM users WHERE username = $1", [username]);
  const u = rows[0];
  const ok = u && u.active && await bcrypt.compare(password, u.password_hash);
  if (!ok) {
    attempts.get(keyIp).push(Date.now()); attempts.get(keyU).push(Date.now());
    return fail(res, 401, "Utente o password non corretti.");
  }
  attempts.delete(keyU);
  const token = crypto.randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + $3::interval)", [sha(token), u.id, `${SESSION_DAYS} days`]);
  await pool.query("UPDATE users SET last_login = now() WHERE id = $1", [u.id]);
  await pool.query("DELETE FROM sessions WHERE expires_at < now()");
  setSession(res, token);
  res.json({ ok: true });
}));

app.post("/api/logout", wrap(async (req, res) => {
  const sid = parseCookies(req.headers.cookie).sid;
  if (sid) await pool.query("DELETE FROM sessions WHERE token_hash = $1", [sha(sid)]);
  res.set("Set-Cookie", `sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${PROD ? "; Secure" : ""}`);
  res.json({ ok: true });
}));

app.get("/api/me", auth(), wrap(async (req, res) => {
  const u = req.user;
  const { rows } = u.role === "admin"
    ? await pool.query("SELECT id, name, code FROM dealers ORDER BY name")
    : await pool.query("SELECT id, name, code FROM dealers WHERE id = $1", [u.dealer_id]);
  res.json({ user: { ...u, rules: cleanRules(u.rules) }, dealers: rows });
}));

// Regole di riordino dell'utente collegato: ognuno le sceglie per sé
app.put("/api/me/rules", small, auth(), wrap(async (req, res) => {
  const rules = cleanRules(req.body && req.body.rules);
  await pool.query("UPDATE users SET rules = $1 WHERE id = $2", [JSON.stringify(rules), req.user.id]);
  res.json({ rules });
}));

app.post("/api/password", small, auth(), wrap(async (req, res) => {
  const cur = String(req.body.current || ""), next = String(req.body.next || "");
  if (next.length < 10) return fail(res, 400, "La nuova password deve avere almeno 10 caratteri.");
  const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
  if (!await bcrypt.compare(cur, rows[0].password_hash)) return fail(res, 400, "La password attuale non è corretta.");
  await pool.query("UPDATE users SET password_hash = $1, must_change = false WHERE id = $2", [await bcrypt.hash(next, 11), req.user.id]);
  const sid = parseCookies(req.headers.cookie).sid;
  await pool.query("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2", [req.user.id, sha(sid)]);
  res.json({ ok: true });
}));

/* ---------- Concessionarie e utenti (amministratore) ---------- */
app.get("/api/dealers", auth(true), wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT d.id, d.name, d.code,
      (SELECT count(*) FROM snapshots s WHERE s.dealer_id = d.id) AS n_weeks,
      (SELECT count(*) FROM users u WHERE u.dealer_id = d.id AND u.active) AS n_users
    FROM dealers d ORDER BY d.name`);
  res.json(rows);
}));
app.post("/api/dealers", small, auth(true), wrap(async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 100), code = String(req.body.code || "").trim().toUpperCase().slice(0, 20) || null;
  if (!name) return fail(res, 400, "Indica il nome della concessionaria.");
  try {
    const { rows } = await pool.query("INSERT INTO dealers (name, code) VALUES ($1, $2) RETURNING id, name, code", [name, code]);
    res.json(rows[0]);
  } catch (e) { if (e.code === "23505") return fail(res, 400, "Esiste già una concessionaria con questo codice."); throw e; }
}));
app.patch("/api/dealers/:id", small, auth(true), wrap(async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 100), code = String(req.body.code || "").trim().toUpperCase().slice(0, 20) || null;
  if (!name) return fail(res, 400, "Indica il nome della concessionaria.");
  try { await pool.query("UPDATE dealers SET name = $1, code = $2 WHERE id = $3", [name, code, +req.params.id]); res.json({ ok: true }); }
  catch (e) { if (e.code === "23505") return fail(res, 400, "Esiste già una concessionaria con questo codice."); throw e; }
}));

app.get("/api/users", auth(true), wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT u.id, u.username, u.full_name, u.role, u.dealer_id, d.name AS dealer_name, u.active, u.last_login
    FROM users u LEFT JOIN dealers d ON d.id = u.dealer_id ORDER BY u.role, d.name NULLS FIRST, u.username`);
  res.json(rows);
}));
app.post("/api/users", small, auth(true), wrap(async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const full_name = String(req.body.full_name || "").trim().slice(0, 100);
  const role = req.body.role === "admin" ? "admin" : "dealer";
  const dealer_id = role === "dealer" ? +req.body.dealer_id || null : null;
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return fail(res, 400, "Nome utente: da 3 a 40 caratteri tra lettere, numeri, punto, trattino.");
  if (role === "dealer" && !dealer_id) return fail(res, 400, "Scegli la concessionaria dell'utente.");
  const pwd = tempPassword();
  try {
    await pool.query("INSERT INTO users (username, full_name, password_hash, role, dealer_id) VALUES ($1,$2,$3,$4,$5)", [username, full_name, await bcrypt.hash(pwd, 11), role, dealer_id]);
  } catch (e) { if (e.code === "23505") return fail(res, 400, "Questo nome utente esiste già."); throw e; }
  res.json({ username, password: pwd });
}));
app.post("/api/users/:id/reset", auth(true), wrap(async (req, res) => {
  const pwd = tempPassword();
  const r = await pool.query("UPDATE users SET password_hash = $1, must_change = true WHERE id = $2 RETURNING username", [await bcrypt.hash(pwd, 11), +req.params.id]);
  if (!r.rowCount) return fail(res, 404, "Utente non trovato.");
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [+req.params.id]);
  res.json({ username: r.rows[0].username, password: pwd });
}));
app.post("/api/users/:id/active", small, auth(true), wrap(async (req, res) => {
  if (+req.params.id === req.user.id) return fail(res, 400, "Non puoi disattivare il tuo utente.");
  const active = !!req.body.active;
  await pool.query("UPDATE users SET active = $1 WHERE id = $2", [active, +req.params.id]);
  if (!active) await pool.query("DELETE FROM sessions WHERE user_id = $1", [+req.params.id]);
  res.json({ ok: true });
}));

/* ---------- Cancellazioni (amministratore) ---------- */
app.delete("/api/users/:id", auth(true), wrap(async (req, res) => {
  const id = +req.params.id;
  if (id === req.user.id) return fail(res, 400, "Non puoi eliminare il tuo utente.");
  const { rows } = await pool.query("SELECT role FROM users WHERE id = $1", [id]);
  if (!rows[0]) return fail(res, 404, "Utente non trovato.");
  if (rows[0].role === "admin") {
    const c = await pool.query("SELECT count(*) AS n FROM users WHERE role = 'admin' AND active");
    if (c.rows[0].n <= 1) return fail(res, 400, "Deve restare almeno un amministratore attivo.");
  }
  await pool.query("DELETE FROM users WHERE id = $1", [id]);
  res.json({ ok: true });
}));

app.get("/api/uploads", auth(true), wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT s.id, s.dealer_id, d.name AS dealer_name, s.week_date, s.uploaded_at, s.file_a, s.file_b, s.n_codes,
      u.full_name AS uploaded_by_name, u.username AS uploaded_by_user
    FROM snapshots s JOIN dealers d ON d.id = s.dealer_id LEFT JOIN users u ON u.id = s.uploaded_by ORDER BY s.uploaded_at DESC`);
  res.json(rows);
}));

app.post("/api/snapshots/delete", small, auth(true), wrap(async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger).slice(0, 5000);
  if (!ids.length) return fail(res, 400, "Nessun caricamento selezionato.");
  const n = await tx(async c => {
    const r = await c.query("DELETE FROM snapshots WHERE id = ANY($1::int[]) RETURNING dealer_id, week_date", [ids]);
    const first = new Map();
    for (const x of r.rows) if (!first.has(x.dealer_id) || x.week_date < first.get(x.dealer_id)) first.set(x.dealer_id, x.week_date);
    for (const [d, w] of first) await relink(c, d, w);
    return r.rowCount;
  });
  res.json({ ok: true, n });
}));

app.delete("/api/dealers/:id/data", auth(true), wrap(async (req, res) => {
  const id = +req.params.id;
  const r = await tx(async c => {
    const a = await c.query("DELETE FROM snapshots WHERE dealer_id = $1", [id]);
    const b = req.query.flags === "1" ? await c.query("DELETE FROM code_flags WHERE dealer_id = $1", [id]) : { rowCount: 0 };
    return { weeks: a.rowCount, flags: b.rowCount };
  });
  res.json({ ok: true, ...r });
}));

app.delete("/api/dealers/:id", auth(true), wrap(async (req, res) => {
  const id = +req.params.id;
  const r = await tx(async c => {
    const u = await c.query("DELETE FROM users WHERE dealer_id = $1 AND role = 'dealer'", [id]);
    const d = await c.query("DELETE FROM dealers WHERE id = $1", [id]);
    return { users: u.rowCount, dealers: d.rowCount };
  });
  if (!r.dealers) return fail(res, 404, "Concessionaria non trovata.");
  res.json({ ok: true, ...r });
}));

/* ---------- Caricamenti ----------
 * Ogni caricamento ha la data del giorno in cui è stato fatto (week_date) e l'ora (uploaded_at).
 * L'ordine dei caricamenti è: data, ora, id. */
const SNAP_ORDER = "week_date, uploaded_at, id";
async function relink(c, dealerId, fromWeek) {
  const { rows } = await c.query(`SELECT id, week_date FROM snapshots WHERE dealer_id = $1 ORDER BY ${SNAP_ORDER}`, [dealerId]);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].week_date < fromWeek) continue;
    const cur = rows[i].id, prev = i > 0 ? rows[i - 1].id : null;
    await c.query("UPDATE items SET streak = 1, prev_giac = NULL WHERE snapshot_id = $1", [cur]);
    if (prev) await c.query(
      `UPDATE items i SET streak = CASE WHEN p.status = i.status THEN p.streak + 1 ELSE 1 END, prev_giac = p.giac
         FROM items p WHERE i.snapshot_id = $1 AND p.snapshot_id = $2 AND p.code = i.code`, [cur, prev]);
  }
}

const COLS = ["code", "descr", "loc", "dg", "status", "in_b", "giac", "ord", "smin", "smax", "delta", "cost", "val_giac", "val_action", "regolarita", "cons_mese", "listino", "qty_sold", "last_sale", "ven_spc", "fab"];
const TYPES = ["text", "text", "text", "text", "text", "bool", "float8", "float8", "float8", "float8", "float8", "float8", "float8", "float8", "float8", "float8", "float8", "float8", "date", "float8", "float8"];

app.post("/api/snapshots", big, auth(), wrap(async (req, res) => {
  const u = req.user;
  const dealerId = u.role === "admin" ? +req.body.dealer_id : u.dealer_id;
  if (!dealerId) return fail(res, 400, "Scegli la concessionaria.");
  if (!canSee(u, dealerId)) return fail(res, 403, "Non puoi caricare dati per questa concessionaria.");
  // data del caricamento: il giorno di oggi in Italia
  const week = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  let result;
  try { result = cross(req.body.rowsA, req.body.rowsB); } catch (e) { return fail(res, 400, e.message); }
  if (!result.items.length) return fail(res, 400, "Nessun codice trovato nei file: controlla le colonne scelte.");

  const out = await tx(async c => {
    const k = result.kpi;
    const s = await c.query(`INSERT INTO snapshots (dealer_id, week_date, uploaded_by, file_a, file_b, n_codes, val_tot, n_sotto, pz_sotto, val_sotto, n_eccesso, val_eccesso, n_fermo, val_fermo, n_nogiac, n_nostorico)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [dealerId, week, u.id, String(req.body.file_a || "").slice(0, 200), String(req.body.file_b || "").slice(0, 200),
       k.n_codes, k.val_tot, k.n_sotto, k.pz_sotto, k.val_sotto, k.n_eccesso, k.val_eccesso, k.n_fermo, k.val_fermo, k.n_nogiac, k.n_nostorico]);
    const sid = s.rows[0].id;
    const CH = 5000;
    for (let i = 0; i < result.items.length; i += CH) {
      const part = result.items.slice(i, i + CH);
      const arrays = COLS.map(col => part.map(it => it[col]));
      await c.query(`INSERT INTO items (snapshot_id, ${COLS.join(", ")})
        SELECT $1, * FROM unnest(${COLS.map((_, j) => `$${j + 2}::${TYPES[j]}[]`).join(", ")})`, [sid, ...arrays]);
    }
    await relink(c, dealerId, week);
    return { id: sid, week, dup: result.dup, kpi: k };
  });
  res.json(out);
}));

app.get("/api/dealers/:id/snapshots", auth(), wrap(async (req, res) => {
  const id = +req.params.id;
  if (!canSee(req.user, id)) return fail(res, 403, "Accesso non consentito.");
  const { rows } = await pool.query(`SELECT s.id, s.week_date, s.uploaded_at, s.file_a, s.file_b, s.n_codes, s.val_tot, s.n_sotto, s.pz_sotto, s.val_sotto,
      s.n_eccesso, s.val_eccesso, s.n_fermo, s.val_fermo, s.n_nogiac, s.n_nostorico, u.full_name AS uploaded_by_name, u.username AS uploaded_by_user
    FROM snapshots s LEFT JOIN users u ON u.id = s.uploaded_by WHERE s.dealer_id = $1 ORDER BY s.week_date, s.uploaded_at, s.id`, [id]);
  res.json(rows);
}));

app.delete("/api/snapshots/:id", auth(true), wrap(async (req, res) => {
  await tx(async c => {
    const r = await c.query("DELETE FROM snapshots WHERE id = $1 RETURNING dealer_id, week_date", [+req.params.id]);
    if (r.rowCount) await relink(c, r.rows[0].dealer_id, r.rows[0].week_date);
  });
  res.json({ ok: true });
}));

const FILTERS = {
  tutti: "true",
  sotto: "status = 'sotto'", eccesso: "status = 'eccesso'", fermo: "status = 'fermo'", ok: "status = 'ok'",
  nostorico: "status = 'nostorico'", nogiac: "NOT in_b",
  nuovi: "status IN ('sotto','eccesso','fermo') AND streak = 1",
  ondemand: "ondemand",
  cronici: "status IN ('eccesso','fermo') AND streak >= 4"
};
const PRIO = "CASE status WHEN 'sotto' THEN 0 WHEN 'eccesso' THEN 1 WHEN 'fermo' THEN 2 WHEN 'nostorico' THEN 3 ELSE 4 END";
const SORTS = { code: "code", descr: "descr", loc: "loc", giac: "giac", ord: "ord", smin: "smin", smax: "smax", delta: "delta", cost: "cost",
  val_giac: "val_giac", val_action: "val_action", streak: "streak", var: "(giac - prev_giac)", status: PRIO };

async function snapshotFor(req, res) {
  const { rows } = await pool.query("SELECT id, dealer_id, week_date, uploaded_at FROM snapshots WHERE id = $1", [+req.params.id]);
  if (!rows[0]) { fail(res, 404, "Caricamento non trovato."); return null; }
  if (!canSee(req.user, rows[0].dealer_id)) { fail(res, 403, "Accesso non consentito."); return null; }
  return rows[0];
}

app.get("/api/snapshots/:id/items", auth(), wrap(async (req, res) => {
  const s = await snapshotFor(req, res); if (!s) return;
  const f = FILTERS[req.query.f] ? req.query.f : "tutti";
  const q = String(req.query.q || "").trim().slice(0, 60);
  const params = [s.id];
  const SRC = `(SELECT items.*, (f.code IS NOT NULL) AS ondemand FROM items LEFT JOIN code_flags f ON f.dealer_id = ${+s.dealer_id} AND f.code = items.code WHERE items.snapshot_id = $1) t`;
  let where = `${FILTERS[f]}`;
  if (q) { params.push("%" + q.replace(/[%_\\]/g, m => "\\" + m) + "%"); where += ` AND (code ILIKE $${params.length} OR descr ILIKE $${params.length})`; }
  const sortKey = SORTS[req.query.sort] ? req.query.sort : null;
  const dir = req.query.dir === "desc" ? "DESC" : "ASC";
  const order = sortKey ? `${SORTS[sortKey]} ${dir} NULLS LAST, code` : `${PRIO}, abs(val_action) DESC, code`;
  const all = req.query.all === "1";
  const limit = all ? 200000 : Math.min(500, Math.max(1, Math.floor(+req.query.limit) || 200));
  const offset = all ? 0 : Math.min(1e7, Math.max(0, Math.floor(+req.query.offset) || 0));   // sempre un intero: nella query entrano solo numeri
  const [items, total, counts, prev] = await Promise.all([
    pool.query(`SELECT code, descr, loc, dg, status, in_b, giac, ord, smin, smax, delta, cost, val_giac, val_action, regolarita, cons_mese, streak, prev_giac, ondemand
      FROM ${SRC} WHERE ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, params),
    pool.query(`SELECT count(*) AS n FROM ${SRC} WHERE ${where}`, params),
    pool.query(`SELECT ${Object.entries(FILTERS).map(([k, v]) => `count(*) FILTER (WHERE ${v}) AS ${k}`).join(", ")} FROM ${SRC}`, [s.id]),
    pool.query("SELECT week_date, uploaded_at FROM snapshots WHERE dealer_id = $1 AND (week_date, uploaded_at, id) < ($2::date, $3::timestamptz, $4::int) ORDER BY week_date DESC, uploaded_at DESC, id DESC LIMIT 1", [s.dealer_id, s.week_date, s.uploaded_at, s.id])
  ]);
  res.json({ rows: items.rows, total: total.rows[0].n, counts: counts.rows[0], prev_week: prev.rows[0] ? prev.rows[0].week_date : null, prev_at: prev.rows[0] ? prev.rows[0].uploaded_at : null });
}));

const ITEM_COLS = "code, descr, loc, dg, status, in_b, giac, ord, smin, smax, delta, cost, val_giac, val_action, regolarita, cons_mese, listino, qty_sold, last_sale, ven_spc, fab, streak, prev_giac";

app.post("/api/snapshots/:id/scenario", express.json({ limit: "5mb" }), auth(), wrap(async (req, res) => {
  const s = await snapshotFor(req, res); if (!s) return;
  const b = req.body || {};
  // tre scenari: cover (periodo, entro SMin e SMax), amount (importo, entro SMin e SMax), free (importo libero, anche oltre la SMax)
  const mode = MODES.includes(b.mode) ? b.mode : "amount";
  const budget = Math.min(1e8, Math.max(0, +b.budget || 0));
  if (mode !== "cover" && !budget) return fail(res, 400, "Indica un importo maggiore di zero.");
  const arr = (v, re) => Array.isArray(v) ? v.map(String).filter(x => re.test(x)).slice(0, 100) : [];
  const filters = { groups: arr(b.filters && b.filters.groups, /^[0-9X]$/), abc: arr(b.filters && b.filters.abc, /^[ABCN]$/),
    dg: arr(b.filters && b.filters.dg, /^.{1,20}$/), q: String((b.filters && b.filters.q) || "").slice(0, 60),
    codes: [...new Set((Array.isArray(b.filters && b.filters.codes) ? b.filters.codes : []).map(normCode).filter(Boolean))].slice(0, 50000) };
  const [{ rows }, fl] = await Promise.all([pool.query(`SELECT ${ITEM_COLS} FROM items WHERE snapshot_id = $1 ORDER BY code COLLATE "C"`, [s.id]), flaggedSet(s.dealer_id)]);
  // regole: quelle inviate con la richiesta, altrimenti quelle salvate dall'utente
  const rules = cleanRules(b.rules || req.user.rules);
  res.json({ week: s.week_date, at: s.uploaded_at, ...scenario(rows, { mode, budget, months: b.months, maxCover: b.maxCover, listOverride: b.listOverride !== false,
    minDemand: b.minDemand != null ? Math.min(1000, Math.max(0, +b.minDemand || 0)) : rules.minDemand, flagged: fl, filters, rules }) });
}));

app.post("/api/snapshots/:id/lookup", express.json({ limit: "5mb" }), auth(), wrap(async (req, res) => {
  const s = await snapshotFor(req, res); if (!s) return;
  const codes = [...new Set((Array.isArray(req.body.codes) ? req.body.codes : []).map(normCode).filter(Boolean))].slice(0, 50000);
  if (!codes.length) return res.json({ rows: [], missing: [] });
  const { rows } = await pool.query(`SELECT i.code, i.descr, i.status, i.giac, i.ord, i.smin, i.smax, i.cons_mese, i.regolarita, i.cost, (f.code IS NOT NULL) AS ondemand
    FROM items i LEFT JOIN code_flags f ON f.dealer_id = $3 AND f.code = i.code WHERE i.snapshot_id = $1 AND i.code = ANY($2::text[])`, [s.id, codes, s.dealer_id]);
  const found = new Set(rows.map(r => r.code));
  const order = new Map(codes.map((c, k) => [c, k]));
  rows.sort((a, b) => order.get(a.code) - order.get(b.code));
  res.json({ rows, missing: codes.filter(c => !found.has(c)) });
}));

app.get("/api/snapshots/:id/filters", auth(), wrap(async (req, res) => {
  const s = await snapshotFor(req, res); if (!s) return;
  const { rows } = await pool.query('SELECT code, status, dg, cons_mese, cost FROM items WHERE snapshot_id = $1 ORDER BY code COLLATE "C"', [s.id]);
  res.json(filterValues(rows));
}));

app.get("/api/snapshots/:id/kpi", auth(), wrap(async (req, res) => {
  const s = await snapshotFor(req, res); if (!s) return;
  const [{ rows }, fl] = await Promise.all([pool.query(`SELECT ${ITEM_COLS} FROM items WHERE snapshot_id = $1 ORDER BY code COLLATE "C"`, [s.id]), flaggedSet(s.dealer_id)]);
  res.json({ week: s.week_date, at: s.uploaded_at, ...kpis(rows, fl) });
}));

app.get("/api/dealers/:id/kpitrend", auth(), wrap(async (req, res) => {
  const id = +req.params.id;
  if (!canSee(req.user, id)) return fail(res, 403, "Accesso non consentito.");
  const { rows } = await pool.query(`SELECT s.id, s.week_date, s.uploaded_at, s.val_tot,
      count(*) FILTER (WHERE i.smin > 0 AND i.status <> 'nostorico' AND f.code IS NULL) AS n_dem,
      count(*) FILTER (WHERE i.smin > 0 AND i.giac > 0 AND i.status <> 'nostorico' AND f.code IS NULL) AS n_disp,
      coalesce(sum(i.cons_mese * 12 * i.cost) FILTER (WHERE i.status <> 'nostorico'), 0) AS cons_year
    FROM snapshots s JOIN items i ON i.snapshot_id = s.id LEFT JOIN code_flags f ON f.dealer_id = s.dealer_id AND f.code = i.code
    WHERE s.dealer_id = $1 GROUP BY s.id ORDER BY s.week_date, s.uploaded_at, s.id`, [id]);
  res.json(rows.map(r => ({ week_date: r.week_date, uploaded_at: r.uploaded_at, service: r.n_dem ? r.n_disp / r.n_dem : null, coverage_months: r.cons_year > 0 ? r.val_tot / (r.cons_year / 12) : null })));
}));

async function flaggedSet(dealerId) {
  const { rows } = await pool.query("SELECT code FROM code_flags WHERE dealer_id = $1", [dealerId]);
  return new Set(rows.map(r => r.code));
}

app.get("/api/dealers/:id/flags", auth(), wrap(async (req, res) => {
  const id = +req.params.id; if (!canSee(req.user, id)) return fail(res, 403, "Accesso non consentito.");
  const { rows } = await pool.query(`SELECT f.code, f.note, f.set_at, u.full_name, u.username,
      (SELECT i.descr FROM items i JOIN snapshots s ON s.id = i.snapshot_id WHERE s.dealer_id = f.dealer_id AND i.code = f.code ORDER BY s.week_date DESC, s.uploaded_at DESC, s.id DESC LIMIT 1) AS descr
    FROM code_flags f LEFT JOIN users u ON u.id = f.set_by WHERE f.dealer_id = $1 ORDER BY f.code`, [id]);
  res.json(rows);
}));
app.post("/api/dealers/:id/flags", small, auth(), wrap(async (req, res) => {
  const id = +req.params.id; if (!canSee(req.user, id)) return fail(res, 403, "Accesso non consentito.");
  const codes = [...new Set((Array.isArray(req.body.codes) ? req.body.codes : []).map(normCode).filter(Boolean))].slice(0, 5000);
  if (!codes.length) return fail(res, 400, "Nessun codice indicato.");
  const note = String(req.body.note || "").slice(0, 200) || null;
  await pool.query(`INSERT INTO code_flags (dealer_id, code, note, set_by) SELECT $1, unnest($2::text[]), $3, $4
    ON CONFLICT (dealer_id, code) DO UPDATE SET note = COALESCE(EXCLUDED.note, code_flags.note), set_by = EXCLUDED.set_by, set_at = now()`, [id, codes, note, req.user.id]);
  res.json({ ok: true, n: codes.length });
}));
app.delete("/api/dealers/:id/flags/:code", auth(), wrap(async (req, res) => {
  const id = +req.params.id; if (!canSee(req.user, id)) return fail(res, 403, "Accesso non consentito.");
  await pool.query("DELETE FROM code_flags WHERE dealer_id = $1 AND code = $2", [id, normCode(req.params.code)]);
  res.json({ ok: true });
}));

app.get("/api/history", auth(), wrap(async (req, res) => {
  const dealerId = +req.query.dealer, c = String(req.query.code || "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 40);
  if (!canSee(req.user, dealerId)) return fail(res, 403, "Accesso non consentito.");
  if (!c) return res.json({ rows: [], weeks: [] });
  const [h, w] = await Promise.all([
    pool.query(`SELECT s.id AS snap_id, s.week_date, s.uploaded_at, i.code, i.descr, i.loc, i.status, i.in_b, i.giac, i.ord, i.smin, i.smax, i.delta, i.cost, i.val_giac, i.val_action, i.streak, i.cons_mese, i.regolarita
      FROM items i JOIN snapshots s ON s.id = i.snapshot_id WHERE s.dealer_id = $1 AND i.code = $2 ORDER BY s.week_date, s.uploaded_at, s.id`, [dealerId, c]),
    pool.query(`SELECT id, week_date FROM snapshots WHERE dealer_id = $1 ORDER BY ${SNAP_ORDER}`, [dealerId])
  ]);
  let suggest = [];
  if (!h.rowCount) {
    const r = await pool.query(`SELECT DISTINCT i.code FROM items i JOIN snapshots s ON s.id = i.snapshot_id
      WHERE s.dealer_id = $1 AND i.code LIKE $2 ORDER BY i.code LIMIT 12`, [dealerId, c.replace(/[%_\\]/g, m => "\\" + m) + "%"]);
    suggest = r.rows.map(x => x.code);
  }
  const fr = await pool.query("SELECT note, set_at, u.full_name, u.username FROM code_flags f LEFT JOIN users u ON u.id = f.set_by WHERE f.dealer_id = $1 AND f.code = $2", [dealerId, c]);
  res.json({ code: c, rows: h.rows, weeks: w.rows.map(x => x.week_date), latest: w.rowCount ? w.rows[w.rowCount - 1].id : null, suggest, flag: fr.rows[0] || null });
}));

app.get("/api/overview", auth(true), wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT d.id, d.name, d.code,
      l.id AS snap_id, l.week_date, l.uploaded_at, l.n_codes, l.val_tot, l.n_sotto, l.val_sotto, l.n_eccesso, l.val_eccesso, l.n_fermo, l.val_fermo,
      p.week_date AS p_week, p.val_tot AS p_val_tot, p.val_sotto AS p_val_sotto, p.val_eccesso AS p_val_eccesso, p.val_fermo AS p_val_fermo,
      (SELECT count(*) FROM snapshots x WHERE x.dealer_id = d.id) AS n_weeks
    FROM dealers d
    LEFT JOIN LATERAL (SELECT * FROM snapshots s WHERE s.dealer_id = d.id ORDER BY week_date DESC, uploaded_at DESC, id DESC LIMIT 1) l ON true
    LEFT JOIN LATERAL (SELECT * FROM snapshots s WHERE s.dealer_id = d.id AND (s.week_date, s.uploaded_at, s.id) < (l.week_date, l.uploaded_at, l.id) ORDER BY week_date DESC, uploaded_at DESC, id DESC LIMIT 1) p ON true
    ORDER BY d.name`);
  res.json(rows);
}));

app.use("/api", (req, res) => fail(res, 404, "Funzione non trovata."));

/* ---------- Avvio ---------- */
async function bootstrapAdmin() {
  const { rows } = await pool.query("SELECT count(*) AS n FROM users WHERE role = 'admin'");
  if (rows[0].n > 0) return;
  const user = (process.env.ADMIN_USERNAME || "").trim().toLowerCase(), pwd = process.env.ADMIN_PASSWORD || "";
  if (!user || pwd.length < 10) { console.warn("Nessun amministratore: imposta ADMIN_USERNAME e ADMIN_PASSWORD (almeno 10 caratteri)."); return; }
  await pool.query("INSERT INTO users (username, full_name, password_hash, role, must_change) VALUES ($1, $2, $3, 'admin', true)",
    [user, process.env.ADMIN_FULL_NAME || "Amministratore", await bcrypt.hash(pwd, 11)]);
  console.log("Creato l'amministratore", user);
}

(async () => {
  await migrate();
  await bootstrapAdmin();
  app.listen(PORT, () => console.log("Incrocio giacenze in ascolto sulla porta", PORT));
})().catch(e => { console.error(e); process.exit(1); });
