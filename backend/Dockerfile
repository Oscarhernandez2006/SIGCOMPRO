# ============================================================
#  Backend NestJS · Dockerfile de producción
# ============================================================

# ---------- Etapa 1: build ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Instala dependencias (incluye devDependencies para compilar TypeScript)
COPY package*.json ./
RUN npm ci

# Copia el código y compila a /app/dist
COPY . .
RUN npm run build

# ---------- Etapa 2: dependencias de producción ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- Etapa 3: imagen final ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Usuario sin privilegios
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

# Copia solo lo necesario para ejecutar
COPY --from=deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --chown=nestjs:nodejs package.json ./

USER nestjs
EXPOSE 3001
CMD ["node", "dist/main"]
