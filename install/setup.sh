#!/usr/bin/env bash
# =============================================================================
#  VeloForm – Setup (läuft im LXC Container)
#
#  Installiert:
#   - Python 3.11 + venv (Backend / FastAPI)
#   - Node.js 20 LTS (Frontend-Build)
#   - nginx (statisches Frontend + Reverse Proxy)
#   - systemd Service für das Backend
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*"; exit 1; }

[[ "$(id -u)" -eq 0 ]] || error "Bitte als root ausführen"

APP_DIR="/opt/veloform"
VENV_DIR="${APP_DIR}/venv"
WWW_DIR="/var/www/veloform"
SERVICE_USER="veloform"
BACKEND_PORT="8000"

# GitHub Repo – kann als Umgebungsvariable überschrieben werden
# Beispiel: GIT_REPO=https://github.com/DEIN_USER/veloform.git bash setup.sh
GIT_REPO="${GIT_REPO:-}"

echo -e "\n${BOLD}╔═══════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║     VeloForm Setup im LXC             ║${RESET}"
echo -e "${BOLD}╚═══════════════════════════════════════╝${RESET}\n"

# --- System aktualisieren ----------------------------------------------------
info "System aktualisieren…"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git ca-certificates gnupg \
  python3 python3-pip python3-venv \
  nginx sqlite3 openssl

success "System-Pakete installiert"

# --- Node.js 20 LTS ----------------------------------------------------------
info "Node.js 20 LTS installieren…"
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
success "Node.js $(node -v) installiert"

# --- App-Verzeichnis & Nutzer ------------------------------------------------
info "App-Verzeichnis einrichten…"
mkdir -p "$APP_DIR" "$WWW_DIR"

if ! id "$SERVICE_USER" &>/dev/null; then
  useradd -r -s /bin/false -d "$APP_DIR" "$SERVICE_USER"
fi

# --- Code kopieren oder klonen -----------------------------------------------
# Wenn dieses Script aus dem Repo ausgeführt wird, ist der Code im Parent-Dir
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -n "$GIT_REPO" ]]; then
  info "Code von GitHub klonen: ${GIT_REPO}"
  git clone --depth=1 "$GIT_REPO" /tmp/veloform-src
  cp -r /tmp/veloform-src/backend/* "${APP_DIR}/"
  cp -r /tmp/veloform-src/frontend  "${APP_DIR}/frontend"
  rm -rf /tmp/veloform-src
elif [[ -f "${REPO_ROOT}/backend/main.py" ]]; then
  info "Code aus lokalem Verzeichnis kopieren…"
  cp -r "${REPO_ROOT}/backend/"*  "${APP_DIR}/"
  cp -r "${REPO_ROOT}/frontend"   "${APP_DIR}/frontend"
else
  error "Kein Quellcode gefunden. GIT_REPO setzen oder aus dem Repo-Verzeichnis ausführen."
fi

success "Code vorhanden"

# --- Python venv & Abhängigkeiten --------------------------------------------
info "Python-Umgebung einrichten…"
python3 -m venv "$VENV_DIR"
"${VENV_DIR}/bin/pip" install --quiet --upgrade pip
"${VENV_DIR}/bin/pip" install --quiet \
  fastapi uvicorn[standard] httpx python-dotenv

success "Python-Pakete installiert"

# --- .env konfigurieren ------------------------------------------------------
ENV_FILE="${APP_DIR}/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  info "Konfiguration einrichten…"
  echo ""
  echo -e "${BOLD}Bitte die folgenden Werte eingeben:${RESET}"

  read -rp "  intervals.icu API Key:       " INTERVALS_KEY
  read -rp "  intervals.icu Athlete ID:    " INTERVALS_ID
  read -rp "  Strava Client ID:            " STRAVA_ID
  read -rp "  Strava Client Secret:        " STRAVA_SECRET
  read -rp "  Strava Refresh Token:        " STRAVA_REFRESH
  read -rp "  Strava Bike IDs (kommatr.):  " STRAVA_BIKES

  cat > "$ENV_FILE" <<EOF
INTERVALS_API_KEY=${INTERVALS_KEY}
INTERVALS_ATHLETE_ID=${INTERVALS_ID}
STRAVA_CLIENT_ID=${STRAVA_ID}
STRAVA_CLIENT_SECRET=${STRAVA_SECRET}
STRAVA_REFRESH_TOKEN=${STRAVA_REFRESH}
STRAVA_BIKE_IDS=${STRAVA_BIKES}
DB_PATH=${APP_DIR}/veloform.db
EOF
  success ".env erstellt"
else
  warn ".env existiert bereits – wird nicht überschrieben"
fi

# --- Frontend bauen ----------------------------------------------------------
info "Frontend bauen…"
cd "${APP_DIR}/frontend"
npm install --silent
npm run build --silent

cp -r dist/* "$WWW_DIR/"
success "Frontend gebaut und nach ${WWW_DIR} kopiert"

# --- systemd Service ---------------------------------------------------------
info "systemd Service einrichten…"

cat > /etc/systemd/system/veloform.service <<EOF
[Unit]
Description=VeloForm Backend (FastAPI)
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${VENV_DIR}/bin/uvicorn main:app --host 127.0.0.1 --port ${BACKEND_PORT} --workers 1
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR"
chown -R www-data:www-data "$WWW_DIR"

systemctl daemon-reload
systemctl enable veloform
systemctl start veloform

success "Backend-Service gestartet"

# --- nginx konfigurieren -----------------------------------------------------
info "nginx konfigurieren…"

cat > /etc/nginx/sites-available/veloform <<EOF
server {
    listen 80;
    server_name _;

    root ${WWW_DIR};
    index index.html;

    # Frontend (React SPA)
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass         http://127.0.0.1:${BACKEND_PORT};
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_read_timeout 60s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/veloform /etc/nginx/sites-enabled/veloform
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

success "nginx konfiguriert"

# --- Abschluss ---------------------------------------------------------------
CT_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║        Installation abgeschlossen!    ║${RESET}"
echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════╝${RESET}"
echo ""
echo -e "  VeloForm läuft unter: ${CYAN}http://${CT_IP}${RESET}"
echo ""
echo -e "  Nützliche Befehle:"
echo -e "    Status:   ${CYAN}systemctl status veloform${RESET}"
echo -e "    Logs:     ${CYAN}journalctl -u veloform -f${RESET}"
echo -e "    Neustart: ${CYAN}systemctl restart veloform${RESET}"
echo -e "    .env:     ${CYAN}nano ${ENV_FILE}${RESET}"
echo ""
