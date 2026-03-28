import React, { useState } from 'react';
import { Button, Card, Select, AlertBanner, Badge } from '../../components/ui';

const CHIPS = {
  wroom32d: {
    value: 'wroom32d',
    label: 'ESP32-WROOM-32D (standard DevKit)',
  },
  s2: {
    value: 's2',
    label: 'Olimex ESP32-S2-DevKit-Lipo',
  },
};

const chipOptions = [CHIPS.wroom32d, CHIPS.s2];

const STORAGE_KEY = 'irrigation-wiring-chip';

const sectionIds = ['overview', 'pinmap', 'power', 'warnings', 'parts', 'firmware'];

/* ── Board specs ── */
const boardSpecs = {
  wroom32d: [
    { label: 'Chip', value: 'ESP32-D0WD-V3 dual core 240MHz' },
    { label: 'WiFi', value: '802.11 b/g/n 2.4GHz built-in antenna' },
    { label: 'Bluetooth', value: 'BLE 4.2 + Classic' },
    { label: 'GPIO', value: '34 usable' },
    { label: 'Flash', value: '4MB' },
    { label: 'RAM', value: '520KB' },
    { label: 'USB', value: 'CP2102 bridge (driver needed)' },
    { label: 'Power', value: '5V USB, 3.3V logic' },
  ],
  s2: [
    { label: 'Chip', value: 'ESP32-S2 single core 240MHz' },
    { label: 'WiFi', value: '802.11 b/g/n + external antenna' },
    { label: 'Bluetooth', value: 'NONE' },
    { label: 'GPIO', value: '43 usable' },
    { label: 'Flash', value: '4MB' },
    { label: 'RAM', value: '320KB + 2MB PSRAM' },
    { label: 'USB', value: 'Native USB-C (no driver)' },
    { label: 'Power', value: 'USB-C + LiPo battery connector' },
  ],
};

/* ── Pin mapping ── */
const wroomPins = [
  { relay: 1, zone: 1, gpio: 13, notes: '' },
  { relay: 2, zone: 2, gpio: 12, notes: 'Boot-sensitive — strapping pin' },
  { relay: 3, zone: 3, gpio: 14, notes: '' },
  { relay: 4, zone: 4, gpio: 27, notes: '' },
  { relay: 5, zone: 5, gpio: 26, notes: '' },
  { relay: 6, zone: 6, gpio: 25, notes: '' },
  { relay: 7, zone: 7, gpio: 33, notes: '' },
  { relay: 8, zone: 8, gpio: 32, notes: '' },
  { relay: 9, zone: 9, gpio: 23, notes: '' },
  { relay: 10, zone: 10, gpio: 22, notes: '' },
  { relay: 11, zone: 11, gpio: 21, notes: '' },
  { relay: 12, zone: 12, gpio: 19, notes: '' },
  { relay: 13, zone: 13, gpio: 18, notes: '' },
  { relay: 14, zone: 14, gpio: 5, notes: 'Boot-sensitive — strapping pin' },
  { relay: 15, zone: 15, gpio: 4, notes: '' },
  { relay: 16, zone: 16, gpio: 2, notes: 'Boot-sensitive — onboard LED' },
];

const s2Pins = Array.from({ length: 16 }, (_, i) => ({
  relay: i + 1,
  zone: i + 1,
  gpio: i + 1,
  notes: '',
}));

const pinData = {
  wroom32d: wroomPins,
  s2: s2Pins,
};

/* ── Parts lists ── */
const partsLists = {
  wroom32d: [
    { part: 'ESP32-WROOM-32D DevKit', qty: '1', search: 'ESP32 DevKit V1 38-pin' },
    { part: '16-channel 5V relay module', qty: '1', search: 'SainSmart 16 channel relay module 5V' },
    { part: '12V 10A DC power supply', qty: '1', search: '12V 10A DC switching power supply' },
    { part: 'USB Micro-B to USB-A adapter', qty: '1', search: 'USB Micro-B data cable' },
    { part: '22AWG hookup wire kit', qty: '1', search: '22AWG hookup wire kit stranded assorted' },
    { part: 'Dupont jumper wires M-F', qty: '1', search: 'dupont jumper wire kit male female' },
  ],
  s2: [
    { part: 'Olimex ESP32-S2-DevKit-Lipo', qty: '1', search: 'Olimex ESP32-S2-DevKit-Lipo' },
    { part: 'External 2.4GHz antenna + U.FL pigtail', qty: '1', search: '2.4GHz antenna U.FL IPEX pigtail' },
    { part: '16-channel 5V relay module', qty: '1', search: 'SainSmart 16 channel relay module 5V' },
    { part: '12V 10A DC power supply', qty: '1', search: '12V 10A DC switching power supply' },
    { part: '3.7V LiPo battery (optional)', qty: '1', search: '3.7V LiPo battery JST connector' },
    { part: 'USB-C cable', qty: '1', search: 'USB-C data cable' },
    { part: '22AWG hookup wire kit', qty: '1', search: '22AWG hookup wire kit stranded assorted' },
  ],
};

/* ── Firmware endpoints ── */
const firmwareEndpoints = {
  wroom32d: '/api/firmware/irrigation-wroom32d/download',
  s2: '/api/firmware/irrigation-s2/download',
};

const firmwareFileNames = {
  wroom32d: 'irrigation-wroom32d-firmware.zip',
  s2: 'irrigation-s2-firmware.zip',
};

/* ── Styles ── */
const styles = {
  page: {
    maxWidth: 960,
    margin: '0 auto',
    padding: 'var(--space-4)',
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-phosphor-primary)',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '2.5rem',
    textShadow: 'var(--glow-text)',
    margin: 0,
    letterSpacing: '0.15em',
  },
  subtitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-phosphor-dim)',
    marginTop: 'var(--space-2)',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    padding: 'var(--space-3) 0',
    userSelect: 'none',
    borderBottom: '1px solid var(--color-border)',
    marginBottom: 'var(--space-4)',
  },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.5rem',
    textShadow: 'var(--glow-text)',
    letterSpacing: '0.1em',
  },
  chevron: {
    fontSize: '1rem',
    color: 'var(--color-phosphor-dim)',
    transition: 'transform 0.2s',
  },
  cardSpacing: {
    marginBottom: 'var(--space-6)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
  },
  th: {
    textAlign: 'left',
    padding: 'var(--space-2) var(--space-3)',
    borderBottom: '1px solid var(--color-phosphor-dim)',
    color: 'var(--color-phosphor-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    fontSize: 'var(--text-xs)',
  },
  td: (isEven) => ({
    padding: 'var(--space-2) var(--space-3)',
    background: isEven ? 'rgba(0,255,65,0.03)' : 'transparent',
    borderBottom: '1px solid var(--color-border)',
  }),
  specGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-3)',
  },
  specItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },
  specLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  specValue: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-primary)',
  },
  bullet: {
    color: 'var(--color-phosphor-dim)',
    marginRight: 'var(--space-2)',
  },
  li: {
    padding: 'var(--space-1) 0',
    fontSize: 'var(--text-sm)',
    lineHeight: 1.6,
  },
  ul: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  note: {
    color: 'var(--color-phosphor-dim)',
    fontSize: 'var(--text-sm)',
    fontStyle: 'italic',
    marginTop: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
  },
  chipSelector: {
    marginTop: 'var(--space-4)',
    marginBottom: 'var(--space-6)',
    maxWidth: 420,
  },
};

/* ── Helpers ── */
function CollapsibleSection({ id, title, open, onToggle, children }) {
  return (
    <div style={styles.cardSpacing}>
      <div style={styles.sectionHeader} onClick={() => onToggle(id)}>
        <span style={styles.sectionTitle}>{title}</span>
        <span style={{ ...styles.chevron, transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
          {open ? '\u25BC' : '\u25B6'}
        </span>
      </div>
      {open && children}
    </div>
  );
}

/* ── Main component ── */
function IrrigationWiringGuideNew() {
  const [chip, setChip] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'wroom32d' || stored === 's2') return stored;
    } catch { /* ignore */ }
    return 'wroom32d';
  });

  const [openSections, setOpenSections] = useState(() => {
    const map = {};
    sectionIds.forEach((id) => { map[id] = true; });
    return map;
  });

  const toggleSection = (id) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleChipChange = (e) => {
    const val = e.target.value;
    setChip(val);
    try { localStorage.setItem(STORAGE_KEY, val); } catch { /* ignore */ }
  };

  const isWroom = chip === 'wroom32d';
  const chipLabel = isWroom ? 'ESP32-WROOM-32D' : 'Olimex ESP32-S2-DevKit-Lipo';

  const handleDownload = () => {
    fetch(firmwareEndpoints[chip], { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('Download failed');
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = firmwareFileNames[chip];
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((err) => alert(err.message));
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <h1 style={styles.title}>IRRIGATION WIRING GUIDE</h1>
      <div style={styles.subtitle}>16-Zone Irrigation Controller — {chipLabel}</div>

      {/* Chip Selector */}
      <div style={styles.chipSelector}>
        <Select
          label="SELECT YOUR BOARD"
          id="chip-selector"
          value={chip}
          onChange={handleChipChange}
          options={chipOptions}
        />
      </div>

      {/* Section 1: Board Overview */}
      <CollapsibleSection id="overview" title="BOARD OVERVIEW" open={openSections.overview} onToggle={toggleSection}>
        <Card title={`BOARD OVERVIEW — ${chipLabel}`}>
          <div style={styles.specGrid}>
            {boardSpecs[chip].map((spec, i) => (
              <div key={i} style={styles.specItem}>
                <span style={styles.specLabel}>{spec.label}</span>
                <span style={styles.specValue}>{spec.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </CollapsibleSection>

      {/* Section 2: Pin Mapping Table */}
      <CollapsibleSection id="pinmap" title="PIN MAPPING TABLE" open={openSections.pinmap} onToggle={toggleSection}>
        <Card title={`PIN MAPPING — ${chipLabel}`}>
          {!isWroom && (
            <div style={styles.note}>
              Clean sequential GPIO mapping — no boot-sensitive pins to worry about.
            </div>
          )}
          {isWroom && (
            <div style={styles.note}>
              Some GPIOs are boot-sensitive strapping pins. Notes in amber below.
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Relay #</th>
                  <th style={styles.th}>Zone #</th>
                  <th style={styles.th}>GPIO Pin</th>
                  <th style={styles.th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {pinData[chip].map((row, i) => (
                  <tr key={i}>
                    <td style={{ ...styles.td(i % 2 === 0), fontWeight: 'bold' }}>Relay {row.relay}</td>
                    <td style={styles.td(i % 2 === 0)}>Zone {row.zone}</td>
                    <td style={{ ...styles.td(i % 2 === 0), color: 'var(--color-cyan-accent)', fontWeight: 'bold' }}>GPIO {row.gpio}</td>
                    <td style={{ ...styles.td(i % 2 === 0), color: row.notes ? 'var(--color-amber)' : 'var(--color-phosphor-dim)' }}>
                      {row.notes || '\u2014'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </CollapsibleSection>

      {/* Section 3: Power Wiring */}
      <CollapsibleSection id="power" title="POWER WIRING" open={openSections.power} onToggle={toggleSection}>
        <Card title="POWER WIRING">
          <ul style={{ ...styles.ul, marginBottom: 'var(--space-4)' }}>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> 12V DC supply connects to relay COM terminals, then to solenoid valves</li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> ESP32 powered via USB (5V)</li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> Relay module VCC connects to ESP32 5V pin</li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> Common GND between 12V supply and ESP32 is <span style={{ color: 'var(--color-red-alert)', fontWeight: 'bold' }}>REQUIRED</span></li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> <span style={{ color: 'var(--color-red-alert)', fontWeight: 'bold' }}>FUSE</span> the 12V line — always</li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> <span style={{ color: 'var(--color-red-alert)', fontWeight: 'bold' }}>NEVER</span> connect 12V to ESP32 pins</li>
          </ul>

          {!isWroom && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <AlertBanner variant="info">
                The Olimex S2 has an onboard LiPo battery connector with charging circuit. Use a 3.7V single-cell LiPo only.
                The board charges the battery via USB-C and can run from battery when USB is disconnected.
              </AlertBanner>
            </div>
          )}

          <AlertBanner variant="error">
            NEVER connect 12V directly to ESP32 pins. The 12V supply is for solenoid valves ONLY, routed through relay contacts.
          </AlertBanner>
        </Card>
      </CollapsibleSection>

      {/* Section 4: Important Warnings */}
      <CollapsibleSection id="warnings" title="IMPORTANT WARNINGS" open={openSections.warnings} onToggle={toggleSection}>
        <Card title="IMPORTANT WARNINGS">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {/* Both chips */}
            <AlertBanner variant="warning">
              ACTIVE LOW relay logic: GPIO LOW = relay ON (valve OPEN), GPIO HIGH = relay OFF (valve CLOSED).
              All pins are set HIGH on boot to prevent accidental valve activation.
            </AlertBanner>
            <AlertBanner variant="warning">
              12V power supply and ESP32 MUST share a common GND connection. Floating grounds will cause unreliable relay switching.
            </AlertBanner>
            <AlertBanner variant="info">
              Test mode is ON by default in firmware. All zones will cycle briefly on first boot to verify wiring.
            </AlertBanner>

            {/* WROOM-32D only */}
            {isWroom && (
              <>
                <AlertBanner variant="info">
                  GPIO 12 is a boot strapping pin. If pulled HIGH during boot, the ESP32 may fail to start. Ensure relay module does not pull this pin HIGH at power-on.
                </AlertBanner>
                <AlertBanner variant="info">
                  GPIO 2 has an onboard LED. It may flash during boot and when relay 16 is toggled. This is normal.
                </AlertBanner>
              </>
            )}

            {/* S2 only */}
            {!isWroom && (
              <>
                <AlertBanner variant="info">
                  Native USB — no BOOT button press required for flashing. The board enters download mode automatically.
                </AlertBanner>
                <AlertBanner variant="info">
                  No Bluetooth on the ESP32-S2. If your setup requires BLE, use the WROOM-32D instead.
                </AlertBanner>
                <AlertBanner variant="warning">
                  External antenna MUST be connected before powering on the board. Transmitting without an antenna can damage the RF front-end.
                </AlertBanner>
                <AlertBanner variant="warning">
                  LiPo battery must be 3.7V single cell only. Reverse polarity WILL destroy the board instantly — check JST connector orientation.
                </AlertBanner>
              </>
            )}
          </div>
        </Card>
      </CollapsibleSection>

      {/* Section 5: Parts List */}
      <CollapsibleSection id="parts" title="PARTS LIST" open={openSections.parts} onToggle={toggleSection}>
        <Card title={`PARTS LIST — ${chipLabel}`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Part</th>
                  <th style={styles.th}>Qty</th>
                  <th style={styles.th}>Search Term</th>
                </tr>
              </thead>
              <tbody>
                {partsLists[chip].map((row, i) => (
                  <tr key={i}>
                    <td style={styles.td(i % 2 === 0)}>{row.part}</td>
                    <td style={styles.td(i % 2 === 0)}>{row.qty}</td>
                    <td style={{ ...styles.td(i % 2 === 0), color: 'var(--color-phosphor-dim)' }}>{row.search}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </CollapsibleSection>

      {/* Section 6: Firmware Download */}
      <CollapsibleSection id="firmware" title="FIRMWARE DOWNLOAD" open={openSections.firmware} onToggle={toggleSection}>
        <Card title={`FIRMWARE — ${chipLabel}`}>
          <div style={styles.note}>
            Download the pre-compiled firmware bundle for your selected board. Flash via USB using the included instructions.
          </div>
          <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'center' }}>
            <Button variant="primary" onClick={handleDownload}>
              DOWNLOAD ZIP
            </Button>
          </div>
        </Card>
      </CollapsibleSection>
    </div>
  );
}

export default IrrigationWiringGuideNew;
