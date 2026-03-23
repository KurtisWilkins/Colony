import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input, AlertBanner, Loader } from '../components/ui';

const ASCII_HEADER = `
 ██████╗ ██████╗ ██╗      ██████╗ ███╗   ██╗██╗   ██╗
██╔════╝██╔═══██╗██║     ██╔═══██╗████╗  ██║╚██╗ ██╔╝
██║     ██║   ██║██║     ██║   ██║██╔██╗ ██║ ╚████╔╝
██║     ██║   ██║██║     ██║   ██║██║╚██╗██║  ╚██╔╝
╚██████╗╚██████╔╝███████╗╚██████╔╝██║ ╚████║   ██║
 ╚═════╝ ╚═════╝ ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝
`.trim();

function Login() {
  const { login, setup } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        await axios.post('/api/auth/setup', {});
        setIsSetupMode(false);
      } catch (err) {
        if (err.response?.status === 400) {
          setIsSetupMode(true);
        } else if (err.response?.status === 403) {
          setIsSetupMode(false);
        }
      }
      setCheckingSetup(false);
    };
    checkSetup();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('USERNAME AND PASSWORD ARE REQUIRED.');
      return;
    }

    if (isSetupMode) {
      if (password !== confirmPassword) {
        setError('PASSWORDS DO NOT MATCH.');
        return;
      }
      if (password.length < 6) {
        setError('PASSWORD MUST BE AT LEAST 6 CHARACTERS.');
        return;
      }
    }

    setConnecting(true);
    // Brief connecting animation
    await new Promise((r) => setTimeout(r, 800));
    setLoading(true);

    try {
      if (isSetupMode) {
        await setup(username, password);
      } else {
        await login(username, password);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'ACCESS DENIED. AUTHENTICATION FAILED.');
      setConnecting(false);
    }
    setLoading(false);
  };

  if (checkingSetup) {
    return (
      <div style={styles.container}>
        <Loader type="spin" text="INITIALIZING" fullscreen />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Scrolling binary background */}
      <div style={styles.binaryBg} aria-hidden="true">
        <div style={styles.binaryScroll}>
          {Array.from({ length: 40 }, (_, i) => (
            <div key={i} style={{ whiteSpace: 'nowrap' }}>
              {Array.from({ length: 60 }, () =>
                Math.random() > 0.5 ? '1' : '0'
              ).join(' ')}
            </div>
          ))}
          {Array.from({ length: 40 }, (_, i) => (
            <div key={`d-${i}`} style={{ whiteSpace: 'nowrap' }}>
              {Array.from({ length: 60 }, () =>
                Math.random() > 0.5 ? '1' : '0'
              ).join(' ')}
            </div>
          ))}
        </div>
      </div>

      {/* Corner decorations */}
      <div style={{ ...styles.corner, top: 'var(--space-6)', left: 'var(--space-6)' }}>
        &#9556;&#9552;&#9552;&#9552;
      </div>
      <div style={{ ...styles.corner, bottom: 'var(--space-6)', right: 'var(--space-6)', textAlign: 'right' }}>
        &#9552;&#9552;&#9552;&#9559;
      </div>

      {/* Login panel */}
      <div style={styles.panel}>
        {/* ASCII art header */}
        <pre style={styles.ascii}>{ASCII_HEADER}</pre>

        <div style={styles.subtitle}>
          {isSetupMode ? 'INITIAL SETUP REQUIRED' : 'AUTHENTICATION REQUIRED'}
        </div>

        {error && <AlertBanner variant="error">{error}</AlertBanner>}

        {connecting && !error ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
            <Loader type="spin" text="CONNECTING" />
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <Input
              id="username"
              label="Username"
              prefix="> "
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ENTER USERNAME"
              autoComplete="username"
              autoFocus
            />

            <Input
              id="password"
              label="Password"
              prefix="> "
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="ENTER PASSWORD"
              autoComplete={isSetupMode ? 'new-password' : 'current-password'}
            />

            {isSetupMode && (
              <Input
                id="confirmPassword"
                label="Confirm Password"
                prefix="> "
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="CONFIRM PASSWORD"
                autoComplete="new-password"
              />
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              disabled={loading}
              style={{ width: '100%', marginTop: 'var(--space-2)' }}
            >
              {isSetupMode ? 'CREATE ADMIN ACCOUNT' : 'INITIALIZE SESSION'}
            </Button>
          </form>
        )}

        {isSetupMode && !connecting && (
          <div style={styles.note}>
            FIRST-TIME SETUP. THIS ACCOUNT WILL HAVE FULL ADMIN PRIVILEGES.
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'var(--color-bg-base)',
    padding: 'var(--space-4)',
    position: 'relative',
    overflow: 'hidden',
  },
  binaryBg: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    opacity: 0.04,
    color: 'var(--color-phosphor-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    lineHeight: '14px',
    pointerEvents: 'none',
  },
  binaryScroll: {
    animation: 'scrollBinary 30s linear infinite',
  },
  corner: {
    position: 'fixed',
    color: 'var(--color-phosphor-ghost)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-lg)',
    pointerEvents: 'none',
    zIndex: 1,
  },
  panel: {
    position: 'relative',
    zIndex: 2,
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)',
    boxShadow: 'var(--glow-md)',
    padding: 'var(--space-8)',
    width: '100%',
    maxWidth: '460px',
    animation: 'fadeSlideIn 0.4s ease-out',
  },
  ascii: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.45rem',
    lineHeight: 1.2,
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    textAlign: 'center',
    marginBottom: 'var(--space-4)',
    overflow: 'hidden',
    whiteSpace: 'pre',
  },
  subtitle: {
    textAlign: 'center',
    color: 'var(--color-phosphor-dim)',
    fontSize: 'var(--text-sm)',
    letterSpacing: 'var(--letter-spacing-wider)',
    marginBottom: 'var(--space-6)',
    fontFamily: 'var(--font-mono)',
  },
  note: {
    marginTop: 'var(--space-4)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    textAlign: 'center',
    lineHeight: 'var(--leading-normal)',
    fontFamily: 'var(--font-mono)',
  },
};

export default Login;
