import React, { useState } from 'react';
import { Button, Card, AlertBanner, Badge } from '../components/ui';
import firmwareFiles from './firmwareData';

const sectionIds = ['parts', 'power', 'sensors', 'actuators', 'gpio', 'firmware'];

const partsData = [
  { part: 'ESP32-WROOM-32D DevKit', qty: '1', search: 'ESP32 DevKit V1 38-pin' },
  { part: 'BME280 I2C breakout', qty: '1', search: 'BME280 I2C module 3.3V' },
  { part: 'MH-Z19B CO2 sensor', qty: '1', search: 'MH-Z19B CO2 sensor UART' },
  { part: 'JSN-SR04T ultrasonic', qty: '1', search: 'JSN-SR04T waterproof ultrasonic' },
  { part: 'YF-S201 flow sensor', qty: '1', search: 'YF-S201 water flow sensor' },
  { part: '4-channel relay module 5V', qty: '1', search: '4 channel opto-isolated relay 5V' },
  { part: '12V DC solenoid valve NC 1/2"', qty: '1', search: '12V solenoid valve NC 1/2 NPT' },
  { part: '12V 2A DC power supply', qty: '1', search: '12V 2A DC wall adapter' },
  { part: 'PWM to 0-10V converter', qty: '1', search: 'PWM to 0-10V analog converter' },
  { part: 'Resistor kit (1k, 2k, 10k, 4.7k)', qty: '1', search: 'resistor kit assorted values' },
  { part: 'Jumper wires', qty: '1 set', search: 'dupont jumper wire kit' },
  { part: 'Plastic junction box', qty: '1', search: 'waterproof electrical junction box' },
];

const gpioData = [
  { gpio: '21', dir: 'OUT', func: 'BME280 SDA', notes: 'I2C data' },
  { gpio: '22', dir: 'OUT', func: 'BME280 SCL', notes: 'I2C clock' },
  { gpio: '16', dir: 'OUT', func: 'MH-Z19B TX2', notes: 'UART to sensor RX' },
  { gpio: '17', dir: 'IN', func: 'MH-Z19B RX2', notes: 'UART from sensor TX' },
  { gpio: '18', dir: 'OUT', func: 'JSN-SR04T TRIG', notes: '10\u03BCs trigger pulse' },
  { gpio: '19', dir: 'IN', func: 'JSN-SR04T ECHO', notes: 'Via voltage divider' },
  { gpio: '34', dir: 'IN', func: 'YF-S201 pulse', notes: 'Input-only, ext pull-up' },
  { gpio: '25', dir: 'OUT', func: 'Fan PWM', notes: '1kHz to 0-10V converter' },
  { gpio: '26', dir: 'OUT', func: 'Relay CH1 valve', notes: 'LOW = valve open' },
  { gpio: '27', dir: 'OUT', func: 'Relay CH2 mister', notes: 'LOW = mister on' },
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

function WiringGuide() {
  const [openSections, setOpenSections] = useState(() => {
    const map = {};
    sectionIds.forEach((id) => { map[id] = true; });
    return map;
  });
  const [activeFile, setActiveFile] = useState(Object.keys(firmwareFiles)[0]);
  const [copyLabel, setCopyLabel] = useState('COPY TO CLIPBOARD');

  const toggleSection = (id) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(firmwareFiles[activeFile]).then(() => {
      setCopyLabel('COPIED!');
      setTimeout(() => setCopyLabel('COPY TO CLIPBOARD'), 2000);
    });
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <h1 style={styles.title}>WIRING GUIDE</h1>
      <div style={styles.subtitle}>Mushroom Tent Controller — ESP32-WROOM-32D</div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-phosphor-ghost)', marginBottom: 'var(--space-4)', lineHeight: 'var(--leading-relaxed)' }}>
        {'⚡'} Complete wiring reference for the ESP32 grow tent controller. Follow these diagrams to connect sensors, actuators, and relay modules. Download the firmware from the code viewer section below.
      </div>

      {/* Wire color legend */}
      <div style={styles.legend}>
        <div style={styles.legendItem('#ff3131')}>
          <span style={styles.legendDot('#ff3131')} />
          Red = Power
        </div>
        <div style={styles.legendItem('#666')}>
          <span style={styles.legendDot('#666')} />
          Gray = Ground
        </div>
        <div style={styles.legendItem('#00fff7')}>
          <span style={styles.legendDot('#00fff7')} />
          Cyan = Data / Signal
        </div>
      </div>

      {/* Section 1: Parts Checklist */}
      <CollapsibleSection id="parts" title="PARTS CHECKLIST" open={openSections.parts} onToggle={toggleSection}>
        <Card title="PARTS CHECKLIST">
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

      {/* Section 2: Power Rails */}
      <CollapsibleSection id="power" title="POWER RAILS" open={openSections.power} onToggle={toggleSection}>
        <Card title="POWER RAILS">
          <pre style={styles.pre}>
            <span style={{ color: '#ff3131' }}>USB 5V</span>{' \u2500\u2500> '}<span style={{ color: '#00fff7' }}>ESP32-WROOM-32D</span>{'\n'}
            {'               \u2502\n'}
            {'               \u251C\u2500\u2500 '}<span style={{ color: '#ff3131' }}>VIN (5V)</span>{' \u2500\u2500> '}<span style={{ color: '#00fff7' }}>Relay module, YF-S201, JSN-SR04T, MH-Z19B</span>{'\n'}
            {'               \u2502\n'}
            {'               \u251C\u2500\u2500 '}<span style={{ color: '#ff3131' }}>3.3V</span>{' \u2500\u2500> '}<span style={{ color: '#00fff7' }}>BME280, PWM module, YF-S201 pull-up</span>{'\n'}
            {'               \u2502\n'}
            {'               \u2514\u2500\u2500 '}<span style={{ color: '#666' }}>GND</span>{' \u2500\u2500> '}<span style={{ color: '#666' }}>Common ground (ALL components)</span>{'\n'}
            {'\n'}
            <span style={{ color: '#ff3131' }}>12V DC Supply</span>{' \u2500\u2500> '}<span style={{ color: '#00fff7' }}>Solenoid valve ONLY</span>{' (separate supply)\n'}
            {'                  \u2514\u2500\u2500 '}<span style={{ color: '#666' }}>GND</span>{' \u2500\u2500> '}<span style={{ color: '#666' }}>Common ground</span>
          </pre>

          <ul style={{ ...styles.ul, marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> ESP32 powered via USB from 2A adapter</li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> VIN pin = 5V bus for relay, YF-S201, JSN-SR04T, MH-Z19B</li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> 3.3V pin for BME280 and PWM converter</li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> Solenoid gets separate 12V 2A supply — <span style={{ color: 'var(--color-red-alert)' }}>NEVER</span> run 12V through ESP32</li>
            <li style={styles.li}><span style={styles.bullet}>&gt;</span> Single common ground connecting ALL components and both supplies</li>
          </ul>

          <AlertBanner variant="warning">
            The solenoid valve requires its own dedicated 12V power supply. Never connect 12V to the ESP32.
          </AlertBanner>
        </Card>
      </CollapsibleSection>

      {/* Section 3: Sensors */}
      <CollapsibleSection id="sensors" title="SENSOR WIRING" open={openSections.sensors} onToggle={toggleSection}>
        <Card title="SENSOR WIRING">
          {/* BME280 */}
          <div style={styles.sensorBlock}>
            <div style={styles.sensorTitle}>BME280 (Temperature / Humidity / Pressure)</div>
            <WireConnection from="VCC" to="3.3V" />
            <WireConnection from="GND" to="GND" />
            <WireConnection from="SDA" to="GPIO 21" />
            <WireConnection from="SCL" to="GPIO 22" />
            <div style={styles.note}>
              Add 4.7k\u03A9 pull-ups on SDA and SCL if your breakout board does not include them.
            </div>
            <div style={styles.note}>
              Mount outside the tent in a vented enclosure for ambient readings.
            </div>
          </div>

          {/* MH-Z19B */}
          <div style={styles.sensorBlock}>
            <div style={styles.sensorTitle}>MH-Z19B (CO2)</div>
            <WireConnection from="VCC" to="5V (VIN)" />
            <WireConnection from="GND" to="GND" />
            <WireConnection from="Sensor TX" to="ESP32 GPIO 17 (RX2)" note="CROSS WIRED" />
            <WireConnection from="Sensor RX" to="ESP32 GPIO 16 (TX2)" note="CROSS WIRED" />
            <div style={styles.note}>
              3-minute warmup period required after power-on. Mount inside tent, away from mist.
            </div>
            <AlertBanner variant="info">
              TX/RX cross — sensor TX goes to ESP32 RX and vice versa.
            </AlertBanner>
          </div>

          {/* JSN-SR04T */}
          <div style={styles.sensorBlock}>
            <div style={styles.sensorTitle}>JSN-SR04T (Water Level)</div>
            <WireConnection from="VCC" to="5V" />
            <WireConnection from="GND" to="GND" />
            <WireConnection from="TRIG" to="GPIO 18" />
            <div style={styles.li}>
              <span style={styles.bullet}>&gt;</span>
              <span style={styles.wirePin}>ECHO</span>
              <span style={{ color: '#666' }}>{' \u2192 '}</span>
              <span>voltage divider: </span>
              <span style={{ color: 'var(--color-amber)' }}>1k\u03A9</span> in series, then{' '}
              <span style={{ color: 'var(--color-amber)' }}>2k\u03A9</span> to GND, midpoint{' '}
              <span style={{ color: '#666' }}>{'\u2192 '}</span>
              <span style={styles.wirePin}>GPIO 19</span>
            </div>
            <AlertBanner variant="warning">
              ECHO outputs 5V — the voltage divider protects GPIO 19.
            </AlertBanner>
          </div>

          {/* YF-S201 */}
          <div style={styles.sensorBlock}>
            <div style={styles.sensorTitle}>YF-S201 (Flow Sensor)</div>
            <WireConnection from="Red wire" to="5V" />
            <WireConnection from="Black wire" to="GND" />
            <WireConnection from="Yellow wire" to="GPIO 34" note="10k\u03A9 pull-up to 3.3V" />
            <div style={styles.note}>
              GPIO 34 is input-only and has no internal pull-up — an external 10k\u03A9 resistor to 3.3V is required.
            </div>
            <div style={styles.note}>
              Install inline, matching the flow arrow direction printed on the sensor body.
            </div>
          </div>
        </Card>
      </CollapsibleSection>

      {/* Section 4: Actuators */}
      <CollapsibleSection id="actuators" title="ACTUATOR WIRING" open={openSections.actuators} onToggle={toggleSection}>
        <Card title="ACTUATOR WIRING">
          {/* Relay Module */}
          <div style={styles.sensorBlock}>
            <div style={styles.sensorTitle}>Relay Module (4-Channel)</div>
            <WireConnection from="VCC" to="5V (VIN)" />
            <WireConnection from="GND" to="GND" />
            <WireConnection from="IN1" to="GPIO 26" />
            <WireConnection from="IN2" to="GPIO 27" />
            <AlertBanner variant="info">
              Active-LOW: GPIO LOW = relay ON = load powered. GPIOs default HIGH at boot = safe off state.
            </AlertBanner>
          </div>

          {/* 12V Solenoid */}
          <div style={styles.sensorBlock}>
            <div style={styles.sensorTitle}>12V Solenoid Valve (via Relay CH1)</div>
            <WireConnection from="12V+" to="COM terminal" />
            <WireConnection from="NO terminal" to="Valve +" />
            <div style={styles.li}>
              <span style={styles.bullet}>&gt;</span>
              Both negatives to shared 12V GND
            </div>
            <div style={styles.note}>
              GPIO 26 LOW = valve opens. Normally-closed valve = safe default (closed when power lost).
            </div>
          </div>

          {/* Mist Maker */}
          <div style={styles.sensorBlock}>
            <div style={styles.sensorTitle}>Mist Maker (via Relay CH2)</div>
            <div style={styles.li}>
              <span style={styles.bullet}>&gt;</span>
              AC hot wire interrupted through CH2 COM / NO
            </div>
            <div style={styles.li}>
              <span style={styles.bullet}>&gt;</span>
              Neutral and ground pass through uninterrupted
            </div>
            <AlertBanner variant="error">
              AC MAINS WIRING — Use rated junction box. No exposed terminals in humid environment.
            </AlertBanner>
          </div>

          {/* PWM Fan */}
          <div style={styles.sensorBlock}>
            <div style={styles.sensorTitle}>PWM Fan Speed Control</div>
            <WireConnection from="PWM signal" to="GPIO 25" />
            <WireConnection from="3.3V" to="Converter VCC" />
            <WireConnection from="GND" to="Converter GND" />
            <div style={styles.li}>
              <span style={styles.bullet}>&gt;</span>
              0-10V output from converter to fan speed control terminal
            </div>
          </div>
        </Card>
      </CollapsibleSection>

      {/* Section 5: GPIO Reference */}
      <CollapsibleSection id="gpio" title="GPIO REFERENCE" open={openSections.gpio} onToggle={toggleSection}>
        <Card title="GPIO REFERENCE">
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>GPIO</th>
                  <th style={styles.th}>Dir</th>
                  <th style={styles.th}>Function</th>
                  <th style={styles.th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {gpioData.map((row, i) => (
                  <tr key={i}>
                    <td style={{ ...styles.td(i % 2 === 0), color: 'var(--color-cyan-accent)', fontWeight: 'bold' }}>{row.gpio}</td>
                    <td style={styles.td(i % 2 === 0)}>
                      <Badge variant={row.dir === 'IN' ? 'info' : 'online'}>{row.dir}</Badge>
                    </td>
                    <td style={styles.td(i % 2 === 0)}>{row.func}</td>
                    <td style={{ ...styles.td(i % 2 === 0), color: 'var(--color-phosphor-dim)' }}>{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ ...styles.note, marginTop: 'var(--space-4)' }}>
            Spare GPIOs: 35, 36, 39 (input-only), 32, 33 (general purpose)
          </div>
        </Card>
      </CollapsibleSection>

      {/* Section 6: Firmware Viewer */}
      <CollapsibleSection id="firmware" title="FIRMWARE — ESP32" open={openSections.firmware} onToggle={toggleSection}>
        <Card title="FIRMWARE — ESP32">
          <div style={styles.fileButtons}>
            {Object.keys(firmwareFiles).map((filename) => (
              <Button
                key={filename}
                size="sm"
                variant={activeFile === filename ? 'primary' : 'secondary'}
                onClick={() => setActiveFile(filename)}
                style={activeFile === filename ? { background: 'rgba(0,255,65,0.12)', boxShadow: 'var(--glow-sm)' } : {}}
              >
                {filename}
              </Button>
            ))}
          </div>

          <pre style={styles.codeViewer}>
            <code>{firmwareFiles[activeFile]}</code>
          </pre>

          <div style={{ marginTop: 'var(--space-3)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button size="sm" variant="secondary" onClick={() => {
              fetch('/api/firmware/download', { credentials: 'include' })
                .then((r) => {
                  if (!r.ok) throw new Error('Download failed');
                  return r.blob();
                })
                .then((blob) => {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'growtent-firmware.zip';
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

export default WiringGuide;
