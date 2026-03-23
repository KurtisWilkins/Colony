import React from 'react';

/**
 * Terminal-styled input component.
 * @param {object} props
 * @param {string} props.label - Label text above input
 * @param {string} props.error - Error message below input
 * @param {string} props.prefix - Prefix character (e.g., "> ")
 * @param {string} props.id
 */
function Input({ label, error, prefix = '', id, style: userStyle, ...props }) {
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
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {prefix && (
          <span
            style={{
              position: 'absolute',
              left: 'var(--space-2)',
              color: 'var(--color-phosphor-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-base)',
              pointerEvents: 'none',
            }}
          >
            {prefix}
          </span>
        )}
        <input
          id={id}
          {...props}
          style={{
            width: '100%',
            padding: 'var(--space-2) var(--space-3)',
            paddingLeft: prefix ? 'var(--space-6)' : 'var(--space-3)',
            background: 'var(--color-bg-input)',
            border: `1px solid ${error ? 'var(--color-red-alert)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-phosphor-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-base)',
            caretColor: 'var(--color-phosphor-primary)',
            transition: 'border-color var(--transition-base), box-shadow var(--transition-base)',
            outline: 'none',
            ...userStyle,
          }}
          onFocus={(e) => {
            if (!error) {
              e.target.style.borderColor = 'var(--color-border-focus)';
              e.target.style.boxShadow = 'var(--glow-sm)';
            }
            if (props.onFocus) props.onFocus(e);
          }}
          onBlur={(e) => {
            e.target.style.borderColor = error ? 'var(--color-red-alert)' : 'var(--color-border)';
            e.target.style.boxShadow = 'none';
            if (props.onBlur) props.onBlur(e);
          }}
        />
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

export default Input;
