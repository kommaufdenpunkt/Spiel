#!/bin/sh
# Start-Skript für den ident-Container.
#
# Problem: Das per Coolify gemountete DATA_DIR-Volume (z. B. /data) wird von
# Docker anfangs als root angelegt. Die App läuft aber als Nutzer "node" und
# könnte dann nicht hineinschreiben -> Absturz beim Start.
#
# Lösung: Der Container startet kurz als root, legt DATA_DIR an, übergibt es an
# "node" und startet die App danach mit den geringeren Rechten von "node".
set -e

DIR="${DATA_DIR:-/data}"
mkdir -p "$DIR"
chown -R node:node "$DIR" 2>/dev/null || true

# Von root auf "node" herunterschalten und die App (CMD) starten.
exec su-exec node:node "$@"
