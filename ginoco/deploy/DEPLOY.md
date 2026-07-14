# ginoco.de online bringen — Schritt für Schritt

Diese Anleitung bringt ginoco auf einen **deutschen Server** (Hetzner) mit
**automatischem HTTPS**. Alles ist zum Kopieren. Du brauchst kein Vorwissen —
folge einfach den Blöcken von oben nach unten.

Was am Ende läuft:
- ginoco erreichbar unter **https://ginoco.de** (gültiges SSL-Schloss)
- Server steht in Deutschland (DSGVO-freundlich für Schüler- und Standortdaten)
- Startet nach Neustart/Absturz von allein wieder
- Kostet ca. **4 €/Monat**

---

## Überblick (5 Schritte)

1. Server bei Hetzner erstellen
2. Einmalig einloggen und Grundausstattung installieren
3. ginoco einrichten (Code + Autostart)
4. Domain ginoco.de auf den Server zeigen
5. HTTPS aktivieren und testen

---

## Schritt 1 — Server bei Hetzner erstellen

1. Konto anlegen auf **https://console.hetzner.cloud** (falls noch keins da ist).
2. Neues Projekt → **Server hinzufügen (Add Server)**.
3. Einstellungen wählen:
   - **Standort:** Nürnberg oder Falkenstein (Deutschland)
   - **Image:** Ubuntu 24.04
   - **Typ:** CX22 (2 vCPU, 4 GB) — reicht dick, ~4 €/Monat
   - **SSH-Key:** wenn du einen hast, hochladen. Sonst wählt Hetzner
     „Passwort" und mailt dir das Root-Passwort. (SSH-Key ist sicherer.)
4. Server erstellen. Notiere dir die **IPv4-Adresse** (z. B. `203.0.113.45`).

---

## Schritt 2 — Einloggen und Grundausstattung

Öffne auf deinem Mac das Programm **Terminal** und verbinde dich
(die IP durch deine ersetzen):

```bash
ssh root@203.0.113.45
```

Beim ersten Mal „yes" bestätigen, dann Passwort eingeben (falls kein SSH-Key).

Jetzt alles Nötige installieren — **die folgenden Zeilen komplett kopieren und
einfügen** (ein Block, mit Enter abschließen):

```bash
# System aktuell
apt update && apt upgrade -y

# Node.js 22 (nötig für node:sqlite)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs git

# Caddy (Webserver mit automatischem HTTPS)
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# eigenen Benutzer für die App anlegen (läuft nicht als root)
adduser --disabled-password --gecos "" ginoco
```

Kurz prüfen, dass Node 22+ da ist:

```bash
node --version    # sollte v22.x.x oder höher zeigen
```

---

## Schritt 3 — ginoco einrichten

Als App-Benutzer den Code holen:

```bash
su - ginoco
mkdir -p ~/app && cd ~/app
git clone https://github.com/kommaufdenpunkt/Spiel.git
cd Spiel
git checkout claude/driving-school-portal-0kyh6y
cd ginoco

# einmal testen, dass es startet:
node server.js
```

Wenn `ginoco laeuft auf http://localhost:3000` erscheint: super.
Mit **Strg+C** wieder beenden und zurück zu root:

```bash
exit          # zurück von "ginoco" zu "root"
```

Jetzt Autostart einrichten (als root):

```bash
# systemd-Dienst kopieren
cp /home/ginoco/app/Spiel/ginoco/deploy/ginoco.service /etc/systemd/system/ginoco.service

# Node-Pfad prüfen und ggf. in der Datei anpassen:
which node        # zeigt z.B. /usr/bin/node — muss zur ExecStart-Zeile passen

systemctl daemon-reload
systemctl enable --now ginoco
systemctl status ginoco     # sollte "active (running)" zeigen
```

---

## Schritt 4 — Domain ginoco.de auf den Server zeigen

Das machst du bei deinem **Domain-Anbieter** (wo ginoco.de registriert ist),
im Bereich **DNS-Einstellungen**. Lege zwei Einträge an (bzw. ändere sie):

| Typ | Name / Host | Wert / Ziel        |
|-----|-------------|--------------------|
| A   | `@`         | deine Server-IPv4  |
| A   | `www`       | deine Server-IPv4  |

(Falls dein Anbieter IPv6 unterstützt und der Server eine `AAAA`/IPv6-Adresse
hat, kannst du zusätzlich zwei `AAAA`-Einträge auf die IPv6 setzen — optional.)

Die Umstellung kann ein paar Minuten bis wenige Stunden dauern. Prüfen kannst
du es so (auf dem Mac):

```bash
dig +short ginoco.de     # sollte deine Server-IP zeigen
```

---

## Schritt 5 — HTTPS aktivieren

Auf dem Server (als root) die Caddy-Konfiguration einspielen:

```bash
cp /home/ginoco/app/Spiel/ginoco/deploy/Caddyfile /etc/caddy/Caddyfile
mkdir -p /var/log/caddy
systemctl reload caddy
```

Caddy holt jetzt **automatisch** ein Let's-Encrypt-Zertifikat für ginoco.de.
Nach ~30 Sekunden im Browser öffnen:

**https://ginoco.de**

Du solltest ginoco mit einem gültigen Schloss-Symbol sehen. Fertig. 🎉

Erster Login: Fahrlehrer-PIN **1234** → sofort in den Einstellungen ändern
(sichere PIN mit Sonderzeichen).

---

## Später: neue Version einspielen (Update)

Wenn ich neue Features baue, holst du sie so auf den Server:

```bash
ssh root@DEINE-IP
su - ginoco
cd ~/app/Spiel && git pull
exit
systemctl restart ginoco
```

Deine Daten (fahrschule.db) bleiben dabei erhalten — sie liegen getrennt vom Code.

---

## Backups (wichtig!)

Deine ganze Fahrschule steckt in **einer Datei**: `fahrschule.db`.
Sichere sie regelmäßig auf deinen Mac (auf dem Mac ausführen):

```bash
scp ginoco@DEINE-IP:/home/ginoco/app/Spiel/ginoco/fahrschule.db ~/ginoco-backup-$(date +%F).db
```

Tipp: das einmal pro Woche machen — oder ich richte dir ein automatisches
tägliches Backup auf dem Server ein, sag einfach Bescheid.

---

## Wenn etwas klemmt

```bash
systemctl status ginoco        # läuft die App?
journalctl -u ginoco -n 50     # letzte App-Meldungen
systemctl status caddy         # läuft der HTTPS-Proxy?
journalctl -u caddy -n 50      # HTTPS/Zertifikat-Meldungen
```

Schick mir einfach die Ausgabe, dann sage ich dir, was zu tun ist.
