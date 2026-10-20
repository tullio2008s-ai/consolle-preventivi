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

let PRODS = [], CLIS = [], ARCH = [];
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
function doLogout() { setToken(''); location.reload(); }
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
  try {
    [PRODS, CLIS] = await Promise.all([api('prodotti'), api('clienti')]);
    PRODS.forEach(p => p._n = norm(p.sku + ' ' + p.nome + ' ' + p.descrizione + ' ' + p.categoria));
    CLIS.forEach(c => c._n = norm(c.azienda + ' ' + c.referente + ' ' + c.citta));
    $('tip-cnt').innerHTML = `Catalogo: <b>${PRODS.length} prodotti</b> — Rubrica: <b>${CLIS.length} clienti</b>.`;
    $('pcat').innerHTML = '<option value="">Tutte le categorie</option>' + [...new Set(PRODS.map(p => p.categoria))].sort().map(c => `<option>${esc(c)}</option>`).join('');
  } catch (e) { fail(e); }
  showTab('dashboard');
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
    showMsg('Cliente salvato in rubrica');
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
  if (!rs.length) { d.innerHTML = '<div class="sitem err"><div class="siname" style="color:#cc0000">Nessun prodotto trovato — compila manualmente</div></div>'; d.classList.add('on'); return; }
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
  const W = 210, M = 14; let y = 0;

  // HEADER
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, 38, 'F');
  doc.setFillColor(204, 0, 0); doc.rect(0, 35, W, 3, 'F');
  try { if (LOGO) doc.addImage(LOGO, 'PNG', M, 8, 58, 9.9); } catch (e) {}
  const cx = W / 2;
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
  doc.text('commerciale@gettoniere-shop.it', cx, 11, { align: 'center' });
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
  doc.text('Tel. 340 0069549  |  www.gettoniere-shop.it', cx, 18, { align: 'center' });
  doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(cx - 42, 21, cx + 42, 21); doc.setLineWidth(0.2);
  doc.setFillColor(204, 0, 0); doc.roundedRect(W - 58, 2, 44, 30, 3, 3, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('PREVENTIVO', W - 36, 10, { align: 'center' });
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.text(num, W - 36, 17, { align: 'center' });
  doc.setFontSize(7); doc.text('Data: ' + date, W - 36, 23, { align: 'center' });
  doc.setFontSize(6.5); doc.text('Valido: ' + valid, W - 36, 29, { align: 'center' });
  y = 41;

  // BOX CLIENTE + CONDIZIONI
  doc.setFillColor(250, 250, 250); doc.setDrawColor(235, 235, 235);
  doc.roundedRect(M, y, 82, 50, 2, 2, 'FD'); doc.roundedRect(M + 86, y, 98, 50, 2, 2, 'FD');
  doc.setFillColor(204, 0, 0);
  doc.roundedRect(M, y, 82, 7, 2, 2, 'F'); doc.rect(M, y + 3, 82, 4, 'F');
  doc.roundedRect(M + 86, y, 98, 7, 2, 2, 'F'); doc.rect(M + 86, y + 3, 98, 4, 'F');
  doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('DESTINATARIO', M + 3, y + 5); doc.text('CONDIZIONI COMMERCIALI', M + 89, y + 5);
  doc.setFontSize(7); doc.setTextColor(30, 30, 30);
  [co, co !== cn ? cn : '', ca, cit, cv ? 'P.IVA: ' + cv : '', ce, cp].filter(Boolean).slice(0, 7).forEach((l, i) => {
    doc.setFont('helvetica', i <= 1 ? 'bold' : 'normal'); doc.text(l.slice(0, 33), M + 3, y + 13 + i * 5.2);
  });
  [['Pagamento:', pay], ['Consegna:', delivery ? delivery + ' gg lav.' : 'Da concordare'], ['Resa:', resa || 'Da concordare'],
    ['Garanzia:', gar || 'Come da legge'], ["Validita':", valid], ['Spedizione:', sc > 0 ? sn : 'Da concordare']].forEach(([lb, v], i) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5); doc.setTextColor(150, 150, 150); doc.text(lb, M + 89, y + 13 + i * 6.6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(30, 30, 30); doc.text(String(v).slice(0, 52), M + 106, y + 13 + i * 6.6);
  });
  y += 55;

  // TABELLA
  const tableHead = () => {
    doc.setFillColor(30, 30, 30); doc.rect(M, y, W - M * 2, 7, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(5.5); doc.setFont('helvetica', 'bold');
    doc.text('Cod.', C.cod, y + 4.8); doc.text('Descrizione', C.dsc, y + 4.8); doc.text("Q.ta'", C.qty + 3, y + 4.8, { align: 'center' });
    doc.text('Prezzo', C.prc, y + 4.8); doc.text('Sc.%', C.dis, y + 4.8); doc.text('Impon.', C.imp, y + 4.8);
    doc.text('IVA', C.iva, y + 4.8); doc.text('Totale', C.tot, y + 4.8); y += 8;
  };
  const C = { ph: M + 0.5, cod: M + 12, dsc: M + 28, qty: M + 97, prc: M + 107, dis: M + 122, imp: M + 134, iva: M + 149, tot: M + 159 };
  tableHead();
  items.forEach((it, i) => {
    const tt = calcRow(it);
    const dLns = doc.splitTextToSize(it.descrizione || '—', 57);
    const nLns = it.nota ? doc.splitTextToSize('- ' + it.nota, 57) : [];
    const rH = Math.max(dLns.length * 4.6 + (nLns.length ? nLns.length * 4 + 2 : 0) + 7, 14);
    if (y + rH > 268) { doc.addPage(); y = 14; tableHead(); }
    const g = i % 2 === 0 ? 255 : 247;
    doc.setFillColor(g, g, g); doc.rect(M, y, W - M * 2, rH, 'F');
    doc.setFillColor(204, 0, 0); doc.rect(M, y, 1.5, rH, 'F');
    doc.setDrawColor(235, 235, 235); doc.line(M + 1.5, y + rH, W - M, y + rH);
    if (it.foto_url) {
      const lx = C.ph + 0.5, ly = y + rH / 2 + 1.5;
      doc.setFontSize(6); doc.setFont('helvetica', 'bolditalic'); doc.setTextColor(0, 90, 200);
      doc.textWithLink('> vedi', lx, ly, { url: SITE + '/search?q=' + encodeURIComponent(it.sku || '') });
      const tw = doc.getTextWidth('> vedi'); doc.setDrawColor(0, 90, 200); doc.line(lx, ly + 0.5, lx + tw, ly + 0.5);
    }
    const mY = y + rH / 2 + 1.5;
    doc.setTextColor(40, 40, 40); doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
    doc.text((it.sku || '—').slice(0, 9), C.cod, y + 5.5);
    dLns.forEach((l, li) => doc.text(l, C.dsc, y + 5.5 + li * 4.6));
    if (nLns.length) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(6); doc.setTextColor(160, 160, 160);
      nLns.forEach((l, li) => doc.text(l, C.dsc, y + 5.5 + dLns.length * 4.6 + 2 + li * 4));
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(40, 40, 40);
    }
    doc.text(String(it.quantita || 0), C.qty + 3, mY, { align: 'center' });
    doc.text(it.prezzo_unit ? 'E ' + fmt(it.prezzo_unit) : '—', C.prc, mY);
    doc.text(it.sconto_pct ? it.sconto_pct + '%' : '—', C.dis, mY);
    doc.text('E ' + fmt(tt.imp), C.imp, mY); doc.text(it.iva_pct + '%', C.iva, mY);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(204, 0, 0); doc.text('E ' + fmt(tt.tot), C.tot, mY);
    y += rH;
  });
  if (sc > 0) {
    if (y + 10 > 268) { doc.addPage(); y = 14; }
    doc.setFillColor(255, 252, 235); doc.rect(M, y, W - M * 2, 10, 'F');
    doc.setFillColor(180, 150, 0); doc.rect(M, y, 1.5, 10, 'F');
    doc.setDrawColor(220, 200, 130); doc.line(M + 1.5, y + 10, W - M, y + 10);
    const mY = y + 6; doc.setTextColor(100, 80, 0); doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5);
    doc.text('TRASP', C.cod, mY); doc.text(sn || 'Spedizione', C.dsc, mY); doc.text('1', C.qty, mY); doc.text('E ' + fmt(sc), C.prc, mY);
    doc.text('—', C.dis, mY); doc.text('E ' + fmt(sc), C.imp, mY); doc.text('22%', C.iva, mY);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(180, 140, 0); doc.text('E ' + fmt(st), C.tot, mY);
    y += 10;
  }
  if (y + 52 > 276) { doc.addPage(); y = 14; }
  doc.setDrawColor(204, 0, 0); doc.setLineWidth(0.6); doc.line(M, y + 2, W - M, y + 2); doc.setLineWidth(0.2);
  y += 8;

  // TOTALI
  doc.setFillColor(25, 25, 25); doc.roundedRect(W - M - 80, y, 80, 43, 3, 3, 'F');
  doc.setTextColor(150, 150, 150); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text('Imponibile:', W - M - 75, y + 10); doc.text('IVA:', W - M - 75, y + 19);
  doc.setTextColor(220, 220, 220);
  doc.text('E ' + fmt(gI), W - M - 5, y + 10, { align: 'right' }); doc.text('E ' + fmt(gV), W - M - 5, y + 19, { align: 'right' });
  doc.setFillColor(204, 0, 0); doc.rect(W - M - 80, y + 24, 80, 19, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text('TOTALE IVA INCLUSA', W - M - 75, y + 32); doc.setFontSize(12); doc.text('E ' + fmt(gT), W - M - 5, y + 40, { align: 'right' });

  if (notes.trim()) {
    const nl = doc.splitTextToSize(notes, (W - M * 2) - 100 > 60 ? 90 : 90);
    const nh = Math.min(nl.length * 5 + 10, 43);
    doc.setFillColor(255, 253, 235); doc.setDrawColor(255, 210, 0); doc.roundedRect(M, y, 92, nh, 2, 2, 'FD');
    doc.setFillColor(255, 190, 0); doc.rect(M, y, 3, nh, 'F');
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(110, 75, 0); doc.text('NOTE:', M + 5, y + 7);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 50, 0);
    nl.slice(0, 7).forEach((l, i) => doc.text(l, M + 5, y + 13 + i * 5));
  }

  // FOOTER su ogni pagina
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFillColor(25, 25, 25); doc.rect(0, 278, W, 19, 'F'); doc.setFillColor(204, 0, 0); doc.rect(0, 278, W, 2, 'F');
    doc.setTextColor(160, 160, 160); doc.setFontSize(5.5); doc.setFont('helvetica', 'normal');
    doc.text(`Offerta valida per ${valid} dalla data di emissione. Prezzi IVA esclusa salvo diversa indicazione.`, M, 284.5);
    doc.setTextColor(215, 215, 215); doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
    doc.text(FOOT1, M, 289.5);
    doc.setFont('helvetica', 'normal'); doc.text(FOOT2, M, 294);
    if (pages > 1) { doc.setTextColor(160, 160, 160); doc.setFontSize(6); doc.text(`${p}/${pages}`, W - M, 294, { align: 'right' }); }
  }
  const fname = `Preventivo_${num}_${(co || cn || 'cliente').replace(/[^\w]+/g, '_')}.pdf`;
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
    renderCli(); closeCliModal(); showMsg('Cliente salvato');
  } catch (e) { fail(e); }
}
async function delCli(id) {
  if (!confirm('Eliminare il cliente? I preventivi già fatti restano intatti.')) return;
  try { await api('clienti?id=' + id, { method: 'DELETE' }); CLIS = CLIS.filter(c => c.id !== id); renderCli(); showMsg('Cliente eliminato'); }
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
    try { await api('clienti', { method: 'POST', body: nuovi }); CLIS = await api('clienti'); CLIS.forEach(c => c._n = norm(c.azienda + ' ' + c.referente + ' ' + c.citta)); renderCli(); showMsg(`${nuovi.length} nuovi clienti importati (${cl.length - nuovi.length} già presenti)`); }
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
  const rows = PRODS.filter(p => (!cat || p.categoria === cat) && (!q || p._n.includes(q)));
  $('prod-cnt').textContent = `(${rows.length}${rows.length !== PRODS.length ? ' di ' + PRODS.length : ''})`;
  $('prod-body').innerHTML = rows.slice(0, LIM).map(p => `<tr>
    <td>${p.foto_url ? `<img src="${esc(p.foto_url)}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid #eee" loading="lazy" onerror="this.style.display='none'">` : '<span style="color:#ddd">—</span>'}</td>
    <td><span class="skub">${esc(p.sku)}</span></td><td style="max-width:260px"><strong>${esc(p.nome)}</strong></td>
    <td style="white-space:nowrap">${p.prezzo > 0 ? eur(p.prezzo) : '—'}</td><td style="font-size:11px;color:#999">${esc(p.categoria || '—')}</td>
    <td><button class="bsm bdel" onclick="delProd('${esc(p.sku)}')">✕</button></td></tr>`).join('');
  $('prod-more').textContent = rows.length > LIM ? `Mostrati i primi ${LIM}: usa ricerca o categoria.` : '';
}
async function delProd(sku) {
  if (!confirm('Rimuovere il prodotto dal catalogo? (I preventivi già fatti restano intatti)')) return;
  try { await api('prodotti?sku=' + encodeURIComponent(sku), { method: 'DELETE' }); PRODS = PRODS.filter(p => p.sku !== sku); renderProd(); showMsg('Prodotto rimosso'); }
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
      renderProd(); showMsg(`${ps.length} prodotti importati/aggiornati`);
    } catch (e) { fail(e); }
  });
}

// ─────────── BROCHURE ───────────
let brProd = null;
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
  brProd = p; $('br-drop').classList.remove('on'); $('br-q').value = '';
  $('br-form').style.display = 'block';
  $('br-t').value = p.nome; $('br-sku').value = p.sku; $('br-p').value = p.prezzo > 0 ? p.prezzo : '';
  $('br-d').value = [p.descrizione && p.descrizione !== p.nome ? p.descrizione : '', p.categoria ? 'Categoria: ' + p.categoria : ''].filter(Boolean).join('\n');
  brPreview();
}
function brPreview() {
  if (!brProd) return;
  const lines = $('br-d').value.split('\n').filter(l => l.trim());
  $('br-prev').innerHTML = `<div style="text-align:center">${brProd.foto_url ? `<img src="${esc(brProd.foto_url)}" style="max-width:100%;max-height:220px;object-fit:contain">` : ''}</div>
    <h3 style="margin:10px 0 4px;color:#111">${esc($('br-t').value)}</h3><div class="skub">${esc($('br-sku').value)}</div>
    <ul style="margin:10px 0 10px 18px;font-size:13px">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
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
async function buildBrochure() {
  const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4' }), W = 210, M = 16;
  const title = $('br-t').value, sku = $('br-sku').value, price = parseFloat($('br-p').value);
  const lines = $('br-d').value.split('\n').map(l => l.trim()).filter(Boolean);
  // header
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, 34, 'F'); doc.setFillColor(204, 0, 0); doc.rect(0, 31, W, 3, 'F');
  try { if (LOGO) doc.addImage(LOGO, 'PNG', M, 9, 62, 10.5); } catch (e) {}
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(204, 0, 0); doc.text('SCHEDA PRODOTTO', W - M, 14, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120); doc.setFontSize(8); doc.text('www.gettoniere-shop.it', W - M, 20, { align: 'right' });
  // titolo
  let y = 48; doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(20, 20, 20);
  const tl = doc.splitTextToSize(title, W - M * 2); doc.text(tl, M, y); y += tl.length * 8;
  doc.setFont('courier', 'bold'); doc.setFontSize(9); doc.setTextColor(204, 0, 0); doc.text('COD. ' + sku, M, y); y += 8;
  // foto
  if (brProd.foto_url) {
    try {
      const im = await imgData(brProd.foto_url), maxW = W - M * 2, maxH = 95, k = Math.min(maxW / im.w, maxH / im.h);
      const w = im.w * k, h = im.h * k;
      doc.addImage(im.data, im.fmt, M + (maxW - w) / 2, y + 3 + (maxH - h) / 2, w, h);
      doc.setDrawColor(235, 235, 235); doc.roundedRect(M, y, maxW, maxH + 6, 2, 2, 'S'); y += maxH + 14;
    } catch (e) { showMsg('Foto non scaricabile: brochure senza immagine', 'warn'); }
  }
  // caratteristiche
  if (lines.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(204, 0, 0); doc.text('CARATTERISTICHE', M, y); y += 2;
    doc.setDrawColor(204, 0, 0); doc.line(M, y, M + 38, y); y += 7;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(40, 40, 40);
    lines.forEach(l => { doc.splitTextToSize(l, W - M * 2 - 6).forEach((s, i) => { if (y > 262) { doc.addPage(); y = 20; } if (!i) { doc.setFillColor(204, 0, 0); doc.circle(M + 1, y - 1.2, 0.8, 'F'); } doc.text(s, M + 5, y); y += 5.5; }); y += 1; });
  }
  if (price > 0) {
    y += 4; if (y > 250) { doc.addPage(); y = 20; }
    doc.setFillColor(25, 25, 25); doc.roundedRect(M, y, W - M * 2, 16, 2, 2, 'F'); doc.setFillColor(204, 0, 0); doc.rect(M, y, 3, 16, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text('Prezzo (IVA esclusa)', M + 8, y + 10);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('E ' + fmt(price), W - M - 6, y + 11, { align: 'right' });
  }
  // footer
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p); doc.setFillColor(25, 25, 25); doc.rect(0, 278, W, 19, 'F'); doc.setFillColor(204, 0, 0); doc.rect(0, 278, W, 2, 'F');
    doc.setTextColor(215, 215, 215); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    doc.text(FOOT1, W / 2, 287, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 180); doc.setFontSize(7);
    doc.text(FOOT2, W / 2, 292.5, { align: 'center' });
  }
  return { doc, fname: `Brochure_${sku}_${title.replace(/[^\w]+/g, '_').slice(0, 40)}.pdf` };
}
async function brPDF() {
  if (!brProd) return;
  const { doc, fname } = await buildBrochure(); doc.save(fname);
}
document.addEventListener('click', e => { if (!e.target.closest('#v-brochure .srel')) $('br-drop')?.classList.remove('on'); });
