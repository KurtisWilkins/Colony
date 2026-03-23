import React, { useState, useEffect } from 'react';

const spinChars = ['/', '-', '\\', '|'];

/**
 * Terminal-styled loader component.
 * @param {object} props
 * @param {'cursor'|'spin'|'bar'} props.type - Loading animation type
 * @param {string} props.text - Loading text
 * @param {boolean} props.fullscreen - Centered fullscreen variant
 */
function Loader({ type = 'spin', text = 'LOADING', fullscreen = false }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % 100);
    }, 120);
    return () => clearInterval(interval);
  }, []);

  let content;

  if (type === 'cursor') {
    content = (
      <span>
        {text}{' '}
        <span style={{ animation: 'blinkCursor 0.8s step-end infinite' }}>&#9646;</span>
      </span>
    );
  } else if (type === 'bar') {
    const barLen = 12;
    const filled = Math.floor((frame / 100) * barLen * 3) % barLen;
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barLen - filled);
    content = (
      <span>
        {text} [{bar}]
      </span>
    );
  } else {
    // spin
    content = (
      <span>
        {text} [{spinChars[frame % spinChars.length]}]
      </span>
    );
  }

  const inner = (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-base)',
        color: 'var(--color-phosphor-dim)',
        textAlign: 'center',
        padding: 'var(--space-8)',
      }}
    >
      {content}
    </div>
  );

  if (fullscreen) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg-base)',
          zIndex: 900,
        }}
      >
        <div
          style={{
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            padding: 'var(--space-8) var(--space-12)',
            boxShadow: 'var(--glow-md)',
          }}
        >
          {content}
        </div>
      </div>
    );
  }

  return inner;
}

export default Loader;
