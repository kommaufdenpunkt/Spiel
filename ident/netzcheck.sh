#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# netzcheck.sh – warum kommt keine Videoverbindung zustande?
#
# Auf dem Server ausführen:
#     /opt/4ever1-ident/src/ident/netzcheck.sh
#
# Prüft der Reihe nach:
#   1. Läuft der Dienst, und welche Fassung?
#   2. Lässt nginx WebSockets durch?      <- das ist fast immer die Ursache
#   3. Kommt eine WebSocket direkt beim Dienst an?
#   4. Und auch durch nginx hindurch?
#   5. Ist ein TURN-Server eingetragen?   <- nötig, wenn beide im Mobilfunk sind
#   6. Kann der Server MP4 erzeugen?      <- sonst kann man die Aufnahme nicht
#                                            hochladen und nicht weitergeben
#
# Es wird NICHTS geändert. Am Ende steht, was zu tun ist.
# ---------------------------------------------------------------------------
set -uo pipefail

BASIS="${BASIS:-/opt/4ever1-ident}"
NAME="${NAME:-4ever1-ident}"
PORT="${PORT:-8095}"
UMGEBUNG="${UMGEBUNG:-$BASIS/app.env}"

gut()  { printf '  \033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[1;33m!\033[0m %s\n' "$*"; }
bad()  { printf '  \033[1;31m✖\033[0m %s\n' "$*"; }
sage() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }

PROBLEME=0
merke() { PROBLEME=$((PROBLEME + 1)); }

# ---- 1. Der Dienst --------------------------------------------------------
sage "1. Läuft der Dienst?"
if docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
  gut "Container $NAME läuft."
else
  bad "Container $NAME läuft NICHT."; merke
fi
HZ="$(curl -fsS --max-time 4 "http://127.0.0.1:$PORT/healthz" 2>/dev/null | head -1)"
if [ -n "$HZ" ]; then gut "Antwortet: $HZ"; else bad "Antwortet nicht auf Port $PORT."; merke; fi

# ---- 2. nginx und WebSockets ---------------------------------------------
sage "2. Lässt nginx WebSockets durch?"
KONFIG="$(grep -rl "server_name" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | head -10)"
if [ -z "$KONFIG" ]; then
  warn "Keine nginx-Datei gefunden – läuft hier überhaupt nginx?"
else
  echo "  Eingerichtete Namen:"
  grep -rhoP 'server_name\s+\K[^;]+' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null \
    | tr ' ' '\n' | grep -v '^$' | sort -u | sed 's/^/    /'
  for f in $KONFIG; do
    grep -q 'proxy_pass' "$f" 2>/dev/null || continue
    echo "  Datei: $f"
    zaehl() { grep -ci "$1" "$f" 2>/dev/null | head -1; }
    HAT_UP=$(zaehl 'proxy_set_header[[:space:]]\+Upgrade');   HAT_UP=${HAT_UP:-0}
    HAT_CONN=$(zaehl 'proxy_set_header[[:space:]]\+Connection'); HAT_CONN=${HAT_CONN:-0}
    HAT_11=$(zaehl 'proxy_http_version[[:space:]]\+1\.1');    HAT_11=${HAT_11:-0}
    [ "$HAT_11" -gt 0 ]   && gut "proxy_http_version 1.1 steht in der Datei" || { bad "proxy_http_version 1.1 FEHLT"; merke; }
    [ "$HAT_UP" -gt 0 ]   && gut "Upgrade-Kopfzeile steht in der Datei"      || { bad "proxy_set_header Upgrade FEHLT"; merke; }
    [ "$HAT_CONN" -gt 0 ] && gut "Connection-Kopfzeile steht in der Datei"   || { bad "proxy_set_header Connection FEHLT"; merke; }
    # Die haeufigste Falle: Connection $connection_upgrade, aber die dazu
    # gehoerende map fehlt. Dann ist die Variable leer, nginx laesst nicht
    # upgraden und antwortet 200 statt 101 - genau unser Fall.
    if grep -qi 'Connection[[:space:]]\+\$connection_upgrade' "$f" 2>/dev/null; then
      if grep -rqi 'map[[:space:]]\+\$http_upgrade[[:space:]]\+\$connection_upgrade' \
           /etc/nginx/nginx.conf /etc/nginx/conf.d/ /etc/nginx/sites-enabled/ 2>/dev/null; then
        gut "\$connection_upgrade ist per map definiert"
      else
        bad "\$connection_upgrade wird benutzt, aber die map FEHLT -> leere Kopfzeile -> 200 statt 101"; merke
      fi
    fi
    # Und: stehen die Zeilen im Block, der / bedient?
    if command -v awk >/dev/null; then
      IM_ROOT=$(awk '/location[[:space:]]*\/[[:space:]]*\{/,/^[[:space:]]*}/' "$f" 2>/dev/null | grep -ci 'proxy_set_header[[:space:]]\+Upgrade' | head -1)
      IM_ROOT=${IM_ROOT:-0}
      [ "$IM_ROOT" -gt 0 ] && gut "Die Upgrade-Zeilen stehen im Block für /" \
        || { bad "Im Block für / stehen sie NICHT – dort werden sie aber gebraucht"; merke; }
    fi
    echo "  --- die proxy-Zeilen dieser Datei ---"
    grep -nE 'location|proxy_pass|proxy_http_version|proxy_set_header|proxy_read_timeout' "$f" 2>/dev/null | sed 's/^/    /'
  done
fi

# ---- 3. WebSocket direkt beim Dienst ------------------------------------
sage "3. WebSocket direkt beim Dienst (ohne nginx)"
ANTWORT="$(curl -s -i --max-time 5 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  "http://127.0.0.1:$PORT/" 2>/dev/null | head -1 | tr -d '\r')"
case "$ANTWORT" in
  *101*) gut "Der Dienst spricht WebSocket (101). Hier ist alles in Ordnung." ;;
  '')    bad "Keine Antwort vom Dienst."; merke ;;
  *)     bad "Der Dienst antwortet mit: $ANTWORT (erwartet 101)"; merke ;;
esac

# ---- 4. WebSocket durch nginx ------------------------------------------
sage "4. WebSocket durch nginx hindurch"
DOMAIN="$(grep -rhoP 'server_name\s+\K(mcp|ident)\.[^; ]+' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | head -1)"
if [ -z "$DOMAIN" ]; then
  warn "Konnte den Namen (mcp....) nicht aus nginx lesen – Schritt übersprungen."
else
  echo "  Über: https://$DOMAIN/"
  DURCH=0
  for PF in /api/ws /; do
    A2="$(curl -s -i --max-time 6 -k --resolve "$DOMAIN:443:127.0.0.1" \
      -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
      -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
      "https://$DOMAIN$PF" 2>/dev/null | head -1 | tr -d '\r')"
    printf '  %-10s >>%s<<\n' "$PF" "$A2"
    case "$A2" in *101*) DURCH=1 ;; esac
  done
  if [ "$DURCH" = "1" ]; then
    gut "Mindestens ein Weg kommt durch – die App nimmt ihn von selbst."
  else
    bad "KEIN Weg kommt durch. Ohne WebSocket gibt es kein Video."; merke
  fi
fi

# ---- 5. TURN -------------------------------------------------------------
sage "5. TURN-Server (nötig, wenn beide im Mobilfunk sind)"
if [ -f "$UMGEBUNG" ]; then
  TH="$(grep -E '^TURN_HOST=' "$UMGEBUNG" | cut -d= -f2-)"
  TS="$(grep -cE '^TURN_SECRET=.+' "$UMGEBUNG" 2>/dev/null || echo 0)"
  if [ -n "$TH" ] && [ "$TS" -gt 0 ]; then
    gut "TURN_HOST=$TH und ein TURN_SECRET sind eingetragen."
    if command -v ss >/dev/null && ss -lun 2>/dev/null | grep -q ':3478'; then
      gut "Auf 3478/udp lauscht etwas (coturn)."
    else
      warn "Auf 3478/udp lauscht nichts – läuft coturn?"
    fi
  else
    bad "Kein TURN eingetragen. Ohne TURN kommt oft KEIN Bild zustande, sobald"
    bad "einer im Mobilfunk oder hinter einem strengen Router sitzt."; merke
  fi
else
  warn "$UMGEBUNG nicht lesbar."
fi

# ---- 6. MP4 --------------------------------------------------------------
# Ohne H.264 im Container bleibt die Aufnahme WEBM - die kann man nicht
# hochladen und das iPhone spielt sie nicht. Das soll man sehen, bevor man
# vor der Datei sitzt.
sage "6. Kann der Server die Aufnahme in MP4 umwandeln?"
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$NAME"; then
  if docker exec "$NAME" sh -lc 'command -v ffmpeg >/dev/null' 2>/dev/null; then
    if docker exec "$NAME" sh -lc 'ffmpeg -hide_banner -encoders 2>&1 | grep -qE " (libx264|libopenh264) "' 2>/dev/null; then
      KODIERER="$(docker exec "$NAME" sh -lc 'ffmpeg -hide_banner -encoders 2>&1 | grep -oE " (libx264|libopenh264) " | head -1 | tr -d " "' 2>/dev/null)"
      gut "ffmpeg mit H.264 ist da ($KODIERER) – Aufnahmen kommen als MP4 heraus."
    else
      bad "ffmpeg ist da, kann aber kein H.264. MP4 wäre auf dem Handy nicht"
      bad "abspielbar, deshalb bleibt es bei WEBM. Im Abbild fehlt x264."; merke
    fi
  else
    bad "Im Container ist kein ffmpeg. Aufnahmen bleiben WEBM – die kann man"
    bad "weder hochladen noch auf dem iPhone ansehen."
    echo "  Zu tun: einmal neu bauen, das Abbild bringt ffmpeg mit:"
    echo "    $BASIS/src/ident/deploy.sh"; merke
  fi
else
  warn "Container $NAME läuft nicht – nicht prüfbar."
fi

# ---- Ergebnis ------------------------------------------------------------
if [ "$PROBLEME" -eq 0 ]; then
  sage "Ergebnis: keine Auffälligkeiten"
  echo "  Wenn es trotzdem klemmt, liegt es an den Geräten oder am Netz der"
  echo "  Bewerberin – dann bitte den Logauszug schicken:"
  echo "    docker logs $NAME --tail 60"
  exit 0
fi

sage "Ergebnis: $PROBLEME Punkt(e) gefunden"
cat <<'ENDE'
  HINWEIS: Wenn oben bei /api/ws eine 101 steht, ist alles gut – die App nimmt
  diesen Weg von selbst. Die Meldung "im Block für / stehen sie nicht" ist dann
  kein Problem, nur eine Feststellung.

  Kommt KEIN Weg durch, gehören diese Zeilen in den location-Block für /:

      location / {
          proxy_pass http://127.0.0.1:8095;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection "upgrade";
          proxy_set_header Host $host;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
          proxy_read_timeout 600s;
          proxy_send_timeout 600s;
      }

  Danach:  nginx -t && systemctl reload nginx
  Und dann diesen Test noch einmal laufen lassen.
ENDE
exit 1
