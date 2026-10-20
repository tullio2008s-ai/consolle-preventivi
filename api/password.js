import { db, guard } from './_lib.js';
import { checkPassword, hashPassword, passwordOk } from './_auth.js';

// Cambio password dall'interno dell'app (richiede la password attuale).
export default guard(async (req, res, user) => {
  if (req.method !== 'POST') return res.status(405).end();
  const { vecchia, nuova } = req.body || {};
  if (!passwordOk(nuova)) return res.status(400).json({ error: 'La nuova password deve avere almeno 10 caratteri' });
  const sb = db();
  const { data: u, error } = await sb.from('utenti').select('email,password_hash').eq('email', user.email).single();
  if (error || !checkPassword(vecchia || '', u.password_hash)) {
    await new Promise(r => setTimeout(r, 900));
    return res.status(401).json({ error: 'Password attuale errata' });
  }
  const { error: e2 } = await sb.from('utenti').update({ password_hash: hashPassword(nuova) }).eq('email', u.email);
  if (e2) throw e2;
  res.json({ ok: true });
});
