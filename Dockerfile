FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node *.js *.html ./
COPY --chown=node:node performance.css ./
COPY --chown=node:node datahub-history.json swimmer-roster.json time-standards.json datahub-refresh-status.json imx-imr-data.json ./
COPY --chown=node:node ui-media/pool.jpg ./ui-media/pool.jpg
COPY --chown=node:node western-zone-dashboard/index.html ./western-zone-dashboard/index.html
COPY --chown=node:node western-zone-dashboard/data/ ./western-zone-dashboard/data/

ENV NODE_ENV=production
EXPOSE 10000
USER node

CMD ["npm", "start"]
