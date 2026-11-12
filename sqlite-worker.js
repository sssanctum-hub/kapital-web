// Рабочий поток базы: протокол androidx.sqlite WebWorkerSQLiteDriver, хранение — OPFS через opfs-sahpool
// (не требует заголовков COOP/COEP, работает на GitHub Pages и в Safari 16.4+).
import sqlite3InitModule from './sqlite/index.mjs';

let sqlite3 = null;
let pool = null;
let initError = null;
const databases = new Map();
const statements = new Map();
let nextDatabaseId = 0;
let nextStatementId = 0;

const reply = (id, data) => postMessage({ id, data });
const fail = (id, error) => postMessage({ id, error: String(error && error.message || error) });

function open(id, req) {
  if (initError) return fail(id, initError);
  try {
    const db = new pool.OpfsSAHPoolDb('/' + req.fileName);
    const databaseId = nextDatabaseId++;
    databases.set(databaseId, db);
    reply(id, { databaseId });
  } catch (e) { fail(id, e); }
}

function prepare(id, req) {
  const db = databases.get(req.databaseId);
  if (!db) return fail(id, 'Invalid database ID: ' + req.databaseId);
  try {
    const statement = db.prepare(req.sql);
    const statementId = nextStatementId++;
    statements.set(statementId, statement);
    const columnNames = [];
    for (let i = 0; i < statement.columnCount; i++) columnNames.push(sqlite3.capi.sqlite3_column_name(statement, i));
    reply(id, { statementId, parameterCount: sqlite3.capi.sqlite3_bind_parameter_count(statement), columnNames });
  } catch (e) { fail(id, e); }
}

function step(id, req) {
  const statement = statements.get(req.statementId);
  if (!statement) return fail(id, 'Invalid statement ID: ' + req.statementId);
  try {
    const rows = [];
    const columnTypes = [];
    statement.reset();
    statement.clearBindings();
    for (let i = 0; i < req.bindings.length; i++) statement.bind(i + 1, req.bindings[i]);
    while (statement.step()) {
      if (!columnTypes.length) for (let i = 0; i < statement.columnCount; i++) columnTypes.push(sqlite3.capi.sqlite3_column_type(statement, i));
      rows.push(statement.get([]));
    }
    reply(id, { rows, columnTypes });
  } catch (e) { fail(id, e); }
}

function close(id, req) {
  if (req.statementId != null) {
    const s = statements.get(req.statementId);
    if (s) { try { s.finalize(); } catch (e) {} statements.delete(req.statementId); }
  }
  if (req.databaseId != null) {
    const db = databases.get(req.databaseId);
    if (db) { try { db.close(); } catch (e) {} databases.delete(req.databaseId); }
  }
}

const commands = { open, prepare, step, close };

function handle(e) {
  const msg = e.data;
  if (!msg || !msg.data || !msg.data.cmd) return fail(msg && msg.id, "Invalid request");
  const handler = commands[msg.data.cmd];
  if (!handler) return fail(msg.id, 'Unknown command: ' + msg.data.cmd);
  handler(msg.id, msg.data);
}

const queue = [];
let ready = false;
onmessage = (e) => { if (ready) handle(e); else queue.push(e); };

sqlite3InitModule()
  .then(async (instance) => {
    sqlite3 = instance;
    pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'kapital-pool', directory: '/kapital' });
  })
  .catch((e) => { initError = 'Хранилище браузера недоступно: ' + (e && e.message || e); })
  .finally(() => { ready = true; while (queue.length) handle(queue.shift()); });
