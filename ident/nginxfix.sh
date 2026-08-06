#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# nginxfix.sh – nginx so einrichten, dass WebSockets durchkommen.
#
# Der Handschlag scheitert an nginx: der Dienst antwortet direkt mit 101, durch
# nginx hindurch nicht. Ohne WebSocket gibt es keine Signalisierung, und ohne
# Signalisierung kein Video – egal wie gut alles andere ist.
#
# Zwei Ursachen sind fast immer schuld:
#   a) „proxy_set_header Connection $connection_upgrade" – aber die dazu
#      gehörende map fehlt. Dann ist die Variable LEER, nginx upgradet nicht
#      und antwortet 200 statt 101.
#   b) Die Upgrade-Zeilen stehen irgendwo in der Datei, aber nicht in dem
#      location-Block, der / bedient.
#
# Aufrufen:
#     /opt/4ever1-ident/src/ident/nginxfix.sh            # nur ansehen
#     /opt/4ever1-ident/src/ident/nginxfix.sh --machen   # fehlende map anlegen
#
# Ohne --machen wird NICHTS verändert. Mit --machen wird nur die fehlende map
# ergänzt (eine neue Datei, nichts überschrieben), vorher eine Sicherung
# angelegt, und nur bei erfolgreichem „nginx -t" neu geladen.
# ---------------------------------------------------------------------------
set -uo pipefail

PORT="${PORT:-8095}"
MACHEN=0
[ "${1:-}" = "--machen" ] && MACHEN=1

gut()  { printf '  \033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[1;33m!\033[0m %s\n' "$*"; }
bad()  { printf '  \033[1;31m✖\033[0m %s\n' "$*"; }
sage() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }

# ---- 1. Was steht da? ------------------------------------------------------
sage "1. Die nginx-Dateien, die etwas weiterleiten"
DATEIEN="$(grep -rl 'proxy_pass' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null)"
if [ -z "$DATEIEN" ]; then bad "Keine Datei mit proxy_pass gefunden."; exit 1; fi
for f in $DATEIEN; do
  echo "  ── $f"
  grep -nE 'server_name|location|proxy_pass|proxy_http_version|proxy_set_header|proxy_read_timeout' "$f" \
    2>/dev/null | sed 's/^/     /'
done

# ---- 2. Fehlt die map? -----------------------------------------------------
sage "2. Wird \$connection_upgrade benutzt – und ist es definiert?"
BENUTZT=0; DEFINIERT=0
grep -rqi 'Connection[[:space:]]*\$connection_upgrade' $DATEIEN 2>/dev/null && BENUTZT=1
grep -rqiE 'map[[:space:]]+\$http_upgrade[[:space:]]+\$connection_upgrade' \
  /etc/nginx/nginx.conf /etc/nginx/conf.d/ /etc/nginx/sites-enabled/ 2>/dev/null && DEFINIERT=1

if [ "$BENUTZT" = "1" ] && [ "$DEFINIERT" = "0" ]; then
  bad "\$connection_upgrade wird benutzt, ist aber NIRGENDS definiert."
  bad "Damit geht eine leere Connection-Kopfzeile hinaus – nginx upgradet nicht."
  FEHLT_MAP=1
elif [ "$BENUTZT" = "1" ]; then
  gut "\$connection_upgrade wird benutzt und ist per map definiert."
  FEHLT_MAP=0
else
  gut "\$connection_upgrade wird nicht benutzt (dann steht \"upgrade\" wohl fest drin)."
  FEHLT_MAP=0
fi

# ---- 3. Stehen die Zeilen im Block für / ? --------------------------------
sage "3. Stehen die Upgrade-Zeilen im Block für /?"
for f in $DATEIEN; do
  IM=$(awk '/location[[:space:]]*\/[[:space:]]*\{/{d=1} d&&/proxy_set_header[[:space:]]+Upgrade/{print;exit}' "$f" 2>/dev/null | wc -l)
  if [ "${IM:-0}" -gt 0 ]; then gut "$(basename "$f"): ja"
  else bad "$(basename "$f"): NEIN – dort werden sie gebraucht"; fi
done

# ---- 4. Reparieren ---------------------------------------------------------
if [ "${FEHLT_MAP:-0}" = "1" ]; then
  sage "4. Die fehlende map"
  ZIEL=/etc/nginx/conf.d/ws-upgrade.conf
  if [ "$MACHEN" = "0" ]; then
    echo "  Mit --machen wird diese Datei angelegt:"
    echo "    $ZIEL"
    echo "      map \$http_upgrade \$connection_upgrade {"
    echo "          default upgrade;"
    echo "          ''      close;"
    echo "      }"
    echo
    echo "  Nichts wurde verändert. Zum Ausführen:"
    echo "    $0 --machen"
    exit 1
  fi
  if [ -f "$ZIEL" ]; then
    cp -a "$ZIEL" "$ZIEL.vorher.$(date +%s)"
    gut "Sicherung der vorhandenen Datei angelegt."
  fi
  cat > "$ZIEL" <<'ENDE'
# Von nginxfix.sh angelegt.
#
# Ohne diese map ist $connection_upgrade leer. Dann geht eine leere
# Connection-Kopfzeile an den Dienst, nginx laesst den Upgrade nicht zu und
# antwortet 200 statt 101 - der Videoteil kommt dann nie zustande.
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
ENDE
  gut "Angelegt: $ZIEL"
  if nginx -t 2>&1 | sed 's/^/    /'; then
    systemctl reload nginx && gut "nginx neu geladen." || bad "Neuladen fehlgeschlagen."
  else
    bad "nginx -t schlaegt fehl – NICHT neu geladen. Datei wieder entfernen:"
    bad "  rm $ZIEL && nginx -t"
    exit 1
  fi
fi

# ---- 5. Und jetzt nachmessen ----------------------------------------------
sage "5. Handschlag noch einmal – direkt und durch nginx"
A1="$(curl -s -i --max-time 5 -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  "http://127.0.0.1:$PORT/" 2>/dev/null | head -1 | tr -d '\r')"
echo "  direkt : >>$A1<<"
for D in $(grep -rhoP 'server_name\s+\K[^;]+' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null \
           | tr ' ' '\n' | grep -E '^(mcp|ident)\.' | sort -u); do
  A2="$(curl -s -i --max-time 6 -k --resolve "$D:443:127.0.0.1" \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
    "https://$D/" 2>/dev/null | head -1 | tr -d '\r')"
  printf '  %-22s >>%s<<\n' "$D" "$A2"
  case "$A2" in
    *101*) gut "$D: WebSocket kommt durch." ;;
    *)     bad "$D: kommt NICHT durch (erwartet 101)." ;;
  esac
done
