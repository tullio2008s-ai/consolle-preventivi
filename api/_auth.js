// Utilità di autenticazione senza dipendenze esterne (usate sia dalle funzioni Vercel sia dal server di prova).
import crypto from 'node:crypto';

// ── password: scrypt con sale casuale, formato "scrypt$salt$hash" ──
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const h = crypto.scryptSync(String(pw), salt, 64).toString('base64url');
  return `scrypt$${salt}$${h}`;
}
export function checkPassword(pw, stored) {
  const [alg, salt, h] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !h) return false;
  const a = Buffer.from(crypto.scryptSync(String(pw), salt, 64)), b = Buffer.from(h, 'base64url');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export const passwordOk = pw => typeof pw === 'string' && pw.length >= 10 && pw.length <= 200;

// ── sessione: cookie firmato HMAC ──
const mac = body => crypto.createHmac('sha256', process.env.SESSION_SECRET || '').update(body).digest('base64url');
export function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + mac(body);
}
export function verify(tok) {
  if (!tok || !process.env.SESSION_SECRET) return null;
  const [body, sig] = tok.split('.');
  if (!body || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(mac(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; }
  catch { return null; }
}
export function sessionUser(req) {
  if (process.env.AUTH_MODE === 'open') return { name: 'Tullio', email: '' };
  const m = /(?:^|;\s*)sess=([^;]+)/.exec(req.headers.cookie || '');
  return m ? verify(m[1]) : null;
}
