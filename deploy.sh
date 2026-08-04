docker service update \
  --label-add 'traefik.enable=true' \
  --label-add 'traefik.http.routers.sigcompro.rule=Host(`sigcompro.grupo-santacruz.com`)' \
  --label-add 'traefik.http.routers.sigcompro.entrypoints=websecure' \
  --label-add 'traefik.http.routers.sigcompro.tls=true' \
  --label-add 'traefik.http.routers.sigcompro.tls.certresolver=letsencrypt' \
  --label-add 'traefik.http.routers.sigcompro.service=sigcompro' \
  --label-add 'traefik.http.services.sigcompro.loadbalancer.server.port=80' \
  --label-add 'traefik.http.routers.sigcompro-web.rule=Host(`sigcompro.grupo-santacruz.com`)' \
  --label-add 'traefik.http.routers.sigcompro-web.entrypoints=web' \
  --label-add 'traefik.http.routers.sigcompro-web.middlewares=sigcompro-redirect-https' \
  --label-add 'traefik.http.middlewares.sigcompro-redirect-https.redirectscheme.scheme=https' \
  --label-add 'traefik.http.middlewares.sigcompro-redirect-https.redirectscheme.permanent=true' \
  --label-add 'traefik.docker.network=dokploy-network' \
  sigcompro-sigcompro-jej3vi




  