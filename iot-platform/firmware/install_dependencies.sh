#!/bin/bash
echo "============================================="
echo " Grow Tent Firmware Dependency Installer"
echo " Colony-Main ESP32-WROOM-32D"
echo "============================================="
echo

if ! command -v python3 &>/dev/null; then
    echo "ERROR: Python 3 not found."
    echo "Install: sudo apt install python3  (Linux)"
    echo "Install: brew install python3       (Mac)"
    exit 1
fi

if ! command -v arduino-cli &>/dev/null; then
    echo "ERROR: arduino-cli not found."
    echo "Install: curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh"
    echo "Then:    sudo mv bin/arduino-cli /usr/local/bin/"
    exit 1
fi

echo "All prerequisites found. Starting installer..."
echo
python3 install_dependencies.py
