#!/usr/bin/env bash
# Copia de seguridad de TODOS los contenedores PostgreSQL que estén corriendo en
# el servidor (Dokploy / Docker Swarm). Genera un pg_dump por base de datos en
#   $BACKUP_ROOT/<app>/<app>_<YYYY-MM-DD_HHMM>.dump   (formato custom, comprimido)
# y borra los que superen RETENTION_DAYS. Pensado para correr por cron cada 2 h.
#
# Uso:  ./backup-postgres.sh            (todas las BD)
#       ./backup-postgres.sh sigcompro  (solo las apps cuyo nombre contenga "sigcompro")
set -uo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
FILTRO="${1:-}"
LOG="$BACKUP_ROOT/backup.log"

mkdir -p "$BACKUP_ROOT"
log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }

# Contenedores con imagen postgres (postgres:18, postgres:16-alpine, etc.)
mapfile -t CONTENEDORES < <(docker ps --format '{{.ID}}\t{{.Names}}\t{{.Image}}' | awk -F'\t' 'tolower($3) ~ /postgres/ {print $1"\t"$2}')

if [ ${#CONTENEDORES[@]} -eq 0 ]; then
  log "No hay contenedores PostgreSQL corriendo."
  exit 0
fi

ok=0; fallos=0
for linea in "${CONTENEDORES[@]}"; do
  id="${linea%%$'\t'*}"
  nombre="${linea#*$'\t'}"

  # Nombre de la app: servicio de Swarm sin el sufijo aleatorio de Dokploy ni el
  # ".1.<taskid>" del contenedor. Ej: sigcompro-sigcompro-hj2zfy.1.abc -> sigcompro-sigcompro
  servicio="$(docker inspect -f '{{index .Config.Labels "com.docker.swarm.service.name"}}' "$id" 2>/dev/null)"
  [ -z "$servicio" ] && servicio="${nombre%%.*}"
  app="$(echo "$servicio" | sed -E 's/-[a-z0-9]{6}$//')"

  if [ -n "$FILTRO" ] && [[ "$app" != *"$FILTRO"* ]]; then continue; fi

  usuario="$(docker exec "$id" sh -c 'echo "${POSTGRES_USER:-postgres}"')"
  bd="$(docker exec "$id" sh -c 'echo "${POSTGRES_DB:-$POSTGRES_USER}"')"
  [ -z "$bd" ] && bd="postgres"

  destino="$BACKUP_ROOT/$app"
  mkdir -p "$destino"
  archivo="$destino/${app}_$(date '+%F_%H%M').dump"

  # pg_dump en formato custom (-Fc): comprimido y restaurable con pg_restore.
  # Se conecta por socket local dentro del contenedor (auth trust), sin exponer claves.
  if docker exec "$id" pg_dump -U "$usuario" -d "$bd" -Fc > "$archivo.tmp" 2>>"$LOG"; then
    mv "$archivo.tmp" "$archivo"
    log "OK   $app ($bd) -> $(basename "$archivo") $(du -h "$archivo" | cut -f1)"
    ok=$((ok+1))
    # Rotación: borra dumps más viejos que RETENTION_DAYS
    find "$destino" -name '*.dump' -mtime +"$RETENTION_DAYS" -delete
  else
    rm -f "$archivo.tmp"
    log "ERROR $app ($bd): pg_dump falló (ver $LOG)"
    fallos=$((fallos+1))
  fi
done

log "Resumen: $ok correctas, $fallos con error. Espacio usado: $(du -sh "$BACKUP_ROOT" | cut -f1)"
[ "$fallos" -eq 0 ]
