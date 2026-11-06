#!/usr/bin/env python3
"""Inventario dei manuali (Dropbox) e proposta di abbinamento ai prodotti del catalogo.
Non modifica nulla: legge le cartelle e scrive data/documenti-proposta.json + un Excel da rivedere.
Uso: python3 scripts/documenti-inventario.py
"""
import json, os, re, sys, time, unicodedata, collections

ROOT = os.path.expanduser('~/Dropbox/AAA GETTONIERE TUTTI/AA MANUALI TUTTI/MANUALI 2024/AAA NUOVE ISTRUZIONI 2024/MANUALI X CLIENTI')
HERE = os.path.dirname(os.path.abspath(__file__))
PROD = json.load(open(os.path.join(HERE, '..', 'data', 'prodotti.json')))
SKIP_DIRS = re.compile(r'(NEW SCHEMI|SW CARICATORE|AlbericiCoinSelector|ASSISTENZA TECNICA|GARANZIA|BACKUP|/LOG|/FILES)', re.I)
LANGS = [('FR', r'FRANC|FRENCH|(^|[^A-Z])FR([^A-Z]|$)'), ('ES', r'SPAGN|ESPA|SPANISH|(^|[^A-Z])ESP?([^A-Z]|$)'),
         ('PT', r'PORTOG|PT-PT'), ('EN', r'INGLES|ENGLISH|(^|[^A-Z])ENG?([^A-Z]|$)'), ('DE', r'TEDESC|DEUTSCH|GERMAN')]


def norm(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s.upper()) if unicodedata.category(c) != 'Mn')


def lang_of(path):
    n = norm(path)
    for code, rx in LANGS:
        if re.search(rx, n):
            return code
    return 'IT'


def stem_key(name):
    n = norm(os.path.splitext(name)[0])
    return re.sub(r'\s+', ' ', re.sub(r'\bCOPI[AO]?\b', '', n)).strip()


# 1) file validi
files = []
for d, dirs, fs in os.walk(ROOT):
    rel = os.path.relpath(d, ROOT)
    if SKIP_DIRS.search('/' + rel):
        continue
    for f in fs:
        if f.startswith(('~$', '.')) or not f.lower().endswith(('.pdf', '.docx')):
            continue
        p = os.path.join(d, f)
        files.append({'path': p, 'rel': os.path.relpath(p, ROOT), 'mtime': os.path.getmtime(p), 'size': os.path.getsize(p)})

# 2) unità = cartella (le sottocartelle "ISTRUZIONI <lingua>" confluiscono nella cartella padre)
units = collections.defaultdict(list)
for x in files:
    d = os.path.dirname(x['rel'])
    if re.match(r'ISTRUZIONI( |$)', os.path.basename(d), re.I) or re.match(r'(MANUALE|ISTRUZIONI) ', os.path.basename(d), re.I) and lang_of(os.path.basename(d)) != 'IT':
        d = os.path.dirname(d)
    x['lang'] = lang_of(x['rel'])
    units[d].append(x)

# 3) per ogni unità e lingua: il documento più recente (a parità, il PDF)
def pick(cands):
    cands = [c for c in cands if not re.search(r'\bCOPI', norm(c['rel']))] or cands
    best = max(cands, key=lambda c: (round(c['mtime'] / 86400), c['rel'].lower().endswith('.pdf')))
    pdf_same = [c for c in cands if c['rel'].lower().endswith('.pdf') and c['mtime'] >= best['mtime'] - 86400]
    use = pdf_same[0] if pdf_same else best
    return {'file': use['rel'], 'ext': 'pdf' if use['rel'].lower().endswith('.pdf') else 'docx', 'data': time.strftime('%Y-%m-%d', time.localtime(use['mtime'])),
            'alternative': len(cands) - 1}

# 4) abbinamento ai prodotti
skus = sorted((p['sku'] for p in PROD), key=len, reverse=True)
pmap = {p['sku']: p for p in PROD}
def sku_in(text):
    t = norm(text)
    found = []
    for s in skus:
        if re.search(r'(?<![A-Z0-9])' + re.escape(s.upper()) + r'(?![A-Z0-9])', t):
            found.append(s)
    # tieni solo i più specifici (es. SC498275 ma non un suo prefisso)
    return [s for s in found if not any(o != s and s in o for o in found)]

def tokens(s):
    return {w for w in re.findall(r'[A-Z0-9]{3,}', norm(s)) if w not in {'GETT', 'GETTONIERA', 'GETTONIERE', 'PER', 'CON', 'COMPLETA', 'DOCCE', 'MANUALE', 'ISTRUZIONI'}}

rows = []
for u, fl in sorted(units.items()):
    by_lang = collections.defaultdict(list)
    for x in fl:
        by_lang[x['lang']].append(x)
    sel = {l: pick(c) for l, c in by_lang.items()}
    cod = sku_in(u) or sorted({s for x in fl for s in sku_in(os.path.basename(x['rel']))})
    cand = []
    if not cod:
        ut = tokens(u)
        sc = []
        for p in PROD:
            t = tokens(p['name'] + ' ' + p.get('desc', '') + ' ' + p.get('cat', ''))
            k = len(ut & t)
            if k:
                sc.append((k, p['sku']))
        cand = [s for _, s in sorted(sc, reverse=True)[:3]]
    rows.append({'unita': u, 'sku': cod, 'candidati': cand, 'doc': sel, 'n_file': len(fl)})

json.dump(rows, open(os.path.join(HERE, '..', 'data', 'documenti-proposta.json'), 'w'), ensure_ascii=False, indent=1)
da_conv = sum(1 for r in rows for d in r['doc'].values() if d['ext'] == 'docx')
print('unità', len(rows), '| con codice prodotto', sum(1 for r in rows if r['sku']), '| solo candidati', sum(1 for r in rows if not r['sku']),
      '| documenti scelti', sum(len(r['doc']) for r in rows), '| da convertire (solo Word)', da_conv)
print('prodotti coperti', len({s for r in rows for s in r['sku']}), 'su', len(PROD))
