#!/usr/bin/env bash
# ==============================================================================
# pos-bola Common Thermal Printer Subnets Setup Script (Linux)
# ==============================================================================
# Factory default IP subnets commonly used by Xprinter, Epson, Sam4s printers:
# - 192.168.123.0/24
# - 192.168.1.0/24
# - 192.168.0.0/24
# ==============================================================================
set -e

if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run this script with sudo:"
  echo "  sudo ./scripts/setup_printer_subnets.sh [INTERFACE_NAME]"
  exit 1
fi

IFACE="${1:-}"
if [ -z "${IFACE}" ]; then
  IFACE=$(ip route show default 2>/dev/null | awk '/default/ {print $5}' | head -n1)
  IFACE="${IFACE:-eth0}"
fi

echo "=== Binding Common Thermal Printer Subnet Aliases to interface '${IFACE}' ==="

bind_alias() {
  local ip_cidr="$1"
  if ! ip addr show dev "${IFACE}" | grep -q "${ip_cidr%/*}"; then
    echo "Adding alias ${ip_cidr} to ${IFACE}..."
    ip addr add "${ip_cidr}" dev "${IFACE}" || true
  else
    echo "Alias ${ip_cidr} already present on ${IFACE}."
  fi
}

bind_alias "192.168.123.250/24"
bind_alias "192.168.1.250/24"
bind_alias "192.168.0.250/24"

echo "=============================================================================="
echo "SUCCESS: Printer Subnet Aliases Active on ${IFACE}!"
echo "Server can now reach printers on 192.168.123.x, 192.168.1.x, 192.168.0.x"
echo "=============================================================================="
