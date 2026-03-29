#!/usr/bin/env python3
"""
Colony-Main Bulk NFC Tag Writer

Registers NFC tags in the Colony-Main inventory system and writes
scan URLs to each tag using an ACR122U USB NFC reader/writer.

Usage:
    python bulk_writer.py              Normal mode: register + write
    python bulk_writer.py --reassign   Reassign tags to new jars
    python bulk_writer.py --audit      Read-only audit mode
"""

import sys
import os
import csv
import time
import getpass
import argparse
from datetime import datetime

try:
    from colorama import init, Fore, Style
    init()
except ImportError:
    # Fallback if colorama not installed
    class Fore:
        GREEN = RED = YELLOW = CYAN = WHITE = RESET = ""
        LIGHTGREEN_EX = LIGHTYELLOW_EX = LIGHTRED_EX = ""
    class Style:
        BRIGHT = RESET_ALL = ""

from config import (
    SERVER_URL, USERNAME, PASSWORD, JAR_DEFAULTS,
    SCAN_URL_BASE, BEEP_ON_SUCCESS, BEEP_ON_ERROR,
    AUTO_ADVANCE, LOG_FILE,
)
from api_client import ColonyMainAPI
from nfc_writer import ACR122U, ACR122UNotFound, TagNotPresent, WriteError


# ── Helpers ──────────────────────────────────────────────────────────────

def green(s):
    return f"{Fore.LIGHTGREEN_EX}{s}{Style.RESET_ALL}"

def red(s):
    return f"{Fore.LIGHTRED_EX}{s}{Style.RESET_ALL}"

def amber(s):
    return f"{Fore.LIGHTYELLOW_EX}{s}{Style.RESET_ALL}"

def cyan(s):
    return f"{Fore.CYAN}{s}{Style.RESET_ALL}"

def dim(s):
    return f"{Fore.WHITE}{s}{Style.RESET_ALL}"


def print_banner():
    print()
    print(green("╔════════════════════════════════════════╗"))
    print(green("║   COLONY-MAIN BULK TAG WRITER          ║"))
    print(green("║   NFC Tag Registration System           ║"))
    print(green("╚════════════════════════════════════════╝"))
    print()


def print_separator():
    print(dim("─" * 45))


def log_csv(uid, jar_id, status, url="", notes=""):
    """Append a row to the CSV log file."""
    file_exists = os.path.exists(LOG_FILE)
    with open(LOG_FILE, "a", newline="") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["timestamp", "tag_uid", "jar_id", "status", "url", "notes"])
        writer.writerow([
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            uid, jar_id or "", status, url, notes,
        ])


def spinner_chars():
    """Yield spinning animation characters."""
    chars = "|/-\\"
    i = 0
    while True:
        yield chars[i % len(chars)]
        i += 1


# ── Normal Mode ──────────────────────────────────────────────────────────

def run_normal(api, nfc):
    """Register and write new tags."""
    session_written = 0
    session_skipped = 0
    session_errors = 0
    spin = spinner_chars()

    try:
        while True:
            print()
            sys.stdout.write(f"  {cyan('[ READY ]')} Place tag on reader... ")
            sys.stdout.flush()

            uid = None
            while uid is None:
                uid = nfc.wait_for_tag(timeout_s=1)
                if uid is None:
                    sys.stdout.write(f"\r  {cyan('[ READY ]')} Place tag on reader... {next(spin)} ")
                    sys.stdout.flush()

            print(f"\r  {cyan('[ SCAN  ]')} UID: {uid}                    ")

            # Check if already registered
            existing = api.get_jar_by_tag(uid)
            if existing and not existing.get("status") == "unknown_tag":
                jar_data = existing.get("jar", existing)
                jar_id = jar_data.get("id", "?")
                short_id = str(jar_id)[-8:]
                print(f"  {amber('[ SKIP  ]')} Tag {uid} already registered as JAR-{short_id}")
                if BEEP_ON_ERROR:
                    nfc.beep(count=2, duration_ms=100)
                log_csv(uid, jar_id, "SKIPPED", notes="already registered")
                session_skipped += 1
                nfc.wait_for_removal(timeout_s=5)
                print_separator()
                continue

            # Register with API
            try:
                result = api.register_jar(uid, JAR_DEFAULTS)
                if result.get("already_registered"):
                    jar_data = result.get("jar", {})
                    jar_id = jar_data.get("id", "?")
                    print(f"  {amber('[ SKIP  ]')} Already in database")
                    if BEEP_ON_ERROR:
                        nfc.beep(count=2, duration_ms=100)
                    log_csv(uid, jar_id, "SKIPPED", notes="already in db")
                    session_skipped += 1
                    nfc.wait_for_removal(timeout_s=5)
                    print_separator()
                    continue
                jar_id = result.get("id", "?")
            except Exception as e:
                print(f"  {red('[ ERROR ]')} Registration failed: {e}")
                if BEEP_ON_ERROR:
                    nfc.beep(count=3, duration_ms=100)
                log_csv(uid, "", "REG_ERROR", notes=str(e))
                session_errors += 1
                input("  Press Enter to continue...")
                print_separator()
                continue

            # Write URL to tag
            url = f"{SCAN_URL_BASE}{uid}"
            try:
                nfc.write_ndef_url(url)
            except (WriteError, TagNotPresent) as e:
                print(f"  {red('[ ERROR ]')} Write failed: {e}")
                if BEEP_ON_ERROR:
                    nfc.beep(count=3, duration_ms=100)
                log_csv(uid, jar_id, "WRITE_ERROR", notes=str(e))
                session_errors += 1
                print_separator()
                continue

            # Verify write
            read_back = nfc.read_ndef()
            if read_back != url:
                print(f"  {red('[ ERROR ]')} Verification failed")
                print(f"           Expected: {url}")
                print(f"           Got:      {read_back}")
                if BEEP_ON_ERROR:
                    nfc.beep(count=3, duration_ms=100)
                log_csv(uid, jar_id, "VERIFY_ERROR", url, f"read_back={read_back}")
                session_errors += 1
                print_separator()
                continue

            # Success
            short_id = str(jar_id)[-8:]
            session_written += 1
            print(f"  {green('[ DONE  ]')} JAR-{short_id} registered and written")
            print(f"           URL: {dim(url)}")

            stats = api.get_stats()
            total = stats.get("total_active_jars", "?")
            print(f"           Session: {green(str(session_written))} tags  |  Total: {green(str(total))} jars")

            if BEEP_ON_SUCCESS:
                nfc.beep(count=1, duration_ms=300)

            log_csv(uid, jar_id, "SUCCESS", url)
            print_separator()

            nfc.wait_for_removal(timeout_s=5)

            if not AUTO_ADVANCE:
                input("  Press Enter for next tag...")

            time.sleep(0.5)  # Brief pause to prevent double-reads

    except KeyboardInterrupt:
        pass

    return session_written, session_skipped, session_errors


# ── Reassign Mode ────────────────────────────────────────────────────────

def run_reassign(api, nfc):
    """Reassign existing tags to new jars."""
    session_count = 0

    try:
        while True:
            print()
            sys.stdout.write(f"  {amber('[ REASSIGN ]')} Place tag on reader... ")
            sys.stdout.flush()

            uid = nfc.wait_for_tag(timeout_s=30)
            if uid is None:
                print("\r  Timeout — no tag detected.         ")
                continue

            print(f"\r  {cyan('[ SCAN  ]')} UID: {uid}                    ")

            existing = api.get_jar_by_tag(uid)
            if not existing or existing.get("status") == "unknown_tag":
                print(f"  {amber('[ INFO  ]')} Tag not registered. Use normal mode to register.")
                nfc.wait_for_removal(timeout_s=5)
                continue

            jar_data = existing.get("jar", existing)
            jar_id = jar_data.get("id", "?")
            status = jar_data.get("status", "?")
            print(f"  Current jar: JAR-{str(jar_id)[-8:]}  Status: {status}")

            choice = input(f"  Reassign this tag? Current jar will be retired. (y/n): ").strip().lower()
            if choice != "y":
                print("  Skipped.")
                nfc.wait_for_removal(timeout_s=5)
                continue

            # Retire old jar
            api.retire_jar(jar_id, reason="tag_reassigned")
            print(f"  Old jar retired.")

            # Register new jar with same tag
            result = api.register_jar(uid, JAR_DEFAULTS)
            new_jar_id = result.get("id", "?")

            # Rewrite URL (same URL since tag UID is same)
            url = f"{SCAN_URL_BASE}{uid}"
            nfc.write_ndef_url(url)

            print(f"  {green('[ DONE  ]')} Reassigned to new JAR-{str(new_jar_id)[-8:]}")
            log_csv(uid, new_jar_id, "REASSIGNED", url, f"old_jar={jar_id}")
            session_count += 1

            nfc.beep(count=1, duration_ms=300)
            nfc.wait_for_removal(timeout_s=5)
            print_separator()

    except KeyboardInterrupt:
        pass

    return session_count


# ── Audit Mode ───────────────────────────────────────────────────────────

def run_audit(api, nfc):
    """Read-only tag audit — look up without writing."""
    session_count = 0

    try:
        while True:
            print()
            sys.stdout.write(f"  {cyan('[ AUDIT ]')} Place tag on reader... ")
            sys.stdout.flush()

            uid = nfc.wait_for_tag(timeout_s=30)
            if uid is None:
                print("\r  Timeout — no tag detected.         ")
                continue

            print(f"\r  {cyan('[ SCAN  ]')} UID: {uid}                    ")

            existing = api.get_jar_by_tag(uid)
            if not existing or existing.get("status") == "unknown_tag":
                print(f"  {amber('[ ???? ]')} Tag NOT registered in system")
                nfc.beep(count=2, duration_ms=100)
            else:
                jar_data = existing.get("jar", existing)
                jar_id = jar_data.get("id", "?")
                status = jar_data.get("status", "?")
                location = jar_data.get("current_location_id", "unknown")
                cycles = jar_data.get("total_cycles", 0)
                total_yield = jar_data.get("total_yield_g", 0)

                status_color = green if status in ("available", "fruiting") else (
                    amber if status in ("colonizing", "resting") else red)

                print(f"  UID:      {uid}")
                print(f"  JAR:      JAR-{str(jar_id)[-8:]}")
                print(f"  Status:   {status_color(status.upper())}")
                print(f"  Cycles:   {cycles}")
                print(f"  Yield:    {total_yield:.1f}g total")

                nfc.beep(count=1, duration_ms=200)

            session_count += 1
            log_csv(uid, jar_data.get("id", "") if existing else "", "AUDITED")
            nfc.wait_for_removal(timeout_s=5)
            print_separator()

    except KeyboardInterrupt:
        pass

    return session_count


# ── Main ─────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Colony-Main Bulk NFC Tag Writer")
    parser.add_argument("--reassign", action="store_true", help="Reassign mode")
    parser.add_argument("--audit", action="store_true", help="Audit mode (read-only)")
    args = parser.parse_args()

    print_banner()

    mode = "NORMAL"
    if args.reassign:
        mode = "REASSIGN"
        print(amber("  MODE: REASSIGN — existing tags will be moved to new jars"))
    elif args.audit:
        mode = "AUDIT"
        print(cyan("  MODE: AUDIT — read-only tag lookup, no writes"))
    else:
        print(green("  MODE: NORMAL — register and write new tags"))
    print()

    # Get password
    password = PASSWORD
    if not password:
        password = getpass.getpass(f"  {dim('SERVER PASSWORD:')} ")

    # Login
    print(f"  Connecting to {SERVER_URL}...")
    try:
        api = ColonyMainAPI(SERVER_URL, USERNAME, password)
        print(f"  {green('✓')} Logged in as {USERNAME}")
    except Exception as e:
        print(f"  {red('✗')} Login failed: {e}")
        sys.exit(1)

    # Show stats
    try:
        stats = api.get_stats()
        total = stats.get("total_active_jars", "?")
        print(f"  Total jars registered: {green(str(total))}")
    except Exception:
        print(f"  {amber('!')} Could not fetch stats")

    print()

    # Detect reader
    print("  Looking for ACR122U reader...")
    try:
        nfc = ACR122U()
        print(f"  {green('✓')} Found: {nfc.get_reader_name()}")
    except (ACR122UNotFound, ImportError) as e:
        print(f"  {red('✗')} {e}")
        sys.exit(1)

    print()
    print(dim("  Place NFC tags on reader one at a time."))
    print(dim("  Press Ctrl+C to stop."))
    print_separator()

    # Run selected mode
    if mode == "REASSIGN":
        count = run_reassign(api, nfc)
        label = "reassigned"
    elif mode == "AUDIT":
        count = run_audit(api, nfc)
        label = "audited"
    else:
        written, skipped, errors = run_normal(api, nfc)
        count = written

    # Session summary
    print()
    print(green("╔════════════════════════════════════════╗"))
    print(green("║   SESSION COMPLETE                     ║"))
    if mode == "NORMAL":
        print(green(f"║   Tags written:    {written:<20}║"))
        print(green(f"║   Already existed: {skipped:<20}║"))
        print(green(f"║   Errors:          {errors:<20}║"))
    else:
        print(green(f"║   Tags {label}: {count:<20}║"))
    try:
        stats = api.get_stats()
        total = stats.get("total_active_jars", "?")
        print(green(f"║   Total in system: {str(total):<20}║"))
    except Exception:
        pass
    print(green("╚════════════════════════════════════════╝"))
    print(f"  Log saved to: {LOG_FILE}")
    print()


if __name__ == "__main__":
    main()
