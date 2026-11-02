#!/usr/bin/env bash
# Restaura un dump generado por backup-postgres.sh dentro del contenedor Postgres
# de una app. SOBRESCRIBE la base de datos actual (la recrea desde cero).
#
# Uso:  ./restore-postgres.sh <app> [archivo.dump]
#   <app>          nombre de la carpeta en ~/backups (ej: sigcompro-sigcompro)
#   [archivo.dump] opcional; si se omite usa el dump MÁS RECIENTE de esa carpeta
#
# Ej:   ./restore-postgres.sh sigcompro-sigcompro
#       ./restore-postgres.sh sigcompro-sigcompro ~/backups/sigcompro-sigcompro/sigcompro-sigcompro_2026-11-01_2000.dump
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups}"
APP="${1:?Falta el nombre de la app (carpeta en $BACKUP_ROOT)}"
ARCHIVO="${2:-$(ls -t "$BACKUP_ROOT/$APP"/*.dump 2>/dev/null | head -1)}"
[ -f "$ARCHIVO" ] || { echo "No se encontró el dump: ${ARCHIVO:-ninguno en $BACKUP_ROOT/$APP}"; exit 1; }

# Contenedor Postgres corriendo cuyo servicio empiece por el nombre de la app
ID="$(docker ps --format '{{.ID}}\t{{.Names}}\t{{.Image}}' | awk -F'\t' -v app="$APP" 'tolower($3) ~ /postgres/ && index($2, app)==1 {print $1; exit}')"
[ -n "$ID" ] || { echo "No hay contenedor Postgres corriendo para '$APP'. Si la BD no arranca, primero arregla/recrea el servicio (volumen vacío) y vuelve a correr esto."; exit 1; }

USUARIO="$(docker exec "$ID" sh -c 'echo "${POSTGRES_USER:-postgres}"')"
BD="$(docker exec "$ID" sh -c 'echo "${POSTGRES_DB:-$POSTGRES_USER}"')"

echo "Se va a RESTAURAR '$BD' en el contenedor $ID ($APP) desde:"
echo "  $ARCHIVO  ($(du -h "$ARCHIVO" | cut -f1), $(date -r "$ARCHIVO" '+%F %H:%M'))"
echo "Esto BORRA los datos actuales de '$BD'. Detén antes la aplicación que la usa."
read -r -p "¿Continuar? (escribe SI): " conf
[ "$conf" = "SI" ] || { echo "Cancelado."; exit 1; }

# Copia de seguridad rápida de lo que hay ahora, por si acaso
PREVIO="$BACKUP_ROOT/$APP/ANTES-RESTORE_$(date '+%F_%H%M%S').dump"
docker exec "$ID" pg_dump -U "$USUARIO" -d "$BD" -Fc > "$PREVIO" 2>/dev/null && echo "Copia previa guardada en $PREVIO" || { rm -f "$PREVIO"; echo "Aviso: no se pudo hacer copia previa (BD vacía o dañada); se continúa."; }

# Cerrar conexiones, recrear la BD y restaurar
docker exec "$ID" psql -U "$USUARIO" -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$BD' AND pid <> pg_backend_pid();" >/dev/null
docker exec "$ID" psql -U "$USUARIO" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$BD\";" -c "CREATE DATABASE \"$BD\" OWNER \"$USUARIO\";"
docker exec -i "$ID" pg_restore -U "$USUARIO" -d "$BD" --no-owner --role="$USUARIO" < "$ARCHIVO"

echo "Restauración terminada. Verificación rápida:"
docker exec "$ID" psql -U "$USUARIO" -d "$BD" -c "SELECT count(*) AS tablas FROM information_schema.tables WHERE table_schema='public';"
