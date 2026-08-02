#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# sicherung.sh – tägliche Sicherung aller 4ever1-Daten auf dem eigenen Server.
#
# Gesichert wird alles, was bei einem Plattenschaden weg wäre:
#   • ident      Akten, Aufnahmen, Ausweisbilder, Streamer-Ordner, Konten
#   • PK-Board   Beiträge, Chats, Mitglieder, Vermerke, Familien (PostgreSQL)
#   • Tipp-Spiel eigene Datenbank
#   • Zugangsdaten (app.env) – ohne sie wären die ident-Akten unlesbar
#
# Einrichten (einmalig, auf dem Server):
#     bash ident/sicherung.sh --einrichten
# Danach läuft sie jede Nacht um 3:30 Uhr von selbst.
#
# Von Hand starten:
#     bash ident/sicherung.sh
#
# Zurückspielen: siehe --hilfe. Es wird NIE automatisch zurückgespielt.
# ---------------------------------------------------------------------------
set -euo pipefail

ZIEL="${ZIEL:-/var/sicherung/4ever1}"     # wohin gesichert wird
TAGE="${TAGE:-14}"                         # so viele Tage aufheben
IDENT="${IDENT:-/opt/4ever1-ident}"        # Datenordner und app.env von ident

sage()   { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
gut()    { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn()   { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
fehler() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

# ---- Hilfe ----------------------------------------------------------------
if [ "${1:-}" = "--hilfe" ] || [ "${1:-}" = "-h" ]; then
  cat <<'ENDE'
Sicherung der 4ever1-Daten

  bash sicherung.sh               einmal jetzt sichern
  bash sicherung.sh --einrichten  jede Nacht um 3:30 Uhr sichern lassen
  bash sicherung.sh --stand       zeigt, was gesichert ist

ZURÜCKSPIELEN (immer von Hand, nie automatisch):

  Datenbanken:
    gunzip -c /var/sicherung/4ever1/<datum>/team4ever1.sql.gz \
      | sudo -u postgres psql -d team4ever1

  ident-Daten:
    docker stop 4ever1-ident
    tar xzf /var/sicherung/4ever1/<datum>/ident-daten.tgz -C /opt/4ever1-ident/data
    docker start 4ever1-ident

WICHTIG: Eine Sicherung auf demselben Rechner hilft gegen Versehen und
Softwarefehler – nicht gegen Feuer, Diebstahl oder einen Totalausfall des
Servers. Hol dir regelmässig eine Kopie herunter, zum Beispiel:

    scp -r team4ever1:/var/sicherung/4ever1/$(date +%F) ~/4ever1-sicherung/
ENDE
  exit 0
fi

# ---- Stand anzeigen -------------------------------------------------------
if [ "${1:-}" = "--stand" ]; then
  [ -d "$ZIEL" ] || fehler "Noch keine Sicherung vorhanden ($ZIEL fehlt)."
  echo "Sicherungen in $ZIEL:"
  du -sh "$ZIEL"/*/ 2>/dev/null | sort | tail -20
  echo
  echo "Belegt insgesamt: $(du -sh "$ZIEL" | cut -f1)"
  systemctl list-timers 4ever1-sicherung.timer --no-pager 2>/dev/null | head -3 || true
  exit 0
fi

# ---- Nachts von selbst laufen lassen --------------------------------------
if [ "${1:-}" = "--einrichten" ]; then
  [ "$(id -u)" = "0" ] || fehler "Bitte als root ausführen (sudo)."
  SKRIPT="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
  sage "Nächtliche Sicherung einrichten"

  cat > /etc/systemd/system/4ever1-sicherung.service <<ENDE
[Unit]
Description=Sicherung der 4ever1-Daten
After=postgresql.service docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/env bash $SKRIPT
ENDE

  cat > /etc/systemd/system/4ever1-sicherung.timer <<'ENDE'
[Unit]
Description=Sicherung der 4ever1-Daten, jede Nacht

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true

[Install]
WantedBy=timers.target
ENDE

  systemctl daemon-reload
  systemctl enable --now 4ever1-sicherung.timer
  gut "Eingerichtet – läuft jede Nacht um 3:30 Uhr"
  systemctl list-timers 4ever1-sicherung.timer --no-pager | head -3
  echo
  echo "Jetzt einmal von Hand prüfen:  bash $SKRIPT"
  exit 0
fi

# ---- Sichern --------------------------------------------------------------
HEUTE="$(date +%F)"
ORDNER="$ZIEL/$HEUTE"
mkdir -p "$ORDNER"

sage "Sicherung $HEUTE"

# 1. Datenbanken (PK-Board, Tipp-Spiel und was sonst noch da ist)
DBS="$(sudo -u postgres psql -Atc \
      "select datname from pg_database where datistemplate=false and datname<>'postgres'" 2>/dev/null || true)"
if [ -n "$DBS" ]; then
  for DB in $DBS; do
    sudo -u postgres pg_dump -d "$DB" | gzip > "$ORDNER/$DB.sql.gz"
    gut "$DB  ($(du -h "$ORDNER/$DB.sql.gz" | cut -f1))"
  done
else
  warn "Keine Datenbank erreichbar – nichts aus PostgreSQL gesichert"
fi

# 2. ident: Akten, Aufnahmen, Bilder. Liegen bereits verschlüsselt auf der
#    Platte – die Sicherung ändert daran nichts.
if [ -d "$IDENT/data" ]; then
  tar czf "$ORDNER/ident-daten.tgz" -C "$IDENT/data" .
  gut "ident-Daten  ($(du -h "$ORDNER/ident-daten.tgz" | cut -f1))"
else
  warn "Kein ident-Datenordner unter $IDENT/data"
fi

# 3. Zugangsdaten. Ohne den STORAGE_KEY sind die ident-Akten unlesbar – die
#    Sicherung wäre also wertlos. Deshalb gehört app.env dazu. Genau deswegen
#    ist die Sicherung selbst schützenswert: nur root darf sie lesen.
if [ -f "$IDENT/app.env" ]; then
  cp "$IDENT/app.env" "$ORDNER/app.env"
  gut "Zugangsdaten (app.env)"
fi

# 4. Wie war der Server eingerichtet? Hilft beim Wiederaufbau.
{
  echo "# Stand $(date -Is)"
  echo "## Container"; docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null || true
  echo "## Dienste";   { systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null || true; } | awk '{print $1}' || true
  echo "## nginx";     ls /etc/nginx/sites-enabled/ 2>/dev/null || true
} > "$ORDNER/server-uebersicht.txt"
tar czf "$ORDNER/nginx.tgz" -C /etc nginx 2>/dev/null && gut "nginx-Einstellungen" || true

chmod -R go-rwx "$ZIEL"

# 5. Alte Sicherungen aufräumen
ALT=$(find "$ZIEL" -maxdepth 1 -type d -name '20*' -mtime "+$TAGE" | wc -l)
find "$ZIEL" -maxdepth 1 -type d -name '20*' -mtime "+$TAGE" -exec rm -rf {} + 2>/dev/null || true
[ "$ALT" -gt 0 ] && gut "$ALT alte Sicherung(en) entfernt (älter als $TAGE Tage)" || true

# 6. Nachrechnen: steht wirklich etwas Wertvolles drin? Eine Sicherung, die
#    nur die Server-Übersicht enthält, ist keine – lieber laut scheitern, als
#    wochenlang im guten Glauben leere Ordner anzuhäufen.
GROESSE=$(du -sh "$ORDNER" | cut -f1)
ANZAHL=$(find "$ORDNER" -type f | wc -l)
INHALT=$(find "$ORDNER" -maxdepth 1 -type f \( -name '*.sql.gz' -o -name 'ident-daten.tgz' \) | wc -l)
[ "$INHALT" -ge 1 ] || fehler "Nichts Wesentliches gesichert (weder Datenbank noch ident-Daten) – bitte nachsehen."

sage "Fertig: $GROESSE in $ORDNER ($ANZAHL Dateien)"
echo "  Platz auf der Platte: $(df -h "$ZIEL" | awk 'NR==2{print $4" frei von "$2}')"
echo
echo "  Denk daran: Eine Kopie ausserhalb des Servers schützt zusätzlich."
echo "  scp -r team4ever1:$ORDNER ~/4ever1-sicherung/"
