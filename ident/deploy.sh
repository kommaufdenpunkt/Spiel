#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# deploy.sh – neue Fassung von ident auf den 4ever1-Server bringen.
#
# Wird AUF DEM SERVER ausgeführt. Vom Mac aus – der ganze Befehl, so wie er
# ist, der Zweig steht einfach dahinter:
#
#     ssh team4ever1 '/opt/4ever1-ident/src/ident/deploy.sh main'
#     ssh team4ever1 '/opt/4ever1-ident/src/ident/deploy.sh claude/mein-zweig'
#
# Ohne Angabe wird "main" aufgespielt. Wenn das Repo noch nicht auf dem Server
# liegt, geht es auch vom Mac aus durch die Leitung:
#
#     ssh team4ever1 'bash -s' < ident/deploy.sh
#
# Was passiert:
#   1. Quellcode holen (beim ersten Mal klonen, danach nur aktualisieren)
#   2. Abbild bauen
#   3. Alten Container stoppen, neuen starten
#   4. Prüfen, ob er antwortet – wenn nicht, zurück auf die vorige Fassung
#
# Daten und Zugangsdaten bleiben unberührt: beide liegen ausserhalb des
# Containers und werden nur hineingereicht.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO="${REPO:-https://github.com/kommaufdenpunkt/Spiel.git}"
# Der Zweig darf einfach hinten dranstehen – das ist die Schreibweise, die man
# sich merkt. ZWEIG=... geht weiterhin, damit alte Notizen nicht falsch werden.
ZWEIG="${1:-${ZWEIG:-main}}"
case "$ZWEIG" in
  -h|--hilfe|--help)
    echo "So wird aufgespielt:"
    echo "  $0 [zweig]        z. B. $0 main   oder   $0 claude/mein-zweig"
    echo "Ohne Angabe: main."
    exit 0 ;;
esac
BASIS="${BASIS:-/opt/4ever1-ident}"
QUELLE="$BASIS/src"
DATEN="$BASIS/data"
UMGEBUNG="$BASIS/app.env"
NAME="${NAME:-4ever1-ident}"
PORT="${PORT:-8095}"          # nur auf 127.0.0.1, davor steht nginx
GESUNDHEIT="http://127.0.0.1:$PORT/healthz"

sage() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
fehler() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[ -f "$UMGEBUNG" ] || fehler "Zugangsdaten fehlen: $UMGEBUNG"
[ -d "$DATEN" ] || fehler "Datenordner fehlt: $DATEN"
command -v docker >/dev/null || fehler "docker ist nicht installiert"

# ---- 1. Quellcode ---------------------------------------------------------
sage "Quellcode holen ($ZWEIG)"
if [ -d "$QUELLE/.git" ]; then
  # Ausdrücklicher Refspec: Der Ordner wurde flach und nur für einen Zweig
  # geklont. Ohne diese Angabe kennt er "origin/<anderer Zweig>" nicht und
  # das Aufspielen bricht ab.
  git -C "$QUELLE" fetch --depth 1 origin "+refs/heads/$ZWEIG:refs/remotes/origin/$ZWEIG"
  git -C "$QUELLE" reset --hard "refs/remotes/origin/$ZWEIG"
  git -C "$QUELLE" clean -fdq
else
  rm -rf "$QUELLE"
  git clone --depth 1 --branch "$ZWEIG" "$REPO" "$QUELLE"
fi
SHA="$(git -C "$QUELLE" rev-parse --short HEAD)"
echo "  Stand: $SHA – $(git -C "$QUELLE" log -1 --pretty=%s)"

# ---- 2. Abbild bauen ------------------------------------------------------
sage "Abbild bauen"
ALT="$(docker inspect --format '{{.Image}}' "$NAME" 2>/dev/null || true)"
docker build -t "$NAME:$SHA" -t "$NAME:aktuell" "$QUELLE/ident"

# ---- 3. Umschalten --------------------------------------------------------
sage "Container austauschen"
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d \
  --name "$NAME" \
  --restart unless-stopped \
  --env-file "$UMGEBUNG" \
  -e DATA_DIR=/data \
  -e PORT=8080 \
  -e IDENT_VERSION="$SHA" \
  -v "$DATEN:/data" \
  -p "127.0.0.1:$PORT:8080" \
  "$NAME:aktuell" >/dev/null

# ---- 4. Nachsehen, ob er lebt --------------------------------------------
sage "Warten, bis der Dienst antwortet"
for i in $(seq 1 30); do
  if curl -fsS --max-time 3 "$GESUNDHEIT" >/dev/null 2>&1; then
    echo "  antwortet nach ${i}s"
    LIVE="$(curl -fsS --max-time 3 "$GESUNDHEIT" 2>/dev/null | head -1)"
    echo "  Der Dienst meldet: $LIVE"
    case "$LIVE" in
      *"$SHA"*) sage "Fertig – Stand $SHA ist live" ;;
      *) printf "\n\033[1;33m! Der Dienst meldet nicht %s. Bitte im Browser hart neu laden.\033[0m\n" "$SHA" ;;
    esac
    docker image prune -f --filter "label=stage=build" >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 1
done

# ---- Notbremse ------------------------------------------------------------
printf '\n\033[1;31m✖ Der neue Container antwortet nicht. Letzte Zeilen:\033[0m\n'
docker logs "$NAME" --tail 40 || true
if [ -n "$ALT" ]; then
  sage "Zurück auf die vorige Fassung"
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" --restart unless-stopped \
    --env-file "$UMGEBUNG" -e DATA_DIR=/data -e PORT=8080 -e IDENT_VERSION="$SHA-zurueck" \
    -v "$DATEN:/data" -p "127.0.0.1:$PORT:8080" "$ALT" >/dev/null
  echo "  Die alte Fassung läuft wieder."
fi
exit 1
