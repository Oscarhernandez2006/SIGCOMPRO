#!/usr/bin/env bash
# ============================================================
#  SIGCOMPRO · Despliegue en Ubuntu con Docker + Traefik
#  Construye la imagen (Dockerfile de la raíz) y levanta el
#  contenedor con los labels de Traefik y en la red de Dokploy.
#
#  Uso:
#    1) Crea el archivo de variables:  cp .env.example .env.production
#       y complétalo con los valores reales.
#    2) chmod +x deploy.sh
#    3) ./deploy.sh
# ============================================================

set -euo pipefail

# ---------- Parámetros (ajústalos si cambia el dominio) ----------
IMAGE_NAME="sigcompro:latest"
CONTAINER_NAME="sigcompro"
DOMAIN="sigcompro.grupo-santacruz.com"
NETWORK="dokploy-network"
CONTAINER_PORT="80"          # puerto interno (Caddy) del contenedor
CERT_RESOLVER="letsencrypt"  # nombre del certresolver en tu Traefik
ENV_FILE=".env.production"   # archivo con las variables (NO se sube a git)

# ---------- Verificaciones ----------
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker no está instalado en este servidor." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ No existe $ENV_FILE. Créalo con: cp .env.example $ENV_FILE" >&2
  exit 1
fi

# Crea la red de Traefik/Dokploy si no existe.
if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  echo "ℹ️  La red $NETWORK no existe, creándola..."
  docker network create "$NETWORK"
fi

# ---------- Build de la imagen ----------
echo "🔨 Construyendo la imagen $IMAGE_NAME ..."
docker build -t "$IMAGE_NAME" .

# ---------- Reemplaza el contenedor anterior ----------
echo "♻️  Eliminando contenedor anterior (si existe)..."
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

# ---------- Ejecuta el contenedor con labels de Traefik ----------
echo "🚀 Levantando el contenedor $CONTAINER_NAME ..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --network "$NETWORK" \
  --env-file "$ENV_FILE" \
  -e NODE_ENV=production \
  --label "traefik.enable=true" \
  --label "traefik.docker.network=${NETWORK}" \
  --label "traefik.http.routers.sigcompro.rule=Host(\`${DOMAIN}\`)" \
  --label "traefik.http.routers.sigcompro.entrypoints=websecure" \
  --label "traefik.http.routers.sigcompro.tls=true" \
  --label "traefik.http.routers.sigcompro.tls.certresolver=${CERT_RESOLVER}" \
  --label "traefik.http.routers.sigcompro.service=sigcompro" \
  --label "traefik.http.services.sigcompro.loadbalancer.server.port=${CONTAINER_PORT}" \
  --label "traefik.http.routers.sigcompro-web.rule=Host(\`${DOMAIN}\`)" \
  --label "traefik.http.routers.sigcompro-web.entrypoints=web" \
  --label "traefik.http.routers.sigcompro-web.middlewares=sigcompro-redirect-https" \
  --label "traefik.http.middlewares.sigcompro-redirect-https.redirectscheme.scheme=https" \
  --label "traefik.http.middlewares.sigcompro-redirect-https.redirectscheme.permanent=true" \
  "$IMAGE_NAME"

echo ""
echo "✅ Despliegue completado."
echo "   Contenedor: $CONTAINER_NAME"
echo "   Dominio:    https://${DOMAIN}"
echo "   Logs:       docker logs -f $CONTAINER_NAME"
