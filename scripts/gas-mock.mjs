// Simulazione locale dei servizi Google (Fogli, Drive, Mail, Utilities...) per eseguire apps-script/Code.gs
// in locale senza account. Usata dal server di prova e dai test.
import vm from 'node:vm';
import crypto from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const signed = buf => Array.from(buf, b => (b << 24) >> 24);
const toBuf = v => typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(Array.from(v, x => x & 255));

export function createBackend({ codeFiles, persistFile, driveDir } = {}) {
  const st = persistFile && existsSync(persistFile)
    ? JSON.parse(readFileSync(persistFile, 'utf8')) : { sheets: {}, props: {}, files: {} };
  const save = () => persistFile && writeFileSync(persistFile, JSON.stringify(st));
  const outbox = [];
  const cache = new Map();

  // ── Fogli ──
  const sheetObj = (ssId, name) => {
    const data = () => st.sheets[ssId][name];
    const rng = (r, c, nr = 1, nc = 1) => ({
      setNumberFormat() { return this; },
      getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (data()[r - 1 + i] || [])[c - 1 + j] ?? '')); },
      setValues(v) { v.forEach((row, i) => { const R = data()[r - 1 + i] ||= []; row.forEach((x, j) => R[c - 1 + j] = x); }); return this; },
      setValue(x) { (data()[r - 1] ||= [])[c - 1] = x; return this; },
      clearContent() { for (let i = 0; i < nr; i++) { const R = data()[r - 1 + i]; if (R) for (let j = 0; j < nc; j++) R[c - 1 + j] = ''; } return this; },
    });
    return {
      setName(n) { st.sheets[ssId][n] = st.sheets[ssId][name]; delete st.sheets[ssId][name]; name = n; },
      getRange: rng, setFrozenRows() {}, getMaxRows: () => 2000,
      getLastRow() { const d = data(); for (let i = d.length - 1; i >= 0; i--) if ((d[i] || []).some(x => x !== '' && x != null)) return i + 1; return 0; },
    };
  };
  const ssObj = id => ({
    getId: () => id,
    getSheets: () => Object.keys(st.sheets[id]).map(n => sheetObj(id, n)),
    insertSheet(n) { st.sheets[id][n] = []; return sheetObj(id, n); },
    getSheetByName: n => st.sheets[id][n] ? sheetObj(id, n) : null,
  });

  const Utilities = {
    getUuid: () => crypto.randomUUID(),
    computeHmacSha256Signature: (v, k) => signed(crypto.createHmac('sha256', toBuf(k)).update(toBuf(v)).digest()),
    newBlob(data, type, name) { const b = toBuf(data); return { getBytes: () => signed(b), getDataAsString: () => b.toString('utf8'), getName: () => name || '', getContentType: () => type || 'text/plain' }; },
    base64Encode: v => toBuf(v).toString('base64'),
    base64EncodeWebSafe: v => toBuf(v).toString('base64url') + '=='.slice(0, (4 - toBuf(v).toString('base64url').length % 4) % 4),
    base64Decode: s => signed(Buffer.from(s, 'base64')),
    base64DecodeWebSafe: s => signed(Buffer.from(s, 'base64url')),
    formatDate: (d, tz, f) => d.toISOString().slice(0, 10),
    sleep() {},
  };

  const folders = st.folders ||= {};
  const ctx = vm.createContext({
    console, JSON, Math, Date, parseInt, parseFloat, isFinite, String, Array, Object, RegExp, Number,
    Utilities,
    SpreadsheetApp: {
      create(name) { const id = 'ss-' + crypto.randomUUID(); st.sheets[id] = { Sheet1: [] }; return ssObj(id); },
      openById: id => { if (!st.sheets[id]) throw new Error('Foglio inesistente'); return ssObj(id); },
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => st.props[k] ?? null, setProperty: (k, v) => { st.props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => { cache.set(k, v); }, remove: k => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) },
    MailApp: {
      getRemainingDailyQuota: () => 100,
      sendEmail(to, subject, body, opt) { outbox.push({ to, subject, body, name: opt.name, replyTo: opt.replyTo, allegati: (opt.attachments || []).map(a => ({ nome: a.getName(), byte: a.getBytes().length })) }); },
    },
    DriveApp: {
      getFolderById: id => { if (!folders[id]) throw new Error('no folder'); return folderObj(id); },
      getFoldersByName: n => { const id = Object.keys(folders).find(k => folders[k] === n); const it = id ? [folderObj(id)] : []; return { hasNext: () => it.length > 0, next: () => it.shift() }; },
      createFolder: n => { const id = 'fld-' + crypto.randomUUID(); folders[id] = n; return folderObj(id); },
    },
    UrlFetchApp: {
      fetch(url) {
        try { const out = execFileSync('curl', ['-s', '-m', '15', '-w', '\n%{http_code}', url], { maxBuffer: 20e6 }); const i = out.lastIndexOf(10);
          const body = out.subarray(0, i), code = parseInt(out.subarray(i + 1).toString(), 10);
          return { getResponseCode: () => code, getBlob: () => Utilities.newBlob(body, 'image/jpeg', 'img') }; }
        catch { return { getResponseCode: () => 502, getBlob: () => null }; }
      },
    },
  });
  function folderObj(id) {
    const files = st.files[id] ||= {};
    return {
      getId: () => id,
      getFilesByName(n) { const f = files[n] ? [fileObj(id, n)] : []; return { hasNext: () => f.length > 0, next: () => f.shift() }; },
      createFile(blob) {
        const n = blob.getName(); files[n] = { trashed: false, size: blob.getBytes().length };
        if (driveDir) { mkdirSync(driveDir, { recursive: true }); writeFileSync(join(driveDir, n), toBuf(blob.getBytes())); }
        return fileObj(id, n);
      },
    };
  }
  const fileObj = (fid, n) => ({ setTrashed(t) { delete st.files[fid][n]; return this; }, getUrl: () => `https://drive.google.com/file/d/prova-${encodeURIComponent(n)}/view` });

  for (const f of codeFiles) if (existsSync(f)) vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: f });

  return {
    ctx, outbox, state: st,
    call(req) { // ritorna l'oggetto JSON che il frontend riceverebbe
      const out = ctx.doPost({ postData: { contents: JSON.stringify(req) } });
      save();
      return JSON.parse(out.getContent());
    },
  };
}
