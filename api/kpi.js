import { db, guard, num } from './_lib.js';

export default guard(async (req, res) => {
  const { data, error } = await db().from('preventivi').select('data,stato,totale').limit(20000);
  if (error) throw error;
  const mese = new Date().toISOString().slice(0, 7);
  const sum = a => a.reduce((s, p) => s + num(p.totale), 0);
  const del = data.filter(p => p.data.startsWith(mese));
  const acc = data.filter(p => p.stato === 'accettato'), per = data.filter(p => p.stato === 'perso');
  const byStato = Object.fromEntries(['bozza', 'inviato', 'accettato', 'perso'].map(s => [s, {
    n: data.filter(p => p.stato === s).length, totale: sum(data.filter(p => p.stato === s)),
  }]));
  const mesi = {};
  data.forEach(p => { const m = p.data.slice(0, 7); (mesi[m] ||= { mese: m, n: 0, totale: 0 }); mesi[m].n++; mesi[m].totale += num(p.totale); });
  res.json({
    mese, n_mese: del.length, totale_mese: sum(del),
    tasso_conversione: acc.length + per.length ? Math.round(1000 * acc.length / (acc.length + per.length)) / 10 : null,
    accettati_mese: del.filter(p => p.stato === 'accettato').length,
    in_attesa: byStato.inviato, byStato,
    ultimi_mesi: Object.values(mesi).sort((a, b) => b.mese.localeCompare(a.mese)).slice(0, 6),
  });
});
