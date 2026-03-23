import React from 'react';

/**
 * Terminal-styled select component.
 * @param {object} props
 * @param {string} props.label - Label text above select
 * @param {string} props.error - Error message below select
 * @param {Array<{value: string, label: string}>} props.options - Select options
 * @param {string} props.id
 */
function Select({ label, error, options = [], id, children, style: userStyle, ...props }) {
  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      {label && (
        <label
          htmlFor={id}
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
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        <select
          id={id}
          {...props}
          style={{
            width: '100%',
            padding: 'var(--space-2) var(--space-8) var(--space-2) var(--space-3)',
            background: 'var(--color-bg-input)',
            border: `1px solid ${error ? 'var(--color-red-alert)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-phosphor-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-base)',
            appearance: 'none',
            WebkitAppearance: 'none',
            cursor: 'pointer',
            outline: 'none',
            transition: 'border-color var(--transition-base), box-shadow var(--transition-base)',
            ...userStyle,
          }}
          onFocus={(e) => {
            e.target.style.borderColor = 'var(--color-border-focus)';
            e.target.style.boxShadow = 'var(--glow-sm)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = error ? 'var(--color-red-alert)' : 'var(--color-border)';
            e.target.style.boxShadow = 'none';
          }}
        >
          {options.length > 0
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value} style={{
                  background: 'var(--color-bg-elevated)',
                  color: 'var(--color-phosphor-primary)',
                }}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <span
          style={{
            position: 'absolute',
            right: 'var(--space-3)',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-phosphor-dim)',
            pointerEvents: 'none',
            fontSize: 'var(--text-sm)',
          }}
        >
          &#9660;
        </span>
      </div>
      {error && (
        <div
          style={{
            marginTop: 'var(--space-1)',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-red-alert)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

export default Select;
