#!/usr/bin/env bash
# ==============================================================================
# pos-bola Avahi (mDNS / DNS-SD) Auto-Discovery Setup Script
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_SERVER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
AVAHI_SERVICE_FILE="${LOCAL_SERVER_DIR}/pos-bola.avahi.service"
TARGET_FILE="/etc/avahi/services/pos-bola.service"

echo "=== Installing and Configuring Avahi mDNS Daemon for POS Bola ==="

if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run this script with sudo or as root:"
  echo "  sudo ./scripts/setup_avahi.sh"
  exit 1
fi

if ! command -v avahi-daemon >/dev/null 2>&1; then
  echo "Installing avahi-daemon..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update && apt-get install -y avahi-daemon avahi-utils
  elif command -v yum >/dev/null 2>&1; then
    yum install -y avahi avahi-tools
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y avahi avahi-tools
  else
    echo "Warning: Could not detect package manager. Please install avahi-daemon manually."
  fi
fi

if [ -f "${AVAHI_SERVICE_FILE}" ]; then
  echo "Copying ${AVAHI_SERVICE_FILE} -> ${TARGET_FILE}..."
  mkdir -p /etc/avahi/services
  cp "${AVAHI_SERVICE_FILE}" "${TARGET_FILE}"
  chmod 644 "${TARGET_FILE}"
else
  echo "Error: Avahi service file not found at ${AVAHI_SERVICE_FILE}"
  exit 1
fi

echo "Restarting avahi-daemon..."
if command -v systemctl >/dev/null 2>&1; then
  systemctl enable avahi-daemon
  systemctl restart avahi-daemon
elif command -v service >/dev/null 2>&1; then
  service avahi-daemon restart
fi

echo "=============================================================================="
echo "SUCCESS: POS Bola mDNS service is now active!"
echo "Service type: _pos-bola._tcp (Port 8000)"
echo "Host domain:  http://$(hostname).local:8000/api/"
echo "=============================================================================="
