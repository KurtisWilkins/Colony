#!/usr/bin/env python3
"""
Grow Tent Firmware — Automatic Dependency Installer

Scans source files, installs ESP32 board support and all required
Arduino libraries using arduino-cli.

Dependencies discovered by scanning all #include <...> statements
in src/ and arduino/growtent/ directories:

  BUILT-IN (ESP32 core — no install needed):
    Arduino.h, WiFi.h, Preferences.h, math.h, SPIFFS.h,
    Wire.h, WebServer.h, DNSServer.h

  THIRD PARTY (installed by this script):
    Adafruit_BME280.h  → Adafruit BME280 Library (+ Adafruit Unified Sensor)
    MHZ19.h            → MH-Z19 by WifWaf
    PubSubClient.h     → PubSubClient by Nick O'Leary
    ArduinoJson.h      → ArduinoJson v6.21.3 (pinned to 6.x)

Usage:
    python install_dependencies.py
    python3 install_dependencies.py
"""

import subprocess
import sys
import os
import re
from pathlib import Path

# ============================================================
# DISCOVERED DEPENDENCIES (from scanning source files)
# ============================================================
# Format: (display_name, registry_name, version_or_None)
# version=None installs latest, version string pins exact version

LIBRARIES = [
    ("Adafruit BME280 Library", "Adafruit BME280 Library", None),
    ("Adafruit Unified Sensor", "Adafruit Unified Sensor", None),
    ("PubSubClient", "PubSubClient", None),
    ("ArduinoJson (v6)", "ArduinoJson", "6.21.3"),
    ("MH-Z19", "MH-Z19", None),
]

BOARD_FQBN = "esp32:esp32:esp32dev"
BOARD_PLATFORM = "esp32:esp32"
BOARD_PLATFORM_URL = "https://espressif.github.io/arduino-esp32/package_esp32_index.json"

# Relative to this script's location
SKETCH_PATH = os.path.join("arduino", "growtent", "growtent.ino")

# ============================================================
# Built-in includes (skip these during source scan)
# ============================================================
BUILTIN_PREFIXES = ("esp_", "freertos/", "driver/", "soc/", "hal/")
BUILTIN_HEADERS = {
    "Arduino.h", "WiFi.h", "WiFiClient.h", "WiFiServer.h", "WiFiUdp.h",
    "HTTPClient.h", "Preferences.h", "SPIFFS.h", "FS.h", "Wire.h",
    "SPI.h", "HardwareSerial.h", "ESPmDNS.h", "Update.h", "WebServer.h",
    "DNSServer.h", "nvs_flash.h", "BluetoothSerial.h", "BLEDevice.h",
    "esp_now.h", "Ticker.h", "EEPROM.h", "SD.h", "LittleFS.h",
    "math.h", "string.h", "stdlib.h", "stdio.h", "stdint.h", "stdarg.h",
    "functional",
}

# Map third-party headers to Arduino library names
HEADER_TO_LIBRARY = {
    "Adafruit_BME280.h": ("Adafruit BME280 Library", None),
    "Adafruit_Sensor.h": ("Adafruit Unified Sensor", None),
    "PubSubClient.h": ("PubSubClient", None),
    "ArduinoJson.h": ("ArduinoJson", "6.21.3"),
    "MHZ19.h": ("MH-Z19", None),
    "DHT.h": ("DHT sensor library", None),
    "Adafruit_GFX.h": ("Adafruit GFX Library", None),
    "Adafruit_SSD1306.h": ("Adafruit SSD1306", None),
    "FastLED.h": ("FastLED", None),
    "Adafruit_NeoPixel.h": ("Adafruit NeoPixel", None),
    "OneWire.h": ("OneWire", None),
    "DallasTemperature.h": ("DallasTemperature", None),
    "IRremote.h": ("IRremote", None),
    "WiFiManager.h": ("WiFiManager", None),
    "NTPClient.h": ("NTPClient", None),
    "RTClib.h": ("RTClib", None),
    "ESP32Servo.h": ("ESP32Servo", None),
    "AccelStepper.h": ("AccelStepper", None),
}


# ============================================================
# Terminal colors
# ============================================================
def supports_color():
    if os.environ.get("NO_COLOR"):
        return False
    if sys.platform == "win32":
        return os.environ.get("ANSICON") or "WT_SESSION" in os.environ
    return hasattr(sys.stdout, "isatty") and sys.stdout.isatty()

USE_COLOR = supports_color()

def green(s):  return f"\033[92m{s}\033[0m" if USE_COLOR else s
def red(s):    return f"\033[91m{s}\033[0m" if USE_COLOR else s
def yellow(s): return f"\033[93m{s}\033[0m" if USE_COLOR else s
def cyan(s):   return f"\033[96m{s}\033[0m" if USE_COLOR else s
def bold(s):   return f"\033[1m{s}\033[0m" if USE_COLOR else s


# ============================================================
# Source file scanner
# ============================================================
def scan_source_files():
    """Scan all source files and return sets of (builtin, thirdparty, unknown) includes."""
    script_dir = Path(__file__).parent
    search_dirs = [
        script_dir / "src",
        script_dir / "arduino" / "growtent",
    ]

    all_includes = set()
    include_re = re.compile(r'#include\s*<([^>]+)>')

    for search_dir in search_dirs:
        if not search_dir.is_dir():
            continue
        for ext in ("*.ino", "*.cpp", "*.h", "*.c"):
            for fpath in search_dir.glob(ext):
                with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        match = include_re.search(line)
                        if match:
                            all_includes.add(match.group(1))

    builtin = set()
    thirdparty = {}
    unknown = set()

    for header in sorted(all_includes):
        if header in BUILTIN_HEADERS:
            builtin.add(header)
        elif any(header.startswith(p) for p in BUILTIN_PREFIXES):
            builtin.add(header)
        elif header in HEADER_TO_LIBRARY:
            lib_name, lib_version = HEADER_TO_LIBRARY[header]
            thirdparty[header] = (lib_name, lib_version)
        else:
            unknown.add(header)

    return builtin, thirdparty, unknown


def print_scan_results(builtin, thirdparty, unknown):
    """Print what was discovered in the source scan."""
    print(bold("\n=== SOURCE FILE SCAN RESULTS ===\n"))

    print(f"  BUILT-IN ({len(builtin)} — no install needed):")
    for h in sorted(builtin):
        print(f"    {h}")

    print(f"\n  THIRD PARTY ({len(thirdparty)} — will be installed):")
    for h in sorted(thirdparty):
        lib_name, lib_ver = thirdparty[h]
        ver_str = f" @ {lib_ver}" if lib_ver else ""
        print(f"    {h:<25} → {lib_name}{ver_str}")

    if unknown:
        print(f"\n  {yellow(f'UNKNOWN ({len(unknown)} — may need manual install):')}")
        for h in sorted(unknown):
            print(f"    {yellow(f'WARNING: Unknown library for <{h}>')}")
            print(f"      Search: https://www.arduino.cc/reference/en/libraries/")
    else:
        print(f"\n  {green('No unknown includes found.')}")

    print()


# ============================================================
# arduino-cli helpers
# ============================================================
def run_cmd(args, stream=True):
    """Run a command, optionally streaming output. Returns (success, output)."""
    try:
        if stream:
            proc = subprocess.Popen(
                args,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            output_lines = []
            for line in proc.stdout:
                print(f"    {line}", end="")
                output_lines.append(line)
            proc.wait()
            return proc.returncode == 0, "".join(output_lines)
        else:
            result = subprocess.run(
                args, capture_output=True, text=True, timeout=120
            )
            return result.returncode == 0, result.stdout + result.stderr
    except FileNotFoundError:
        return False, "Command not found"
    except subprocess.TimeoutExpired:
        return False, "Command timed out"
    except Exception as e:
        return False, str(e)


def check_arduino_cli():
    """Check if arduino-cli is installed and in PATH."""
    print(bold("Checking arduino-cli..."))
    ok, output = run_cmd(["arduino-cli", "version"], stream=False)
    if ok:
        version_line = output.strip().split("\n")[0]
        print(f"  {green('FOUND:')} {version_line}")
        return True
    else:
        print(f"  {red('NOT FOUND: arduino-cli is not installed or not in PATH.')}")
        print()
        print("  Install arduino-cli:")
        print("    Windows: https://arduino.github.io/arduino-cli/latest/installation/")
        print("             Download .zip, extract, add to PATH")
        print("    Mac:     brew install arduino-cli")
        print("    Linux:   curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh")
        print("             sudo mv bin/arduino-cli /usr/local/bin/")
        return False


def install_board_platform():
    """Install ESP32 board support."""
    print("  Adding ESP32 board index...")
    run_cmd([
        "arduino-cli", "config", "add",
        "board_manager.additional_urls", BOARD_PLATFORM_URL
    ], stream=False)

    print("  Updating board index...")
    ok, _ = run_cmd(["arduino-cli", "core", "update-index"], stream=False)
    if not ok:
        print(f"    {yellow('Warning: index update had issues, continuing...')}")

    print(f"  Installing {BOARD_PLATFORM}...")
    ok, _ = run_cmd(["arduino-cli", "core", "install", BOARD_PLATFORM])
    if ok:
        print(f"  {green('ESP32 board platform installed.')}")
    else:
        # May already be installed
        print(f"  {yellow('Board install returned non-zero (may already be installed).')}")
    return True


def install_library(display_name, registry_name, version):
    """Install a single library. Returns True on success."""
    if version:
        lib_spec = f"{registry_name}@{version}"
    else:
        lib_spec = registry_name

    print(f"  Installing {display_name}...", end=" ", flush=True)
    ok, output = run_cmd(["arduino-cli", "lib", "install", lib_spec], stream=False)
    if ok:
        print(green("OK"))
        return True
    else:
        # Check if already installed
        if "already installed" in output.lower():
            print(green("OK (already installed)"))
            return True
        print(red("FAILED"))
        if output.strip():
            for line in output.strip().split("\n")[:3]:
                print(f"    {line}")
        return False


def install_all_libraries():
    """Install all libraries. Returns dict of name: success."""
    results = {}
    for display_name, registry_name, version in LIBRARIES:
        results[display_name] = install_library(display_name, registry_name, version)
    return results


def verify_installed():
    """Check which libraries are actually installed. Returns dict of name: version."""
    ok, output = run_cmd(["arduino-cli", "lib", "list"], stream=False)
    if not ok:
        return {}

    installed = {}
    for line in output.strip().split("\n")[1:]:  # skip header
        parts = line.split()
        if len(parts) >= 2:
            # Library names can have spaces, version is typically the second-to-last column
            # Format: Name    Version   Available  Location ...
            # Try to match known library names
            for display_name, registry_name, _ in LIBRARIES:
                if registry_name.lower().replace(" ", "").replace("-", "") in line.lower().replace(" ", "").replace("-", ""):
                    # Extract version (second column-like token)
                    for part in parts:
                        if re.match(r'^\d+\.\d+', part):
                            installed[display_name] = part
                            break
    return installed


def print_status_table(results, installed):
    """Print a formatted status table."""
    print()
    print(bold("  {:35s} {:12s} {:12s} {}".format("Library", "Status", "Version", "Notes")))
    print("  " + "-" * 75)

    for display_name, registry_name, req_version in LIBRARIES:
        success = results.get(display_name, False)
        version = installed.get(display_name, "—")

        if success:
            status = green("OK")
            notes = ""
        else:
            status = red("FAILED")
            notes = f"Try: arduino-cli lib install \"{registry_name}\""

        if req_version and version != "—" and not version.startswith(req_version.split(".")[0]):
            notes = yellow(f"Expected v{req_version}")

        print(f"  {display_name:35s} {status:12s} {version:12s} {notes}")

    print()


def compile_test():
    """Optional compile test."""
    script_dir = Path(__file__).parent
    sketch = script_dir / SKETCH_PATH

    if not sketch.exists():
        print(f"  {yellow('Sketch not found at:')} {sketch}")
        print("  Skipping compile test.")
        return False

    answer = input("  Run compile test? This takes 1-2 minutes. [y/N] ").strip().lower()
    if answer not in ("y", "yes"):
        print("  Skipping compile test.")
        return True

    print(f"  Compiling {SKETCH_PATH}...")
    ok, _ = run_cmd([
        "arduino-cli", "compile",
        "--fqbn", BOARD_FQBN,
        str(sketch),
    ])
    if ok:
        print(f"\n  {green('Compile test PASSED!')}")
    else:
        print(f"\n  {red('Compile test FAILED.')}")
        print("  This may be due to ESP32 core version differences.")
        print("  The firmware should still upload — try it.")
    return ok


def print_banner():
    """Print the installer banner."""
    print()
    print(bold("============================================="))
    print(bold(" Grow Tent Firmware — Dependency Installer"))
    print(bold(" Colony-Main ESP32-WROOM-32D"))
    print(bold("============================================="))
    print()


def print_completion_summary(all_ok):
    """Print final instructions."""
    print()
    print(bold("============================================="))
    if all_ok:
        print(bold(green(" ALL DEPENDENCIES INSTALLED SUCCESSFULLY")))
    else:
        print(bold(yellow(" SOME DEPENDENCIES FAILED — SEE ABOVE")))
    print(bold("============================================="))
    print()
    print("  Next steps:")
    print()
    print(bold("  ARDUINO IDE:"))
    print("    1. Open Arduino IDE")
    print("    2. File → Open → arduino/growtent/growtent.ino")
    print("    3. Tools → Board → ESP32 Arduino → ESP32 Dev Module")
    print("    4. Tools → Port → select your ESP32's COM port")
    print("    5. Tools → Upload Speed → 921600")
    print("    6. Click Upload (→)")
    print("    7. Hold BOOT button when you see 'Connecting......'")
    print("    8. Release BOOT when upload percentage appears")
    print("    9. Open Serial Monitor at 115200 baud")
    print("   10. Press EN on ESP32 — you should see:")
    print()
    print("       =====================================")
    print("        BOOT COMPLETE — TEST MODE ACTIVE")
    print("        No sensors or relays will be read.")
    print("        Simulated data will be published.")
    print("       =====================================")
    print()

    if not all_ok:
        print(bold("  MANUAL INSTALL (for any failed libraries):"))
        print("    Open Arduino IDE → Tools → Manage Libraries")
        print("    Search for and install each failed library manually.")
        print("    See INSTALL_LIBRARIES.md for details.")
        print()


def main():
    """Main installer flow."""
    print_banner()

    # Scan source files first
    builtin, thirdparty, unknown = scan_source_files()
    print_scan_results(builtin, thirdparty, unknown)

    # Check prerequisites
    if not check_arduino_cli():
        sys.exit(1)

    print(bold("\n[1/4] Installing ESP32 board platform...\n"))
    install_board_platform()

    print(bold("\n[2/4] Installing libraries...\n"))
    results = install_all_libraries()

    print(bold("\n[3/4] Verifying installation...\n"))
    installed = verify_installed()
    print_status_table(results, installed)

    all_ok = all(results.values())

    print(bold("[4/4] Optional compile test...\n"))
    compile_test()

    print_completion_summary(all_ok)
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
