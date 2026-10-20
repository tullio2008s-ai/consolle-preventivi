import { guard } from './_lib.js';

// Proxy immagini prodotto (serve alla brochure PDF: il bucket S3 non invia header CORS).
const OK_HOST = 'ss-pics.s3.eu-west-1.amazonaws.com';

export default guard(async (req, res) => {
  let u;
  try { u = new URL(req.query.u); } catch { return res.status(400).end(); }
  if (u.protocol !== 'https:' || u.hostname !== OK_HOST) return res.status(400).json({ error: 'Host non consentito' });
  const r = await fetch(u);
  if (!r.ok) return res.status(502).end();
  res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(Buffer.from(await r.arrayBuffer()));
});
