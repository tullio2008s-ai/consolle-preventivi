# Analisi `preventivi-gettoniere.html` (18:03 del 19/10/2026, 3,0 MB, 1026 righe)

## Cosa pesa
| Blocco | Dimensione | Destinazione |
|---|---|---|
| `LOGO_B64` (JPEG **CMYK** 2000×340) | ~1,0 MB | `public/assets/logo.png` (RGB, 42 KB) |
| `BASE_PRODS` / `PRODS_DATA` (duplicati) | 2 × 110 KB | `public/data/prodotti.json` → tabella `prodotti` |
| `BASE_CLIS` / `CLIS_DATA` (duplicati) | 2 × 390 KB | `public/data/clienti.json` → tabella `clienti` |
| `ARCH_DATA` (archivio preventivi) | vuoto | tabelle `preventivi` + `righe_preventivo` |

Dati estratti: **358 prodotti** (tutti con foto da `ss-pics.s3…`, nessun SKU duplicato, nessun prezzo 0; `price` era una stringa → ora numero) e **1761 clienti** (tutti con email, nessun id duplicato).

## Funzionalità presenti nel file
1. **Nuovo preventivo**: cliente con autocomplete dalla rubrica (ricerca su azienda/referente/città, frecce+Invio), "Salva in rubrica", righe articolo (ricerca per nome/SKU con punteggio, miniatura foto, qtà, prezzo, sconto %, IVA 0/4/10/22, nota riga), trasporto (IVA 22% fissa), condizioni (pagamento, validità, consegna gg lav., note), n° preventivo automatico `PREV-AAAA-NNN`, riepilogo totali.
2. **PDF preventivo** con jsPDF (disegnato a mano, non autotable): testata, tabella righe con link "vedi" al sito, riga spedizione, totali, note, footer contatti. Salva anche in archivio.
3. **Archivio**: elenco, apri e modifica, ristampa PDF, elimina.
4. **Clienti**: CRUD con modale, import/export Excel/CSV (SheetJS), ripristino lista originale.
5. **Prodotti**: tabella con foto, import Excel/CSV, elimina, ripristino.
6. **Email**: solo `mailto:` con testo precompilato (nessun allegato).
7. **Persistenza**: nessun localStorage. "Salva file aggiornato" riscrive l'intero HTML con regex e lo scarica da inviare via email.

## Differenze rispetto alla tua richiesta (da decidere)
- **Brochure prodotto: NON è in questo file.** Esiste nelle versioni vecchie `Progetti/preventivi-gettoniere (1)…(7).html` (14/03/2026, mini-catalogo di ~30 prodotti con `cercaNelCatalogo`, modale + PDF) e in `Progetti/brochure-gettoniere.html` (usa `api.anthropic.com` direttamente dal browser: non riutilizzabile online, esporrebbe la chiave). Va ricostruita sul catalogo da 358 prodotti.
- **Autotable**: il PDF attuale non lo usa, ma jsPDF manuale. Posso mantenerlo identico oppure passare ad autotable.
- **Condizioni "resa" e "garanzia"** non esistono nel form (solo pagamento, validità, consegna, note): le aggiungo come campi.
- Palette effettiva: `#cc0000`, `#1a1a1a`/`#111`, sfondo `#f2f2f2`, font Segoe UI/system-ui (non c'è un web font).
- Il logo originale è CMYK: sostituito con PNG RGB equivalente.

## Rischi da gestire nella migrazione
- **Sicurezza PIN**: un PIN solo lato browser non protegge i dati su Supabase. Progetto: PIN verificato da una funzione Vercel `/api/login` che emette un cookie di sessione firmato; tutte le query passano da `/api/*` con la service key (mai nel frontend); RLS chiusa.
- **Dati personali**: 1761 clienti reali (GDPR) → il repo GitHub deve essere **privato** e `public/data/*.json` non va pubblicato (il caricamento in Supabase si fa con lo script di seed, poi il file esce da `public/`).
- **Email dalla consolle**: serve un provider (es. Resend, 3.000 mail/mese gratis, con dominio gettoniere-shop.it verificato via DNS) o SMTP; con allegato PDF.
- Foto prodotto su S3 di terzi: link esterni, ok ma fragili.
