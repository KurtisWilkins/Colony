import React from 'react';

/**
 * Terminal-styled table component.
 * @param {object} props
 * @param {Array<string>} props.columns - Column header labels
 * @param {Array<Array<React.ReactNode>>} props.data - Row data (array of arrays)
 * @param {function} props.onRowClick - Optional row click handler, receives row index
 * @param {string} props.emptyMessage - Message when no data
 */
function Table({ columns = [], data = [], onRowClick, emptyMessage = '[ NO DATA ]' }) {
  if (data.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: 'var(--space-8)',
          color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-base)',
        }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-base)',
        }}
      >
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th
                key={i}
                style={{
                  background: 'var(--color-bg-elevated)',
                  padding: 'var(--space-2) var(--space-4)',
                  textAlign: 'left',
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--letter-spacing-wider)',
                  color: 'var(--color-phosphor-dim)',
                  fontSize: 'var(--text-sm)',
                  borderBottom: '1px solid var(--color-border-active)',
                  whiteSpace: 'nowrap',
                  fontWeight: 'normal',
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              onClick={() => onRowClick?.(rowIdx)}
              style={{
                background: rowIdx % 2 === 0 ? 'var(--color-bg-base)' : 'var(--color-bg-surface)',
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'background var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-phosphor-glow)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = rowIdx % 2 === 0
                  ? 'var(--color-bg-base)'
                  : 'var(--color-bg-surface)';
              }}
            >
              {row.map((cell, cellIdx) => (
                <td
                  key={cellIdx}
                  style={{
                    padding: 'var(--space-2) var(--space-4)',
                    borderBottom: '1px solid var(--color-border)',
                    color: 'var(--color-phosphor-primary)',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
