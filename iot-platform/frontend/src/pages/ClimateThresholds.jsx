import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Input,
  AlertBanner,
  Badge,
  Toggle,
  Loader,
  GaugeBar,
  ActuatorIndicator,
} from '../components/ui';
import DeviceSelector from '../components/DeviceSelector';
import {
  getClimateThresholds,
  updateClimateThresholds,
  enableClimate,
  disableClimate,
  getDeviceState,
} from '../utils/api';

// ── Defaults ────────────────────────────────────────────────────────────

const DEFAULTS = {
  heat_on_c: 18.0,
  heat_off_c: 20.0,
  cool_on_c: 28.0,
  cool_off_c: 26.0,
  heater_safety_timeout_min: 30,
  cooling_safety_timeout_min: 30,
  dehumid_on_pct: 85,
  dehumid_off_pct: 75,
  schedule_enabled: false,
  day_start_hour: 6,
  night_start_hour: 22,
  night_heat_on_c: 15.0,
  night_heat_off_c: 17.0,
  night_cool_on_c: 30.0,
  night_cool_off_c: 28.0,
};

// ── Component ───────────────────────────────────────────────────────────

function ClimateThresholds() {
  const { deviceId } = useParams();
  const navigate = useNavigate();

  const [config, setConfig] = useState(null);
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [form, setForm] = useState({ ...DEFAULTS });

  // ── Fetch climate config + device state ────────────────────────────

  const fetchData = useCallback(() => {
    if (!deviceId) return;
    Promise.all([
      getClimateThresholds(deviceId).catch(() => null),
      getDeviceState(deviceId).catch(() => null),
    ]).then(([climateData, deviceData]) => {
      if (climateData) {
        setConfig(climateData);
        setForm((prev) => ({ ...prev, ...climateData }));
      }
      if (deviceData) setDevice(deviceData);
      setError(null);
    }).catch((err) => {
      setError(err.message);
    }).finally(() => setLoading(false));
  }, [deviceId]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [fetchData]);

  // ── Form helpers ──────────────────────────────────────────────────

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSuccess(null);
  }

  function numField(field) {
    return {
      type: 'number',
      step: '0.5',
      value: form[field] ?? '',
      onChange: (e) => setField(field, e.target.value === '' ? '' : Number(e.target.value)),
      style: styles.input,
    };
  }

  function intField(field) {
    return {
      type: 'number',
      step: '1',
      value: form[field] ?? '',
      onChange: (e) => setField(field, e.target.value === '' ? '' : Number(e.target.value)),
      style: styles.input,
    };
  }

  // ── Validation ────────────────────────────────────────────────────

  function validate() {
    const errors = [];
    if (form.heat_off_c <= form.heat_on_c) {
      errors.push('Heat OFF must be greater than Heat ON (hysteresis).');
    }
    if (form.cool_off_c >= form.cool_on_c) {
      errors.push('Cool OFF must be less than Cool ON (hysteresis).');
    }
    if (form.heat_off_c >= form.cool_off_c) {
      errors.push('Heat OFF must be below Cool OFF to avoid mutual conflict.');
    }
    if (form.dehumid_off_pct >= form.dehumid_on_pct) {
      errors.push('Dehumid OFF must be less than Dehumid ON (hysteresis).');
    }
    if (form.schedule_enabled) {
      if (form.night_heat_off_c <= form.night_heat_on_c) {
        errors.push('Night Heat OFF must be greater than Night Heat ON.');
      }
      if (form.night_cool_off_c >= form.night_cool_on_c) {
        errors.push('Night Cool OFF must be less than Night Cool ON.');
      }
    }
    return errors;
  }

  // ── Save ──────────────────────────────────────────────────────────

  async function handleSave() {
    const errors = validate();
    if (errors.length > 0) {
      setError(errors.join(' '));
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateClimateThresholds(deviceId, form);
      setSuccess('CONFIGURATION PUSHED TO DEVICE');
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setForm({ ...DEFAULTS });
    setSuccess(null);
    setError(null);
  }

  // ── Toggle climate automation ─────────────────────────────────────

  async function handleToggleClimate(enabled) {
    try {
      if (enabled) {
        await enableClimate(deviceId);
      } else {
        await disableClimate(deviceId);
      }
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  }

  // ── Derived state from device ─────────────────────────────────────

  const p = device?.latest_telemetry?.payload || device?.sensors || device || {};
  const temperature = p.temperature ?? p.temp_c ?? null;
  const humidity = p.humidity ?? p.humidity_pct ?? null;
  const heaterOn = p.heater_on ?? false;
  const coolingOn = p.cooling_on ?? false;
  const dehumidOn = p.dehumidifier_on ?? false;
  const climateEnabled = config?.climate_enabled ?? p.climate_enabled ?? true;
  const climateMode = p.climate_mode ?? 'day';

  // ── No device selected ────────────────────────────────────────────

  if (!deviceId) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <DeviceSelector
          value={deviceId}
          onSelect={(id) => navigate(`/devices/${id}/climate`)}
        />
        <Card>
          <div style={styles.emptyState}>SELECT A DEVICE ABOVE TO CONFIGURE CLIMATE CONTROL</div>
        </Card>
      </div>
    );
  }

  if (loading && !config) {
    return <Loader type="spin" text="LOADING CLIMATE CONFIG" />;
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <DeviceSelector
        value={deviceId}
        onSelect={(id) => navigate(`/devices/${id}/climate`)}
      />

      <h1 style={styles.pageTitle}>CLIMATE CONTROL</h1>

      {error && <AlertBanner variant="error">{error}</AlertBanner>}
      {success && <AlertBanner variant="success">{success}</AlertBanner>}

      {/* Master toggle + mode badge */}
      <div style={styles.headerRow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Toggle
            label="CLIMATE AUTOMATION"
            checked={climateEnabled}
            onChange={handleToggleClimate}
          />
          <Badge variant={climateMode === 'day' ? 'online' : 'warning'}>
            {climateMode === 'day' ? 'DAY MODE' : 'NIGHT MODE'}
          </Badge>
        </div>
      </div>

      {/* ═══ SECTION 1: LIVE STATUS ═══ */}
      <Card title="[ LIVE STATUS ]" style={{ marginBottom: 'var(--space-4)' }}>
        <GaugeBar
          label="TEMPERATURE"
          value={temperature}
          min={0}
          max={50}
          warningLow={form.heat_on_c + 1}
          criticalLow={form.heat_on_c}
          warningHigh={form.cool_on_c - 1}
          criticalHigh={form.cool_on_c}
          unit="°C"
        />
        <GaugeBar
          label="HUMIDITY"
          value={humidity}
          min={0}
          max={100}
          warningHigh={form.dehumid_on_pct - 5}
          criticalHigh={form.dehumid_on_pct}
          unit="%"
        />
        <div style={styles.actuatorRow}>
          <ActuatorIndicator label="HEATER" active={heaterOn} activeColor="amber" />
          <ActuatorIndicator label="COOLING" active={coolingOn} activeColor="cyan" />
          <ActuatorIndicator label="DEHUMID" active={dehumidOn} />
        </div>
      </Card>

      {/* ═══ SECTION 2: TEMPERATURE THRESHOLDS ═══ */}
      <Card title="[ TEMPERATURE THRESHOLDS ]" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={styles.twoCol}>
          {/* Heating */}
          <div style={styles.colPanel}>
            <h3 style={styles.sectionLabel}>HEATING</h3>
            <label style={styles.fieldLabel}>Heat ON below (°C)</label>
            <input {...numField('heat_on_c')} />
            <label style={styles.fieldLabel}>Heat OFF above (°C)</label>
            <input {...numField('heat_off_c')} />
            {form.heat_off_c <= form.heat_on_c && (
              <div style={styles.validationError}>Heat OFF must be &gt; Heat ON</div>
            )}
            <label style={styles.fieldLabel}>Heater Safety Timeout (min)</label>
            <input {...intField('heater_safety_timeout_min')} />
          </div>

          {/* Cooling */}
          <div style={styles.colPanel}>
            <h3 style={styles.sectionLabel}>COOLING</h3>
            <label style={styles.fieldLabel}>Cool ON above (°C)</label>
            <input {...numField('cool_on_c')} />
            <label style={styles.fieldLabel}>Cool OFF below (°C)</label>
            <input {...numField('cool_off_c')} />
            {form.cool_off_c >= form.cool_on_c && (
              <div style={styles.validationError}>Cool OFF must be &lt; Cool ON</div>
            )}
            <label style={styles.fieldLabel}>Cooling Safety Timeout (min)</label>
            <input {...intField('cooling_safety_timeout_min')} />
          </div>
        </div>

        <div style={styles.note}>
          Heater and cooler are mutually exclusive — only one can be active at a time. If both thresholds overlap, the system will prefer cooling.
        </div>
      </Card>

      {/* ═══ SECTION 3: HUMIDITY THRESHOLDS ═══ */}
      <Card title="[ HUMIDITY THRESHOLDS ]" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={styles.twoCol}>
          <div>
            <label style={styles.fieldLabel}>Dehumidifier ON above (%)</label>
            <input {...numField('dehumid_on_pct')} />
          </div>
          <div>
            <label style={styles.fieldLabel}>Dehumidifier OFF below (%)</label>
            <input {...numField('dehumid_off_pct')} />
          </div>
        </div>
        {form.dehumid_off_pct >= form.dehumid_on_pct && (
          <div style={styles.validationError}>Dehumid OFF must be &lt; Dehumid ON</div>
        )}
        <div style={styles.note}>
          Dehumidifier operates independently of heater/cooler. Priority is given to dehumidification when humidity exceeds thresholds.
        </div>
      </Card>

      {/* ═══ SECTION 4: DAY/NIGHT SCHEDULE ═══ */}
      <Card title="[ DAY / NIGHT SCHEDULE ]" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <Toggle
            label="ENABLE SCHEDULE"
            checked={form.schedule_enabled}
            onChange={(v) => setField('schedule_enabled', v)}
          />
        </div>

        {form.schedule_enabled && (
          <>
            <div style={styles.twoCol}>
              <div>
                <label style={styles.fieldLabel}>Day Start Hour (0-23)</label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  step="1"
                  value={form.day_start_hour ?? 6}
                  onChange={(e) => setField('day_start_hour', Number(e.target.value))}
                  style={styles.input}
                />
              </div>
              <div>
                <label style={styles.fieldLabel}>Night Start Hour (0-23)</label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  step="1"
                  value={form.night_start_hour ?? 22}
                  onChange={(e) => setField('night_start_hour', Number(e.target.value))}
                  style={styles.input}
                />
              </div>
            </div>

            <div style={styles.scheduleDisplay}>
              DAY: {String(form.day_start_hour).padStart(2, '0')}:00 &mdash; {String(form.night_start_hour).padStart(2, '0')}:00
              &nbsp;&nbsp;|&nbsp;&nbsp;
              NIGHT: {String(form.night_start_hour).padStart(2, '0')}:00 &mdash; {String(form.day_start_hour).padStart(2, '0')}:00
            </div>

            <h3 style={{ ...styles.sectionLabel, marginTop: 'var(--space-4)' }}>NIGHT THRESHOLDS</h3>
            <div style={styles.twoCol}>
              <div>
                <label style={styles.fieldLabel}>Night Heat ON (°C)</label>
                <input {...numField('night_heat_on_c')} />
                <label style={styles.fieldLabel}>Night Heat OFF (°C)</label>
                <input {...numField('night_heat_off_c')} />
                {form.night_heat_off_c <= form.night_heat_on_c && (
                  <div style={styles.validationError}>Night Heat OFF must be &gt; Night Heat ON</div>
                )}
              </div>
              <div>
                <label style={styles.fieldLabel}>Night Cool ON (°C)</label>
                <input {...numField('night_cool_on_c')} />
                <label style={styles.fieldLabel}>Night Cool OFF (°C)</label>
                <input {...numField('night_cool_off_c')} />
                {form.night_cool_off_c >= form.night_cool_on_c && (
                  <div style={styles.validationError}>Night Cool OFF must be &lt; Night Cool ON</div>
                )}
              </div>
            </div>
          </>
        )}
      </Card>

      {/* ═══ SECTION 5: ACTIONS ═══ */}
      <div style={styles.actionRow}>
        <Button
          loading={saving}
          onClick={handleSave}
        >
          SAVE AND PUSH TO DEVICE
        </Button>
        <Button variant="ghost" onClick={handleReset}>
          RESET TO DEFAULTS
        </Button>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = {
  pageTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-2xl)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    letterSpacing: 'var(--letter-spacing-wider)',
    margin: '0 0 var(--space-4) 0',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-4)',
    padding: 'var(--space-3) var(--space-4)',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
  },
  emptyState: {
    textAlign: 'center',
    padding: 'var(--space-6)',
    color: 'var(--color-phosphor-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    textShadow: 'var(--glow-text)',
  },
  actuatorRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-3)',
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-4)',
  },
  colPanel: {
    padding: 'var(--space-3)',
    background: 'var(--color-bg-base)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
  },
  sectionLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    letterSpacing: 'var(--letter-spacing-wider)',
    marginTop: 0,
    marginBottom: 'var(--space-3)',
    fontWeight: 'normal',
  },
  fieldLabel: {
    display: 'block',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    letterSpacing: 'var(--letter-spacing-wide)',
    marginBottom: 'var(--space-1)',
    marginTop: 'var(--space-2)',
  },
  input: {
    width: '100%',
    padding: 'var(--space-2)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-primary)',
    background: 'var(--color-bg-base)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    outline: 'none',
  },
  validationError: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-red-alert)',
    marginTop: 'var(--space-1)',
  },
  note: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    padding: 'var(--space-2) var(--space-3)',
    background: 'rgba(0,255,65,0.02)',
    borderLeft: '2px solid var(--color-border)',
    marginTop: 'var(--space-3)',
    lineHeight: 'var(--leading-relaxed)',
  },
  scheduleDisplay: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    padding: 'var(--space-2) var(--space-3)',
    background: 'var(--color-bg-base)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    marginTop: 'var(--space-3)',
    textAlign: 'center',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  actionRow: {
    display: 'flex',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
    marginBottom: 'var(--space-6)',
  },
};

export default ClimateThresholds;
