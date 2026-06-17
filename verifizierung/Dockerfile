# Verifizierungs-Video-Raum — App-Image (für Coolify / Docker)
FROM node:20-alpine

# su-exec, um nach dem Setzen der Verzeichnisrechte auf den Nicht-Root-Benutzer
# "node" zu wechseln.
RUN apk add --no-cache su-exec

WORKDIR /app

# Abhängigkeiten zuerst (besseres Layer-Caching)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Restliche Dateien
COPY . .
RUN chmod +x docker-entrypoint.sh && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
EXPOSE 3000

# Health-Check nutzt den eingebauten /healthz-Endpunkt
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Entrypoint richtet /data ein und wechselt auf den Benutzer "node".
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
