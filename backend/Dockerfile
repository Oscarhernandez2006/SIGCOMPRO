# ============================================================
#  Backend NestJS · Dockerfile de producción
# ============================================================

# ---------- Etapa 1: build ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Tesseract y dependencias nativas necesarias durante el build de sharp.
RUN apk add --no-cache python3 make g++ tesseract-ocr tesseract-ocr-data-spa

# Instala dependencias (incluye devDependencies para compilar TypeScript)
COPY package*.json ./
RUN npm ci

# Copia el código y compila a /app/dist
COPY . .
RUN npm run build

# ---------- Etapa 2: dependencias de producción ----------
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- Etapa 3: imagen final ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Tesseract para OCR de facturas (incluye datos del idioma español).
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-spa

# Usuario sin privilegios
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

# Copia solo lo necesario para ejecutar
COPY --from=deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --chown=nestjs:nodejs package.json ./

USER nestjs
EXPOSE 3001
CMD ["node", "dist/main"]
