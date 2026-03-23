import React from 'react';

/**
 * Terminal-styled stat card for dashboard summary numbers.
 * @param {object} props
 * @param {string|number} props.value - Large display number
 * @param {string} props.label - Label below number
 * @param {'up'|'down'|null} props.trend - Optional trend indicator
 * @param {React.ReactNode} props.icon - Optional icon (top right)
 */
function StatCard({ value, label, trend, icon }) {
  return (
    <div
      style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        padding: 'var(--space-4)',
        position: 'relative',
        animation: 'fadeSlideIn 0.3s ease-out',
      }}
    >
      {icon && (
        <div
          style={{
            position: 'absolute',
            top: 'var(--space-3)',
            right: 'var(--space-3)',
            color: 'var(--color-phosphor-ghost)',
            fontSize: 'var(--text-lg)',
          }}
        >
          {icon}
        </div>
      )}
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-3xl)',
          color: 'var(--color-phosphor-primary)',
          textShadow: 'var(--glow-text)',
          lineHeight: 'var(--leading-tight)',
        }}
      >
        {value}
        {trend && (
          <span
            style={{
              fontSize: 'var(--text-base)',
              marginLeft: 'var(--space-2)',
              color: trend === 'up' ? 'var(--color-phosphor-bright)' : 'var(--color-red-alert)',
              textShadow: 'none',
            }}
          >
            {trend === 'up' ? '\u25B2' : '\u25BC'}
          </span>
        )}
      </div>
      <div
        style={{
          marginTop: 'var(--space-1)',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-phosphor-dim)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--letter-spacing-wide)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {label}
      </div>
    </div>
  );
}

export default StatCard;
