// Genera apps-script/Seed.gs con l'utente iniziale (email + HASH della password, mai la password in chiaro).
// Seed.gs è escluso da Git: contiene l'hash. Uso: node --env-file=.env scripts/genera-seed.mjs
import { writeFileSync } from 'node:fs';
import { createBackend } from './gas-mock.mjs';

const { INIT_EMAIL, INIT_NOME = '', INIT_PASSWORD } = process.env;
if (!INIT_EMAIL || !INIT_PASSWORD || INIT_PASSWORD.length < 10) { console.error('Servono INIT_EMAIL e INIT_PASSWORD (min. 10 caratteri) nel .env'); process.exit(1); }
const be = createBackend({ codeFiles: [new URL('../apps-script/Code.gs', import.meta.url).pathname.replace(/%20/g, ' ')] });
const hash = be.ctx.hashPassword_(INIT_PASSWORD); // stessa funzione che userà Google
writeFileSync(new URL('../apps-script/Seed.gs', import.meta.url), `// GENERATO da scripts/genera-seed.mjs — NON va su Git.\nvar ADMIN_SEED = ${JSON.stringify({ email: INIT_EMAIL.trim().toLowerCase(), nome: INIT_NOME, hash })};\n`);
console.log('apps-script/Seed.gs creato per', INIT_EMAIL.trim().toLowerCase());
