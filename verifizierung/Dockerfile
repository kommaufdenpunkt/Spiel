# Verifizierungs-Video-Raum — App-Image (für Coolify / Docker)
FROM node:20-alpine

WORKDIR /app

# Abhängigkeiten zuerst (besseres Layer-Caching)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Restliche Dateien
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Health-Check nutzt den eingebauten /healthz-Endpunkt
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
