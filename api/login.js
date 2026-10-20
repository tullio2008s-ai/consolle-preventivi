import { db } from './_lib.js';
import { sign, sessionUser, checkPassword } from './_auth.js';

const COOKIE = (v, age) => `sess=${v}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`;
const DUMMY = 'scrypt$x$x'; // per tempi di risposta simili anche se l'utente non esiste

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const u = sessionUser(req);
    return u ? res.json({ user: u.name, email: u.email, auth_attiva: process.env.AUTH_MODE !== 'open' })
             : res.status(401).json({ error: 'Non autenticato' });
  }
  if (req.method === 'DELETE') { res.setHeader('Set-Cookie', COOKIE('', 0)); return res.json({ ok: true }); }
  if (req.method !== 'POST') return res.status(405).end();

  const email = String(req.body?.email || '').trim().toLowerCase(), password = String(req.body?.password || '');
  const { data: u } = await db().from('utenti').select('email,nome,password_hash,attivo').eq('email', email).maybeSingle();
  const ok = checkPassword(password, u?.password_hash || DUMMY) && u?.attivo;
  if (!ok) {
    await new Promise(r => setTimeout(r, 900)); // rallenta i tentativi a forza bruta
    return res.status(401).json({ error: 'Email o password errate' });
  }
  const age = 12 * 3600;
  res.setHeader('Set-Cookie', COOKIE(sign({ name: u.nome || u.email, email: u.email, exp: Date.now() + age * 1000 }), age));
  res.json({ user: u.nome || u.email, email: u.email, auth_attiva: true });
}
