import React from 'react';

const variantStyles = {
  online: {
    background: 'rgba(0, 255, 65, 0.15)',
    color: 'var(--color-phosphor-bright)',
    borderColor: 'var(--color-phosphor-ghost)',
    dot: 'var(--color-phosphor-primary)',
    defaultText: 'ONLINE',
  },
  offline: {
    background: 'var(--color-red-dim)',
    color: 'var(--color-red-alert)',
    borderColor: 'rgba(255,49,49,0.3)',
    dot: 'var(--color-red-alert)',
    defaultText: 'OFFLINE',
  },
  warning: {
    background: 'rgba(255, 176, 0, 0.15)',
    color: 'var(--color-amber)',
    borderColor: 'var(--color-amber-dim)',
    dot: 'var(--color-amber)',
    defaultText: 'WARNING',
  },
  info: {
    background: 'rgba(0, 255, 247, 0.1)',
    color: 'var(--color-cyan-accent)',
    borderColor: 'rgba(0,255,247,0.2)',
    dot: 'var(--color-cyan-accent)',
    defaultText: 'INFO',
  },
};

/**
 * Terminal-styled badge component.
 * @param {object} props
 * @param {'online'|'offline'|'warning'|'info'} props.variant
 * @param {string} props.children - Override default text
 */
function Badge({ variant = 'info', children }) {
  const v = variantStyles[variant] || variantStyles.info;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding: '2px var(--space-2)',
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--font-mono)',
        textTransform: 'uppercase',
        letterSpacing: 'var(--letter-spacing-wide)',
        background: v.background,
        color: v.color,
        border: `1px solid ${v.borderColor}`,
        borderRadius: 'var(--radius-sm)',
        lineHeight: 'var(--leading-tight)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: v.dot, fontSize: '0.5rem' }}>&#9679;</span>
      {children || v.defaultText}
    </span>
  );
}

export default Badge;
