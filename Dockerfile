FROM node:22-bookworm-slim AS base
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY docs ./docs
COPY .env.example ./

RUN npm run build

EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/server.js"]
