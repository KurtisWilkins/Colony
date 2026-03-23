import React, { useState } from 'react';

const variantConfig = {
  info: {
    borderColor: 'var(--color-cyan-accent)',
    color: 'var(--color-cyan-accent)',
    bg: 'rgba(0,255,247,0.05)',
    icon: '[i]',
  },
  warning: {
    borderColor: 'var(--color-amber)',
    color: 'var(--color-amber)',
    bg: 'rgba(255,176,0,0.05)',
    icon: '[!]',
  },
  error: {
    borderColor: 'var(--color-red-alert)',
    color: 'var(--color-red-alert)',
    bg: 'rgba(255,49,49,0.08)',
    icon: '[\u2715]',
  },
  success: {
    borderColor: 'var(--color-phosphor-primary)',
    color: 'var(--color-phosphor-primary)',
    bg: 'rgba(0,255,65,0.05)',
    icon: '[\u2713]',
  },
};

/**
 * Terminal-styled alert banner.
 * @param {object} props
 * @param {'info'|'warning'|'error'|'success'} props.variant
 * @param {React.ReactNode} props.children - Alert message
 * @param {boolean} props.dismissible - Show close button
 * @param {function} props.onDismiss - Called when dismissed
 */
function AlertBanner({ variant = 'info', children, dismissible = false, onDismiss }) {
  const [dismissed, setDismissed] = useState(false);
  const v = variantConfig[variant] || variantConfig.info;

  if (dismissed) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        background: v.bg,
        borderLeft: `4px solid ${v.borderColor}`,
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-base)',
        color: v.color,
        marginBottom: 'var(--space-4)',
        animation: 'fadeSlideIn 0.2s ease-out',
      }}
    >
      <span style={{ flexShrink: 0, fontWeight: 'bold' }}>{v.icon}</span>
      <div style={{ flex: 1 }}>{children}</div>
      {dismissible && (
        <button
          onClick={() => {
            setDismissed(true);
            onDismiss?.();
          }}
          style={{
            background: 'none',
            border: 'none',
            color: v.color,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-base)',
            opacity: 0.6,
            transition: 'opacity var(--transition-fast)',
            padding: 0,
            lineHeight: 1,
          }}
          onMouseEnter={(e) => { e.target.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.target.style.opacity = '0.6'; }}
        >
          &#10005;
        </button>
      )}
    </div>
  );
}

export default AlertBanner;
