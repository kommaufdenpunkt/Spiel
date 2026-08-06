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
KONFIG="$(grep -rl "mcp\.\|ident\." /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | head -5)"
if [ -z "$KONFIG" ]; then
  warn "Keine passende nginx-Datei gefunden – läuft hier überhaupt nginx?"
else
  for f in $KONFIG; do
    echo "  Datei: $f"
    HAT_UP=$(grep -ci 'proxy_set_header[[:space:]]\+Upgrade' "$f" 2>/dev/null || echo 0)
    HAT_CONN=$(grep -ci 'proxy_set_header[[:space:]]\+Connection' "$f" 2>/dev/null || echo 0)
    HAT_11=$(grep -ci 'proxy_http_version[[:space:]]\+1\.1' "$f" 2>/dev/null || echo 0)
    HAT_TO=$(grep -ci 'proxy_read_timeout' "$f" 2>/dev/null || echo 0)
    [ "$HAT_11" -gt 0 ]   && gut "proxy_http_version 1.1 vorhanden" || { bad "proxy_http_version 1.1 FEHLT"; merke; }
    [ "$HAT_UP" -gt 0 ]   && gut "Upgrade-Kopfzeile vorhanden"      || { bad "proxy_set_header Upgrade FEHLT"; merke; }
    [ "$HAT_CONN" -gt 0 ] && gut "Connection-Kopfzeile vorhanden"   || { bad "proxy_set_header Connection FEHLT"; merke; }
    [ "$HAT_TO" -gt 0 ]   && gut "proxy_read_timeout gesetzt"       || warn "proxy_read_timeout nicht gesetzt (Vorgabe 60s – mit Lebenszeichen okay)"
  done
fi

# ---- 3. WebSocket direkt beim Dienst ------------------------------------
sage "3. WebSocket direkt beim Dienst (ohne nginx)"
ANTWORT="$(curl -s -i --max-time 5 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  "http://127.0.0.1:$PORT/" 2>/dev/null | head -1)"
case "$ANTWORT" in
  *101*) gut "Der Dienst spricht WebSocket (101). Hier ist alles in Ordnung." ;;
  '')    bad "Keine Antwort vom Dienst."; merke ;;
  *)     bad "Der Dienst antwortet mit: $ANTWORT (erwartet 101)"; merke ;;
esac

# ---- 4. WebSocket durch nginx ------------------------------------------
sage "4. WebSocket durch nginx hindurch"
DOMAIN="$(grep -rhoP 'server_name\s+\K(mcp|ident)\.[^; ]+' /etc/nginx/sites-enabled/ 2>/dev/null | head -1)"
if [ -z "$DOMAIN" ]; then
  warn "Konnte den Namen (mcp....) nicht aus nginx lesen – Schritt übersprungen."
else
  echo "  Über: https://$DOMAIN/"
  A2="$(curl -s -i --max-time 6 -k --resolve "$DOMAIN:443:127.0.0.1" \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
    "https://$DOMAIN/" 2>/dev/null | head -1)"
  case "$A2" in
    *101*) gut "nginx lässt WebSockets durch (101). Die Verbindung ist NICHT das Problem." ;;
    '')    bad "Keine Antwort über nginx."; merke ;;
    *)     bad "nginx antwortet mit: $A2 (erwartet 101) – DAS ist die Ursache."; merke ;;
  esac
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
  Fehlen die WebSocket-Kopfzeilen in nginx, gehören diese Zeilen in den
  location-Block der Seite (mcp. UND ident.):

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
