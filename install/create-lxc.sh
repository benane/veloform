#!/usr/bin/env bash
# =============================================================================
#  VeloForm – Vollautomatischer LXC Installer (läuft auf dem Proxmox Host)
#
#  One-Liner:
#    bash <(curl -s https://raw.githubusercontent.com/benane/veloform/main/install/create-lxc.sh)
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*"; exit 1; }

[[ "$(id -u)" -eq 0 ]] || error "Bitte als root auf dem Proxmox Host ausführen"
command -v pct   &>/dev/null || error "pct nicht gefunden – läuft das auf einem Proxmox Host?"
command -v pvesm &>/dev/null || error "pvesm nicht gefunden – läuft das auf einem Proxmox Host?"

echo -e "\n${BOLD}╔═══════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║       VeloForm LXC Installer          ║${RESET}"
echo -e "${BOLD}╚═══════════════════════════════════════╝${RESET}\n"

# --- Container-Defaults (überschreibbar via Umgebungsvariablen) ---------------
CT_ID="${CT_ID:-$(pvesh get /cluster/nextid)}"
CT_HOSTNAME="${CT_HOSTNAME:-veloform}"
CT_MEMORY="${CT_MEMORY:-512}"
CT_DISK="${CT_DISK:-4}"
CT_CORES="${CT_CORES:-2}"
CT_IP="${CT_IP:-dhcp}"
CT_GW="${CT_GW:-}"
CT_BRIDGE="${CT_BRIDGE:-vmbr0}"
CT_STORAGE="${CT_STORAGE:-$(pvesm status -content rootdir | awk 'NR>1 {print $1; exit}')}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"

# --- Konfiguration abfragen ---------------------------------------------------
echo -e "${BOLD}Schritt 1: Container-Einstellungen${RESET}"
read -rp "  Container ID       [${CT_ID}]: "       _id;       [[ -n "$_id" ]]       && CT_ID="$_id"
read -rp "  Hostname           [${CT_HOSTNAME}]: "  _hn;       [[ -n "$_hn" ]]       && CT_HOSTNAME="$_hn"
read -rp "  IP (dhcp / x.x.x.x/24) [${CT_IP}]: "  _ip;       [[ -n "$_ip" ]]       && CT_IP="$_ip"
if [[ "$CT_IP" != "dhcp" ]]; then
  read -rp "  Gateway            []: " _gw; [[ -n "$_gw" ]] && CT_GW="$_gw"
fi
read -rsp "  Root-Passwort (leer = kein Passwort): " CT_PASSWORD; echo

# Repo-URL ist fix – das Script kommt ja von dort
GIT_REPO="https://github.com/benane/veloform"

echo ""
echo -e "${BOLD}Schritt 2: API-Zugangsdaten${RESET}"
read -rp "  intervals.icu API Key:        " INTERVALS_KEY
read -rp "  intervals.icu Athlete ID:     " INTERVALS_ID
read -rp "  Strava Client ID:             " STRAVA_ID
read -rp "  Strava Client Secret:         " STRAVA_SECRET
read -rp "  Strava Refresh Token:         " STRAVA_REFRESH
read -rp "  Strava Bike IDs (kommatr.):   " STRAVA_BIKES

echo ""
info "Zusammenfassung:"
echo "  Container:  #${CT_ID} (${CT_HOSTNAME}), ${CT_MEMORY}MB RAM, ${CT_DISK}GB, ${CT_CORES} Cores"
echo "  Netzwerk:   IP=${CT_IP}, Bridge=${CT_BRIDGE}"
echo ""
read -rp "Fortfahren? [j/N] " confirm
[[ "${confirm,,}" == "j" ]] || { echo "Abgebrochen."; exit 0; }

# --- Debian 12 Template (neueste verfügbare Version) -------------------------
info "Suche aktuelles Debian 12 Template…"
pveam update -q 2>/dev/null || true
TEMPLATE=$(pveam available --section system 2>/dev/null | awk '{print $2}' | grep "^debian-12" | sort -V | tail -1)
[[ -n "$TEMPLATE" ]] || error "Kein Debian 12 Template in der Proxmox-Liste gefunden"
TEMPLATE_PATH="${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}"

if ! pveam list "$TEMPLATE_STORAGE" 2>/dev/null | grep -q "$TEMPLATE"; then
  info "Lade Template herunter: ${TEMPLATE}…"
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE" || error "Template-Download fehlgeschlagen"
fi
success "Template vorhanden: ${TEMPLATE}"

# --- LXC Container erstellen --------------------------------------------------
info "Erstelle LXC Container #${CT_ID}…"

NET_CONFIG="name=eth0,bridge=${CT_BRIDGE}"
if [[ "$CT_IP" == "dhcp" ]]; then
  NET_CONFIG+=",ip=dhcp"
else
  NET_CONFIG+=",ip=${CT_IP}"
  [[ -n "$CT_GW" ]] && NET_CONFIG+=",gw=${CT_GW}"
fi

PCT_ARGS=(
  "$CT_ID" "${TEMPLATE_PATH}"
  --hostname    "$CT_HOSTNAME"
  --memory      "$CT_MEMORY"
  --cores       "$CT_CORES"
  --rootfs      "${CT_STORAGE}:${CT_DISK}"
  --net0        "$NET_CONFIG"
  --unprivileged 1
  --features    nesting=1
  --start       0
  --ostype      debian
)
[[ -n "$CT_PASSWORD" ]] && PCT_ARGS+=(--password "$CT_PASSWORD")

pct create "${PCT_ARGS[@]}"

success "Container #${CT_ID} erstellt"

# --- Starten & warten ---------------------------------------------------------
info "Starte Container und warte auf Netzwerk…"
pct start "$CT_ID"
sleep 8

# Root-Passwort setzen oder entfernen
if [[ -n "$CT_PASSWORD" ]]; then
  pct exec "$CT_ID" -- bash -c "echo 'root:${CT_PASSWORD}' | chpasswd"
else
  pct exec "$CT_ID" -- passwd -d root
fi

# --- .env direkt in den Container schreiben -----------------------------------
info "Konfiguration in Container schreiben…"
pct exec "$CT_ID" -- bash -c "mkdir -p /opt/veloform"
pct exec "$CT_ID" -- bash -c "cat > /opt/veloform/.env" <<EOF
INTERVALS_API_KEY=${INTERVALS_KEY}
INTERVALS_ATHLETE_ID=${INTERVALS_ID}
STRAVA_CLIENT_ID=${STRAVA_ID}
STRAVA_CLIENT_SECRET=${STRAVA_SECRET}
STRAVA_REFRESH_TOKEN=${STRAVA_REFRESH}
STRAVA_BIKE_IDS=${STRAVA_BIKES}
DB_PATH=/opt/veloform/veloform.db
EOF
success ".env gesetzt"

# --- setup.sh auf dem Proxmox-Host laden und in Container schieben -----------
info "Lade setup.sh von GitHub auf den Proxmox-Host…"
SETUP_URL="https://raw.githubusercontent.com/benane/veloform/main/install/setup.sh"
curl -fsSL "$SETUP_URL" -o /tmp/veloform-setup.sh \
  || error "Download fehlgeschlagen. Prüfe ob das Repo public ist: ${SETUP_URL}"

pct push "$CT_ID" /tmp/veloform-setup.sh /root/setup.sh
pct exec "$CT_ID" -- chmod +x /root/setup.sh
rm -f /tmp/veloform-setup.sh

info "Starte Installation im Container…"
pct exec "$CT_ID" -- bash -c "DEBIAN_FRONTEND=noninteractive LANG=C GIT_REPO='${GIT_REPO}' bash /root/setup.sh"

# --- Abschluss ----------------------------------------------------------------
if [[ "$CT_IP" == "dhcp" ]]; then
  DISPLAY_IP=$(pct exec "$CT_ID" -- hostname -I | awk '{print $1}')
else
  DISPLAY_IP="${CT_IP%%/*}"
fi

echo ""
echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║     VeloForm erfolgreich installiert! ║${RESET}"
echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════╝${RESET}"
echo ""
echo -e "  Aufrufbar unter: ${CYAN}http://${DISPLAY_IP}${RESET}"
echo ""
echo -e "  Nützliche Befehle (auf dem Proxmox Host):"
echo -e "    ${CYAN}pct enter ${CT_ID}${RESET}                     → In Container einloggen"
echo -e "    ${CYAN}pct exec ${CT_ID} -- journalctl -u veloform -f${RESET} → Backend Logs"
echo -e "    ${CYAN}pct exec ${CT_ID} -- systemctl restart veloform${RESET}  → Neustart"
echo ""
