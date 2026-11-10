/**
 * Consolle Preventivi GETTONIERE-SHOP — backend su Google Apps Script
 * Gira con l'account info.gettoniereshop@gmail.com:
 *   - dati  -> Foglio Google "Consolle Preventivi - DATI" (creato al primo avvio)
 *   - PDF   -> cartella Drive "Preventivi Gettoniere-Shop"
 *   - email -> Gmail via MailApp (mittente info.gettoniereshop@gmail.com, risposte a commerciale@gettoniere-shop.it)
 * Il frontend (GitHub Pages) chiama doPost con un JSON {path, method, query, body, token}.
 */
var VERSION = 1;
var CFG = {
  cartellaDrive: 'Preventivi Gettoniere-Shop',
  cartellaDocumenti: 'Documenti prodotti Gettoniere-Shop',
  nomeFoglio: 'Consolle Preventivi - DATI',
  mittente: 'Gettoniere-Shop',
  replyTo: 'commerciale@gettoniere-shop.it',
  iterHash: 600,        // round HMAC per l'hash delle password
  sessioneOre: 12,
  maxTentativi: 5       // poi blocco di 10 minuti
};

var SCHEMA = {
  Clienti: ['id', 'azienda', 'referente', 'indirizzo', 'citta', 'piva_cf', 'email', 'telefono', 'note'],
  Prodotti: ['sku', 'nome', 'descrizione', 'prezzo', 'categoria', 'foto_url', 'url_sito', 'attivo'],
  Preventivi: ['id', 'numero', 'data', 'stato', 'cliente_id', 'cli_azienda', 'cli_referente', 'cli_indirizzo', 'cli_citta',
    'cli_piva_cf', 'cli_email', 'cli_telefono', 'pagamento', 'validita', 'consegna', 'resa', 'garanzia', 'note',
    'trasp_descr', 'trasp_costo', 'imponibile', 'iva', 'totale', 'inviato_il', 'chiuso_il', 'created_by',
    'created_at', 'updated_at', 'pdf_url'],
  Righe: ['preventivo_id', 'posizione', 'sku', 'descrizione', 'quantita', 'prezzo_unit', 'sconto_pct', 'iva_pct', 'nota', 'foto_url'],
  Storico: ['preventivo_id', 'quando', 'utente', 'evento', 'dettaglio'],
  Utenti: ['email', 'nome', 'password_hash', 'attivo'],
  Config: ['chiave', 'valore'],
  Documenti: ['sku', 'tipo', 'stato', 'lingue', 'origine', 'nota', 'aggiornato_il', 'aggiornato_da']
};
var NUMERICI = {
  Prodotti: ['prezzo'],
  Preventivi: ['trasp_costo', 'imponibile', 'iva', 'totale'],
  Righe: ['posizione', 'quantita', 'prezzo_unit', 'sconto_pct', 'iva_pct']
};
var STATI = ['bozza', 'inviato', 'accettato', 'perso'];
var HEAD = ['data', 'cliente_id', 'cli_azienda', 'cli_referente', 'cli_indirizzo', 'cli_citta', 'cli_piva_cf', 'cli_email',
  'cli_telefono', 'pagamento', 'validita', 'consegna', 'resa', 'garanzia', 'note', 'trasp_descr', 'trasp_costo',
  'imponibile', 'iva', 'totale'];
var FOTO_HOST = 'ss-pics.s3.eu-west-1.amazonaws.com', FOTO_HOST2 = 'files.scontrino.com'; // il sito ha cambiato dominio delle foto

// ═══════════════ ENTRY POINT ═══════════════
function doGet() {
  return json_({ ok: true, app: 'consolle-preventivi', versione: VERSION });
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    out = { data: route_(req) };
  } catch (err) {
    if (err && err.http) out = { error: err.msg, status: err.http };
    else { console.error(err && err.stack || err); out = { error: 'Errore interno: ' + (err && err.message || err), status: 500 }; }
  }
  return json_(out);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function fail_(status, msg) { throw { http: status, msg: msg }; }

// ═══════════════ ROUTER ═══════════════
function route_(req) {
  var path = String(req.path || ''), m = String(req.method || 'GET').toUpperCase(), q = req.query || {}, body = req.body;
  if (path === 'login' && m === 'POST') return login_(body || {});
  var user = verifyToken_(req.token);
  if (!user) fail_(401, 'Accesso richiesto');
  if (path === 'login') return { user: user.n, email: user.e };
  switch (path) {
    case 'password': return cambiaPassword_(body || {}, user);
    case 'clienti': return rClienti_(m, q, body);
    case 'prodotti': return rProdotti_(m, q, body);
    case 'documenti': return rDocumenti_(m, q, body, user);
    case 'documento': return docScarica_(q.id);
    case 'documento-carica': return docCarica_(body || {}, user);
    case 'preventivi': return rPreventivi_(m, q, body, user);
    case 'kpi': return kpi_();
    case 'img': return img_(q.u);
    case 'scheda': return scheda_(q.sku);
    case 'sito-aggiorna': return sitoAggiorna_(body);
    case 'invia-email': return inviaEmail_(body || {}, user);
    case 'archivia-pdf': return archiviaPdf_(body || {}, user);
  }
  fail_(404, 'Percorso sconosciuto: ' + path);
}

// ═══════════════ FOGLIO (storage) ═══════════════
var _ss = null;
function ss_() {
  if (_ss) return _ss;
  var id = PropertiesService.getScriptProperties().getProperty('SS_ID');
  _ss = id ? SpreadsheetApp.openById(id) : setup_();
  return _ss;
}
function sh_(name) {
  var book = ss_(), s = book.getSheetByName(name);
  if (!s && SCHEMA[name]) { // foglio introdotto dopo il primo avvio (es. Documenti): lo creo al volo
    var cols = SCHEMA[name];
    s = book.insertSheet(name);
    s.getRange(1, 1, 1, cols.length).setNumberFormat('@').setValues([cols]);
    s.getRange(2, 1, 2000, cols.length).setNumberFormat('@');
    s.setFrozenRows(1);
  }
  return s;
}

function setup_() {
  var ss = SpreadsheetApp.create(CFG.nomeFoglio);
  var names = Object.keys(SCHEMA);
  names.forEach(function (n, i) {
    var s = i === 0 ? ss.getSheets()[0] : ss.insertSheet(n);
    if (i === 0) s.setName(n);
    var cols = SCHEMA[n];
    s.getRange(1, 1, 1, cols.length).setNumberFormat('@').setValues([cols]);
    s.getRange(2, 1, 2000, cols.length).setNumberFormat('@');
    s.setFrozenRows(1);
  });
  var p = PropertiesService.getScriptProperties();
  p.setProperty('SS_ID', ss.getId());
  p.setProperty('SESSION_SECRET', Utilities.getUuid() + Utilities.getUuid());
  if (typeof ADMIN_SEED !== 'undefined') {
    appendRows_('Utenti', [{ email: ADMIN_SEED.email, nome: ADMIN_SEED.nome, password_hash: ADMIN_SEED.hash, attivo: true }], ss);
  }
  _ss = ss;
  return ss;
}

function conv_(name, col, v) {
  if (v instanceof Date) v = Utilities.formatDate(v, 'Europe/Rome', 'yyyy-MM-dd');
  if ((NUMERICI[name] || []).indexOf(col) >= 0) return num_(v);
  if (col === 'attivo') return String(v).toLowerCase() !== 'false';
  return v == null ? '' : String(v);
}
function num_(v) { var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; }

function readAll_(name) {
  var s = sh_(name), n = s.getLastRow();
  if (n < 2) return [];
  var cols = SCHEMA[name], vals = s.getRange(2, 1, n - 1, cols.length).getValues();
  return vals.map(function (r, i) {
    var o = { _row: i + 2 };
    cols.forEach(function (c, j) { o[c] = conv_(name, c, r[j]); });
    return o;
  });
}
function toRow_(name, o) {
  return SCHEMA[name].map(function (c) { var v = o[c]; return v == null ? '' : String(v); });
}
function appendRows_(name, objs, ssOpt) {
  if (!objs.length) return;
  var s = ssOpt ? ssOpt.getSheetByName(name) : sh_(name), cols = SCHEMA[name], start = s.getLastRow() + 1;
  s.getRange(start, 1, objs.length, cols.length).setNumberFormat('@').setValues(objs.map(function (o) { return toRow_(name, o); }));
}
function updateRow_(name, row, o) {
  var cols = SCHEMA[name];
  sh_(name).getRange(row, 1, 1, cols.length).setValues([toRow_(name, o)]);
}
function rewrite_(name, objs) { // sostituisce tutto il contenuto (righe dati) del foglio
  var s = sh_(name), cols = SCHEMA[name], n = s.getLastRow();
  if (n > 1) s.getRange(2, 1, n - 1, cols.length).clearContent();
  if (objs.length) s.getRange(2, 1, objs.length, cols.length).setNumberFormat('@').setValues(objs.map(function (o) { return toRow_(name, o); }));
}
function strip_(o) { var c = {}; Object.keys(o).forEach(function (k) { if (k !== '_row') c[k] = o[k]; }); return c; }

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ═══════════════ AUTENTICAZIONE ═══════════════
function hmac_(valueBytes, keyBytes) { return Utilities.computeHmacSha256Signature(valueBytes, keyBytes); }
function utf8_(s) { return Utilities.newBlob(String(s)).getBytes(); }

// formato: h1$<iterazioni>$<sale>$<hash base64>  (HMAC-SHA256 iterato)
function hashPassword_(pw, salt, iter) {
  salt = salt || Utilities.getUuid(); iter = iter || CFG.iterHash;
  var key = utf8_(salt), h = hmac_(utf8_(pw), key);
  for (var i = 1; i < iter; i++) h = hmac_(h, key);
  return 'h1$' + iter + '$' + salt + '$' + Utilities.base64Encode(h);
}
function checkPassword_(pw, stored) {
  var p = String(stored || '').split('$');
  if (p[0] !== 'h1' || p.length !== 4) return false;
  return safeEq_(hashPassword_(pw, p[2], parseInt(p[1], 10)), stored);
}
function safeEq_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function secret_() { return PropertiesService.getScriptProperties().getProperty('SESSION_SECRET') || ''; }
function signToken_(payload) {
  ss_(); // garantisce che il setup (e il segreto) esistano
  var body = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  var sig = Utilities.base64EncodeWebSafe(hmac_(utf8_(body), utf8_(secret_())));
  return body + '.' + sig;
}
function verifyToken_(tok) {
  if (!tok || !secret_()) return null;
  var parts = String(tok).split('.');
  if (parts.length !== 2) return null;
  var sig = Utilities.base64EncodeWebSafe(hmac_(utf8_(parts[0]), utf8_(secret_())));
  if (!safeEq_(sig, parts[1])) return null;
  try {
    var p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    return p.x > Date.now() ? p : null;
  } catch (e) { return null; }
}
function passwordOk_(pw) { return typeof pw === 'string' && pw.length >= 10 && pw.length <= 200; }

function login_(b) {
  var email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
  var cache = CacheService.getScriptCache(), k = 'fail:' + email, fails = parseInt(cache.get(k) || '0', 10);
  if (fails >= CFG.maxTentativi) fail_(429, 'Troppi tentativi errati: riprova tra 10 minuti');
  var u = readAll_('Utenti').filter(function (x) { return x.email.toLowerCase() === email; })[0];
  var ok = u && u.attivo && checkPassword_(pw, u.password_hash);
  if (!ok) { cache.put(k, String(fails + 1), 600); Utilities.sleep(600); fail_(401, 'Email o password errate'); }
  cache.remove(k);
  var tok = signToken_({ e: u.email, n: u.nome || u.email, x: Date.now() + CFG.sessioneOre * 3600000 });
  return { token: tok, user: u.nome || u.email, email: u.email };
}

function cambiaPassword_(b, user) {
  if (!passwordOk_(b.nuova)) fail_(400, 'La nuova password deve avere almeno 10 caratteri');
  return withLock_(function () {
    var u = readAll_('Utenti').filter(function (x) { return x.email === user.e; })[0];
    if (!u || !checkPassword_(b.vecchia || '', u.password_hash)) { Utilities.sleep(600); fail_(401, 'Password attuale errata'); }
    u.password_hash = hashPassword_(b.nuova);
    updateRow_('Utenti', u._row, u);
    return { ok: true };
  });
}

// ═══════════════ CLIENTI ═══════════════
var CLI_COLS = ['azienda', 'referente', 'indirizzo', 'citta', 'piva_cf', 'email', 'telefono', 'note'];
function cliClean_(c) { var o = {}; CLI_COLS.forEach(function (k) { o[k] = String(c[k] == null ? '' : c[k]).trim(); }); return o; }

function rClienti_(m, q, body) {
  if (m === 'GET') return readAll_('Clienti').map(strip_);
  return withLock_(function () {
    if (m === 'DELETE') {
      var keep = readAll_('Clienti').filter(function (c) { return c.id !== q.id; });
      rewrite_('Clienti', keep); return { ok: true };
    }
    if (m !== 'POST') fail_(405, 'Metodo non consentito');
    if (Array.isArray(body)) {
      var rows = body.map(cliClean_).filter(function (c) { return c.azienda || c.referente; })
        .map(function (c) { c.id = Utilities.getUuid(); return c; });
      appendRows_('Clienti', rows); return { importati: rows.length };
    }
    var c = cliClean_(body || {});
    if (!c.azienda && !c.referente) fail_(400, 'Nome o ragione sociale obbligatorio');
    if (body.id) {
      var ex = readAll_('Clienti').filter(function (x) { return x.id === body.id; })[0];
      if (!ex) fail_(404, 'Cliente non trovato');
      c.id = ex.id; updateRow_('Clienti', ex._row, c); return c;
    }
    c.id = Utilities.getUuid(); appendRows_('Clienti', [c]); return c;
  });
}

// ═══════════════ PRODOTTI ═══════════════
function proClean_(p) {
  return { sku: String(p.sku || '').trim(), nome: String(p.nome || '').trim(), descrizione: String(p.descrizione || ''),
    prezzo: num_(p.prezzo), categoria: String(p.categoria || ''), foto_url: String(p.foto_url || ''),
    url_sito: String(p.url_sito || ''), attivo: true };
}
function rProdotti_(m, q, body) {
  if (m === 'GET') return readAll_('Prodotti').filter(function (p) { return p.attivo; }).map(function (p) { var o = strip_(p); delete o.attivo; return o; });
  return withLock_(function () {
    var all = readAll_('Prodotti');
    if (m === 'DELETE') { // disattiva: i preventivi storici restano coerenti
      var p = all.filter(function (x) { return x.sku === q.sku; })[0];
      if (p) { p.attivo = false; updateRow_('Prodotti', p._row, p); }
      return { ok: true };
    }
    if (m !== 'POST') fail_(405, 'Metodo non consentito');
    var rows = (Array.isArray(body) ? body : [body]).map(proClean_).filter(function (p) { return p.sku && p.nome; });
    if (!rows.length) fail_(400, 'SKU e nome obbligatori');
    var bySku = {}; all.forEach(function (p) { bySku[p.sku] = p; });
    var nuovi = [];
    rows.forEach(function (r) {
      var ex = bySku[r.sku];
      if (ex) updateRow_('Prodotti', ex._row, r); else nuovi.push(r);
    });
    appendRows_('Prodotti', nuovi);
    return { salvati: rows.length };
  });
}

// ═══════════════ DOCUMENTI (istruzioni / scheda CE per prodotto) ═══════════════
// Una riga per (sku, tipo). Spia: verde = tutto ok, giallo = da validare, rosso = manca (nessuna riga o senza documento).
var DOC_TIPI = ['istruzioni', 'ce'], DOC_STATI = ['verde', 'giallo', 'rosso'];
function rDocumenti_(m, q, body, user) {
  if (m === 'GET') return readAll_('Documenti').map(strip_);
  return withLock_(function () {
    var all = readAll_('Documenti'), key = function (o) { return o.sku + '|' + o.tipo; };
    if (m === 'DELETE') {
      rewrite_('Documenti', all.filter(function (d) { return key(d) !== q.sku + '|' + q.tipo; }).map(strip_)); return { ok: true };
    }
    if (m !== 'POST') fail_(405, 'Metodo non consentito');
    var by = {}; all.forEach(function (d) { by[key(d)] = d; });
    var now = new Date().toISOString(), nuovi = [], n = 0;
    (Array.isArray(body) ? body : [body]).forEach(function (r) {
      r = r || {};
      var sku = String(r.sku || '').trim(), tipo = String(r.tipo || '').trim();
      if (!sku || DOC_TIPI.indexOf(tipo) < 0) fail_(400, 'SKU e tipo (istruzioni/ce) obbligatori');
      var ex = by[sku + '|' + tipo], cur = ex ? strip_(ex) : { sku: sku, tipo: tipo, stato: 'rosso', lingue: '', origine: '', nota: '' };
      if (r.stato != null) { if (DOC_STATI.indexOf(r.stato) < 0) fail_(400, 'Stato non valido'); cur.stato = r.stato; }
      if (r.lingue != null) cur.lingue = typeof r.lingue === 'string' ? r.lingue : JSON.stringify(r.lingue);
      if (r.origine != null) cur.origine = String(r.origine);
      if (r.nota != null) cur.nota = String(r.nota);
      if (cur.stato !== 'rosso' && !cur.lingue && !cur.origine) fail_(400, 'Senza documento la spia può essere solo rossa (' + sku + ')');
      cur.aggiornato_il = now; cur.aggiornato_da = user.n;
      if (ex) updateRow_('Documenti', ex._row, cur); else { nuovi.push(cur); by[sku + '|' + tipo] = cur; }
      n++;
    });
    appendRows_('Documenti', nuovi);
    return { salvati: n };
  });
}

// File dei documenti (istruzioni / schede CE): cartella Drive PRIVATA; il download passa dal backend e richiede il login della consolle.
function cartellaDoc_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('DRIVE_FOLDER_DOC');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* cancellata: la ricreo */ } }
  var it = DriveApp.getFoldersByName(CFG.cartellaDocumenti);
  var f = it.hasNext() ? it.next() : DriveApp.createFolder(CFG.cartellaDocumenti);
  p.setProperty('DRIVE_FOLDER_DOC', f.getId());
  return f;
}
var DOC_MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
function docCarica_(b, user) {
  var nome = String(b.nome || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim(), ext = (/\.(pdf|docx)$/i.exec(nome) || [])[1];
  if (!nome || !ext) fail_(400, 'Nome file non valido (solo .pdf o .docx)');
  if (!b.base64 || b.base64.length > 14000000) fail_(400, 'File mancante o troppo grande');
  var f = cartellaDoc_(), it = f.getFilesByName(nome);
  while (it.hasNext()) it.next().setTrashed(true); // stesso nome = nuova versione
  var file = f.createFile(Utilities.newBlob(Utilities.base64Decode(b.base64), DOC_MIME[ext.toLowerCase()], nome));
  return { id: file.getId(), nome: nome };
}
function docScarica_(id) {
  id = String(id || '');
  if (!/^[A-Za-z0-9_\-]{5,80}$/.test(id)) fail_(400, 'Documento non valido');
  var file; try { file = DriveApp.getFileById(id); } catch (e) { fail_(404, 'Documento non trovato'); }
  var dentro = false, ps = file.getParents(), fid = cartellaDoc_().getId();
  while (ps.hasNext()) if (ps.next().getId() === fid) dentro = true;
  if (!dentro) fail_(403, 'Documento non consentito'); // solo i file della cartella dei documenti
  var blob = file.getBlob(), bytes = blob.getBytes();
  if (bytes.length > 22000000) fail_(413, 'Documento troppo grande');
  return { nome: file.getName(), mime: blob.getContentType(), base64: Utilities.base64Encode(bytes) };
}

// ═══════════════ PREVENTIVI ═══════════════
function log_(id, utente, evento, dettaglio) {
  appendRows_('Storico', [{ preventivo_id: id, quando: new Date().toISOString(), utente: utente, evento: evento, dettaglio: JSON.stringify(dettaglio || {}) }]);
}
function nextNumero_() {
  var anno = new Date().getFullYear(), cfg = readAll_('Config'), key = 'contatore_' + anno;
  var r = cfg.filter(function (c) { return c.chiave === key; })[0], n = r ? parseInt(r.valore, 10) + 1 : 1;
  if (r) updateRow_('Config', r._row, { chiave: key, valore: n }); else appendRows_('Config', [{ chiave: key, valore: n }]);
  return 'PREV-' + anno + '-' + ('000' + n).slice(-3);
}
function listaPrev_(o) {
  return { id: o.id, numero: o.numero, data: o.data, stato: o.stato, cli_azienda: o.cli_azienda, cli_referente: o.cli_referente,
    cli_email: o.cli_email, totale: o.totale, inviato_il: o.inviato_il, updated_at: o.updated_at, created_by: o.created_by, pdf_url: o.pdf_url };
}
function findPrev_(id) {
  var p = readAll_('Preventivi').filter(function (x) { return x.id === id; })[0];
  if (!p) fail_(404, 'Preventivo non trovato');
  return p;
}

function rPreventivi_(m, q, body, user) {
  var u = user.n;
  if (m === 'GET') {
    if (!q.id) {
      return readAll_('Preventivi').map(listaPrev_).sort(function (a, b) {
        return a.data < b.data ? 1 : a.data > b.data ? -1 : (a.updated_at < b.updated_at ? 1 : -1);
      });
    }
    var p = strip_(findPrev_(q.id));
    p.righe = readAll_('Righe').filter(function (r) { return r.preventivo_id === q.id; })
      .sort(function (a, b) { return a.posizione - b.posizione; }).map(strip_);
    p.storico = readAll_('Storico').filter(function (s) { return s.preventivo_id === q.id; })
      .sort(function (a, b) { return a.quando < b.quando ? 1 : -1; })
      .map(function (s) { var o = strip_(s); try { o.dettaglio = JSON.parse(s.dettaglio || '{}'); } catch (e) { o.dettaglio = {}; } return o; });
    return p;
  }
  return withLock_(function () {
    var now = new Date().toISOString();
    if (m === 'POST') {
      var pv = (body && body.preventivo) || {}, righe = (body && body.righe) || [], rec, evento, dett;
      if (pv.id) {
        var old = findPrev_(pv.id);
        rec = strip_(old); evento = 'modificato';
        dett = { totale_prima: old.totale, totale_dopo: num_(pv.totale), stato_prima: old.stato };
      } else {
        rec = { id: Utilities.getUuid(), numero: nextNumero_(), created_by: u, created_at: now, stato: 'bozza' };
        evento = 'creato'; dett = { totale: num_(pv.totale) };
      }
      HEAD.forEach(function (k) { if (pv[k] !== undefined) rec[k] = pv[k] === null ? '' : pv[k]; });
      rec.stato = STATI.indexOf(pv.stato) >= 0 ? pv.stato : rec.stato || 'bozza';
      rec.updated_at = now;
      if (pv.id) updateRow_('Preventivi', findPrev_(pv.id)._row, rec); else appendRows_('Preventivi', [rec]);
      var altre = readAll_('Righe').filter(function (r) { return r.preventivo_id !== rec.id; }).map(strip_);
      var nuove = righe.map(function (r, i) {
        return { preventivo_id: rec.id, posizione: i, sku: r.sku || '', descrizione: r.descrizione || '', quantita: num_(r.quantita),
          prezzo_unit: num_(r.prezzo_unit), sconto_pct: num_(r.sconto_pct), iva_pct: num_(r.iva_pct), nota: r.nota || '', foto_url: r.foto_url || '' };
      });
      rewrite_('Righe', altre.concat(nuove));
      dett.righe = righe.length;
      log_(rec.id, u, evento, dett);
      return { id: rec.id, numero: rec.numero };
    }
    if (m === 'PATCH') {
      var stato = body && body.stato;
      if (!q.id || STATI.indexOf(stato) < 0) fail_(400, 'Stato non valido');
      var cur = findPrev_(q.id), rr = strip_(cur), prima = cur.stato;
      rr.stato = stato;
      if (stato === 'inviato' && !cur.inviato_il) rr.inviato_il = now;
      rr.chiuso_il = (stato === 'accettato' || stato === 'perso') ? now : '';
      rr.updated_at = now;
      updateRow_('Preventivi', cur._row, rr);
      log_(q.id, u, 'stato', { da: prima, a: stato });
      return { ok: true };
    }
    if (m === 'DELETE') {
      findPrev_(q.id);
      rewrite_('Preventivi', readAll_('Preventivi').filter(function (p) { return p.id !== q.id; }).map(strip_));
      rewrite_('Righe', readAll_('Righe').filter(function (r) { return r.preventivo_id !== q.id; }).map(strip_));
      rewrite_('Storico', readAll_('Storico').filter(function (s) { return s.preventivo_id !== q.id; }).map(strip_));
      return { ok: true };
    }
    fail_(405, 'Metodo non consentito');
  });
}

function kpi_() {
  var data = readAll_('Preventivi'), mese = new Date().toISOString().slice(0, 7);
  var sum = function (a) { return a.reduce(function (s, p) { return s + p.totale; }, 0); };
  var del = data.filter(function (p) { return p.data.indexOf(mese) === 0; });
  var acc = data.filter(function (p) { return p.stato === 'accettato'; }), per = data.filter(function (p) { return p.stato === 'perso'; });
  var byStato = {};
  STATI.forEach(function (s) { var a = data.filter(function (p) { return p.stato === s; }); byStato[s] = { n: a.length, totale: sum(a) }; });
  var mesi = {};
  data.forEach(function (p) { var k = p.data.slice(0, 7); if (!mesi[k]) mesi[k] = { mese: k, n: 0, totale: 0 }; mesi[k].n++; mesi[k].totale += p.totale; });
  return {
    mese: mese, n_mese: del.length, totale_mese: sum(del),
    tasso_conversione: acc.length + per.length ? Math.round(1000 * acc.length / (acc.length + per.length)) / 10 : null,
    accettati_mese: del.filter(function (p) { return p.stato === 'accettato'; }).length,
    in_attesa: byStato.inviato, byStato: byStato,
    ultimi_mesi: Object.keys(mesi).map(function (k) { return mesi[k]; }).sort(function (a, b) { return a.mese < b.mese ? 1 : -1; }).slice(0, 6)
  };
}

// ═══════════════ IMMAGINI, DRIVE, EMAIL ═══════════════
function img_(u) { // il bucket S3 non invia header CORS: la foto passa da qui, come data URL
  var url = String(u || '');
  if (url.indexOf('https://' + FOTO_HOST + '/') !== 0 && url.indexOf('https://' + FOTO_HOST2 + '/') !== 0) fail_(400, 'Host non consentito');
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) fail_(502, 'Foto non disponibile');
  var blob = r.getBlob(), bytes = blob.getBytes();
  if (bytes.length > 4000000) fail_(413, 'Foto troppo grande');
  return { dataUrl: 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(bytes) };
}

// ═══════════════ SCHEDA TECNICA DAL SITO ═══════════════
// Legge dalla pagina prodotto di gettoniere-shop.it (testi scritti da voi): dimensioni, peso, caratteristiche. Niente è inventato.
var SITO = 'https://www.gettoniere-shop.it';
function sitoGet_(path) {
  var r = UrlFetchApp.fetch(SITO + path, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0 (Consolle Preventivi)' } });
  if (r.getResponseCode() !== 200) fail_(502, 'Il sito non risponde (' + r.getResponseCode() + ')');
  return r.getContentText();
}
function pulisci_(h) {
  return String(h || '').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&euro;/g, '€').replace(/&times;/g, '×').replace(/&ndash;/g, '–').replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); })
    .replace(/[\u{1F000}-\u{1FFFF}\u{2190}-\u{27BF}\uFE0F\u200D]/gu, '') // emoji e simboli: il PDF non li sa disegnare
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, '').replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ') // spazi invisibili del sito: nel PDF diventerebbero lettere spaziate
    .replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
}
function scheda_(sku) {
  sku = String(sku || '').trim();
  if (!/^[A-Za-z0-9_.\-]{2,40}$/.test(sku)) fail_(400, 'Codice non valido');
  var cache = CacheService.getScriptCache(), ck = 'scheda6_' + sku, hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  var res = { trovato: false }, nome = '', foto = '';
  var s = sitoGet_('/search?q=' + encodeURIComponent(sku)), parts = s.split('{"name_1":'), path = '', prezzo = 0;
  for (var i = 1; i < parts.length && !path; i++) {
    if (parts[i].indexOf('u003cem\\u003e' + sku + '\\u003c/em') < 0 && parts[i].indexOf('"code":"' + sku + '"') < 0) continue;
    var mm = /"permalink_path_1":"([^"]+)"/.exec(parts[i]), pm = /"price":"([0-9.]+)"/.exec(parts[i]);
    if (mm) {
      path = mm[1]; prezzo = pm ? parseFloat(pm[1]) : 0;
      var nm = /^"((?:[^"\\]|\\.)*)"/.exec(parts[i]), fm = /"featured_image_url_list":"([^"]+)"/.exec(parts[i]);
      try { nome = nm ? pulisci_(JSON.parse('"' + nm[1] + '"')) : ''; } catch (e) { nome = ''; }
      foto = fm ? fm[1].replace('/list-', '/large-') : '';
    }
  }
  if (path && /^\/it\/[a-z0-9\-\/]+$/i.test(path)) {
    var html = sitoGet_(path), k = html.indexOf('class="product-details"');
    if (k >= 0) {
      var blk = html.substr(k, 40000), j = blk.indexOf('</div>'); if (j > 0) blk = blk.substr(0, j);
      res = parseScheda_(blk); res.url = SITO + path; res.prezzo_sito = prezzo; res.nome_sito = nome; res.foto_sito = /^https:\/\/(files\.scontrino\.com|ss-pics\.s3\.eu-west-1\.amazonaws\.com)\//.test(foto) ? foto : ''; res.trovato = res.sezioni.length > 0 || !!res.intro;
    }
  }
  if (res.trovato) cache.put(ck, JSON.stringify(res), 21600);
  return res;
}
// Aggiorna/aggiunge prodotti leggendo il catalogo del sito per codice (ricerca del sito: nome, prezzo, categoria, foto, indirizzo).
function sitoAggiorna_(body) {
  var codici = (body && body.codici || []).map(function (c) { return String(c).trim().toUpperCase(); }).filter(function (c) { return /^[A-Z0-9_.\-]{2,40}$/.test(c); });
  if (!codici.length || codici.length > 30) fail_(400, 'Indica da 1 a 30 codici');
  return withLock_(function () {
    var all = readAll_('Prodotti'), bySku = {}; all.forEach(function (p) { bySku[p.sku] = p; });
    var nuovi = [], res = { aggiunti: [], aggiornati: [], nonTrovati: [] };
    codici.forEach(function (sku) {
      var parts = sitoGet_('/search?q=' + encodeURIComponent(sku)).split('{"name_1":'), hit = null;
      for (var i = 1; i < parts.length && !hit; i++) {
        var cm = /"code":\{"value":"((?:[^"\\]|\\.)*)"/.exec(parts[i]);
        if (cm && cm[1].replace(/\\u003c\/?em\\u003e/g, '').toUpperCase() === sku) hit = parts[i];
      }
      if (!hit) { res.nonTrovati.push(sku); return; }
      var nm = /^"((?:[^"\\]|\\.)*)"/.exec(hit), pm = /"price":"([0-9.]+)"/.exec(hit), fm = /"featured_image_url_list":"([^"]+)"/.exec(hit),
        lm = /"permalink_path_1":"([^"]+)"/.exec(hit), cat = /"categories_1":\{"lvl0":"((?:[^"\\]|\\.)*)"/.exec(hit), nome = '', categoria = '';
      try { nome = nm ? pulisci_(JSON.parse('"' + nm[1] + '"')) : ''; categoria = cat ? pulisci_(JSON.parse('"' + cat[1] + '"')) : ''; } catch (e) { /* resta vuoto */ }
      var ex = bySku[sku], r = proClean_({ sku: sku, nome: nome || (ex && ex.nome) || sku, descrizione: ex ? ex.descrizione : '', prezzo: pm ? parseFloat(pm[1]) : (ex ? ex.prezzo : 0),
        categoria: categoria || (ex ? ex.categoria : ''), foto_url: fm ? fm[1] : (ex ? ex.foto_url : ''), url_sito: lm ? SITO + lm[1] : (ex ? ex.url_sito : '') });
      if (ex) { updateRow_('Prodotti', ex._row, r); res.aggiornati.push(sku); } else { nuovi.push(r); res.aggiunti.push(sku); }
    });
    appendRows_('Prodotti', nuovi);
    return res;
  });
}
function parseScheda_(blk) {
  var out = { titolo: '', sottotitolo: '', intro: '', sezioni: [] }, sez = null, depth = 0, mode = null, buf = '', paras = [];
  var toks = blk.split(/(<\/?(?:h2|h3|h4|p|ul|li)\b[^>]*>)/i);
  function chiudiIntro() { if (paras.length) { var t = '', k; for (k = 0; k < paras.length && (t + paras[k]).length < 1000; k++) t += (t ? ' ' : '') + paras[k]; out.intro = t || paras[0]; paras = []; } }
  function handle() {
    var t = pulisci_(buf);
    if (mode && t) {
      if (mode === 'h2') out.titolo = t;
      else if (mode === 'h3') {
        if (!sez && !out.titolo && !paras.length) out.titolo = t; // titolo principale della pagina
        else { chiudiIntro(); sez = { titolo: t, voci: [] }; out.sezioni.push(sez); }
      }
      else if (mode === 'h4') { if (sez) sez.voci.push({ l: '', t: t, d: 1, h: 1 }); else if (!out.sottotitolo) out.sottotitolo = t; }
      else if (mode === 'p') {
        var pallino = /^[·•▪●◦]\s*/.test(t); if (pallino) t = t.replace(/^[·•▪●◦]\s*/, ''); // elenco incollato da Word: il pallino è testo
        if (!t || /declina ogni responsabilit|^prima di ordinare|^nota\.?$|^per informazioni addizionali/i.test(t)) { /* avvisi e rimandi del sito: non vanno in brochure */ }
        else if (/^descrizione del prodotto:?$/i.test(t)) { chiudiIntro(); if (!sez) { sez = { titolo: 'Caratteristiche', voci: [] }; out.sezioni.push(sez); } }
        else if (pallino) {
          chiudiIntro(); if (!sez) { sez = { titolo: 'Caratteristiche', voci: [] }; out.sezioni.push(sez); }
          var lm = /^([^:\d][^:]{1,39}?)\s*:\s*(\S[\s\S]*)$/.exec(t);
          sez.voci.push(lm && t.length < 500 ? { l: lm[1], t: lm[2], d: 1 } : { l: '', t: t, d: 1 });
        }
        else if (!sez) paras.push(t); else sez.voci.push({ l: '', t: t, d: 1 });
      }
      else if (mode === 'li' && sez) {
        // etichetta solo se il grassetto è a inizio voce e seguito da punto/due punti ("Dimensioni. 350 × ...")
        var m = /^\s*<strong[^>]*>([\s\S]*?)<\/strong>\s*([.:])/i.exec(buf), l = '', rest = buf;
        if (m) { l = pulisci_(m[1]).replace(/[.:\s]+$/, ''); rest = buf.substr(m[0].length); }
        sez.voci.push({ l: l, t: pulisci_(rest).replace(/^[\s.:]+/, ''), d: depth });
      }
    }
    buf = '';
  }
  for (var i = 0; i < toks.length; i++) {
    var tk = toks[i], tm = /^<(\/?)(h2|h3|h4|p|ul|li)\b/i.exec(tk);
    if (!tm) { if (mode) buf += tk; continue; }
    var close = tm[1] === '/', tag = tm[2].toLowerCase();
    if (tag === 'ul') { handle(); mode = null; depth += close ? -1 : 1; continue; }
    if (close) { handle(); mode = null; } else { handle(); mode = tag; }
  }
  handle();
  if (!out.sezioni.length && paras.length > 1) { // pagina fatta di soli paragrafi: "Etichetta: testo" diventa elenco caratteristiche
    var re = /^([^:\d][^:]{1,39}?)\s*:\s*(\S[\s\S]*)$/, first = -1, k;
    for (k = 0; k < paras.length && first < 0; k++) if (re.test(paras[k]) && paras[k].length < 500) first = k;
    for (k = 1; k < paras.length && first < 0; k++) if (paras[k].length < 140 || /^\d+[.)]\s/.test(paras[k])) first = k; // niente etichette: da qui in poi elenco puntato
    if (first >= 0) {
      var voci = [];
      for (k = first; k < paras.length; k++) {
        var mm = re.exec(paras[k]);
        voci.push(mm && paras[k].length < 500 ? { l: mm[1], t: mm[2], d: 1 } : { l: '', t: paras[k], d: 1 });
      }
      paras = paras.slice(0, first);
      out.sezioni.push({ titolo: 'Caratteristiche', voci: voci });
    }
  }
  chiudiIntro();
  out.sezioni = out.sezioni.filter(function (s) { return s.voci.length; });
  return out;
}

function cartella_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('DRIVE_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* cartella cancellata: la ricreo */ } }
  var it = DriveApp.getFoldersByName(CFG.cartellaDrive);
  var f = it.hasNext() ? it.next() : DriveApp.createFolder(CFG.cartellaDrive);
  p.setProperty('DRIVE_FOLDER', f.getId());
  return f;
}
function pdfBlob_(b64, nome) {
  if (!b64 || b64.length > 14000000) fail_(400, 'PDF mancante o troppo grande');
  var fn = String(nome || 'Preventivo.pdf').replace(/[\\/:*?"<>|]+/g, '_');
  return Utilities.newBlob(Utilities.base64Decode(b64), 'application/pdf', fn);
}
function salvaDrive_(blob) {
  var f = cartella_(), it = f.getFilesByName(blob.getName());
  while (it.hasNext()) it.next().setTrashed(true); // tengo solo l'ultima versione con lo stesso nome
  return f.createFile(blob).getUrl();
}

function archiviaPdf_(b, user) {
  var blob = pdfBlob_(b.pdf_base64, b.filename), url = salvaDrive_(blob);
  if (b.id) withLock_(function () { var p = findPrev_(b.id), r = strip_(p); r.pdf_url = url; updateRow_('Preventivi', p._row, r); });
  return { url: url };
}

function inviaEmail_(b, user) {
  var to = String(b.to || '').trim();
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) fail_(400, 'Indirizzo email non valido');
  if (MailApp.getRemainingDailyQuota() < 1) fail_(429, 'Limite giornaliero di email raggiunto: riprova domani');
  var p = findPrev_(b.id), blob = pdfBlob_(b.pdf_base64, b.filename || ('Preventivo_' + p.numero + '.pdf'));
  MailApp.sendEmail(to, b.subject || ('Preventivo ' + p.numero + ' – Gettoniere-Shop'), String(b.body || ''),
    { name: CFG.mittente, replyTo: CFG.replyTo, attachments: [blob] });
  var url = ''; try { url = salvaDrive_(blob); } catch (e) { console.error('Drive: ' + e); }
  return withLock_(function () {
    var cur = findPrev_(b.id), r = strip_(cur), now = new Date().toISOString();
    if (cur.stato === 'bozza') r.stato = 'inviato';
    if (!cur.inviato_il) r.inviato_il = now;
    if (url) r.pdf_url = url;
    r.updated_at = now;
    updateRow_('Preventivi', cur._row, r);
    log_(b.id, user.n, 'email', { a: to });
    return { ok: true, stato: r.stato, pdf_url: url };
  });
}

// ═══════════════ FUNZIONE DI SERVIZIO (solo da editor) ═══════════════
// Se dimentichi la password: dall'editor Apps Script esegui reimpostaPassword('email@...', 'NuovaPassword2026').
function reimpostaPassword(email, nuova) {
  if (!passwordOk_(nuova)) throw new Error('Password troppo corta (min. 10 caratteri)');
  var u = readAll_('Utenti').filter(function (x) { return x.email === String(email).trim().toLowerCase(); })[0];
  if (!u) throw new Error('Utente non trovato');
  u.password_hash = hashPassword_(nuova); u.attivo = true;
  updateRow_('Utenti', u._row, u);
  return 'Password reimpostata per ' + u.email;
}
