import React from 'react';

/**
 * Terminal-styled horizontal gauge bar with threshold coloring.
 * @param {object} props
 * @param {string}  props.label        - Gauge label (left-aligned, uppercase)
 * @param {number|null} props.value    - Current value (null = no data)
 * @param {string}  props.unit         - Display unit (e.g. "%", "F")
 * @param {number}  props.min          - Scale minimum
 * @param {number}  props.max          - Scale maximum
 * @param {number}  [props.warningLow] - Low warning threshold
 * @param {number}  [props.warningHigh]- High warning threshold
 * @param {number}  [props.criticalLow]  - Low critical threshold
 * @param {number}  [props.criticalHigh] - High critical threshold
 * @param {boolean} [props.loading]    - Show loading state
 */
function GaugeBar({
  label,
  value,
  unit = '',
  min = 0,
  max = 100,
  warningLow,
  warningHigh,
  criticalLow,
  criticalHigh,
  loading = false,
}) {
  const range = max - min || 1;
  const clamped = value != null ? Math.max(min, Math.min(max, value)) : null;
  const pct = clamped != null ? ((clamped - min) / range) * 100 : 0;

  function getBarColor() {
    if (value == null) return 'var(--color-phosphor-ghost)';
    if (criticalLow != null && value < criticalLow) return 'var(--color-red-alert)';
    if (criticalHigh != null && value > criticalHigh) return 'var(--color-red-alert)';
    if (warningLow != null && value < warningLow) return 'var(--color-amber)';
    if (warningHigh != null && value > warningHigh) return 'var(--color-amber)';
    return 'var(--color-phosphor-primary)';
  }

  function getGlow() {
    const color = getBarColor();
    if (color === 'var(--color-red-alert)') return '0 0 8px rgba(255,49,49,0.6)';
    if (color === 'var(--color-amber)') return '0 0 8px rgba(255,176,0,0.5)';
    return '0 0 8px rgba(0,255,65,0.4)';
  }

  const barColor = getBarColor();
  const hasValue = value != null && !loading;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) 0',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {/* Label */}
      <span
        style={{
          minWidth: '100px',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-phosphor-dim)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--letter-spacing-wide)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>

      {/* Bar track */}
      <div
        style={{
          flex: 1,
          height: '10px',
          background: 'var(--color-bg-elevated, #111)',
          border: '1px solid var(--color-border)',
          borderRadius: '2px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: hasValue ? `${pct}%` : '0%',
            height: '100%',
            background: barColor,
            boxShadow: hasValue ? getGlow() : 'none',
            transition: 'width 400ms ease, background-color 300ms ease',
          }}
        />
      </div>

      {/* Value */}
      <span
        style={{
          minWidth: '72px',
          textAlign: 'right',
          fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-display)',
          color: hasValue ? barColor : 'var(--color-phosphor-ghost)',
          textShadow: hasValue ? getGlow() : 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {loading
          ? '...'
          : value != null
            ? `${typeof value === 'number' ? value.toFixed(1) : value}${unit}`
            : '----'}
      </span>
    </div>
  );
}

export default GaugeBar;
