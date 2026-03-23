import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Button, Card, Badge, AlertBanner, Loader } from '../components/ui';
import GaugeBar from '../components/GaugeBar';
import ActuatorIndicator from '../components/ActuatorIndicator';
import DeviceSelector from '../components/DeviceSelector';
import {
  sendFanOn,
  sendFanOff,
  sendFanSpeed,
  sendMisterOn,
  sendMisterOff,
  sendValveOpen,
  sendValveClose,
  sendFillStart,
  sendFillStop,
  sendReadNow,
  getActiveAlerts,
  getTelemetry,
  getDeviceState,
  getAutomationEvents,
} from '../utils/api';
import { terminalChartTheme, terminalLineDataset } from '../styles/chartTheme';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler);

// ── Custom hooks (inline) ────────────────────────────────────────────────

function useDeviceState(deviceId, intervalMs = 10000) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(() => {
    if (!deviceId) return;
    getDeviceState(deviceId)
      .then((data) => {
        setState(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [deviceId]);

  useEffect(() => {
    setLoading(true);
    fetch();
    const id = setInterval(fetch, intervalMs);
    return () => clearInterval(id);
  }, [fetch, intervalMs]);

  return { state, loading, error, refetch: fetch };
}

function useAutomationLog(deviceId, intervalMs = 15000) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(() => {
    if (!deviceId) return;
    getAutomationEvents(deviceId, 200)
      .then((data) => {
        const list = Array.isArray(data) ? data : data.events || [];
        setEvents(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [deviceId]);

  useEffect(() => {
    setLoading(true);
    fetch();
    const id = setInterval(fetch, intervalMs);
    return () => clearInterval(id);
  }, [fetch, intervalMs]);

  return { events, loading, refetch: fetch };
}

// ── Amber dataset config ─────────────────────────────────────────────────

const amberDataset = {
  borderColor: '#ffb000',
  backgroundColor: 'rgba(255, 176, 0, 0.08)',
  pointBackgroundColor: 'transparent',
  pointBorderColor: 'transparent',
  pointHoverBackgroundColor: '#ffb000',
  pointHoverBorderColor: '#ffb000',
  pointHoverRadius: 5,
  pointRadius: 0,
  tension: 0.3,
  fill: true,
  borderWidth: 1.5,
};

// ── Helpers ──────────────────────────────────────────────────────────────

function rssiToBars(rssi) {
  if (rssi == null) return '\u2581\u2582\u2583\u2584';
  if (rssi > -60) return '\u2581\u2582\u2583\u2584';
  if (rssi > -70) return '\u2581\u2582\u2583';
  if (rssi > -80) return '\u2581\u2582';
  return '\u2581';
}

function rssiToColor(rssi) {
  if (rssi == null) return 'var(--color-phosphor-ghost)';
  if (rssi > -60) return 'var(--color-phosphor-primary)';
  if (rssi > -70) return 'var(--color-phosphor-dim)';
  if (rssi > -80) return 'var(--color-amber)';
  return 'var(--color-red-alert)';
}

function formatTime(ts) {
  if (!ts) return '--:--:--';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

function formatTimestamp(ts) {
  if (!ts) return '---';
  const d = new Date(ts);
  return d.toLocaleString('en-US', { hour12: false });
}

function getLogColor(ruleName) {
  if (!ruleName) return 'var(--color-phosphor-primary)';
  const r = ruleName.toLowerCase();
  if (r.includes('valve_safety') || r.includes('safety')) return 'var(--color-red-alert)';
  if (r.includes('co2') || r.includes('temperature') || r.includes('temp')) return 'var(--color-amber)';
  if (r.includes('humidity') || r.includes('water')) return 'var(--color-phosphor-primary)';
  return 'var(--color-phosphor-dim)';
}

// ── Component ────────────────────────────────────────────────────────────

function ControlDashboard() {
  const { deviceId } = useParams();
  const navigate = useNavigate();

  // Device state (auto-refresh 10s)
  const { state: device, loading: deviceLoading, error: deviceError } = useDeviceState(deviceId, 10000);

  // Automation log (auto-refresh 15s)
  const { events: automationEvents } = useAutomationLog(deviceId, 15000);

  // Alerts (auto-refresh 30s)
  const [alerts, setAlerts] = useState([]);
  useEffect(() => {
    if (!deviceId) return;
    const fetchAlerts = () => {
      getActiveAlerts(deviceId)
        .then((data) => setAlerts(Array.isArray(data) ? data : data.alerts || []))
        .catch(() => {});
    };
    fetchAlerts();
    const id = setInterval(fetchAlerts, 30000);
    return () => clearInterval(id);
  }, [deviceId]);

  // Telemetry sparkline
  const [telemetryData, setTelemetryData] = useState([]);
  useEffect(() => {
    if (!deviceId) return;
    getTelemetry(deviceId, 2)
      .then((data) => {
        const list = Array.isArray(data) ? data : data.telemetry || [];
        setTelemetryData(list);
      })
      .catch(() => {});
    const id = setInterval(() => {
      getTelemetry(deviceId, 2)
        .then((data) => {
          const list = Array.isArray(data) ? data : data.telemetry || [];
          setTelemetryData(list);
        })
        .catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, [deviceId]);

  // Fan speed slider
  const [fanSlider, setFanSlider] = useState(50);

  // Button cooldown state
  const [cooldowns, setCooldowns] = useState({});

  // Confirm pattern for dangerous actions
  const [confirms, setConfirms] = useState({});

  // Valve open elapsed timer
  const [valveElapsed, setValveElapsed] = useState(0);
  useEffect(() => {
    if (!device) return;
    const valveOpen = device.valve_open || device.valve_state === 'open';
    if (!valveOpen) {
      setValveElapsed(0);
      return;
    }
    const openedAt = device.valve_opened_at ? new Date(device.valve_opened_at).getTime() : Date.now();
    const tick = () => {
      setValveElapsed(Math.floor((Date.now() - openedAt) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [device?.valve_open, device?.valve_state, device?.valve_opened_at]);

  // Automation log scroll ref
  const logRef = useRef(null);
  const wasAtBottom = useRef(true);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (wasAtBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [automationEvents]);

  function handleLogScroll() {
    const el = logRef.current;
    if (!el) return;
    wasAtBottom.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
  }

  // ── Button helpers ───────────────────────────────────────────────────

  function withCooldown(key, fn) {
    return async () => {
      if (cooldowns[key]) return;
      setCooldowns((prev) => ({ ...prev, [key]: 'loading' }));
      try {
        await fn();
        setCooldowns((prev) => ({ ...prev, [key]: 'sent' }));
      } catch {
        setCooldowns((prev) => ({ ...prev, [key]: false }));
        return;
      }
      setTimeout(() => {
        setCooldowns((prev) => ({ ...prev, [key]: false }));
      }, 3000);
    };
  }

  function withConfirm(key, fn) {
    return () => {
      if (confirms[key]) {
        // Second click — execute
        setConfirms((prev) => ({ ...prev, [key]: false }));
        withCooldown(key, fn)();
      } else {
        // First click — show confirm
        setConfirms((prev) => ({ ...prev, [key]: true }));
        setTimeout(() => {
          setConfirms((prev) => ({ ...prev, [key]: false }));
        }, 3000);
      }
    };
  }

  function btnLabel(key, defaultLabel) {
    if (confirms[key]) return 'CONFIRM?';
    if (cooldowns[key] === 'loading') return null; // shows loading spinner
    if (cooldowns[key] === 'sent') return 'SENT';
    return defaultLabel;
  }

  function btnDisabled(key) {
    return !!cooldowns[key];
  }

  function btnLoading(key) {
    return cooldowns[key] === 'loading';
  }

  // ── Derived state ──────────────────────────────────────────────────

  const s = device || {};
  const sensors = s.sensors || s;
  const temperature = sensors.temperature ?? sensors.temp_c ?? null;
  const humidity = sensors.humidity ?? sensors.humidity_pct ?? null;
  const co2 = sensors.co2 ?? sensors.co2_ppm ?? null;
  const co2WarmingUp = s.co2_warming_up || sensors.co2_warming_up || false;
  const tankLevel = sensors.tank_level ?? sensors.tank_level_pct ?? null;

  const fanOn = s.fan_on ?? s.fan_state === 'on' ?? false;
  const fanSpeed = s.fan_speed ?? s.fan_speed_pct ?? 0;
  const misterOn = s.mister_on ?? s.mister_state === 'on' ?? false;
  const valveOpen = s.valve_open ?? s.valve_state === 'open' ?? false;
  const autonomousMode = s.autonomous_mode ?? false;
  const isOnline = s.online ?? s.is_online ?? false;
  const lastSeen = s.last_seen ?? s.last_seen_at ?? null;
  const rssi = s.wifi_rssi ?? s.rssi ?? null;
  const deviceName = s.device_name ?? s.name ?? deviceId;
  const valveSafetyMin = s.valve_safety_minutes ?? s.valve_safety_timeout_min ?? 10;

  // ── Sparkline chart ────────────────────────────────────────────────

  const sortedTelemetry = [...telemetryData].sort(
    (a, b) => new Date(a.received_at || a.timestamp) - new Date(b.received_at || b.timestamp)
  );
  const sparkLabels = sortedTelemetry.map((t) =>
    formatTime(t.received_at || t.timestamp)
  );
  const humidityPoints = sortedTelemetry.map((t) => {
    const p = t.payload || t;
    return p.humidity ?? p.humidity_pct ?? null;
  });
  const co2Points = sortedTelemetry.map((t) => {
    const p = t.payload || t;
    return p.co2 ?? p.co2_ppm ?? null;
  });

  const sparkChartData = {
    labels: sparkLabels,
    datasets: [
      {
        ...terminalLineDataset,
        label: 'HUMIDITY',
        data: humidityPoints,
        yAxisID: 'y',
      },
      {
        ...amberDataset,
        label: 'CO2',
        data: co2Points,
        yAxisID: 'y1',
      },
    ],
  };

  const sparkChartOptions = {
    ...terminalChartTheme,
    plugins: {
      ...terminalChartTheme.plugins,
      legend: { display: false },
      tooltip: { ...terminalChartTheme.plugins.tooltip },
    },
    scales: {
      x: {
        ...terminalChartTheme.scales.x,
        display: false,
      },
      y: {
        ...terminalChartTheme.scales.y,
        display: false,
        min: 0,
        max: 100,
      },
      y1: {
        display: false,
        position: 'right',
        min: 0,
        max: 2000,
      },
    },
  };

  // ── Sorted alerts ──────────────────────────────────────────────────

  const severityOrder = { critical: 0, warning: 1, info: 2 };
  const sortedAlerts = [...alerts].sort(
    (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
  );

  function alertVariant(severity) {
    if (severity === 'critical') return 'error';
    if (severity === 'warning') return 'warning';
    return 'info';
  }

  // ── Elapsed format ─────────────────────────────────────────────────

  function formatElapsed(seconds) {
    const m = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  // ── Loading state ──────────────────────────────────────────────────

  if (deviceLoading && !device) {
    return <Loader type="spin" text="LOADING DEVICE STATE" />;
  }

  if (deviceError && !device) {
    return <AlertBanner variant="error">FAILED TO LOAD DEVICE: {deviceError}</AlertBanner>;
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Device selector */}
      <DeviceSelector
        value={deviceId}
        onSelect={(id) => navigate(`/devices/${id}/control`)}
      />

      {/* ═══ SECTION 1: DEVICE STATUS BAR ═══ */}
      <div style={styles.statusBar}>
        <div style={styles.statusLeft}>
          <span style={styles.deviceName}>{String(deviceName).toUpperCase()}</span>
          <Badge variant={isOnline ? 'online' : 'offline'} />
          <span style={{ ...styles.rssi, color: rssiToColor(rssi) }}>
            {rssiToBars(rssi)}
            {rssi != null && (
              <span style={styles.rssiDb}>{rssi}dBm</span>
            )}
          </span>
        </div>
        <div style={styles.statusRight}>
          <span style={styles.lastSeen}>LAST SEEN: {formatTimestamp(lastSeen)}</span>
          <Button
            variant="ghost"
            size="sm"
            loading={btnLoading('readNow')}
            disabled={btnDisabled('readNow')}
            onClick={withCooldown('readNow', () => sendReadNow(deviceId))}
          >
            {btnLabel('readNow', 'REQUEST READING')}
          </Button>
        </div>
      </div>

      {autonomousMode && (
        <AlertBanner variant="warning">
          AUTONOMOUS MODE ACTIVE — Device is operating under automation rules. Manual commands may be overridden.
        </AlertBanner>
      )}

      {/* ═══ SECTION 2: LIVE SENSOR GAUGES ═══ */}
      <div style={styles.gaugeGrid}>
        {/* Left column — Gauge bars */}
        <div>
          <GaugeBar
            label="TEMPERATURE"
            value={temperature}
            min={0}
            max={40}
            warningLow={18}
            warningHigh={24}
            criticalLow={10}
            criticalHigh={30}
            unit="\u00B0C"
          />
          <GaugeBar
            label="HUMIDITY"
            value={humidity}
            min={0}
            max={100}
            warningLow={70}
            warningHigh={95}
            criticalLow={60}
            criticalHigh={100}
            unit="%"
          />
          <GaugeBar
            label={co2WarmingUp ? 'CO2 (WARMING UP)' : 'CO2'}
            value={co2WarmingUp ? null : co2}
            min={0}
            max={2000}
            warningHigh={1000}
            criticalHigh={1500}
            unit="ppm"
            loading={co2WarmingUp}
          />
          <GaugeBar
            label="TANK LEVEL"
            value={tankLevel}
            min={0}
            max={100}
            warningLow={20}
            criticalLow={10}
            unit="%"
          />
        </div>

        {/* Right column — Actuators + sparkline */}
        <div>
          <div style={styles.actuatorRow}>
            <ActuatorIndicator
              label="FAN"
              active={fanOn}
              info={fanOn ? `${fanSpeed}%` : undefined}
            />
            <ActuatorIndicator
              label="MISTER"
              active={misterOn}
            />
            <ActuatorIndicator
              label="VALVE"
              active={valveOpen}
              activeLabel="OPEN"
              inactiveLabel="CLOSED"
              activeColor="amber"
            />
          </div>

          {/* Sparkline chart */}
          <div style={styles.sparkContainer}>
            <div style={{ position: 'relative', height: 120 }}>
              <Line data={sparkChartData} options={sparkChartOptions} />
            </div>
            <div style={styles.sparkLegend}>
              <span style={{ color: '#00ff41' }}>\u2500 HUMIDITY</span>
              <span style={{ color: '#ffb000' }}>\u2500 CO2</span>
              <span style={styles.sparkLabel}>LAST 2H</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ SECTION 3: MANUAL CONTROLS ═══ */}
      <Card
        title="MANUAL CONTROL"
        style={{ marginBottom: 'var(--space-4)' }}
      >
        {autonomousMode && (
          <div style={styles.controlWarning}>
            AUTONOMOUS MODE IS ACTIVE. MANUAL COMMANDS MAY BE OVERRIDDEN BY AUTOMATION RULES.
          </div>
        )}

        <div style={styles.controlGrid}>
          {/* ── Fan Controls ── */}
          <div style={styles.controlGroup}>
            <h3 style={styles.controlLabel}>[ FAN ]</h3>
            <div style={styles.controlBtnRow}>
              <Button
                size="sm"
                loading={btnLoading('fanOn')}
                disabled={btnDisabled('fanOn')}
                onClick={withCooldown('fanOn', () => sendFanOn(deviceId))}
              >
                {btnLabel('fanOn', 'ON')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={btnLoading('fanOff')}
                disabled={btnDisabled('fanOff')}
                onClick={withCooldown('fanOff', () => sendFanOff(deviceId))}
              >
                {btnLabel('fanOff', 'OFF')}
              </Button>
            </div>

            <div style={styles.sliderGroup}>
              <label style={styles.sliderLabel}>SPEED: {fanSlider}%</label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={fanSlider}
                onChange={(e) => {
                  let val = Number(e.target.value);
                  if (val > 0 && val < 20) val = 20;
                  setFanSlider(val);
                }}
                style={styles.slider}
              />
              <Button
                size="sm"
                variant="secondary"
                loading={btnLoading('fanSpeed')}
                disabled={btnDisabled('fanSpeed')}
                onClick={withCooldown('fanSpeed', () => {
                  const speed = fanSlider > 0 && fanSlider < 20 ? 20 : fanSlider;
                  return sendFanSpeed(deviceId, speed);
                })}
              >
                {btnLabel('fanSpeed', 'SET SPEED')}
              </Button>
            </div>
          </div>

          {/* ── Mister Controls ── */}
          <div style={styles.controlGroup}>
            <h3 style={styles.controlLabel}>[ MISTER ]</h3>
            <div style={styles.controlBtnRow}>
              <Button
                size="sm"
                loading={btnLoading('misterOn')}
                disabled={btnDisabled('misterOn')}
                onClick={withCooldown('misterOn', () => sendMisterOn(deviceId))}
              >
                {btnLabel('misterOn', 'ON')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={btnLoading('misterOff')}
                disabled={btnDisabled('misterOff')}
                onClick={withCooldown('misterOff', () => sendMisterOff(deviceId))}
              >
                {btnLabel('misterOff', 'OFF')}
              </Button>
            </div>
            <div style={{ marginTop: 'var(--space-3)' }}>
              <ActuatorIndicator label="MISTER" active={misterOn} />
            </div>
          </div>

          {/* ── Water/Valve Controls ── */}
          <div style={styles.controlGroup}>
            <h3 style={styles.controlLabel}>[ WATER SYSTEM ]</h3>
            <div style={styles.controlBtnRow}>
              <Button
                size="sm"
                variant={confirms['valveOpen'] ? 'amber' : 'primary'}
                loading={btnLoading('valveOpen')}
                disabled={btnDisabled('valveOpen')}
                onClick={withConfirm('valveOpen', () => sendValveOpen(deviceId))}
              >
                {btnLabel('valveOpen', 'OPEN VALVE')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={btnLoading('valveClose')}
                disabled={btnDisabled('valveClose')}
                onClick={withCooldown('valveClose', () => sendValveClose(deviceId))}
              >
                {btnLabel('valveClose', 'CLOSE VALVE')}
              </Button>
            </div>
            <div style={{ ...styles.controlBtnRow, marginTop: 'var(--space-2)' }}>
              <Button
                size="sm"
                variant={confirms['fillStart'] ? 'amber' : 'primary'}
                loading={btnLoading('fillStart')}
                disabled={btnDisabled('fillStart')}
                onClick={withConfirm('fillStart', () => sendFillStart(deviceId))}
              >
                {btnLabel('fillStart', 'START AUTO-FILL')}
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={btnLoading('fillStop')}
                disabled={btnDisabled('fillStop')}
                onClick={withCooldown('fillStop', () => sendFillStop(deviceId))}
              >
                {btnLabel('fillStop', 'STOP FILL')}
              </Button>
            </div>

            {/* Valve state indicator */}
            <div style={{ marginTop: 'var(--space-3)' }}>
              <ActuatorIndicator
                label="VALVE"
                active={valveOpen}
                activeLabel="OPEN"
                inactiveLabel="CLOSED"
                activeColor="amber"
              />
            </div>
            {valveOpen && (
              <div style={styles.valveWarning}>
                VALVE OPEN &mdash; {formatElapsed(valveElapsed)} &mdash; Safety cutoff at {valveSafetyMin}min
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ═══ SECTION 4: BOTTOM PANELS ═══ */}
      <div style={styles.bottomGrid}>
        {/* ── Active Alerts ── */}
        <Card title="ACTIVE ALERTS">
          {sortedAlerts.length === 0 ? (
            <div style={styles.emptyState}>
              [ NO ACTIVE ALERTS ]
            </div>
          ) : (
            <div style={styles.alertList}>
              {sortedAlerts.map((alert, idx) => (
                <AlertBanner key={alert.id || idx} variant={alertVariant(alert.severity)}>
                  <div style={styles.alertContent}>
                    <span style={styles.alertType}>{(alert.type || alert.alert_type || '').toUpperCase()}</span>
                    <span>{alert.message}</span>
                    <span style={styles.alertMeta}>
                      {alert.severity?.toUpperCase()} &mdash; {formatTimestamp(alert.triggered_at)}
                    </span>
                  </div>
                </AlertBanner>
              ))}
            </div>
          )}
        </Card>

        {/* ── Automation Log ── */}
        <Card title="AUTOMATION LOG">
          <div
            ref={logRef}
            onScroll={handleLogScroll}
            style={styles.logContainer}
          >
            {automationEvents.length === 0 ? (
              <div style={styles.emptyState}>[ NO AUTOMATION EVENTS ]</div>
            ) : (
              automationEvents.map((evt, idx) => {
                const ts = formatTime(evt.timestamp || evt.created_at);
                const ruleName = evt.rule_name || evt.rule || '';
                const action = evt.action_taken || evt.action || '';
                const triggerVal = evt.trigger_value ?? evt.value ?? '';
                const color = getLogColor(ruleName);

                return (
                  <div key={evt.id || idx} style={{ ...styles.logLine, color }}>
                    <span style={styles.logTs}>[{ts}]</span>{' '}
                    <span style={styles.logRule}>{ruleName.toUpperCase()}</span>
                    {' \u2192 '}
                    <span>{action.toUpperCase()}</span>
                    {triggerVal !== '' && triggerVal != null && (
                      <span style={styles.logTrigger}> {'{' + triggerVal + '}'}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = {
  // Section 1 — Status bar
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    marginBottom: 'var(--space-4)',
  },
  statusLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
  },
  statusRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
  },
  deviceName: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-xl)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    letterSpacing: 'var(--letter-spacing-wider)',
  },
  rssi: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-lg)',
    letterSpacing: '2px',
  },
  rssiDb: {
    fontSize: 'var(--text-xs)',
    marginLeft: 'var(--space-1)',
    opacity: 0.7,
  },
  lastSeen: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },

  // Section 2 — Gauges
  gaugeGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-4)',
    marginBottom: 'var(--space-4)',
  },
  actuatorRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-4)',
  },
  sparkContainer: {
    background: 'var(--color-bg-base)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-3)',
  },
  sparkLegend: {
    display: 'flex',
    gap: 'var(--space-3)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    marginTop: 'var(--space-2)',
    color: 'var(--color-phosphor-dim)',
  },
  sparkLabel: {
    marginLeft: 'auto',
    color: 'var(--color-phosphor-ghost)',
  },

  // Section 3 — Controls
  controlGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'var(--space-4)',
  },
  controlGroup: {
    padding: 'var(--space-3)',
    background: 'var(--color-bg-base)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
  },
  controlLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    letterSpacing: 'var(--letter-spacing-wider)',
    marginTop: 0,
    marginBottom: 'var(--space-3)',
    fontWeight: 'normal',
  },
  controlBtnRow: {
    display: 'flex',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
  },
  controlWarning: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-amber)',
    padding: 'var(--space-2) var(--space-3)',
    background: 'rgba(255,176,0,0.05)',
    borderLeft: '3px solid var(--color-amber)',
    marginBottom: 'var(--space-4)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  sliderGroup: {
    marginTop: 'var(--space-3)',
  },
  sliderLabel: {
    display: 'block',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-dim)',
    marginBottom: 'var(--space-1)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  slider: {
    width: '100%',
    accentColor: '#00ff41',
    marginBottom: 'var(--space-2)',
    cursor: 'pointer',
  },
  valveWarning: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-amber)',
    textShadow: '0 0 8px rgba(255,176,0,0.5)',
    marginTop: 'var(--space-2)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },

  // Section 4 — Bottom panels
  bottomGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-4)',
  },

  // Alerts
  alertList: {
    maxHeight: 400,
    overflowY: 'auto',
  },
  alertContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },
  alertType: {
    fontWeight: 'bold',
    letterSpacing: 'var(--letter-spacing-wide)',
    fontSize: 'var(--text-xs)',
  },
  alertMeta: {
    fontSize: 'var(--text-xs)',
    opacity: 0.7,
  },

  // Automation log
  logContainer: {
    maxHeight: 400,
    overflowY: 'auto',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    background: 'var(--color-bg-base)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-3)',
  },
  logLine: {
    padding: 'var(--space-1) 0',
    lineHeight: 'var(--leading-normal)',
    whiteSpace: 'nowrap',
  },
  logTs: {
    color: 'var(--color-phosphor-ghost)',
  },
  logRule: {
    fontWeight: 'bold',
  },
  logTrigger: {
    opacity: 0.6,
  },

  emptyState: {
    textAlign: 'center',
    padding: 'var(--space-6)',
    color: 'var(--color-phosphor-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    textShadow: 'var(--glow-text)',
  },
};

// ── Responsive media query injection ─────────────────────────────────────

const responsiveStyleId = 'control-dashboard-responsive';
if (typeof document !== 'undefined' && !document.getElementById(responsiveStyleId)) {
  const style = document.createElement('style');
  style.id = responsiveStyleId;
  style.textContent = `
    @media (max-width: 768px) {
      /* Override grid layouts for mobile */
    }
  `;
  document.head.appendChild(style);
}

// Attach responsive overrides via a wrapper
function ControlDashboardResponsive() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  );

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 768);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isMobile) {
    styles.gaugeGrid.gridTemplateColumns = '1fr';
    styles.controlGrid.gridTemplateColumns = '1fr';
    styles.bottomGrid.gridTemplateColumns = '1fr';
  } else {
    styles.gaugeGrid.gridTemplateColumns = '1fr 1fr';
    styles.controlGrid.gridTemplateColumns = 'repeat(3, 1fr)';
    styles.bottomGrid.gridTemplateColumns = '1fr 1fr';
  }

  return <ControlDashboard />;
}

export default ControlDashboardResponsive;
