#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# deploy.sh – neue Fassung von ident auf den 4ever1-Server bringen.
#
# Wird AUF DEM SERVER ausgeführt. Vom Mac aus:
#     ssh team4ever1 'bash -s' < ident/deploy.sh
# oder, wenn das Repo schon auf dem Server liegt:
#     ssh team4ever1 '/opt/4ever1-ident/src/ident/deploy.sh'
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
ZWEIG="${ZWEIG:-main}"
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
  git -C "$QUELLE" fetch --depth 1 origin "$ZWEIG"
  git -C "$QUELLE" reset --hard "origin/$ZWEIG"
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
  -v "$DATEN:/data" \
  -p "127.0.0.1:$PORT:8080" \
  "$NAME:aktuell" >/dev/null

# ---- 4. Nachsehen, ob er lebt --------------------------------------------
sage "Warten, bis der Dienst antwortet"
for i in $(seq 1 30); do
  if curl -fsS --max-time 3 "$GESUNDHEIT" >/dev/null 2>&1; then
    echo "  antwortet nach ${i}s"
    sage "Fertig – Stand $SHA ist live"
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
    --env-file "$UMGEBUNG" -e DATA_DIR=/data -e PORT=8080 \
    -v "$DATEN:/data" -p "127.0.0.1:$PORT:8080" "$ALT" >/dev/null
  echo "  Die alte Fassung läuft wieder."
fi
exit 1
