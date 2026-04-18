import React, { useState } from 'react';
import { Card, Button, Badge } from '../components/ui';

const steps = [
  {
    id: 'hardware',
    title: 'STEP 1 — ASSEMBLE THE HARDWARE',
    content: [
      'Gather all components from the parts list on the Wiring Guide page.',
      'Wire the ESP32 to sensors and actuators following the wiring diagrams.',
      'Double-check all connections before powering on:',
    ],
    checklist: [
      'BME280 connected to I2C (SDA→GPIO21, SCL→GPIO22)',
      'MH-Z19B connected to UART (TX→GPIO16, RX→GPIO17)',
      'JSN-SR04T connected (TRIG→GPIO18, ECHO→GPIO19 via voltage divider)',
      'YF-S201 flow sensor connected (Signal→GPIO34 with pull-up)',
      'Relay module wired (CH1→GPIO26 valve, CH2→GPIO27 mister)',
      'Fan PWM output wired (GPIO25 → PWM-to-0-10V converter)',
      'Power supply connected (12V for solenoid, 5V for ESP32)',
    ],
  },
  {
    id: 'firmware',
    title: 'STEP 2 — FLASH THE FIRMWARE',
    content: [
      'Download the firmware from the Wiring Guide page using the DOWNLOAD ZIP button.',
      'You have two options for flashing:',
    ],
    substeps: [
      {
        label: 'Option A — PlatformIO (Recommended)',
        items: [
          'Install VS Code + PlatformIO extension',
          'Extract the firmware zip and open the firmware/ folder in VS Code',
          'PlatformIO will auto-detect the project from platformio.ini',
          'Connect ESP32 via USB, click Upload (→) in the PlatformIO toolbar',
          'Upload SPIFFS data: PlatformIO → Upload Filesystem Image',
        ],
      },
      {
        label: 'Option B — Arduino IDE',
        items: [
          'Install Arduino IDE and add ESP32 board support (Espressif Systems)',
          'Install required libraries via Library Manager:',
          '  • Adafruit BME280 Library',
          '  • Adafruit Unified Sensor',
          '  • PubSubClient (by Nick O\'Leary)',
          '  • ArduinoJson (by Benoit Blanchon)',
          '  • MH-Z19 (by Jonathan Dempsey)',
          'Copy all .cpp and .h files from firmware/src/ into a new sketch folder',
          'Rename main.cpp to your_sketch_name.ino',
          'Select board: ESP32 Dev Module, Upload Speed: 921600',
          'Connect ESP32 via USB and upload',
        ],
      },
    ],
  },
  {
    id: 'wifi',
    title: 'STEP 3 — CONNECT TO WIFI (CAPTIVE PORTAL)',
    content: [
      'On first boot (or after factory reset), the ESP32 starts a WiFi access point:',
    ],
    details: [
      { label: 'AP Name', value: 'GrowTent-Setup' },
      { label: 'AP IP', value: '192.168.4.1' },
    ],
    substeps: [
      {
        label: 'Configuration Steps',
        items: [
          'Connect your phone or laptop to the "GrowTent-Setup" WiFi network',
          'A captive portal page should open automatically (if not, browse to 192.168.4.1)',
          'Click "Scan Networks" to find your WiFi network',
          'Enter your WiFi SSID and password',
          'Enter your MQTT broker address (your Raspberry Pi IP, e.g. 192.168.1.190)',
          'Set MQTT port (default: 1883)',
          'Set the device identity fields (see next step)',
          'Click Save — the ESP32 will reboot and connect to your network',
        ],
      },
    ],
  },
  {
    id: 'identity',
    title: 'STEP 4 — SET DEVICE IDENTITY',
    content: [
      'In the captive portal, set these four fields that define the MQTT topic path.',
      'These must match the hierarchy you created in System Management:',
    ],
    details: [
      { label: 'Facility', value: 'Your facility name (e.g. "basement-lab")' },
      { label: 'Building', value: 'Your building name (e.g. "main-house")' },
      { label: 'Unit', value: 'Your unit name (e.g. "grow-tent-1")' },
      { label: 'Device Name', value: 'Unique name for this controller (e.g. "controller-1")' },
    ],
    substeps: [
      {
        label: 'MQTT Topic Structure',
        items: [
          'The device will publish to: {facility}/{building}/{unit}/{device_name}/telemetry',
          'And subscribe to: {facility}/{building}/{unit}/{device_name}/command',
          'Example: basement-lab/main-house/grow-tent-1/controller-1/telemetry',
        ],
      },
    ],
  },
  {
    id: 'calibration',
    title: 'STEP 5 — CALIBRATE SENSORS',
    content: [
      'In the captive portal (or later via MQTT config commands), set calibration values:',
    ],
    details: [
      { label: 'Tank Full (cm)', value: 'Distance reading when tank is full (default: 10cm)' },
      { label: 'Tank Empty (cm)', value: 'Distance reading when tank is empty (default: 50cm)' },
      { label: 'Flow Cal', value: 'Pulses per liter for your flow sensor (default: 7.5)' },
      { label: 'Sensor Interval', value: 'Milliseconds between readings (default: 10000 = 10s)' },
      { label: 'Fan Default Speed', value: 'Default fan speed percentage (default: 50)' },
    ],
    substeps: [
      {
        label: 'Tank Calibration Procedure',
        items: [
          'Fill your water tank completely',
          'Note the ultrasonic distance reading from serial monitor — this is tank_full_cm',
          'Empty the tank completely',
          'Note the distance reading again — this is tank_empty_cm',
          'Set both values via the captive portal or MQTT config update',
        ],
      },
    ],
  },
  {
    id: 'hierarchy',
    title: 'STEP 6 — CREATE HIERARCHY ON SERVER',
    content: [
      'Before the device can be tracked, create the matching hierarchy in the web UI:',
    ],
    substeps: [
      {
        label: 'In System Management',
        items: [
          'Go to FACILITIES → click "+ NEW FACILITY" → enter the same facility name',
          'Go to BUILDINGS → select the facility → click "+ NEW BUILDING"',
          'Go to UNITS → select the building → click "+ NEW UNIT"',
          'The names don\'t need to match exactly — the MQTT topic uses the values from the ESP32',
          'But the device auto-registers when its first telemetry arrives',
        ],
      },
    ],
  },
  {
    id: 'verify',
    title: 'STEP 7 — VERIFY CONNECTION',
    content: [
      'Once the ESP32 is powered on and connected to WiFi + MQTT:',
    ],
    checklist: [
      'Open the serial monitor (115200 baud) — you should see connection logs',
      'Check the MQTT broker: mosquitto_sub -t "+/+/+/+/telemetry" -v',
      'Refresh the Colony dashboard — the device should appear under DEVICES',
      'The device will show as ONLINE with a green badge',
      'Telemetry data should start appearing every 10 seconds',
      'Navigate to the Control Dashboard to see live sensor gauges',
    ],
  },
  {
    id: 'thresholds',
    title: 'STEP 8 — CONFIGURE AUTOMATION THRESHOLDS',
    content: [
      'Set the automation thresholds for your grow conditions:',
    ],
    details: [
      { label: 'Humidity ON', value: 'Mister turns on below this % (default: 85%)' },
      { label: 'Humidity OFF', value: 'Mister turns off above this % (default: 92%)' },
      { label: 'CO2 High', value: 'Fan goes to 100% above this ppm (default: 1200)' },
      { label: 'Temp Min/Max', value: 'Temperature alert range (default: 18-26°C)' },
      { label: 'Water Low', value: 'Auto-fill trigger distance (default: 30cm)' },
      { label: 'Water Full', value: 'Auto-fill stop distance (default: 10cm)' },
    ],
    substeps: [
      {
        label: 'Where to Set Thresholds',
        items: [
          'Web UI: Navigate to the device → THRESHOLDS page',
          'Or via MQTT: Send update_config command with threshold values',
          'Thresholds are stored on both the ESP32 (NVS) and the server (database)',
        ],
      },
    ],
  },
  {
    id: 'test',
    title: 'STEP 9 — TEST MODE (OPTIONAL)',
    content: [
      'You can test the full system without any sensors wired up:',
    ],
    substeps: [
      {
        label: 'Enable Test Mode',
        items: [
          'Navigate to the device Control Dashboard',
          'Scroll down to the [ TEST MODE ] card',
          'Click "ENABLE TEST MODE" and confirm',
          'The ESP32 will generate simulated sensor data',
          'All gauges turn amber to indicate test data',
          'Automation rules will fire on simulated values',
          'Watch the serial monitor for detailed test output',
          'Disable test mode when done — real sensors resume immediately',
        ],
      },
    ],
  },
  {
    id: 'assign',
    title: 'STEP 10 — ASSIGN DEVICE TO UNIT',
    content: [
      'Once the device is online, assign it to your hierarchy for organized management:',
    ],
    substeps: [
      {
        label: 'Device Assignment',
        items: [
          'Go to System Management → OVERVIEW',
          'The device should appear in the unassigned devices list',
          'Or go to UNITS → select your unit → assign the device',
          'This links the device to the facility/building/unit in the database',
          'The device will now appear in the hierarchy tree on the dashboard',
        ],
      },
    ],
  },
];

function SetupGuide() {
  const [completedSteps, setCompletedSteps] = useState({});

  const toggleStep = (id) => {
    setCompletedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = Object.values(completedSteps).filter(Boolean).length;
  const totalSteps = steps.length;

  return (
    <div style={pageStyles.page}>
      <div style={pageStyles.header}>
        <h1 style={pageStyles.title}>DEVICE SETUP GUIDE</h1>
        <p style={pageStyles.subtitle}>
          REGISTER A NEW GROW TENT CONTROLLER TO THE NETWORK
        </p>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-phosphor-ghost)', marginBottom: 'var(--space-4)', lineHeight: 'var(--leading-relaxed)' }}>
          Follow these steps to register a new grow tent controller to the network. Each step can be marked complete as you go. The guide covers hardware assembly through first data verification.
        </div>
        <div style={pageStyles.progress}>
          <Badge variant={completedCount === totalSteps ? 'online' : 'warning'}>
            {completedCount} / {totalSteps} STEPS COMPLETE
          </Badge>
        </div>
      </div>

      {steps.map((step, idx) => (
        <Card
          key={step.id}
          title={step.title}
          style={{
            marginBottom: 'var(--space-4)',
            borderLeft: completedSteps[step.id]
              ? '3px solid var(--color-phosphor-primary)'
              : '3px solid var(--color-border)',
            opacity: completedSteps[step.id] ? 0.75 : 1,
          }}
        >
          {/* Description paragraphs */}
          {step.content.map((p, i) => (
            <p key={i} style={pageStyles.paragraph}>{p}</p>
          ))}

          {/* Key-value details */}
          {step.details && (
            <div style={pageStyles.detailGrid}>
              {step.details.map((d, i) => (
                <div key={i} style={pageStyles.detailRow}>
                  <span style={pageStyles.detailLabel}>{d.label}</span>
                  <span style={pageStyles.detailValue}>{d.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Checklist items */}
          {step.checklist && (
            <div style={pageStyles.checklist}>
              {step.checklist.map((item, i) => (
                <div key={i} style={pageStyles.checkItem}>
                  <span style={pageStyles.checkBox}>[ ]</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}

          {/* Substeps with labels */}
          {step.substeps && step.substeps.map((sub, si) => (
            <div key={si} style={pageStyles.substep}>
              <div style={pageStyles.substepLabel}>{sub.label}</div>
              <div style={pageStyles.substepItems}>
                {sub.items.map((item, ii) => (
                  <div key={ii} style={pageStyles.substepItem}>
                    <span style={pageStyles.bullet}>{'\u251C\u2500'}</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Mark complete button */}
          <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              size="sm"
              variant={completedSteps[step.id] ? 'secondary' : 'primary'}
              onClick={() => toggleStep(step.id)}
            >
              {completedSteps[step.id] ? 'MARK INCOMPLETE' : 'MARK COMPLETE'}
            </Button>
          </div>
        </Card>
      ))}

      <Card style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
        <div style={pageStyles.footerText}>
          {completedCount === totalSteps
            ? 'ALL STEPS COMPLETE — YOUR DEVICE IS READY'
            : `${totalSteps - completedCount} STEPS REMAINING`}
        </div>
      </Card>
    </div>
  );
}

const pageStyles = {
  page: {
    maxWidth: 900,
    margin: '0 auto',
  },
  header: {
    marginBottom: 'var(--space-6)',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-2xl)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    letterSpacing: 'var(--letter-spacing-wider)',
    margin: 0,
    fontWeight: 'normal',
  },
  subtitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    letterSpacing: 'var(--letter-spacing-wide)',
    marginTop: 'var(--space-1)',
  },
  progress: {
    marginTop: 'var(--space-3)',
  },
  paragraph: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    lineHeight: 'var(--leading-relaxed)',
    margin: '0 0 var(--space-2) 0',
  },
  detailGrid: {
    margin: 'var(--space-3) 0',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    overflow: 'hidden',
  },
  detailRow: {
    display: 'flex',
    borderBottom: '1px solid var(--color-border)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
  },
  detailLabel: {
    minWidth: '160px',
    padding: 'var(--space-2) var(--space-3)',
    background: 'var(--color-bg-base)',
    color: 'var(--color-phosphor-primary)',
    letterSpacing: 'var(--letter-spacing-wide)',
    fontWeight: 'bold',
  },
  detailValue: {
    flex: 1,
    padding: 'var(--space-2) var(--space-3)',
    color: 'var(--color-phosphor-dim)',
  },
  checklist: {
    margin: 'var(--space-3) 0',
  },
  checkItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-2)',
    padding: 'var(--space-1) 0',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
  },
  checkBox: {
    color: 'var(--color-phosphor-ghost)',
    flexShrink: 0,
  },
  substep: {
    margin: 'var(--space-3) 0',
  },
  substepLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-primary)',
    letterSpacing: 'var(--letter-spacing-wider)',
    marginBottom: 'var(--space-2)',
    textTransform: 'uppercase',
  },
  substepItems: {
    paddingLeft: 'var(--space-2)',
  },
  substepItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-2)',
    padding: 'var(--space-1) 0',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    lineHeight: 'var(--leading-relaxed)',
  },
  bullet: {
    color: 'var(--color-phosphor-ghost)',
    flexShrink: 0,
  },
  footerText: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-lg)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    letterSpacing: 'var(--letter-spacing-wider)',
  },
};

export default SetupGuide;
