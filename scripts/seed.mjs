// Carica data/prodotti.json e data/clienti.json in Supabase. Uso: node --env-file=.env scripts/seed.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const read = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

const prodotti = read('prodotti.json').map(p => ({
  sku: p.sku, nome: p.name, descrizione: p.desc || '', prezzo: p.price || 0, categoria: p.cat || '', foto_url: p.foto || '',
}));
const clienti = read('clienti.json').map(c => ({
  legacy_id: String(c.id), azienda: c.company || '', referente: c.name || '', indirizzo: c.address || '',
  citta: c.city || '', piva_cf: c.vat || '', email: c.email || '', telefono: c.phone || '',
}));

for (const part of chunk(prodotti, 200)) {
  const { error } = await sb.from('prodotti').upsert(part, { onConflict: 'sku' });
  if (error) throw error;
}
console.log('prodotti:', prodotti.length);
for (const part of chunk(clienti, 500)) {
  const { error } = await sb.from('clienti').upsert(part, { onConflict: 'legacy_id' });
  if (error) throw error;
}
console.log('clienti:', clienti.length);
