# ============================================================
#  Volando Carnes / SIGCOMPRO
#  Dockerfile ÚNICO de producción (backend + frontend juntos)
#
#  Un solo contenedor:
#    - NestJS (backend)  -> puerto interno 3001
#    - Next.js (frontend) -> puerto interno 3000
#    - Caddy (reverse proxy) -> expone el puerto 80
#         /api/*  ->  backend  (3001)
#         /*      ->  frontend (3000)
#
#  En Dokploy: tipo "Application", Dockerfile en la raíz,
#  puerto de la app = 80.
# ============================================================

# ---------- 1) Build del backend ----------
FROM node:20-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ .
RUN npm run build

# ---------- 2) Dependencias de producción del backend ----------
FROM node:20-alpine AS backend-deps
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- 3) Build del frontend (Next.js standalone) ----------
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
# Mismo dominio: el frontend llama al backend por ruta relativa /api.
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- 4) Imagen final ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Reverse proxy
RUN apk add --no-cache caddy
# Tesseract para el OCR de la cédula. Best-effort: si el paquete no está
# disponible, el build NO falla (el OCR se desactiva y falla de forma segura).
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-spa tesseract-ocr-data-eng \
    || echo "tesseract no disponible; OCR deshabilitado"

# Backend (código compilado + dependencias de producción)
COPY --from=backend-deps  /app/backend/node_modules ./backend/node_modules
COPY --from=backend-build /app/backend/dist         ./backend/dist
COPY backend/package.json ./backend/package.json

# Frontend (salida standalone autocontenida)
COPY --from=frontend-build /app/frontend/public          ./frontend/public
COPY --from=frontend-build /app/frontend/.next/standalone ./frontend/
COPY --from=frontend-build /app/frontend/.next/static     ./frontend/.next/static

# Configuración del reverse proxy
COPY Caddyfile /etc/caddy/Caddyfile

# Puertos internos de cada servicio
ENV BACKEND_PORT=3001
ENV FRONTEND_PORT=3000

EXPOSE 80

# Levanta backend + frontend con reinicio automático si alguno se cae, y Caddy
# en primer plano. Así una caída puntual (p. ej. OOM del OCR) se auto-recupera
# en segundos en vez de dejar el sitio en 502 hasta un redeploy manual.
CMD ["sh", "-c", "while true; do node backend/dist/main; echo '[backend] se cayó, reiniciando en 2s'; sleep 2; done & while true; do PORT=3000 HOSTNAME=0.0.0.0 node frontend/server.js; echo '[frontend] se cayó, reiniciando en 2s'; sleep 2; done & caddy run --config /etc/caddy/Caddyfile --adapter caddyfile"]
