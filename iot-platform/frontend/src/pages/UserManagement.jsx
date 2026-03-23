import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card, Button, Input, Select, Badge, Table, AlertBanner, Loader } from '../components/ui';

function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');

  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/auth/users');
      setUsers(res.data);
    } catch (err) {
      setError('FAILED TO LOAD USERS.');
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const clearMessages = () => { setError(''); setSuccess(''); };

  const handleCreate = async (e) => {
    e.preventDefault();
    clearMessages();

    if (!newUsername.trim() || !newPassword) {
      setError('USERNAME AND PASSWORD ARE REQUIRED.');
      return;
    }

    try {
      await axios.post('/api/auth/users', {
        username: newUsername,
        password: newPassword,
        role: newRole,
      });
      setSuccess(`USER "${newUsername.toUpperCase()}" CREATED SUCCESSFULLY.`);
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      setShowForm(false);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'FAILED TO CREATE USER.');
    }
  };

  const handleToggleActive = async (userId, currentlyActive) => {
    clearMessages();
    try {
      await axios.put(`/api/auth/users/${userId}`, { is_active: !currentlyActive });
      setSuccess(`USER ${currentlyActive ? 'DISABLED' : 'ENABLED'} SUCCESSFULLY.`);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'FAILED TO UPDATE USER.');
    }
  };

  const handleDelete = async (userId, username) => {
    clearMessages();
    if (!window.confirm(`Are you sure you want to delete user "${username}"? This cannot be undone.`)) {
      return;
    }
    try {
      await axios.delete(`/api/auth/users/${userId}`);
      setSuccess(`USER "${username.toUpperCase()}" DELETED.`);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'FAILED TO DELETE USER.');
    }
  };

  const handleRoleChange = async (userId, role) => {
    clearMessages();
    try {
      await axios.put(`/api/auth/users/${userId}`, { role });
      setSuccess('ROLE UPDATED SUCCESSFULLY.');
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'FAILED TO UPDATE ROLE.');
    }
  };

  if (loading) return <Loader type="spin" text="LOADING USERS" />;

  const columns = ['USERNAME', 'ROLE', 'STATUS', 'CREATED', 'ACTIONS'];
  const data = users.map((u) => [
    <span>
      <strong style={{ color: 'var(--color-phosphor-primary)' }}>{u.username.toUpperCase()}</strong>
      {u.id === currentUser.id && (
        <Badge variant="info" style={{ marginLeft: 'var(--space-2)' }}>YOU</Badge>
      )}
    </span>,
    u.id !== currentUser.id ? (
      <Select
        value={u.role}
        onChange={(e) => handleRoleChange(u.id, e.target.value)}
        options={[{ value: 'user', label: 'USER' }, { value: 'admin', label: 'ADMIN' }]}
        style={{ width: 110, marginBottom: 0 }}
      />
    ) : (
      <Badge variant="info">{u.role.toUpperCase()}</Badge>
    ),
    <Badge variant={u.is_active ? 'online' : 'offline'}>
      {u.is_active ? 'ACTIVE' : 'DISABLED'}
    </Badge>,
    new Date(u.created_at).toLocaleDateString(),
    u.id !== currentUser.id ? (
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Button
          size="sm"
          variant={u.is_active ? 'secondary' : 'primary'}
          onClick={() => handleToggleActive(u.id, u.is_active)}
        >
          {u.is_active ? 'DISABLE' : 'ENABLE'}
        </Button>
        <Button size="sm" variant="danger" onClick={() => handleDelete(u.id, u.username)}>
          DELETE
        </Button>
      </div>
    ) : null,
  ]);

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={styles.title}>USER MANAGEMENT</h1>
        <p style={styles.subtitle}>MANAGE USER ACCOUNTS AND ACCESS CONTROL</p>
      </div>

      {error && <AlertBanner variant="error" dismissible onDismiss={() => setError('')}>{error}</AlertBanner>}
      {success && <AlertBanner variant="success" dismissible onDismiss={() => setSuccess('')}>{success}</AlertBanner>}

      <Card
        title="USERS"
        headerAction={
          <Button size="sm" variant={showForm ? 'secondary' : 'primary'} onClick={() => setShowForm(!showForm)}>
            {showForm ? 'CANCEL' : 'ADD USER'}
          </Button>
        }
      >
        {showForm && (
          <form
            onSubmit={handleCreate}
            style={{
              padding: 'var(--space-4)',
              background: 'var(--color-bg-base)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 'var(--space-4)',
            }}
          >
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <Input
                  label="USERNAME"
                  prefix="> "
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="USERNAME"
                />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <Input
                  label="PASSWORD"
                  prefix="> "
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="MIN 6 CHARACTERS"
                />
              </div>
              <div style={{ minWidth: 110 }}>
                <Select
                  label="ROLE"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  options={[{ value: 'user', label: 'USER' }, { value: 'admin', label: 'ADMIN' }]}
                />
              </div>
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <Button type="submit" size="sm">CREATE</Button>
              </div>
            </div>
          </form>
        )}

        <Table columns={columns} data={data} />
      </Card>
    </div>
  );
}

const styles = {
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-2xl)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    letterSpacing: 'var(--letter-spacing-wider)',
    margin: 0,
    fontWeight: 'normal',
  },
  subtitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    letterSpacing: 'var(--letter-spacing-wide)',
    marginTop: 'var(--space-1)',
  },
};

export default UserManagement;
