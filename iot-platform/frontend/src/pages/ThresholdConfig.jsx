import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Input, Button, AlertBanner, Loader } from '../components/ui';
import DeviceSelector from '../components/DeviceSelector';
import useThresholds from '../hooks/useThresholds';

const DEFAULTS = {
  humidity_on: 80,
  humidity_off: 90,
  co2_high: 1000,
  co2_normal: 900,
  co2_fan_speed: 100,
  temp_min: 18,
  temp_max: 24,
  water_low_cm: 30,
  water_full_cm: 10,
  valve_safety_minutes: 10,
  sensor_interval_seconds: 60,
  default_fan_speed: 50,
};

function formatInterval(seconds) {
  const s = Number(seconds);
  if (isNaN(s) || s <= 0) return '--';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM ? `${h}h ${remM}m` : `${h}h`;
}

function ThresholdConfig() {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const { thresholds, loading, error, save, reset, reload, dirty, setField } = useThresholds(deviceId);

  // Local form state mirrors thresholds but allows editing
  const [form, setForm] = useState({});
  const [formDirty, setFormDirty] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null
  const [saveMessage, setSaveMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const resetTimerRef = React.useRef(null);

  // Sync form from hook thresholds
  useEffect(() => {
    if (thresholds) {
      setForm({
        humidity_on: thresholds.humidity_on ?? DEFAULTS.humidity_on,
        humidity_off: thresholds.humidity_off ?? DEFAULTS.humidity_off,
        co2_high: thresholds.co2_high ?? DEFAULTS.co2_high,
        co2_normal: thresholds.co2_normal ?? DEFAULTS.co2_normal,
        co2_fan_speed: thresholds.co2_fan_speed ?? DEFAULTS.co2_fan_speed,
        temp_min: thresholds.temp_min ?? DEFAULTS.temp_min,
        temp_max: thresholds.temp_max ?? DEFAULTS.temp_max,
        water_low_cm: thresholds.water_low_cm ?? DEFAULTS.water_low_cm,
        water_full_cm: thresholds.water_full_cm ?? DEFAULTS.water_full_cm,
        valve_safety_minutes: thresholds.valve_safety_minutes ?? DEFAULTS.valve_safety_minutes,
        sensor_interval_seconds: thresholds.sensor_interval_seconds ?? DEFAULTS.sensor_interval_seconds,
        default_fan_speed: thresholds.default_fan_speed ?? DEFAULTS.default_fan_speed,
      });
      setFormDirty(false);
      setValidationErrors({});
    }
  }, [thresholds]);

  const handleChange = useCallback((key, rawValue) => {
    const value = rawValue === '' ? '' : Number(rawValue);
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      setFormDirty(true);
      return next;
    });
    // Clear validation error on change
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSaveStatus(null);
  }, []);

  const validate = useCallback(() => {
    const errors = {};
    const f = form;

    // Humidity
    if (f.humidity_on === '' || isNaN(Number(f.humidity_on))) {
      errors.humidity_on = 'Required numeric value';
    } else if (Number(f.humidity_on) < 0 || Number(f.humidity_on) > 100) {
      errors.humidity_on = 'Must be 0-100';
    }
    if (f.humidity_off === '' || isNaN(Number(f.humidity_off))) {
      errors.humidity_off = 'Required numeric value';
    } else if (Number(f.humidity_off) < 0 || Number(f.humidity_off) > 100) {
      errors.humidity_off = 'Must be 0-100';
    }
    if (!errors.humidity_on && !errors.humidity_off && Number(f.humidity_off) <= Number(f.humidity_on)) {
      errors.humidity_off = 'OFF threshold must be higher than ON threshold';
    }

    // CO2
    if (f.co2_high === '' || isNaN(Number(f.co2_high))) {
      errors.co2_high = 'Required numeric value';
    } else if (Number(f.co2_high) < 400 || Number(f.co2_high) > 5000) {
      errors.co2_high = 'Must be 400-5000';
    }
    if (f.co2_normal === '' || isNaN(Number(f.co2_normal))) {
      errors.co2_normal = 'Required numeric value';
    } else if (Number(f.co2_normal) < 400 || Number(f.co2_normal) > 5000) {
      errors.co2_normal = 'Must be 400-5000';
    }
    if (f.co2_fan_speed === '' || isNaN(Number(f.co2_fan_speed))) {
      errors.co2_fan_speed = 'Required numeric value';
    } else if (Number(f.co2_fan_speed) < 20 || Number(f.co2_fan_speed) > 100) {
      errors.co2_fan_speed = 'Must be 20-100';
    }

    // Temperature
    if (f.temp_min === '' || isNaN(Number(f.temp_min))) {
      errors.temp_min = 'Required numeric value';
    } else if (Number(f.temp_min) < 0 || Number(f.temp_min) > 40) {
      errors.temp_min = 'Must be 0-40';
    }
    if (f.temp_max === '' || isNaN(Number(f.temp_max))) {
      errors.temp_max = 'Required numeric value';
    } else if (Number(f.temp_max) < 0 || Number(f.temp_max) > 50) {
      errors.temp_max = 'Must be 0-50';
    }
    if (!errors.temp_min && !errors.temp_max && Number(f.temp_max) <= Number(f.temp_min)) {
      errors.temp_max = 'Max must be higher than min';
    }

    // Water
    if (f.water_low_cm === '' || isNaN(Number(f.water_low_cm))) {
      errors.water_low_cm = 'Required numeric value';
    } else if (Number(f.water_low_cm) < 1 || Number(f.water_low_cm) > 200) {
      errors.water_low_cm = 'Must be 1-200';
    }
    if (f.water_full_cm === '' || isNaN(Number(f.water_full_cm))) {
      errors.water_full_cm = 'Required numeric value';
    } else if (Number(f.water_full_cm) < 1 || Number(f.water_full_cm) > 200) {
      errors.water_full_cm = 'Must be 1-200';
    }
    if (!errors.water_low_cm && !errors.water_full_cm && Number(f.water_full_cm) >= Number(f.water_low_cm)) {
      errors.water_full_cm = 'Full reading must be less than low reading (closer to sensor)';
    }
    if (f.valve_safety_minutes === '' || isNaN(Number(f.valve_safety_minutes))) {
      errors.valve_safety_minutes = 'Required numeric value';
    } else if (Number(f.valve_safety_minutes) < 1 || Number(f.valve_safety_minutes) > 60) {
      errors.valve_safety_minutes = 'Must be 1-60';
    }

    // Sensor interval
    if (f.sensor_interval_seconds === '' || isNaN(Number(f.sensor_interval_seconds))) {
      errors.sensor_interval_seconds = 'Required numeric value';
    } else if (Number(f.sensor_interval_seconds) < 30 || Number(f.sensor_interval_seconds) > 3600) {
      errors.sensor_interval_seconds = 'Must be 30-3600';
    }
    if (f.default_fan_speed === '' || isNaN(Number(f.default_fan_speed))) {
      errors.default_fan_speed = 'Required numeric value';
    } else if (Number(f.default_fan_speed) < 0 || Number(f.default_fan_speed) > 100) {
      errors.default_fan_speed = 'Must be 0-100';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [form]);

  const handleSave = useCallback(async () => {
    if (!validate()) return;
    setSaving(true);
    setSaveStatus(null);

    // Push form values into the hook
    const payload = {};
    Object.keys(form).forEach((key) => {
      payload[key] = Number(form[key]);
      setField(key, Number(form[key]));
    });

    try {
      await save();
      setSaveStatus('success');
      setSaveMessage('Thresholds saved and pushed to device');
      setFormDirty(false);
    } catch (err) {
      setSaveStatus('error');
      setSaveMessage(err.message || 'Failed to save thresholds');
    } finally {
      setSaving(false);
    }
  }, [form, validate, save, setField]);

  const handleReset = useCallback(() => {
    if (!resetConfirm) {
      setResetConfirm(true);
      resetTimerRef.current = setTimeout(() => {
        setResetConfirm(false);
      }, 3000);
      return;
    }
    clearTimeout(resetTimerRef.current);
    setResetConfirm(false);
    setSaving(true);
    reset()
      .then(() => {
        setSaveStatus('success');
        setSaveMessage('Thresholds reset to factory defaults');
      })
      .catch((err) => {
        setSaveStatus('error');
        setSaveMessage(err.message || 'Failed to reset thresholds');
      })
      .finally(() => setSaving(false));
  }, [resetConfirm, reset]);

  // Cleanup reset timer
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleReload = useCallback(() => {
    setSaving(true);
    setSaveStatus(null);
    reload()
      .then(() => {
        setSaveStatus('success');
        setSaveMessage('Thresholds reloaded from device');
      })
      .catch((err) => {
        setSaveStatus('error');
        setSaveMessage(err.message || 'Failed to reload');
      })
      .finally(() => setSaving(false));
  }, [reload]);

  const handleDeviceSelect = useCallback((id) => {
    if (id) navigate(`/devices/${id}/thresholds`);
  }, [navigate]);

  // Shared input style
  const inputStyle = {
    background: 'var(--color-bg-input)',
    color: 'var(--color-phosphor-primary)',
    fontFamily: 'var(--font-mono)',
  };

  // Helper text style
  const helperStyle = {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    fontFamily: 'var(--font-mono)',
    marginTop: '-12px',
    marginBottom: 'var(--space-3)',
  };

  // Section title style for within cards
  const fieldLabel = (text) => (
    <label
      style={{
        display: 'block',
        fontSize: 'var(--text-sm)',
        color: 'var(--color-phosphor-dim)',
        textTransform: 'uppercase',
        letterSpacing: 'var(--letter-spacing-wide)',
        marginBottom: 'var(--space-1)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {text}
    </label>
  );

  if (loading && !thresholds) {
    return (
      <div style={{ padding: 'var(--space-6)', maxWidth: '1200px', margin: '0 auto' }}>
        <DeviceSelector value={deviceId} onSelect={handleDeviceSelect} />
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
          <Loader />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Device Selector */}
      <DeviceSelector value={deviceId} onSelect={handleDeviceSelect} />

      {/* Page title */}
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-2xl)',
          color: 'var(--color-phosphor-primary)',
          textShadow: 'var(--glow-text)',
          letterSpacing: 'var(--letter-spacing-wider)',
          textTransform: 'uppercase',
          marginBottom: 'var(--space-4)',
        }}
      >
        Threshold Configuration
      </h1>

      {/* Unsaved changes banner */}
      {formDirty && (
        <AlertBanner variant="warning">
          You have unsaved changes. Save and push to device to apply.
        </AlertBanner>
      )}

      {/* Save status banner */}
      {saveStatus === 'success' && (
        <AlertBanner variant="success" dismissible onDismiss={() => setSaveStatus(null)}>
          {saveMessage}
        </AlertBanner>
      )}
      {saveStatus === 'error' && (
        <AlertBanner variant="error" dismissible onDismiss={() => setSaveStatus(null)}>
          {saveMessage}
        </AlertBanner>
      )}

      {/* API error */}
      {error && !saveStatus && (
        <AlertBanner variant="error">
          {error}
        </AlertBanner>
      )}

      {/* 2x2 Grid of threshold groups */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-4)',
        }}
      >
        {/* ── HUMIDITY CONTROL ─────────────────────────────────── */}
        <Card title="HUMIDITY CONTROL" glowing>
          <div>
            {fieldLabel('Humidity ON % -- Turn ON mister + fan below this humidity')}
            <Input
              id="humidity_on"
              type="number"
              min={0}
              max={100}
              step={1}
              value={form.humidity_on ?? ''}
              onChange={(e) => handleChange('humidity_on', e.target.value)}
              error={validationErrors.humidity_on}
              style={inputStyle}
            />
            <div style={helperStyle}>Default: 80%</div>

            {fieldLabel('Humidity OFF % -- Turn OFF mister above this humidity')}
            <Input
              id="humidity_off"
              type="number"
              min={0}
              max={100}
              step={1}
              value={form.humidity_off ?? ''}
              onChange={(e) => handleChange('humidity_off', e.target.value)}
              error={validationErrors.humidity_off}
              style={inputStyle}
            />
            <div style={helperStyle}>Default: 90% -- must be higher than ON threshold</div>
          </div>
        </Card>

        {/* ── CO2 CONTROL ──────────────────────────────────────── */}
        <Card title="CO2 CONTROL">
          <div>
            {fieldLabel('CO2 HIGH ppm -- Increase fan speed above this CO2 level')}
            <Input
              id="co2_high"
              type="number"
              min={400}
              max={5000}
              step={50}
              value={form.co2_high ?? ''}
              onChange={(e) => handleChange('co2_high', e.target.value)}
              error={validationErrors.co2_high}
              style={inputStyle}
            />
            <div style={helperStyle}>Default: 1000ppm</div>

            {fieldLabel('CO2 NORMAL ppm -- Return fan to default below this')}
            <Input
              id="co2_normal"
              type="number"
              min={400}
              max={5000}
              step={50}
              value={form.co2_normal ?? ''}
              onChange={(e) => handleChange('co2_normal', e.target.value)}
              error={validationErrors.co2_normal}
              style={inputStyle}
            />
            <div style={helperStyle}>Default: 900ppm</div>

            {fieldLabel('Fan speed during high CO2 %')}
            <Input
              id="co2_fan_speed"
              type="number"
              min={20}
              max={100}
              step={5}
              value={form.co2_fan_speed ?? ''}
              onChange={(e) => handleChange('co2_fan_speed', e.target.value)}
              error={validationErrors.co2_fan_speed}
              style={inputStyle}
            />
            <div style={helperStyle}>Default: 100%</div>
          </div>
        </Card>

        {/* ── TEMPERATURE ALERTS ───────────────────────────────── */}
        <Card title="TEMPERATURE ALERTS">
          <div>
            {fieldLabel('Temp min (C)')}
            <Input
              id="temp_min"
              type="number"
              min={0}
              max={40}
              step={0.5}
              value={form.temp_min ?? ''}
              onChange={(e) => handleChange('temp_min', e.target.value)}
              error={validationErrors.temp_min}
              style={inputStyle}
            />
            <div style={helperStyle}>Default: 18C</div>

            {fieldLabel('Temp max (C)')}
            <Input
              id="temp_max"
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={form.temp_max ?? ''}
              onChange={(e) => handleChange('temp_max', e.target.value)}
              error={validationErrors.temp_max}
              style={inputStyle}
            />
            <div style={helperStyle}>Default: 24C</div>

            <div
              style={{
                padding: 'var(--space-3)',
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-amber)',
                fontFamily: 'var(--font-mono)',
                marginTop: 'var(--space-2)',
              }}
            >
              [!] Temperature is alert-only. No actuator control currently configured.
            </div>
          </div>
        </Card>

        {/* ── WATER SYSTEM ─────────────────────────────────────── */}
        <Card title="WATER SYSTEM">
          <div>
            {fieldLabel('Water low cm -- Ultrasonic distance when tank is low')}
            <Input
              id="water_low_cm"
              type="number"
              min={1}
              max={200}
              step={0.5}
              value={form.water_low_cm ?? ''}
              onChange={(e) => handleChange('water_low_cm', e.target.value)}
              error={validationErrors.water_low_cm}
              style={inputStyle}
            />
            <div style={helperStyle}>
              Greater distance = lower water level (ultrasonic measures from top)
            </div>

            {fieldLabel('Water full cm -- Ultrasonic distance when tank is full')}
            <Input
              id="water_full_cm"
              type="number"
              min={1}
              max={200}
              step={0.5}
              value={form.water_full_cm ?? ''}
              onChange={(e) => handleChange('water_full_cm', e.target.value)}
              error={validationErrors.water_full_cm}
              style={inputStyle}
            />
            <div style={helperStyle}>
              Must be less than low reading (water closer to sensor when full)
            </div>

            {fieldLabel('Valve safety timeout (minutes)')}
            <Input
              id="valve_safety_minutes"
              type="number"
              min={1}
              max={60}
              step={1}
              value={form.valve_safety_minutes ?? ''}
              onChange={(e) => handleChange('valve_safety_minutes', e.target.value)}
              error={validationErrors.valve_safety_minutes}
              style={inputStyle}
            />
            <div style={helperStyle}>Default: 10 min</div>
          </div>
        </Card>
      </div>

      {/* ── SENSOR INTERVAL ──────────────────────────────────── */}
      <Card title="SENSOR INTERVAL" style={{ marginBottom: 'var(--space-4)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <div>
            {fieldLabel('Sensor interval (seconds)')}
            <Input
              id="sensor_interval_seconds"
              type="number"
              min={30}
              max={3600}
              step={30}
              value={form.sensor_interval_seconds ?? ''}
              onChange={(e) => handleChange('sensor_interval_seconds', e.target.value)}
              error={validationErrors.sensor_interval_seconds}
              style={inputStyle}
            />
            <div
              style={{
                ...helperStyle,
                color: 'var(--color-phosphor-dim)',
              }}
            >
              = {formatInterval(form.sensor_interval_seconds)} between readings
            </div>
          </div>

          <div>
            {fieldLabel('Default fan speed %')}
            <Input
              id="default_fan_speed"
              type="number"
              min={0}
              max={100}
              step={5}
              value={form.default_fan_speed ?? ''}
              onChange={(e) => handleChange('default_fan_speed', e.target.value)}
              error={validationErrors.default_fan_speed}
              style={inputStyle}
            />
            <div style={helperStyle}>Fan speed when CO2 is in normal range</div>
          </div>
        </div>
      </Card>

      {/* ── ACTION BUTTONS ───────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
          marginBottom: 'var(--space-2)',
        }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={saving}
        >
          {resetConfirm ? 'CONFIRM RESET?' : 'RESET TO DEFAULTS'}
        </Button>

        <Button
          variant="secondary"
          size="md"
          onClick={handleReload}
          disabled={saving}
          loading={saving && !formDirty}
        >
          LOAD FROM DEVICE
        </Button>

        <Button
          variant="primary"
          size="lg"
          onClick={handleSave}
          disabled={saving || !formDirty}
          loading={saving && formDirty}
        >
          SAVE AND PUSH TO DEVICE
        </Button>
      </div>

      {/* Last updated timestamp */}
      <div
        style={{
          textAlign: 'right',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-phosphor-ghost)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: 'var(--letter-spacing-wide)',
        }}
      >
        Last updated: {thresholds?.updated_at
          ? new Date(thresholds.updated_at).toLocaleString()
          : thresholds?.timestamp
            ? new Date(thresholds.timestamp).toLocaleString()
            : '--'}
      </div>
    </div>
  );
}

export default ThresholdConfig;
