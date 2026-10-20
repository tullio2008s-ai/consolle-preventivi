# Messa online — architettura tutta Google

1. **Backend**: `apps-script/` → progetto Apps Script con l'account info.gettoniereshop@gmail.com, pubblicato come *Web app*
   (Esegui come: me · Accesso: chiunque). Al primo avvio crea da solo Foglio dati, utente iniziale e cartella Drive.
2. **Dati iniziali**: `npm run carica-dati https://script.google.com/macros/s/ID/exec` (358 prodotti, 1761 clienti).
3. **Sito**: l'URL del punto 1 va in `docs/config.js`; il repo GitHub pubblica `docs/` con GitHub Pages.
4. **Primo accesso**: apri il sito, entra, poi 🔑 Password e cambiala.

Il repository contiene solo codice: nessun dato cliente, nessuna password, nessun hash (`Seed.gs` e `data/` sono esclusi).
L'URL del backend è visibile nel sito ma inutilizzabile senza login.

## Se dimentichi la password
Apps Script → editor → esegui `reimpostaPassword('email', 'nuovaPassword')` (funzione di servizio in `Code.gs`).
