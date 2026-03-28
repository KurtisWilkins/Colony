import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Badge, AlertBanner, Loader, ProgressBar, Toggle } from '../../components/ui';
import DeviceSelector from '../../components/DeviceSelector';
import {
  getIrrigationState,
  getIrrigationZones,
  openZone,
  closeZone,
  closeAllZones,
  runIrrigationProgram,
  getZoneEvents,
} from '../../utils/api';

// ── Helpers ──────────────────────────────────────────────────────────────

function formatTime(ts) {
  if (!ts) return '--:--:--';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

function formatCountdown(seconds) {
  if (seconds == null || seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '--';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatRelative(ts) {
  if (!ts) return 'never';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ── Custom hooks ─────────────────────────────────────────────────────────

function useIrrigationState(deviceId, intervalMs = 5000) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchState = useCallback(() => {
    if (!deviceId) return;
    getIrrigationState(deviceId)
      .then((data) => { setState(data); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [deviceId]);

  useEffect(() => {
    setLoading(true);
    fetchState();
    const id = setInterval(fetchState, intervalMs);
    return () => clearInterval(id);
  }, [fetchState, intervalMs]);

  return { state, loading, error, refetch: fetchState };
}

function useIrrigationZones(deviceId, intervalMs = 5000) {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchZones = useCallback(() => {
    if (!deviceId) return;
    getIrrigationZones(deviceId)
      .then((data) => {
        const list = Array.isArray(data) ? data : data.zones || [];
        setZones(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [deviceId]);

  useEffect(() => {
    setLoading(true);
    fetchZones();
    const id = setInterval(fetchZones, intervalMs);
    return () => clearInterval(id);
  }, [fetchZones, intervalMs]);

  return { zones, loading, refetch: fetchZones };
}

function useRecentEvents(deviceId, intervalMs = 10000) {
  const [events, setEvents] = useState([]);

  const fetchEvents = useCallback(() => {
    if (!deviceId) return;
    getZoneEvents(deviceId, { limit: 20 })
      .then((data) => {
        const list = Array.isArray(data) ? data : data.events || [];
        setEvents(list);
      })
      .catch(() => {});
  }, [deviceId]);

  useEffect(() => {
    fetchEvents();
    const id = setInterval(fetchEvents, intervalMs);
    return () => clearInterval(id);
  }, [fetchEvents, intervalMs]);

  return { events };
}

// ── Active zone countdown timer ──────────────────────────────────────────

function useCountdown(activeZone) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!activeZone || !activeZone.remaining_s) {
      setRemaining(0);
      return;
    }
    setRemaining(activeZone.remaining_s);
    const id = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [activeZone?.remaining_s, activeZone?.zone_index]);

  return remaining;
}

// ── Component ────────────────────────────────────────────────────────────

function IrrigationDashboard() {
  const { deviceId } = useParams();
  const navigate = useNavigate();

  const { state: irState, loading: stateLoading, error: stateError } = useIrrigationState(deviceId, 5000);
  const { zones, loading: zonesLoading } = useIrrigationZones(deviceId, 5000);
  const { events } = useRecentEvents(deviceId, 10000);

  // Cooldown/confirm state for buttons
  const [cooldowns, setCooldowns] = useState({});
  const [confirms, setConfirms] = useState({});
  const [testMode, setTestMode] = useState(false);
  const [programRuntime, setProgramRuntime] = useState(300);

  // Active zone from state
  const activeZone = irState?.active_zone || null;
  const queuedZones = irState?.queued_zones || [];
  const countdown = useCountdown(activeZone);
  const totalRuntime = activeZone?.runtime_s || 1;
  const progressPct = totalRuntime > 0 ? ((totalRuntime - countdown) / totalRuntime) * 100 : 0;

  // Derived
  const deviceName = irState?.device_name || irState?.name || deviceId || '';
  const isOnline = irState?.online ?? irState?.is_online ?? false;
  const ntpSynced = irState?.ntp_synced ?? true;
  const autonomousMode = irState?.autonomous_mode ?? false;
  const weatherSkip = irState?.weather_skip_active ?? false;

  // Log scroll ref
  const logRef = useRef(null);
  const wasAtBottom = useRef(true);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (wasAtBottom.current) el.scrollTop = el.scrollHeight;
  }, [events]);

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
      setTimeout(() => setCooldowns((prev) => ({ ...prev, [key]: false })), 3000);
    };
  }

  function withConfirm(key, fn) {
    return () => {
      if (confirms[key]) {
        setConfirms((prev) => ({ ...prev, [key]: false }));
        withCooldown(key, fn)();
      } else {
        setConfirms((prev) => ({ ...prev, [key]: true }));
        setTimeout(() => setConfirms((prev) => ({ ...prev, [key]: false })), 3000);
      }
    };
  }

  function btnLabel(key, defaultLabel) {
    if (confirms[key]) return 'CONFIRM?';
    if (cooldowns[key] === 'loading') return null;
    if (cooldowns[key] === 'sent') return 'SENT';
    return defaultLabel;
  }

  function btnDisabled(key) {
    return !!cooldowns[key];
  }

  function btnLoading(key) {
    return cooldowns[key] === 'loading';
  }

  // Zone border color
  function zoneBorderColor(zone, idx) {
    if (activeZone && activeZone.zone_index === idx) return 'var(--color-phosphor-primary)';
    if (queuedZones.some((q) => q.zone_index === idx)) return 'var(--color-amber)';
    return 'var(--color-border)';
  }

  function zoneGlow(zone, idx) {
    if (activeZone && activeZone.zone_index === idx) return '0 0 12px rgba(0,255,65,0.3)';
    if (queuedZones.some((q) => q.zone_index === idx)) return '0 0 8px rgba(255,176,0,0.2)';
    return 'none';
  }

  // ── No device selected ─────────────────────────────────────────────────

  if (!deviceId) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <DeviceSelector
          value={deviceId}
          onSelect={(id) => navigate(`/devices/${id}/irrigation`)}
        />
        <Card>
          <div style={styles.emptyState}>
            SELECT A DEVICE ABOVE TO VIEW IRRIGATION CONTROLS
          </div>
        </Card>
      </div>
    );
  }

  if (stateLoading && !irState) {
    return <Loader type="spin" text="LOADING IRRIGATION STATE" />;
  }

  if (stateError && !irState) {
    return <AlertBanner variant="error">FAILED TO LOAD DEVICE: {stateError}</AlertBanner>;
  }

  // Build 16-zone array (pad if fewer returned)
  const zoneGrid = [];
  for (let i = 0; i < 16; i++) {
    zoneGrid.push(zones[i] || { zone_index: i, name: `Zone ${i + 1}`, enabled: false, open: false });
  }

  // Enabled zone indices for program run
  const enabledZoneIndices = zoneGrid
    .filter((z) => z.enabled)
    .map((z) => z.zone_index ?? zoneGrid.indexOf(z));

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Device selector */}
      <DeviceSelector
        value={deviceId}
        onSelect={(id) => navigate(`/devices/${id}/irrigation`)}
      />

      {/* ═══ STATUS BAR ═══ */}
      <div style={styles.statusBar}>
        <div style={styles.statusLeft}>
          <span style={styles.deviceName}>{String(deviceName).toUpperCase()}</span>
          <Badge variant={isOnline ? 'online' : 'offline'} />
          {ntpSynced ? (
            <Badge variant="info">NTP SYNCED</Badge>
          ) : (
            <Badge variant="warning">NTP UNSYNC</Badge>
          )}
        </div>
        <div style={styles.statusRight}>
          {activeZone && (
            <span style={styles.activeLabel}>
              ACTIVE: ZONE {(activeZone.zone_index ?? 0) + 1}
            </span>
          )}
        </div>
      </div>

      {/* Warnings */}
      {autonomousMode && (
        <AlertBanner variant="warning">
          AUTONOMOUS MODE ACTIVE — Schedules are running automatically. Manual commands may be overridden.
        </AlertBanner>
      )}

      {weatherSkip && (
        <AlertBanner variant="warning">
          WEATHER SKIP ACTIVE — Irrigation suspended due to recent rainfall exceeding threshold.
        </AlertBanner>
      )}

      {/* ═══ ACTIVE ZONE DISPLAY ═══ */}
      {activeZone && (
        <Card title="Active Zone" glowing style={{ marginBottom: 'var(--space-4)' }}>
          <div style={styles.activeZoneCard}>
            <div style={styles.activeZoneInfo}>
              <div style={styles.activeZoneNumber}>
                ZONE {(activeZone.zone_index ?? 0) + 1}
              </div>
              <div style={styles.activeZoneName}>
                {activeZone.name || zoneGrid[activeZone.zone_index]?.name || 'Unknown'}
              </div>
            </div>
            <div style={styles.activeZoneTimer}>
              <div style={styles.countdownText}>{formatCountdown(countdown)}</div>
              <div style={styles.countdownLabel}>REMAINING</div>
            </div>
          </div>
          <ProgressBar value={progressPct} showLabel />
          {queuedZones.length > 0 && (
            <div style={styles.queueInfo}>
              QUEUE: {queuedZones.map((q) => `Zone ${(q.zone_index ?? 0) + 1}`).join(', ')}
            </div>
          )}
        </Card>
      )}

      {/* ═══ QUICK CONTROLS ═══ */}
      <div style={styles.controlRow}>
        <Button
          variant="primary"
          size="md"
          loading={btnLoading('runProgram')}
          disabled={btnDisabled('runProgram') || enabledZoneIndices.length === 0}
          onClick={withCooldown('runProgram', () =>
            runIrrigationProgram(deviceId, enabledZoneIndices, programRuntime)
          )}
        >
          {btnLabel('runProgram', 'RUN PROGRAM')}
        </Button>
        <div style={styles.runtimeInput}>
          <label style={styles.runtimeLabel}>RUNTIME</label>
          <input
            type="number"
            min={30}
            max={3600}
            step={30}
            value={programRuntime}
            onChange={(e) => setProgramRuntime(Number(e.target.value))}
            style={styles.runtimeField}
          />
          <span style={styles.runtimeUnit}>sec</span>
        </div>
        <Button
          variant="danger"
          size="md"
          loading={btnLoading('stopAll')}
          disabled={btnDisabled('stopAll')}
          onClick={withConfirm('stopAll', () => closeAllZones(deviceId))}
        >
          {btnLabel('stopAll', 'STOP ALL')}
        </Button>
        <div style={{ marginLeft: 'auto' }}>
          <Toggle
            checked={testMode}
            onChange={setTestMode}
            label="TEST MODE"
          />
        </div>
      </div>

      {/* ═══ 16-ZONE GRID ═══ */}
      <div style={styles.zoneGrid}>
        {zoneGrid.map((zone, idx) => {
          const zIdx = zone.zone_index ?? idx;
          const isActive = activeZone && activeZone.zone_index === zIdx;
          const isQueued = queuedZones.some((q) => q.zone_index === zIdx);
          const isOpen = zone.open || zone.state === 'open' || isActive;
          const runtime = testMode ? 10 : 120;

          return (
            <div
              key={zIdx}
              style={{
                ...styles.zoneCard,
                borderColor: zoneBorderColor(zone, zIdx),
                boxShadow: zoneGlow(zone, zIdx),
                opacity: zone.enabled ? 1 : 0.5,
              }}
            >
              <div style={styles.zoneHeader}>
                <span style={styles.zoneNumber}>Z{zIdx + 1}</span>
                <Badge variant={isOpen ? 'online' : 'offline'}>
                  {isOpen ? 'OPEN' : 'CLOSED'}
                </Badge>
              </div>
              <div style={styles.zoneName}>
                {zone.name || `Zone ${zIdx + 1}`}
              </div>
              <div style={styles.zoneStatus}>
                {!zone.enabled && (
                  <span style={styles.disabledTag}>DISABLED</span>
                )}
                {isQueued && (
                  <span style={styles.queuedTag}>QUEUED</span>
                )}
              </div>
              <div style={styles.zoneLastRun}>
                LAST: {formatRelative(zone.last_run || zone.last_run_at)}
              </div>
              <div style={styles.zoneActions}>
                {isOpen ? (
                  <Button
                    variant="danger"
                    size="sm"
                    loading={btnLoading(`close-${zIdx}`)}
                    disabled={btnDisabled(`close-${zIdx}`)}
                    onClick={withCooldown(`close-${zIdx}`, () => closeZone(deviceId, zIdx))}
                  >
                    {btnLabel(`close-${zIdx}`, 'CLOSE')}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    loading={btnLoading(`open-${zIdx}`)}
                    disabled={btnDisabled(`open-${zIdx}`) || !zone.enabled}
                    onClick={withCooldown(`open-${zIdx}`, () => openZone(deviceId, zIdx, runtime))}
                  >
                    {btnLabel(`open-${zIdx}`, 'OPEN')}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ RECENT ACTIVITY LOG ═══ */}
      <Card title="Recent Activity" style={{ marginTop: 'var(--space-4)' }}>
        <div
          ref={logRef}
          onScroll={handleLogScroll}
          style={styles.logContainer}
        >
          {events.length === 0 && (
            <div style={styles.logEmpty}>[ NO RECENT EVENTS ]</div>
          )}
          {events.map((evt, i) => (
            <div key={evt.id || i} style={styles.logLine}>
              <span style={styles.logTime}>{formatTime(evt.timestamp || evt.created_at)}</span>
              <span style={styles.logZone}>Z{(evt.zone_index ?? 0) + 1}</span>
              <span style={styles.logEvent}>{String(evt.event || evt.type || '').toUpperCase()}</span>
              <span style={styles.logTrigger}>{evt.trigger || evt.source || '--'}</span>
              {evt.duration_s != null && (
                <span style={styles.logDuration}>{formatDuration(evt.duration_s)}</span>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

const styles = {
  emptyState: {
    textAlign: 'center',
    padding: 'var(--space-8)',
    color: 'var(--color-phosphor-ghost)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-lg)',
    letterSpacing: 'var(--letter-spacing-wider)',
  },
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
  activeLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-bright)',
    textShadow: 'var(--glow-text)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },

  // Active zone card
  activeZoneCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-3)',
  },
  activeZoneInfo: {},
  activeZoneNumber: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-3xl)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    letterSpacing: 'var(--letter-spacing-wider)',
  },
  activeZoneName: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    marginTop: 'var(--space-1)',
  },
  activeZoneTimer: {
    textAlign: 'right',
  },
  countdownText: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-3xl)',
    color: 'var(--color-phosphor-bright)',
    textShadow: 'var(--glow-text)',
    letterSpacing: '4px',
  },
  countdownLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    letterSpacing: 'var(--letter-spacing-wide)',
    textAlign: 'right',
  },
  queueInfo: {
    marginTop: 'var(--space-3)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-amber)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },

  // Quick controls
  controlRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
    padding: 'var(--space-3) var(--space-4)',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    marginBottom: 'var(--space-4)',
  },
  runtimeInput: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
  },
  runtimeLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-dim)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  runtimeField: {
    width: '70px',
    padding: 'var(--space-1) var(--space-2)',
    background: 'var(--color-bg-input)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-phosphor-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    textAlign: 'center',
    outline: 'none',
  },
  runtimeUnit: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
  },

  // Zone grid
  zoneGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 'var(--space-3)',
  },
  zoneCard: {
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-3)',
    transition: 'all var(--transition-base)',
  },
  zoneHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-2)',
  },
  zoneNumber: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-lg)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    letterSpacing: '2px',
  },
  zoneName: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    marginBottom: 'var(--space-2)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  zoneStatus: {
    display: 'flex',
    gap: 'var(--space-1)',
    marginBottom: 'var(--space-2)',
    minHeight: '18px',
  },
  disabledTag: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  queuedTag: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-amber)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  zoneLastRun: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    marginBottom: 'var(--space-2)',
  },
  zoneActions: {
    display: 'flex',
    gap: 'var(--space-1)',
  },

  // Log
  logContainer: {
    maxHeight: '300px',
    overflowY: 'auto',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
  },
  logEmpty: {
    textAlign: 'center',
    padding: 'var(--space-6)',
    color: 'var(--color-phosphor-ghost)',
  },
  logLine: {
    display: 'flex',
    gap: 'var(--space-3)',
    padding: 'var(--space-1) 0',
    borderBottom: '1px solid var(--color-border)',
    alignItems: 'center',
  },
  logTime: {
    color: 'var(--color-phosphor-ghost)',
    fontSize: 'var(--text-xs)',
    minWidth: '70px',
    flexShrink: 0,
  },
  logZone: {
    color: 'var(--color-phosphor-primary)',
    fontWeight: 'bold',
    minWidth: '30px',
    flexShrink: 0,
  },
  logEvent: {
    color: 'var(--color-phosphor-dim)',
    flex: 1,
  },
  logTrigger: {
    color: 'var(--color-phosphor-ghost)',
    fontSize: 'var(--text-xs)',
    minWidth: '60px',
    textAlign: 'right',
  },
  logDuration: {
    color: 'var(--color-amber)',
    fontSize: 'var(--text-xs)',
    minWidth: '50px',
    textAlign: 'right',
  },
};

export default IrrigationDashboard;
