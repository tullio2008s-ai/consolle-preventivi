#!/usr/bin/env python3
"""Dichiarazioni di conformità UE per famiglia (F1, F2, F3L, F4a, F4bc, F5, F6) con elenco di tutti i codici (Allegato A).
Uso: python3 scripts/dichiarazioni-ce.py <cartella_uscita> <cartella_immagini>   (immagini: ce.jpg, firma.png)
Prima: python3 scripts/ce-mappa-famiglie.py"""
import os, sys, json, importlib.util
from xml.sax.saxutils import escape
OUT, IMG = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('mod', os.path.join(HERE, 'modelli-documenti.py')); sys.argv = [sys.argv[0], OUT, IMG]
M_ = importlib.util.module_from_spec(spec); spec.loader.exec_module(M_)
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle, Image, KeepTogether, PageBreak
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
NAVY, GREY, INK, PALE, LINE, ORANGE, CYAN, W, H, MG, ST, Section = M_.NAVY, M_.GREY, M_.INK, M_.PALE, M_.LINE, M_.ORANGE, M_.CYAN, M_.W, M_.H, M_.M, M_.ST, M_.Section
cw = W - 2 * MG
DATA = json.load(open(os.path.join(HERE, '..', 'data', 'ce-famiglie-codici.json')))['famiglie']
DATA_DOC = '06/11/2026'

D = lambda a, b: (a, b)
LVD, EMC, RoHS, RAEE, GPSR = D('2014/35/UE', 'Direttiva Bassa Tensione (LVD)'), D('2014/30/UE', 'Direttiva Compatibilità Elettromagnetica (EMC)'), D('2011/65/UE', 'Direttiva RoHS - Restrizione sostanze pericolose (e Dir. delegata 2015/863)'), \
    D('2012/19/UE', 'Direttiva RAEE - Rifiuti di Apparecchiature Elettriche ed Elettroniche'), D('Reg. (UE) 2023/988', 'Regolamento sulla Sicurezza Generale dei Prodotti (GPSR) - sostituisce la Dir. 2001/95/CE')
ECO = D('Reg. (UE) 2023/826', 'Ecodesign - consumo in stand-by e modo spento (ove applicabile)')
RED = D('2014/53/UE', 'Direttiva Apparecchiature Radio (RED) - art. 3.1(a), 3.1(b), 3.2 (assorbe LVD ed EMC per la parte radio)')
CYB = D('Reg. del. (UE) 2022/30', 'Requisiti di sicurezza informatica RED - art. 3.3 (d), (e), (f)')

EMC_N = [D('EN IEC 61000-6-3:2021', 'EMC - Emissioni in ambienti residenziali e commerciali'), D('EN IEC 61000-6-1:2019', 'EMC - Immunità in ambienti residenziali e commerciali'),
         D('EN IEC 61000-3-2:2019+A1:2021', 'Limiti per le emissioni di corrente armonica'), D('EN 61000-3-3:2013+A1:2019', 'Limitazione delle variazioni di tensione e flicker')]
COMMON_N = [D('EN IEC 63000:2018', 'Documentazione tecnica per la valutazione RoHS'), D('EN 60529:1991+A1:2000+A2:2013', 'Gradi di protezione degli involucri (codice IP)'),
            D('IEC 61882:2016', 'Analisi dei rischi - metodo HAZOP (documento AR di famiglia)')]
SELV_N = D('EN 62368-1:2020+A11:2020', 'Sicurezza apparecchi audio/video, ICT - parte elettronica a bassa tensione (sostituisce EN 60950-1, ritirata)')
TIM_N = [D('EN 60730-1:2016+A1:2019', 'Dispositivi elettrici automatici di comando - requisiti generali'), D('EN 60730-2-7:2010', 'Requisiti particolari per timer e interruttori orari')]
RAD_N = [D('EN 62311:2020', 'Esposizione ai campi elettromagnetici (art. 3.1(a))'), D('EN 301 489-1 V2.2.3:2019', 'EMC apparati radio - requisiti comuni (art. 3.1(b))')]
CYB_N = [D('EN 18031-1:2024', 'Sicurezza informatica - protezione della rete (art. 3.3(d))'), D('EN 18031-2:2024', 'Sicurezza informatica - protezione dei dati personali (art. 3.3(e))'),
         D('EN 18031-3:2024', 'Sicurezza informatica - prevenzione delle frodi / valore finanziario (art. 3.3(f))')]

F = {
 'F1': dict(nome='Timer 230 Vac per lavatrici e asciugatrici', file='F1_Timer_230Vac_lavatrici_asciugatrici', stato='emessa',
   desc='Gettoniere, lettori e dispositivi di pagamento per il comando temporizzato di lavatrici e asciugatrici (domestiche e professionali)',
   tens='230 Vac - 50 Hz', carico='16 A (carico resistivo) / 5 A cos&phi; 0,4 (carico induttivo, motore)', ip='IP20 min. (IP44/IP54 versioni da esterno ove indicato)',
   tech='Gestione monete/gettoni (selettore multimoneta), relè di potenza per carico induttivo, display e pulsanti a bassa tensione',
   dir=[LVD, EMC, RoHS, RAEE, GPSR, ECO],
   norme=TIM_N + [D('EN 60335-1:2012+A11+A13+A14+A1+A2', 'Sicurezza apparecchi elettrodomestici - Requisiti generali'), D('EN 60335-2-7:2010+A1+A11+A12', 'Requisiti particolari per lavatrici'),
                  D('EN 60335-2-11:2010+A1+A11+A2', 'Requisiti particolari per asciugabiancheria a tamburo')] + EMC_N + [D('EN 55014-1:2017+A11:2020', 'EMC apparecchi elettrodomestici - emissione'), D('EN 55014-2:2015', 'EMC apparecchi elettrodomestici - immunità'), SELV_N] + COMMON_N),
 'F2': dict(nome='Timer 12 Vcc SELV per docce con elettrovalvola', file='F2_Timer_12Vcc_docce_elettrovalvola', stato='emessa',
   desc='Gettoniere e lettori per il comando temporizzato di docce tramite elettrovalvola solenoide a 12 Vcc SELV',
   tens='230 Vac - 50 Hz (ingresso) / 12 Vcc SELV (uscita elettrovalvola)', carico='uscite 12 Vcc, 1,5 A per uscita', ip='IP44 minimo (zone 1-2 doccia)',
   tech='Alimentatore/trasformatore con isolamento rinforzato 3000 Vac, elettrovalvola normalmente chiusa (fail-safe), selettore multimoneta, display e pulsanti a bassa tensione',
   dir=[LVD, EMC, RoHS, RAEE, GPSR, ECO],
   norme=TIM_N + [D('EN 60730-2-8:2002+A1:2003', 'Requisiti particolari per elettrovalvole dell\'acqua'), D('EN 60335-1:2012+A11+A13+A14+A1+A2', 'Sicurezza apparecchi elettrodomestici - Requisiti generali'),
                  D('EN 60335-2-35:2016+A1:2019', 'Requisiti particolari per scaldacqua istantanei (rif. ambienti umidi)'), D('EN 61558-1:2005+A1:2009', 'Trasformatori di sicurezza - requisiti generali'),
                  D('EN 61558-2-6:2009', 'Trasformatori di isolamento di sicurezza per uso generale (SELV)'), D('HD 60364-7-701:2007 / CEI 64-8 sez. 701', 'Impianti in luoghi contenenti bagni e docce - zone IP (rif. installazione)')] + EMC_N + [SELV_N] + COMMON_N),
 'F3L': dict(nome='Timer 230 Vac per illuminazione e carichi elettrici vari', file='F3L_Timer_230Vac_illuminazione_carichi', stato='emessa',
   desc='Gettoniere, lettori e dispositivi di pagamento per il comando temporizzato di illuminazione, lampade IR, saune, phon, condizionatori, poltrone massaggio, prese di ricarica e carichi 230 Vac / contatto NA',
   tens='230 Vac - 50 Hz / uscite a contatto (NA) e 12 Vcc a basso carico', carico='16 A (carico resistivo) / 10 A (carico induttivo) / non lineare (LED)', ip='IP20 min. (IP54 versioni da esterno ove indicato)',
   tech='Carichi resistivi, induttivi e non lineari (LED/alimentatori), relè di potenza, selettore multimoneta, funzione di preavviso e lampeggio',
   dir=[LVD, EMC, RoHS, RAEE, GPSR, ECO],
   norme=TIM_N + [D('EN 60335-1:2012+A11+A13+A14+A1+A2', 'Sicurezza apparecchi elettrodomestici - Requisiti generali'), D('EN IEC 60598-1:2021', 'Apparecchi di illuminazione - Requisiti generali'),
                  D('EN 60335-2-53:2011+A1:2014', 'Requisiti particolari per apparecchi di riscaldamento per saune'), D('EN 60335-2-23:2003+A1+A2', 'Requisiti particolari per apparecchi per la cura della pelle e dei capelli (phon)'),
                  D('EN 60335-2-40:2003+A11+A12+A1+A2', 'Requisiti particolari per pompe di calore, condizionatori e deumidificatori'), D('EN 60335-2-32:2003+A1+A2', 'Requisiti particolari per apparecchi di massaggio'),
                  D('EN 62493:2015', 'Valutazione degli apparecchi di illuminazione per l\'esposizione ai campi elettromagnetici')] + EMC_N + [D('EN 55015:2019+A11:2020', 'EMC apparecchi di illuminazione - emissioni (carichi LED/lampade)'), SELV_N] + COMMON_N),
 'F4a': dict(nome='Controllo accessi coin-operated - apriporta 12 Vcc / contatto NA', file='F4a_Apriporta_coin_12Vcc', stato='emessa',
   desc='Gettoniere e dispositivi a monete/gettoni per il comando di elettroserrature, apriporta e contatti di apertura (porte, tornelli, sbarre) a 12 Vcc / contatto NA',
   tens='12 Vcc (uscita apriporta) / alimentazione da alimentatore 230 Vac', carico='elettroserratura 500-800 mA, relè 10 milioni di cicli', ip='IP30 (interno) / IP54 (versione outdoor)',
   tech='Selettore multimoneta, relè a basso carico, alimentatore SELV, kit elettroserratura e sensore di presenza',
   dir=[LVD, EMC, RoHS, RAEE, GPSR, ECO],
   norme=TIM_N[:1] + [D('EN 60335-1:2012+A11+A13+A14+A1+A2', 'Sicurezza apparecchi elettrodomestici - Requisiti generali'), D('EN 60839-11-1:2013', 'Sistemi di controllo accessi elettronici - requisiti di sistema'),
                      D('EN 61558-2-6:2009', 'Trasformatori di isolamento di sicurezza per uso generale (alimentatore SELV)')] + EMC_N + [SELV_N] + COMMON_N),
 'F4bc': dict(nome='Controllo accessi e pagamenti con QR code / Wi-Fi - 12 Vcc', file='F4bc_Accessi_QR_WiFi', stato='BOZZA',
   desc='Sistemi di controllo accessi e pagamento con codice QR, connessione Wi-Fi e gestionale cloud',
   tens='12 Vcc (SELV) / alimentatore 230 Vac', carico='uscite 12 Vcc a basso carico', ip='IP30 min.',
   tech='Wi-Fi 2.4 GHz (IEEE 802.11 b/g/n), Bluetooth LE ove presente, lettura/generazione codici QR, connessione cloud (Internet), relè a basso carico',
   radio=True, red_note='Conformità RED in corso - certificato del modulo radio in attesa: inserire numero, laboratorio e data al completamento.',
   dir=[RED, CYB, RoHS, RAEE, GPSR],
   norme=RAD_N + [D('EN 301 489-17 V3.2.4:2020', 'EMC apparati radio - sistemi di trasmissione dati a banda larga (art. 3.1(b))'), D('EN 300 328 V2.2.2:2019', 'Sistemi di trasmissione a banda larga 2,4 GHz - Wi-Fi/Bluetooth (art. 3.2)'),
                  SELV_N] + CYB_N + COMMON_N[:1] + COMMON_N[2:]),
 'F5': dict(nome='Lettore RFID 13,56 MHz (NXP MFRC522 / modulo AZ-Delivery AZ-A2-5)', file='F5_Lettore_RFID_1356MHz', stato='emessa',
   desc='Lettori e programmatori di carte e braccialetti RFID 13,56 MHz integrati in apparecchiature di controllo accessi/pagamento e comando di utenze',
   tens='3,3 Vcc / 5 Vcc (SELV - alimentazione dalla CPU host) / alimentatore 230 Vac o 12 Vcc di sistema', carico='uscite 12 Vcc, contatto NA o 230 Vac secondo modello (vedi famiglie applicative F1, F2, F3L, F4a)', ip='IP30 min.',
   tech='RFID 13,56 MHz ISO/IEC 14443-A - campo operativo 2-5 cm (modulo NXP MFRC522), programmatore USB per PC',
   radio=True, red_note='DoC del modulo AZ-A2-5 (NXP MFRC522) del fabbricante AZ-Delivery (Az216) allegata al fascicolo tecnico - cascading.',
   dir=[RED, RoHS, RAEE, GPSR],
   norme=RAD_N + [D('EN 300 330 V2.1.1:2017', 'Apparati a corto raggio (SRD) 9 kHz - 25 MHz, RFID 13,56 MHz (art. 3.2)'), D('EN 301 489-3 V2.1.1:2019', 'EMC apparati a corto raggio 9 kHz - 246 GHz (art. 3.1(b))'), SELV_N] + COMMON_N[:1] + COMMON_N[2:]),
 'F6': dict(nome='Dispositivi cashless (POS integrati in box proprietario)', file='F6_Cashless_POS', stato='BOZZA',
   desc='Dispositivi di pagamento cashless con POS Nayax / Aurency integrato in box del fabbricante, per il comando di utenze e accessi',
   tens='230 Vac - 50 Hz (alimentazione box) / SELV per i moduli POS', carico='uscite secondo modello (vedi famiglie applicative F1, F2, F3L, F4a)', ip='IP30 min.',
   tech='Pagamenti contactless NFC 13,56 MHz (carte, smartphone), modem cellulare 2G/3G/4G e/o Wi-Fi/Bluetooth del POS, connessione al gestionale del gestore',
   radio=True, red_note='Conformità radio per cascading dai certificati RED dei POS: in attesa - inserire per Nayax e per Aurency numero, laboratorio e data.',
   dir=[RED, CYB, RoHS, RAEE, GPSR],
   norme=RAD_N + [D('EN 300 330 V2.1.1:2017', 'Apparati a corto raggio 9 kHz - 25 MHz (NFC 13,56 MHz)'), D('EN 301 489-3 V2.1.1:2019', 'EMC apparati a corto raggio'),
                  D('EN 300 328 V2.2.2:2019', 'Trasmissione a banda larga 2,4 GHz - Wi-Fi/Bluetooth'), D('EN 301 511 V12.5.1:2017', 'Terminali GSM (art. 3.2)'),
                  D('EN 301 908-1 V15.1.1:2021', 'Reti cellulari IMT - requisiti comuni (3G/4G)'), D('EN 301 489-52 V1.2.1:2021', 'EMC apparati radio cellulari'), SELV_N] + CYB_N + COMMON_N[:1] + COMMON_N[2:]),
}

ps = lambda sz, b=False, col=INK: ParagraphStyle('p', fontName='Helvetica-Bold' if b else 'Helvetica', fontSize=sz, leading=sz + 2.4, textColor=col)

def kv(rows):
    t = Table([[Paragraph(k, ps(8.5, True, GREY)), Paragraph(v, ST['small'])] for k, v in rows], colWidths=[40 * mm, cw - 40 * mm])
    t.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, -1), .4, LINE), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 1.6), ('BOTTOMPADDING', (0, 0), (-1, -1), 2), ('LEFTPADDING', (0, 0), (-1, -1), 1)]))
    return t

def grid(rows, head, w0):
    data = [[Paragraph(h, ps(8, True, GREY)) for h in head]] + [[Paragraph(escape(a), ps(8, True, NAVY)), Paragraph(escape(b), ps(8))] for a, b in rows]
    t = Table(data, colWidths=[w0, cw - w0], repeatRows=1)
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), PALE), ('LINEBELOW', (0, 0), (-1, -1), .4, LINE), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 1.4), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.8)]))
    return t

def make(k, f):
    bozza = f['stato'] == 'BOZZA'; codes = DATA[k]
    def header(c, d):
        c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 17); c.drawString(MG, H - 18 * mm, 'TULLIO SERCI S.R.L.')
        c.setFillColor(GREY); c.setFont('Helvetica', 8.5); c.drawString(MG, H - 24 * mm, 'P.I. 03896490921 - CAGLIARI'); c.drawString(MG, H - 28.5 * mm, 'tullio@tullioserci.srl')
        c.drawImage(os.path.join(IMG, 'ce.jpg'), W - MG - 16 * mm, H - 28 * mm, width=16 * mm, height=16 * mm * 74 / 104, preserveAspectRatio=True)
        c.setStrokeColor(NAVY); c.setLineWidth(.8); c.line(MG, H - 36 * mm, W - MG, H - 36 * mm)
        if bozza:
            c.setFillColor(colors.Color(.85, .1, .1)); c.roundRect(W / 2 - 38 * mm, H - 11 * mm, 76 * mm, 5 * mm, 1 * mm, stroke=0, fill=1)
            c.setFillColor(colors.white); c.setFont('Helvetica-Bold', 6.8); c.drawCentredString(W / 2, H - 9.4 * mm, 'BOZZA - NON VALIDA: ATTESA CERTIFICATI RED')
    def footer(c, d, n):
        c.setStrokeColor(CYAN); c.setLineWidth(.5); c.line(MG, 16 * mm, W - MG, 16 * mm)
        c.setFillColor(NAVY); c.setFont('Helvetica-Bold', 8); c.drawCentredString(W / 2, 11.5 * mm, 'TULLIO SERCI S.R.L. - P.I. 03896490921 - CAGLIARI - tullio@tullioserci.srl')
        c.setFillColor(GREY); c.setFont('Helvetica', 7); c.drawRightString(W - MG, 5 * mm, 'Dichiarazione di conformità UE %s rev. 1 - pag. %d/%d' % (k, d.page, n))
    s = [Paragraph('DICHIARAZIONE DI CONFORMITÀ UE', ParagraphStyle('a', fontName='Helvetica-Bold', fontSize=18, leading=21, textColor=NAVY)),
         Paragraph('EU Declaration of Conformity', ParagraphStyle('b', fontName='Helvetica-Oblique', fontSize=10, leading=13, textColor=GREY)), Spacer(1, 3 * mm)]
    s += [Section('Fabbricante'), kv([('Ragione sociale', 'TULLIO SERCI S.R.L.'), ('Partita IVA', '03896490921 - Cagliari'), ('Legale rappresentante', 'Ing. Tullio Serci - Ordine Ingegneri Cagliari n. 7148')]), Spacer(1, 1 * mm)]
    rows = [('Descrizione', f['desc']), ('Famiglia', '<b>%s - %s</b>' % (k, f['nome'])), ('Modelli / codici', 'Tutti i %d codici elencati nell\'<b>Allegato A</b> (famiglia %s)' % (len(codes), k)),
            ('Anno di costruzione', '2026'), ('Tensione nominale', f['tens']), ('Carico / uscite', f['carico']), ('Grado di protezione', f['ip']), ('Tecnologie impiegate', f['tech'])]
    if f.get('red_note'): rows.append(('Nota radio / RED', f['red_note']))
    s += [Section('Prodotto'), kv(rows), Spacer(1, 1 * mm), Section('Direttive e regolamenti applicabili'), grid(f['dir'], ['Riferimento', 'Denominazione'], 34 * mm), Spacer(1, 1 * mm),
          Section('Norme armonizzate e specifiche applicate'), grid(f['norme'], ['Norma', 'Oggetto'], 62 * mm), Spacer(1, 2 * mm)]
    firma = [Paragraph('Firma del legale rappresentante', ps(8, False, GREY)),
             (Image(os.path.join(IMG, 'firma.png'), width=34 * mm, height=34 * mm * 563 / 1500, hAlign='LEFT') if not bozza else Spacer(1, 12 * mm)), M_.HR(), Paragraph('Ing. Tullio Serci<br/>Legale rappresentante', ST['small'])]
    sig = Table([[[Paragraph('La presente dichiarazione di conformità è rilasciata sotto la responsabilità esclusiva del fabbricante. Il sottoscritto dichiara che i prodotti sopra descritti sono conformi alla normativa di armonizzazione dell\'Unione indicata e alle norme applicate.', ST['small']), Spacer(1, 2 * mm),
                   Paragraph('Luogo e data: Cagliari, ' + (DATA_DOC if not bozza else '____ / ____ / ______'), ST['small'])], firma]], colWidths=[cw * .58, cw * .42])
    sig.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0)]))
    s += [KeepTogether([Section('Dichiarazione e firma'), sig]), PageBreak(), Section('Allegato A - Codici prodotto coperti (%d)' % len(codes))]
    data = [[Paragraph('Codice', ps(8, True, GREY)), Paragraph('Descrizione', ps(8, True, GREY))]] + [[Paragraph(escape(c['sku']), ps(8, True, NAVY)), Paragraph(escape(c['nome'][:140]), ps(8))] for c in codes]
    t = Table(data, colWidths=[28 * mm, cw - 28 * mm], repeatRows=1)
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), PALE), ('LINEBELOW', (0, 0), (-1, -1), .4, LINE), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 1.4), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.8)]))
    s += [t]
    nome = 'DOC_CE_%s%s_rev1.pdf' % (f['file'], '_BOZZA' if bozza else '')
    M_.build(os.path.join(OUT, nome), s, header, footer)
    return nome

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for k, f in F.items(): print(make(k, f), len(DATA[k]), 'codici')
