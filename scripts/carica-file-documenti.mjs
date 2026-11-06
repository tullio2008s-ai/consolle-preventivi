// Carica su Drive (cartella privata dei documenti) i file scelti in data/documenti-registro.json, con la nuova regola di nome
// CODICE_Nome prodotto_LINGUA.ext, e collega file_id e nome alle righe del foglio Documenti (la spia resta com'è).
// Uso: node --env-file=.env scripts/carica-file-documenti.mjs [URL_API]     (default http://localhost:3000/api)
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const API = process.argv[2] || 'http://localhost:3000/api';
const ROOT = join(homedir(), 'Dropbox/AAA GETTONIERE TUTTI/AA MANUALI TUTTI/MANUALI 2024/AAA NUOVE ISTRUZIONI 2024/MANUALI X CLIENTI');
const { INIT_EMAIL, INIT_PASSWORD } = process.env;
const post = async (path, body, token, method = 'POST') => {
  const init = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'manual', body: JSON.stringify({ path, method, query: {}, body, token }) };
  let r = await fetch(API, init);
  if (r.status >= 300 && r.status < 400) r = await fetch(r.headers.get('location'));
  const j = JSON.parse(await r.text()); if (j.error) throw new Error(path + ': ' + j.error); return j.data;
};
const rd = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const prod = Object.fromEntries(rd('prodotti.json').map(p => [p.sku, p]));
const pulito = s => String(s).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
const { token } = await post('login', { email: INIT_EMAIL, password: INIT_PASSWORD });
const righe = rd('documenti-registro.json').filter(r => r.tipo === 'istruzioni').slice(0, +process.env.LIMIT || 1e9);
const esistenti = Object.fromEntries((await post('documenti', undefined, token, 'GET')).map(d => [d.sku + '|' + d.tipo, d]));
let n = 0, saltati = 0;
for (const r of righe) {
  const lingue = {};
  for (const [l, d] of Object.entries(r.lingue)) {
    const ex = (() => { try { return JSON.parse(esistenti[r.sku + '|istruzioni']?.lingue || '{}')[l]; } catch { return null; } })();
    if (ex?.file_id && ex.data === d.data) { lingue[l] = ex; saltati++; continue; } // già caricato e invariato
    const ext = d.origine.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx', nome = `${r.sku}_${pulito(prod[r.sku]?.desc || prod[r.sku]?.name || r.sku)}_${l}.${ext}`;
    const up = await post('documento-carica', { nome, base64: readFileSync(join(ROOT, d.origine)).toString('base64') }, token);
    lingue[l] = { ...d, file_id: up.id, nome: up.nome }; n++;
  }
  // stesso manuale per istruzioni e scheda CE (la scheda CE è la sua ultima pagina)
  await post('documenti', [{ sku: r.sku, tipo: 'istruzioni', lingue }, { sku: r.sku, tipo: 'ce', lingue }], token);
  process.stdout.write('.');
}
console.log(`\nfile caricati: ${n} | già presenti: ${saltati} | prodotti: ${righe.length}`);
