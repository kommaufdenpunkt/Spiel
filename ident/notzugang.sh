#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# notzugang.sh – wieder in acp./mcp. hineinkommen, wenn nichts mehr geht.
#
# Der Gedanke: Wer auf diesem Server root ist, ist der Eigentümer der Daten.
# Der braucht keinen fremden Dienst, um sich selbst aufzuschliessen. Kein
# Facebook, kein Google – die könnten selbst gehackt oder gesperrt werden, und
# dann hinge die Akte an einem Konto, das einem gar nicht gehört.
#
# Aufrufen (auf dem Server):
#     /opt/4ever1-ident/src/ident/notzugang.sh              # nachsehen
#     /opt/4ever1-ident/src/ident/notzugang.sh --sperre-weg  # Sperren lösen
#     /opt/4ever1-ident/src/ident/notzugang.sh --geraete-auf # Gerätebindung aus
#     /opt/4ever1-ident/src/ident/notzugang.sh --zweifach-aus # Admin-2FA aus
#     /opt/4ever1-ident/src/ident/notzugang.sh --alles-auf   # alle drei
#
# Nichts davon löscht Daten. Es öffnet nur die Tür.
# ---------------------------------------------------------------------------
set -uo pipefail

BASIS="${BASIS:-/opt/4ever1-ident}"
DATEN="${DATEN:-$BASIS/data}"
UMGEBUNG="${UMGEBUNG:-$BASIS/app.env}"
NAME="${NAME:-4ever1-ident}"

sage()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
gut()   { printf '  \033[1;32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[1;33m!\033[0m %s\n' "$*"; }
fehler(){ printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

case "${1:-}" in
  -h|--hilfe|--help)
    sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
esac

command -v docker >/dev/null || fehler "docker ist nicht installiert"
[ -d "$DATEN" ] || fehler "Datenordner fehlt: $DATEN"

WAS="${1:-}"
SPERRE=0; GERAETE=0; ZWEIFACH=0
case "$WAS" in
  --sperre-weg)   SPERRE=1 ;;
  --geraete-auf)  GERAETE=1 ;;
  --zweifach-aus) ZWEIFACH=1 ;;
  --alles-auf)    SPERRE=1; GERAETE=1; ZWEIFACH=1 ;;
  "")             ;;
  *) fehler "Unbekannt: $WAS   (--hilfe zeigt die Möglichkeiten)" ;;
esac

# ---- 1. Lage feststellen --------------------------------------------------
sage "Wie steht es gerade?"

if docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
  gut "Der Dienst läuft (Container $NAME)."
else
  warn "Der Container $NAME läuft NICHT. Dann kommt niemand herein – erst"
  warn "aufspielen: $BASIS/src/ident/deploy.sh main"
fi

# Die Einstellungen liegen verschlüsselt. Der Server selbst kann sie lesen, wir
# fragen ihn also mit seinem eigenen Code danach – nicht an der Datei vorbei.
lies_einstellungen() {
  docker run --rm --env-file "$UMGEBUNG" -e DATA_DIR=/data -v "$DATEN:/data" \
    --entrypoint node "$NAME:aktuell" -e '
      const store = require("/app/store.js");
      store.init({ dir: process.env.DATA_DIR });
      const aus = {
        geraetesperreAdmin: store.getDeviceLock("admin"),
        geraetesperrePruefer: store.getDeviceLock("agent"),
        zweifachAn: !!store.getAdminTotp(),
        geraeteAdmin: store.listAdminDevices().map((d) => d.name),
      };
      console.log(JSON.stringify(aus));
    ' 2>/dev/null | tail -1
}
LAGE="$(lies_einstellungen || true)"

hole() { printf '%s' "$LAGE" | sed -n "s/.*\"$1\":\([^,}]*\).*/\1/p"; }
if [ -n "$LAGE" ]; then
  GS_ADMIN="$(hole geraetesperreAdmin)"; ZW="$(hole zweifachAn)"
  [ "$GS_ADMIN" = "true" ] && warn "Gerätebindung Admin: AN – nur freigegebene Geräte kommen herein." \
                           || gut  "Gerätebindung Admin: aus."
  [ "$ZW" = "true" ] && warn "Admin-2FA: AN – ohne 6-stelligen Code geht nichts." \
                     || gut  "Admin-2FA: aus."
  echo "  Freigegebene Admin-Geräte: $(printf '%s' "$LAGE" | sed -n 's/.*"geraeteAdmin":\[\([^]]*\)\].*/\1/p')"
else
  warn "Die Einstellungen liessen sich nicht lesen (Abbild $NAME:aktuell da?)."
fi

# Sperren wegen Fehlversuchen stehen nur im Arbeitsspeicher. Ein Neustart des
# Containers räumt sie deshalb restlos weg – Daten bleiben unberührt, die
# liegen aussen.
echo
echo "  Letzte Anmeldeversuche (aus dem Protokoll des Dienstes):"
docker logs "$NAME" --tail 400 2>&1 | grep -Ei 'login|admin|blocked|gesperrt|device' | tail -12 | sed 's/^/    /' || true

# ---- 2. Aufschliessen -----------------------------------------------------
if [ "$SPERRE$GERAETE$ZWEIFACH" = "000" ]; then
  cat <<'ENDE'

Nichts geändert – das war nur der Blick von aussen.

Was hilft bei was:
  Es kommt "zu viele Versuche" / es reagiert gar nicht mehr
      --sperre-weg      Der Dienst wird neu gestartet. Fehlversuch-Sperren und
                        IP-Sperren stehen nur im Arbeitsspeicher und sind
                        danach weg. Akten, Ordner, Konten bleiben unberührt.

  Es kommt "Gerät nicht freigegeben" (neues Handy, Browserdaten gelöscht)
      --geraete-auf     Die Gerätebindung wird abgeschaltet. Man kommt von
                        jedem Gerät herein. Danach wieder einschalten – das
                        gerade benutzte Gerät ist dann automatisch dabei.

  Der 2FA-Code stimmt nicht mehr (Handy weg, App neu eingerichtet)
      --zweifach-aus    Admin-2FA wird abgeschaltet. Danach im Sicherheits-
                        Bereich neu einrichten und den QR-Code neu scannen.

  Keine Ahnung, was los ist
      --alles-auf       Alle drei auf einmal. Anschliessend bitte wieder
                        scharf stellen.
ENDE
  exit 0
fi

if [ "$GERAETE$ZWEIFACH" != "00" ]; then
  sage "Einstellungen ändern"
  docker run --rm --env-file "$UMGEBUNG" -e DATA_DIR=/data \
    -e NZ_GERAETE="$GERAETE" -e NZ_ZWEIFACH="$ZWEIFACH" -v "$DATEN:/data" \
    --entrypoint node "$NAME:aktuell" -e '
      const store = require("/app/store.js");
      store.init({ dir: process.env.DATA_DIR });
      if (process.env.NZ_GERAETE === "1") {
        store.setDeviceLock("admin", false);
        store.setDeviceLock("agent", false);
        console.log("Gerätebindung abgeschaltet (Admin und Prüfer).");
      }
      if (process.env.NZ_ZWEIFACH === "1") {
        store.setAdminTotp("");
        console.log("Admin-2FA abgeschaltet.");
      }
    ' 2>/dev/null | sed 's/^/  ✓ /' \
    || fehler "Ändern fehlgeschlagen. Läuft der Dienst? Ist $NAME:aktuell gebaut?"
  # Der laufende Dienst hält die Einstellungen im Speicher – er muss sie neu lesen.
  SPERRE=1
fi

if [ "$SPERRE" = "1" ]; then
  sage "Dienst neu starten (löst Fehlversuch- und IP-Sperren)"
  docker restart "$NAME" >/dev/null 2>&1 || fehler "Neustart fehlgeschlagen"
  for i in $(seq 1 30); do
    if curl -fsS --max-time 3 "http://127.0.0.1:${PORT:-8095}/healthz" >/dev/null 2>&1; then
      gut "antwortet wieder nach ${i}s"; break
    fi
    sleep 1
  done
fi

sage "Fertig"
cat <<'ENDE'
  Jetzt auf acp.<domain> anmelden. Wenn es wieder klemmt, sagt die Meldung im
  Browser, woran es liegt – und die Zeilen oben im Protokoll auch.

  Bitte danach wieder scharf stellen: Gerätebindung und 2FA sind der Grund,
  warum an die Akte niemand herankommt. Offen lassen ist keine Lösung.
ENDE
