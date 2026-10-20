# Consolle Preventivi — GETTONIERE-SHOP

Web app (HTML/CSS/JS, nessun framework) + Supabase (DB) + Vercel (hosting e funzioni `/api`).

```
consolle-preventivi/
├─ public/                  # frontend statico servito da Vercel
│  ├─ index.html            # (da creare) consolle
│  ├─ css/ js/              # (da creare) stile e moduli
│  └─ assets/logo.png       # logo RGB
├─ api/                     # funzioni serverless Vercel (da creare)
│  ├─ login.js              # verifica PIN, cookie di sessione
│  ├─ preventivi.js, clienti.js, prodotti.js, kpi.js
│  └─ invia-email.js        # invio con allegato PDF
├─ supabase/schema.sql      # tabelle, vista KPI, contatore, RLS
├─ scripts/seed.mjs         # (da creare) carica data/*.json in Supabase
├─ data/                    # JSON estratti (NON committare: dati personali)
├─ docs/ANALISI_FUNZIONALITA.md
├─ vercel.json
└─ .env.example
```

## Provare in locale (senza Supabase)
```bash
npm run dev   # http://localhost:3000, dati nel file data/local-db.json; login come da .env
```

## Messa online
Guida completa passo passo: [docs/MESSA_ONLINE.md](docs/MESSA_ONLINE.md).

## Accesso
Login con email + password (utente creato con `npm run crea-utente`, password cambiabile dall'app con il pulsante 🔑 Password).
Le password sono salvate cifrate (scrypt) nella tabella `utenti`; mai in chiaro, mai su GitHub.
Se dimentichi la password: metti la nuova in `INIT_PASSWORD` nel `.env` e rilancia `npm run crea-utente`.

## Email
Servono `RESEND_API_KEY` e il dominio gettoniere-shop.it verificato su Resend (record DNS). Senza, il pulsante risponde "Invio email non configurato".
