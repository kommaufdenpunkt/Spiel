// Schlanker SMTP-Client ohne externe Pakete (nur node:net / node:tls).
// Unterstuetzt implizites TLS (Port 465, secure=true) und STARTTLS (Port 587,
// secure=false) sowie AUTH LOGIN. Body wird UTF-8/base64 kodiert, damit
// Umlaute und Emojis sauber ankommen. Kein Fremd-Paket noetig.
import net from 'node:net';
import tls from 'node:tls';
import { hostname } from 'node:os';

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
// RFC-2047-„encoded word" fuer Kopfzeilen mit Nicht-ASCII (Betreff, Anzeigename).
const encWord = (s) => (/[^\x20-\x7E]/.test(s) ? `=?UTF-8?B?${b64(s)}?=` : String(s));
// base64-Body in 76er-Zeilen (RFC 5322 empfiehlt kurze Zeilen).
const wrap76 = (s) => Buffer.from(String(s || ''), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');

function safeHostname() {
  const h = (hostname() || 'localhost').replace(/[^A-Za-z0-9.-]/g, '');
  return h || 'localhost';
}

// Baut eine RFC-5322-Nachricht. Bei text+html: multipart/alternative.
export function buildMessage({ from, fromName, to, subject, text, html, replyTo }) {
  const H = [];
  H.push(`From: ${fromName ? `${encWord(fromName)} <${from}>` : from}`);
  H.push(`To: ${to}`);
  if (replyTo) H.push(`Reply-To: ${replyTo}`);
  H.push(`Subject: ${encWord(subject || '')}`);
  H.push(`Date: ${new Date().toUTCString()}`);
  H.push(`Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${(from || 'localhost').split('@')[1] || 'localhost'}>`);
  H.push('MIME-Version: 1.0');
  if (html && text) {
    const bnd = 'gino_' + Math.random().toString(36).slice(2);
    H.push(`Content-Type: multipart/alternative; boundary="${bnd}"`);
    const body = [
      `--${bnd}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(text), '',
      `--${bnd}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(html), '',
      `--${bnd}--`, '',
    ].join('\r\n');
    return H.join('\r\n') + '\r\n\r\n' + body;
  }
  const isHtml = !!html;
  H.push(`Content-Type: text/${isHtml ? 'html' : 'plain'}; charset=UTF-8`);
  H.push('Content-Transfer-Encoding: base64');
  return H.join('\r\n') + '\r\n\r\n' + wrap76(isHtml ? html : (text || ''));
}

// „Dot-stuffing": Zeilen, die mit '.' beginnen, verdoppeln (RFC 5321). Base64
// enthaelt keine Punkte, aber sicher ist sicher.
function dotStuff(msg) {
  return msg.replace(/^\./gm, '..').replace(/\n\./g, '\n..');
}

// Antworten des Servers lesen (auch mehrzeilig: „250-…" Fortsetzung, „250 " Ende).
function makeReader() {
  let buffer = '';
  let waiter = null; // { resolve, reject }
  function flush() {
    if (!waiter) return;
    const lines = buffer.split('\r\n');
    for (let i = 0; i < lines.length; i++) {
      const m = /^(\d{3}) /.exec(lines[i]);
      if (m) {
        const code = Number(m[1]);
        const textLines = lines.slice(0, i + 1);
        buffer = lines.slice(i + 1).join('\r\n');
        const w = waiter; waiter = null;
        w.resolve({ code, text: textLines.join('\n') });
        return;
      }
    }
  }
  return {
    feed(chunk) { buffer += chunk.toString('binary'); flush(); },
    fail(err) { if (waiter) { const w = waiter; waiter = null; w.reject(err); } },
    reset() { buffer = ''; },
    next() { return new Promise((resolve, reject) => { waiter = { resolve, reject }; flush(); }); },
  };
}

// Sendet genau eine Mail. cfg: { host, port, secure, user, pass, from, fromName }.
// mail: { to, subject, text, html, replyTo }. Wirft bei jedem Fehler (mit Klartext).
export async function sendMail(cfg, mail) {
  if (!cfg || !cfg.host || !cfg.port) throw new Error('SMTP nicht konfiguriert (Host/Port fehlt).');
  if (!cfg.from) throw new Error('Absender-Adresse fehlt.');
  if (!mail || !mail.to) throw new Error('Empfaenger fehlt.');
  const me = safeHostname();
  const message = dotStuff(buildMessage({
    from: cfg.from, fromName: cfg.fromName, to: mail.to,
    subject: mail.subject, text: mail.text, html: mail.html, replyTo: mail.replyTo,
  }));
  const reader = makeReader();

  return await new Promise((resolve, reject) => {
    let sock;
    let settled = false;
    const done = (err, val) => {
      if (settled) return; settled = true;
      clearTimeout(timer);
      try { sock && sock.destroy(); } catch {}
      err ? reject(err) : resolve(val);
    };
    const timer = setTimeout(() => done(new Error('Zeitüberschreitung (20 s) – keine Antwort vom Mailserver. Oft ist der ausgehende Mail-Port beim Server-Anbieter gesperrt (z.B. Hetzner Cloud) und muss freigeschaltet werden.')), 20000);

    const bind = (s) => {
      sock = s;
      s.on('data', (d) => reader.feed(d));
      s.on('error', (e) => {
        reader.fail(e);
        // Klartext-Hinweise fuer die haeufigsten Faelle (z.B. gesperrter Mail-Port).
        const code = e.code || '';
        let hint = e.message || String(e) || 'unbekannt';
        if (code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EHOSTUNREACH')
          hint = `${code} – der Mailserver ist nicht erreichbar. Oft blockiert der Anbieter (z.B. Hetzner Cloud) ausgehende Mail-Ports (25/465/587); dann muss der Versand freigeschaltet werden. Alternativ Port 587 (SSL-Haken aus) probieren.`;
        else if (/certificate|self.signed|altnames|CERT_/i.test(hint))
          hint = `TLS-Zertifikat passt nicht (${hint}). Stimmt der SMTP-Server exakt? Bei Port 587 den SSL-Haken ausschalten (STARTTLS).`;
        done(new Error('SMTP-Verbindungsfehler: ' + hint));
      });
      s.on('close', () => { if (!settled) done(new Error('SMTP-Verbindung unerwartet geschlossen (evtl. Port blockiert oder falscher Verschlüsselungs-Modus).')); });
    };

    const expect = async (want, ctx) => {
      const r = await reader.next();
      if (want && r.code !== want) throw new Error(`SMTP ${ctx || ''} erwartete ${want}, bekam ${r.code}: ${r.text.replace(/\s+/g, ' ').trim()}`);
      return r;
    };
    const send = (line) => new Promise((res, rej) => sock.write(line + '\r\n', (e) => e ? rej(e) : res()));
    const cmd = async (line, want, ctx) => { await send(line); return expect(want, ctx); };

    (async () => {
      try {
        // Verbindung aufbauen
        if (cfg.secure) {
          bind(tls.connect({ host: cfg.host, port: Number(cfg.port), servername: cfg.host }));
        } else {
          bind(net.connect({ host: cfg.host, port: Number(cfg.port) }));
        }
        await expect(220, 'Begruessung');
        await cmd(`EHLO ${me}`, 250, 'EHLO');
        // STARTTLS-Weg (Port 587): auf verschluesselte Verbindung hochstufen.
        if (!cfg.secure) {
          await cmd('STARTTLS', 220, 'STARTTLS');
          const plain = sock;
          plain.removeAllListeners('data');
          plain.removeAllListeners('close');
          reader.reset();
          const upgraded = tls.connect({ socket: plain, servername: cfg.host });
          bind(upgraded);
          await new Promise((res, rej) => { upgraded.once('secureConnect', res); upgraded.once('error', rej); });
          await cmd(`EHLO ${me}`, 250, 'EHLO(TLS)');
        }
        // Anmelden
        await cmd('AUTH LOGIN', 334, 'AUTH');
        await cmd(b64(cfg.user), 334, 'Benutzer');
        await cmd(b64(cfg.pass), 235, 'Passwort');
        // Umschlag + Inhalt
        await cmd(`MAIL FROM:<${cfg.from}>`, 250, 'MAIL FROM');
        await cmd(`RCPT TO:<${mail.to}>`, 250, 'RCPT TO');
        await cmd('DATA', 354, 'DATA');
        await cmd(message + '\r\n.', 250, 'Nachricht');
        try { await cmd('QUIT', 221, 'QUIT'); } catch { /* egal – Mail ist raus */ }
        done(null, { ok: true });
      } catch (e) {
        done(e);
      }
    })();
  });
}
