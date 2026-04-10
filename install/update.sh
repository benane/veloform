#!/usr/bin/env bash
# =============================================================================
#  VeloForm – Update (zieht neue Version von GitHub, baut Frontend neu)
#  Voraussetzung: setup.sh wurde bereits ausgeführt
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*"; exit 1; }

[[ "$(id -u)" -eq 0 ]] || error "Bitte als root ausführen"

APP_DIR="/opt/veloform"
VENV_DIR="${APP_DIR}/venv"
WWW_DIR="/var/www/veloform"
GIT_REPO="https://github.com/benane/veloform"

info "Neue Version von GitHub holen…"
rm -rf /tmp/veloform-update
git clone --depth=1 "$GIT_REPO" /tmp/veloform-update

# Backend-Dateien überschreiben (außer .env und DB)
cp -r /tmp/veloform-update/backend/* "${APP_DIR}/"

# Frontend komplett ersetzen (nicht hineinkopieren!)
rm -rf "${APP_DIR}/frontend"
cp -r /tmp/veloform-update/frontend "${APP_DIR}/frontend"

rm -rf /tmp/veloform-update
success "Code aktualisiert"

info "Python-Pakete prüfen…"
"${VENV_DIR}/bin/pip" install --quiet --upgrade pip
"${VENV_DIR}/bin/pip" install --quiet \
  fastapi uvicorn[standard] httpx python-dotenv
success "Python-Pakete aktuell"

info "Frontend neu bauen…"
cd "${APP_DIR}/frontend"
npm install --silent
npm run build --silent
cp -r dist/* "$WWW_DIR/"
success "Frontend gebaut"

info "Nginx-Config aktualisieren…"
WWW_DIR_ESCAPED=$(echo "$WWW_DIR" | sed 's/\//\\\//g')
cat > /etc/nginx/sites-available/veloform <<NGINXEOF
server {
    listen 80;
    server_name _;

    root ${WWW_DIR};
    index index.html;

    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
        try_files \$uri =404;
    }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files \$uri =404;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_read_timeout 60s;
    }
}
NGINXEOF
nginx -t
success "Nginx-Config aktualisiert"

info "Dienste neu starten…"
systemctl restart veloform
systemctl reload nginx
success "Dienste neu gestartet"

CT_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${BOLD}${GREEN}Update abgeschlossen!${RESET} VeloForm läuft unter: ${CYAN}http://${CT_IP}${RESET}"
