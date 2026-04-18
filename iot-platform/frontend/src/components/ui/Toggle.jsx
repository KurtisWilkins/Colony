import React from 'react';

/**
 * Terminal-styled toggle switch.
 * @param {object} props
 * @param {boolean} props.checked
 * @param {function} props.onChange - Called with new boolean value
 * @param {string} props.label
 */
function Toggle({ checked = false, onChange, label }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <button
        type="button"
        onClick={() => onChange?.(!checked)}
        style={{
          width: '52px',
          height: '24px',
          borderRadius: '12px',
          border: `1px solid ${checked ? 'var(--color-phosphor-primary)' : 'var(--color-phosphor-ghost)'}`,
          background: checked ? 'var(--color-phosphor-glow)' : 'var(--color-bg-input)',
          cursor: 'pointer',
          position: 'relative',
          transition: 'left var(--transition-slow), background var(--transition-base), box-shadow var(--transition-base)',
          boxShadow: checked ? 'var(--glow-sm)' : 'none',
          padding: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '2px',
            left: checked ? '28px' : '2px',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: checked ? 'var(--color-phosphor-primary)' : 'var(--color-phosphor-ghost)',
            transition: 'left var(--transition-slow), background var(--transition-base), box-shadow var(--transition-base)',
            boxShadow: checked ? 'var(--glow-sm)' : 'none',
          }}
        />
      </button>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: checked ? 'var(--color-phosphor-primary)' : 'var(--color-phosphor-ghost)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--letter-spacing-wide)',
          minWidth: '24px',
        }}
      >
        {checked ? 'ON' : 'OFF'}
      </span>
      {label && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-phosphor-dim)',
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

export default Toggle;
