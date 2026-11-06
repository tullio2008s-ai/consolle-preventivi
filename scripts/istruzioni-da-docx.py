#!/usr/bin/env python3
"""Converte un manuale Word (.docx) nell'impaginazione MASTER delle Istruzioni (logo, titolo, sezioni, passi numerati, foto, avvertenze, smaltimento, piè di pagina).
Il testo resta quello del manuale: cambia solo la grafica. Uso: istruzioni-da-docx.py <file.docx> <out.pdf> <codice> <lingua> [titolo] [nome_prodotto]"""
import sys, os, re, io, zipfile, importlib.util
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape
from PIL import Image as PI
HERE = os.path.dirname(os.path.abspath(__file__))
SRC, OUTF, SKU, LANG = sys.argv[1:5]; TITOLO_ARG = sys.argv[5] if len(sys.argv) > 5 else ''
IMGCE = os.environ.get('IMGCE', '')
spec = importlib.util.spec_from_file_location('mod', os.path.join(HERE, 'modelli-documenti.py')); keep = sys.argv; sys.argv = [keep[0], '/tmp/_x', IMGCE]
M_ = importlib.util.module_from_spec(spec); spec.loader.exec_module(M_); sys.argv = keep
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle, Image, KeepTogether
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
NAVY, GREY, INK, CYAN, ORANGE, W, H, MG, ST, Section, Step, bullets, callout = M_.NAVY, M_.GREY, M_.INK, M_.CYAN, M_.ORANGE, M_.W, M_.H, M_.M, M_.ST, M_.Section, M_.Step, M_.bullets, M_.callout
cw = W - 2 * MG
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006'}
q = lambda p, t: '{%s}%s' % (NS[p], t)
z = zipfile.ZipFile(SRC); doc = ET.fromstring(z.read('word/document.xml'))
rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('word/_rels/document.xml.rels'))}
num_bullet = {}
if 'word/numbering.xml' in z.namelist():
    nx = ET.fromstring(z.read('word/numbering.xml')); absf = {}
    for a in nx.iter(q('w', 'abstractNum')):
        lv = a.find(q('w', 'lvl')); f = lv.find(q('w', 'numFmt')) if lv is not None else None; absf[a.get(q('w', 'abstractNumId'))] = f.get(q('w', 'val')) if f is not None else ''
    for n in nx.iter(q('w', 'num')):
        ab = n.find(q('w', 'abstractNumId')); num_bullet[n.get(q('w', 'numId'))] = absf.get(ab.get(q('w', 'val')), '') == 'bullet'

LBL = {'IT': ('ISTRUZIONI', 'Installazione e uso', 'Italiano'), 'EN': ('INSTRUCTIONS', 'Installation and use', 'English'), 'FR': ('INSTRUCTIONS', 'Installation et utilisation', 'Français'),
       'ES': ('INSTRUCCIONES', 'Instalación y uso', 'Español'), 'PT': ('INSTRUÇÕES', 'Instalação e utilização', 'Português'), 'DE': ('ANLEITUNG', 'Installation und Gebrauch', 'Deutsch')}
SMALT = {'IT': ('Smaltimento', 'Il prodotto non va smaltito con i rifiuti urbani. A fine vita va conferito presso i centri di raccolta dei rifiuti di apparecchiature elettriche ed elettroniche (RAEE), come previsto dalla Direttiva 2012/19/UE.', 'La dichiarazione di conformità CE di questo prodotto è un documento separato, scaricabile dalla scheda prodotto.'),
         'EN': ('Disposal', 'Do not dispose of this product with household waste. At end of life take it to a collection point for waste electrical and electronic equipment (WEEE), as required by Directive 2012/19/EU.', 'The EC declaration of conformity of this product is a separate document available from the product page.'),
         'FR': ('Élimination', 'Ce produit ne doit pas être jeté avec les déchets ménagers. En fin de vie, il doit être déposé dans un point de collecte des déchets d\'équipements électriques et électroniques (DEEE), conformément à la Directive 2012/19/UE.', 'La déclaration de conformité CE de ce produit est un document séparé, disponible sur la fiche produit.'),
         'ES': ('Eliminación', 'El producto no debe eliminarse con los residuos domésticos. Al final de su vida útil debe entregarse en un punto de recogida de residuos de aparatos eléctricos y electrónicos (RAEE), según la Directiva 2012/19/UE.', 'La declaración de conformidad CE de este producto es un documento aparte, disponible en la ficha del producto.'),
         'PT': ('Eliminação', 'O produto não deve ser eliminado com o lixo doméstico. No fim de vida deve ser entregue num ponto de recolha de resíduos de equipamentos elétricos e eletrónicos (REEE), conforme a Diretiva 2012/19/UE.', 'A declaração de conformidade CE deste produto é um documento separado, disponível na ficha do produto.')}
STOP = re.compile(r'dichiarazione di conformit|smaltimento|d[ée]claration de conformit|[ée]limination|declaraci[oó]n de conformidad|disposal|declaration of conformity|avvertenze sullo smaltimento', re.I)

def txt(p):
    out = []
    for e in p.iter():
        if e.tag == q('w', 't'): out.append(e.text or '')
        elif e.tag in (q('w', 'tab'), q('w', 'br')): out.append(' ')
    return re.sub(r'\s+', ' ', ''.join(out)).strip()

def runs_md(p):
    """testo con <b> per i tratti in grassetto"""
    out = []
    for r in p.iter(q('w', 'r')):
        t = ''.join((e.text or '') if e.tag == q('w', 't') else ' ' for e in r if e.tag in (q('w', 't'), q('w', 'tab'), q('w', 'br')))
        if not t: continue
        rp = r.find(q('w', 'rPr')); b = rp is not None and rp.find(q('w', 'b')) is not None and rp.find(q('w', 'b')).get(q('w', 'val')) not in ('0', 'false')
        t = escape(t); out.append('<b>%s</b>' % t if b else t)
    s = re.sub(r'\s+', ' ', ''.join(out).replace('</b><b>', '')).strip()
    return s

def blocks():
    res = []; started = False
    def walk(el, in_fb=False):
        for ch in el:
            if ch.tag == q('mc', 'Fallback'): continue
            if ch.tag == q('w', 'p'):
                yield ch
                for d in ch.iter(q('w', 'txbxContent')):  # testo dentro caselle di testo
                    for sub in walk(d): yield sub
            else: yield from walk(ch)
    seen = set()
    for p in walk(doc.find(q('w', 'body'))):
        if id(p) in seen: continue
        seen.add(id(p))
        t = txt(p); imgs = [rels.get(b.get(q('r', 'embed'))) for b in p.iter(q('a', 'blip'))]
        sz = [int(s.get(q('w', 'val'))) for s in p.iter(q('w', 'sz'))]; bold = bool(t) and all((r.find(q('w', 'rPr')) is not None and r.find(q('w', 'rPr')).find(q('w', 'b')) is not None) for r in p.iter(q('w', 'r')) if ''.join(x.text or '' for x in r.iter(q('w', 't'))).strip())
        npr = p.find('.//' + q('w', 'numPr')); nid = npr.find(q('w', 'numId')).get(q('w', 'val')) if npr is not None and npr.find(q('w', 'numId')) is not None else None
        res.append(dict(t=t, md=runs_md(p), imgs=[i for i in imgs if i], sz=max(sz) if sz else 0, bold=bold, num=nid, bul=num_bullet.get(nid, False) if nid else False))
    return res

def image_flow(target):
    try:
        data = z.read('word/' + target); im = PI.open(io.BytesIO(data)); im.load()
    except Exception: return None
    if im.width < 60 or im.height < 40: return None
    if im.width / im.height > 5: return None
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA'); bg = PI.new('RGB', im.size, 'white'); bg.paste(im, mask=im.split()[3]); im = bg
    else: im = im.convert('RGB')
    k = min(1, 1100 / max(im.size)); im = im.resize((int(im.width * k), int(im.height * k)))
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=86); buf.seek(0)
    mw, mh = 150 * mm, 100 * mm; s = min(mw / im.width, mh / im.height, 0.3 * mm * 4)  # px->pt
    s = min(mw / im.width, mh / im.height); w, h = im.width * s, im.height * s
    sm = im.resize((64, 64)).convert('RGB'); px = [p_ for p_ in sm.getdata() if sum(p_) < 720]
    logo = bool(px) and sum(1 for r_, g_, b_ in px if r_ > 170 and g_ < 100 and b_ < 100) / len(px) > .6
    f_ = Image(buf, width=w, height=h, hAlign='CENTER'); f_.isLogo = logo
    return f_

B = blocks()
# titolo = primo paragrafo grande in grassetto (>=28 half-points) oppure argomento
BRAND = re.compile(r'gettoniere-shop|tullio serci|mirrionis|info@|commerciale@|www\.|p\.? ?iva|\bpi\b|cagliari|selargius|pasteur', re.I)
titolo = TITOLO_ARG or next((b['t'] for b in B if b['t'] and b['sz'] >= 28 and b['bold'] and not BRAND.search(b['t'])), '') or SKU
titolo = titolo.strip().capitalize() if titolo.isupper() else titolo
body = []; i = 0; first_img_skipped = False; steps = 0; in_steps_num = None
H2 = lambda t: Section(t)
n = len(B); stopped = False
while i < n:
    b = B[i]; t = b['t']; i += 1
    if STOP.search(t) and len(t) < 90: break
    seen_h2 = any(isinstance(x, tuple) and x[0] == 'H2' for x in body)
    for tg in b['imgs']:
        f = image_flow(tg)
        if f and not seen_h2 and (f.drawWidth / f.drawHeight > 1.8 or f.isLogo): continue  # logo/intestazione del vecchio manuale
        if f: body.append(f); body.append(Spacer(1, 2 * mm))
    if not t: steps = 0; continue
    if not seen_h2 and BRAND.search(t): continue  # intestazione del vecchio manuale (indirizzo, sito, email)
    if t.lower().rstrip(': ') in (titolo.lower().rstrip(': '),) or re.fullmatch(r'\W*(istruzioni|instructions|manuale)[^.]{0,40}', t, re.I) and b['bold']: continue
    is_head = b['bold'] and len(t) <= 80 and not t.endswith('.') and not b['num'] and (b['sz'] == 0 or b['sz'] >= 22 or t.isupper()) and (len(t.split()) <= 7 or t.isupper() and len(t.split()) <= 10)
    if is_head:
        nxt = ''
        small = b['sz'] and b['sz'] <= 24 and not t.isupper() and (len(t) < 40)
        body.append(('H3', t.rstrip(':')) if (small and body) else ('H2', t.rstrip(':'))); steps = 0; continue
    if b['num']:
        if b['bul']: body.append(('BUL', b['md'])); steps = 0
        else: steps += 1; body.append(('STEP', steps, b['md']))
        continue
    steps = 0
    if re.match(r'^(nota|note|attenzione|avvertenza|warning|attention|aviso|nota importante)\b', t, re.I): body.append(('NOTE', b['md']))
    elif b['bold'] and len(t) > 25: body.append(('NOTE', b['md']))
    else: body.append(('P', b['md']))

# --- composizione
story = [M_.title_box(escape(titolo), 'Cod. ' + escape(SKU), cw), Spacer(1, 4 * mm)]
buf_b = []
def flush_bul():
    global buf_b
    if buf_b: story.append(bullets(buf_b)); story.append(Spacer(1, 2 * mm)); buf_b = []
for it in body:
    if isinstance(it, Image) or isinstance(it, Spacer): flush_bul(); story.append(it); continue
    k = it[0]
    if k != 'BUL': flush_bul()
    if k == 'H2': story += [Spacer(1, 2 * mm), H2(it[1])]
    elif k == 'H3': story.append(Paragraph(it[1], ST['h3']))
    elif k == 'P': story.append(Paragraph(it[1], ST['body'])); story.append(Spacer(1, 1.5 * mm))
    elif k == 'BUL': buf_b.append(it[1])
    elif k == 'STEP': story.append(Step(it[1], it[2]))
    elif k == 'NOTE': story += [callout([Paragraph(it[1], ST['small'])], cw, CYAN, M_.PALE), Spacer(1, 2 * mm)]
flush_bul()
# chiusura: avvertenze standard + pittogrammi + smaltimento
sm = SMALT.get(LANG, SMALT['IT'])
rows = []
try:
    raee = Image(os.path.join(IMGCE, 'raee.png'), width=17 * mm, height=17 * mm)
    t = Table([[raee, [Paragraph('<b>%s.</b> %s' % (sm[0], sm[1]), ST['small'])]]], colWidths=[22 * mm, cw - 22 * mm]); t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LEFTPADDING', (0, 0), (-1, -1), 0)]))
    rows = [t, Spacer(1, 1 * mm), Paragraph(sm[2], ST['grey'])]
except Exception: rows = [Paragraph('<b>%s.</b> %s' % (sm[0], sm[1]), ST['small'])]
story += [Spacer(1, 3 * mm), KeepTogether([Section(sm[0]) ] + rows)]

lab = LBL.get(LANG, LBL['IT']); FOOT1 = 'www.gettoniere-shop.it - PAYSOLUTION S.R.L.S. - P.Iva 04206000921'; FOOT2 = 'Via Pasteur 19 - 09047 Selargius (CA) - Italia - 3400069549 - commerciale@gettoniere-shop.it'
def header(c, d):
    c.drawImage(M_.LOGO, MG, H - 22.5 * mm, width=62 * mm, height=10.5 * mm, mask='auto', preserveAspectRatio=True)
    c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 19); c.drawRightString(W - MG, H - 18 * mm, lab[0])
    c.setFillColor(INK); c.setFont('Helvetica', 10); c.drawRightString(W - MG, H - 25 * mm, lab[1])
    c.setFillColor(GREY); c.setFont('Helvetica', 8.5); c.drawRightString(W - MG, H - 30.5 * mm, 'Rev. 1 - 06/11/2026 - ' + lab[2])
    c.setStrokeColor(NAVY); c.setLineWidth(.8); c.line(MG, H - 36 * mm, W - MG, H - 36 * mm)
def footer(c, d, nn):
    c.setStrokeColor(CYAN); c.setLineWidth(.5); c.line(MG, 16 * mm, W - MG, 16 * mm)
    c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 8); c.drawCentredString(W / 2, 11.5 * mm, FOOT1)
    c.setFillColor(GREY); c.setFont('Helvetica', 8); c.drawCentredString(W / 2, 7 * mm, FOOT2)
    c.setFont('Helvetica', 7); c.drawRightString(W - MG, 3 * mm, '%s - %s rev. 1 - %s/%s' % (SKU, lab[0].capitalize(), d.page, nn))
M_.build(OUTF, story, header, footer)
print('ok', OUTF)
