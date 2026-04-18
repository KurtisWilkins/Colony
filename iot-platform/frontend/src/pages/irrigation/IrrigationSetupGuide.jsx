import React, { useState } from 'react';
import { Card, Button, Badge } from '../../components/ui';

const steps = [
  {
    id: 'hardware',
    title: 'STEP 1 — ASSEMBLE THE HARDWARE',
    content: [
      'Gather all components from the parts list on the Irrigation Wiring Guide page.',
      'Mount the ESP32 and 16-channel relay module inside the IP65 waterproof junction box.',
      'Wire the power supply, relay module, and ESP32 connections following the wiring guide.',
      'Wire solenoid valves to relay terminals using waterproof connectors for outdoor runs.',
      'Double-check all connections before powering on:',
    ],
    checklist: [
      'All 16 relay signal wires connected to correct ESP32 GPIO pins',
      '12V power supply fused with 10A inline fuse',
      'Common ground verified between 12V supply, ESP32, and relay module',
      'Solenoid valves connected to relay NO (Normally Open) terminals',
      'Valve return wires connected to 12V negative shared bus',
      'Cable glands installed on all junction box cable entries',
      'No exposed wire connections outdoors — all weatherproofed',
    ],
  },
  {
    id: 'firmware',
    title: 'STEP 2 — FLASH THE FIRMWARE',
    content: [
      'Download the firmware from the Irrigation Wiring Guide page using the DOWNLOAD ZIP button.',
      'You have two options for flashing:',
    ],
    substeps: [
      {
        label: 'Option A — PlatformIO (Recommended)',
        items: [
          'Install VS Code + PlatformIO extension',
          'Extract the firmware zip and open the firmware-irrigation/ folder in VS Code',
          'PlatformIO will auto-detect the project from platformio.ini',
          'Connect ESP32 via USB, click Upload in the PlatformIO toolbar',
        ],
      },
      {
        label: 'Option B — Arduino IDE',
        items: [
          'Install Arduino IDE and add ESP32 board support (Espressif Systems)',
          'Install required libraries via Library Manager:',
          '  \u2022 PubSubClient (by Nick O\'Leary)',
          '  \u2022 ArduinoJson (by Benoit Blanchon)',
          'Copy all .cpp and .h files from firmware-irrigation/src/ into a new sketch folder',
          'Open arduino/irrigation/irrigation.ino',
          'Select board: ESP32 Dev Module, Upload Speed: 921600',
          'Connect ESP32 via USB and upload',
        ],
      },
      {
        label: 'Troubleshooting',
        items: [
          'If you see "Connecting......" hold the BOOT button on the ESP32 until upload starts',
          'Release BOOT once the upload percentage begins incrementing',
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
      { label: 'AP Name', value: 'Irrigation-Setup' },
      { label: 'AP IP', value: '192.168.4.1' },
    ],
    substeps: [
      {
        label: 'Configuration Steps',
        items: [
          'Connect your phone or laptop to the "Irrigation-Setup" WiFi network',
          'A captive portal page should open automatically (if not, browse to 192.168.4.1)',
          'Click "Scan Networks" to find your WiFi network',
          'Enter your WiFi SSID and password',
          'Enter your MQTT broker address (your server IP, e.g. 192.168.1.190)',
          'Set MQTT port (default: 1883)',
          'Set the device identity fields (see next step)',
          'Set timezone for schedule accuracy (see Step 5)',
          'Set number of active zones (1-16)',
          'Set safety max runtime (default 30 minutes / 1800 seconds)',
          'Click Save \u2014 the ESP32 will reboot and connect to your network',
        ],
      },
    ],
  },
  {
    id: 'identity',
    title: 'STEP 4 — SET DEVICE IDENTITY',
    content: [
      'In the captive portal, set these four fields that define the MQTT topic path.',
      'These must match the hierarchy you create in System Management:',
    ],
    details: [
      { label: 'Facility', value: 'Your facility name (e.g. "backyard")' },
      { label: 'Building', value: 'Your building name (e.g. "main-house")' },
      { label: 'Unit', value: 'Your unit name (e.g. "irrigation")' },
      { label: 'Device Name', value: 'Unique name (e.g. "sprinkler-controller-1")' },
    ],
    substeps: [
      {
        label: 'MQTT Topic Structure',
        items: [
          'The device will publish to: {facility}/{building}/{unit}/{device_name}/telemetry',
          'And subscribe to: {facility}/{building}/{unit}/{device_name}/command',
          'Example: backyard/main-house/irrigation/sprinkler-controller-1/telemetry',
        ],
      },
    ],
  },
  {
    id: 'timezone',
    title: 'STEP 5 — SET TIMEZONE',
    content: [
      'Timezone configuration is critical for schedule accuracy.',
      'Irrigation schedules fire based on local time, so an incorrect timezone will cause watering at wrong times.',
    ],
    substeps: [
      {
        label: 'Configuration',
        items: [
          'Select your UTC offset in the captive portal timezone field',
          'NTP time syncs automatically after WiFi connects (uses pool.ntp.org)',
          'The ESP32 re-syncs NTP every 24 hours to prevent clock drift',
          'Schedules will NOT fire until NTP is synced \u2014 this is a safety feature',
          'Check serial monitor for "NTP SYNCED" message to confirm time sync',
        ],
      },
    ],
    checklist: [
      'Timezone set in captive portal',
      'NTP sync confirmed in serial monitor after WiFi connects',
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
          'Go to FACILITIES \u2192 click "+ NEW FACILITY" \u2192 enter the same facility name',
          'Go to BUILDINGS \u2192 select the facility \u2192 click "+ NEW BUILDING"',
          'Go to UNITS \u2192 select the building \u2192 click "+ NEW UNIT"',
          'The device auto-registers when its first telemetry message arrives',
          'You can also register the device manually from the DEVICES page if needed',
        ],
      },
    ],
  },
  {
    id: 'verify',
    title: 'STEP 7 — VERIFY CONNECTION',
    content: [
      'Once the ESP32 is powered on and connected to WiFi + MQTT, verify everything is working:',
    ],
    checklist: [
      'Open serial monitor at 115200 baud \u2014 you should see boot and connection logs',
      'Check for "NTP SYNCED" message in serial output',
      'Check for "MQTT connected" message in serial output',
      'Device appears in Colony dashboard under DEVICES with ONLINE status',
      'Run: mosquitto_sub -t "+/+/+/+/telemetry" -v \u2014 telemetry should appear',
      'Telemetry shows zone count, active zone status, and queue state',
    ],
  },
  {
    id: 'zones',
    title: 'STEP 8 — NAME YOUR ZONES',
    content: [
      'Customize zone names and settings from the Irrigation Dashboard:',
    ],
    substeps: [
      {
        label: 'Zone Configuration',
        items: [
          'Go to the Irrigation Dashboard and select your device',
          'Click each zone card to rename it (e.g. "Front Lawn", "Back Garden", "Flower Beds")',
          'Enable or disable zones you are not using \u2014 disabled zones will not run',
          'Set a default runtime for each zone (how long the valve stays open)',
          'Assign zones to groups for running multiple zones as a program',
        ],
      },
    ],
  },
  {
    id: 'schedules',
    title: 'STEP 9 — CREATE SCHEDULES',
    content: [
      'Set up automated watering schedules for each zone:',
    ],
    substeps: [
      {
        label: 'In the Irrigation Scheduler',
        items: [
          'Go to the Irrigation Scheduler page',
          'Select each zone and configure its schedule',
          'Set start times and days of the week for each zone',
          'Each zone supports up to 4 time windows per day',
          'Tip: stagger start times by 5-10 minutes between zones to avoid running multiple valves simultaneously',
          'Save schedules \u2014 they are pushed to the device and stored in NVS (non-volatile storage)',
        ],
      },
    ],
    checklist: [
      'At least one zone has a schedule configured',
      'Start times are staggered between zones',
      'Days of week are set correctly',
      'Schedules saved and confirmed via MQTT ack',
    ],
  },
  {
    id: 'seasonal',
    title: 'STEP 10 — CONFIGURE SEASONAL SETTINGS (OPTIONAL)',
    content: [
      'Seasonal configurations let you automatically adjust watering based on time of year and weather:',
    ],
    substeps: [
      {
        label: 'In the Seasonal Config Page',
        items: [
          'Go to the Seasonal Config page',
          'Create seasonal profiles (e.g. Spring, Summer, Fall, Winter)',
          'Set date ranges for each season (start month/day to end month/day)',
          'Set runtime multipliers (e.g. Summer = 1.5x, Winter = 0.5x)',
          'Enable rain skip and set rain threshold in mm (e.g. skip if >5mm rain in last 24h)',
          'Assign seasonal configs to individual zone schedules',
        ],
      },
    ],
  },
  {
    id: 'testmode',
    title: 'STEP 11 — TEST MODE',
    content: [
      'Test mode allows you to verify the full system without physically activating solenoid valves.',
      'Test mode is ON by default on first boot for safety.',
    ],
    substeps: [
      {
        label: 'Test Mode Operation',
        items: [
          'All 16 zones cycle virtually \u2014 no valves are physically activated',
          'Watch serial monitor for virtual zone open/close events',
          'The dashboard shows test mode status with an amber indicator',
          'Verify commands reach the device from the dashboard (open zone, close zone, run program)',
          'Check that schedules trigger correctly at the configured times',
          'Telemetry publishes every 10 seconds in test mode (vs 30 seconds in normal mode)',
          'Disable test mode from the dashboard when ready for real operation',
        ],
      },
    ],
    checklist: [
      'Virtual zone cycling confirmed in serial monitor',
      'Dashboard commands successfully reach device (check ack messages)',
      'Schedule triggers verified at correct times',
      'Test mode disabled and system ready for real operation',
    ],
  },
  {
    id: 'firstrun',
    title: 'STEP 12 — FIRST REAL RUN',
    content: [
      'With test mode disabled, perform the first real irrigation run to verify physical operation:',
    ],
    substeps: [
      {
        label: 'Verification Procedure',
        items: [
          'Disable test mode from the dashboard',
          'Manually open ONE zone from the dashboard \u2014 verify the correct solenoid valve opens',
          'Check for leaks at all valve connections and fittings',
          'Close the zone and try the next one \u2014 repeat for all active zones',
          'Test the emergency STOP ALL button from the dashboard \u2014 all valves must close immediately',
          'Verify the safety timer works: open a zone and wait for the safety max runtime to expire',
          'Let a full scheduled cycle run and verify all zones water at the correct times and durations',
        ],
      },
    ],
    checklist: [
      'Each active zone opens the correct valve',
      'No leaks at any connection point',
      'STOP ALL emergency button closes all valves',
      'Safety timer closes valves after max runtime',
      'Full schedule cycle completed successfully',
      'System running in normal (non-test) mode',
    ],
  },
];

function IrrigationSetupGuide() {
  const [completedSteps, setCompletedSteps] = useState({});

  const toggleStep = (id) => {
    setCompletedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = Object.values(completedSteps).filter(Boolean).length;
  const totalSteps = steps.length;

  return (
    <div style={pageStyles.page}>
      <div style={pageStyles.header}>
        <h1 style={pageStyles.title}>IRRIGATION SETUP GUIDE</h1>
        <p style={pageStyles.subtitle}>
          REGISTER A NEW 16-ZONE IRRIGATION CONTROLLER TO THE NETWORK
        </p>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-phosphor-ghost)', marginBottom: 'var(--space-4)', lineHeight: 'var(--leading-relaxed)' }}>
          Follow these 12 steps to register a new irrigation controller. The guide covers hardware assembly, firmware flashing, WiFi setup, zone naming, schedule creation, and first real run with leak checking.
        </div>
        <div style={pageStyles.progress}>
          <Badge variant={completedCount === totalSteps ? 'online' : 'warning'}>
            {completedCount} / {totalSteps} STEPS COMPLETE
          </Badge>
        </div>
      </div>

      {steps.map((step) => (
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
            ? 'ALL STEPS COMPLETE — YOUR IRRIGATION CONTROLLER IS READY'
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

export default IrrigationSetupGuide;
