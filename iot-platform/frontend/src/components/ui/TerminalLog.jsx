import React, { useEffect, useRef } from 'react';

const typeColors = {
  info: 'var(--color-phosphor-primary)',
  warn: 'var(--color-amber)',
  error: 'var(--color-red-alert)',
  cmd: 'var(--color-cyan-accent)',
};

/**
 * Terminal log display component.
 * @param {object} props
 * @param {Array<{timestamp: string, message: string, type: 'info'|'warn'|'error'|'cmd'}>} props.lines
 * @param {boolean} props.prompt - Show blinking cursor at bottom
 * @param {number} props.maxHeight - Max height in px (default 300)
 */
function TerminalLog({ lines = [], prompt = false, maxHeight = 300 }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const formatTime = (ts) => {
    if (!ts) return '[--:--:--]';
    const d = new Date(ts);
    return `[${d.toLocaleTimeString('en-US', { hour12: false })}]`;
  };

  return (
    <div
      ref={scrollRef}
      style={{
        background: 'var(--color-bg-base)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        padding: 'var(--space-3)',
        maxHeight: maxHeight,
        overflowY: 'auto',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-sm)',
        lineHeight: 1.8,
      }}
    >
      {lines.length === 0 && (
        <div style={{ color: 'var(--color-text-muted)' }}>[ AWAITING INPUT ]</div>
      )}
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            animation: 'fadeSlideIn 0.15s ease-out',
          }}
        >
          <span style={{ color: 'var(--color-phosphor-dim)', marginRight: 'var(--space-2)' }}>
            {formatTime(line.timestamp)}
          </span>
          <span style={{ color: typeColors[line.type] || typeColors.info }}>
            {line.message}
          </span>
        </div>
      ))}
      {prompt && (
        <div style={{ color: 'var(--color-phosphor-dim)' }}>
          {'> '}
          <span style={{ animation: 'blinkCursor 0.8s step-end infinite' }}>&#9646;</span>
        </div>
      )}
    </div>
  );
}

export default TerminalLog;
