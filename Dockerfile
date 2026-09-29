FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node package.json ./
COPY --chown=node:node index.html ./
COPY --chown=node:node css ./css
COPY --chown=node:node js ./js
COPY --chown=node:node assets ./assets
COPY --chown=node:node server ./server

EXPOSE 3000
USER node
CMD ["node", "server/server.js"]
