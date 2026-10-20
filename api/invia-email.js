import { db, guard } from './_lib.js';

const OK_MAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

// Invia il preventivo (PDF in allegato) tramite Resend e lo segna come "inviato".
export default guard(async (req, res, user) => {
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.RESEND_API_KEY) return res.status(501).json({ error: 'Invio email non configurato (manca RESEND_API_KEY)' });
  const { id, to, subject, body, pdf_base64, filename } = req.body;
  if (!OK_MAIL.test(to || '')) return res.status(400).json({ error: 'Indirizzo email non valido' });
  if (!pdf_base64 || pdf_base64.length > 12e6) return res.status(400).json({ error: 'PDF mancante o troppo grande' });
  const sb = db();
  const { data: p, error } = await sb.from('preventivi').select('id,numero,stato,inviato_il').eq('id', id).single();
  if (error) throw error;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || 'Gettoniere-Shop <commerciale@gettoniere-shop.it>',
      to: [to], reply_to: 'commerciale@gettoniere-shop.it',
      subject: subject || `Preventivo ${p.numero} – Gettoniere-Shop`,
      text: body || '',
      attachments: [{ filename: filename || `Preventivo_${p.numero}.pdf`, content: pdf_base64 }],
    }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(502).json({ error: out.message || 'Errore del provider email' });

  const upd = { inviato_il: p.inviato_il || new Date().toISOString() };
  if (p.stato === 'bozza') upd.stato = 'inviato';
  await sb.from('preventivi').update(upd).eq('id', id);
  await sb.from('storico_preventivo').insert({
    preventivo_id: id, utente: user.name, evento: 'email', dettaglio: { a: to, provider_id: out.id || null },
  });
  res.json({ ok: true, stato: upd.stato || p.stato });
});
