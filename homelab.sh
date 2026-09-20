#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo 'Install Docker with Compose first.' >&2; exit 1; }
if [ ! -f .env.homelab ]; then cp .env.homelab.example .env.homelab; chmod 600 .env.homelab; fi
compose() { docker compose --env-file .env.homelab -f docker-compose.homelab.yml "$@"; }
case "${1:-up}" in
  up|update) compose up -d --build app ;;
  down) compose down ;;
  status) compose ps ;;
  logs) compose logs -f app ;;
  backup)
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    mkdir -p backups
    chmod 700 backups
    compose exec -T app node scripts/local-admin.mjs backup "/backups/$stamp"
    compose cp "app:/backups/$stamp" "backups/$stamp"
    echo "Backup copied to backups/$stamp"
    ;;
  reset-password)
    [ -n "${2:-}" ] || { echo 'Usage: ./homelab.sh reset-password email' >&2; exit 1; }
    read -r -s -p 'New password: ' kitchen_password
    echo
    printf '%s' "$kitchen_password" | compose exec -T app node scripts/local-admin.mjs reset-password "$2"
    unset kitchen_password
    ;;
  *) echo 'Commands: up, update, down, status, logs, backup, reset-password email' >&2; exit 1 ;;
esac
