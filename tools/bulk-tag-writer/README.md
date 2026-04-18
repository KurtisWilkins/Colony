# Colony-Main Bulk NFC Tag Writer

Register and write NFC tags for the mushroom jar inventory system using an ACR122U USB reader/writer.

## Hardware Required

- **ACR122U USB NFC Reader/Writer** (~$30-40)
  Search: "ACR122U USB NFC reader writer"
- **NTAG215 NFC sticker tags** (25mm round recommended)
  Search: "NTAG215 NFC sticker 25mm round 50 pack"
- Computer with USB port (Windows, Mac, or Linux)

## Software Setup

### Windows
1. Install Python 3.x from [python.org](https://python.org) — check "Add Python to PATH"
2. Install dependencies:
   ```
   pip install pyscard requests colorama ndef
   ```
3. PC/SC Smart Card service must be running (default on Windows 10/11)

### Mac
```bash
brew install pcsc-lite python3
pip3 install pyscard requests colorama ndef
```

### Linux (Raspberry Pi or Ubuntu)
```bash
sudo apt install pcscd pcsc-tools python3-pip python3-pyscard
sudo systemctl enable pcscd && sudo systemctl start pcscd
pip3 install requests colorama ndef
```

## Configuration

Edit `config.py`:
- `SERVER_URL`: your Colony-Main server URL
- `USERNAME`: your admin username
- `JAR_DEFAULTS`: default jar specs (size, material, lid type)

## Running

### Normal mode — register and write new tags
```
python bulk_writer.py
```

### Reassign mode — move tag to a new jar record
```
python bulk_writer.py --reassign
```

### Audit mode — read-only tag lookup
```
python bulk_writer.py --audit
```

## Workflow for 50 Tags

1. Plug in ACR122U
2. Run: `python bulk_writer.py`
3. Enter your password when prompted
4. Place first tag on reader
5. Wait for green confirmation and beep (1 long beep = success)
6. Remove tag, place next tag
7. Repeat until done
8. Press Ctrl+C to see session summary

## Beep Signals

| Signal | Meaning |
|--------|---------|
| 1 long beep | Success — tag registered and written |
| 2 short beeps | Skipped — tag already registered |
| 3 short beeps | Error — check screen for details |

## Tag Placement on Jars

- **Location**: bottom of jar, centered
- **Adhesive**: 3M VHB tape 4910 (dishwasher safe)
- **Alternative**: clear silicone sealant around tag edge
- Let adhesive cure 24 hours before first wash
- Test phone scan before putting jar into rotation
- Tags survive dishwasher cycles indefinitely
- Test 3 tags in autoclave before committing to autoclave workflow

## Speed

At 5-8 seconds per tag, a single operator can process 500+ tags per hour.

## CSV Log

Every operation is logged to `tag_log.csv`:
```
timestamp, tag_uid, jar_id, status, url, notes
2026-01-15 14:23:11, 04A32F12BC4480, jar-uuid, SUCCESS, https://...
2026-01-15 14:23:19, 04B44A22CD5591, jar-uuid, SUCCESS, https://...
2026-01-15 14:23:27, 04C55B33DE6602, ,         SKIPPED, , already registered
```

The log appends — it never overwrites. This gives a complete history.

## Troubleshooting

### Reader not found
- Unplug and replug ACR122U
- Windows: check Device Manager for "ACS ACR122U"
- Linux: `sudo systemctl start pcscd`
- Try running as Administrator/sudo

### Write failed
- Tag may be locked — try a different tag
- Ensure tag is flat on reader center
- Remove nearby metal objects

### Login failed
- Check `SERVER_URL` in config.py
- Verify server is running: `curl https://shroomlord.3utilities.com/api/health`
- Check username and password
