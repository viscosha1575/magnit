FROM node:25-alpine

WORKDIR /app

COPY package.json ./
COPY src ./src

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3001

CMD ["node", "src/server.js"]
