import React from 'react';

/**
 * Terminal-styled card component.
 * @param {object} props
 * @param {boolean} props.glowing - Adds glow box shadow
 * @param {string} props.title - Header bar title in bracket format
 * @param {React.ReactNode} props.headerAction - Button/element in header right
 * @param {React.ReactNode} props.children
 * @param {boolean} props.clickable - Adds hover effect and pointer cursor
 * @param {function} props.onClick
 */
function Card({ glowing = false, title, headerAction, children, clickable = false, onClick, style: userStyle, ...props }) {
  return (
    <div
      onClick={onClick}
      {...props}
      style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        padding: title ? 0 : 'var(--space-4)',
        boxShadow: glowing ? 'var(--glow-sm)' : 'none',
        animation: 'fadeSlideIn 0.3s ease-out',
        transition: 'box-shadow var(--transition-base), border-color var(--transition-base), transform var(--transition-base)',
        cursor: clickable || onClick ? 'pointer' : 'default',
        ...userStyle,
      }}
      onMouseEnter={(e) => {
        if (clickable || onClick) {
          e.currentTarget.style.borderColor = 'var(--color-phosphor-dim)';
          e.currentTarget.style.boxShadow = 'var(--glow-sm)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        if (clickable || onClick) {
          e.currentTarget.style.borderColor = 'var(--color-border)';
          e.currentTarget.style.boxShadow = glowing ? 'var(--glow-sm)' : 'none';
          e.currentTarget.style.transform = 'translateY(0)';
        }
      }}
    >
      {title && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-phosphor-dim)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--letter-spacing-wider)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            [ {title} ]
          </span>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div style={title ? { padding: 'var(--space-4)' } : undefined}>
        {children}
      </div>
    </div>
  );
}

export default Card;
