#!/usr/bin/env python3
"""Assegna ogni prodotto del catalogo alle famiglie CE (F1,F2,F3L,F4a,F4bc,F5,F6) o lo esclude (componente di terzi / ricambio / servizio).
Regola: famiglia applicativa (carico comandato) + famiglie tecnologiche (RFID 13,56 -> F5; QR/WiFi -> F4bc; POS/cashless -> F6).
Output: data/ce-famiglie-codici.json  {famiglie:{F1:[{sku,nome}],..}, esclusi:{motivo:[..]}, da_analizzare:[..]}"""
import json, re, os
HERE = os.path.dirname(os.path.abspath(__file__)); P = json.load(open(os.path.join(HERE, '..', 'data', 'prodotti.json')))
ESCL_CAT = {'Ricambi E Accessori': 'ricambio/accessorio (coperto dalla DoC del prodotto in cui si monta)', 'Vending - Ricambi': 'ricambio vending di terzi', 'Pulsanti': 'componente passivo (pulsante LED 5Vcc) senza DoC propria',
            'Gettoni In Acciaio': 'gettone passivo, non apparecchiatura', 'Tessere E Bracciali Rfid': 'transponder passivo, non apparecchiatura radio', 'Abbonamenti - Tele Assistenza - Servizi': 'servizio',
            'Sw Gestionali Per Palestre': 'software/servizio', 'Distributori Capsule Caffe\'': 'distributore di terzi (DoC del fabbricante)', 'Distributori Di Prodotti': 'distributore meccanico di terzi (DoC del fabbricante)',
            'Accettatori Di Monete': 'componente OEM di terzi (DoC del fabbricante)', 'Sanificazione Con Ozono': 'generatore di terzi (DoC del fabbricante)', 'Elettrovalvole': 'componente di terzi (DoC del fabbricante)'}
fam = {k: [] for k in ['F1', 'F2', 'F3L', 'F4a', 'F4bc', 'F5', 'F6']}; esc = {}; analizzare = []
for p in P:
    c, n = p['cat'], p['name'].lower(); full = c.lower() + ' ' + n
    if c in ESCL_CAT or (c == 'Occasioni!' and 'distributore' in n): esc.setdefault(ESCL_CAT.get(c, 'distributore di terzi (DoC del fabbricante)'), []).append(p['sku']); continue
    if 'trifase' in n or '380v' in n: analizzare.append(p['sku']); continue
    S = set()
    # tecnologie
    if re.search(r'rfid|tessere|carte|braccialet|programmator|ciondol', n) and not re.search(r'carte di (debito|credito)', n): S.add('F5')
    if re.search(r'\bqr|wifi|wi-fi|key39|check in', n): S.add('F4bc')
    if re.search(r'\bpos\b|nayax|contactless|cashless|aurency', n): S.add('F6')
    # applicazione
    if re.search(r'docc', full): S.add('F2')
    if re.search(r'lavatric|asciugatric|lavander', full): S.add('F1')
    if re.search(r'porta|porte|apri|serratur|tornell|sbarr|elettroserratur', full) and 'docc' not in n: S.add('F4a')
    if re.search(r'phon|sauna|luci|lamp|condizion|poltron|minicar|\bprese\b|cavall', full) or re.search(r'230', n): 
        if not S & {'F1', 'F2'}: S.add('F3L')
    if re.search(r'12v|12 v|contatto na|uscita na|normale aperto', n) and not S & {'F1', 'F2', 'F3L', 'F4a'}: S.add('F4a')
    if re.search(r'toelettatur|lava ', full) and not S & {'F2', 'F3L'}: S.add('F3L')
    if not S & {'F1', 'F2', 'F3L', 'F4a', 'F4bc', 'F5', 'F6'}: S.add('F3L' if re.search(r'gettonier|timer', full) else 'F5')
    # il lettore RFID/POS/QR è già la tecnologia: se non c'è un carico dichiarato resta nella sola famiglia tecnologica
    for f in S: fam[f].append({'sku': p['sku'], 'nome': p['name']})
json.dump({'famiglie': fam, 'esclusi': esc, 'da_analizzare': analizzare}, open(os.path.join(HERE, '..', 'data', 'ce-famiglie-codici.json'), 'w'), ensure_ascii=False, indent=1)
print({k: len(v) for k, v in fam.items()}, '| esclusi', sum(len(v) for v in esc.values()), '| da analizzare', analizzare, '| totale', len(P))
