FROM node:24-alpine AS frontend-builder

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
ENV NEXT_PUBLIC_API_URL=""
RUN npm run build


FROM node:24-alpine AS backend-builder

WORKDIR /backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/prisma ./prisma
RUN npx prisma generate

COPY backend/tsconfig*.json backend/nest-cli.json ./
COPY backend/src ./src
RUN npm run build


FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --from=backend-builder /backend/node_modules ./node_modules
COPY --from=backend-builder /backend/dist ./dist
COPY --from=backend-builder /backend/prisma ./prisma
COPY backend/package*.json ./
COPY --from=frontend-builder /frontend/out ./public

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main"]