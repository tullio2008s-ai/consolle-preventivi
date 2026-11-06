// Carica i PDF rimpaginati nel modello master (data/istruzioni-convertite.json) e li collega ai codici: sostituiscono il Word nella lingua corrispondente (spia gialla).
// Uso: node --env-file=.env scripts/carica-istruzioni-master.mjs <URL_API>
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
const API = process.argv[2], { INIT_EMAIL, INIT_PASSWORD } = process.env;
const post = async (path, body, token, method = 'POST') => {
  const init = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'manual', body: JSON.stringify({ path, method, query: {}, body, token }) };
  let r = await fetch(API, init); if (r.status >= 300 && r.status < 400) r = await fetch(r.headers.get('location'));
  const j = JSON.parse(await r.text()); if (j.error) throw new Error(path + ': ' + j.error); return j.data;
};
const conv = JSON.parse(readFileSync(new URL('../data/istruzioni-convertite.json', import.meta.url), 'utf8')).filter(x => x.ok);
const { token } = await post('login', { email: INIT_EMAIL, password: INIT_PASSWORD });
const ex = Object.fromEntries((await post('documenti', undefined, token, 'GET')).map(d => [d.sku + '|' + d.tipo, d]));
const oggi = new Date().toISOString().slice(0, 10); let n = 0;
for (const c of conv) {
  const nome = basename(c.out), up = await post('documento-carica', { nome, base64: readFileSync(c.out).toString('base64') }, token);
  const righe = c.skus.map(sku => {
    let l = {}; try { l = JSON.parse(ex[sku + '|istruzioni']?.lingue || '{}'); } catch {}
    l[c.lang] = { origine: 'rimpaginato nel modello master', data: oggi, ext: 'pdf', file_id: up.id, nome: up.nome };
    return { sku, tipo: 'istruzioni', stato: 'giallo', lingue: l, origine: ex[sku + '|istruzioni']?.origine || 'modello master' };
  });
  await post('documenti', righe, token); n++; process.stdout.write('.');
}
console.log('\nfile caricati:', n);
