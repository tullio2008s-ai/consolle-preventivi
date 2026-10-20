import { db, guard, num } from './_lib.js';

const COLS = ['sku', 'nome', 'descrizione', 'prezzo', 'categoria', 'foto_url', 'url_sito'];
const clean = p => ({
  sku: String(p.sku || '').trim(), nome: String(p.nome || '').trim(),
  descrizione: String(p.descrizione || ''), prezzo: num(p.prezzo),
  categoria: String(p.categoria || ''), foto_url: String(p.foto_url || ''), url_sito: String(p.url_sito || ''),
});

export default guard(async (req, res) => {
  const sb = db();
  if (req.method === 'GET') {
    const { data, error } = await sb.from('prodotti').select(COLS.join(',')).eq('attivo', true).order('nome').limit(5000);
    if (error) throw error;
    return res.json(data);
  }
  if (req.method === 'POST') { // upsert singolo o massivo
    const rows = (Array.isArray(req.body) ? req.body : [req.body]).map(clean).filter(p => p.sku && p.nome);
    if (!rows.length) return res.status(400).json({ error: 'SKU e nome obbligatori' });
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from('prodotti').upsert(rows.slice(i, i + 500), { onConflict: 'sku' });
      if (error) throw error;
    }
    return res.json({ salvati: rows.length });
  }
  if (req.method === 'DELETE') { // disattiva, non cancella: i preventivi storici restano coerenti
    const { error } = await sb.from('prodotti').update({ attivo: false }).eq('sku', req.query.sku);
    if (error) throw error;
    return res.json({ ok: true });
  }
  res.status(405).end();
});
