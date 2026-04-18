"""
Configuration for Colony-Main Bulk NFC Tag Writer.
Edit these values for your setup.
"""

# Colony-Main server URL
SERVER_URL = "https://shroomlord.3utilities.com"

# Login credentials (password prompted at runtime if empty)
USERNAME = "admin"
PASSWORD = ""

# Default jar properties for newly registered jars
JAR_DEFAULTS = {
    "jar_size_ml": 1000,
    "jar_material": "glass",
    "lid_type": "metal_band_with_polyfill",
    "tag_type": "nfc_ntag215",
}

# URL written to each NFC tag — phone taps open this URL
SCAN_URL_BASE = "https://shroomlord.3utilities.com/scan/"

# ACR122U buzzer feedback
BEEP_ON_SUCCESS = True
BEEP_ON_ERROR = True

# Auto-advance to next tag after success (no Enter needed)
AUTO_ADVANCE = True

# CSV log file — appends, never overwrites
LOG_FILE = "tag_log.csv"
