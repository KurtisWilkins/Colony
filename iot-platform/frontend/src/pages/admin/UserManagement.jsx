import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Badge, Input, Select, AlertBanner, Table, Modal, Toggle } from '../../components/ui';
import { getUsers, createUser, updateUser, resetUserPassword } from '../../utils/api';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'ADMIN' },
  { value: 'manager', label: 'MANAGER' },
  { value: 'operator', label: 'OPERATOR' },
  { value: 'viewer', label: 'VIEWER' },
];

const ROLE_DESCRIPTIONS = {
  admin: 'Full system access. Manage users, devices, and all settings.',
  manager: 'Manage devices and view all data. Cannot manage users.',
  operator: 'Control assigned devices and view telemetry.',
  viewer: 'Read-only access to assigned devices.',
};

const ROLE_BADGE_VARIANT = {
  admin: 'offline',     // red
  manager: 'warning',   // amber
  operator: 'info',     // blue/cyan
  viewer: null,          // dim/ghost
};

function RoleBadge({ role }) {
  const variant = ROLE_BADGE_VARIANT[role];
  if (variant) {
    return <Badge variant={variant}>{role.toUpperCase()}</Badge>;
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
      padding: '2px var(--space-2)', fontSize: 'var(--text-xs)',
      fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
      letterSpacing: 'var(--letter-spacing-wide)',
      background: 'rgba(0,255,65,0.05)', color: 'var(--color-phosphor-ghost)',
      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
      lineHeight: 'var(--leading-tight)', whiteSpace: 'nowrap',
    }}>
      <span style={{ color: 'var(--color-phosphor-ghost)', fontSize: '0.5rem' }}>&#9679;</span>
      {role.toUpperCase()}
    </span>
  );
}

function StatusBadge({ active }) {
  return active
    ? <Badge variant="online">ACTIVE</Badge>
    : <Badge variant="offline">INACTIVE</Badge>;
}

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', role: 'viewer' });
  const [creating, setCreating] = useState(false);
  const [tempPassword, setTempPassword] = useState('');

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await getUsers();
      setUsers(data.users || data || []);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Clear success after 8s
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 8000);
      return () => clearTimeout(t);
    }
  }, [success]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const res = await createUser(newUser);
      setTempPassword(res.temporary_password || res.temp_password || '');
      setNewUser({ username: '', email: '', role: 'viewer' });
      await fetchUsers();
      if (!res.temporary_password && !res.temp_password) {
        setCreateOpen(false);
        setSuccess('USER CREATED SUCCESSFULLY.');
      }
    } catch (err) {
      setError(err.message);
    }
    setCreating(false);
  };

  const handleEdit = (user) => {
    setEditingId(user.id);
    setEditData({ username: user.username, email: user.email, role: user.role, active: user.active !== false });
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    setError('');
    try {
      await updateUser(editingId, editData);
      setEditingId(null);
      setSuccess('USER UPDATED.');
      await fetchUsers();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const handleResetPassword = async (userId, username) => {
    if (!window.confirm(`Reset password for ${username}?`)) return;
    setError('');
    try {
      const res = await resetUserPassword(userId);
      setSuccess(`PASSWORD RESET FOR ${username.toUpperCase()}. TEMP PASSWORD: ${res.temporary_password || res.temp_password || 'CHECK EMAIL'}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const formatDate = (d) => {
    if (!d) return '---';
    return new Date(d).toLocaleString('en-US', { hour12: false, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).toUpperCase();
  };

  const columns = ['USERNAME', 'EMAIL', 'ROLE', 'STATUS', 'LAST LOGIN', 'ACTIONS'];

  const tableData = users.map((u) => {
    if (editingId === u.id) {
      return [
        <Input
          value={editData.username}
          onChange={(e) => setEditData({ ...editData, username: e.target.value })}
          style={{ marginBottom: 0 }}
        />,
        <Input
          value={editData.email}
          onChange={(e) => setEditData({ ...editData, email: e.target.value })}
          style={{ marginBottom: 0 }}
        />,
        <Select
          value={editData.role}
          onChange={(e) => setEditData({ ...editData, role: e.target.value })}
          options={ROLE_OPTIONS}
          style={{ marginBottom: 0 }}
        />,
        <Toggle
          checked={editData.active}
          onChange={(val) => setEditData({ ...editData, active: val })}
          label="ACTIVE"
        />,
        formatDate(u.last_login),
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button size="sm" onClick={handleSaveEdit} loading={saving}>SAVE</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>CANCEL</Button>
        </div>,
      ];
    }
    return [
      <span style={{ color: 'var(--color-phosphor-bright)', fontFamily: 'var(--font-mono)' }}>{u.username}</span>,
      <span style={{ color: 'var(--color-phosphor-dim)', fontFamily: 'var(--font-mono)' }}>{u.email || '---'}</span>,
      <RoleBadge role={u.role || 'viewer'} />,
      <StatusBadge active={u.active !== false} />,
      <span style={{ color: 'var(--color-phosphor-ghost)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>{formatDate(u.last_login)}</span>,
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Button size="sm" variant="ghost" onClick={() => handleEdit(u)}>EDIT</Button>
        <Button size="sm" variant="ghost" onClick={() => handleResetPassword(u.id, u.username)}>RESET PWD</Button>
      </div>,
    ];
  });

  return (
    <div style={{ maxWidth: '1100px' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 'var(--space-6)',
      }}>
        <div>
          <h1 style={styles.pageTitle}>USER MANAGEMENT</h1>
          <div style={styles.pageSub}>{users.length} REGISTERED USER{users.length !== 1 ? 'S' : ''}</div>
        </div>
        <Button variant="primary" onClick={() => { setCreateOpen(true); setTempPassword(''); }}>
          + NEW USER
        </Button>
      </div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-phosphor-ghost)', marginBottom: 'var(--space-4)', lineHeight: 'var(--leading-relaxed)' }}>
        {'👤'} Manage user accounts and roles. Roles: Admin (full access), Manager (all devices), Operator (assigned devices, control only), Viewer (read-only). New users receive a temporary password and must change it on first login.
      </div>

      {error && <AlertBanner variant="error">{error}</AlertBanner>}
      {success && <AlertBanner variant="success">{success}</AlertBanner>}

      {/* User Table */}
      <Card>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-phosphor-dim)', fontFamily: 'var(--font-mono)' }}>
            LOADING USERS...
          </div>
        ) : (
          <Table columns={columns} data={tableData} emptyMessage="[ NO USERS FOUND ]" />
        )}
      </Card>

      {/* Create User Modal */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setTempPassword(''); }} title="CREATE NEW USER">
        {tempPassword ? (
          <div>
            <AlertBanner variant="warning">
              <div style={{ fontFamily: 'var(--font-mono)' }}>
                <strong>TEMPORARY PASSWORD (SHOWN ONCE):</strong>
                <div style={{
                  marginTop: 'var(--space-2)', padding: 'var(--space-3)',
                  background: 'var(--color-bg-base)', border: '1px solid var(--color-amber)',
                  fontSize: 'var(--text-lg)', letterSpacing: 'var(--letter-spacing-wider)',
                  color: 'var(--color-amber)', textAlign: 'center', wordBreak: 'break-all',
                }}>
                  {tempPassword}
                </div>
                <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--color-phosphor-dim)' }}>
                  Copy this password now. It will not be shown again. The user will be required to change it on first login.
                </div>
              </div>
            </AlertBanner>
            <Button
              variant="primary"
              style={{ width: '100%', marginTop: 'var(--space-4)' }}
              onClick={() => { setCreateOpen(false); setTempPassword(''); }}
            >
              DONE
            </Button>
          </div>
        ) : (
          <form onSubmit={handleCreate}>
            <Input
              id="new-username"
              label="Username"
              prefix="> "
              value={newUser.username}
              onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              placeholder="ENTER USERNAME"
              required
            />
            <Input
              id="new-email"
              label="Email"
              prefix="> "
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              placeholder="ENTER EMAIL"
            />
            <Select
              id="new-role"
              label="Role"
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              options={ROLE_OPTIONS}
            />
            {newUser.role && (
              <div style={{
                padding: 'var(--space-2) var(--space-3)', marginBottom: 'var(--space-4)',
                background: 'var(--color-bg-base)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)', color: 'var(--color-phosphor-ghost)',
              }}>
                {ROLE_DESCRIPTIONS[newUser.role]}
              </div>
            )}
            <Button type="submit" variant="primary" loading={creating} disabled={creating} style={{ width: '100%' }}>
              CREATE USER
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
}

const styles = {
  pageTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-2xl)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    letterSpacing: 'var(--letter-spacing-wider)',
    margin: 0,
  },
  pageSub: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-ghost)',
    letterSpacing: 'var(--letter-spacing-wide)',
    marginTop: 'var(--space-1)',
  },
};

export default UserManagement;
