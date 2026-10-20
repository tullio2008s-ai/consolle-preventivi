# Messa online — passo passo (circa 30-40 minuti)

Architettura: **GitHub** (codice) → **Vercel** (pubblica sito + funzioni `/api`) → **Supabase** (database).
Tutto con piani gratuiti. Gli account li crei tu; le chiavi restano nel tuo `.env` e su Vercel, mai su GitHub.

## 1. Supabase (database)
1. supabase.com → *Start your project* → accedi (puoi usare Google) → *New project*.
   Nome `gettoniere-preventivi`, regione **Frankfurt (eu-central-1)**, scegli una password database (salvala).
2. Menu *SQL Editor* → *New query* → incolla tutto `supabase/schema.sql` → *Run*. Deve dire "Success".
3. *Project Settings → API*: copia **Project URL** e la chiave **service_role** (quella segreta, non la `anon`).
4. Incolla i due valori nel file `.env` (righe `SUPABASE_URL=` e `SUPABASE_SERVICE_KEY=`).

## 2. Caricare dati e utente (dal Terminale, nella cartella del progetto)
```bash
npm install
npm run seed          # carica 358 prodotti e 1761 clienti
npm run crea-utente   # crea l'utente con INIT_EMAIL / INIT_PASSWORD del .env
```
Poi **cancella la riga `INIT_PASSWORD=` dal `.env`**.

## 3. GitHub (repository PRIVATO)
1. github.com → *New repository* → nome `consolle-preventivi` → **Private** → *Create* (senza README).
2. Dal Terminale (nella cartella del progetto):
```bash
git remote add origin https://github.com/TUO-UTENTE/consolle-preventivi.git
git push -u origin main
```
(la prima volta GitHub chiede l'accesso: usa il browser o un *Personal Access Token*.)
Controlla che sul sito GitHub **non** compaiano `.env` né la cartella `data/`.

## 4. Vercel (pubblicazione)
1. vercel.com → accedi *Continue with GitHub* → *Add New → Project* → importa `consolle-preventivi`.
2. Prima di *Deploy*, in **Environment Variables** inserisci: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
   `SESSION_SECRET` (stringa casuale lunga: copia quella del tuo `.env`), e se vuoi le email `RESEND_API_KEY`, `MAIL_FROM`.
   **Non** inserire `INIT_PASSWORD` e **non** inserire `AUTH_MODE`.
3. *Deploy*. Ottieni un indirizzo tipo `consolle-preventivi.vercel.app`: aprilo e accedi con email e password.

## 5. Sottodominio (facoltativo)
Vercel → progetto → *Settings → Domains* → aggiungi `preventivi.gettoniere-shop.it`.
Vercel mostra un record **CNAME** da inserire nel pannello DNS di gettoniere-shop.it.

## 6. Email (facoltativo)
resend.com → account → *Domains* → aggiungi `gettoniere-shop.it` → inserisci i record DNS richiesti → *API Keys* → crea chiave → mettila in Vercel (`RESEND_API_KEY`).

## Dopo la messa online
- Cambia subito la password dal pulsante **🔑 Password** (quella iniziale è stata scritta in chat).
- Per aggiungere altri utenti: stessa procedura di `crea-utente` con un'altra email.
- Aggiornamenti: modifica → `git add -A && git commit -m "..." && git push` → Vercel ripubblica da solo.
