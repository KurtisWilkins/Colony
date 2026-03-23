import React, { useEffect } from 'react';

/**
 * Terminal-styled modal component.
 * @param {object} props
 * @param {boolean} props.open - Whether modal is visible
 * @param {function} props.onClose - Close handler
 * @param {string} props.title - Modal title
 * @param {React.ReactNode} props.children
 */
function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 5, 0, 0.88)',
        padding: 'var(--space-4)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-active)',
          boxShadow: 'var(--glow-md)',
          maxWidth: '520px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          animation: 'scanlineWipe 0.25s ease-out',
        }}
      >
        {/* Header */}
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
            [[ {title || 'MODAL'} ]]
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-phosphor-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-md)',
              cursor: 'pointer',
              padding: 'var(--space-1)',
              transition: 'color var(--transition-fast)',
              lineHeight: 1,
            }}
            onMouseEnter={(e) => { e.target.style.color = 'var(--color-red-alert)'; }}
            onMouseLeave={(e) => { e.target.style.color = 'var(--color-phosphor-dim)'; }}
          >
            &#10005;
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 'var(--space-4)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default Modal;
