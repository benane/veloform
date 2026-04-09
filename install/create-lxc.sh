#!/usr/bin/env bash
# =============================================================================
#  VeloForm – LXC Container erstellen (läuft auf dem Proxmox Host)
#
#  Verwendung:
#    bash <(curl -s https://raw.githubusercontent.com/.../create-lxc.sh)
#  oder lokal:
#    bash install/create-lxc.sh
# =============================================================================

set -euo pipefail

# --- Farben ------------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*"; exit 1; }

# --- Voraussetzungen prüfen --------------------------------------------------
[[ "$(id -u)" -eq 0 ]] || error "Bitte als root ausführen (sudo bash ...)"
command -v pct &>/dev/null   || error "pct nicht gefunden – läuft das auf einem Proxmox Host?"
command -v pvesm &>/dev/null || error "pvesm nicht gefunden – läuft das auf einem Proxmox Host?"

echo -e "\n${BOLD}╔═══════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║       VeloForm LXC Installer          ║${RESET}"
echo -e "${BOLD}╚═══════════════════════════════════════╝${RESET}\n"

# --- Konfiguration -----------------------------------------------------------
CT_ID="${CT_ID:-$(pvesh get /cluster/nextid)}"
CT_HOSTNAME="${CT_HOSTNAME:-veloform}"
CT_MEMORY="${CT_MEMORY:-512}"          # MB
CT_DISK="${CT_DISK:-4}"               # GB
CT_CORES="${CT_CORES:-2}"
CT_IP="${CT_IP:-dhcp}"                # z.B. "192.168.1.100/24" für statisch
CT_GW="${CT_GW:-}"                    # Gateway, nur bei statischer IP nötig
CT_BRIDGE="${CT_BRIDGE:-vmbr0}"

# Storage: ersten verfügbaren nehmen falls nicht gesetzt
CT_STORAGE="${CT_STORAGE:-$(pvesm status -content rootdir | awk 'NR>1 {print $1; exit}')}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"

info "Container-Konfiguration:"
echo "  ID:       $CT_ID"
echo "  Hostname: $CT_HOSTNAME"
echo "  RAM:      ${CT_MEMORY} MB"
echo "  Disk:     ${CT_DISK} GB"
echo "  Cores:    $CT_CORES"
echo "  IP:       $CT_IP"
echo "  Storage:  $CT_STORAGE"
echo ""

read -rp "Fortfahren? [j/N] " confirm
[[ "${confirm,,}" == "j" ]] || { echo "Abgebrochen."; exit 0; }

# --- Debian 12 Template herunterladen ----------------------------------------
TEMPLATE="debian-12-standard_12.7-1_amd64.tar.zst"
TEMPLATE_PATH="${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}"

if ! pveam list "$TEMPLATE_STORAGE" 2>/dev/null | grep -q "$TEMPLATE"; then
  info "Lade Debian 12 Template herunter…"
  pveam update
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE" || error "Template-Download fehlgeschlagen"
fi

success "Template vorhanden"

# --- LXC Container erstellen -------------------------------------------------
info "Erstelle LXC Container #${CT_ID}…"

NET_CONFIG="name=eth0,bridge=${CT_BRIDGE}"
if [[ "$CT_IP" == "dhcp" ]]; then
  NET_CONFIG+=",ip=dhcp"
else
  NET_CONFIG+=",ip=${CT_IP}"
  [[ -n "$CT_GW" ]] && NET_CONFIG+=",gw=${CT_GW}"
fi

pct create "$CT_ID" "${TEMPLATE_PATH}" \
  --hostname  "$CT_HOSTNAME" \
  --memory    "$CT_MEMORY" \
  --cores     "$CT_CORES" \
  --rootfs    "${CT_STORAGE}:${CT_DISK}" \
  --net0      "$NET_CONFIG" \
  --unprivileged 1 \
  --features  nesting=1 \
  --start     0 \
  --ostype    debian \
  --password  "$(openssl rand -base64 12)"

success "Container #${CT_ID} erstellt"

# --- Starten & Setup-Script übertragen ---------------------------------------
info "Starte Container…"
pct start "$CT_ID"
sleep 5  # warten bis Netzwerk bereit

info "Übertrage Setup-Script…"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pct push "$CT_ID" "${SCRIPT_DIR}/setup.sh" /root/setup.sh
pct exec "$CT_ID" -- chmod +x /root/setup.sh

success "Setup-Script übertragen"

echo ""
echo -e "${BOLD}Container #${CT_ID} ist bereit.${RESET}"
echo -e "Jetzt Setup starten mit:"
echo -e "  ${CYAN}pct exec ${CT_ID} -- bash /root/setup.sh${RESET}"
echo ""
echo -e "Oder direkt in den Container:"
echo -e "  ${CYAN}pct enter ${CT_ID}${RESET}"
