import React from 'react';

/**
 * Terminal-styled textarea component.
 * @param {object} props
 * @param {string} props.label - Label text
 * @param {string} props.error - Error message
 * @param {string} props.id
 */
function Textarea({ label, error, id, style: userStyle, ...props }) {
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
      <textarea
        id={id}
        {...props}
        style={{
          width: '100%',
          minHeight: '100px',
          padding: 'var(--space-2) var(--space-3)',
          background: 'var(--color-bg-input)',
          border: `1px solid ${error ? 'var(--color-red-alert)' : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-sm)',
          color: 'var(--color-phosphor-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-base)',
          caretColor: 'var(--color-phosphor-primary)',
          resize: 'vertical',
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
      />
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

export default Textarea;
