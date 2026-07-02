# ============================================================
#  Frontend Next.js · Dockerfile de producción (standalone)
# ============================================================

# ---------- Etapa 1: dependencias ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---------- Etapa 2: build ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# La URL del backend se inyecta en tiempo de build (variables NEXT_PUBLIC_*).
# En Dokploy se define como "Build Argument".
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---------- Etapa 3: imagen final ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Usuario sin privilegios
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copia el build autocontenido (output: "standalone")
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
