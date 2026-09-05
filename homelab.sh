#!/usr/bin/env bash
# Run Sous Chef entirely on this machine: Convex backend + web app in Docker.
#
#   ./homelab.sh up [--profile dashboard]   start (and build) everything
#   ./homelab.sh update                     pull source changes, rebuild, restart
#   ./homelab.sh status | logs [service]    inspect
#   ./homelab.sh admin-key                  print the Convex admin key (keep private)
#   ./homelab.sh backup                     export data + files into ./backups
#   ./homelab.sh down                       stop containers; data volumes remain
#
# The first run creates .env.homelab from .env.homelab.example and fills
# SERVER_HOST with this machine's LAN address. Edit it, then run up again.
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE_FILE=docker-compose.homelab.yml
ENV_FILE=.env.homelab

die() { echo "homelab: $*" >&2; exit 1; }

if ! command -v docker >/dev/null 2>&1; then
  die "Docker is not installed. See https://docs.docker.com/engine/install/ then rerun."
fi
if docker compose version >/dev/null 2>&1; then
  compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
elif command -v docker-compose >/dev/null 2>&1; then
  compose() { docker-compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
else
  die "Docker Compose v2 is required (docker compose version)."
fi

detect_host() {
  local ip=""
  if command -v hostname >/dev/null 2>&1; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
  fi
  if [ -z "$ip" ] && command -v ipconfig >/dev/null 2>&1; then
    ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
  fi
  if [ -z "$ip" ] && command -v ip >/dev/null 2>&1; then
    ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") print $(i+1)}' | head -n1 || true)
  fi
  echo "$ip"
}

ensure_env() {
  if [ -f "$ENV_FILE" ]; then
    if ! grep -Eq '^SERVER_HOST=\S+' "$ENV_FILE"; then
      die "$ENV_FILE exists but SERVER_HOST is not set. Add SERVER_HOST=<LAN IP or hostname> and rerun."
    fi
    return
  fi
  local host
  host=$(detect_host)
  cp .env.homelab.example "$ENV_FILE"
  if [ -z "$host" ]; then
    die "Created $ENV_FILE, but could not detect a LAN address. Set SERVER_HOST in it, then rerun."
  fi
  sed -i.bak "s/^SERVER_HOST=.*/SERVER_HOST=$host/" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  echo "Created $ENV_FILE with SERVER_HOST=$host (this machine's detected LAN address)."
  echo "Phones and other devices must reach http://$host:3000 and http://$host:3210."
  echo "If that address is wrong, edit $ENV_FILE and rerun ./homelab.sh up."
}

print_summary() {
  # shellcheck disable=SC1091
  set -a; . "./$ENV_FILE"; set +a
  local app_url="${APP_URL:-http://${SERVER_HOST}:${APP_PORT:-3000}}"
  echo
  echo "Sous Chef is starting."
  echo "  App:        $app_url"
  echo "  Backend:    ${CONVEX_PUBLIC_URL:-http://${SERVER_HOST}:${CONVEX_PORT:-3210}}"
  echo "  Dashboard:  http://${SERVER_HOST}:${DASHBOARD_PORT:-6791} (only with --profile dashboard; sign in with ./homelab.sh admin-key)"
  echo "Open the app URL, create the first account, and you are the first household."
  echo "Camera barcode scanning needs HTTPS; see DEPLOYMENT.md for the reverse-proxy step."
}

cmd=${1:-up}
shift || true
ensure_env
case "$cmd" in
  up)
    mkdir -p "${BACKUP_DIR:-./backups}"
    compose "$@" up -d --build --remove-orphans
    print_summary
    ;;
  update)
    if [ -d .git ]; then git pull --ff-only; fi
    compose "$@" up -d --build --remove-orphans
    print_summary
    ;;
  status) compose ps "$@" ;;
  logs) compose logs -f "$@" ;;
  admin-key) compose exec backend ./generate_admin_key.sh ;;
  backup)
    mkdir -p "${BACKUP_DIR:-./backups}"
    # Run as the invoking user so the export lands in BACKUP_DIR owned by you.
    compose run --rm --no-deps --user "$(id -u):$(id -g)" setup backup
    ;;
  down) compose down "$@" ;;
  *) die "Unknown command '$cmd'. Use up, update, status, logs, admin-key, backup, or down." ;;
esac
