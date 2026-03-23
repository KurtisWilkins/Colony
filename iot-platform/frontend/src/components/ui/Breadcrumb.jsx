import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Terminal-styled breadcrumb navigation.
 * @param {object} props
 * @param {Array<{label: string, path: string}>} props.items
 */
function Breadcrumb({ items = [] }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-4)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-sm)',
        flexWrap: 'wrap',
      }}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <React.Fragment key={index}>
            {index > 0 && (
              <span style={{ color: 'var(--color-phosphor-ghost)' }}>&gt;</span>
            )}
            {isLast ? (
              <span
                style={{
                  color: 'var(--color-phosphor-bright)',
                  textShadow: 'var(--glow-text)',
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--letter-spacing-wide)',
                }}
              >
                {item.label}
              </span>
            ) : (
              <Link
                to={item.path}
                style={{
                  color: 'var(--color-phosphor-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--letter-spacing-wide)',
                  textDecoration: 'none',
                  transition: 'color var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  e.target.style.color = 'var(--color-phosphor-primary)';
                  e.target.style.textShadow = 'var(--glow-text)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.color = 'var(--color-phosphor-dim)';
                  e.target.style.textShadow = 'none';
                }}
              >
                {item.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default Breadcrumb;
