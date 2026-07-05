# ident – Container-Image (für Coolify/Docker)
FROM node:22-alpine

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

# Kein Root im Container
USER node

CMD ["node", "server.js"]
