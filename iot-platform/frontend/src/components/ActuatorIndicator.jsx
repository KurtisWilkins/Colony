import React from 'react';

const colorMap = {
  green: {
    active: 'var(--color-phosphor-primary)',
    glow: '0 0 8px rgba(0,255,65,0.6)',
    border: 'var(--color-phosphor-primary)',
  },
  amber: {
    active: 'var(--color-amber)',
    glow: '0 0 8px rgba(255,176,0,0.6)',
    border: 'var(--color-amber)',
  },
  red: {
    active: 'var(--color-red-alert)',
    glow: '0 0 8px rgba(255,49,49,0.6)',
    border: 'var(--color-red-alert)',
  },
};

/**
 * Actuator on/off indicator pill.
 * @param {object} props
 * @param {string}  props.label          - Actuator label (e.g. "FAN", "MISTER")
 * @param {boolean} props.active         - Whether actuator is on
 * @param {string}  [props.activeLabel]  - Text when active (default "ON")
 * @param {string}  [props.inactiveLabel]- Text when inactive (default "OFF")
 * @param {'green'|'amber'|'red'} [props.activeColor] - Color scheme when active
 * @param {string}  [props.info]         - Extra info text after status
 */
function ActuatorIndicator({
  label,
  active,
  activeLabel = 'ON',
  inactiveLabel = 'OFF',
  activeColor = 'green',
  info,
}) {
  const scheme = colorMap[activeColor] || colorMap.green;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        border: `1px solid ${active ? scheme.border : 'var(--color-border)'}`,
        borderRadius: '20px',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-sm)',
        background: active
          ? 'rgba(0,255,65,0.05)'
          : 'var(--color-bg-surface)',
        boxShadow: active ? scheme.glow : 'none',
        transition: 'all 300ms ease',
      }}
    >
      {/* Label */}
      <span
        style={{
          color: active ? scheme.active : 'var(--color-phosphor-dim)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--letter-spacing-wide)',
          fontSize: 'var(--text-xs)',
        }}
      >
        {label}
      </span>

      {/* Status dot */}
      <span
        style={{
          display: 'inline-block',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: active ? scheme.active : 'transparent',
          border: active ? 'none' : '1px solid var(--color-phosphor-ghost)',
          boxShadow: active ? scheme.glow : 'none',
          transition: 'all 300ms ease',
        }}
      />

      {/* Status text */}
      <span
        style={{
          color: active ? scheme.active : 'var(--color-phosphor-ghost)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--letter-spacing-wide)',
          fontSize: 'var(--text-xs)',
          textShadow: active ? scheme.glow : 'none',
        }}
      >
        {active ? activeLabel : inactiveLabel}
      </span>

      {/* Optional info */}
      {info && (
        <span
          style={{
            color: 'var(--color-phosphor-dim)',
            fontSize: 'var(--text-xs)',
            marginLeft: 'var(--space-1)',
          }}
        >
          {info}
        </span>
      )}
    </div>
  );
}

export default ActuatorIndicator;
