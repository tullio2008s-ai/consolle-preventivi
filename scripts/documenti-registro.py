#!/usr/bin/env python3
"""Costruisce data/documenti-registro.json (righe per la foglio Documenti) dagli abbinamenti manuale → prodotto.
Fonti: data/documenti-proposta.json (codici trovati nel nome cartella) + data/conferme-abbinamenti.json (scelte di Tullio, se presente).
Regola spie: documento trovato = GIALLO (da validare); nessun documento = ROSSO (nessuna riga). VERDE solo quando Tullio valida dalla consolle.
"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
D = lambda f: os.path.join(HERE, '..', 'data', f)
units = json.load(open(D('documenti-proposta.json')))
prod = {p['sku'].upper() for p in json.load(open(D('prodotti.json')))}
conf = json.load(open(D('conferme-abbinamenti.json'))) if os.path.exists(D('conferme-abbinamenti.json')) else {}

assegna = {}  # sku -> {lingua: doc}
def aggiungi(sku, doc):
    sku = sku.upper()
    if sku not in prod: return
    cur = assegna.setdefault(sku, {})
    for l, d in doc.items():
        if l not in cur or d['data'] > cur[l]['data']:  # a parità di lingua vince il più recente
            cur[l] = d

for u in units:
    doc = {l: {'origine': d['file'], 'data': d['data'], 'ext': d['ext']} for l, d in u['doc'].items()}
    skus = list(u['sku'])
    c = conf.get(u['unita'])
    if c:
        skus = list(c.get('prodotti', [])) + ([c['altro']] if c.get('altro') else [])
        if c.get('nessuno') and not skus: skus = []
    for s in skus: aggiungi(s, doc)

righe = []
for sku, langs in sorted(assegna.items()):
    origine = (langs.get('IT') or next(iter(langs.values())))['origine']
    for tipo in ('istruzioni', 'ce'):  # la scheda CE è l'ultima pagina del manuale
        righe.append({'sku': sku, 'tipo': tipo, 'stato': 'giallo', 'origine': origine, 'lingue': langs,
                      'nota': 'ultima pagina del manuale' if tipo == 'ce' else ''})
json.dump(righe, open(D('documenti-registro.json'), 'w'), ensure_ascii=False, indent=1)
print('prodotti con documento:', len(assegna), 'su', len(prod), '| righe:', len(righe), '| lingue:', sorted({l for v in assegna.values() for l in v}))
