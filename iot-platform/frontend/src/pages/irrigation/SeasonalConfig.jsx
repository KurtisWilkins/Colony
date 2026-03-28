import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Badge, AlertBanner, Loader, Input, Toggle } from '../../components/ui';
import DeviceSelector from '../../components/DeviceSelector';
import {
  getSeasonalConfigs,
  updateSeasonalConfig,
  deleteSeasonalConfig,
} from '../../utils/api';

// ── Constants ────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MAX_SLOTS = 8;

function defaultConfig(index) {
  return {
    index,
    name: '',
    start_month: 1,
    end_month: 12,
    runtime_multiplier: 1.0,
    skip_if_rained: false,
    rain_threshold_mm: 10,
    enabled: false,
  };
}

function formatDateRange(cfg) {
  if (!cfg || cfg.start_month == null) return '--';
  return `${MONTHS[(cfg.start_month - 1) % 12]} - ${MONTHS[(cfg.end_month - 1) % 12]}`;
}

// ── Component ────────────────────────────────────────────────────────────

function SeasonalConfig() {
  const { deviceId } = useParams();
  const navigate = useNavigate();

  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedSlot, setSelectedSlot] = useState(0);
  const [formData, setFormData] = useState(defaultConfig(0));
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────

  const fetchConfigs = useCallback(() => {
    if (!deviceId) return;
    setLoading(true);
    getSeasonalConfigs(deviceId)
      .then((data) => {
        const list = Array.isArray(data) ? data : data.configs || [];
        setConfigs(list);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [deviceId]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  // ── Load form when slot changes ────────────────────────────────────────

  useEffect(() => {
    const cfg = configs.find((c) => (c.index ?? configs.indexOf(c)) === selectedSlot);
    if (cfg) {
      setFormData({
        index: selectedSlot,
        name: cfg.name || '',
        start_month: cfg.start_month ?? 1,
        end_month: cfg.end_month ?? 12,
        runtime_multiplier: cfg.runtime_multiplier ?? 1.0,
        skip_if_rained: cfg.skip_if_rained ?? false,
        rain_threshold_mm: cfg.rain_threshold_mm ?? 10,
        enabled: cfg.enabled ?? false,
      });
    } else {
      setFormData(defaultConfig(selectedSlot));
    }
    setSaveStatus(null);
  }, [selectedSlot, configs]);

  // ── Form helpers ───────────────────────────────────────────────────────

  function updateField(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setSaveStatus(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaveStatus(null);
    try {
      await updateSeasonalConfig(deviceId, selectedSlot, formData);
      setSaveStatus('success');
      fetchConfigs();
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteSeasonalConfig(deviceId, selectedSlot);
      fetchConfigs();
      setFormData(defaultConfig(selectedSlot));
    } catch {
      setSaveStatus('error');
    } finally {
      setDeleting(false);
    }
  }

  // ── No device ──────────────────────────────────────────────────────────

  if (!deviceId) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <DeviceSelector value={deviceId} onSelect={(id) => navigate(`/devices/${id}/irrigation/seasonal`)} />
        <Card>
          <div style={styles.emptyState}>SELECT A DEVICE ABOVE TO CONFIGURE SEASONAL PROFILES</div>
        </Card>
      </div>
    );
  }

  if (loading) {
    return <Loader type="spin" text="LOADING SEASONAL CONFIGS" />;
  }

  if (error) {
    return <AlertBanner variant="error">FAILED TO LOAD: {error}</AlertBanner>;
  }

  // Build 8 slot list
  const slotList = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const cfg = configs.find((c) => (c.index ?? configs.indexOf(c)) === i);
    slotList.push(cfg || null);
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <DeviceSelector value={deviceId} onSelect={(id) => navigate(`/devices/${id}/irrigation/seasonal`)} />

      <div style={styles.twoPanel}>
        {/* ═══ LEFT PANEL: CONFIG SLOTS ═══ */}
        <div style={styles.leftPanel}>
          <Card title="Seasonal Profiles">
            {slotList.map((cfg, i) => {
              const isSelected = selectedSlot === i;
              const isEmpty = !cfg || !cfg.name;
              return (
                <div
                  key={i}
                  onClick={() => setSelectedSlot(i)}
                  style={{
                    ...styles.slotCard,
                    borderLeft: isSelected ? '3px solid var(--color-phosphor-primary)' : '3px solid transparent',
                    background: isSelected ? 'var(--color-phosphor-glow)' : 'transparent',
                    cursor: 'pointer',
                    opacity: isEmpty ? 0.5 : 1,
                  }}
                >
                  <div style={styles.slotHeader}>
                    <span style={styles.slotIndex}>#{i + 1}</span>
                    <span style={styles.slotName}>
                      {cfg?.name || '[ EMPTY ]'}
                    </span>
                    {cfg?.enabled && <Badge variant="online">ON</Badge>}
                  </div>
                  {cfg && (
                    <div style={styles.slotMeta}>
                      {formatDateRange(cfg)}
                      <span style={styles.slotMultiplier}>{cfg.runtime_multiplier?.toFixed(1)}x</span>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </div>

        {/* ═══ RIGHT PANEL: EDITOR ═══ */}
        <div style={styles.rightPanel}>
          <Card title={`Profile #${selectedSlot + 1}`}>
            {/* Name */}
            <Input
              label="Profile Name"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="e.g. Summer, Winter Dormant"
            />

            {/* Enable */}
            <div style={styles.fieldRow}>
              <Toggle
                checked={formData.enabled}
                onChange={(v) => updateField('enabled', v)}
                label="ENABLED"
              />
            </div>

            {/* Date range */}
            <div style={styles.fieldGroup}>
              <div style={styles.sectionLabel}>DATE RANGE</div>
              <div style={styles.dateRow}>
                <div style={styles.dateField}>
                  <label style={styles.dateLabel}>START MONTH</label>
                  <select
                    value={formData.start_month}
                    onChange={(e) => updateField('start_month', Number(e.target.value))}
                    style={styles.selectField}
                  >
                    {MONTHS.map((m, idx) => (
                      <option key={idx} value={idx + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div style={styles.dateField}>
                  <label style={styles.dateLabel}>END MONTH</label>
                  <select
                    value={formData.end_month}
                    onChange={(e) => updateField('end_month', Number(e.target.value))}
                    style={styles.selectField}
                  >
                    {MONTHS.map((m, idx) => (
                      <option key={idx} value={idx + 1}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Runtime multiplier slider */}
            <div style={styles.fieldGroup}>
              <div style={styles.sectionLabel}>
                RUNTIME MULTIPLIER: {formData.runtime_multiplier.toFixed(1)}x
              </div>
              <div style={styles.sliderRow}>
                <span style={styles.sliderLabel}>0.1x</span>
                <input
                  type="range"
                  min={0.1}
                  max={2.0}
                  step={0.1}
                  value={formData.runtime_multiplier}
                  onChange={(e) => updateField('runtime_multiplier', parseFloat(e.target.value))}
                  style={styles.slider}
                />
                <span style={styles.sliderLabel}>2.0x</span>
              </div>
              <div style={styles.multiplierBar}>
                <div
                  style={{
                    ...styles.multiplierFill,
                    width: `${((formData.runtime_multiplier - 0.1) / 1.9) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* Skip if rained */}
            <div style={styles.fieldRow}>
              <Toggle
                checked={formData.skip_if_rained}
                onChange={(v) => updateField('skip_if_rained', v)}
                label="SKIP IF RAINED"
              />
            </div>

            {/* Rain threshold */}
            {formData.skip_if_rained && (
              <Input
                label="Rain Threshold (mm)"
                type="number"
                min={1}
                max={100}
                step={1}
                value={formData.rain_threshold_mm}
                onChange={(e) => updateField('rain_threshold_mm', Number(e.target.value) || 10)}
              />
            )}

            {/* Actions */}
            <div style={styles.actionRow}>
              <Button
                variant="primary"
                size="lg"
                loading={saving}
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? null : 'SAVE'}
              </Button>
              <Button
                variant="danger"
                size="md"
                loading={deleting}
                disabled={deleting || !slotList[selectedSlot]}
                onClick={handleDelete}
              >
                DELETE
              </Button>
              {saveStatus === 'success' && (
                <span style={styles.saveSuccess}>SAVED</span>
              )}
              {saveStatus === 'error' && (
                <span style={styles.saveError}>FAILED</span>
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

  // Slot cards
  slotCard: {
    padding: 'var(--space-3) var(--space-3)',
    borderBottom: '1px solid var(--color-border)',
    transition: 'all var(--transition-fast)',
  },
  slotHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  slotIndex: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    minWidth: '20px',
  },
  slotName: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-primary)',
    flex: 1,
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  slotMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    marginTop: 'var(--space-1)',
    paddingLeft: '20px',
  },
  slotMultiplier: {
    color: 'var(--color-amber)',
  },

  // Editor
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
  dateRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-3)',
  },
  dateField: {},
  dateLabel: {
    display: 'block',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    letterSpacing: 'var(--letter-spacing-wide)',
    marginBottom: 'var(--space-1)',
  },
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

  // Slider
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  slider: {
    flex: 1,
    accentColor: 'var(--color-phosphor-primary)',
    cursor: 'pointer',
  },
  sliderLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    minWidth: '30px',
  },
  multiplierBar: {
    height: '4px',
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: '2px',
    overflow: 'hidden',
    marginTop: 'var(--space-2)',
  },
  multiplierFill: {
    height: '100%',
    background: 'var(--color-phosphor-primary)',
    boxShadow: '0 0 6px rgba(0,255,65,0.5)',
    transition: 'width 0.2s ease',
  },

  // Actions
  actionRow: {
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

export default SeasonalConfig;
