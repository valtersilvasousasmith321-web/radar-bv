# Dockerfile do worker Radar BV — pensado pra rodar 24h no servidor próprio.
# Build multi-stage: a imagem final não leva o TypeScript, nem devDependencies,
# só o JS compilado e as dependências de produção — imagem mais leve e com
# menos coisa pra atualizar/ter vulnerabilidade.

# ---- Etapa 1: build ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Etapa 2: produção ----
FROM node:20-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

# O worker não recebe nenhuma conexão de fora (só faz chamadas de saída pra
# Supabase/Gemini/Claude/Groq/Unsplash/Pexels/WhatsApp), então não expõe
# nenhuma porta — não precisa de EXPOSE aqui.

# Roda como usuário sem privilégio (boa prática mesmo numa máquina de confiança)
RUN addgroup -S radarbv && adduser -S radarbv -G radarbv
USER radarbv

CMD ["node", "dist/index.js"]
