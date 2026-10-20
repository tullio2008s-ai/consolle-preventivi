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
  Config: ['chiave', 'valore']
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
var FOTO_HOST = 'ss-pics.s3.eu-west-1.amazonaws.com';

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
    case 'preventivi': return rPreventivi_(m, q, body, user);
    case 'kpi': return kpi_();
    case 'img': return img_(q.u);
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
function sh_(name) { return ss_().getSheetByName(name); }

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
  var s = (ssOpt || ss_()).getSheetByName(name), cols = SCHEMA[name], start = s.getLastRow() + 1;
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
  if (url.indexOf('https://' + FOTO_HOST + '/') !== 0) fail_(400, 'Host non consentito');
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) fail_(502, 'Foto non disponibile');
  var blob = r.getBlob(), bytes = blob.getBytes();
  if (bytes.length > 4000000) fail_(413, 'Foto troppo grande');
  return { dataUrl: 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(bytes) };
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
