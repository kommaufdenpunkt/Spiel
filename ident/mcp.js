/* mcp.js – Übergabe einer fertigen Akte an mcp.4ever1.tv.
 *
 * Wenn eine Audition abgeschlossen ist, soll alles in den Ordner des Streamers
 * wandern. Diese Datei kümmert sich um genau diesen Weg.
 *
 * Eingerichtet wird das ausschliesslich über Umgebungsvariablen:
 *   MCP_URL    Adresse, an die die Akte geschickt wird (Pflicht, sonst passiert nichts)
 *   MCP_TOKEN  Schlüssel, mit dem sich ident dort ausweist
 *   MCP_AUTO   "off" schaltet die automatische Übergabe ab (Vorgabe: an)
 *   PUBLIC_URL Adresse dieser Anwendung, z. B. https://ident.4ever1.tv
 *              (nötig, damit die Gegenstelle die Dateien abholen kann)
 *
 * Ist MCP_URL nicht gesetzt, tut diese Datei nichts. Die Akte bleibt dann
 * einfach hier liegen – es geht nichts verloren.
 *
 * Was übergeben wird: die Daten der Akte als JSON, dazu Abhol-Links für die
 * Ausweisbilder und die Videoaufnahme. Die Links sind unterschrieben und
 * laufen nach kurzer Zeit ab, damit niemand sonst an die Dateien kommt.
 */
'use strict';
const crypto = require('crypto');

const MCP_URL = String(process.env.MCP_URL || '').trim();
const MCP_TOKEN = String(process.env.MCP_TOKEN || '').trim();
const MCP_AUTO = String(process.env.MCP_AUTO || '').toLowerCase() !== 'off';
const PUBLIC_URL = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
const LINK_TTL = 24 * 60 * 60 * 1000;   // Abhol-Links gelten einen Tag
const VERSUCHE = [0, 15000, 60000, 300000];  // sofort, nach 15 s, 1 min, 5 min

let signKey = null;
/** Schlüssel zum Unterschreiben der Abhol-Links. */
function initSign(secret) {
  signKey = crypto.createHash('sha256').update(String(secret || '') + '|mcp-pull').digest();
}
function sign(caseId, file, exp) {
  if (!signKey) return '';
  return crypto.createHmac('sha256', signKey).update(caseId + '|' + file + '|' + exp).digest('hex').slice(0, 32);
}
/** Prüft einen Abhol-Link. Gibt true zurück, wenn er gültig und nicht abgelaufen ist. */
function pruefeLink(caseId, file, exp, sig) {
  const e = parseInt(exp, 10);
  if (!signKey || !Number.isFinite(e) || Date.now() > e) return false;
  const soll = sign(caseId, file, String(e));
  const a = Buffer.from(String(sig || ''));
  const b = Buffer.from(soll);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function aktiv() { return !!MCP_URL; }
function autoAn() { return aktiv() && MCP_AUTO; }
function info() {
  return {
    aktiv: aktiv(), auto: autoAn(),
    ziel: MCP_URL ? MCP_URL.replace(/^(https?:\/\/[^/]+).*$/, '$1/…') : '',
    schluessel: !!MCP_TOKEN, oeffentlicheAdresse: PUBLIC_URL || '',
  };
}

/** Baut das Paket, das an mcp geschickt wird. */
function baueNutzlast(fall, aufnahme) {
  const exp = String(Date.now() + LINK_TTL);
  const dateien = [];
  if (PUBLIC_URL) {
    (fall.docs || []).forEach((d) => {
      dateien.push({
        art: 'ausweis', bezeichnung: d.label, dateiname: d.file,
        url: PUBLIC_URL + '/api/pull?' + new URLSearchParams({ fall: fall.id, datei: d.file, exp, sig: sign(fall.id, d.file, exp) }),
      });
    });
    if (aufnahme) {
      dateien.push({
        art: 'aufnahme', bezeichnung: 'Video der Audition', dateiname: 'video.' + (aufnahme.ext || 'webm'),
        sekunden: aufnahme.durationSec || 0, bytes: aufnahme.bytes || 0,
        url: PUBLIC_URL + '/api/pull?' + new URLSearchParams({ fall: fall.id, datei: 'rec:' + aufnahme.id, exp, sig: sign(fall.id, 'rec:' + aufnahme.id, exp) }),
      });
    }
  }
  return {
    quelle: 'ident.4ever1.tv',
    version: 1,
    // Der Ordner des Streamers wird über die BIGO-ID zugeordnet – die ändert
    // sich nicht, anders als der angezeigte Name.
    streamer: {
      bigoId: fall.bigoName || '',
      name: fall.verifiedName || '',
      alter: fall.age || '',
    },
    audition: {
      id: fall.id,
      zugangsnummer: fall.code || '',
      ergebnis: fall.result,                     // approved | rejected | open
      ablehnungsgrund: fall.rejectReason || '',
      pruefer: fall.agentName || '',
      ausweisart: fall.docType || '',
      ausweisnummer: fall.docNumber || '',
      notiz: fall.note || '',
      checkliste: fall.checklist || [],
      erstelltAm: fall.createdAt,
    },
    aufnahme: aufnahme ? {
      id: aufnahme.id, sekunden: aufnahme.durationSec || 0, bytes: aufnahme.bytes || 0,
      auswertung: aufnahme.quality || '', begruendung: aufnahme.reviewNote || '',
      geprueftVon: aufnahme.reviewedBy || '', geprueftAm: aufnahme.reviewedAt || '',
    } : null,
    protokoll: (fall.entries || []).map((e) => ({
      text: e.text, autor: e.author, art: e.kind || '', am: e.createdAt,
    })),
    dateien,
    linksGueltigBis: new Date(Number(exp)).toISOString(),
  };
}

/** Einmal senden. Gibt {ok, status, text} zurück. */
async function senden(nutzlast) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(MCP_TOKEN ? { Authorization: 'Bearer ' + MCP_TOKEN } : {}),
      },
      body: JSON.stringify(nutzlast),
      signal: ctrl.signal,
    });
    const text = (await res.text().catch(() => '')).slice(0, 300);
    return { ok: res.ok, status: res.status, text };
  } catch (e) {
    return { ok: false, status: 0, text: String(e && e.message || e).slice(0, 300) };
  } finally { clearTimeout(t); }
}

/**
 * Akte übergeben, mit mehreren Versuchen. Blockiert nie den laufenden Betrieb:
 * schlägt es fehl, wird es in der Akte vermerkt und kann von Hand wiederholt
 * werden.
 * @param {object} deps  { getCase, getRecordingByCode, setStatus, log }
 */
async function uebergeben(fallId, deps, vonHand) {
  if (!aktiv()) return { ok: false, grund: 'nicht-eingerichtet' };
  const fall = deps.getCase(fallId);
  if (!fall) return { ok: false, grund: 'akte-weg' };
  if (!PUBLIC_URL) deps.log('MCP: PUBLIC_URL fehlt – die Gegenstelle bekommt keine Abhol-Links.');

  const aufnahme = deps.getRecordingByCode(fall.code);
  const nutzlast = baueNutzlast(fall, aufnahme);
  deps.setStatus(fallId, { status: 'laeuft', text: vonHand ? 'Übergabe von Hand gestartet' : 'Übergabe gestartet' });

  let letzte = null;
  for (let i = 0; i < VERSUCHE.length; i++) {
    if (VERSUCHE[i]) await new Promise((r) => setTimeout(r, VERSUCHE[i]));
    letzte = await senden(nutzlast);
    if (letzte.ok) {
      deps.setStatus(fallId, { status: 'uebergeben', text: 'HTTP ' + letzte.status });
      deps.log('MCP: Akte übergeben (' + (fall.bigoName || fall.code) + ')');
      return { ok: true, status: letzte.status };
    }
    deps.log('MCP: Versuch ' + (i + 1) + ' fehlgeschlagen (' + (letzte.status || 'keine Verbindung') + ')');
  }
  deps.setStatus(fallId, {
    status: 'fehlgeschlagen',
    text: letzte ? (letzte.status ? 'HTTP ' + letzte.status + ' ' + letzte.text : letzte.text) : 'unbekannt',
  });
  return { ok: false, grund: 'fehlgeschlagen', status: letzte && letzte.status };
}

module.exports = { initSign, pruefeLink, aktiv, autoAn, info, uebergeben, baueNutzlast };
