// Carica clienti e prodotti iniziali (data/*.json) nel backend, passando dall'API come fa il sito.
// Uso: node --env-file=.env scripts/carica-dati.mjs [URL_API]     (default http://localhost:3000/api)
import { readFileSync } from 'node:fs';
const API = process.argv[2] || 'http://localhost:3000/api';
const { INIT_EMAIL, INIT_PASSWORD } = process.env;
// Apps Script risponde al POST con un 302 verso l'indirizzo del risultato: lo seguo a mano (con GET).
const post = async (path, body, token, method = 'POST') => {
  const init = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'manual',
    body: JSON.stringify({ path, method, query: {}, body, token }) };
  let r = await fetch(API, init);
  if (r.status >= 300 && r.status < 400) r = await fetch(r.headers.get('location'));
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { throw new Error(path + ': risposta non valida: ' + t.slice(0, 120)); }
  if (j.error) throw new Error(path + ': ' + j.error); return j.data;
};
const rd = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

const { token } = await post('login', { email: INIT_EMAIL, password: INIT_PASSWORD });
const haveC = (await post('clienti', undefined, token, 'GET')).length, haveP = (await post('prodotti', undefined, token, 'GET')).length;
if (haveC || haveP) { console.log(`Già presenti ${haveC} clienti e ${haveP} prodotti: non carico nulla (evito duplicati).`); process.exit(0); }
const prodotti = rd('prodotti.json').map(p => ({ sku: p.sku, nome: p.name, descrizione: p.desc || '', prezzo: p.price || 0, categoria: p.cat || '', foto_url: p.foto || '' }));
const clienti = rd('clienti.json').map(c => ({ azienda: c.company, referente: c.name, indirizzo: c.address, citta: c.city, piva_cf: c.vat, email: c.email, telefono: c.phone }));
for (const part of chunk(prodotti, 200)) await post('prodotti', part, token);
console.log('prodotti caricati:', prodotti.length);
for (const part of chunk(clienti, 400)) { await post('clienti', part, token); process.stdout.write('.'); }
console.log('\nclienti caricati:', clienti.length);
