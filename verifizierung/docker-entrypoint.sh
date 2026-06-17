#!/bin/sh
# Startet die App als Nicht-Root-Benutzer "node".
# Das Daten-Verzeichnis (Persistent Volume) wird vorher dem node-Benutzer
# zugewiesen, damit er dort schreiben darf.
set -e
DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"
chown -R node:node "$DATA_DIR" 2>/dev/null || true
exec su-exec node "$@"
