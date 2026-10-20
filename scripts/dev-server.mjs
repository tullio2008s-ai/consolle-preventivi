// Server locale di PROVA: stessi endpoint di /api ma con dati in memoria (nessun Supabase).
// Avvio: node scripts/dev-server.mjs  → http://localhost:3000  (i dati si perdono al riavvio)
import http from 'node:http';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, checkPassword, passwordOk, sign, verify } from '../api/_auth.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const rd = f => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'));
const prodotti = rd('prodotti.json').map(p => ({ sku: p.sku, nome: p.name, descrizione: p.desc || '', prezzo: p.price, categoria: p.cat, foto_url: p.foto, url_sito: '', attivo: true }));
let clienti = rd('clienti.json').map(c => ({ id: randomUUID(), azienda: c.company, referente: c.name, indirizzo: c.address, citta: c.city, piva_cf: c.vat, email: c.email, telefono: c.phone, note: '' }));
let preventivi = [], righe = [], storico = [], contatore = 0, utenti = [];
const AUTH = !!process.env.INIT_EMAIL; // senza INIT_EMAIL il server di prova resta aperto
// Persistenza locale: i dati modificati si salvano in data/local-db.json (fuori da GitHub)
const DB = join(root, 'data', 'local-db.json');
if (existsSync(DB)) { const d = JSON.parse(readFileSync(DB, 'utf8')); prodotti.splice(0, prodotti.length, ...d.prodotti); clienti = d.clienti; preventivi = d.preventivi; righe = d.righe; storico = d.storico; contatore = d.contatore; utenti = d.utenti || []; }
const persist = () => writeFileSync(DB, JSON.stringify({ prodotti, clienti, preventivi, righe, storico, contatore, utenti }));
if (AUTH && !utenti.some(u => u.email === process.env.INIT_EMAIL.toLowerCase()) && passwordOk(process.env.INIT_PASSWORD)) {
  utenti.push({ email: process.env.INIT_EMAIL.trim().toLowerCase(), nome: process.env.INIT_NOME || 'Commerciale', password_hash: hashPassword(process.env.INIT_PASSWORD) }); persist();
}
const cookieOf = req => /(?:^|;\s*)sess=([^;]+)/.exec(req.headers.cookie || '')?.[1];
const num = v => Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0;
const log = (id, evento, dettaglio) => storico.push({ id: storico.length + 1, preventivo_id: id, quando: new Date().toISOString(), utente: 'Tullio', evento, dettaglio });

function route(m, path, q, body, user, setCookie) {
  if (path === 'login') {
    if (m === 'GET') return user ? { user: user.name, email: user.email, auth_attiva: AUTH } : { error: 'Non autenticato', _status: 401 };
    if (m === 'DELETE') { setCookie('sess=; Path=/; Max-Age=0'); return { ok: true }; }
    const u = utenti.find(x => x.email === String(body.email || '').trim().toLowerCase());
    if (!u || !checkPassword(body.password || '', u.password_hash)) return { error: 'Email o password errate', _status: 401 };
    setCookie(`sess=${sign({ name: u.nome || u.email, email: u.email, exp: Date.now() + 12 * 3600e3 })}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);
    return { user: u.nome || u.email, email: u.email, auth_attiva: true };
  }
  if (!user) return { error: 'Non autorizzato', _status: 401 };
  if (path === 'password') {
    const u = utenti.find(x => x.email === user.email);
    if (!passwordOk(body.nuova)) return { error: 'La nuova password deve avere almeno 10 caratteri', _status: 400 };
    if (!u || !checkPassword(body.vecchia || '', u.password_hash)) return { error: 'Password attuale errata', _status: 401 };
    u.password_hash = hashPassword(body.nuova); return { ok: true };
  }
  if (path === 'prodotti') {
    if (m === 'GET') return prodotti.filter(p => p.attivo);
    if (m === 'DELETE') { prodotti.find(p => p.sku === q.sku).attivo = false; return { ok: true }; }
    const rows = Array.isArray(body) ? body : [body];
    rows.forEach(r => { const i = prodotti.findIndex(p => p.sku === r.sku); if (i >= 0) Object.assign(prodotti[i], r, { attivo: true }); else prodotti.push({ ...r, attivo: true }); });
    return { salvati: rows.length };
  }
  if (path === 'clienti') {
    if (m === 'GET') return clienti;
    if (m === 'DELETE') { clienti = clienti.filter(c => c.id !== q.id); return { ok: true }; }
    if (Array.isArray(body)) { body.forEach(c => clienti.push({ id: randomUUID(), ...c })); return { importati: body.length }; }
    const i = clienti.findIndex(c => c.id === body.id);
    if (i >= 0) { Object.assign(clienti[i], body); return clienti[i]; }
    const c = { ...body, id: randomUUID() }; clienti.push(c); return c;
  }
  if (path === 'preventivi') {
    if (m === 'GET' && !q.id) return [...preventivi].sort((a, b) => b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at));
    if (m === 'GET') { const p = preventivi.find(x => x.id === q.id); return { ...p, righe: righe.filter(r => r.preventivo_id === p.id).sort((a, b) => a.posizione - b.posizione), storico: storico.filter(s => s.preventivo_id === p.id).reverse() }; }
    if (m === 'POST') {
      const { preventivo: pv, righe: rr = [] } = body; let p = pv.id && preventivi.find(x => x.id === pv.id), ev = 'modificato', det;
      if (p) { det = { totale_prima: p.totale, totale_dopo: pv.totale, righe: rr.length }; Object.assign(p, pv); }
      else { p = { ...pv, id: randomUUID(), numero: `PREV-${new Date().getFullYear()}-${String(++contatore).padStart(3, '0')}`, created_at: new Date().toISOString() }; preventivi.push(p); ev = 'creato'; det = { totale: pv.totale, righe: rr.length }; }
      righe = righe.filter(r => r.preventivo_id !== p.id).concat(rr.map((r, i) => ({ ...r, preventivo_id: p.id, posizione: i })));
      log(p.id, ev, det); return { id: p.id, numero: p.numero };
    }
    if (m === 'PATCH') { const p = preventivi.find(x => x.id === q.id); log(p.id, 'stato', { da: p.stato, a: body.stato }); p.stato = body.stato; return { ok: true }; }
    if (m === 'DELETE') { preventivi = preventivi.filter(x => x.id !== q.id); return { ok: true }; }
  }
  if (path === 'kpi') {
    const mese = new Date().toISOString().slice(0, 7), sum = a => a.reduce((s, p) => s + num(p.totale), 0);
    const del = preventivi.filter(p => p.data.startsWith(mese)), acc = preventivi.filter(p => p.stato === 'accettato'), per = preventivi.filter(p => p.stato === 'perso');
    const byStato = Object.fromEntries(['bozza', 'inviato', 'accettato', 'perso'].map(s => [s, { n: preventivi.filter(p => p.stato === s).length, totale: sum(preventivi.filter(p => p.stato === s)) }]));
    const mesi = {}; preventivi.forEach(p => { const k = p.data.slice(0, 7); (mesi[k] ||= { mese: k, n: 0, totale: 0 }); mesi[k].n++; mesi[k].totale += num(p.totale); });
    return { mese, n_mese: del.length, totale_mese: sum(del), tasso_conversione: acc.length + per.length ? Math.round(1000 * acc.length / (acc.length + per.length)) / 10 : null, accettati_mese: del.filter(p => p.stato === 'accettato').length, in_attesa: byStato.inviato, byStato, ultimi_mesi: Object.values(mesi).sort((a, b) => b.mese.localeCompare(a.mese)).slice(0, 6) };
  }
  if (path === 'invia-email') return { error: 'Invio email non disponibile nel server di prova', _status: 501 };
  return { error: 'Not found', _status: 404 };
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), q = Object.fromEntries(u.searchParams);
  if (u.pathname.startsWith('/api/')) {
    if (u.pathname === '/api/img') {
      if (AUTH && !verify(cookieOf(req))) { res.writeHead(401); return res.end(); }
      try { const r = await fetch(q.u); res.writeHead(200, { 'Content-Type': r.headers.get('content-type') }); return res.end(Buffer.from(await r.arrayBuffer())); } catch { res.writeHead(502); return res.end(); }
    }
    let raw = ''; for await (const c of req) raw += c;
    const user = AUTH ? verify(cookieOf(req)) : { name: 'Tullio', email: '' }; let cookie;
    let out; try { out = route(req.method, u.pathname.slice(5), q, raw ? JSON.parse(raw) : undefined, user, c => cookie = c); if (req.method !== 'GET') persist(); } catch (e) { out = { error: e.message, _status: 500 }; }
    res.writeHead(out?._status || 200, { 'Content-Type': 'application/json', ...(cookie ? { 'Set-Cookie': cookie } : {}) }); return res.end(JSON.stringify(out));
  }
  const f = join(root, 'public', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!f.startsWith(join(root, 'public')) || !existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
}).listen(3000, () => console.log('Prova su http://localhost:3000'));
