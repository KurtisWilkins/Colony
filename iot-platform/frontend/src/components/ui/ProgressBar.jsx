import React from 'react';

const variantColors = {
  default: 'var(--color-phosphor-primary)',
  warning: 'var(--color-amber)',
  danger: 'var(--color-red-alert)',
};

const variantGlows = {
  default: 'rgba(0,255,65,0.6)',
  warning: 'rgba(255,176,0,0.6)',
  danger: 'rgba(255,49,49,0.6)',
};

/**
 * Terminal-styled progress bar.
 * @param {object} props
 * @param {number} props.value - 0 to 100
 * @param {'default'|'warning'|'danger'} props.variant
 * @param {boolean} props.showLabel - Show percentage label
 */
function ProgressBar({ value = 0, variant = 'default', showLabel = false }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = variantColors[variant];
  const glow = variantGlows[variant];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <div
        style={{
          flex: 1,
          height: '8px',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${color}, ${color})`,
            boxShadow: `0 0 8px ${glow}`,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      {showLabel && (
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-phosphor-dim)',
            fontFamily: 'var(--font-mono)',
            minWidth: '3em',
            textAlign: 'right',
          }}
        >
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  );
}

export default ProgressBar;
