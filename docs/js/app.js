// Consolle Preventivi GETTONIERE-SHOP — frontend (nessun framework)
// I dati stanno su Supabase e passano da /api/* (vedi cartella api/).

const SITE = 'https://www.gettoniere-shop.it';
const FOOT1 = 'www.gettoniere-shop.it - PAYSOLUTION S.R.L.S. - P.Iva 04206000921';
const FOOT2 = 'Via L. Pasteur 19 - Selargius (CA) - Tel. 3400069549 - commerciale@gettoniere-shop.it';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = n => isNaN(n) ? '0,00' : Number(n).toFixed(2).replace('.', ',');
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ');
const dmy = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '';
const eur = n => '€ ' + (+n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let PRODS = [], CLIS = [], ARCH = [], DOCS = {};
let LOGO = '';             // dataURL del logo per i PDF
let curId = null;          // id del preventivo aperto (null = nuovo)
let items = [], seq = 0;

// ─────────── API (Google Apps Script) ───────────
const API_URL = window.API_URL || '/api';
let TOKEN = '';
try { TOKEN = localStorage.getItem('gs_token') || ''; } catch (e) {}
const setToken = t => { TOKEN = t || ''; try { t ? localStorage.setItem('gs_token', t) : localStorage.removeItem('gs_token'); } catch (e) {} };

async function api(path, opts = {}) {
  const [p, qs] = path.split('?');
  const method = opts.method || 'GET';
  const tentativi = (method === 'GET' || p === 'login') ? 3 : 1; // solo letture e login si ritentano: nessun effetto collaterale
  const body = JSON.stringify({ path: p, method, query: Object.fromEntries(new URLSearchParams(qs || '')), body: opts.body, token: TOKEN });
  let out;
  for (let t = 1; t <= tentativi; t++) {
    try {
      // text/plain evita la richiesta preliminare CORS, che Apps Script non gestisce
      const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
      out = await r.json(); break;
    } catch (e) { // a volte Google risponde con una pagina di errore invece del JSON
      if (t < tentativi) await new Promise(res => setTimeout(res, 1200 * t));
      else out = { error: tentativi > 1 ? 'Il server non risponde: riprova tra qualche istante' : "Risposta non ricevuta dal server: controlla l'archivio prima di ripetere l'operazione", status: 502 };
    }
  }
  if (out.error) {
    if (out.status === 401 && p !== 'password' && p !== 'login') { setToken(''); showLogin(); throw new Error('Sessione scaduta: accedi di nuovo'); }
    throw new Error(out.error);
  }
  return out.data;
}

function showMsg(txt, type = 'ok') {
  const b = $('msg');
  b.textContent = (type === 'ok' ? '✅ ' : '⚠️ ') + txt;
  b.style.background = type === 'ok' ? '#cc0000' : '#b45309';
  b.classList.add('on');
  clearTimeout(showMsg.t); showMsg.t = setTimeout(() => b.classList.remove('on'), 4500);
}
const fail = e => showMsg(e.message || String(e), 'warn');

// ─────────── LOGIN ───────────
function showLogin() { $('login').classList.add('on'); setTimeout(() => ($('lg-email').value ? $('lg-pw') : $('lg-email')).focus(), 50); }
async function doLogin() {
  $('login-err').textContent = '';
  const btn = document.querySelector('#login .btnr'); btn.disabled = true; btn.textContent = 'Accesso…';
  try {
    const j = await api('login', { method: 'POST', body: { email: $('lg-email').value, password: $('lg-pw').value } });
    setToken(j.token); $('login').classList.remove('on'); $('lg-pw').value = '';
    start(j.user, true);
  } catch (e) { $('login-err').textContent = e.message; $('lg-pw').select(); }
  finally { btn.disabled = false; btn.textContent = 'Accedi'; }
}
function doLogout() { setToken(''); try { localStorage.removeItem(CACHE_KEY); } catch (e) {} location.reload(); }
function openPw() { ['pw-old', 'pw-new', 'pw-new2'].forEach(i => $(i).value = ''); $('pw-err').textContent = ''; $('pw-modal').classList.add('on'); $('pw-old').focus(); }
function closePw() { $('pw-modal').classList.remove('on'); }
async function savePw() {
  if ($('pw-new').value !== $('pw-new2').value) { $('pw-err').textContent = 'Le due nuove password non coincidono'; return; }
  try { await api('password', { method: 'POST', body: { vecchia: $('pw-old').value, nuova: $('pw-new').value } }); closePw(); showMsg('Password cambiata'); }
  catch (e) { $('pw-err').textContent = e.message; }
}

// ─────────── AVVIO ───────────
window.onload = async () => {
  fetch('assets/logo.png').then(r => r.blob()).then(b => new Promise(res => {
    const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b);
  })).then(d => LOGO = d).catch(() => {});
  if (!TOKEN) return showLogin();
  try { const j = await api('login'); start(j.user, true); }
  catch (e) { showLogin(); }
};

let started = false;
async function start(user, showExit) {
  $('user-name').textContent = user ? '👤 ' + user : '';
  $('auth-btns').style.display = showExit ? 'inline-flex' : 'none';
  if (started) return; started = true;
  $('f-date').value = new Date().toISOString().slice(0, 10);
  addItem();
  // 1) subito i dati salvati nel browser (se ci sono), 2) poi aggiornamento dal server in background
  const cache = leggiCache();
  if (cache) applicaDati(cache.prodotti, cache.clienti);
  else catalogoCaricamento(true);
  showTab('dashboard');
  caricaDati();
}

const CACHE_KEY = 'gs_dati_v1';
function leggiCache() { try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return c && c.prodotti && c.clienti ? c : null; } catch (e) { return null; } }
function salvaCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ prodotti: PRODS.map(({ _n, ...p }) => p), clienti: CLIS.map(({ _n, ...c }) => c) })); } catch (e) { /* memoria piena: si va avanti senza */ }
}
function applicaDati(prodotti, clienti) {
  PRODS = prodotti; CLIS = clienti;
  PRODS.forEach(p => p._n = norm(p.sku + ' ' + p.nome + ' ' + p.descrizione + ' ' + p.categoria));
  CLIS.forEach(c => c._n = norm(c.azienda + ' ' + c.referente + ' ' + c.citta));
  $('tip-cnt').innerHTML = `Catalogo: <b>${PRODS.length} prodotti</b> — Rubrica: <b>${CLIS.length} clienti</b>.`;
  const cat = $('pcat').value;
  $('pcat').innerHTML = '<option value="">Tutte le categorie</option>' + [...new Set(PRODS.map(p => p.categoria))].sort().map(c => `<option>${esc(c)}</option>`).join('');
  $('pcat').value = cat;
  catalogoCaricamento(false);
}
function catalogoCaricamento(on, errore) {
  const b = $('load-bar'); if (!b) return;
  b.style.display = on || errore ? 'block' : 'none';
  b.innerHTML = errore
    ? `⚠️ ${esc(errore)} <button class="abtn" style="margin-left:8px" onclick="caricaDati()">Riprova</button>`
    : '⏳ Caricamento di catalogo e rubrica in corso… (alcuni secondi, la ricerca prodotti sarà disponibile subito dopo)';
}
let caricando = false;
async function caricaDati() {
  if (caricando) return; caricando = true;
  if (!PRODS.length) catalogoCaricamento(true);
  try {
    // in sequenza: Apps Script gestisce male molte richieste contemporanee
    const prodotti = await api('prodotti'), clienti = await api('clienti');
    applicaDati(prodotti, clienti); salvaCache();
    await caricaDocumenti();
  } catch (e) { if (!PRODS.length) catalogoCaricamento(false, e.message); else fail(e); }
  finally { caricando = false; }
}

// Documenti per prodotto: una riga per (sku, tipo). Assenza di riga = documento mancante (spia rossa)
async function caricaDocumenti() {
  try {
    const rows = await api('documenti'); DOCS = {};
    rows.forEach(d => { try { d.lingue = d.lingue ? JSON.parse(d.lingue) : {}; } catch (e) { d.lingue = {}; } DOCS[d.sku + '|' + d.tipo] = d; });
    if ($('v-prodotti').style.display === 'block') renderProd();
  } catch (e) { /* senza spie la pagina funziona lo stesso */ }
}
const docStato = (sku, tipo) => { const d = DOCS[sku + '|' + tipo]; return d && (d.origine || Object.keys(d.lingue).length) ? d.stato : 'rosso'; };
const docTot = sku => { const a = docStato(sku, 'istruzioni'), b = docStato(sku, 'ce'); return a === 'rosso' || b === 'rosso' ? 'rosso' : a === 'giallo' || b === 'giallo' ? 'giallo' : 'verde'; };
function docCella(sku, tipo) {
  const st = docStato(sku, tipo), d = DOCS[sku + '|' + tipo], nome = tipo === 'ce' ? 'Scheda CE' : 'Istruzioni';
  const tip = st === 'rosso' ? `${nome}: documento mancante` : st === 'giallo' ? `${nome}: da validare (clic per segnare come OK)\nOrigine: ${d.origine}\nLingue: ${Object.keys(d.lingue).join(', ') || '—'}` : `${nome}: OK (clic per riportare a "da validare")`;
  const urls = d ? Object.entries(d.lingue).filter(([, x]) => x.url) : [];
  return `<td class="docb"><span class="spia spia-${st}" title="${esc(tip)}" onclick="validaDoc('${esc(sku)}','${tipo}')"></span>${urls.length ? `<button class="bsm" onclick="apriDoc('${esc(sku)}','${tipo}',this)">${nome}</button>` : ''}</td>`;
}
async function validaDoc(sku, tipo) {
  const st = docStato(sku, tipo); if (st === 'rosso') return showMsg('Manca il documento: non si può validare', 'warn');
  const nuovo = st === 'giallo' ? 'verde' : 'giallo';
  if (!confirm(nuovo === 'verde' ? `Segnare come VALIDATO (verde) ${tipo === 'ce' ? 'la scheda CE' : 'le istruzioni'} di ${sku}?` : `Riportare a "da validare" (giallo) ${sku}?`)) return;
  try { await api('documenti', { method: 'POST', body: { sku, tipo, stato: nuovo } }); DOCS[sku + '|' + tipo].stato = nuovo; renderProd(); showMsg(nuovo === 'verde' ? 'Documento validato' : 'Riportato a da validare'); }
  catch (e) { fail(e); }
}
function apriDoc(sku, tipo, btn) {
  document.querySelectorAll('.docmenu').forEach(m => m.remove());
  const l = Object.entries(DOCS[sku + '|' + tipo].lingue).filter(([, x]) => x.url);
  if (l.length === 1) return void window.open(l[0][1].url, '_blank', 'noopener');
  const m = document.createElement('div'); m.className = 'docmenu';
  m.innerHTML = l.map(([k, x]) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(k)}${x.nome ? ' — ' + esc(x.nome) : ''}</a>`).join('');
  const r = btn.getBoundingClientRect(); m.style.left = (r.left + scrollX) + 'px'; m.style.top = (r.bottom + scrollY + 2) + 'px';
  document.body.appendChild(m); setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }), 0);
}

const TABS = ['dashboard', 'nuovo', 'archivio', 'clienti', 'prodotti', 'brochure'];
function showTab(t) {
  TABS.forEach(v => $('v-' + v).style.display = v === t ? 'block' : 'none');
  document.querySelectorAll('.tb').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  if (t === 'dashboard') loadDash();
  if (t === 'archivio') loadArch();
  if (t === 'clienti') renderCli();
  if (t === 'prodotti') renderProd();
}

// ─────────── DASHBOARD ───────────
const STATI = ['bozza', 'inviato', 'accettato', 'perso'];
const pill = s => `<span class="pill st-${s}">${s}</span>`;
async function loadDash() {
  try {
    const [k, arch] = await Promise.all([api('kpi'), api('preventivi')]);
    ARCH = arch;
    $('kpis').innerHTML = [
      ['Preventivi del mese', k.n_mese, `${k.accettati_mese} accettati`],
      ['Totale offerto (mese)', eur(k.totale_mese), 'IVA inclusa'],
      ['Tasso di conversione', k.tasso_conversione == null ? '—' : k.tasso_conversione + '%', 'accettati / (accettati + persi)'],
      ['In attesa di risposta', k.in_attesa.n, eur(k.in_attesa.totale)],
    ].map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('');
    const mx = Math.max(1, ...k.ultimi_mesi.map(m => m.totale));
    $('bars').innerHTML = k.ultimi_mesi.length
      ? `<div class="bars">${[...k.ultimi_mesi].reverse().map(m => `<div class="bar" style="height:${Math.max(3, m.totale / mx * 100)}%" title="${m.n} preventivi"><span>${Math.round(m.totale / 1000 * 10) / 10}k</span><i>${m.mese.slice(5)}/${m.mese.slice(2, 4)}</i></div>`).join('')}</div>`
      : '<div style="color:#bbb">Nessun dato.</div>';
    $('by-stato').innerHTML = STATI.map(s => `<div class="trow" style="color:#111;margin-bottom:9px">${pill(s)}<span><b>${k.byStato[s].n}</b> · ${eur(k.byStato[s].totale)}</span></div>`).join('');
    $('dash-last').innerHTML = ARCH.slice(0, 6).map(archRow).join('') || '<div style="color:#bbb">Nessun preventivo.</div>';
    $('tab-arch').textContent = '📁 Archivio' + (ARCH.length ? ` (${ARCH.length})` : '');
  } catch (e) { fail(e); }
}

// ─────────── ARCHIVIO ───────────
function archRow(q) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding:9px 0;border-bottom:1px solid #f0f0f0">
    <div style="display:flex;align-items:center;gap:11px">
      <div class="arc-num">${esc(q.numero)}</div>
      <div><div style="font-weight:700;font-size:14px">${esc(q.cli_azienda || q.cli_referente || 'Cliente non specificato')}</div>
        <div style="font-size:11px;color:#aaa;margin-top:2px">${dmy(q.data)} ${q.cli_email ? '· ' + esc(q.cli_email) : ''}</div></div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <select class="stsel st-${q.stato}" onchange="setStato('${q.id}',this.value)">${STATI.map(s => `<option value="${s}"${s === q.stato ? ' selected' : ''}>${s}</option>`).join('')}</select>
      <div style="text-align:right;margin:0 6px"><div class="arc-tot">${eur(q.totale)}</div><div class="arc-sub">IVA inclusa</div></div>
      <button class="abtn" onclick="openQuote('${q.id}')">📂 Apri</button>
      <button class="abtn gray" onclick="openQuote('${q.id}',true)">📄 PDF</button>
      <button class="abtn del" onclick="delQuote('${q.id}')">✕</button>
    </div></div>`;
}
async function loadArch() { try { ARCH = await api('preventivi'); renderArch(); } catch (e) { fail(e); } }
function renderArch() {
  const q = norm($('af-q').value).trim(), st = $('af-st').value, d1 = $('af-d1').value, d2 = $('af-d2').value;
  const rows = ARCH.filter(p =>
    (!q || norm(p.numero + ' ' + p.cli_azienda + ' ' + p.cli_referente + ' ' + p.cli_email).includes(q)) &&
    (!st || p.stato === st) && (!d1 || p.data >= d1) && (!d2 || p.data <= d2));
  $('arch-cnt').textContent = `(${rows.length}${rows.length !== ARCH.length ? ' di ' + ARCH.length : ''})`;
  $('tab-arch').textContent = '📁 Archivio' + (ARCH.length ? ` (${ARCH.length})` : '');
  $('arch-list').innerHTML = rows.length
    ? `<div class="card" style="padding:4px 16px">${rows.map(archRow).join('')}</div>`
    : '<div class="card" style="padding:40px;text-align:center;color:#ccc"><div style="font-size:32px;margin-bottom:7px">📄</div><div style="font-weight:600">Nessun preventivo</div></div>';
}
async function setStato(id, stato) {
  try { await api('preventivi?id=' + id, { method: 'PATCH', body: { stato } }); showMsg('Stato aggiornato: ' + stato); await loadArch(); if (curId === id) $('f-stato').value = stato; }
  catch (e) { fail(e); loadArch(); }
}
async function delQuote(id) {
  if (!confirm('Eliminare definitivamente questo preventivo?')) return;
  try { await api('preventivi?id=' + id, { method: 'DELETE' }); if (curId === id) newQuote(false); await loadArch(); showMsg('Preventivo eliminato'); }
  catch (e) { fail(e); }
}
async function openQuote(id, pdf) {
  try {
    const q = await api('preventivi?id=' + id);
    curId = q.id;
    const fv = (i, v) => { $(i).value = v ?? ''; };
    fv('f-num', q.numero); fv('f-date', q.data); fv('f-stato', q.stato);
    fv('f-co', q.cli_azienda); fv('f-cn', q.cli_referente); fv('f-ca', q.cli_indirizzo); fv('f-cit', q.cli_citta);
    fv('f-cv', q.cli_piva_cf); fv('f-ce', q.cli_email); fv('f-cp', q.cli_telefono);
    fv('f-sn', q.trasp_descr || 'Spedizione corriere'); fv('f-sc', +q.trasp_costo || '');
    fv('f-del', q.consegna); fv('f-resa', q.resa); fv('f-gar', q.garanzia); fv('f-nt', q.note);
    setSel('f-pay', q.pagamento); setSel('f-val', q.validita);
    $('cli-badge').style.display = q.cliente_id ? 'inline-block' : 'none';
    $('cli-badge').dataset.id = q.cliente_id || '';
    $('items-wrap').innerHTML = ''; items = []; seq = 0;
    q.righe.forEach(r => addItem({ sku: r.sku, descrizione: r.descrizione, quantita: +r.quantita, prezzo_unit: +r.prezzo_unit, sconto_pct: +r.sconto_pct, iva_pct: String(+r.iva_pct), nota: r.nota, foto_url: r.foto_url }));
    if (!q.righe.length) addItem();
    renderHist(q.storico);
    recalc(); showTab('nuovo');
    if (pdf) await generatePDF(); else showMsg(`Preventivo ${q.numero} aperto`);
  } catch (e) { fail(e); }
}
function setSel(id, v) {
  const s = $(id); if (!v) return;
  if (![...s.options].some(o => o.value === v || o.text === v)) s.add(new Option(v, v));
  s.value = v;
}
const EV = { creato: 'Creato', modificato: 'Modificato', stato: 'Cambio stato', email: 'Email inviata', pdf: 'PDF' };
function renderHist(h) {
  $('hist-card').style.display = h && h.length ? 'block' : 'none';
  $('hist').innerHTML = (h || []).map(e => {
    const d = e.dettaglio || {}; let t = '';
    if (e.evento === 'stato') t = `${d.da} → ${d.a}`;
    else if (e.evento === 'modificato') t = `totale ${eur(+d.totale_prima)} → ${eur(+d.totale_dopo)} · ${d.righe} righe`;
    else if (e.evento === 'email') t = 'a ' + esc(d.a);
    else if (e.evento === 'creato') t = `totale ${eur(+d.totale)} · ${d.righe} righe`;
    return `<div class="hist"><b>${EV[e.evento] || esc(e.evento)}</b> ${t}<small>${new Date(e.quando).toLocaleString('it-IT')} · ${esc(e.utente)}</small></div>`;
  }).join('');
}

// ─────────── CLIENTE (autocomplete) ───────────
let cNavI = -1;
function cSearch(val) {
  $('cli-badge').style.display = 'none'; $('cli-badge').dataset.id = '';
  const dd = $('cdrop');
  if (!val.trim()) { dd.classList.remove('on'); return; }
  const q = norm(val);
  const found = CLIS.filter(c => c._n.includes(q)).slice(0, 8);
  if (!found.length) { dd.classList.remove('on'); return; }
  dd.innerHTML = found.map(c => `<div class="citem" onclick="selClient('${c.id}')"><div class="cname">${esc(c.azienda || c.referente)}</div>
    <div class="csub">${esc([c.referente !== c.azienda ? c.referente : '', c.citta, c.email].filter(Boolean).join(' · '))}</div></div>`).join('')
    + '<div class="cnew" onclick="saveClientNow()">+ Salva come nuovo cliente</div>';
  cNavI = -1; dd.classList.add('on');
}
function cNav(e) {
  const dd = $('cdrop'), its = dd.querySelectorAll('.citem');
  if (!dd.classList.contains('on') || !its.length) return;
  if (e.key === 'ArrowDown') cNavI = Math.min(cNavI + 1, its.length - 1);
  else if (e.key === 'ArrowUp') cNavI = Math.max(cNavI - 1, 0);
  else if (e.key === 'Enter' && cNavI >= 0) { its[cNavI].click(); return; }
  else if (e.key === 'Escape') { dd.classList.remove('on'); return; }
  its.forEach((el, i) => el.classList.toggle('hi', i === cNavI));
}
function selClient(id) {
  const c = CLIS.find(x => x.id === id); if (!c) return;
  $('f-co').value = c.azienda; $('f-cn').value = c.referente; $('f-ca').value = c.indirizzo;
  $('f-cit').value = c.citta; $('f-cv').value = c.piva_cf; $('f-ce').value = c.email; $('f-cp').value = c.telefono;
  $('cdrop').classList.remove('on');
  $('cli-badge').style.display = 'inline-block'; $('cli-badge').dataset.id = c.id;
}
function clearClient() {
  ['co', 'cn', 'ca', 'cit', 'cv', 'ce', 'cp'].forEach(f => $('f-' + f).value = '');
  $('cli-badge').style.display = 'none'; $('cli-badge').dataset.id = '';
}
async function saveClientNow() {
  const c = {
    azienda: $('f-co').value, referente: $('f-cn').value, indirizzo: $('f-ca').value, citta: $('f-cit').value,
    piva_cf: $('f-cv').value, email: $('f-ce').value, telefono: $('f-cp').value,
  };
  if (!c.azienda.trim() && !c.referente.trim()) return showMsg('Inserisci nome o ragione sociale', 'warn');
  const key = norm(c.azienda + c.referente).replace(/\s+/g, '');
  const ex = CLIS.find(x => norm(x.azienda + x.referente).replace(/\s+/g, '') === key);
  if (ex) c.id = ex.id;
  try {
    const s = await api('clienti', { method: 'POST', body: c });
    s._n = norm(s.azienda + ' ' + s.referente + ' ' + s.citta);
    const i = CLIS.findIndex(x => x.id === s.id); if (i >= 0) CLIS[i] = s; else CLIS.push(s);
    $('cdrop').classList.remove('on');
    $('cli-badge').style.display = 'inline-block'; $('cli-badge').dataset.id = s.id;
    salvaCache(); showMsg('Cliente salvato in rubrica');
  } catch (e) { fail(e); }
}
document.addEventListener('click', e => { if (!e.target.closest('.crel')) $('cdrop').classList.remove('on'); });

// ─────────── ARTICOLI ───────────
function searchP(q) {
  if (!q.trim()) return [];
  const qn = norm(q), ws = qn.split(/\s+/).filter(Boolean);
  return PRODS.map(p => {
    if (norm(p.sku) === qn) return { p, s: 100 };
    const hits = ws.filter(w => p._n.includes(w)).length;
    return hits ? { p, s: hits / ws.length * 70 + (p._n.includes(qn) ? 20 : 0) } : null;
  }).filter(Boolean).sort((a, b) => b.s - a.s).slice(0, 8).map(x => x.p);
}
function addItem(data) {
  const idx = seq++;
  const it = data ? { ...data, idx } : { idx, sku: '', descrizione: '', quantita: 1, prezzo_unit: '', sconto_pct: 0, iva_pct: '22', nota: '', foto_url: '' };
  items.push(it);
  const ivaOpts = ['0', '4', '10', '22'].map(v => `<option value="${v}"${v === String(it.iva_pct) ? ' selected' : ''}>${v}%</option>`).join('');
  const d = document.createElement('div');
  d.className = 'acard'; d.id = 'ac-' + idx;
  d.innerHTML = `
    <div class="ahdr"><span class="abadge">ARTICOLO</span><button class="armbtn" onclick="rmItem(${idx})">✕ Rimuovi</button></div>
    <div class="srel">
      <label class="lbl">🔍 Cerca per nome o codice SKU</label>
      <div class="srow"><div class="sinw">
        <input id="sq-${idx}" autocomplete="off" placeholder="Es: BGMLAV4000 · gettoniera lavatrice · doccia · tessera RFID…" oninput="onSI(${idx},this.value)" onkeydown="if(event.key==='Escape')closeSdr(${idx})">
        <button class="sclr" id="sclr-${idx}" onclick="clrS(${idx})">×</button></div>
        <button class="sbtn" onclick="trigS(${idx})">🔍</button></div>
      <div class="sdrop" id="sdr-${idx}"></div>
    </div>
    <div style="display:grid;grid-template-columns:110px 1fr;gap:9px;margin-bottom:9px">
      <div><label class="lbl">Codice SKU</label><input id="cod-${idx}" value="${esc(it.sku)}" placeholder="SKU" oninput="syncIt(${idx})"></div>
      <div><label class="lbl">Descrizione</label><textarea id="dsc-${idx}" rows="2" oninput="syncIt(${idx})">${esc(it.descrizione)}</textarea></div>
    </div>
    <div style="display:grid;grid-template-columns:60px 1fr 80px 70px auto;gap:9px">
      <div><label class="lbl">Q.tà</label><input id="qty-${idx}" type="number" value="${it.quantita ?? 1}" min="0.01" step="any" oninput="syncIt(${idx})"></div>
      <div><label class="lbl">Prezzo € (no IVA)</label><input id="prc-${idx}" type="number" step="0.01" value="${it.prezzo_unit ?? ''}" placeholder="0,00" oninput="syncIt(${idx})"></div>
      <div><label class="lbl">Sconto %</label><input id="dis-${idx}" type="number" value="${it.sconto_pct || 0}" oninput="syncIt(${idx})"></div>
      <div><label class="lbl">IVA</label><select id="iva-${idx}" onchange="syncIt(${idx})">${ivaOpts}</select></div>
      <div style="display:flex;flex-direction:column;justify-content:flex-end"><label class="lbl">Totale riga</label><div class="rtot" id="rt-${idx}">€ 0,00</div></div>
    </div>
    <div style="margin-top:9px"><label class="lbl">Nota riga</label>
      <input id="nt-${idx}" value="${esc(it.nota)}" placeholder="Colore, variante, riferimento ordine…" oninput="syncIt(${idx})"></div>`;
  $('items-wrap').appendChild(d);
  updBadges(); recalc();
  if (!data) setTimeout(() => $('sq-' + idx)?.focus(), 50);
}
function rmItem(idx) { $('ac-' + idx)?.remove(); items = items.filter(i => i.idx !== idx); updBadges(); recalc(); }
function updBadges() {
  const cs = document.querySelectorAll('.acard');
  cs.forEach((c, n) => { c.querySelector('.abadge').textContent = `ARTICOLO ${n + 1}`; c.querySelector('.armbtn').style.display = cs.length > 1 ? 'block' : 'none'; });
}
function syncIt(idx) {
  const it = items.find(i => i.idx === idx); if (!it) return;
  it.sku = $(`cod-${idx}`).value; it.descrizione = $(`dsc-${idx}`).value;
  it.quantita = parseFloat($(`qty-${idx}`).value) || 0; it.prezzo_unit = parseFloat($(`prc-${idx}`).value) || 0;
  it.sconto_pct = parseFloat($(`dis-${idx}`).value) || 0; it.iva_pct = $(`iva-${idx}`).value; it.nota = $(`nt-${idx}`).value;
  recalc();
}
function onSI(idx, val) {
  $('sclr-' + idx).style.display = val ? 'block' : 'none';
  if (val.trim().length >= 2) showSRes(idx, searchP(val)); else closeSdr(idx);
}
function trigS(idx) { const q = $('sq-' + idx).value; showSRes(idx, q.trim() ? searchP(q) : PRODS.slice(0, 8)); }
function showSRes(idx, rs) {
  const d = $('sdr-' + idx);
  if (!rs.length) { d.innerHTML = '<div class="sitem err"><div class="siname" style="color:#cc0000">' + (PRODS.length ? 'Nessun prodotto trovato — compila manualmente' : 'Catalogo ancora in caricamento: riprova tra qualche secondo') + '</div></div>'; d.classList.add('on'); return; }
  d.innerHTML = `<div class="scnt">${rs.length} prodott${rs.length > 1 ? 'i trovati' : 'o trovato'}</div>`
    + rs.map(p => `<div class="sitem" data-sku="${esc(p.sku)}">${p.foto_url ? `<img class="sthumb" src="${esc(p.foto_url)}" loading="lazy" onerror="this.outerHTML='<div class=sph>No foto</div>'">` : '<div class="sph">No<br>foto</div>'}
      <div style="flex:1;min-width:0"><div class="siname"><span class="sisku">${esc(p.sku)}</span>${esc(p.nome)}</div><div class="sidesc">${esc(p.descrizione)}</div></div>
      <div class="siprice">${p.prezzo > 0 ? eur(p.prezzo) : ''}</div></div>`).join('')
    + '<div class="shint" onclick="closeSdr(' + idx + ')">✕ Chiudi</div>';
  d.querySelectorAll('.sitem[data-sku]').forEach(el => el.onclick = () => selProd(idx, PRODS.find(p => p.sku === el.dataset.sku)));
  d.classList.add('on');
}
function selProd(idx, p) {
  $(`cod-${idx}`).value = p.sku;
  $(`dsc-${idx}`).value = p.nome + (p.descrizione && p.descrizione !== p.nome ? ' – ' + p.descrizione.slice(0, 120) : '');
  if (p.prezzo > 0) $(`prc-${idx}`).value = p.prezzo;
  $(`sq-${idx}`).value = ''; $(`sclr-${idx}`).style.display = 'none';
  const it = items.find(i => i.idx === idx); if (it) it.foto_url = p.foto_url || '';
  closeSdr(idx); syncIt(idx); $(`qty-${idx}`).focus();
}
function clrS(idx) { $('sq-' + idx).value = ''; $('sclr-' + idx).style.display = 'none'; closeSdr(idx); }
function closeSdr(idx) { $('sdr-' + idx)?.classList.remove('on'); }
document.addEventListener('click', e => { if (!e.target.closest('.srel')) document.querySelectorAll('.sdrop').forEach(d => d.classList.remove('on')); });

// ─────────── CALCOLI ───────────
function calcRow(it) {
  const imp = (it.prezzo_unit || 0) * (it.quantita || 0) * (1 - (it.sconto_pct || 0) / 100);
  const iv = imp * (parseFloat(it.iva_pct) || 0) / 100;
  return { imp, iv, tot: imp + iv };
}
function totals() {
  let ai = 0, av = 0, at = 0;
  items.forEach(it => { const t = calcRow(it); ai += t.imp; av += t.iv; at += t.tot; });
  const sc = parseFloat($('f-sc').value) || 0, sv = sc * 0.22, st = sc + sv;
  return { ai, av, at, sc, sv, st, imponibile: ai + sc, iva: av + sv, totale: at + st };
}
function recalc() {
  const t = totals();
  items.forEach(it => { const el = $('rt-' + it.idx); if (el) el.textContent = eur(calcRow(it).tot); });
  const sd = $('ship-d'), si = $('ship-info'), ts = $('t-ship');
  if (t.sc > 0) {
    sd.textContent = eur(t.st); sd.className = 'ship-d has';
    si.style.display = 'block'; si.textContent = `Imponibile ${eur(t.sc)} + IVA 22% ${eur(t.sv)} = ${eur(t.st)}`;
    ts.style.display = 'flex'; ts.children[1].textContent = eur(t.st);
  } else { sd.textContent = 'Gratuita'; sd.className = 'ship-d free'; si.style.display = 'none'; ts.style.display = 'none'; }
  $('t-art').children[0].textContent = `Articoli (${items.length})`;
  $('t-art').children[1].textContent = eur(t.at);
  $('t-imp').children[1].textContent = eur(t.imponibile);
  $('t-iva').children[1].textContent = eur(t.iva);
  $('t-tot').textContent = eur(t.totale);
}

// ─────────── SALVATAGGIO ───────────
async function saveQuote(silent) {
  items.forEach(it => syncIt(it.idx));
  if (!$('f-co').value.trim() && !$('f-cn').value.trim()) { showMsg('Inserisci almeno il cliente', 'warn'); return null; }
  const t = totals();
  const pv = {
    id: curId || undefined, data: $('f-date').value, stato: $('f-stato').value,
    cliente_id: $('cli-badge').dataset.id || null,
    cli_azienda: $('f-co').value, cli_referente: $('f-cn').value, cli_indirizzo: $('f-ca').value, cli_citta: $('f-cit').value,
    cli_piva_cf: $('f-cv').value, cli_email: $('f-ce').value, cli_telefono: $('f-cp').value,
    pagamento: $('f-pay').value, validita: $('f-val').value, consegna: $('f-del').value, resa: $('f-resa').value,
    garanzia: $('f-gar').value, note: $('f-nt').value, trasp_descr: $('f-sn').value, trasp_costo: t.sc,
    imponibile: +t.imponibile.toFixed(2), iva: +t.iva.toFixed(2), totale: +t.totale.toFixed(2),
  };
  const righe = items.filter(i => i.sku || i.descrizione || i.prezzo_unit).map(i => ({
    sku: i.sku, descrizione: i.descrizione, quantita: i.quantita, prezzo_unit: i.prezzo_unit,
    sconto_pct: i.sconto_pct, iva_pct: i.iva_pct, nota: i.nota, foto_url: i.foto_url,
  }));
  try {
    const r = await api('preventivi', { method: 'POST', body: { preventivo: pv, righe } });
    curId = r.id; $('f-num').value = r.numero;
    const full = await api('preventivi?id=' + r.id); renderHist(full.storico);
    if (!silent) showMsg(`Preventivo ${r.numero} salvato`);
    return r;
  } catch (e) { fail(e); return null; }
}
function newQuote(go = true) {
  curId = null; clearClient();
  ['f-nt', 'f-del', 'f-resa', 'f-gar', 'f-sc'].forEach(id => $(id).value = '');
  $('f-sn').value = 'Spedizione corriere'; $('f-pay').selectedIndex = 0; $('f-val').selectedIndex = 1;
  $('f-stato').value = 'bozza'; $('f-num').value = '(assegnato al salvataggio)';
  $('f-date').value = new Date().toISOString().slice(0, 10);
  $('items-wrap').innerHTML = ''; items = []; seq = 0; renderHist([]);
  addItem(); recalc(); if (go) showTab('nuovo');
}

// ─────────── PDF PREVENTIVO ───────────
function buildPDF() {
  const { jsPDF } = window.jspdf;
  const num = $('f-num').value, date = dmy($('f-date').value), valid = $('f-val').value, pay = $('f-pay').value;
  const delivery = $('f-del').value, resa = $('f-resa').value, gar = $('f-gar').value, notes = $('f-nt').value;
  const co = $('f-co').value, cn = $('f-cn').value, ca = $('f-ca').value, cit = $('f-cit').value, cv = $('f-cv').value,
    ce = $('f-ce').value, cp = $('f-cp').value, sn = $('f-sn').value;
  const t = totals(), sc = t.sc, st = t.st, gI = t.imponibile, gV = t.iva, gT = t.totale;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, M = 15, R = W - M, BOT = 272;
  const NAVY = [11, 53, 96], CYAN = [31, 169, 214], ORANGE = [245, 166, 35], GREY = [107, 114, 128],
    INK = [31, 41, 55], LINE = [209, 213, 219], PALE = [237, 245, 250];
  const fill = c => doc.setFillColor(c[0], c[1], c[2]), ink = c => doc.setTextColor(c[0], c[1], c[2]), stroke = c => doc.setDrawColor(c[0], c[1], c[2]);
  const font = (st, sz) => { doc.setFont('helvetica', st); doc.setFontSize(sz); };
  const eu = n => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  // jsPDF non conosce la larghezza del glifo €: lo disegno a parte, accanto alla cifra
  const euR = (n, x, yy) => { const s = eu(n); doc.text(s, x, yy, { align: 'right' }); doc.text('€', x - doc.getTextWidth(s) - (0.3 + doc.getFontSize() * 0.045), yy, { align: 'right' }); };
  const dLong = new Date($('f-date').value + 'T12:00:00');
  const longDate = isNaN(dLong) ? date : dLong.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  const fname = `Preventivo_${num}_${(co || cn || 'cliente').replace(/[^\w]+/g, '_')}.pdf`;
  let y = 0;
  const need = h => { if (y + h > BOT) { doc.addPage(); y = 20; return true; } return false; };
  const section = title => {
    need(16); fill(CYAN); doc.rect(M, y, 1.6, 6.5, 'F');
    ink(NAVY); font('bold', 12); doc.text(title, M + 4.5, y + 5); y += 11;
  };

  // INTESTAZIONE
  try { if (LOGO) doc.addImage(LOGO, 'PNG', M, 12, 62, 10.5); } catch (e) {}
  ink(NAVY); font('bold', 19); doc.text('PREVENTIVO', R, 18, { align: 'right' });
  ink(INK); font('normal', 10); doc.text(`${num} - ${longDate}`, R, 25, { align: 'right' });
  ink(GREY); font('normal', 8.5); doc.text(`Offerta valida ${valid}`, R, 30.5, { align: 'right' });
  stroke(NAVY); doc.setLineWidth(0.8); doc.line(M, 36, R, 36); doc.setLineWidth(0.2);
  y = 45;

  // DESTINATARIO
  const nome = co || cn;
  const righe = [co && cn && cn !== co ? 'Alla c.a. ' + cn : '', [ca, cit].filter(Boolean).join(' - '),
    cv ? 'P.IVA / C.F.: ' + cv : '', [ce, cp].filter(Boolean).join('  -  ')].filter(Boolean);
  const bh = 15 + righe.length * 4.8;
  fill(PALE); doc.rect(M, y, W - M * 2, bh, 'F'); fill(NAVY); doc.rect(M, y, 1.8, bh, 'F');
  ink(GREY); font('bold', 7); doc.text('DESTINATARIO', M + 7, y + 6);
  ink(NAVY); font('bold', 12); doc.text(String(nome).slice(0, 70), M + 7, y + 12.5);
  ink(INK); font('normal', 8.5); righe.forEach((l, i) => doc.text(l.slice(0, 100), M + 7, y + 18 + i * 4.8));
  y += bh + 8;

  // DETTAGLIO FORNITURA
  section('Dettaglio della fornitura');
  const C = { cod: M + 1, dsc: M + 25, qty: 110, prc: 130, dis: 143, imp: 162, iva: 174, tot: R - 1 };
  const tableHead = () => {
    ink(GREY); font('bold', 7.5);
    doc.text('Cod.', C.cod, y); doc.text('Descrizione', C.dsc, y);
    doc.text('Q.tà', C.qty, y, { align: 'right' }); doc.text('Prezzo', C.prc, y, { align: 'right' });
    doc.text('Sc.%', C.dis, y, { align: 'right' }); doc.text('Imponibile', C.imp, y, { align: 'right' });
    doc.text('IVA', C.iva, y, { align: 'right' }); doc.text('Totale', C.tot, y, { align: 'right' });
    stroke(LINE); doc.line(M, y + 2.2, R, y + 2.2); y += 7;
  };
  tableHead();
  items.forEach(it => {
    const tt = calcRow(it);
    font('normal', 8);
    const dLns = doc.splitTextToSize(it.descrizione || '—', 62);
    font('italic', 7); const nLns = it.nota ? doc.splitTextToSize(it.nota, 62) : [];
    const rH = Math.max(dLns.length * 4 + nLns.length * 3.5 + 4, it.foto_url ? 11 : 8);
    if (need(rH + 4)) tableHead();
    ink(NAVY); font('bold', 8); doc.text((it.sku || '—').slice(0, 11), C.cod, y);
    if (it.foto_url) {
      font('normal', 6.5); ink(CYAN);
      doc.textWithLink('vedi scheda', C.cod, y + 3.6, { url: SITE + '/search?q=' + encodeURIComponent(it.sku || '') });
    }
    ink(INK); font('normal', 8); dLns.forEach((l, li) => doc.text(l, C.dsc, y + li * 4));
    if (nLns.length) { ink(GREY); font('italic', 7); nLns.forEach((l, li) => doc.text(l, C.dsc, y + dLns.length * 4 + 0.5 + li * 3.5)); }
    ink(INK); font('normal', 8);
    doc.text(String(it.quantita || 0), C.qty, y, { align: 'right' });
    if (it.prezzo_unit) euR(it.prezzo_unit, C.prc, y); else doc.text('—', C.prc, y, { align: 'right' });
    doc.text(it.sconto_pct ? it.sconto_pct + '%' : '—', C.dis, y, { align: 'right' });
    euR(tt.imp, C.imp, y); doc.text(it.iva_pct + '%', C.iva, y, { align: 'right' });
    ink(NAVY); font('bold', 8); euR(tt.tot, C.tot, y);
    stroke(LINE); doc.line(M, y + rH - 3, R, y + rH - 3); y += rH + 1;
  });
  if (sc > 0) {
    need(10);
    ink(GREY); font('bold', 8); doc.text('TRASP', C.cod, y);
    ink(INK); font('normal', 8); doc.text((sn || 'Spedizione').slice(0, 45), C.dsc, y);
    doc.text('1', C.qty, y, { align: 'right' }); euR(sc, C.prc, y); doc.text('—', C.dis, y, { align: 'right' });
    euR(sc, C.imp, y); doc.text('22%', C.iva, y, { align: 'right' });
    ink(NAVY); font('bold', 8); euR(st, C.tot, y);
    stroke(LINE); doc.line(M, y + 3.4, R, y + 3.4); y += 8;
  }
  y += 3;

  // TOTALI
  need(36);
  const lx = 118;
  ink(GREY); font('normal', 9); doc.text('Imponibile', lx, y); doc.text('IVA', lx, y + 6.5);
  ink(INK); euR(gI, R - 1, y); euR(gV, R - 1, y + 6.5);
  y += 11;
  fill(NAVY); doc.rect(M, y, W - M * 2, 13, 'F'); fill(ORANGE); doc.rect(M, y, 3.5, 13, 'F');
  ink([255, 255, 255]); font('bold', 11); doc.text('TOTALE IVA INCLUSA', M + 9, y + 8.4);
  font('bold', 15); euR(gT, R - 6, y + 8.8);
  y += 17.5;
  ink(GREY); font('italic', 7.5);
  doc.text('Prezzi unitari e importi di riga IVA esclusa; il totale finale comprende l\'IVA.', M, y); y += 9;

  // CONDIZIONI DI VENDITA
  section('Condizioni di vendita');
  const cond = [['Pagamento:', pay], ['Consegna:', delivery ? delivery + ' giorni lavorativi' : 'da concordare'], ['Resa:', resa || 'da concordare'],
    ['Garanzia:', gar || 'come da legge'], ['Validità offerta:', valid], ['Spedizione:', sc > 0 ? sn : 'da concordare']];
  const half = Math.ceil(cond.length / 2), CW = 83;
  need(30);
  let colH = [0, 0];
  cond.forEach(([lb, v], i) => {
    const col = i < half ? 0 : 1, x = M + col * (CW + 14), yy = y + colH[col];
    font('normal', 8.5); const ls = doc.splitTextToSize(`${lb} ${v}`, CW - 4);
    fill(CYAN); doc.circle(x + 1.1, yy - 1, 0.8, 'F');
    ink(INK); font('bold', 8.5); doc.text(lb, x + 4, yy);
    font('bold', 8.5); const lw = doc.getTextWidth(lb + ' '); font('normal', 8.5);
    doc.text(ls[0].slice(lb.length).trim(), x + 4 + lw, yy);
    ls.slice(1).forEach((l, li) => doc.text(l, x + 4, yy + (li + 1) * 4.2));
    colH[col] += ls.length * 4.2 + 2.2;
  });
  y += Math.max(colH[0], colH[1]) + 4;

  // NOTE
  if (notes.trim()) {
    section('Note');
    ink(INK); font('normal', 8.5);
    doc.splitTextToSize(notes, W - M * 2).forEach(l => { need(5); doc.text(l, M, y); y += 4.4; });
  }

  // PIÈ DI PAGINA su ogni pagina
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    stroke(CYAN); doc.setLineWidth(0.5); doc.line(M, 281, R, 281); doc.setLineWidth(0.2);
    ink(NAVY); font('bold', 8); doc.text(FOOT1, W / 2, 286, { align: 'center' });
    ink(GREY); font('normal', 8); doc.text(FOOT2, W / 2, 290.5, { align: 'center' });
    font('normal', 7); doc.text(`${fname} - pag. ${p}/${pages}`, R, 295, { align: 'right' });
  }
  return { doc, fname };
}
async function generatePDF() {
  const btn = $('btn-pdf'); btn.disabled = true; btn.textContent = '⏳ Generazione PDF…';
  try {
    if (!await saveQuote(true)) return;
    const { doc, fname } = buildPDF(); doc.save(fname);
    showMsg(`Preventivo ${$('f-num').value} salvato e PDF generato`);
    // copia di archivio su Drive (in secondo piano: un errore qui non blocca il PDF)
    api('archivia-pdf', { method: 'POST', body: { id: curId, filename: fname, pdf_base64: doc.output('datauristring').split(',')[1] } })
      .then(() => showMsg(`Preventivo ${$('f-num').value} salvato, PDF generato e copiato su Drive`)).catch(() => {});
  } finally { btn.disabled = false; btn.textContent = '📄 Salva e genera PDF'; }
}
async function doEmail() {
  const to = $('f-ce').value.trim();
  if (!to) return showMsg('Inserisci l\'email del cliente', 'warn');
  if (!confirm(`Inviare il preventivo a ${to} con il PDF in allegato?`)) return;
  const btn = $('btn-mail'); btn.disabled = true; btn.textContent = '⏳ Invio…';
  try {
    const r = await saveQuote(true); if (!r) return;
    const { doc, fname } = buildPDF();
    const pdf = doc.output('datauristring').split(',')[1];
    const nm = $('f-cn').value || $('f-co').value || 'Cliente';
    const body = `Gentile ${nm},\n\nin allegato il preventivo n. ${r.numero} del ${dmy($('f-date').value)}.\n\nTotale: ${$('t-tot').textContent} (IVA inclusa)\nPagamento: ${$('f-pay').value}\nValidità: ${$('f-val').value}\n\nRestiamo a disposizione per qualsiasi chiarimento.\n\nCordiali saluti\nGettoniere-Shop\n${SITE}\nTel. 340 0069549`;
    const out = await api('invia-email', { method: 'POST', body: { id: r.id, to, body, pdf_base64: pdf, filename: fname } });
    $('f-stato').value = out.stato;
    renderHist((await api('preventivi?id=' + r.id)).storico);
    showMsg(`Email inviata a ${to}`);
  } catch (e) { fail(e); }
  finally { btn.disabled = false; btn.textContent = '✉️ Invia Email con PDF'; }
}

// ─────────── CLIENTI ───────────
const LIM = 150;
function renderCli() {
  const q = norm($('cq').value).trim();
  const rows = (q ? CLIS.filter(c => (c._n + ' ' + norm(c.email + ' ' + c.piva_cf)).includes(q)) : CLIS);
  $('cli-cnt').textContent = `(${rows.length}${rows.length !== CLIS.length ? ' di ' + CLIS.length : ''})`;
  $('cli-body').innerHTML = rows.slice(0, LIM).map(c => `<tr><td><strong>${esc(c.azienda || '—')}</strong></td><td>${esc(c.referente || '—')}</td>
    <td>${esc(c.email || '—')}</td><td>${esc(c.telefono || '—')}</td><td>${esc(c.piva_cf || '—')}</td><td>${esc(c.citta || '—')}</td>
    <td style="white-space:nowrap"><button class="bsm bdel" onclick="openCliModal('${c.id}')">✏️</button><button class="bsm bdel" onclick="delCli('${c.id}')">✕</button></td></tr>`).join('');
  $('cli-more').textContent = rows.length > LIM ? `Mostrati i primi ${LIM}: usa la ricerca per restringere.` : (rows.length ? '' : 'Nessun cliente');
}
const CF = { co: 'azienda', cn: 'referente', ca: 'indirizzo', cit: 'citta', cv: 'piva_cf', ce: 'email', cp: 'telefono' };
function openCliModal(id = '') {
  $('cli-modal-ttl').textContent = id ? 'Modifica Cliente' : 'Aggiungi Cliente';
  $('cli-modal-id').value = id;
  const c = id ? CLIS.find(x => x.id === id) : {};
  Object.entries(CF).forEach(([f, k]) => $('mc-' + f).value = c[k] || '');
  $('cli-modal').classList.add('on');
}
function closeCliModal() { $('cli-modal').classList.remove('on'); }
async function saveCliModal() {
  const c = {}; Object.entries(CF).forEach(([f, k]) => c[k] = $('mc-' + f).value);
  if (!c.azienda.trim() && !c.referente.trim()) return showMsg('Inserisci nome o ragione sociale', 'warn');
  const id = $('cli-modal-id').value; if (id) c.id = id;
  try {
    const s = await api('clienti', { method: 'POST', body: c });
    s._n = norm(s.azienda + ' ' + s.referente + ' ' + s.citta);
    const i = CLIS.findIndex(x => x.id === s.id); if (i >= 0) CLIS[i] = s; else CLIS.unshift(s);
    renderCli(); closeCliModal(); salvaCache(); showMsg('Cliente salvato');
  } catch (e) { fail(e); }
}
async function delCli(id) {
  if (!confirm('Eliminare il cliente? I preventivi già fatti restano intatti.')) return;
  try { await api('clienti?id=' + id, { method: 'DELETE' }); CLIS = CLIS.filter(c => c.id !== id); renderCli(); salvaCache(); showMsg('Cliente eliminato'); }
  catch (e) { fail(e); }
}
const mapCol = (row, ks) => { for (const k of ks) for (const rk of Object.keys(row)) if (norm(rk).includes(norm(k))) return String(row[rk] ?? '').trim(); return ''; };
function readSheet(inp, cb) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => { const wb = XLSX.read(e.target.result, { type: 'array' }); cb(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })); inp.value = ''; };
  r.readAsArrayBuffer(f);
}
function importCli(inp) {
  readSheet(inp, async rows => {
    const cl = rows.map(r => ({
      azienda: mapCol(r, ['azienda', 'ragione', 'company', 'societa']), referente: mapCol(r, ['referente', 'nome', 'name']),
      indirizzo: mapCol(r, ['indirizzo', 'address', 'via']), citta: mapCol(r, ['citta', 'city', 'localita', 'cap']),
      piva_cf: mapCol(r, ['piva', 'p.iva', 'iva', 'vat']), email: mapCol(r, ['email', 'mail']), telefono: mapCol(r, ['telefono', 'tel', 'phone', 'cellulare']),
    })).filter(c => c.azienda || c.referente);
    if (!cl.length) return showMsg('Nessun cliente riconosciuto', 'warn');
    const have = new Set(CLIS.map(c => norm(c.azienda + c.referente).replace(/\s+/g, '')));
    const nuovi = cl.filter(c => !have.has(norm(c.azienda + c.referente).replace(/\s+/g, '')));
    if (!nuovi.length) return showMsg('Tutti i clienti sono già in rubrica');
    try { await api('clienti', { method: 'POST', body: nuovi }); CLIS = await api('clienti'); CLIS.forEach(c => c._n = norm(c.azienda + ' ' + c.referente + ' ' + c.citta)); renderCli(); salvaCache(); showMsg(`${nuovi.length} nuovi clienti importati (${cl.length - nuovi.length} già presenti)`); }
    catch (e) { fail(e); }
  });
}
function exportCli() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(CLIS.map(c => ({ 'Ragione Sociale': c.azienda, Referente: c.referente, Indirizzo: c.indirizzo, 'Città': c.citta, 'P.IVA': c.piva_cf, Email: c.email, Telefono: c.telefono }))), 'Clienti');
  XLSX.writeFile(wb, 'Clienti_GettoShop.xlsx');
}

// ─────────── PRODOTTI ───────────
function renderProd() {
  const q = norm($('pq').value).trim(), cat = $('pcat').value;
  const fd = $('pdoc').value;
  const rows = PRODS.filter(p => (!cat || p.categoria === cat) && (!q || p._n.includes(q)) && (!fd || docTot(p.sku) === fd));
  const cnt = { verde: 0, giallo: 0, rosso: 0 }; PRODS.forEach(p => cnt[docTot(p.sku)]++);
  $('prod-doc').innerHTML = `<span class="spia spia-verde"></span> ${cnt.verde} &nbsp;<span class="spia spia-giallo"></span> ${cnt.giallo} &nbsp;<span class="spia spia-rosso"></span> ${cnt.rosso}`;
  $('prod-cnt').textContent = `(${rows.length}${rows.length !== PRODS.length ? ' di ' + PRODS.length : ''})`;
  $('prod-body').innerHTML = rows.slice(0, LIM).map(p => `<tr>
    <td>${p.foto_url ? `<img src="${esc(p.foto_url)}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid #eee" loading="lazy" onerror="this.style.display='none'">` : '<span style="color:#ddd">—</span>'}</td>
    <td><span class="skub">${esc(p.sku)}</span></td><td style="max-width:260px"><strong>${esc(p.nome)}</strong></td>
    <td style="white-space:nowrap">${p.prezzo > 0 ? eur(p.prezzo) : '—'}</td><td style="font-size:11px;color:#999">${esc(p.categoria || '—')}</td>
    ${docCella(p.sku, 'istruzioni')}${docCella(p.sku, 'ce')}
    <td><button class="bsm" style="white-space:nowrap" onclick="schedaProdotto('${esc(p.sku)}', this)">📄 Scheda prodotto</button></td>
    <td><button class="bsm bdel" onclick="delProd('${esc(p.sku)}')">✕</button></td></tr>`).join('');
  $('prod-more').textContent = rows.length > LIM ? `Mostrati i primi ${LIM}: usa ricerca o categoria.` : '';
}
// Dalla lista prodotti: legge titolo, foto, prezzo e scheda dal sito e scarica subito il PDF
async function schedaProdotto(sku, btn) {
  const p = PRODS.find(x => x.sku === sku); if (!p) return;
  const lbl = btn.innerHTML; btn.disabled = true; btn.innerHTML = '⏳ Leggo dal sito…';
  try {
    brPick(p); await brLoad;
    const sito = !!brProd.url;
    const { doc, fname } = await buildBrochure(); doc.save(fname);
    showMsg(sito ? 'Scheda scaricata (dati letti dal sito, prezzo IVA esclusa del sito)' : 'Prodotto non presente sul sito: scheda creata con i dati del catalogo, controlla prezzo e testo', sito ? 'ok' : 'warn');
  } catch (e) { fail(e); }
  finally { btn.disabled = false; btn.innerHTML = lbl; }
}
async function delProd(sku) {
  if (!confirm('Rimuovere il prodotto dal catalogo? (I preventivi già fatti restano intatti)')) return;
  try { await api('prodotti?sku=' + encodeURIComponent(sku), { method: 'DELETE' }); PRODS = PRODS.filter(p => p.sku !== sku); renderProd(); salvaCache(); showMsg('Prodotto rimosso'); }
  catch (e) { fail(e); }
}
function importProd(inp) {
  readSheet(inp, async rows => {
    const ps = rows.map(r => ({
      sku: mapCol(r, ['sku', 'codice', 'cod', 'code']), nome: mapCol(r, ['nome', 'name', 'prodotto', 'product']),
      descrizione: mapCol(r, ['descrizione', 'desc']), prezzo: parseFloat(mapCol(r, ['prezzo', 'price', 'costo']).replace(',', '.')) || 0,
      categoria: mapCol(r, ['categoria', 'cat', 'category']), foto_url: mapCol(r, ['foto', 'immagine', 'image', 'url', 'link', 'img']),
    })).filter(p => p.sku && p.nome);
    if (!ps.length) return showMsg('Nessun prodotto riconosciuto (servono colonne SKU e Nome)', 'warn');
    if (!confirm(`Importare/aggiornare ${ps.length} prodotti (per SKU)?`)) return;
    try {
      await api('prodotti', { method: 'POST', body: ps });
      PRODS = await api('prodotti'); PRODS.forEach(p => p._n = norm(p.sku + ' ' + p.nome + ' ' + p.descrizione + ' ' + p.categoria));
      renderProd(); salvaCache(); showMsg(`${ps.length} prodotti importati/aggiornati`);
    } catch (e) { fail(e); }
  });
}

// ─────────── BROCHURE ───────────
let brProd = null, brLoad = null, brPrezzoManuale = false, brTitoloManuale = false;
function brSearch(v) {
  const d = $('br-drop');
  if (v.trim().length < 2) { d.classList.remove('on'); return; }
  const rs = searchP(v);
  d.innerHTML = rs.length ? rs.map(p => `<div class="sitem" data-sku="${esc(p.sku)}"><div style="flex:1;min-width:0"><div class="siname"><span class="sisku">${esc(p.sku)}</span>${esc(p.nome)}</div></div><div class="siprice">${p.prezzo > 0 ? eur(p.prezzo) : ''}</div></div>`).join('')
    : '<div class="sitem err"><div class="siname" style="color:#cc0000">Nessun prodotto trovato</div></div>';
  d.querySelectorAll('[data-sku]').forEach(el => el.onclick = () => brPick(PRODS.find(p => p.sku === el.dataset.sku)));
  d.classList.add('on');
}
function brPick(p) {
  brProd = { ...p }; brTitoloManuale = false; $('br-drop').classList.remove('on'); $('br-q').value = '';
  $('br-form').style.display = 'block';
  $('br-t').value = p.nome; $('br-sku').value = p.sku; $('br-p').value = ''; brPrezzoManuale = false;
  $('br-d').value = [p.descrizione && p.descrizione !== p.nome ? p.descrizione : '', p.categoria ? 'Categoria: ' + p.categoria : ''].filter(Boolean).join('\n');
  brPreview(); brLoad = brCarica();
}
// Scheda tecnica letta dalla pagina prodotto di gettoniere-shop.it (via backend): dimensioni, peso, caratteristiche
function schedaToText(s) {
  const L = [];
  if (s.intro) L.push('> ' + s.intro);
  (s.sezioni || []).forEach(sec => {
    L.push('# ' + sec.titolo);
    sec.voci.forEach(v => L.push(v.h ? '## ' + v.t : (v.d > 1 ? '- ' : '') + (v.l ? v.l + (v.t ? ': ' + v.t : ':') : v.t)));
  });
  return L.join('\n');
}
function brCaricaClick() { brLoad = brCarica(); return brLoad; }
async function brCarica() {
  if (!brProd) return;
  const sku = brProd.sku, st = $('br-st'), cat = brProd.prezzo;
  st.innerHTML = '⏳ Lettura della scheda tecnica dal sito…';
  try {
    const s = await api('scheda?sku=' + encodeURIComponent(sku));
    if (!brProd || brProd.sku !== sku) return;
    if (!s.trovato) { st.innerHTML = '<b style="color:#b45309">⚠ Questo prodotto non è sul sito (o con un altro codice): il PDF avrà solo il testo del catalogo. Scrivi a mano le caratteristiche qui sopra.</b>' + (cat > 0 ? '<br><b style="color:#b45309">⚠ Prezzo: ho messo quello del catalogo, controlla che sia IVA esclusa.</b>' : ''); if (!brPrezzoManuale && cat > 0) { $('br-p').value = cat; brPreview(); } return; }
    $('br-d').value = schedaToText(s);
    if (s.nome_sito && !brTitoloManuale) $('br-t').value = s.nome_sito; // titolo e foto come sul sito, non come nel catalogo importato
    if (s.foto_sito) brProd.foto_url = s.foto_sito;
    if (s.url) brProd.url = s.url;
    let np = '';
    if (!brPrezzoManuale) {
      if (s.prezzo_sito > 0) $('br-p').value = s.prezzo_sito; // prezzo pubblicato sul sito: sempre IVA esclusa
      else if (cat > 0) { $('br-p').value = cat; np = '<br><b style="color:#b45309">⚠ Prezzo non letto dal sito: ho messo quello del catalogo, controlla che sia IVA esclusa.</b>'; }
    }
    brPreview();
    st.innerHTML = `✓ Dati letti da <a href="${esc(s.url)}" target="_blank" rel="noopener">gettoniere-shop.it</a>: puoi modificarli prima di creare il PDF.`
      + (s.prezzo_sito > 0 ? `<br>Prezzo (IVA esclusa) preso dal sito: ${eur(s.prezzo_sito)}${brPrezzoManuale ? ' — non applicato perché l\'hai modificato tu' : ''}. Puoi cambiarlo qui sopra prima di creare il PDF.` : '') + np;
  } catch (e) { st.innerHTML = '<b style="color:#b45309">⚠ Lettura dal sito non riuscita (' + esc(e.message || e) + ')</b>: premi «Rileggi dal sito» o scrivi a mano le caratteristiche.'; }
}
// testo → struttura: "> intro", "# sezione", "Etichetta: testo", "- sotto-punto"
function brParse(txt) {
  const out = { intro: '', sezioni: [] }; let sec = null;
  txt.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
    if (l.startsWith('> ')) { out.intro = (out.intro ? out.intro + ' ' : '') + l.slice(2); return; }
    if (l.startsWith('# ')) { sec = { titolo: l.slice(2), voci: [] }; out.sezioni.push(sec); return; }
    if (!sec) { sec = { titolo: 'Caratteristiche', voci: [] }; out.sezioni.push(sec); }
    if (l.startsWith('## ')) { sec.voci.push({ l: '', t: l.slice(3), h: true }); return; }
    const sub = l.startsWith('- '); if (sub) l = l.slice(2);
    const m = /^([^:]{2,60}):\s*(.*)$/.exec(l);
    sec.voci.push({ l: m ? m[1] : '', t: m ? m[2] : l, sub });
  });
  return out;
}
function brFacts(m) { // riquadro "In breve": solo ciò che c'è nel testo
  const all = m.sezioni.flatMap(s => s.voci).filter(v => !v.h), f = [];
  const dim = all.find(v => /^dimensioni/i.test(v.l));
  if (dim) {
    const cut = dim.t.search(/\bPeso\b/i), d = (cut >= 0 ? dim.t.slice(0, cut) : dim.t).replace(/[.\s]+$/, '');
    const k = d.indexOf(':'), pesoM = /Peso:?\s*([^.]+(?:\.\d+)?)/i.exec(dim.t);
    f.push({ k: 'DIMENSIONI', v: (k >= 0 ? d.slice(k + 1) : d).trim(), s: k >= 0 && /larghezza.*altezza.*profondit/i.test(d.slice(0, k)) ? 'L × A × P' : '' });
    if (pesoM) f.push({ k: 'PESO', v: pesoM[1].trim().replace(/[.\s]+$/, ''), s: '' });
  }
  if (!f.some(x => x.k === 'PESO')) { const pv = all.find(v => /^peso/i.test(v.l)); if (pv) f.push({ k: 'PESO', v: pv.t.replace(/[.\s]+$/, ''), s: '' }); }
  const al = all.find(v => /^alimentazione/i.test(v.l)); if (al) f.push({ k: 'ALIMENTAZIONE', v: al.t.replace(/[.\s]+$/, ''), s: '' });
  const co = all.find(v => /^tempi di consegna/i.test(v.l)); if (co) f.push({ k: 'CONSEGNA', v: co.t.replace(/[.\s]+$/, ''), s: '' });
  return f.slice(0, 4);
}
function brPreview() {
  if (!brProd) return;
  const m = brParse($('br-d').value), facts = brFacts(m);
  $('br-prev').innerHTML = `<div style="text-align:center">${brProd.foto_url ? `<img src="${esc(brProd.foto_url)}" style="max-width:100%;max-height:200px;object-fit:contain">` : ''}</div>
    <h3 style="margin:10px 0 4px;color:#0b3560">${esc($('br-t').value)}</h3><div class="skub">${esc($('br-sku').value)}</div>
    ${m.intro ? `<p style="font-size:12.5px;margin:8px 0">${esc(m.intro)}</p>` : ''}
    ${facts.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">${facts.map(f => `<div style="background:#edf5fa;padding:6px 9px;border-radius:4px;font-size:11.5px"><div style="font-size:9px;color:#6b7280;font-weight:700">${f.k}</div><b style="color:#0b3560">${esc(f.v)}</b>${f.s ? ` <span style="color:#6b7280;font-size:10px">${f.s}</span>` : ''}</div>`).join('')}</div>` : ''}
    ${m.sezioni.map(s => `<div style="font-weight:700;color:#0b3560;margin:10px 0 3px;border-left:3px solid #1fa9d6;padding-left:6px">${esc(s.titolo)}</div><ul style="margin:0 0 0 18px;font-size:12px">${s.voci.map(v => v.h ? `<li style="list-style:none;margin-left:-14px;font-weight:700;color:#0b3560;margin-top:6px">${esc(v.t)}</li>` : `<li style="${v.sub ? 'margin-left:14px;' : ''}">${v.l ? `<b>${esc(v.l)}</b>${v.t ? ': ' : ''}` : ''}${esc(v.t)}</li>`).join('')}</ul>`).join('')}
    ${$('br-p').value ? `<div class="arc-tot">${eur(+$('br-p').value)} <span style="font-size:11px;color:#aaa;font-weight:400">IVA esclusa</span></div>` : ''}`;
}
async function imgData(url) { // la foto passa dal backend (il bucket S3 non ha CORS) e viene ridimensionata
  const data = (await api('img?u=' + encodeURIComponent(url))).dataUrl;
  // ridimensiona e comprime (le foto originali arrivano a 2000 px e gonfiano il PDF a decine di MB)
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = data; });
  const k = Math.min(1, 1000 / Math.max(im.naturalWidth, im.naturalHeight));
  const cv = document.createElement('canvas'); cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height);
  return { data: cv.toDataURL('image/jpeg', 0.85), w: cv.width, h: cv.height, fmt: 'JPEG' };
}
// Prova livelli di compattezza crescenti (foto più bassa, testo e spaziature leggermente ridotti) e usa il primo che sta in una pagina sola;
// se il testo è davvero lungo resta il layout normale su più pagine.
async function buildBrochure() {
  const livelli = [68, 62, 56, 50, 44, 38, 32].map(ph => ({ ph, k: 1 })).concat([{ ph: 38, k: 0.95 }, { ph: 32, k: 0.92 }, { ph: 28, k: 0.9 }, { ph: 0, k: 0.88 }]);
  const prima = await buildBrochureOnce(livelli[0]);
  if (prima.doc.getNumberOfPages() === 1) return prima;
  for (const lv of livelli.slice(1)) { const r = await buildBrochureOnce(lv); if (r.doc.getNumberOfPages() === 1) return r; }
  return prima;
}
async function buildBrochureOnce(lv) {
  const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4' }), W = 210, M = 15, R = W - M, BOT = 272;
  const NAVY = [11, 53, 96], CYAN = [31, 169, 214], ORANGE = [245, 166, 35], GREY = [107, 114, 128], INK = [31, 41, 55], PALE = [237, 245, 250], FR = [209, 213, 219];
  const fill = c => doc.setFillColor(c[0], c[1], c[2]), ink = c => doc.setTextColor(c[0], c[1], c[2]), stroke = c => doc.setDrawColor(c[0], c[1], c[2]);
  const font = (st, sz) => { doc.setFont('helvetica', st); doc.setFontSize(sz); };
  const title = $('br-t').value, sku = $('br-sku').value, price = parseFloat($('br-p').value);
  const mod = brParse($('br-d').value), facts = brFacts(mod);
  let y = 0;
  const need = h => { if (y + h > BOT) { doc.addPage(); y = 20; return true; } return false; };
  const section = t => { need(18); fill(CYAN); doc.rect(M, y, 1.6, 6.5, 'F'); ink(NAVY); font('bold', 12); doc.text(t, M + 4.5, y + 5); y += 11.5; };
  // intestazione
  try { if (LOGO) doc.addImage(LOGO, 'PNG', M, 12, 62, 10.5); } catch (e) {}
  ink(NAVY); font('bold', 19); doc.text('SCHEDA PRODOTTO', R, 18, { align: 'right' });
  ink(GREY); font('normal', 9); doc.text('www.gettoniere-shop.it', R, 25, { align: 'right' });
  stroke(NAVY); doc.setLineWidth(0.8); doc.line(M, 36, R, 36); doc.setLineWidth(0.2);
  // titolo prodotto
  font('bold', 16); const tl = doc.splitTextToSize(title, W - M * 2 - 14);
  const bh = 9 + tl.length * 7 + 7; y = 45;
  fill(PALE); doc.rect(M, y, W - M * 2, bh, 'F'); fill(NAVY); doc.rect(M, y, 1.8, bh, 'F');
  ink(NAVY); font('bold', 16); doc.text(tl, M + 7, y + 10);
  ink(GREY); font('normal', 9); doc.text('Cod. ' + sku, M + 7, y + 10 + tl.length * 7 - 1); y += bh + 7;
  // introduzione
  if (mod.intro) { ink(INK); font('normal', 9.5); doc.splitTextToSize(mod.intro, W - M * 2).forEach(l => { doc.text(l, M, y); y += 4.8; }); y += 4; }
  // foto
  if (brProd.foto_url && lv.ph > 0) {
    try {
      const im = (brProd._img && brProd._img.u === brProd.foto_url) ? brProd._img.v : (brProd._img = { u: brProd.foto_url, v: await imgData(brProd.foto_url) }).v, maxW = W - M * 2, maxH = lv.ph, k = Math.min(maxW / im.w, maxH / im.h);
      const w = im.w * k, h = im.h * k;
      need(maxH + 12);
      doc.addImage(im.data, im.fmt, M + (maxW - w) / 2, y + 3 + (maxH - h) / 2, w, h);
      stroke(FR); doc.roundedRect(M, y, maxW, maxH + 6, 2, 2, 'S'); y += maxH + 12;
    } catch (e) { showMsg('Foto non scaricabile: brochure senza immagine', 'warn'); }
  }
  // in breve: dimensioni, peso, alimentazione, consegna (solo se presenti nella scheda)
  if (facts.length) {
    const gap = 3, tw = (W - M * 2 - gap * (facts.length - 1)) / facts.length;
    font('bold', 9); const vl = facts.map(f => doc.splitTextToSize(f.v, tw - 6)), n = Math.max(...vl.map(v => v.length)), th = 10 + n * 4.2 + (facts.some(f => f.s) ? 4 : 0);
    need(th + 8);
    facts.forEach((f, i) => {
      const x = M + i * (tw + gap);
      fill(PALE); doc.rect(x, y, tw, th, 'F'); fill(ORANGE); doc.rect(x, y, tw, 1, 'F');
      ink(GREY); font('bold', 6.5); doc.text(f.k, x + 3, y + 5.2);
      ink(NAVY); font('bold', 9); vl[i].forEach((l, li) => doc.text(l, x + 3, y + 10 + li * 4.2));
      if (f.s) { ink(GREY); font('normal', 6.5); doc.text(f.s, x + 3, y + 10 + vl[i].length * 4.2 + 0.4); }
    });
    y += th + 9;
  }
  // sezioni della scheda tecnica
  const bul = (lb, tx, sub, soft) => {
    const x = M + (sub ? 8 : 1.2), sz = (soft ? 8.5 : 9.5) * lv.k, lh = (soft ? 4.2 : 4.9) * lv.k, tw = R - (x + 4) - 3;
    font('normal', sz); const full = lb ? (tx ? lb + ': ' + tx : lb) : tx, ls = doc.splitTextToSize(full, tw);
    need(ls.length * lh + 2);
    fill(sub ? CYAN : ORANGE); doc.circle(x, y - 1.2, sub ? 0.6 : 0.85, 'F');
    if (lb) {
      ink(soft ? GREY : INK); font('bold', sz); doc.text(lb + (tx ? ':' : ''), x + 4, y);
      const lw = doc.getTextWidth(lb + (tx ? ': ' : ' ')); font('normal', sz);
      doc.text(ls[0].slice(lb.length + (tx ? 1 : 0)).trim(), x + 4 + lw, y);
    } else { ink(soft ? GREY : INK); font('normal', sz); doc.text(ls[0], x + 4, y); }
    ink(soft ? GREY : INK); font('normal', sz); ls.slice(1).forEach((l, i) => doc.text(l, x + 4, y + (i + 1) * lh));
    y += ls.length * lh + (soft ? 1.3 : 1.7) * lv.k;
  };
  mod.sezioni.forEach(s => {
    const soft = /avvertenz/i.test(s.titolo);
    section(/^descrizione del prodotto$/i.test(s.titolo) ? 'Caratteristiche tecniche' : s.titolo);
    s.voci.forEach(v => { if (v.h) { need(10); y += 1.5; ink(NAVY); font('bold', 10); doc.text(v.t, M + 1.2, y); y += 5.5; } else bul(v.l, v.t, v.sub, soft); });
    y += 4 * lv.k;
  });
  const url = brProd.url || (SITE + '/search?q=' + encodeURIComponent(sku));
  y += 2; need((price > 0 ? 18 : 0) + 14);
  if (price > 0) {
    fill(NAVY); doc.rect(M, y, W - M * 2, 14, 'F'); fill(ORANGE); doc.rect(M, y, 3.5, 14, 'F');
    ink([255, 255, 255]); font('bold', 10); doc.text('PREZZO (IVA ESCLUSA)', M + 9, y + 9);
    font('bold', 15); const s = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price) + ' + IVA';
    doc.text(s, R - 6, y + 9.6, { align: 'right' }); doc.text('€', R - 6 - doc.getTextWidth(s) - 1.2, y + 9.6, { align: 'right' });
    y += 18;
  }
  // pulsante verso la scheda online (cliccabile nel PDF)
  fill(ORANGE); doc.roundedRect(M, y, W - M * 2, 11, 2, 2, 'F');
  ink(NAVY); font('bold', 11); doc.text('VAI AL PRODOTTO SUL SITO  >', W / 2, y + 7.2, { align: 'center' });
  doc.link(M, y, W - M * 2, 11, { url });
  ink(GREY); font('normal', 7); doc.text(url.replace('https://www.', ''), W / 2, y + 15, { align: 'center' });
  // piè di pagina
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    stroke(CYAN); doc.setLineWidth(0.5); doc.line(M, 281, R, 281); doc.setLineWidth(0.2);
    ink(NAVY); font('bold', 8); doc.text(FOOT1, W / 2, 286, { align: 'center' });
    ink(GREY); font('normal', 8); doc.text(FOOT2, W / 2, 290.5, { align: 'center' });
    if (n > 1) { font('normal', 7); doc.text(`pag. ${p}/${n}`, R, 295, { align: 'right' }); }
  }
  return { doc, fname: `Brochure_${sku}_${title.replace(/[^\w]+/g, '_').slice(0, 40)}.pdf` };
}
async function brPDF() {
  if (!brProd) return;
  if (brLoad) { // se la scheda dal sito è ancora in lettura, aspetto: altrimenti il PDF uscirebbe con il testo provvisorio
    if (await Promise.race([brLoad.then(() => false, () => false), Promise.resolve(true)])) $('br-st').innerHTML = '⏳ Attendo la scheda tecnica dal sito…';
    try { await brLoad; } catch (e) { /* già segnalato */ }
  }
  const { doc, fname } = await buildBrochure(); doc.save(fname);
}
document.addEventListener('click', e => { if (!e.target.closest('#v-brochure .srel')) $('br-drop')?.classList.remove('on'); });
