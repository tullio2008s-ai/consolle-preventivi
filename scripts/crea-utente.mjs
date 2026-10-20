// Crea l'utente di accesso, o ne reimposta la password (utile se la dimentichi).
// Uso: node --env-file=.env scripts/crea-utente.mjs   (legge INIT_EMAIL, INIT_PASSWORD, INIT_NOME)
import { createClient } from '@supabase/supabase-js';
import { hashPassword, passwordOk } from '../api/_auth.js';

const { INIT_EMAIL, INIT_PASSWORD, INIT_NOME = '' } = process.env;
if (!INIT_EMAIL || !passwordOk(INIT_PASSWORD)) { console.error('Servono INIT_EMAIL e INIT_PASSWORD (min. 10 caratteri) nel file .env'); process.exit(1); }
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const { error } = await sb.from('utenti').upsert(
  { email: INIT_EMAIL.trim().toLowerCase(), nome: INIT_NOME, password_hash: hashPassword(INIT_PASSWORD), attivo: true }, { onConflict: 'email' });
if (error) throw error;
console.log('Utente pronto:', INIT_EMAIL.trim().toLowerCase(), '— ora puoi togliere INIT_PASSWORD dal file .env');
