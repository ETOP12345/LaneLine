FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node index.html server.js videoAnalysis.js datahub-history.json ./

ENV NODE_ENV=production
EXPOSE 10000
USER node

CMD ["npm", "start"]
