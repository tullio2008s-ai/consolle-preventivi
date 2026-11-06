// Carica su Drive (cartella privata) le DoC di famiglia indicate e le collega come "Scheda CE" a tutti i codici della famiglia (spia gialla = da validare).
// Uso: node --env-file=.env scripts/carica-doc-ce-famiglie.mjs <URL_API> <cartella_pdf> F1,F2,F3L,F4a,F5
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const [API, DIR, FAMS] = process.argv.slice(2), { INIT_EMAIL, INIT_PASSWORD } = process.env;
const post = async (path, body, token, method = 'POST') => {
  const init = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'manual', body: JSON.stringify({ path, method, query: {}, body, token }) };
  let r = await fetch(API, init); if (r.status >= 300 && r.status < 400) r = await fetch(r.headers.get('location'));
  const j = JSON.parse(await r.text()); if (j.error) throw new Error(path + ': ' + j.error); return j.data;
};
const map = JSON.parse(readFileSync(new URL('../data/ce-famiglie-codici.json', import.meta.url), 'utf8')).famiglie;
const { token } = await post('login', { email: INIT_EMAIL, password: INIT_PASSWORD });
const file = {};
for (const f of FAMS.split(',')) {
  const nome = readdirSync(DIR).find(n => n.startsWith('DOC_CE_' + f + '_') && !n.includes('BOZZA')); if (!nome) throw new Error('manca ' + f);
  const up = await post('documento-carica', { nome, base64: readFileSync(join(DIR, nome)).toString('base64') }, token);
  file[f] = { origine: nome, data: '2026-11-06', ext: 'pdf', file_id: up.id, nome: up.nome }; console.log('caricato', f, up.nome);
}
const per = {};
for (const f of Object.keys(file)) for (const p of map[f]) (per[p.sku] ||= {})['IT-' + f] = file[f];
const righe = Object.entries(per).map(([sku, lingue]) => ({ sku, tipo: 'ce', stato: 'giallo', lingue, origine: 'DoC di famiglia 06/11/2026' }));
for (let i = 0; i < righe.length; i += 25) { await post('documenti', righe.slice(i, i + 25), token); process.stdout.write('.'); }
console.log('\ncodici collegati:', righe.length);
