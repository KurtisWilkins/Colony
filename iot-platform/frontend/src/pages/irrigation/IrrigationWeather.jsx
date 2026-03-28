import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Badge, AlertBanner, Loader, Input, Toggle } from '../../components/ui';
import DeviceSelector from '../../components/DeviceSelector';
import {
  getIrrigationState,
  getWeatherHistory,
  pushWeatherData,
} from '../../utils/api';

// ── Helpers ──────────────────────────────────────────────────────────────

function formatTimestamp(ts) {
  if (!ts) return '---';
  const d = new Date(ts);
  return d.toLocaleString('en-US', { hour12: false });
}

function formatRelative(ts) {
  if (!ts) return 'never';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ── Component ────────────────────────────────────────────────────────────

function IrrigationWeather() {
  const { deviceId } = useParams();
  const navigate = useNavigate();

  const [irState, setIrState] = useState(null);
  const [weatherHistory, setWeatherHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Manual override form
  const [overrideRainfall, setOverrideRainfall] = useState(0);
  const [overrideTemp, setOverrideTemp] = useState(20);
  const [overrideSkip, setOverrideSkip] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState(null);

  // Settings form
  const [rainThreshold, setRainThreshold] = useState(10);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState(null);

  // ── Fetch ──────────────────────────────────────────────────────────────

  const fetchData = useCallback(() => {
    if (!deviceId) return;
    setLoading(true);
    Promise.all([
      getIrrigationState(deviceId).catch(() => null),
      getWeatherHistory(deviceId).catch(() => []),
    ])
      .then(([stateData, histData]) => {
        setIrState(stateData);
        const hList = Array.isArray(histData) ? histData : histData.history || [];
        setWeatherHistory(hList);

        // Initialize settings from state
        if (stateData) {
          setRainThreshold(stateData.rain_threshold_mm ?? stateData.weather?.rain_threshold_mm ?? 10);
          setLatitude(stateData.latitude ?? stateData.location?.latitude ?? '');
          setLongitude(stateData.longitude ?? stateData.location?.longitude ?? '');
        }
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [deviceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derived state ──────────────────────────────────────────────────────

  const weather = irState?.weather || {};
  const lastRainfall = weather.last_rainfall_mm ?? weather.rainfall_mm ?? null;
  const lastRainAt = weather.last_rain_at ?? weather.rainfall_timestamp ?? null;
  const currentTemp = weather.temperature_c ?? weather.temp ?? null;
  const skipActive = irState?.weather_skip_active ?? weather.skip_active ?? false;
  const lastUpdate = weather.updated_at ?? weather.last_update ?? null;

  // ── Push manual override ───────────────────────────────────────────────

  async function handlePushOverride() {
    setPushing(true);
    setPushStatus(null);
    try {
      await pushWeatherData(deviceId, {
        rainfall_mm: Number(overrideRainfall) || 0,
        temperature_c: Number(overrideTemp) || 20,
        force_skip: overrideSkip,
      });
      setPushStatus('success');
      fetchData();
    } catch {
      setPushStatus('error');
    } finally {
      setPushing(false);
    }
  }

  // ── Save settings ──────────────────────────────────────────────────────

  async function handleSaveSettings() {
    setSavingSettings(true);
    setSettingsStatus(null);
    try {
      await pushWeatherData(deviceId, {
        rain_threshold_mm: Number(rainThreshold) || 10,
        latitude: latitude !== '' ? Number(latitude) : null,
        longitude: longitude !== '' ? Number(longitude) : null,
        settings_update: true,
      });
      setSettingsStatus('success');
      fetchData();
    } catch {
      setSettingsStatus('error');
    } finally {
      setSavingSettings(false);
    }
  }

  // ── No device ──────────────────────────────────────────────────────────

  if (!deviceId) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <DeviceSelector value={deviceId} onSelect={(id) => navigate(`/devices/${id}/irrigation/weather`)} />
        <Card>
          <div style={styles.emptyState}>SELECT A DEVICE ABOVE TO VIEW WEATHER DATA</div>
        </Card>
      </div>
    );
  }

  if (loading) {
    return <Loader type="spin" text="LOADING WEATHER DATA" />;
  }

  if (error) {
    return <AlertBanner variant="error">FAILED TO LOAD: {error}</AlertBanner>;
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <DeviceSelector value={deviceId} onSelect={(id) => navigate(`/devices/${id}/irrigation/weather`)} />

      {/* Skip banner */}
      {skipActive && (
        <AlertBanner variant="warning">
          WEATHER SKIP ACTIVE — Irrigation is paused due to recent rainfall exceeding the threshold.
        </AlertBanner>
      )}

      {/* ═══ CURRENT CONDITIONS ═══ */}
      <Card title="Current Conditions" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={styles.conditionsGrid}>
          <div style={styles.conditionItem}>
            <div style={styles.conditionValue}>
              {lastRainfall != null ? `${lastRainfall} mm` : '--'}
            </div>
            <div style={styles.conditionLabel}>LAST RAINFALL</div>
            <div style={styles.conditionMeta}>{formatRelative(lastRainAt)}</div>
          </div>
          <div style={styles.conditionItem}>
            <div style={styles.conditionValue}>
              {currentTemp != null ? `${currentTemp}°C` : '--'}
            </div>
            <div style={styles.conditionLabel}>TEMPERATURE</div>
          </div>
          <div style={styles.conditionItem}>
            <div style={{
              ...styles.conditionValue,
              color: skipActive ? 'var(--color-amber)' : 'var(--color-phosphor-primary)',
            }}>
              {skipActive ? 'ACTIVE' : 'INACTIVE'}
            </div>
            <div style={styles.conditionLabel}>WEATHER SKIP</div>
          </div>
          <div style={styles.conditionItem}>
            <div style={styles.conditionValue}>
              {rainThreshold} mm
            </div>
            <div style={styles.conditionLabel}>RAIN THRESHOLD</div>
          </div>
        </div>
        <div style={styles.lastUpdate}>
          LAST UPDATE: {formatTimestamp(lastUpdate)}
        </div>
      </Card>

      <div style={styles.twoCol}>
        {/* ═══ MANUAL OVERRIDE ═══ */}
        <Card title="Manual Weather Override">
          <Input
            label="Rainfall (mm)"
            type="number"
            min={0}
            max={500}
            step={0.1}
            value={overrideRainfall}
            onChange={(e) => { setOverrideRainfall(e.target.value); setPushStatus(null); }}
          />
          <Input
            label="Temperature (°C)"
            type="number"
            min={-40}
            max={60}
            step={0.5}
            value={overrideTemp}
            onChange={(e) => { setOverrideTemp(e.target.value); setPushStatus(null); }}
          />
          <div style={styles.fieldRow}>
            <Toggle
              checked={overrideSkip}
              onChange={(v) => { setOverrideSkip(v); setPushStatus(null); }}
              label="FORCE SKIP"
            />
          </div>
          <div style={styles.actionRow}>
            <Button
              variant="primary"
              size="md"
              loading={pushing}
              disabled={pushing}
              onClick={handlePushOverride}
            >
              {pushing ? null : 'PUSH OVERRIDE'}
            </Button>
            {pushStatus === 'success' && (
              <span style={styles.statusSuccess}>PUSHED</span>
            )}
            {pushStatus === 'error' && (
              <span style={styles.statusError}>FAILED</span>
            )}
          </div>
        </Card>

        {/* ═══ SETTINGS ═══ */}
        <Card title="Weather Settings">
          <Input
            label="Rain Threshold (mm)"
            type="number"
            min={1}
            max={200}
            step={1}
            value={rainThreshold}
            onChange={(e) => { setRainThreshold(e.target.value); setSettingsStatus(null); }}
          />
          <Input
            label="Latitude"
            type="number"
            step={0.0001}
            min={-90}
            max={90}
            value={latitude}
            onChange={(e) => { setLatitude(e.target.value); setSettingsStatus(null); }}
            placeholder="e.g. 37.7749"
          />
          <Input
            label="Longitude"
            type="number"
            step={0.0001}
            min={-180}
            max={180}
            value={longitude}
            onChange={(e) => { setLongitude(e.target.value); setSettingsStatus(null); }}
            placeholder="e.g. -122.4194"
          />
          <div style={styles.actionRow}>
            <Button
              variant="primary"
              size="md"
              loading={savingSettings}
              disabled={savingSettings}
              onClick={handleSaveSettings}
            >
              {savingSettings ? null : 'SAVE SETTINGS'}
            </Button>
            {settingsStatus === 'success' && (
              <span style={styles.statusSuccess}>SAVED</span>
            )}
            {settingsStatus === 'error' && (
              <span style={styles.statusError}>FAILED</span>
            )}
          </div>
        </Card>
      </div>

      {/* ═══ WEATHER HISTORY ═══ */}
      <Card title="Weather History" style={{ marginTop: 'var(--space-4)' }}>
        {weatherHistory.length === 0 ? (
          <div style={styles.emptyLog}>[ NO WEATHER HISTORY ]</div>
        ) : (
          <div style={styles.historyList}>
            {weatherHistory.map((entry, i) => (
              <div key={entry.id || i} style={styles.historyRow}>
                <span style={styles.historyTime}>
                  {formatTimestamp(entry.timestamp || entry.created_at)}
                </span>
                <span style={styles.historyRain}>
                  {entry.rainfall_mm != null ? `${entry.rainfall_mm}mm` : '--'}
                </span>
                <span style={styles.historyTemp}>
                  {entry.temperature_c != null ? `${entry.temperature_c}°C` : '--'}
                </span>
                <span style={styles.historySource}>
                  {entry.source || entry.trigger || '--'}
                </span>
                {entry.skip_triggered && (
                  <Badge variant="warning">SKIP</Badge>
                )}
              </div>
            ))}
          </div>
        )}
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

  // Conditions grid
  conditionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 'var(--space-4)',
    marginBottom: 'var(--space-3)',
  },
  conditionItem: {
    textAlign: 'center',
  },
  conditionValue: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-2xl)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    letterSpacing: 'var(--letter-spacing-wider)',
  },
  conditionLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-dim)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wide)',
    marginTop: 'var(--space-1)',
  },
  conditionMeta: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    marginTop: 'var(--space-1)',
  },
  lastUpdate: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    letterSpacing: 'var(--letter-spacing-wide)',
    textAlign: 'right',
    paddingTop: 'var(--space-2)',
    borderTop: '1px solid var(--color-border)',
  },

  // Two column
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-4)',
    alignItems: 'start',
  },

  // Form
  fieldRow: {
    marginBottom: 'var(--space-4)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  actionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginTop: 'var(--space-2)',
    paddingTop: 'var(--space-3)',
    borderTop: '1px solid var(--color-border)',
  },
  statusSuccess: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  statusError: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-red-alert)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },

  // History
  emptyLog: {
    textAlign: 'center',
    padding: 'var(--space-6)',
    color: 'var(--color-phosphor-ghost)',
    fontFamily: 'var(--font-mono)',
  },
  historyList: {
    maxHeight: '400px',
    overflowY: 'auto',
  },
  historyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--space-2) 0',
    borderBottom: '1px solid var(--color-border)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
  },
  historyTime: {
    color: 'var(--color-phosphor-ghost)',
    fontSize: 'var(--text-xs)',
    minWidth: '140px',
    flexShrink: 0,
  },
  historyRain: {
    color: 'var(--color-phosphor-primary)',
    minWidth: '60px',
  },
  historyTemp: {
    color: 'var(--color-amber)',
    minWidth: '50px',
  },
  historySource: {
    color: 'var(--color-phosphor-ghost)',
    fontSize: 'var(--text-xs)',
    flex: 1,
  },
};

export default IrrigationWeather;
