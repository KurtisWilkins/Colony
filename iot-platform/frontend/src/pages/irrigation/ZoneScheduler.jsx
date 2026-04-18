import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Badge, AlertBanner, Loader, Input, Toggle } from '../../components/ui';
import DeviceSelector from '../../components/DeviceSelector';
import {
  getIrrigationZones,
  getIrrigationSchedules,
  updateIrrigationSchedule,
  getSeasonalConfigs,
} from '../../utils/api';

// ── Constants ────────────────────────────────────────────────────────────

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_RUN_TIMES = 4;

// ── Helpers ──────────────────────────────────────────────────────────────

function padTwo(n) {
  return String(n).padStart(2, '0');
}

function formatScheduleSummary(schedule) {
  if (!schedule) return 'No schedule';
  const times = (schedule.run_times || []).length;
  const days = (schedule.days || []).filter(Boolean).length;
  if (times === 0 || days === 0) return 'Not configured';
  const runtime = schedule.runtime_s ? `${Math.floor(schedule.runtime_s / 60)}m` : '--';
  return `${times} run${times > 1 ? 's' : ''}, ${days} day${days > 1 ? 's' : ''}, ${runtime} each`;
}

function defaultSchedule(zoneIndex) {
  return {
    zone_index: zoneIndex,
    enabled: false,
    runtime_s: 300,
    run_times: [],
    days: [false, false, false, false, false, false, false],
    seasonal_config: null,
  };
}

// ── Component ────────────────────────────────────────────────────────────

function ZoneScheduler() {
  const { deviceId } = useParams();
  const navigate = useNavigate();

  const [zones, setZones] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [seasonalConfigs, setSeasonalConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedZone, setSelectedZone] = useState(0);
  const [formData, setFormData] = useState(defaultSchedule(0));
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null

  // ── Fetch data ─────────────────────────────────────────────────────────

  const fetchAll = useCallback(() => {
    if (!deviceId) return;
    setLoading(true);
    Promise.all([
      getIrrigationZones(deviceId).catch(() => []),
      getIrrigationSchedules(deviceId).catch(() => []),
      getSeasonalConfigs(deviceId).catch(() => []),
    ])
      .then(([zData, sData, scData]) => {
        const zList = Array.isArray(zData) ? zData : zData.zones || [];
        const sList = Array.isArray(sData) ? sData : sData.schedules || [];
        const scList = Array.isArray(scData) ? scData : scData.configs || [];
        setZones(zList);
        setSchedules(sList);
        setSeasonalConfigs(scList);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [deviceId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Load form data when zone changes ───────────────────────────────────

  useEffect(() => {
    const sched = schedules.find((s) => s.zone_index === selectedZone);
    if (sched) {
      setFormData({
        zone_index: selectedZone,
        enabled: sched.enabled ?? false,
        runtime_s: sched.runtime_s ?? 300,
        run_times: (sched.run_times || []).map((t) => ({
          hour: t.hour ?? 0,
          minute: t.minute ?? 0,
        })),
        days: sched.days || [false, false, false, false, false, false, false],
        seasonal_config: sched.seasonal_config ?? null,
        name: sched.name || zones[selectedZone]?.name || `Zone ${selectedZone + 1}`,
      });
    } else {
      setFormData({
        ...defaultSchedule(selectedZone),
        name: zones[selectedZone]?.name || `Zone ${selectedZone + 1}`,
      });
    }
    setSaveStatus(null);
  }, [selectedZone, schedules, zones]);

  // ── Form updaters ──────────────────────────────────────────────────────

  function updateField(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setSaveStatus(null);
  }

  function updateRunTime(idx, field, value) {
    setFormData((prev) => {
      const times = [...prev.run_times];
      times[idx] = { ...times[idx], [field]: Math.max(0, Math.min(field === 'hour' ? 23 : 59, Number(value) || 0)) };
      return { ...prev, run_times: times };
    });
    setSaveStatus(null);
  }

  function addRunTime() {
    if (formData.run_times.length >= MAX_RUN_TIMES) return;
    setFormData((prev) => ({
      ...prev,
      run_times: [...prev.run_times, { hour: 6, minute: 0 }],
    }));
    setSaveStatus(null);
  }

  function removeRunTime(idx) {
    setFormData((prev) => ({
      ...prev,
      run_times: prev.run_times.filter((_, i) => i !== idx),
    }));
    setSaveStatus(null);
  }

  function toggleDay(dayIdx) {
    setFormData((prev) => {
      const days = [...prev.days];
      days[dayIdx] = !days[dayIdx];
      return { ...prev, days };
    });
    setSaveStatus(null);
  }

  function setDayPreset(preset) {
    let days;
    if (preset === 'everyday') {
      days = [true, true, true, true, true, true, true];
    } else if (preset === 'weekdays') {
      days = [false, true, true, true, true, true, false];
    } else if (preset === 'weekends') {
      days = [true, false, false, false, false, false, true];
    }
    setFormData((prev) => ({ ...prev, days }));
    setSaveStatus(null);
  }

  // ── Save ───────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setSaveStatus(null);
    try {
      await updateIrrigationSchedule(deviceId, selectedZone, formData);
      setSaveStatus('success');
      fetchAll();
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }

  // ── No device selected ─────────────────────────────────────────────────

  if (!deviceId) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <DeviceSelector value={deviceId} onSelect={(id) => navigate(`/devices/${id}/irrigation/schedules`)} />
        <Card>
          <div style={styles.emptyState}>SELECT A DEVICE ABOVE TO CONFIGURE SCHEDULES</div>
        </Card>
      </div>
    );
  }

  if (loading) {
    return <Loader type="spin" text="LOADING SCHEDULES" />;
  }

  if (error) {
    return <AlertBanner variant="error">FAILED TO LOAD SCHEDULES: {error}</AlertBanner>;
  }

  // Build 16-zone list
  const zoneList = [];
  for (let i = 0; i < 16; i++) {
    const z = zones[i] || { name: `Zone ${i + 1}`, enabled: false };
    const s = schedules.find((sc) => sc.zone_index === i);
    zoneList.push({ ...z, zone_index: i, schedule: s });
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <DeviceSelector value={deviceId} onSelect={(id) => navigate(`/devices/${id}/irrigation/schedules`)} />

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-phosphor-ghost)', marginBottom: 'var(--space-4)', lineHeight: 'var(--leading-relaxed)' }}>
        {'📅'} Set watering schedules for each zone. Each zone supports up to 4 run times per day with day-of-week selection. Seasonal configs can override runtime durations based on date ranges and weather conditions.
      </div>

      <div style={styles.twoPanel}>
        {/* ═══ LEFT PANEL: ZONE LIST ═══ */}
        <div style={styles.leftPanel}>
          <Card title="Zones">
            {zoneList.map((z, i) => {
              const isSelected = selectedZone === i;
              return (
                <div
                  key={i}
                  onClick={() => setSelectedZone(i)}
                  style={{
                    ...styles.zoneListItem,
                    borderLeft: isSelected ? '3px solid var(--color-phosphor-primary)' : '3px solid transparent',
                    background: isSelected ? 'var(--color-phosphor-glow)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={styles.zoneListHeader}>
                    <span style={styles.zoneListName}>
                      Z{i + 1} {z.name || `Zone ${i + 1}`}
                    </span>
                    {z.schedule?.enabled && <Badge variant="online">ACTIVE</Badge>}
                  </div>
                  <div style={styles.zoneListSummary}>
                    {formatScheduleSummary(z.schedule)}
                  </div>
                </div>
              );
            })}
          </Card>
        </div>

        {/* ═══ RIGHT PANEL: SCHEDULE EDITOR ═══ */}
        <div style={styles.rightPanel}>
          <Card title={`Schedule — Zone ${selectedZone + 1}`}>
            {/* Zone name */}
            <div style={styles.fieldGroup}>
              <Input
                label="Zone Name"
                value={formData.name || ''}
                onChange={(e) => updateField('name', e.target.value)}
              />
            </div>

            {/* Enable toggle */}
            <div style={styles.fieldRow}>
              <Toggle
                checked={formData.enabled}
                onChange={(v) => updateField('enabled', v)}
                label="SCHEDULE ENABLED"
              />
            </div>

            {/* Runtime */}
            <div style={styles.fieldGroup}>
              <Input
                label="Runtime (seconds)"
                type="number"
                min={10}
                max={7200}
                step={10}
                value={formData.runtime_s}
                onChange={(e) => updateField('runtime_s', Number(e.target.value) || 300)}
              />
              <span style={styles.runtimeHint}>
                = {Math.floor((formData.runtime_s || 0) / 60)}m {(formData.runtime_s || 0) % 60}s
              </span>
            </div>

            {/* Run times */}
            <div style={styles.fieldGroup}>
              <div style={styles.sectionLabel}>RUN TIMES</div>
              {formData.run_times.map((rt, idx) => (
                <div key={idx} style={styles.runTimeRow}>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={rt.hour}
                    onChange={(e) => updateRunTime(idx, 'hour', e.target.value)}
                    style={styles.timeInput}
                  />
                  <span style={styles.timeSep}>:</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={padTwo(rt.minute)}
                    onChange={(e) => updateRunTime(idx, 'minute', e.target.value)}
                    style={styles.timeInput}
                  />
                  <Button variant="danger" size="sm" onClick={() => removeRunTime(idx)}>
                    X
                  </Button>
                </div>
              ))}
              {formData.run_times.length < MAX_RUN_TIMES && (
                <Button variant="secondary" size="sm" onClick={addRunTime}>
                  + ADD TIME
                </Button>
              )}
            </div>

            {/* Days of week */}
            <div style={styles.fieldGroup}>
              <div style={styles.sectionLabel}>DAYS OF WEEK</div>
              <div style={styles.dayRow}>
                {DAY_LABELS.map((label, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    style={{
                      ...styles.dayButton,
                      background: formData.days[idx] ? 'var(--color-phosphor-glow)' : 'var(--color-bg-input)',
                      borderColor: formData.days[idx] ? 'var(--color-phosphor-primary)' : 'var(--color-border)',
                      color: formData.days[idx] ? 'var(--color-phosphor-bright)' : 'var(--color-phosphor-ghost)',
                      boxShadow: formData.days[idx] ? 'var(--glow-sm)' : 'none',
                    }}
                    title={DAY_NAMES[idx]}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={styles.presetRow}>
                <Button variant="ghost" size="sm" onClick={() => setDayPreset('everyday')}>EVERYDAY</Button>
                <Button variant="ghost" size="sm" onClick={() => setDayPreset('weekdays')}>WEEKDAYS</Button>
                <Button variant="ghost" size="sm" onClick={() => setDayPreset('weekends')}>WEEKENDS</Button>
              </div>
            </div>

            {/* Seasonal config */}
            <div style={styles.fieldGroup}>
              <div style={styles.sectionLabel}>SEASONAL CONFIG</div>
              <select
                value={formData.seasonal_config ?? ''}
                onChange={(e) => updateField('seasonal_config', e.target.value === '' ? null : Number(e.target.value))}
                style={styles.selectField}
              >
                <option value="">-- None --</option>
                {seasonalConfigs.map((sc, idx) => (
                  <option key={idx} value={sc.index ?? idx}>
                    {sc.name || `Config ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Save */}
            <div style={styles.saveRow}>
              <Button
                variant="primary"
                size="lg"
                loading={saving}
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? null : 'SAVE AND PUSH'}
              </Button>
              {saveStatus === 'success' && (
                <span style={styles.saveSuccess}>SAVED</span>
              )}
              {saveStatus === 'error' && (
                <span style={styles.saveError}>SAVE FAILED</span>
              )}
            </div>
          </Card>
        </div>
      </div>
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
  twoPanel: {
    display: 'grid',
    gridTemplateColumns: '320px 1fr',
    gap: 'var(--space-4)',
    alignItems: 'start',
  },
  leftPanel: {},
  rightPanel: {},

  // Zone list
  zoneListItem: {
    padding: 'var(--space-2) var(--space-3)',
    borderBottom: '1px solid var(--color-border)',
    transition: 'all var(--transition-fast)',
  },
  zoneListHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-2)',
  },
  zoneListName: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-primary)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  zoneListSummary: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    marginTop: 'var(--space-1)',
  },

  // Editor fields
  fieldGroup: {
    marginBottom: 'var(--space-4)',
  },
  fieldRow: {
    marginBottom: 'var(--space-4)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  sectionLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wider)',
    marginBottom: 'var(--space-2)',
  },
  runtimeHint: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    marginTop: '-12px',
    display: 'block',
  },

  // Run times
  runTimeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
  },
  timeInput: {
    width: '55px',
    padding: 'var(--space-1) var(--space-2)',
    background: 'var(--color-bg-input)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-phosphor-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-base)',
    textAlign: 'center',
    outline: 'none',
  },
  timeSep: {
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-phosphor-dim)',
    fontSize: 'var(--text-lg)',
  },

  // Days
  dayRow: {
    display: 'flex',
    gap: 'var(--space-1)',
    marginBottom: 'var(--space-2)',
  },
  dayButton: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    letterSpacing: 0,
    padding: 0,
  },
  presetRow: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  // Seasonal select
  selectField: {
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    background: 'var(--color-bg-input)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-phosphor-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-base)',
    appearance: 'none',
    WebkitAppearance: 'none',
    cursor: 'pointer',
    outline: 'none',
  },

  // Save
  saveRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginTop: 'var(--space-4)',
    paddingTop: 'var(--space-4)',
    borderTop: '1px solid var(--color-border)',
  },
  saveSuccess: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  saveError: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-red-alert)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
};

export default ZoneScheduler;
