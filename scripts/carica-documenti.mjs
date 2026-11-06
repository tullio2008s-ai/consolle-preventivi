// Carica data/documenti-registro.json nel foglio Documenti (solo aggiunge/aggiorna la riga (sku,tipo); NON tocca le spie già validate: salta le righe verdi).
// Uso: node --env-file=.env scripts/carica-documenti.mjs [URL_API]     (default http://localhost:3000/api)
import { readFileSync } from 'node:fs';
const API = process.argv[2] || 'http://localhost:3000/api';
const { INIT_EMAIL, INIT_PASSWORD } = process.env;
const post = async (path, body, token, method = 'POST') => {
  const init = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'manual', body: JSON.stringify({ path, method, query: {}, body, token }) };
  let r = await fetch(API, init);
  if (r.status >= 300 && r.status < 400) r = await fetch(r.headers.get('location'));
  const j = JSON.parse(await r.text()); if (j.error) throw new Error(path + ': ' + j.error); return j.data;
};
const { token } = await post('login', { email: INIT_EMAIL, password: INIT_PASSWORD });
const righe = JSON.parse(readFileSync(new URL('../data/documenti-registro.json', import.meta.url), 'utf8'));
const verdi = new Set((await post('documenti', undefined, token, 'GET')).filter(d => d.stato === 'verde').map(d => d.sku + '|' + d.tipo));
const da = righe.filter(r => !verdi.has(r.sku + '|' + r.tipo));
for (let i = 0; i < da.length; i += 60) await post('documenti', da.slice(i, i + 60), token);
console.log('righe caricate:', da.length, '| già validate (verdi) lasciate com\'erano:', righe.length - da.length);
