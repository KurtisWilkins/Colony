import React, { useState } from 'react';

/**
 * Terminal-styled tooltip component.
 * @param {object} props
 * @param {string} props.text - Tooltip text
 * @param {React.ReactNode} props.children - Trigger element
 * @param {'top'|'bottom'} props.position
 */
function Tooltip({ text, children, position = 'top' }) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && text && (
        <div
          style={{
            position: 'absolute',
            [position === 'top' ? 'bottom' : 'top']: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-phosphor-dim)',
            padding: 'var(--space-1) var(--space-2)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-phosphor-primary)',
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'nowrap',
            zIndex: 500,
            animation: 'fadeSlideIn 0.15s ease-out',
            pointerEvents: 'none',
          }}
        >
          {text}
          {/* Arrow */}
          <div
            style={{
              position: 'absolute',
              [position === 'top' ? 'top' : 'bottom']: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              [position === 'top' ? 'borderTop' : 'borderBottom']: '4px solid var(--color-phosphor-dim)',
            }}
          />
        </div>
      )}
    </div>
  );
}

export default Tooltip;
