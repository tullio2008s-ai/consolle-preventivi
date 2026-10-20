import { createClient } from '@supabase/supabase-js';
import { sessionUser } from './_auth.js';

// Accetta sia i nomi scelti da noi sia quelli creati dall'integrazione Supabase di Vercel.
export const db = () =>
  createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } });

export { sign, verify, sessionUser } from './_auth.js';

// Protegge una funzione: richiede sessione valida, risponde JSON, intercetta gli errori.
export const guard = handler => async (req, res) => {
  const user = sessionUser(req);
  if (!user) return res.status(401).json({ error: 'Non autorizzato' });
  try {
    await handler(req, res, user);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Errore interno' });
  }
};

export const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
