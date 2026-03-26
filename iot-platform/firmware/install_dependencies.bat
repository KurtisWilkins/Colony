@echo off
title Grow Tent Firmware — Dependency Installer
echo =============================================
echo  Grow Tent Firmware Dependency Installer
echo  Colony-Main ESP32-WROOM-32D
echo =============================================
echo.

REM Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python 3 not found.
    echo.
    echo Download Python from: https://www.python.org/downloads/
    echo During install, check "Add Python to PATH"
    echo.
    pause
    exit /b 1
)

REM Check arduino-cli
where arduino-cli >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: arduino-cli not found.
    echo.
    echo Download from: https://arduino.github.io/arduino-cli/latest/installation/
    echo Extract arduino-cli.exe and add it to your PATH.
    echo Easiest: copy arduino-cli.exe to C:\Windows\System32\
    echo.
    pause
    exit /b 1
)

echo Python found. arduino-cli found. Starting installer...
echo.
python install_dependencies.py
echo.
pause
