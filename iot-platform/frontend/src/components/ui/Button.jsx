import React from 'react';

const styles = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wider)',
    border: '1px solid',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'all var(--transition-base)',
    animation: 'powerOn 0.3s ease-out',
    WebkitTapHighlightColor: 'transparent',
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  sizes: {
    sm: {
      padding: 'var(--space-1) var(--space-3)',
      fontSize: 'var(--text-sm)',
      minHeight: '28px',
    },
    md: {
      padding: 'var(--space-2) var(--space-4)',
      fontSize: 'var(--text-base)',
      minHeight: '36px',
    },
    lg: {
      padding: 'var(--space-3) var(--space-6)',
      fontSize: 'var(--text-md)',
      minHeight: '44px',
    },
  },
  variants: {
    primary: {
      borderColor: 'var(--color-phosphor-primary)',
      color: 'var(--color-phosphor-primary)',
    },
    secondary: {
      borderColor: 'var(--color-phosphor-dim)',
      color: 'var(--color-phosphor-dim)',
    },
    danger: {
      borderColor: 'var(--color-red-alert)',
      color: 'var(--color-red-alert)',
    },
    ghost: {
      borderColor: 'transparent',
      color: 'var(--color-phosphor-primary)',
    },
    amber: {
      borderColor: 'var(--color-amber)',
      color: 'var(--color-amber)',
    },
  },
  disabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
    pointerEvents: 'none',
  },
};

/**
 * Terminal-styled button component.
 * @param {object} props
 * @param {'primary'|'secondary'|'danger'|'ghost'|'amber'} props.variant
 * @param {'sm'|'md'|'lg'} props.size
 * @param {React.ReactNode} props.icon - Optional icon rendered left of label
 * @param {boolean} props.loading - Shows blinking cursor instead of label
 * @param {boolean} props.disabled
 * @param {React.ReactNode} props.children
 */
function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  children,
  style: userStyle,
  ...props
}) {
  const handleClick = (e) => {
    if (disabled || loading) return;
    // Brief brightness flash
    const el = e.currentTarget;
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = 'clickFlash 80ms ease';
    if (props.onClick) props.onClick(e);
  };

  return (
    <button
      {...props}
      onClick={handleClick}
      disabled={disabled || loading}
      style={{
        ...styles.base,
        ...styles.sizes[size],
        ...styles.variants[variant],
        ...(disabled ? styles.disabled : {}),
        ...userStyle,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        const v = variant;
        if (v === 'primary') {
          e.currentTarget.style.background = 'var(--color-phosphor-glow)';
          e.currentTarget.style.boxShadow = 'var(--glow-md)';
          e.currentTarget.style.color = 'var(--color-phosphor-bright)';
        } else if (v === 'secondary') {
          e.currentTarget.style.borderColor = 'var(--color-phosphor-primary)';
          e.currentTarget.style.color = 'var(--color-phosphor-primary)';
        } else if (v === 'danger') {
          e.currentTarget.style.background = 'var(--color-red-dim)';
          e.currentTarget.style.boxShadow = '0 0 12px rgba(255,49,49,0.4)';
        } else if (v === 'ghost') {
          e.currentTarget.style.textDecoration = 'underline';
          e.currentTarget.style.textShadow = 'var(--glow-text)';
        } else if (v === 'amber') {
          e.currentTarget.style.background = 'rgba(255,176,0,0.15)';
          e.currentTarget.style.boxShadow = '0 0 12px rgba(255,176,0,0.4)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.textDecoration = 'none';
        e.currentTarget.style.textShadow = 'none';
        e.currentTarget.style.borderColor = styles.variants[variant].borderColor;
        e.currentTarget.style.color = styles.variants[variant].color;
      }}
    >
      {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
      {loading ? (
        <span style={{ animation: 'blinkCursor 0.8s step-end infinite' }}>&#9646;</span>
      ) : (
        children
      )}
    </button>
  );
}

export default Button;
