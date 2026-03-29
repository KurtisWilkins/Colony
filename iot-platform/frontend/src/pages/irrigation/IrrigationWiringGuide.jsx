import React, { useState } from 'react';
import { Button, Card, AlertBanner, Badge } from '../../components/ui';

const sectionIds = ['parts', 'power', 'relay', 'solenoid', 'gpio', 'firmware'];

const partsData = [
  { part: 'ESP32-WROOM-32D DevKit', qty: '1', search: 'ESP32 DevKit V1 38-pin' },
  { part: 'SainSmart 16-channel 5V relay module', qty: '1', search: 'SainSmart 16 channel relay module 5V' },
  { part: '12V DC solenoid valve NC 3/4"', qty: '16', search: '12V solenoid valve NC 3/4 NPT irrigation' },
  { part: '12V 10A DC power supply', qty: '1', search: '12V 10A DC switching power supply' },
  { part: 'Terminal block strip 12-pos', qty: '2', search: '12 position barrier terminal block' },
  { part: '22AWG hookup wire (assorted)', qty: '1', search: '22AWG hookup wire kit stranded' },
  { part: 'Waterproof junction box IP65', qty: '1', search: 'IP65 waterproof electrical junction box large' },
  { part: 'Cable glands PG7', qty: '20', search: 'PG7 cable gland waterproof' },
  { part: 'Fuse holder + 10A fuse', qty: '1', search: 'inline fuse holder 10A automotive' },
];

const relayGpioMap = [
  { relay: 1, gpio: 13 },
  { relay: 2, gpio: 12 },
  { relay: 3, gpio: 14 },
  { relay: 4, gpio: 27 },
  { relay: 5, gpio: 26 },
  { relay: 6, gpio: 25 },
  { relay: 7, gpio: 33 },
  { relay: 8, gpio: 32 },
  { relay: 9, gpio: 23 },
  { relay: 10, gpio: 22 },
  { relay: 11, gpio: 21 },
  { relay: 12, gpio: 19 },
  { relay: 13, gpio: 18 },
  { relay: 14, gpio: 5 },
  { relay: 15, gpio: 4 },
  { relay: 16, gpio: 2 },
];

const gpioData = relayGpioMap.map((r) => ({
  gpio: String(r.gpio),
  relay: String(r.relay),
  dir: 'OUT',
  zone: `Zone ${r.relay} (configurable)`,
  notes: r.gpio === 2 ? 'Onboard LED — may flash during boot' : '',
}));

const firmwareFileNames = [
  'config.h',
  'relays.cpp',
  'zone_manager.cpp',
  'mqtt_client.cpp',
  'scheduler.cpp',
  'main.cpp',
];

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
  legend: {
    display: 'flex',
    gap: 'var(--space-4)',
    marginTop: 'var(--space-3)',
    marginBottom: 'var(--space-6)',
    fontSize: 'var(--text-sm)',
    flexWrap: 'wrap',
  },
  legendItem: (color) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    color,
  }),
  legendDot: (color) => ({
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: color,
    boxShadow: `0 0 6px ${color}`,
    flexShrink: 0,
  }),
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
  wireLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    lineHeight: 1.8,
  },
  wirePin: {
    color: 'var(--color-cyan-accent)',
    fontWeight: 'bold',
  },
  sensorBlock: {
    marginBottom: 'var(--space-6)',
  },
  sensorTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.25rem',
    color: 'var(--color-amber)',
    marginBottom: 'var(--space-2)',
    letterSpacing: '0.05em',
  },
  note: {
    color: 'var(--color-phosphor-dim)',
    fontSize: 'var(--text-sm)',
    fontStyle: 'italic',
    marginTop: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
  },
  pre: {
    background: 'var(--color-bg-input)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-4)',
    overflowX: 'auto',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    lineHeight: 1.6,
    whiteSpace: 'pre',
    margin: 0,
  },
  codeViewer: {
    background: 'var(--color-bg-input)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-4)',
    overflowX: 'auto',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    lineHeight: 1.6,
    maxHeight: 500,
    overflowY: 'auto',
    whiteSpace: 'pre',
    color: 'var(--color-phosphor-primary)',
  },
  fileButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-4)',
  },
  cardSpacing: {
    marginBottom: 'var(--space-6)',
  },
  ul: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  li: {
    padding: 'var(--space-1) 0',
    fontSize: 'var(--text-sm)',
    lineHeight: 1.6,
  },
  bullet: {
    color: 'var(--color-phosphor-dim)',
    marginRight: 'var(--space-2)',
  },
};

function WireConnection({ from, to, note }) {
  return (
    <div style={styles.li}>
      <span style={styles.bullet}>&gt;</span>
      <span style={styles.wirePin}>{from}</span>
      <span style={{ color: '#666' }}>{' \u2192 '}</span>
      <span style={styles.wirePin}>{to}</span>
      {note && <span style={{ color: 'var(--color-phosphor-dim)' }}>{' \u2014 '}{note}</span>}
    </div>
  );
}

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

function IrrigationWiringGuide() {
  const [openSections, setOpenSections] = useState(() => {
    const map = {};
    sectionIds.forEach((id) => { map[id] = true; });
    return map;
  });
  const [activeFile, setActiveFile] = useState(firmwareFileNames[0]);
  const [firmwareFiles, setFirmwareFiles] = useState({});
  const [firmwareLoading, setFirmwareLoading] = useState(false);
  const [firmwareError, setFirmwareError] = useState(null);
  const [copyLabel, setCopyLabel] = useState('COPY TO CLIPBOARD');

  const toggleSection = (id) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Load firmware files on demand when firmware section is opened
  const loadFirmwareFile = (filename) => {
    if (firmwareFiles[filename]) {
      setActiveFile(filename);
      return;
    }
    setActiveFile(filename);
    setFirmwareLoading(true);
    setFirmwareError(null);
    fetch(`/api/firmware/irrigation/file/${encodeURIComponent(filename)}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load file');
        return r.text();
      })
      .then((text) => {
        setFirmwareFiles((prev) => ({ ...prev, [filename]: text }));
        setFirmwareLoading(false);
      })
      .catch((err) => {
        setFirmwareError(err.message);
        setFirmwareLoading(false);
      });
  };

  const handleCopy = () => {
    const content = firmwareFiles[activeFile];
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopyLabel('COPIED!');
      setTimeout(() => setCopyLabel('COPY TO CLIPBOARD'), 2000);
    });
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <h1 style={styles.title}>IRRIGATION WIRING GUIDE</h1>
      <div style={styles.subtitle}>16-Zone Irrigation Controller — ESP32-WROOM-32D</div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-phosphor-ghost)', marginBottom: 'var(--space-4)', lineHeight: 'var(--leading-relaxed)' }}>
        {'⚡'} Wiring reference for the 16-zone irrigation controller. Follow these diagrams to connect the SainSmart relay module to solenoid valves. ACTIVE LOW logic — all pins boot HIGH to prevent valves opening on startup.
      </div>

      {/* Wire color legend */}
      <div style={styles.legend}>
        <div style={styles.legendItem('#ff3131')}>
          <span style={styles.legendDot('#ff3131')} />
          Red = 12V Power
        </div>
        <div style={styles.legendItem('#666')}>
          <span style={styles.legendDot('#666')} />
          Gray = Ground
        </div>
        <div style={styles.legendItem('#00fff7')}>
          <span style={styles.legendDot('#00fff7')} />
          Cyan = Signal / GPIO
        </div>
        <div style={styles.legendItem('#f0c040')}>
          <span style={styles.legendDot('#f0c040')} />
          Yellow = Solenoid Wires
        </div>
      </div>

      {/* Section 1: Parts List */}
      <CollapsibleSection id="parts" title="PARTS LIST" open={openSections.parts} onToggle={toggleSection}>
        <Card title="PARTS LIST">
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
                {partsData.map((row, i) => (
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

      {/* Section 2: Power Wiring */}
      <CollapsibleSection id="power" title="POWER WIRING" open={openSections.power} onToggle={toggleSection}>
        <Card title="POWER WIRING">
          <pre style={styles.pre}>
            <span style={{ color: '#ff3131' }}>12V DC Supply</span>{' \u2500\u2500> '}<span style={{ color: '#f0c040' }}>FUSE (10A)</span>{' \u2500\u2500> '}<span style={{ color: '#00fff7' }}>Relay COM terminals</span>{' \u2500\u2500> solenoid valves\n'}
            {'                  \u2502\n'}
            {'                  \u2514\u2500\u2500 '}<span style={{ color: '#666' }}>12V GND</span>{' \u2500\u2500> '}<span style={{ color: '#666' }}>Solenoid return wires + ESP32 GND (common ground)</span>{'\n'}
            {'\n'}
            <span style={{ color: '#ff3131' }}>USB 5V</span>{' \u2500\u2500\u2500\u2500\u2500> '}<span style={{ color: '#00fff7' }}>ESP32-WROOM-32D</span>{'\n'}
            {'                  \u2502\n'}
            {'                  \u251C\u2500\u2500 '}<span style={{ color: '#ff3131' }}>VIN (5V)</span>{' \u2500\u2500> '}<span style={{ color: '#00fff7' }}>Relay module VCC</span>{'\n'}
            {'                  \u2502\n'}
            {'                  \u2514\u2500\u2500 '}<span style={{ color: '#666' }}>GND</span>{' \u2500\u2500\u2500\u2500> '}<span style={{ color: '#666' }}>Relay module GND + 12V supply GND (common ground)</span>
          </pre>

          <ul style={{ ...styles.ul, marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> 12V DC supply powers solenoid valves through relay NO (normally open) contacts</li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> ESP32 powered via USB (5V)</li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> Relay module VCC connects to ESP32 VIN (5V)</li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> Relay module GND connects to ESP32 GND</li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> 12V supply negative <span style={{ color: 'var(--color-red-alert)', fontWeight: 'bold' }}>MUST</span> share common ground with ESP32</li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> <span style={{ color: 'var(--color-red-alert)', fontWeight: 'bold' }}>ALWAYS</span> install a fuse on the 12V supply line</li>
          </ul>

          <AlertBanner variant="error">
            NEVER connect 12V directly to ESP32 pins. The 12V supply is for solenoid valves ONLY, routed through relay contacts.
          </AlertBanner>
        </Card>
      </CollapsibleSection>

      {/* Section 3: Relay Wiring */}
      <CollapsibleSection id="relay" title="RELAY WIRING" open={openSections.relay} onToggle={toggleSection}>
        <Card title="16-CHANNEL RELAY TO ESP32 WIRING">
          <div style={styles.note}>
            Each relay input pin connects to an ESP32 GPIO. The relay module uses ACTIVE LOW logic.
          </div>

          <div style={{ overflowX: 'auto', marginBottom: 'var(--space-4)' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Relay #</th>
                  <th style={styles.th}>GPIO Pin</th>
                  <th style={styles.th}>Zone</th>
                </tr>
              </thead>
              <tbody>
                {relayGpioMap.map((r, i) => (
                  <tr key={i}>
                    <td style={{ ...styles.td(i % 2 === 0), fontWeight: 'bold' }}>Relay {r.relay}</td>
                    <td style={{ ...styles.td(i % 2 === 0), color: 'var(--color-cyan-accent)', fontWeight: 'bold' }}>GPIO {r.gpio}</td>
                    <td style={{ ...styles.td(i % 2 === 0), color: 'var(--color-phosphor-dim)' }}>Zone {r.relay} (configurable)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <AlertBanner variant="info">
            ACTIVE LOW logic: LOW = valve OPEN, HIGH = valve CLOSED. All pins are set HIGH on boot to prevent valves from opening during startup.
          </AlertBanner>

          <div style={{ marginTop: 'var(--space-4)' }}>
            <div style={styles.sensorTitle}>Wiring Each Relay Input</div>
            <WireConnection from="Relay IN1" to="ESP32 GPIO 13" note="Zone 1" />
            <WireConnection from="Relay IN2" to="ESP32 GPIO 12" note="Zone 2" />
            <WireConnection from="Relay IN3" to="ESP32 GPIO 14" note="Zone 3" />
            <WireConnection from="Relay IN4" to="ESP32 GPIO 27" note="Zone 4" />
            <WireConnection from="Relay IN5" to="ESP32 GPIO 26" note="Zone 5" />
            <WireConnection from="Relay IN6" to="ESP32 GPIO 25" note="Zone 6" />
            <WireConnection from="Relay IN7" to="ESP32 GPIO 33" note="Zone 7" />
            <WireConnection from="Relay IN8" to="ESP32 GPIO 32" note="Zone 8" />
            <WireConnection from="Relay IN9" to="ESP32 GPIO 23" note="Zone 9" />
            <WireConnection from="Relay IN10" to="ESP32 GPIO 22" note="Zone 10" />
            <WireConnection from="Relay IN11" to="ESP32 GPIO 21" note="Zone 11" />
            <WireConnection from="Relay IN12" to="ESP32 GPIO 19" note="Zone 12" />
            <WireConnection from="Relay IN13" to="ESP32 GPIO 18" note="Zone 13" />
            <WireConnection from="Relay IN14" to="ESP32 GPIO 5" note="Zone 14" />
            <WireConnection from="Relay IN15" to="ESP32 GPIO 4" note="Zone 15" />
            <WireConnection from="Relay IN16" to="ESP32 GPIO 2" note="Zone 16" />
          </div>
        </Card>
      </CollapsibleSection>

      {/* Section 4: Solenoid Valve Wiring */}
      <CollapsibleSection id="solenoid" title="SOLENOID VALVE WIRING" open={openSections.solenoid} onToggle={toggleSection}>
        <Card title="SOLENOID VALVE WIRING">
          <div style={styles.sensorBlock}>
            <div style={styles.sensorTitle}>Each Valve to Relay Connection</div>
            <WireConnection from="12V positive" to="Relay COM terminal" note="through fuse, shared bus" />
            <WireConnection from="Relay NO terminal" to="Valve wire 1" />
            <WireConnection from="Valve wire 2" to="12V negative" note="shared ground bus" />
          </div>

          <pre style={styles.pre}>
            <span style={{ color: '#ff3131' }}>12V+</span>{' \u2500\u2500> '}<span style={{ color: '#f0c040' }}>FUSE</span>{' \u2500\u2500> '}<span style={{ color: '#00fff7' }}>Terminal Block (12V bus)</span>{'\n'}
            {'                              \u2502\n'}
            {'              \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n'}
            {'              \u2502              \u2502              \u2502\n'}
            {'        '}<span style={{ color: '#00fff7' }}>Relay 1 COM</span>{'   '}<span style={{ color: '#00fff7' }}>Relay 2 COM</span>{'   '}<span style={{ color: '#00fff7' }}>Relay N COM</span>{'\n'}
            {'        '}<span style={{ color: '#00fff7' }}>Relay 1 NO</span>{'    '}<span style={{ color: '#00fff7' }}>Relay 2 NO</span>{'    '}<span style={{ color: '#00fff7' }}>Relay N NO</span>{'\n'}
            {'              \u2502              \u2502              \u2502\n'}
            {'        '}<span style={{ color: '#f0c040' }}>Valve 1</span>{'       '}<span style={{ color: '#f0c040' }}>Valve 2</span>{'       '}<span style={{ color: '#f0c040' }}>Valve N</span>{'\n'}
            {'              \u2502              \u2502              \u2502\n'}
            {'              \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n'}
            {'                              \u2502\n'}
            {'                       '}<span style={{ color: '#666' }}>12V GND bus</span>
          </pre>

          <ul style={{ ...styles.ul, marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> Each valve connects to a relay's NO (Normally Open) and COM (Common) terminals</li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> 12V positive goes to relay COM terminal (shared 12V bus via terminal block)</li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> Valve wire 1 connects to relay NO terminal</li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> Valve wire 2 connects to 12V negative (shared ground bus)</li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> Solenoid valves are <span style={{ fontWeight: 'bold' }}>not polarized</span> — wire direction doesn't matter</li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> Use weatherproof wire nuts or waterproof connectors for outdoor runs</li>
          </ul>

          <AlertBanner variant="warning">
            Use IP65-rated waterproof connectors for all outdoor valve wiring. Bare connections exposed to moisture will corrode and fail.
          </AlertBanner>
        </Card>
      </CollapsibleSection>

      {/* Section 5: GPIO Reference Table */}
      <CollapsibleSection id="gpio" title="GPIO REFERENCE" open={openSections.gpio} onToggle={toggleSection}>
        <Card title="GPIO REFERENCE">
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>GPIO</th>
                  <th style={styles.th}>Relay</th>
                  <th style={styles.th}>Dir</th>
                  <th style={styles.th}>Default Zone</th>
                  <th style={styles.th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {gpioData.map((row, i) => (
                  <tr key={i}>
                    <td style={{ ...styles.td(i % 2 === 0), color: 'var(--color-cyan-accent)', fontWeight: 'bold' }}>{row.gpio}</td>
                    <td style={{ ...styles.td(i % 2 === 0), fontWeight: 'bold' }}>Relay {row.relay}</td>
                    <td style={styles.td(i % 2 === 0)}>
                      <Badge variant="online">{row.dir}</Badge>
                    </td>
                    <td style={styles.td(i % 2 === 0)}>{row.zone}</td>
                    <td style={{ ...styles.td(i % 2 === 0), color: row.notes ? 'var(--color-amber)' : 'var(--color-phosphor-dim)' }}>
                      {row.notes || '\u2014'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ ...styles.note, marginTop: 'var(--space-4)' }}>
            All 16 GPIOs are output-only for relay control. Input-only pins (34, 35, 36, 39) are avoided.
            GPIO 2 has an onboard LED that may flash during the ESP32 boot sequence.
          </div>
        </Card>
      </CollapsibleSection>

      {/* Section 6: Firmware Code Viewer */}
      <CollapsibleSection id="firmware" title="FIRMWARE — ESP32" open={openSections.firmware} onToggle={toggleSection}>
        <Card title="FIRMWARE — IRRIGATION CONTROLLER">
          <div style={styles.fileButtons}>
            {firmwareFileNames.map((filename) => (
              <Button
                key={filename}
                size="sm"
                variant={activeFile === filename ? 'primary' : 'secondary'}
                onClick={() => loadFirmwareFile(filename)}
                style={activeFile === filename ? { background: 'rgba(0,255,65,0.12)', boxShadow: 'var(--glow-sm)' } : {}}
              >
                {filename}
              </Button>
            ))}
          </div>

          <pre style={styles.codeViewer}>
            <code>
              {firmwareLoading
                ? 'Loading...'
                : firmwareError
                  ? `Error: ${firmwareError}`
                  : firmwareFiles[activeFile] || 'Select a file to view its contents.'}
            </code>
          </pre>

          <div style={{ marginTop: 'var(--space-3)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button size="sm" variant="secondary" onClick={() => {
              fetch('/api/firmware/irrigation/download', { credentials: 'include' })
                .then((r) => {
                  if (!r.ok) throw new Error('Download failed');
                  return r.blob();
                })
                .then((blob) => {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'irrigation-firmware.zip';
                  a.click();
                  URL.revokeObjectURL(url);
                })
                .catch((err) => alert(err.message));
            }}>
              DOWNLOAD ZIP
            </Button>
            <Button size="sm" variant={copyLabel === 'COPIED!' ? 'amber' : 'primary'} onClick={handleCopy}>
              {copyLabel}
            </Button>
          </div>
        </Card>
      </CollapsibleSection>
    </div>
  );
}

export default IrrigationWiringGuide;
