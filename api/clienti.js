import { db, guard } from './_lib.js';

const COLS = ['azienda', 'referente', 'indirizzo', 'citta', 'piva_cf', 'email', 'telefono', 'note'];
const clean = c => Object.fromEntries(COLS.filter(k => c[k] != null).map(k => [k, String(c[k]).trim()]));

export default guard(async (req, res) => {
  const sb = db();
  if (req.method === 'GET') {
    let all = [], from = 0;
    for (;;) { // Supabase limita a 1000 righe per richiesta
      const { data, error } = await sb.from('clienti').select('id,' + COLS.join(','))
        .order('azienda').range(from, from + 999);
      if (error) throw error;
      all = all.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
    return res.json(all);
  }
  if (req.method === 'POST') {
    const body = req.body;
    if (Array.isArray(body)) { // import massivo
      const rows = body.map(clean).filter(c => c.azienda || c.referente);
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from('clienti').insert(rows.slice(i, i + 500));
        if (error) throw error;
      }
      return res.json({ importati: rows.length });
    }
    const row = clean(body);
    if (!row.azienda && !row.referente) return res.status(400).json({ error: 'Nome o ragione sociale obbligatorio' });
    const q = body.id ? sb.from('clienti').update(row).eq('id', body.id) : sb.from('clienti').insert(row);
    const { data, error } = await q.select('id,' + COLS.join(',')).single();
    if (error) throw error;
    return res.json(data);
  }
  if (req.method === 'DELETE') {
    const { error } = await sb.from('clienti').delete().eq('id', req.query.id);
    if (error) throw error;
    return res.json({ ok: true });
  }
  res.status(405).end();
});
