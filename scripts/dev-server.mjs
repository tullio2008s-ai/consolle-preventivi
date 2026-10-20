// Server di PROVA: serve il sito (docs/) e fa girare il vero backend apps-script/Code.gs con servizi Google simulati.
// Avvio: npm run dev  →  http://localhost:3000   (dati in data/local-sheet.json, PDF in data/drive-prova/)
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackend } from './gas-mock.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
mkdirSync(join(root, 'data'), { recursive: true });
const be = createBackend({
  codeFiles: [join(root, 'apps-script/Code.gs'), join(root, 'apps-script/Seed.gs')],
  persistFile: join(root, 'data/local-sheet.json'), driveDir: join(root, 'data/drive-prova'),
});
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const site = join(root, 'docs');

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api' && req.method === 'POST') {
    let raw = ''; for await (const c of req) raw += c;
    let out; try { out = be.call(JSON.parse(raw)); } catch (e) { out = { error: 'Errore del server di prova: ' + e.message, status: 500 }; }
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(out));
  }
  const f = join(site, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
  if (!f.startsWith(site) || !existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(readFileSync(f));
}).listen(3000, () => console.log('Prova su http://localhost:3000'));
