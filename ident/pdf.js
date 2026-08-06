/**
 * pdf.js – Ausweisblatt als PDF, ohne fremde Bibliothek.
 *
 * Warum selbst gebaut: Ein PDF-Paket zieht Abhängigkeiten nach, die bei einer
 * Akte mit Ausweisdaten mitlaufen würden. Was hier gebraucht wird, ist wenig:
 * Text in einer Standardschrift, Linien, und JPEG-Bilder. JPEG kann PDF direkt
 * einbetten (DCTDecode) – die Bilddaten wandern unverändert hinein, ohne
 * Umrechnung und ohne Qualitätsverlust.
 *
 * Herauskommt eine Datei, die jeder Betrachter öffnet: ein Deckblatt mit den
 * Ausweisdaten, danach je Bild eine Seite in Originalgröße eingepasst.
 */
'use strict';
const zlib = require('zlib');

const A4 = { b: 595.28, h: 841.89 };   // Punkte
const RAND = 48;

/** PDF-Text braucht ein paar Zeichen maskiert, und WinAnsi statt UTF-8. */
function pdfText(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    // Umlaute liegen in WinAnsiEncoding auf denselben Plätzen wie in Latin-1.
    .replace(/[^\x00-\xFF]/g, '?')
    .replace(/[\x80-\xFF]/g, (c) => '\\' + c.charCodeAt(0).toString(8).padStart(3, '0'));
}

/** Bricht Text auf eine Breite um – grob geschätzt, reicht für ein Formular. */
function umbruch(text, zeichenProZeile) {
  const raus = [];
  String(text || '').split(/\r?\n/).forEach((absatz) => {
    if (!absatz.trim()) { raus.push(''); return; }
    let zeile = '';
    absatz.split(/\s+/).forEach((w) => {
      if ((zeile + ' ' + w).trim().length > zeichenProZeile) { raus.push(zeile.trim()); zeile = w; }
      else zeile = (zeile + ' ' + w).trim();
    });
    if (zeile) raus.push(zeile);
  });
  return raus;
}

/** Maße eines JPEG aus dem Kopf lesen (SOF-Marker). */
function jpegMasse(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
    if ((m >= 0xC0 && m <= 0xCF) && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { hoehe: buf.readUInt16BE(i + 5), breite: buf.readUInt16BE(i + 7),
        kanaele: buf[i + 9] || 3 };
    }
    i += 2 + len;
  }
  return null;
}

/**
 * Ein Ausweisblatt bauen.
 *
 * @param {object} kopf   Angaben für das Deckblatt
 * @param {Array}  bilder [{ label, buffer, mime }] – nur JPEG wird eingebettet
 * @returns {Buffer} die PDF-Datei
 */
function ausweisblatt(kopf = {}, bilder = []) {
  const objekte = [];                     // 1-basiert, objekte[0] ist Objekt 1
  const neu = (inhalt) => { objekte.push(inhalt); return objekte.length; };

  // ---- Schriften -----------------------------------------------------------
  const fettNr = neu('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const normNr = neu('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  // ---- Bilder als XObject --------------------------------------------------
  const bildObjekte = [];
  bilder.forEach((b) => {
    if (!b || !b.buffer || !/jpe?g/i.test(b.mime || '')) return;
    const m = jpegMasse(b.buffer);
    if (!m) return;
    const farbe = m.kanaele === 1 ? '/DeviceGray' : (m.kanaele === 4 ? '/DeviceCMYK' : '/DeviceRGB');
    const nr = neu({
      dict: '<< /Type /XObject /Subtype /Image /Width ' + m.breite + ' /Height ' + m.hoehe
        + ' /ColorSpace ' + farbe + ' /BitsPerComponent 8 /Filter /DCTDecode /Length ' + b.buffer.length + ' >>',
      stream: b.buffer,
    });
    bildObjekte.push({ nr, label: b.label || 'Bild', breite: m.breite, hoehe: m.hoehe });
  });

  // ---- Seiteninhalte -------------------------------------------------------
  const seiten = [];
  const seiteDazu = (inhalt, mitBild) => {
    const strom = zlib.deflateSync(Buffer.from(inhalt, 'latin1'));
    const inhaltNr = neu({ dict: '<< /Filter /FlateDecode /Length ' + strom.length + ' >>', stream: strom });
    seiten.push({ inhaltNr, bild: mitBild || null });
  };

  // Deckblatt
  let c = '';
  const txt = (x, y, s, groesse, fett) => {
    c += 'BT /' + (fett ? 'F1' : 'F2') + ' ' + groesse + ' Tf 1 0 0 1 ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' Tm ('
      + pdfText(s) + ') Tj ET\n';
  };
  const linie = (y, dick) => {
    c += (dick ? '1' : '0.5') + ' w 0.75 0.78 0.85 RG ' + RAND + ' ' + y.toFixed(1) + ' m '
      + (A4.b - RAND).toFixed(1) + ' ' + y.toFixed(1) + ' l S\n';
  };
  let y = A4.h - RAND - 10;
  c += '0.09 0.13 0.22 rg ' + RAND + ' ' + (y - 6) + ' ' + (A4.b - 2 * RAND) + ' 34 re f\n0 0 0 rg\n';
  c += '1 1 1 rg\n'; txt(RAND + 12, y + 4, 'AUSWEISUNTERLAGEN - 4EVER1', 14, true); c += '0 0 0 rg\n';
  y -= 34;
  txt(RAND, y, 'Vertraulich. Einsicht nur mit Grund, jeder Zugriff wird protokolliert.', 8, false);
  y -= 26;

  const zeile = (bez, wert) => {
    txt(RAND, y, bez, 9, true);
    umbruch(wert || '-', 62).forEach((z, i) => { txt(RAND + 150, y - i * 13, z, 10, false); });
    y -= Math.max(1, umbruch(wert || '-', 62).length) * 13 + 6;
  };
  txt(RAND, y, 'Person', 11, true); y -= 8; linie(y); y -= 16;
  zeile('BIGO-ID', kopf.bigoId);
  zeile('Name auf BIGO', kopf.bigoName);
  if (kopf.aliasse) zeile('Frühere Namen', kopf.aliasse);
  zeile('Name laut Ausweis', kopf.name);
  zeile('Alter (bei Prüfung)', kopf.alter);
  y -= 6;
  txt(RAND, y, 'Ausweis', 11, true); y -= 8; linie(y); y -= 16;
  zeile('Ausweisart', kopf.ausweisart);
  zeile('Ausweis-Nummer', kopf.ausweisnummer);
  zeile('Geburtsdatum', kopf.geburtsdatum);
  y -= 6;
  txt(RAND, y, 'Prüfung', 11, true); y -= 8; linie(y); y -= 16;
  zeile('Geprüft von', kopf.pruefer);
  zeile('Datum', kopf.datum);
  zeile('Grundlage', kopf.grundlage);
  zeile('Ergebnis', kopf.ergebnis);
  if (kopf.notiz) zeile('Notiz', kopf.notiz);
  y -= 6;
  if (kopf.erklaerung) {
    txt(RAND, y, 'Erklärung des Streamers', 11, true); y -= 8; linie(y); y -= 16;
    umbruch(kopf.erklaerung, 92).forEach((z) => { txt(RAND, y, z, 9, false); y -= 12; });
    y -= 8;
  }
  linie(y, true); y -= 14;
  txt(RAND, y, 'Enthaltene Bilder: ' + (bildObjekte.length || 0), 9, true); y -= 13;
  bildObjekte.forEach((b) => { txt(RAND + 10, y, '- ' + b.label, 9, false); y -= 12; });
  y = RAND;
  txt(RAND, y, 'Erzeugt von ident (4EVER1) am ' + (kopf.erzeugtAm || ''), 8, false);
  seiteDazu(c);

  // Je Bild eine Seite
  bildObjekte.forEach((b) => {
    const maxB = A4.b - 2 * RAND, maxH = A4.h - 2 * RAND - 30;
    const f = Math.min(maxB / b.breite, maxH / b.hoehe);
    const bb = b.breite * f, bh = b.hoehe * f;
    const bx = (A4.b - bb) / 2, by = (A4.h - bh) / 2 - 8;
    let s = '';
    s += 'BT /F1 11 Tf 1 0 0 1 ' + RAND + ' ' + (A4.h - RAND) + ' Tm (' + pdfText(b.label) + ') Tj ET\n';
    s += 'q ' + bb.toFixed(2) + ' 0 0 ' + bh.toFixed(2) + ' ' + bx.toFixed(2) + ' ' + by.toFixed(2)
      + ' cm /I' + b.nr + ' Do Q\n';
    s += 'BT /F2 8 Tf 1 0 0 1 ' + RAND + ' ' + RAND + ' Tm ('
      + pdfText('4EVER1 - vertraulich - ' + (kopf.bigoId || '') + ' - ' + (kopf.datum || '')) + ') Tj ET\n';
    seiteDazu(s, b.nr);
  });

  // ---- Seitenbaum ----------------------------------------------------------
  const seitenNrn = [];
  const baumNr = objekte.length + seiten.length + 1;   // Platz reservieren
  seiten.forEach((sp) => {
    const bilderRes = sp.bild ? ' /XObject << /I' + sp.bild + ' ' + sp.bild + ' 0 R >>' : '';
    seitenNrn.push(neu('<< /Type /Page /Parent ' + baumNr + ' 0 R /MediaBox [0 0 '
      + A4.b + ' ' + A4.h + '] /Resources << /Font << /F1 ' + fettNr + ' 0 R /F2 ' + normNr
      + ' 0 R >>' + bilderRes + ' >> /Contents ' + sp.inhaltNr + ' 0 R >>'));
  });
  const echterBaum = neu('<< /Type /Pages /Count ' + seitenNrn.length + ' /Kids ['
    + seitenNrn.map((n) => n + ' 0 R').join(' ') + '] >>');
  // Die Seiten verweisen auf baumNr – das muss der echte Baum sein.
  if (echterBaum !== baumNr) {
    for (let i = 0; i < objekte.length; i++) {
      if (typeof objekte[i] === 'string') objekte[i] = objekte[i].replace('/Parent ' + baumNr + ' 0 R', '/Parent ' + echterBaum + ' 0 R');
    }
  }
  const katalogNr = neu('<< /Type /Catalog /Pages ' + echterBaum + ' 0 R >>');

  // ---- Zusammensetzen -----------------------------------------------------
  const teile = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  let laenge = teile[0].length;
  const stellen = [];
  objekte.forEach((o, i) => {
    stellen.push(laenge);
    const kopfz = Buffer.from((i + 1) + ' 0 obj\n', 'latin1');
    let stueck;
    if (typeof o === 'string') {
      stueck = Buffer.concat([kopfz, Buffer.from(o + '\nendobj\n', 'latin1')]);
    } else {
      stueck = Buffer.concat([kopfz, Buffer.from(o.dict + '\nstream\n', 'latin1'), o.stream,
        Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    }
    teile.push(stueck); laenge += stueck.length;
  });
  const xrefStelle = laenge;
  let xref = 'xref\n0 ' + (objekte.length + 1) + '\n0000000000 65535 f \n';
  stellen.forEach((s) => { xref += String(s).padStart(10, '0') + ' 00000 n \n'; });
  xref += 'trailer\n<< /Size ' + (objekte.length + 1) + ' /Root ' + katalogNr + ' 0 R >>\nstartxref\n'
    + xrefStelle + '\n%%EOF\n';
  teile.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(teile);
}

module.exports = { ausweisblatt, jpegMasse };
