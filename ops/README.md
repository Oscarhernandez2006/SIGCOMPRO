# Copias de seguridad de PostgreSQL (servidor Dokploy)

Scripts para respaldar **todas** las bases de datos PostgreSQL del servidor
`ServidorSoftwarePlanta` (20.121.178.90) cada 2 horas, una carpeta por aplicación.

```
~/backups/
  backup.log
  sigcompro-sigcompro/   sigcompro-sigcompro_2026-11-01_2000.dump
                         sigcompro-sigcompro_2026-11-01_2200.dump ...
  signom-signom/         ...
  (una carpeta por cada contenedor postgres que exista)
```

- Formato `pg_dump -Fc` (comprimido, restaurable con `pg_restore`).
- Detecta automáticamente los contenedores cuya imagen contiene `postgres`; si se
  crea una app nueva con Postgres, queda incluida sin tocar nada.
- Retención: 7 días (`RETENTION_DAYS`). A 12 copias/día son ~84 dumps por app.

## Instalación (una sola vez, por SSH)

```bash
mkdir -p ~/bin ~/backups
# copiar backup-postgres.sh y restore-postgres.sh a ~/bin (scp o pegar con cat > ~/bin/...)
chmod +x ~/bin/backup-postgres.sh ~/bin/restore-postgres.sh

# Probar a mano
~/bin/backup-postgres.sh
ls -lh ~/backups/*/

# Programar cada 2 horas (minuto 5: 00:05, 02:05, 04:05 ...)
( crontab -l 2>/dev/null; echo '5 */2 * * * /home/adminsvr/bin/backup-postgres.sh >> /home/adminsvr/backups/cron.log 2>&1' ) | crontab -
crontab -l
```

## Restaurar

```bash
~/bin/restore-postgres.sh sigcompro-sigcompro                  # usa el dump más reciente
~/bin/restore-postgres.sh sigcompro-sigcompro ~/backups/sigcompro-sigcompro/sigcompro-sigcompro_2026-11-01_1400.dump
```

Pide confirmación, hace una copia previa (`ANTES-RESTORE_*.dump`), recrea la BD y
restaura. Detener antes la app que usa esa BD (Dokploy → Stop).

Si el contenedor Postgres **no arranca** (volumen corrupto), primero hay que dejarlo
arrancar con un volumen vacío (Dokploy → BD → Stop; `docker service scale <svc>=0`;
vaciar `/var/lib/docker/volumes/<svc>-data/_data/`; `scale=1`) y después correr el
restore.

## Recomendado además

- Copiar `~/backups` fuera del servidor (Azure Storage / S3 desde Dokploy → Backups)
  para cubrir pérdida total de la VM.
- Vigilar espacio: `du -sh ~/backups` y `df -h /`.
