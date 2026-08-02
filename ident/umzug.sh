#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# umzug.sh – ident vom Coolify-Server auf den eigenen 4ever1-Server holen.
#
# Wird VOM MAC ausgeführt und spricht beide Server über SSH an:
#     bash ident/umzug.sh
#
# Was passiert – und was ausdrücklich NICHT passiert:
#   • Die alte Fassung auf Coolify läuft die ganze Zeit weiter. Erst ganz am
#     Ende, nach der DNS-Umstellung, schaltest du sie von Hand ab.
#   • Es wird nichts gelöscht. Weder hier noch dort.
#   • Der Verschlüsselungsschlüssel wird aus dem laufenden Container gelesen
#     und mitgenommen. Ohne ihn wären alle Akten unlesbar.
#
# Nach dem Lauf sind DNS und Zertifikate noch NICHT umgestellt – das Skript
# sagt dir am Ende, was zu tun ist. So kannst du in Ruhe prüfen.
# ---------------------------------------------------------------------------
set -euo pipefail

ALT="${ALT:-fahrschulo}"          # SSH-Name des Coolify-Servers
NEU="${NEU:-team4ever1}"          # SSH-Name deines Servers
BASIS="${BASIS:-/opt/4ever1-ident}"
NAME="${NAME:-4ever1-ident}"
PORT="${PORT:-8095}"
REPO="${REPO:-https://github.com/kommaufdenpunkt/Spiel.git}"

sage()   { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
gut()    { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
fehler() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

# ---- 1. Die laufende Fassung auf Coolify finden ---------------------------
sage "Alte Fassung suchen auf $ALT"
CID="$(ssh "$ALT" "docker ps -qf name=v10sj | head -1")"
[ -n "$CID" ] || fehler "Auf $ALT läuft kein Coolify-Container mit 'v10sj' im Namen."
gut "Container $CID"

VOL="$(ssh "$ALT" "docker inspect $CID --format '{{range .Mounts}}{{if eq .Destination \"/data\"}}{{.Name}}{{end}}{{end}}'")"
[ -n "$VOL" ] || fehler "Kein Datenträger unter /data gefunden."
gut "Datenträger $VOL"

SCHLUESSEL="$(ssh "$ALT" "docker inspect $CID --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^STORAGE_KEY=//p'")"
PASSWORT="$(ssh  "$ALT" "docker inspect $CID --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^ADMIN_PASSWORD=//p'")"
[ -n "$SCHLUESSEL" ] || fehler "STORAGE_KEY nicht gefunden – ohne ihn wären alle Akten unlesbar."
[ -n "$PASSWORT" ]   || fehler "ADMIN_PASSWORD nicht gefunden."
gut "Schlüssel gelesen (${#SCHLUESSEL} Zeichen)"

# ---- 2. Daten sichern und übertragen --------------------------------------
sage "Daten sichern (die alte Fassung läuft dabei weiter)"
ssh "$ALT" "docker run --rm -v $VOL:/d -v /root:/aus alpine tar czf /aus/ident-daten.tgz -C /d ."
GROESSE="$(ssh "$ALT" "du -h /root/ident-daten.tgz | cut -f1")"
gut "Sicherung angelegt: $GROESSE"

sage "Auf $NEU übertragen"
ssh "$ALT" "cat /root/ident-daten.tgz" | ssh "$NEU" "cat > /root/ident-daten.tgz"
ssh "$NEU" "test -s /root/ident-daten.tgz" || fehler "Übertragung fehlgeschlagen."
gut "angekommen"

# ---- 3. Auf dem Zielserver einrichten -------------------------------------
sage "Ordner und Zugangsdaten anlegen auf $NEU"
ssh "$NEU" "mkdir -p $BASIS/data && tar xzf /root/ident-daten.tgz -C $BASIS/data"
ANZ="$(ssh "$NEU" "ls -1 $BASIS/data | wc -l")"
gut "$ANZ Einträge entpackt"

# TURN läuft auf diesem Server – wenn wir das Geheimnis finden, gleich mitnehmen.
TURNGEHEIM="$(ssh "$NEU" "sed -n 's/^ *static-auth-secret *= *//p' /etc/turnserver.conf 2>/dev/null | head -1" || true)"
if [ -n "$TURNGEHEIM" ]; then gut "TURN-Geheimnis gefunden – Video läuft damit auch im Mobilfunk"
else printf '  ! TURN-Geheimnis nicht gefunden – bitte später von Hand in app.env eintragen\n'; fi

ssh "$NEU" "umask 077 && cat > $BASIS/app.env" <<ENV
STORAGE_KEY=$SCHLUESSEL
ADMIN_PASSWORD=$PASSWORT
DATA_DIR=/data
PORT=8080
RETENTION_DAYS=90
TURN_HOST=turn.4ever1.tv
TURN_SECRET=$TURNGEHEIM
PUBLIC_URL=https://ident.4ever1.tv
ENV
gut "app.env geschrieben (nur für root lesbar)"

# ---- 4. Bauen und starten (ohne DNS – noch niemand kommt dort an) ---------
sage "Quellcode holen und bauen"
ssh "$NEU" "rm -rf $BASIS/src && git clone --depth 1 -b main $REPO $BASIS/src -q"
STAND="$(ssh "$NEU" "git -C $BASIS/src rev-parse --short HEAD")"
gut "Stand $STAND"

ssh "$NEU" "docker build -q -t $NAME:aktuell $BASIS/src/ident" >/dev/null
gut "Abbild gebaut"

sage "Starten auf 127.0.0.1:$PORT"
ssh "$NEU" "docker rm -f $NAME >/dev/null 2>&1 || true
  docker run -d --name $NAME --restart unless-stopped \
    --env-file $BASIS/app.env -v $BASIS/data:/data -p 127.0.0.1:$PORT:8080 \
    $NAME:aktuell >/dev/null"

for i in $(seq 1 30); do
  if ssh "$NEU" "curl -fsS --max-time 3 http://127.0.0.1:$PORT/healthz >/dev/null 2>&1"; then
    gut "antwortet nach ${i}s"; break
  fi
  [ "$i" = 30 ] && { ssh "$NEU" "docker logs $NAME --tail 40"; fehler "Der Dienst antwortet nicht."; }
  sleep 1
done

# ---- 5. Prüfen, ob die Daten lesbar sind ----------------------------------
sage "Sind die Akten lesbar? (das ist der entscheidende Test)"
ssh "$NEU" "docker logs $NAME 2>&1 | grep -E 'Daten:|Admin-Passwort|Mitarbeiter-Konten|Streamer-Ordner|WARNUNG' | sed 's/^/  /'"
TOK="$(ssh "$NEU" "curl -s -X POST -H 'Content-Type: application/json' -d '{\"username\":\"\",\"password\":\"$PASSWORT\"}' http://127.0.0.1:$PORT/api/login | sed -n 's/.*\"token\":\"\([^\"]*\)\".*/\1/p'")"
[ -n "$TOK" ] || fehler "Anmeldung auf dem neuen Server schlägt fehl."
gut "Admin-Anmeldung funktioniert"
ssh "$NEU" "curl -s -H 'Authorization: Bearer $TOK' http://127.0.0.1:$PORT/api/cases | head -c 120; echo" | sed 's/^/  /'
ssh "$NEU" "curl -s -H 'Authorization: Bearer $TOK' http://127.0.0.1:$PORT/api/streamers | head -c 120; echo" | sed 's/^/  /'

cat <<'ENDE'

────────────────────────────────────────────────────────────────────────
  Die neue Fassung läuft – aber noch bekommt sie keinen Besuch.
  Die alte auf Coolify arbeitet unverändert weiter.

  Sieht oben alles gut aus (Konten und Ordner werden gefunden,
  keine WARNUNG), dann weiter mit Schritt 6 aus meiner Nachricht:
  nginx, Zertifikate, DNS.

  Wenn etwas nicht stimmt: einfach nichts tun. Es ist nichts kaputt.
────────────────────────────────────────────────────────────────────────
ENDE
