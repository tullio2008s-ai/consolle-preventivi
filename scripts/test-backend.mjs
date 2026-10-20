// Collaudo del backend (Code.gs) con la simulazione dei servizi Google. Uso: node scripts/test-backend.mjs
import { createBackend } from './gas-mock.mjs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const dir = fileURLToPath(new URL('../apps-script/', import.meta.url));
const PW = 'ProvaPassword-2026';
const be = createBackend({ codeFiles: [join(dir, 'Code.gs')] });
// utente di prova (non quello vero): hash con la stessa funzione del backend
be.ctx.ADMIN_SEED = { email: 'prova@example.com', nome: 'Prova', hash: be.ctx.hashPassword_(PW) };
let ok = 0; const t = (nome, fn) => { try { fn(); ok++; console.log('OK   ' + nome); } catch (e) { console.log('FAIL ' + nome + '\n     ' + e.message); process.exitCode = 1; } };
const call = (path, o = {}, token) => be.call({ path, method: o.method || 'GET', query: o.query || {}, body: o.body, token });

let r = call('login', { method: 'POST', body: { email: 'prova@example.com', password: PW } });
t('login corretto', () => { assert.ok(r.data.token); assert.equal(r.data.user, 'Prova'); });
const tok = r.data.token;
t('login password errata -> 401', () => assert.equal(call('login', { method: 'POST', body: { email: 'prova@example.com', password: 'x' } }).status, 401));
t('email maiuscola accettata', () => assert.ok(call('login', { method: 'POST', body: { email: 'PROVA@Example.com', password: PW } }).data));
t('senza token -> 401', () => assert.equal(call('clienti').status, 401));
t('token manomesso -> 401', () => assert.equal(call('clienti', {}, tok.slice(0, -3) + 'abc').status, 401));
t('sessione valida', () => assert.equal(call('login', {}, tok).data.email, 'prova@example.com'));

// blocco dopo troppi tentativi
for (let i = 0; i < 5; i++) call('login', { method: 'POST', body: { email: 'blocco@example.com', password: 'x' } });
t('blocco dopo 5 tentativi -> 429', () => assert.equal(call('login', { method: 'POST', body: { email: 'blocco@example.com', password: 'x' } }).status, 429));

// clienti
t('importa clienti', () => assert.equal(call('clienti', { method: 'POST', body: [{ azienda: 'ACME srl', email: 'a@acme.it', piva_cf: '01234567890', telefono: '0123' }, { azienda: 'Beta', referente: 'Mario' }, { azienda: '' }] }, tok).data.importati, 2));
let cli = call('clienti', {}, tok).data;
t('lista clienti (zeri iniziali conservati)', () => { assert.equal(cli.length, 2); assert.equal(cli.find(c => c.azienda === 'ACME srl').piva_cf, '01234567890'); });
t('modifica cliente', () => { const c = call('clienti', { method: 'POST', body: { id: cli[0].id, azienda: 'ACME SPA' } }, tok).data; assert.equal(c.azienda, 'ACME SPA'); assert.equal(call('clienti', {}, tok).data.length, 2); });
t('elimina cliente', () => { call('clienti', { method: 'DELETE', query: { id: cli[1].id } }, tok); assert.equal(call('clienti', {}, tok).data.length, 1); });

// prodotti
t('importa prodotti', () => assert.equal(call('prodotti', { method: 'POST', body: [{ sku: 'P1', nome: 'Gettoniera', prezzo: '341,6' }, { sku: 'P2', nome: 'Timer', prezzo: 10 }] }, tok).data.salvati, 2));
t('upsert prodotto per SKU', () => { call('prodotti', { method: 'POST', body: { sku: 'P1', nome: 'Gettoniera 2', prezzo: 400 } }, tok); const p = call('prodotti', {}, tok).data; assert.equal(p.length, 2); assert.equal(p.find(x => x.sku === 'P1').prezzo, 400); });
t('rimuovi prodotto (disattiva)', () => { call('prodotti', { method: 'DELETE', query: { sku: 'P2' } }, tok); assert.equal(call('prodotti', {}, tok).data.length, 1); });

// preventivi
const pv = { data: '2026-10-20', stato: 'bozza', cli_azienda: 'ACME SPA', cli_email: 'a@acme.it', pagamento: 'Bonifico', validita: '30 giorni', trasp_costo: 10, imponibile: 100, iva: 22, totale: 122 };
const righe = [{ sku: 'P1', descrizione: 'Gettoniera', quantita: 2, prezzo_unit: 45, sconto_pct: 0, iva_pct: '22', nota: 'grigio' }, { sku: 'P3', descrizione: 'Altro', quantita: 1, prezzo_unit: 10, sconto_pct: 5, iva_pct: '22' }];
r = call('preventivi', { method: 'POST', body: { preventivo: pv, righe } }, tok);
const anno = new Date().getFullYear();
t('crea preventivo con numero progressivo', () => assert.equal(r.data.numero, `PREV-${anno}-001`));
const pid = r.data.id;
t('secondo preventivo -> 002', () => assert.equal(call('preventivi', { method: 'POST', body: { preventivo: { ...pv, data: '2026-09-01', totale: 500 }, righe: [] } }, tok).data.numero, `PREV-${anno}-002`));
t('lettura preventivo con righe e storico', () => { const p = call('preventivi', { query: { id: pid } }, tok).data; assert.equal(p.righe.length, 2); assert.equal(p.righe[0].quantita, 2); assert.equal(p.totale, 122); assert.equal(p.storico[0].evento, 'creato'); assert.equal(p.storico[0].dettaglio.righe, 2); });
t('modifica: righe sostituite, numero invariato', () => { const x = call('preventivi', { method: 'POST', body: { preventivo: { ...pv, id: pid, totale: 200 }, righe: [righe[0]] } }, tok).data; assert.equal(x.numero, `PREV-${anno}-001`); const p = call('preventivi', { query: { id: pid } }, tok).data; assert.equal(p.righe.length, 1); assert.equal(p.totale, 200); assert.equal(p.storico[0].evento, 'modificato'); assert.equal(p.storico[0].dettaglio.totale_prima, 122); });
t('cambio stato + storico', () => { call('preventivi', { method: 'PATCH', query: { id: pid }, body: { stato: 'accettato' } }, tok); const p = call('preventivi', { query: { id: pid } }, tok).data; assert.equal(p.stato, 'accettato'); assert.ok(p.chiuso_il); assert.equal(p.storico[0].dettaglio.a, 'accettato'); });
t('stato non valido -> 400', () => assert.equal(call('preventivi', { method: 'PATCH', query: { id: pid }, body: { stato: 'boh' } }, tok).status, 400));
t('lista ordinata per data', () => { const l = call('preventivi', {}, tok).data; assert.equal(l.length, 2); assert.equal(l[0].data, '2026-10-20'); assert.equal(typeof l[0].totale, 'number'); });
t('KPI', () => { const k = call('kpi', {}, tok).data; assert.equal(k.byStato.accettato.n, 1); assert.equal(k.byStato.bozza.n, 1); assert.equal(k.tasso_conversione, 100); assert.equal(k.ultimi_mesi.length, 2); });

// email + drive
const pdf = Buffer.from('%PDF-1.4 finto').toString('base64');
t('invio email con allegato', () => { const e = call('invia-email', { method: 'POST', body: { id: pid, to: 'cliente@example.com', body: 'Ciao', pdf_base64: pdf, filename: 'Prev 1.pdf' } }, tok); assert.equal(e.data.ok, true); assert.equal(be.outbox.length, 1); assert.equal(be.outbox[0].replyTo, 'commerciale@gettoniere-shop.it'); assert.equal(be.outbox[0].allegati[0].nome, 'Prev 1.pdf'); assert.ok(e.data.pdf_url); });
t('email non valida -> 400', () => assert.equal(call('invia-email', { method: 'POST', body: { id: pid, to: 'no', pdf_base64: pdf } }, tok).status, 400));
t('stato resta accettato dopo email, storico registra', () => { const p = call('preventivi', { query: { id: pid } }, tok).data; assert.equal(p.stato, 'accettato'); assert.equal(p.storico[0].evento, 'email'); assert.ok(p.pdf_url); });
t('archivia PDF su Drive', () => assert.ok(call('archivia-pdf', { method: 'POST', body: { id: pid, pdf_base64: pdf, filename: 'x.pdf' } }, tok).data.url));
t('img: host non consentito', () => assert.equal(call('img', { query: { u: 'https://evil.example/x.jpg' } }, tok).status, 400));

// password
t('cambio password: troppo corta', () => assert.equal(call('password', { method: 'POST', body: { vecchia: PW, nuova: 'corta' } }, tok).status, 400));
t('cambio password: attuale errata', () => assert.equal(call('password', { method: 'POST', body: { vecchia: 'no', nuova: 'NuovaPassword-2027' } }, tok).status, 401));
t('cambio password ok e vecchia non vale più', () => { assert.equal(call('password', { method: 'POST', body: { vecchia: PW, nuova: 'NuovaPassword-2027' } }, tok).data.ok, true); assert.equal(call('login', { method: 'POST', body: { email: 'prova@example.com', password: PW } }).status, 401); assert.ok(call('login', { method: 'POST', body: { email: 'prova@example.com', password: 'NuovaPassword-2027' } }).data.token); });

// elimina
t('elimina preventivo e dati collegati', () => { call('preventivi', { method: 'DELETE', query: { id: pid } }, tok); assert.equal(call('preventivi', {}, tok).data.length, 1); assert.equal(call('preventivi', { query: { id: pid } }, tok).status, 404); });
t('nessuna password in chiaro nel foglio', () => assert.ok(!JSON.stringify(be.state.sheets).includes(PW)));
console.log(`\n${ok} test superati` + (process.exitCode ? ' — CI SONO FALLIMENTI' : ''));
