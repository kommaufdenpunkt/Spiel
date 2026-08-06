#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# pkboard-import.sh – Streamer aus dem PK-Board als Akte nach ident übernehmen.
#
# Wer schon auf mein.4ever1.tv mitläuft, hat bisher keine Akte im
# Streamer-Ordner – die entsteht erst durch eine Audition. Für alle, die längst
# dabei sind, ist das unpraktisch: keine Vermerke, kein Verlauf, nichts.
#
# Dieses Skript holt sie herüber. Ohne Audition, ohne Ausweisbilder – nur der
# Ordner, damit ab heute alles an einem Ort gepflegt werden kann. Kommt später
# doch eine Audition, hängt sie sich an denselben Ordner.
#
# Wird AUF DEM SERVER ausgeführt:
#     bash pkboard-import.sh --probe    # nur zeigen, nichts ändern
#     bash pkboard-import.sh            # wirklich übernehmen
#
# Beliebig oft wiederholbar: Vorhandene Ordner werden NICHT überschrieben,
# nur Lücken (fehlender Name, fehlendes Alter) werden gefüllt.
# ---------------------------------------------------------------------------
set -euo pipefail

PKDB="${PKDB:-team4ever1}"                  # Datenbank des PK-Boards
IDENT_URL="${IDENT_URL:-http://127.0.0.1:8095}"
ENVDATEI="${ENVDATEI:-/opt/4ever1-ident/app.env}"

sage()   { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
gut()    { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn()   { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
fehler() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

PROBE=""
[ "${1:-}" = "--probe" ] && PROBE="ja"

# ---- 1. Mitglieder aus dem PK-Board lesen ---------------------------------
# Nur wer freigegeben, nicht deaktiviert und nicht zum Löschen vorgemerkt ist –
# und nur mit BIGO-ID, denn darüber läuft die Zuordnung.
sage "Mitglieder im PK-Board suchen"

SQL="select coalesce(bigo_id,''), coalesce(display_name, username), coalesce(family,''), coalesce(status,'')
     from users
     where coalesce(bigo_id,'') <> ''
       and status = 'approved'
       and deactivated_at is null
       and delete_at is null
     order by created_at"

ROH="$(sudo -u postgres psql -d "$PKDB" -At -F $'\t' -c "$SQL" 2>/dev/null || true)"
[ -n "$ROH" ] || fehler "Keine Mitglieder mit BIGO-ID gefunden (Datenbank $PKDB erreichbar?)."

ANZAHL=$(printf '%s\n' "$ROH" | grep -c . || true)
gut "$ANZAHL Mitglieder mit BIGO-ID"

# ---- 2. Daraus ein Paket bauen --------------------------------------------
# Familie im PK-Board -> Art "familie" im Ordner. Das ist genau die
# Unterscheidung, die im Streamer-Ordner ohnehin schon gefiltert wird.
NUTZLAST="$(printf '%s\n' "$ROH" | awk -F'\t' '
  BEGIN { printf "{\"leute\":[" ; erste = 1 }
  function j(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); gsub(/\t/, " ", s); return s }
  NF >= 2 {
    art = ($3 != "") ? "familie" : "streamer"
    if (!erste) printf ","
    printf "{\"bigoId\":\"%s\",\"name\":\"%s\",\"art\":\"%s\",\"status\":\"aktiv\",\"herkunft\":\"pkboard\"}", j($1), j($2), art
    erste = 0
  }
  END { print "]}" }
')"

if [ -n "$PROBE" ]; then
  sage "Probelauf – es wird nichts geändert"
  printf '%s\n' "$ROH" | awk -F'\t' '{printf "  %-14s %-28s %s\n", $1, $2, ($3 != "" ? "Familie: " $3 : "")}' | head -40
  [ "$ANZAHL" -gt 40 ] && echo "  … und $((ANZAHL - 40)) weitere"
  echo
  echo "  Zum wirklichen Übernehmen: bash $0"
  exit 0
fi

# ---- 3. Bei ident anmelden -------------------------------------------------
[ -f "$ENVDATEI" ] || fehler "Zugangsdaten nicht gefunden: $ENVDATEI"
PASSWORT="$(sed -n 's/^ADMIN_PASSWORD=//p' "$ENVDATEI" | head -1)"
[ -n "$PASSWORT" ] || fehler "ADMIN_PASSWORD steht nicht in $ENVDATEI"

sage "Bei ident anmelden"
TOKEN="$(curl -s -X POST -H 'Content-Type: application/json' \
  --data-binary "$(printf '{"username":"","password":"%s"}' "$PASSWORT")" \
  "$IDENT_URL/api/login" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
[ -n "$TOKEN" ] || fehler "Anmeldung bei ident fehlgeschlagen."
gut "angemeldet"

# ---- 4. Übernehmen ---------------------------------------------------------
sage "Ordner anlegen"
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
printf '%s' "$NUTZLAST" > "$TMP"

ANTWORT="$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' --data-binary "@$TMP" \
  "$IDENT_URL/api/streamer-import")"

NEU=$(printf '%s' "$ANTWORT"       | sed -n 's/.*"neu":\([0-9]*\).*/\1/p')
VORHANDEN=$(printf '%s' "$ANTWORT" | sed -n 's/.*"vorhanden":\([0-9]*\).*/\1/p')
ERGAENZT=$(printf '%s' "$ANTWORT"  | sed -n 's/.*"ergaenzt":\([0-9]*\).*/\1/p')

[ -n "$NEU" ] || fehler "Unerwartete Antwort von ident: $ANTWORT"

gut "$NEU neue Akten angelegt"
gut "$VORHANDEN waren schon da${ERGAENZT:+ (davon $ERGAENZT ergänzt)}"

cat <<ENDE

────────────────────────────────────────────────────────────────────────
  Fertig. Die übernommenen Streamer stehen jetzt im Streamer-Ordner auf
  mcp.4ever1.tv – erkennbar an „aus dem PK-Board, noch keine Audition".

  Ab sofort lassen sich dort Vermerke pflegen, Status setzen und Familien
  filtern. Macht später jemand doch eine Audition, hängt sie sich an
  denselben Ordner – über die BIGO-ID.

  Das Skript darf jederzeit erneut laufen (z. B. wenn neue Mitglieder
  dazukommen). Vorhandenes wird nie überschrieben.
────────────────────────────────────────────────────────────────────────
ENDE
