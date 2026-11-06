// Per ogni manuale senza codice prodotto cerca sul sito (gettoniere-shop.it/search) e raccoglie i prodotti candidati.
// Input: data/documenti-proposta.json (da documenti-inventario.py). Output: data/documenti-candidati.json
// Rallentato apposta (il sito risponde 429 se si esagera) e ripartibile: salta le unità già fatte.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const units = JSON.parse(readFileSync(join(root, 'data/documenti-proposta.json'), 'utf8'));
const prod = JSON.parse(readFileSync(join(root, 'data/prodotti.json'), 'utf8'));
const byCode = Object.fromEntries(prod.map(p => [p.sku.toUpperCase(), p]));
const outFile = join(root, 'data/documenti-candidati.json');
const out = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {};
const fotoFile = join(root, 'data/site-foto.json');
const foto = existsSync(fotoFile) ? JSON.parse(readFileSync(fotoFile, 'utf8')) : {};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const pulisci = s => s.replace(/\bSC\d{6}(-\d+)?\b/gi, ' ').replace(/\((REV|COPIA)[^)]*\)/gi, ' ').replace(/\b(COPIA|COPI|REV|ISTRUZIONI|MANUALE|NUOVO|FABIO|SUMIT)\b/gi, ' ')
  .replace(/[+_:]/g, ' ').replace(/\s+/g, ' ').trim();
function query(u) {
  const parts = u.split('/'), last = pulisci(parts[parts.length - 1]);
  return last.length >= 9 || parts.length < 2 ? last : (pulisci(parts[parts.length - 2]) + ' ' + last).trim();
}

async function cerca(q) {
  for (let t = 0; t < 4; t++) {
    const r = await fetch('https://www.gettoniere-shop.it/search?q=' + encodeURIComponent(q), { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.status === 429) { await sleep(40000); continue; }
    if (!r.ok) return [];
    const html = await r.text(), hits = [];
    for (const part of html.split('{"name_1":').slice(1)) {
      const code = (/"code":\{"value":"([^"<]+)"/.exec(part) || [])[1];
      const im = /"featured_image_url_list":"([^"]+)"/.exec(part);
      if (code && im) foto[code.toUpperCase()] = im[1];
      if (code && byCode[code.toUpperCase()] && !hits.includes(code)) hits.push(code);
    }
    return hits.slice(0, 5);
  }
  return [];
}

const todo = units.filter(u => !u.sku.length);
let n = 0;
for (const u of todo) {
  if (out[u.unita] && out[u.unita].v === 2) continue;
  const q = query(u.unita);
  out[u.unita] = { v: 2, query: q, hits: q ? await cerca(q) : [] };
  if (++n % 10 === 0) { writeFileSync(outFile, JSON.stringify(out, null, 1)); writeFileSync(fotoFile, JSON.stringify(foto)); }
  await sleep(2500);
}
writeFileSync(outFile, JSON.stringify(out, null, 1)); writeFileSync(fotoFile, JSON.stringify(foto));
console.log('fatto', Object.keys(out).length, 'unità;', Object.values(out).filter(o => o.hits.length).length, 'con almeno un candidato dal sito');
