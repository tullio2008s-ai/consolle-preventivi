#!/usr/bin/env python3
"""Modelli master (impaginazione) di ISTRUZIONI e DICHIARAZIONE CE, per approvazione.
Contenuti di esempio dal prodotto BGM2DOC4000 (manuale attuale + dichiarazione famiglia F2 del progetto Marcatura CE).
Uso: python3 scripts/modelli-documenti.py <cartella_uscita> <cartella_immagini_CE>
Immagini attese in <cartella_immagini_CE>: ce.jpg, raee.png, pittogrammi.jpg (estratte dalle dichiarazioni esistenti).
"""
import os, sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, Image, Flowable, KeepTogether)

OUT = sys.argv[1]; IMG = sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__)); LOGO = os.path.join(HERE, '..', 'docs', 'assets', 'logo.png')
NAVY = colors.Color(11/255, 53/255, 96/255); CYAN = colors.Color(31/255, 169/255, 214/255); ORANGE = colors.Color(245/255, 166/255, 35/255)
GREY = colors.Color(107/255, 114/255, 128/255); INK = colors.Color(31/255, 41/255, 55/255); LINE = colors.Color(209/255, 213/255, 219/255)
PALE = colors.Color(237/255, 245/255, 250/255)
W, H = A4; M = 15 * mm

ST = dict(
    body=ParagraphStyle('b', fontName='Helvetica', fontSize=9.5, leading=13.2, textColor=INK),
    small=ParagraphStyle('s', fontName='Helvetica', fontSize=8.5, leading=11.5, textColor=INK),
    grey=ParagraphStyle('g', fontName='Helvetica', fontSize=8, leading=10.5, textColor=GREY),
    sec=ParagraphStyle('h', fontName='Helvetica-Bold', fontSize=12, leading=14, textColor=NAVY),
    h3=ParagraphStyle('h3', fontName='Helvetica-Bold', fontSize=10, leading=13, textColor=NAVY, spaceBefore=4, spaceAfter=2),
    tt=ParagraphStyle('t', fontName='Helvetica-Bold', fontSize=16, leading=19, textColor=NAVY),
)


class Section(Flowable):
    """Titolo di sezione: barretta azzurra + testo navy."""
    def __init__(self, text): super().__init__(); self.text = text
    def wrap(self, aw, ah): self.aw = aw; return aw, 11 * mm
    def draw(self):
        c = self.canv; c.setFillColor(CYAN); c.rect(0, 2.2 * mm, 1.6 * mm, 6.5 * mm, stroke=0, fill=1)
        c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 12); c.drawString(4.5 * mm, 4.3 * mm, self.text)


class Step(Flowable):
    """Passo numerato: cerchio navy + testo."""
    def __init__(self, n, text, style=None):
        super().__init__(); self.n = n; self.p = Paragraph(text, style or ST['body'])
    def wrap(self, aw, ah):
        self.w, self.h = self.p.wrap(aw - 9 * mm, ah); self.h = max(self.h, 6 * mm) + 1.6 * mm; return aw, self.h
    def draw(self):
        c = self.canv; r = 3 * mm; cy = self.h - r - 0.2 * mm
        c.setFillColor(NAVY); c.circle(r, cy, r, stroke=0, fill=1)
        c.setFillColor(colors.white); c.setFont('Helvetica-Bold', 8.5); c.drawCentredString(r, cy - 1.1 * mm, str(self.n))
        self.p.drawOn(c, 9 * mm, self.h - self.p.height - 0.9 * mm)


class HR(Flowable):
    def wrap(self, aw, ah): self.aw = aw; return aw, 1.5 * mm
    def draw(self): self.canv.setStrokeColor(INK); self.canv.setLineWidth(.5); self.canv.line(0, 1 * mm, self.aw - 8 * mm, 1 * mm)


class Placeholder(Flowable):
    """Riquadro tratteggiato dove andrà una foto/schema."""
    def __init__(self, h, text): super().__init__(); self.hh = h; self.t = text
    def wrap(self, aw, ah): self.aw = aw; return aw, self.hh + 3 * mm
    def draw(self):
        c = self.canv; c.setStrokeColor(LINE); c.setDash(3, 3); c.roundRect(0, 3 * mm, self.aw, self.hh, 2 * mm, stroke=1, fill=0); c.setDash()
        c.setFillColor(GREY); c.setFont('Helvetica-Oblique', 8.5); c.drawCentredString(self.aw / 2, 3 * mm + self.hh / 2 - 1, self.t)


def bullets(items, style='body', color=ORANGE):
    rows = [[Paragraph('<font color="#%s">●</font>' % color.hexval()[2:], ParagraphStyle('bl', fontSize=6, leading=13)), Paragraph(t, ST[style])] for t in items]
    t = Table(rows, colWidths=[5 * mm, None]); t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 1), ('TOPPADDING', (0, 0), (-1, -1), 1.2), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.2)]))
    return t


def title_box(title, sub, width):
    t = Table([[Paragraph(title, ST['tt'])], [Paragraph(sub, ParagraphStyle('x', fontName='Helvetica', fontSize=9, textColor=GREY))]], colWidths=[width - 8 * mm])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), PALE), ('LEFTPADDING', (0, 0), (-1, -1), 5 * mm), ('TOPPADDING', (0, 0), (0, 0), 4 * mm), ('BOTTOMPADDING', (0, 1), (0, 1), 3.5 * mm)]))
    o = Table([[t]], colWidths=[width]); o.setStyle(TableStyle([('LINEBEFORE', (0, 0), (0, -1), 2 * mm, NAVY), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0), ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0)]))
    return o


def tiles(items, width):
    n = len(items); g = 3 * mm; tw = (width - g * (n - 1)) / n; cells = []
    for k, v, s in items:
        inner = Table([[Paragraph(k, ParagraphStyle('k', fontName='Helvetica-Bold', fontSize=6.5, textColor=GREY))],
                       [Paragraph(v, ParagraphStyle('v', fontName='Helvetica-Bold', fontSize=9.5, leading=11.5, textColor=NAVY))],
                       [Paragraph(s, ParagraphStyle('sv', fontName='Helvetica', fontSize=6.5, textColor=GREY))]], colWidths=[tw - 5 * mm])
        inner.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 3 * mm), ('BACKGROUND', (0, 0), (-1, -1), PALE), ('LINEABOVE', (0, 0), (-1, 0), 1, ORANGE), ('TOPPADDING', (0, 0), (-1, -1), 1.2)]))
        cells.append(inner)
    t = Table([cells], colWidths=[tw] * n, hAlign='LEFT'); t.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), g), ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    return t


def callout(paras, width, strip=ORANGE, bg=colors.Color(1, .97, .9)):
    t = Table([[paras]], colWidths=[width - 4 * mm]); t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), bg), ('LEFTPADDING', (0, 0), (-1, -1), 4 * mm), ('RIGHTPADDING', (0, 0), (-1, -1), 4 * mm), ('TOPPADDING', (0, 0), (-1, -1), 3 * mm), ('BOTTOMPADDING', (0, 0), (-1, -1), 3 * mm)]))
    o = Table([[t]], colWidths=[width]); o.setStyle(TableStyle([('LINEBEFORE', (0, 0), (0, -1), 1.6 * mm, strip), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0), ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0)]))
    return o


def build(path, story, header, footer, top=40 * mm, bottom=22 * mm):
    doc = BaseDocTemplate(path, pagesize=A4, leftMargin=M, rightMargin=M, topMargin=top, bottomMargin=bottom, title=os.path.basename(path), author='')
    state = {}
    def on_page(c, d):
        header(c, d); footer(c, d, state.get('n', 0))
    doc.addPageTemplates([PageTemplate(frames=[Frame(M, bottom, W - 2 * M, H - top - bottom, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=on_page)])
    # due passate: la prima conta le pagine, la seconda scrive "pag. n/N"
    import copy
    doc.build(copy.deepcopy(story)); state['n'] = doc.page
    doc2 = BaseDocTemplate(path, pagesize=A4, leftMargin=M, rightMargin=M, topMargin=top, bottomMargin=bottom, title=os.path.basename(path))
    doc2.addPageTemplates([PageTemplate(frames=[Frame(M, bottom, W - 2 * M, H - top - bottom, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=on_page)])
    doc2.build(story)


# ───────────────────────── ISTRUZIONI ─────────────────────────
FOOT1 = 'www.gettoniere-shop.it - PAYSOLUTION S.R.L.S. - P.Iva 04206000921'
FOOT2 = 'Via Giuseppe Mercalli 37, - 09129 Cagliari (CA) - Italia - 3400069549 - commerciale@gettoniere-shop.it'

def istr_header(c, d):
    c.drawImage(LOGO, M, H - 22.5 * mm, width=62 * mm, height=10.5 * mm, mask='auto', preserveAspectRatio=True)
    c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 19); c.drawRightString(W - M, H - 18 * mm, 'ISTRUZIONI')
    c.setFillColor(INK); c.setFont('Helvetica', 10); c.drawRightString(W - M, H - 25 * mm, 'Installazione e uso')
    c.setFillColor(GREY); c.setFont('Helvetica', 8.5); c.drawRightString(W - M, H - 30.5 * mm, 'Rev. 1 - 06/11/2026 - Italiano')
    c.setStrokeColor(NAVY); c.setLineWidth(.8); c.line(M, H - 36 * mm, W - M, H - 36 * mm)
    c.setFillColor(ORANGE); c.roundRect(W / 2 - 22 * mm, H - 12 * mm, 44 * mm, 5 * mm, 1 * mm, stroke=0, fill=1)
    c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 6.5); c.drawCentredString(W / 2, H - 10.4 * mm, 'MODELLO PER APPROVAZIONE')

def istr_footer(c, d, n):
    c.setStrokeColor(CYAN); c.setLineWidth(.5); c.line(M, 16 * mm, W - M, 16 * mm)
    c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 8); c.drawCentredString(W / 2, 11.5 * mm, FOOT1)
    c.setFillColor(GREY); c.setFont('Helvetica', 8); c.drawCentredString(W / 2, 7 * mm, FOOT2)
    c.setFont('Helvetica', 7); c.drawRightString(W - M, 3 * mm, 'BGM2DOC4000 - Istruzioni rev. 1 - pag. %d/%d' % (d.page, n))


def istruzioni():
    cw = W - 2 * M; s = []; B = ST['body']
    s += [title_box('Gettoniera per 2 docce', 'Cod. BGM2DOC4000', cw), Spacer(1, 5 * mm)]
    s += [tiles([('ALIMENTAZIONE', '12 Vcc ±5%', 'alimentatore esterno 230/12 Vcc - 5 A'), ('USCITE', '2 × 12 Vcc', '1,5 A per uscita'),
                 ('DIMENSIONI BOX', '25 × 30 × 16 cm', 'L × A × P'), ('PESO', '5 kg circa', '')], cw), Spacer(1, 4 * mm)]
    spec = [Section('Specifiche tecniche'),
          bullets(['Temperatura di funzionamento: 5 – 50 °C', 'Gettoniera multimoneta: legge monete da € 0,10 – 0,20 – 0,50 – 1',
                   'Impostazioni di default: € 0,50 / 3 minuti']), Spacer(1, 3 * mm),
          Section('Contenuto della confezione'),
          bullets(['1 gettoniera', '2 elettrovalvole in ottone a 12 Vcc con attacchi da ½”', '1 alimentatore AC/DC 12 V - 5 A',
                   '1 bustina con 4 set di tasselli', '1 foglio istruzioni'])]
    foto = Image(os.path.join(IMG, 'prodotto.jpg'), width=44 * mm, height=44 * mm * 372 / 347)
    top = Table([[spec, foto]], colWidths=[cw - 48 * mm, 48 * mm]); top.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0)]))
    s += [top, Spacer(1, 3 * mm)]
    pic = Image(os.path.join(IMG, 'pittogrammi.jpg'), width=40 * mm, height=40 * mm * 124 / 417)
    av = [Paragraph('<b>AVVERTENZE</b> - seguire le indicazioni di questo manuale.', ST['body']), Spacer(1, 1.5 * mm),
          Paragraph('<b>La gettoniera NON può essere installata dentro il box doccia, la sauna o il bagno turco.</b> Proteggerla dalle intemperie e dal contatto diretto con l’acqua.', ST['small']), Spacer(1, 1 * mm),
          Paragraph('Verificare che tutta la linea di alimentazione sia protetta da interruttore differenziale e che l’impianto abbia il collegamento di messa a terra funzionante.', ST['small']), Spacer(1, 1 * mm),
          Paragraph('<b>L’installazione deve essere eseguita da personale qualificato.</b> I guasti causati dal mancato rispetto delle avvertenze non sono coperti da garanzia.', ST['small'])]
    box = Table([[av, pic]], colWidths=[cw - 4 * mm - 46 * mm, 44 * mm]); box.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 2 * mm)]))
    s += [callout(box, cw), Spacer(1, 4 * mm)]
    s += [Section('Montaggio'),
          Paragraph('Posizionare e fissare il mobiletto nel punto più adatto, al riparo da intemperie, sole, acqua ed eccessiva umidità (vedi avvertenze). Fissare il box a parete con tasselli ad espansione: i fori sono già presenti sul pannello posteriore.', B), Spacer(1, 1.5 * mm),
          Paragraph('<b>Non forare il mobiletto</b> con punte da trapano o frese: le vibrazioni potrebbero danneggiare i componenti interni.', B), Spacer(1, 3 * mm)]
    s += [Section('Collegamento idraulico'),
          bullets(['Montare l’elettrovalvola nel tubo dell’acqua, tra il miscelatore (se presente) e il soffione.', 'Proteggerla dall’acqua e dalle intemperie.',
                   'Rispettare il verso: la valvola è segnata. La mandata (entrata acqua) corrisponde al lato della valvola in cui è presente il filtro.']), Spacer(1, 3 * mm)]
    s += [KeepTogether([Section('Collegamento elettrico'),
          Step(1, 'Dopo aver fissato il box a parete, collegare le elettrovalvole nel circuito dell’acqua.'),
          Step(2, 'Posizionare l’alimentatore in un luogo adatto e protetto.'),
          Step(3, 'Dalla morsettiera all’interno del box collegare la coppia di cavi (rosso + / nero -) fino alla rispettiva valvola, rispettando la polarità. In base alla distanza l’impiantista sceglie la sezione dei cavi, <b>non inferiore a 1 mm²</b>. Tutta la linea elettrica deve essere protetta e isolata dal possibile contatto con l’acqua.'),
          Step(4, 'Non accendere la gettoniera fino a quando le connessioni non sono state eseguite.'),
          Step(5, 'Eseguire un controllo generale dei collegamenti prima di alimentare la gettoniera.'),
          Spacer(1, 2 * mm), Image(os.path.join(IMG, 'morsettiera.png'), width=70 * mm, height=70 * mm * 445 / 620, hAlign='CENTER')])]
    s += [Spacer(1, 3 * mm), Section('Utilizzo e funzionamento'),
          bullets(['Collegate le elettrovalvole, alimentare la gettoniera.', 'Il display frontale mostra 0000. Inserendo le monete indica il credito in decimi di euro. Premere uno dei pulsanti per avviare il dispositivo (doccia).',
                   'Il pulsante selezionato resta illuminato per il tempo impostato e finché il dispositivo è attivo.', 'Per prolungare il tempo inserire altro credito e premere lo stesso pulsante.',
                   'Con altro credito si può premere un altro pulsante e attivare un’altra doccia.']), Spacer(1, 2 * mm),
          callout([Paragraph('<b>Nota:</b> il display indica il tempo residuo della prima doccia attivata. Le altre uscite hanno un conteggio indipendente che avanza anche se il display non lo mostra.', ST['small'])], cw, CYAN, PALE), Spacer(1, 4 * mm)]
    s += [KeepTogether([Section('Impostazione dei parametri tempo e prezzo'),
          callout([Paragraph('<b>NON TOCCARE LA POSIZIONE DEI CAVETTI.</b> Aprire lo sportello del box: sul fondo del pannello si vede la scheda elettronica verde. Individuare i 5 pulsanti di gomma neri (SET, UP, DN, COIL, CLR).', ST['small'])], cw), Spacer(1, 2 * mm),
          Image(os.path.join(IMG, 'scheda.png'), width=62 * mm, height=62 * mm * 527 / 617, hAlign='CENTER'), Spacer(1, 3 * mm)])]
    tempo = [Paragraph('Tempo delle 2 uscite', ST['h3']),
             Step(1, 'Premere <b>SET</b>. Con <b>UP (+)</b> e <b>DN (-)</b> impostare i primi 2 numeri (secondi), esempio 00:30.'),
             Step(2, 'Premere di nuovo <b>SET</b> e impostare le restanti 2 cifre (minuti): 02:30 = 2 minuti e 30 secondi.'),
             Step(3, 'Premere ancora <b>SET</b> per passare alla <b>seconda uscita</b> e ripetere la procedura.'),
             Step(4, 'Al termine premere <b>CLR</b> per tornare in modalità lavoro.')]
    prezzo = [Paragraph('Prezzo delle 2 uscite', ST['h3']),
              Step(1, 'Premere <b>COIL</b>: nel display lampeggia 1:00 (il numero 1 indica l’uscita/doccia n. 1).'),
              Step(2, 'Con <b>UP (+)</b> e <b>DN (-)</b> impostare l’importo in decimi di euro che attiva l’uscita.'),
              Step(3, 'Premere ancora <b>COIL</b> per l’uscita n. 2 (display 2:00) e ripetere. Poi <b>CLR</b>.')]
    two = Table([[tempo, prezzo]], colWidths=[cw / 2 - 2 * mm, cw / 2 - 2 * mm], hAlign='LEFT'); two.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (0, 0), 4 * mm)]))
    ex = Table([['Display', 'La gettoniera attiva l’uscita con'], ['1:01', 'una moneta da 10 cent'], ['1:05', 'una moneta da 50 cent'], ['1:10', 'una moneta da 1 euro']], colWidths=[28 * mm, 70 * mm])
    ex.setStyle(TableStyle([('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 8), ('TEXTCOLOR', (0, 0), (-1, 0), GREY), ('FONT', (0, 1), (-1, -1), 'Helvetica', 9), ('TEXTCOLOR', (0, 1), (-1, -1), INK),
                            ('FONT', (0, 1), (0, -1), 'Helvetica-Bold', 9), ('TEXTCOLOR', (0, 1), (0, -1), NAVY), ('LINEBELOW', (0, 0), (-1, -1), .4, LINE), ('BACKGROUND', (0, 0), (-1, 0), PALE), ('LEFTPADDING', (0, 0), (-1, -1), 3 * mm)]))
    s += [two, Spacer(1, 2 * mm), ex, Spacer(1, 1.5 * mm), Paragraph('Il valore da assegnare corrisponde al prezzo del servizio, cioè ai “decimi di euro” che la gettoniera deve ricevere per azionare il pulsante.', ST['grey']), Spacer(1, 4 * mm)]
    raee = Image(os.path.join(IMG, 'raee.png'), width=17 * mm, height=17 * mm)
    sm = Table([[raee, Paragraph('<b>Smaltimento.</b> Il prodotto non va smaltito con i rifiuti urbani. A fine vita va conferito presso i centri di raccolta dei rifiuti di apparecchiature elettriche ed elettroniche (RAEE), come previsto dalla Direttiva 2012/19/UE.', ST['small'])]], colWidths=[22 * mm, cw - 22 * mm])
    sm.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LEFTPADDING', (0, 0), (-1, -1), 0)]))
    s += [KeepTogether([Section('Smaltimento e dichiarazione di conformità'), sm, Spacer(1, 1 * mm),
                        Paragraph('La dichiarazione di conformità CE di questo prodotto è un documento separato, scaricabile dalla scheda prodotto.', ST['grey'])])]
    build(os.path.join(OUT, '1_MODELLO_Istruzioni_BGM2DOC4000_rev1.pdf'), s, istr_header, istr_footer)


# ───────────────────────── DICHIARAZIONE CE ─────────────────────────
def ce_header(c, d):
    c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 17); c.drawString(M, H - 18 * mm, 'TULLIO SERCI S.R.L.')
    c.setFillColor(GREY); c.setFont('Helvetica', 8.5)
    c.drawString(M, H - 24 * mm, 'P.I. 03896490921 - CAGLIARI'); c.drawString(M, H - 28.5 * mm, 'tullio@tullioserci.srl')
    c.drawImage(os.path.join(IMG, 'ce.jpg'), W - M - 16 * mm, H - 28 * mm, width=16 * mm, height=16 * mm * 74 / 104, preserveAspectRatio=True)
    c.setStrokeColor(NAVY); c.setLineWidth(.8); c.line(M, H - 36 * mm, W - M, H - 36 * mm)
    c.setFillColor(ORANGE); c.roundRect(W / 2 - 22 * mm, H - 11 * mm, 44 * mm, 5 * mm, 1 * mm, stroke=0, fill=1)
    c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 6.5); c.drawCentredString(W / 2, H - 9.4 * mm, 'MODELLO PER APPROVAZIONE')

def ce_footer(c, d, n):
    c.setStrokeColor(CYAN); c.setLineWidth(.5); c.line(M, 16 * mm, W - M, 16 * mm)
    c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 8); c.drawCentredString(W / 2, 11.5 * mm, 'TULLIO SERCI S.R.L. - P.I. 03896490921 - CAGLIARI - tullio@tullioserci.srl')
    c.setFont('Helvetica', 7); c.drawRightString(W - M, 3 * mm, 'BGM2DOC4000 - Dichiarazione di conformità UE rev. 1 - pag. %d/%d' % (d.page, n))


def kv(rows, cw, label_w=40 * mm):
    t = Table([[Paragraph(k, ParagraphStyle('k', fontName='Helvetica-Bold', fontSize=8.5, textColor=GREY)), Paragraph(v, ST['small'])] for k, v in rows], colWidths=[label_w, cw - label_w])
    t.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, -1), .4, LINE), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 1.6), ('BOTTOMPADDING', (0, 0), (-1, -1), 2), ('LEFTPADDING', (0, 0), (-1, -1), 1)]))
    return t


def ce_doc():
    cw = W - 2 * M; s = []
    s += [Paragraph('DICHIARAZIONE DI CONFORMITÀ UE', ParagraphStyle('a', fontName='Helvetica-Bold', fontSize=18, leading=21, textColor=NAVY)),
          Paragraph('EU Declaration of Conformity', ParagraphStyle('b', fontName='Helvetica-Oblique', fontSize=10, leading=13, textColor=GREY)), Spacer(1, 4 * mm)]
    s += [Section('Fabbricante'), kv([('Ragione sociale', 'TULLIO SERCI S.R.L.'), ('Partita IVA', '03896490921'),
                                       ('Legale rappresentante', 'Ing. Tullio Serci - Ordine Ingegneri Cagliari n. 7148')], cw), Spacer(1, 1 * mm)]
    s += [Section('Prodotto'), kv([('Descrizione', 'Gettoniera per docce con elettrovalvola solenoide 12 Vcc SELV'), ('Famiglia', 'F2 - Timer 12 Vcc SELV per docce con elettrovalvola'),
                                    ('Modello / codice', '<b>BGM2DOC4000</b>'), ('Anno di costruzione', '2026'), ('Tensione nominale', '230 Vac - 50 Hz (ingresso) / 12 Vcc SELV (uscita elettrovalvola)'),
                                    ('Grado di protezione', 'IP44 minimo')], cw), Spacer(1, 2 * mm)]
    d = [['Direttiva', 'Denominazione'], ['2014/35/UE', 'Direttiva Bassa Tensione (LVD)'], ['2014/30/UE', 'Direttiva Compatibilità Elettromagnetica (EMC)'],
         ['2012/19/UE', 'Direttiva RAEE - Rifiuti di Apparecchiature Elettriche ed Elettroniche'], ['2011/65/UE', 'Direttiva RoHS - Restrizione sostanze pericolose'],
         ['2001/95/CE', 'Direttiva Sicurezza Generale dei Prodotti (GPSD)'], ['2009/125/CE', 'Direttiva Ecodesign']]
    n = [['Norma', 'Oggetto'], ['EN 60335-1:2012+A11+A13+A14+A1+A2', 'Sicurezza apparecchi elettrodomestici - Requisiti generali (LVD)'],
         ['EN 60335-2-35:2016+A1:2019', 'Requisiti particolari per scaldacqua ad accumulo (LVD - rif. ambienti umidi)'],
         ['EN 61000-6-3:2007+A1:2011+AC:2012', 'EMC - Emissioni in ambienti residenziali e commerciali'], ['EN 61000-6-1:2007', 'EMC - Immunità in ambienti residenziali e commerciali'],
         ['EN 61000-3-2:2006+A1:2009+A2:2009', 'Limitazione delle armoniche di corrente'], ['EN 61000-3-3:2013', 'Limitazione delle variazioni di tensione e flicker'],
         ['CEI 64-8 / IEC 60364-7-701', 'Impianti in luoghi contenenti bagni e docce - zone IP (rif. installazione)'], ['IEC 61882:2016', 'Metodo analisi dei rischi - metodo HAZOP']]
    def grid(rows, w0):
        t = Table([[Paragraph(c, ParagraphStyle('c', fontName='Helvetica-Bold' if i == 0 or j == 0 else 'Helvetica', fontSize=8, leading=10, textColor=GREY if i == 0 else (NAVY if j == 0 else INK))) for j, c in enumerate(r)] for i, r in enumerate(rows)], colWidths=[w0, cw - w0])
        t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), PALE), ('LINEBELOW', (0, 0), (-1, -1), .4, LINE), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 1.4), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.8)]))
        return t
    s += [Section('Direttive applicabili'), grid(d, 32 * mm), Spacer(1, 0), Section('Norme armonizzate di riferimento'), grid(n, 62 * mm), Spacer(1, 1 * mm)]
    sig = Table([[[Paragraph('Il sottoscritto dichiara, sotto la propria esclusiva responsabilità, che il prodotto sopra descritto è conforme alle direttive e alle norme armonizzate indicate nella presente dichiarazione.', ST['small']), Spacer(1, 2 * mm),
                   Paragraph('Luogo e data: Cagliari, 06/11/2026', ST['small'])],
                  [Paragraph('Firma del legale rappresentante', ST['grey']), Image(os.path.join(IMG, 'firma.png'), width=34 * mm, height=34 * mm * 563 / 1500, hAlign='LEFT'), HR(), Paragraph('Ing. Tullio Serci<br/>Legale rappresentante', ST['small'])]]], colWidths=[cw * 0.58, cw * 0.42])
    sig.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LINEBELOW', (1, 0), (1, 0), 0, colors.white), ('LEFTPADDING', (0, 0), (-1, -1), 0)]))
    s += [KeepTogether([Section('Dichiarazione e firma'), sig])]
    build(os.path.join(OUT, '2_MODELLO_Dichiarazione_CE_BGM2DOC4000_rev1.pdf'), s, ce_header, ce_footer)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True); istruzioni(); ce_doc(); print('modelli scritti in', OUT)
