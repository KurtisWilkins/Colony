import React, { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input, AlertBanner, Loader } from '../components/ui';
import { changePassword } from '../utils/api';

const ASCII_HEADER = `
 ██████╗ ██████╗ ██╗      ██████╗ ███╗   ██╗██╗   ██╗
██╔════╝██╔═══██╗██║     ██╔═══██╗████╗  ██║╚██╗ ██╔╝
██║     ██║   ██║██║     ██║   ██║██╔██╗ ██║ ╚████╔╝
██║     ██║   ██║██║     ██║   ██║██║╚██╗██║  ╚██╔╝
╚██████╗╚██████╔╝███████╗╚██████╔╝██║ ╚████║   ██║
 ╚═════╝ ╚═════╝ ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝
`.trim();

function PasswordStrengthMini({ password }) {
  const checks = useMemo(() => [
    { label: '12+ CHARS', pass: password.length >= 12 },
    { label: 'NUMBER', pass: /\d/.test(password) },
    { label: 'SPECIAL', pass: /[^a-zA-Z0-9]/.test(password) },
  ], [password]);
  const passed = checks.filter((c) => c.pass).length;
  const color = passed === 0 ? 'var(--color-phosphor-ghost)' : passed === 1 ? 'var(--color-red-alert)' : passed === 2 ? 'var(--color-amber)' : 'var(--color-phosphor-primary)';
  if (!password) return null;
  return (
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-1)', marginBottom: 'var(--space-1)' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', background: i < passed ? color : 'var(--color-bg-elevated)', transition: 'all 0.2s' }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        {checks.map((c) => (
          <span key={c.label} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: c.pass ? 'var(--color-phosphor-primary)' : 'var(--color-phosphor-ghost)' }}>
            {c.pass ? '\u2713' : '\u2717'} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Force password change state
  const [forceChange, setForceChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('USERNAME AND PASSWORD ARE REQUIRED.');
      return;
    }

    setConnecting(true);
    await new Promise((r) => setTimeout(r, 800));
    setLoading(true);

    try {
      const result = await login(username, password);
      if (result && result.force_password_change) {
        setForceChange(true);
        setConnecting(false);
      }
    } catch (err) {
      setError(err.message || 'ACCESS DENIED. AUTHENTICATION FAILED.');
      setConnecting(false);
    }
    setLoading(false);
  };

  const handleForcePasswordChange = async (e) => {
    e.preventDefault();
    setError('');

    if (!newPassword || !confirmPassword) {
      setError('ALL FIELDS ARE REQUIRED.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('PASSWORDS DO NOT MATCH.');
      return;
    }
    if (newPassword.length < 12) {
      setError('PASSWORD MUST BE AT LEAST 12 CHARACTERS.');
      return;
    }

    setChangingPassword(true);
    try {
      await changePassword(password, newPassword);
      // Re-login with new password
      await login(username, newPassword);
    } catch (err) {
      setError(err.message || 'FAILED TO CHANGE PASSWORD.');
    }
    setChangingPassword(false);
  };

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
        <pre style={styles.ascii}>{ASCII_HEADER}</pre>

        <div style={styles.subtitle}>AUTHENTICATION REQUIRED</div>

        {error && <AlertBanner variant="error">{error}</AlertBanner>}

        {connecting && !error && !forceChange ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
            <Loader type="spin" text="CONNECTING" />
          </div>
        ) : forceChange ? (
          <form onSubmit={handleForcePasswordChange}>
            <div style={{
              textAlign: 'center', marginBottom: 'var(--space-4)',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
              color: 'var(--color-amber)', letterSpacing: 'var(--letter-spacing-wider)',
            }}>
              PASSWORD CHANGE REQUIRED
            </div>

            <Input
              id="new-password"
              label="New Password"
              prefix="> "
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="ENTER NEW PASSWORD"
              autoComplete="new-password"
              autoFocus
            />
            <PasswordStrengthMini password={newPassword} />
            <Input
              id="confirm-password"
              label="Confirm Password"
              prefix="> "
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="CONFIRM NEW PASSWORD"
              autoComplete="new-password"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                color: 'var(--color-red-alert)', marginBottom: 'var(--space-2)',
              }}>
                &#10005; PASSWORDS DO NOT MATCH
              </div>
            )}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={changingPassword}
              disabled={changingPassword}
              style={{ width: '100%', marginTop: 'var(--space-2)' }}
            >
              SET NEW PASSWORD
            </Button>
          </form>
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
              autoComplete="current-password"
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              disabled={loading}
              style={{ width: '100%', marginTop: 'var(--space-2)' }}
            >
              INITIALIZE SESSION
            </Button>
          </form>
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
};

export default Login;
