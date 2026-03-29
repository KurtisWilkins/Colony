import React, { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, Button, Input, Badge, AlertBanner } from '../../components/ui';
import { changePassword } from '../../utils/api';

const ROLE_BADGE_VARIANT = {
  admin: 'offline',
  manager: 'warning',
  operator: 'info',
  viewer: null,
};

function PasswordStrength({ password }) {
  const checks = useMemo(() => {
    const results = [
      { label: '12+ CHARACTERS', pass: password.length >= 12 },
      { label: 'CONTAINS NUMBER', pass: /\d/.test(password) },
      { label: 'SPECIAL CHARACTER', pass: /[^a-zA-Z0-9]/.test(password) },
    ];
    return results;
  }, [password]);

  const passed = checks.filter((c) => c.pass).length;
  const strength = passed === 0 ? 'NONE' : passed === 1 ? 'WEAK' : passed === 2 ? 'FAIR' : 'STRONG';
  const strengthColor = passed === 0
    ? 'var(--color-phosphor-ghost)'
    : passed === 1
      ? 'var(--color-red-alert)'
      : passed === 2
        ? 'var(--color-amber)'
        : 'var(--color-phosphor-primary)';

  if (!password) return null;

  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      {/* Strength bar */}
      <div style={{
        display: 'flex', gap: 'var(--space-1)', marginBottom: 'var(--space-2)',
      }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            flex: 1, height: '4px', borderRadius: '2px',
            background: i < passed ? strengthColor : 'var(--color-bg-elevated)',
            transition: 'all var(--transition-base)',
            boxShadow: i < passed && passed === 3 ? 'var(--glow-sm)' : 'none',
          }} />
        ))}
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 'var(--space-2)',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
          color: strengthColor, letterSpacing: 'var(--letter-spacing-wider)',
        }}>
          STRENGTH: {strength}
        </span>
      </div>
      {/* Individual checks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        {checks.map((c) => (
          <div key={c.label} style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
            color: c.pass ? 'var(--color-phosphor-primary)' : 'var(--color-phosphor-ghost)',
            letterSpacing: 'var(--letter-spacing-wide)',
          }}>
            {c.pass ? '\u2713' : '\u2717'} {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function MyAccount() {
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!currentPassword || !newPassword || !confirmPassword) {
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

    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess('PASSWORD CHANGED SUCCESSFULLY.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message || 'FAILED TO CHANGE PASSWORD.');
    }
    setLoading(false);
  };

  const roleVariant = ROLE_BADGE_VARIANT[user?.role];

  const formatDate = (d) => {
    if (!d) return '---';
    return new Date(d).toLocaleString('en-US', {
      hour12: false, month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).toUpperCase();
  };

  return (
    <div style={{ maxWidth: '600px' }}>
      <h1 style={styles.pageTitle}>MY ACCOUNT</h1>
      <div style={styles.pageSub}>ACCOUNT SETTINGS & SECURITY</div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-phosphor-ghost)', marginBottom: 'var(--space-4)', lineHeight: 'var(--leading-relaxed)' }}>
        {'👤'} View your account details and change your password. Passwords must be at least 12 characters with at least one number and one special character.
      </div>

      {/* Account Info */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <div style={styles.sectionHeader}>ACCOUNT INFORMATION</div>
        <div style={{ padding: 'var(--space-4)' }}>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>USERNAME</span>
            <span style={styles.infoValue}>{user?.username || '---'}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>EMAIL</span>
            <span style={styles.infoValue}>{user?.email || '---'}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>ROLE</span>
            <span>
              {roleVariant
                ? <Badge variant={roleVariant}>{(user?.role || 'viewer').toUpperCase()}</Badge>
                : <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
                    padding: '2px var(--space-2)', fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
                    letterSpacing: 'var(--letter-spacing-wide)',
                    background: 'rgba(0,255,65,0.05)', color: 'var(--color-phosphor-ghost)',
                    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                  }}>
                    <span style={{ fontSize: '0.5rem' }}>&#9679;</span>
                    {(user?.role || 'VIEWER').toUpperCase()}
                  </span>
              }
            </span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>LAST LOGIN</span>
            <span style={styles.infoValue}>{formatDate(user?.last_login)}</span>
          </div>
        </div>
      </Card>

      {/* Change Password */}
      <Card>
        <div style={styles.sectionHeader}>CHANGE PASSWORD</div>
        <div style={{ padding: 'var(--space-4)' }}>
          {error && <AlertBanner variant="error">{error}</AlertBanner>}
          {success && <AlertBanner variant="success">{success}</AlertBanner>}

          <form onSubmit={handleChangePassword}>
            <Input
              id="current-password"
              label="Current Password"
              prefix="> "
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="ENTER CURRENT PASSWORD"
              autoComplete="current-password"
            />
            <Input
              id="new-password"
              label="New Password"
              prefix="> "
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="ENTER NEW PASSWORD"
              autoComplete="new-password"
            />
            <PasswordStrength password={newPassword} />
            <Input
              id="confirm-password"
              label="Confirm New Password"
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
                color: 'var(--color-red-alert)', marginBottom: 'var(--space-4)',
                letterSpacing: 'var(--letter-spacing-wide)',
              }}>
                &#10005; PASSWORDS DO NOT MATCH
              </div>
            )}
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              disabled={loading}
              style={{ width: '100%' }}
            >
              UPDATE PASSWORD
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}

const styles = {
  pageTitle: {
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)',
    color: 'var(--color-phosphor-primary)', textShadow: 'var(--glow-text)',
    letterSpacing: 'var(--letter-spacing-wider)', margin: 0,
  },
  pageSub: {
    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-ghost)', letterSpacing: 'var(--letter-spacing-wide)',
    marginTop: 'var(--space-1)', marginBottom: 'var(--space-6)',
  },
  sectionHeader: {
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--color-border)',
    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)', textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wider)',
  },
  infoRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: 'var(--space-2) 0',
    borderBottom: '1px solid var(--color-border)',
  },
  infoLabel: {
    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-ghost)', letterSpacing: 'var(--letter-spacing-wide)',
    textTransform: 'uppercase',
  },
  infoValue: {
    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-bright)',
  },
};

export default MyAccount;
