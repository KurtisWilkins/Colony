# Colony-Main Development Guidelines

## UI Standards

### Help Text on Every Page
Every page in the platform MUST include contextual help text near the top explaining:
- What the page does
- How to use it
- Key concepts or terminology
- Links to related pages where relevant

Style for help text:
```jsx
<div style={{
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--color-phosphor-ghost)',
  marginBottom: 'var(--space-4)',
  lineHeight: 'var(--leading-relaxed)',
}}>
  [Help text here]
</div>
```

### Descriptive Icons
Use emoji/unicode icons on stat cards and key labels to make data scannable:
- Jars: 🫙
- Colonizing: 🌱
- Fruiting: 🍄
- Harvesting: ✂️
- Resting: 💤
- Contaminated: ⚠️
- Available: ✅
- Yield/Weight: ⚖️
- Analytics: 📊
- Temperature: 🌡️
- Humidity: 💧
- Irrigation: 🌊
- Weather: ☁️
- Security: 🔒
- Users: 👤
- Devices: 📱
- Wiring: ⚡
- Schedule: 📅
- Settings: ⚙️

### Getting Started Cards
When a page has zero data (empty state), show a "GETTING STARTED" Card with numbered steps explaining how to populate it. Only show when data count is 0.

### Empty States
Every list/table must have a meaningful empty state message in brackets:
```
[ NO DEVICES FOUND ]
[ NO JARS REGISTERED — Click + REGISTER JAR to add your first jar ]
[ NO BATCHES CREATED ]
```

## Design System

### Terminal Phosphor Green Aesthetic
- All text: monospace font (`var(--font-mono)`)
- Primary color: phosphor green (`var(--color-phosphor-primary)`)
- Labels: dim green (`var(--color-phosphor-dim)`)
- Help text: ghost green (`var(--color-phosphor-ghost)`)
- Background: dark (`var(--color-bg-base)`)
- Cards: surface (`var(--color-bg-surface)`)
- Borders: `var(--color-border)`
- Warnings: amber (`var(--color-amber)`)
- Errors: red (`var(--color-red-alert)`)

### Available UI Components
Import from `../components/ui` or `../../components/ui`:
- Button, Input, Select, Textarea, Card, Badge, Modal, Table
- StatCard, TerminalLog, ProgressBar, Toggle, Tooltip
- Breadcrumb, Loader, AlertBanner, GaugeBar, ActuatorIndicator

### Mobile Considerations
- All pages must work on mobile (768px breakpoint)
- Touch targets: minimum 44px, prefer 60px for primary actions
- Sidebar scrolls with `overflowY: auto`
- Mobile scan pages use 18px minimum font size

## API Patterns

### Frontend API Calls
All API calls use the `request()` helper in `utils/api.js`:
```javascript
const BASE = import.meta.env.VITE_API_BASE || '';
function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  };
  return fetch(url, config).then(/* ... */);
}
```

### Backend API Patterns
- All endpoints use `@login_required` decorator
- Device-specific endpoints take `<device_id>` parameter
- Use `_get_device_or_404()` helper pattern
- MQTT commands use `_publish_command()` helper
- All models have `to_dict()` method

## Firmware Patterns

### ESP32 Boot Safety
- Climate/relay pins set HIGH (off) as FIRST action in `setup()`
- Before `Serial.begin()` for relay glitch prevention
- ACTIVE LOW logic: LOW = device ON, HIGH = device OFF

### Test Mode
- Default ON for all new firmware projects
- Virtual state tracking (no physical activation)
- All telemetry payloads include `test_mode: true/false`
- Rich serial output with `[TEST]` prefix

### NVS Storage
- Namespace per device type: `"growtent"`, `"irrigation"`, `"rfid_reader"`
- Keys limited to 15 characters
- Load with defaults, save immediately on change

## File Organization

### Firmware Projects
```
firmware-{name}/
├── platformio.ini
├── src/*.h, *.cpp
└── arduino/{name}/{name}.ino
```

### Frontend Pages
```
src/pages/              — Top-level pages (Dashboard, Login, etc.)
src/pages/irrigation/   — Irrigation-specific pages
src/pages/inventory/    — Mushroom inventory pages
src/pages/admin/        — Admin-only pages
src/pages/user/         — User account pages
src/pages/management/   — Facility/building/unit management
```

### Backend Routes
```
backend/routes/
├── auth.py              — Authentication
├── automation_api.py    — Grow tent control + thresholds
├── climate.py           — Climate control
├── commands.py          — Device commands
├── devices.py           — Device CRUD
├── hierarchy.py         — Hierarchy browsing
├── hierarchy_mgmt.py    — Hierarchy management
├── irrigation.py        — Irrigation controller
├── mushroom_inventory.py — Jar inventory
├── telemetry.py         — Telemetry data
├── users.py             — User management
└── device_credentials.py — MQTT credentials
```
