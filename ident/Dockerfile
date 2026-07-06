# ident – Container-Image (für Coolify/Docker)
FROM node:22-alpine

# su-exec: um im Entrypoint nach dem Rechte-Fix von root auf "node" zu wechseln
RUN apk add --no-cache su-exec

WORKDIR /app

# Nur Manifeste zuerst -> besseres Layer-Caching
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# Restliche App
COPY . .

# Daten liegen auf einem gemounteten Volume (siehe DATA_DIR)
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Start als root: Der Entrypoint korrigiert die Rechte am gemounteten DATA_DIR
# und lässt die App danach als unprivilegierter Nutzer "node" laufen.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]

CMD ["node", "server.js"]
