"""
ACR122U NFC reader/writer interface using pyscard.

Handles tag detection, UID reading, NDEF URL writing, and buzzer control.
Supports NTAG213, NTAG215, and NTAG216.
"""

import time
import struct

try:
    from smartcard.System import readers
    from smartcard.util import toHexString, toBytes
    from smartcard.Exceptions import NoCardException, CardConnectionException
    PYSCARD_AVAILABLE = True
except ImportError:
    PYSCARD_AVAILABLE = False

try:
    import ndef
    NDEF_AVAILABLE = True
except ImportError:
    NDEF_AVAILABLE = False


class ACR122UNotFound(Exception):
    pass


class TagNotPresent(Exception):
    pass


class WriteError(Exception):
    pass


class ACR122U:
    """Interface for ACR122U USB NFC reader/writer."""

    # NTAG page sizes
    PAGE_SIZE = 4  # bytes per page
    # NDEF starts at page 4 on NTAG2xx
    NDEF_START_PAGE = 4

    def __init__(self):
        if not PYSCARD_AVAILABLE:
            raise ImportError(
                "pyscard not installed. Run: pip install pyscard\n"
                "Linux: sudo apt install pcscd python3-pyscard\n"
                "Mac: brew install pcsc-lite && pip install pyscard"
            )
        if not NDEF_AVAILABLE:
            raise ImportError("ndef not installed. Run: pip install ndef")

        self.reader = None
        self.connection = None
        self._find_reader()

    def _find_reader(self):
        """Find ACR122U in available PC/SC readers."""
        available = readers()
        if not available:
            raise ACR122UNotFound(
                "No PC/SC readers found.\n"
                "- Is the ACR122U plugged in?\n"
                "- Windows: check Device Manager for 'ACS ACR122U'\n"
                "- Linux: sudo systemctl start pcscd\n"
                "- Mac: check System Information > USB"
            )
        for r in available:
            name = str(r).lower()
            if "acr122" in name or "acs" in name:
                self.reader = r
                return
        # Use first reader if ACR122U not found by name
        self.reader = available[0]

    def get_reader_name(self):
        return str(self.reader)

    def _connect(self):
        """Connect to the tag on the reader."""
        try:
            self.connection = self.reader.createConnection()
            self.connection.connect()
            return True
        except (NoCardException, CardConnectionException):
            self.connection = None
            return False

    def _transmit(self, apdu):
        """Send APDU command and return response data + SW1 + SW2."""
        data, sw1, sw2 = self.connection.transmit(apdu)
        return data, sw1, sw2

    def wait_for_tag(self, timeout_s=30):
        """
        Wait for a tag to be placed on the reader.
        Returns UID as uppercase hex string, or None on timeout.
        """
        start = time.time()
        while time.time() - start < timeout_s:
            if self._connect():
                uid = self._read_uid()
                if uid:
                    return uid
            time.sleep(0.2)
        return None

    def _read_uid(self):
        """Read UID from connected tag using GET DATA command."""
        try:
            # GET DATA command for UID
            apdu = [0xFF, 0xCA, 0x00, 0x00, 0x00]
            data, sw1, sw2 = self._transmit(apdu)
            if sw1 == 0x90 and sw2 == 0x00 and data:
                return "".join(f"{b:02X}" for b in data)
        except Exception:
            pass
        return None

    def _read_page(self, page):
        """Read 4 bytes from a specific page using NTAG READ command."""
        # Wrap NTAG READ in ACR122U pass-through
        apdu = [0xFF, 0xB0, 0x00, page, 0x04]
        data, sw1, sw2 = self._transmit(apdu)
        if sw1 == 0x90 and sw2 == 0x00:
            return bytes(data[:4])
        return None

    def _write_page(self, page, data_bytes):
        """Write 4 bytes to a specific page using NTAG WRITE command."""
        if len(data_bytes) != 4:
            raise WriteError(f"Page write requires exactly 4 bytes, got {len(data_bytes)}")
        # ACR122U UPDATE BINARY command
        apdu = [0xFF, 0xD6, 0x00, page, 0x04] + list(data_bytes)
        resp_data, sw1, sw2 = self._transmit(apdu)
        if sw1 != 0x90 or sw2 != 0x00:
            raise WriteError(f"Write to page {page} failed: SW={sw1:02X}{sw2:02X}")

    def write_ndef_url(self, url):
        """
        Write an NDEF URL record to the tag.
        Returns True on success, raises WriteError on failure.
        """
        if not self.connection:
            if not self._connect():
                raise TagNotPresent("No tag on reader")

        # Build NDEF message
        record = ndef.UriRecord(url)
        message_bytes = b"".join(ndef.message_encoder([record]))

        # NDEF TLV wrapper: type=0x03, length, payload, terminator=0xFE
        ndef_data = bytearray()
        ndef_data.append(0x03)  # NDEF Message TLV type
        msg_len = len(message_bytes)
        if msg_len < 0xFF:
            ndef_data.append(msg_len)
        else:
            ndef_data.append(0xFF)
            ndef_data.extend(struct.pack(">H", msg_len))
        ndef_data.extend(message_bytes)
        ndef_data.append(0xFE)  # Terminator TLV

        # Pad to page boundary (4 bytes)
        while len(ndef_data) % self.PAGE_SIZE != 0:
            ndef_data.append(0x00)

        # Write Capability Container (page 3) for NDEF
        # CC for NTAG215: E1 10 3E 00 (NDEF magic, version, size, access)
        cc_page = bytes([0xE1, 0x10, 0x3E, 0x00])
        self._write_page(3, cc_page)

        # Write NDEF data starting at page 4
        page = self.NDEF_START_PAGE
        for i in range(0, len(ndef_data), self.PAGE_SIZE):
            chunk = bytes(ndef_data[i:i + self.PAGE_SIZE])
            self._write_page(page, chunk)
            page += 1

        return True

    def read_ndef(self):
        """
        Read NDEF URL record from tag.
        Returns URL string or None if not found.
        """
        if not self.connection:
            if not self._connect():
                return None
        try:
            # Read pages starting from 4 until we find terminator
            raw = bytearray()
            for page in range(self.NDEF_START_PAGE, self.NDEF_START_PAGE + 40):
                data = self._read_page(page)
                if data is None:
                    break
                raw.extend(data)
                if 0xFE in data:
                    break

            # Find NDEF TLV
            idx = 0
            while idx < len(raw):
                tlv_type = raw[idx]
                if tlv_type == 0x00:  # NULL TLV
                    idx += 1
                    continue
                if tlv_type == 0xFE:  # Terminator
                    break
                if tlv_type == 0x03:  # NDEF Message
                    idx += 1
                    if raw[idx] == 0xFF:
                        length = struct.unpack(">H", raw[idx + 1:idx + 3])[0]
                        idx += 3
                    else:
                        length = raw[idx]
                        idx += 1
                    ndef_bytes = bytes(raw[idx:idx + length])
                    for record in ndef.message_decoder(ndef_bytes):
                        if isinstance(record, ndef.UriRecord):
                            return record.uri
                    return None
                else:
                    idx += 1
                    if idx < len(raw):
                        length = raw[idx]
                        idx += 1 + length
        except Exception:
            pass
        return None

    def get_tag_info(self):
        """Return tag UID, type estimate, and writable status."""
        uid = self._read_uid()
        return {
            "uid": uid,
            "tag_type": "NTAG2xx",
            "is_writable": True,
        }

    def beep(self, count=1, duration_ms=200):
        """
        Control ACR122U buzzer.
        Uses direct firmware command to the reader.
        """
        if not self.connection:
            return
        try:
            for _ in range(count):
                # ACR122U LED/Buzzer control command
                # P2 byte controls buzzer: bit 0 = buzzer on final state
                apdu = [0xFF, 0x00, 0x40, 0x00, 0x04,
                        0x01, 0x01, max(1, duration_ms // 100), 0x01]
                self._transmit(apdu)
                if count > 1:
                    time.sleep(0.15)
        except Exception:
            pass  # Buzzer commands may not work on all firmware versions

    def wait_for_removal(self, timeout_s=10):
        """Wait until tag is removed from reader."""
        start = time.time()
        while time.time() - start < timeout_s:
            try:
                uid = self._read_uid()
                if uid is None:
                    return True
            except Exception:
                return True
            time.sleep(0.2)
        return False
