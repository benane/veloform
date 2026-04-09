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
git clone --depth=1 "$GIT_REPO" /tmp/veloform-update
cp -r /tmp/veloform-update/backend/* "${APP_DIR}/"
cp -r /tmp/veloform-update/frontend  "${APP_DIR}/frontend"
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

info "Dienste neu starten…"
systemctl restart veloform
systemctl reload nginx
success "Dienste neu gestartet"

CT_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${BOLD}${GREEN}Update abgeschlossen!${RESET} VeloForm läuft unter: ${CYAN}http://${CT_IP}${RESET}"
