# Consolle Preventivi — GETTONIERE-SHOP

Tutto sull'account Google **info.gettoniereshop@gmail.com**, senza database né hosting a pagamento:

| Cosa | Dove |
|---|---|
| Sito (HTML/CSS/JS, nessun framework) | GitHub Pages — cartella `docs/` |
| Backend (API, login, email) | Google Apps Script — `apps-script/Code.gs` |
| Dati (clienti, prodotti, preventivi, righe, storico, utenti) | Foglio Google "Consolle Preventivi - DATI" (creato al primo avvio) |
| PDF dei preventivi | Drive, cartella "Preventivi Gettoniere-Shop" |
| Email ai clienti | Gmail (mittente info.gettoniereshop@gmail.com, risposte a commerciale@gettoniere-shop.it) |

```
docs/                 sito statico (index.html, css/, js/app.js, assets/, config.js)
apps-script/          backend: Code.gs, appsscript.json  (Seed.gs = utente iniziale, NON su Git)
scripts/              dev-server.mjs, gas-mock.mjs, test-backend.mjs, genera-seed.mjs, carica-dati.mjs
documentazione/       analisi e guida di messa online
data/                 dati personali locali (NON su Git)
```

## Provare in locale
```bash
npm run dev          # http://localhost:3000 — esegue il vero Code.gs con servizi Google simulati
npm test             # 32 test del backend
```
Dati di prova in `data/local-sheet.json`. Primo avvio: `npm run genera-seed` (crea l'utente dal `.env`) poi `npm run carica-dati`.

## Accesso
Email + password. La password è salvata solo come hash (HMAC-SHA256 iterato) nel Foglio, mai in chiaro né su GitHub.
Si cambia dall'app (🔑 Password). Dopo 5 tentativi errati l'account si blocca per 10 minuti. Sessione: 12 ore.
Password dimenticata: dall'editor Apps Script si può reimpostare modificando la riga dell'utente (vedi guida).

## Messa online
Vedi [documentazione/MESSA_ONLINE.md](documentazione/MESSA_ONLINE.md).

## Limiti da conoscere
- Email: circa 100 al giorno con un Gmail gratuito (la consolle avvisa quando finiscono).
- Il Foglio regge bene migliaia di righe; se un giorno servissero decine di migliaia di preventivi conviene passare a un database vero.
