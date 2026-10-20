import { db, guard, num } from './_lib.js';

const STATI = ['bozza', 'inviato', 'accettato', 'perso'];
const LIST = 'id,numero,data,stato,cli_azienda,cli_referente,cli_email,totale,inviato_il,updated_at,created_by';

const HEAD = ['data', 'cliente_id', 'cli_azienda', 'cli_referente', 'cli_indirizzo', 'cli_citta', 'cli_piva_cf',
  'cli_email', 'cli_telefono', 'pagamento', 'validita', 'consegna', 'resa', 'garanzia', 'note', 'trasp_descr',
  'trasp_costo', 'imponibile', 'iva', 'totale'];

async function log(sb, id, utente, evento, dettaglio = {}) {
  await sb.from('storico_preventivo').insert({ preventivo_id: id, utente, evento, dettaglio });
}

export default guard(async (req, res, user) => {
  const sb = db();
  const { id } = req.query;

  if (req.method === 'GET') {
    if (!id) {
      const { data, error } = await sb.from('preventivi').select(LIST).order('data', { ascending: false })
        .order('created_at', { ascending: false }).limit(5000);
      if (error) throw error;
      return res.json(data);
    }
    const [p, r, s] = await Promise.all([
      sb.from('preventivi').select('*').eq('id', id).single(),
      sb.from('righe_preventivo').select('*').eq('preventivo_id', id).order('posizione'),
      sb.from('storico_preventivo').select('*').eq('preventivo_id', id).order('quando', { ascending: false }),
    ]);
    if (p.error) throw p.error;
    return res.json({ ...p.data, righe: r.data || [], storico: s.data || [] });
  }

  if (req.method === 'POST') { // crea o aggiorna (con righe)
    const { preventivo: pv, righe = [] } = req.body;
    const head = Object.fromEntries(HEAD.filter(k => k in pv).map(k => [k, pv[k] === '' && k === 'cliente_id' ? null : pv[k]]));
    head.stato = STATI.includes(pv.stato) ? pv.stato : 'bozza';
    let pid = pv.id, numero = pv.numero, evento = 'creato', dettaglio = {};
    if (pid) {
      const { data: old, error } = await sb.from('preventivi').select('numero,stato,totale').eq('id', pid).single();
      if (error) throw error;
      numero = old.numero; evento = 'modificato';
      dettaglio = { totale_prima: old.totale, totale_dopo: num(head.totale), stato_prima: old.stato };
      const { error: e2 } = await sb.from('preventivi').update(head).eq('id', pid);
      if (e2) throw e2;
    } else {
      const { data: n, error } = await sb.rpc('prossimo_numero_preventivo');
      if (error) throw error;
      numero = n;
      const { data, error: e2 } = await sb.from('preventivi').insert({ ...head, numero, created_by: user.name }).select('id').single();
      if (e2) throw e2;
      pid = data.id;
      dettaglio = { totale: num(head.totale) };
    }
    await sb.from('righe_preventivo').delete().eq('preventivo_id', pid);
    if (righe.length) {
      const rows = righe.map((r, i) => ({
        preventivo_id: pid, posizione: i, sku: r.sku || '', descrizione: r.descrizione || '',
        quantita: num(r.quantita), prezzo_unit: num(r.prezzo_unit), sconto_pct: num(r.sconto_pct),
        iva_pct: num(r.iva_pct), nota: r.nota || '', foto_url: r.foto_url || '',
      }));
      const { error } = await sb.from('righe_preventivo').insert(rows);
      if (error) throw error;
    }
    await log(sb, pid, user.name, evento, { ...dettaglio, righe: righe.length });
    return res.json({ id: pid, numero });
  }

  if (req.method === 'PATCH') { // cambio stato
    const { stato } = req.body;
    if (!id || !STATI.includes(stato)) return res.status(400).json({ error: 'Stato non valido' });
    const { data: old, error } = await sb.from('preventivi').select('stato,inviato_il').eq('id', id).single();
    if (error) throw error;
    const upd = { stato };
    if (stato === 'inviato' && !old.inviato_il) upd.inviato_il = new Date().toISOString();
    upd.chiuso_il = ['accettato', 'perso'].includes(stato) ? new Date().toISOString() : null;
    const { error: e2 } = await sb.from('preventivi').update(upd).eq('id', id);
    if (e2) throw e2;
    await log(sb, id, user.name, 'stato', { da: old.stato, a: stato });
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { error } = await sb.from('preventivi').delete().eq('id', id);
    if (error) throw error;
    return res.json({ ok: true });
  }
  res.status(405).end();
});
