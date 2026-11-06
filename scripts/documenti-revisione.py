#!/usr/bin/env python3
"""Genera la pagina di revisione abbinamenti manuale → prodotto (HTML autonomo, un solo file).
Legge data/documenti-proposta.json + data/documenti-candidati.json e scrive documenti-revisione.html.
L'utente spunta i prodotti giusti per ogni manuale e scarica "conferme.json".
"""
import json, os, re, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
D = lambda f: os.path.join(HERE, '..', 'data', f)
units = json.load(open(D('documenti-proposta.json')))
prod = json.load(open(D('prodotti.json')))
cand = json.load(open(D('documenti-candidati.json'))) if os.path.exists(D('documenti-candidati.json')) else {}
P = {p['sku'].upper(): p for p in prod}
FOTO = json.load(open(D('site-foto.json'))) if os.path.exists(D('site-foto.json')) else {}


def norm(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s.upper()) if unicodedata.category(c) != 'Mn')


STOP = {'GETT', 'GETTONIERA', 'GETTONIERE', 'PER', 'CON', 'COMPLETA', 'MANUALE', 'ISTRUZIONI', 'REV', 'COPIA', 'FABIO', 'SUMIT'}
tok = lambda s: {w for w in re.findall(r'[A-Z0-9]{3,}', norm(s)) if w not in STOP}


def locali(u, n=4):
    ut, sc = tok(u), []
    for p in prod:
        k = len(ut & tok(p['name'] + ' ' + p.get('desc', '') + ' ' + p.get('cat', '')))
        if k:
            sc.append((k, p['sku']))
    return [s for _, s in sorted(sc, reverse=True)[:n]]


rows = []
for u in units:
    doc = {l: {'file': d['file'].split('/')[-1], 'data': d['data'], 'ext': d['ext']} for l, d in u['doc'].items()}
    if u['sku']:
        rows.append({'u': u['unita'], 'auto': u['sku'], 'doc': doc, 'c': []})
        continue
    c = []
    for s in (cand.get(u['unita'], {}).get('hits', []) + locali(u['unita'])):
        s = s.upper()
        if s in P and s not in c:
            c.append(s)
    rows.append({'u': u['unita'], 'auto': [], 'doc': doc, 'c': c[:6], 'q': cand.get(u['unita'], {}).get('query', '')})

catalogo = {k: {'n': v['name'], 'p': v['price'], 'f': FOTO.get(k, v.get('foto', '')), 'c': v.get('cat', '')} for k, v in P.items()}
html = open(os.path.join(HERE, 'documenti-revisione.template.html'), encoding='utf-8').read()
html = html.replace('/*ROWS*/[]', json.dumps(rows, ensure_ascii=False)).replace('/*CAT*/{}', json.dumps(catalogo, ensure_ascii=False))
out = os.path.join(HERE, '..', 'documenti-revisione.html')
open(out, 'w', encoding='utf-8').write(html)
print('scritto', os.path.abspath(out), '| da confermare', sum(1 for r in rows if not r['auto']), '| già con codice', sum(1 for r in rows if r['auto']))
