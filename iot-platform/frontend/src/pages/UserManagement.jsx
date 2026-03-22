import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New user form
  const [showForm, setShowForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');

  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/auth/users');
      setUsers(res.data);
    } catch (err) {
      setError('Failed to load users.');
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!newUsername.trim() || !newPassword) {
      setError('Username and password are required.');
      return;
    }

    try {
      await axios.post('/api/auth/users', {
        username: newUsername,
        password: newPassword,
        role: newRole,
      });
      setSuccess(`User "${newUsername}" created successfully.`);
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      setShowForm(false);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user.');
    }
  };

  const handleToggleActive = async (userId, currentlyActive) => {
    setError('');
    setSuccess('');
    try {
      await axios.put(`/api/auth/users/${userId}`, { is_active: !currentlyActive });
      setSuccess(`User ${currentlyActive ? 'disabled' : 'enabled'} successfully.`);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user.');
    }
  };

  const handleDelete = async (userId, username) => {
    setError('');
    setSuccess('');
    if (!window.confirm(`Are you sure you want to delete user "${username}"? This cannot be undone.`)) {
      return;
    }
    try {
      await axios.delete(`/api/auth/users/${userId}`);
      setSuccess(`User "${username}" deleted.`);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user.');
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    setError('');
    setSuccess('');
    try {
      await axios.put(`/api/auth/users/${userId}`, { role: newRole });
      setSuccess('Role updated successfully.');
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update role.');
    }
  };

  if (loading) return <div className="loading">Loading users...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>User Management</h1>
        <p>Manage user accounts and access control</p>
      </div>

      {error && <div className="message message-error">{error}</div>}
      {success && <div className="message message-success">{success}</div>}

      <div className="panel">
        <div className="panel-header-row">
          <h2>Users</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Add User'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="user-form">
            <div className="form-inline">
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Username"
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" className="btn btn-success btn-sm">Create</button>
            </div>
          </form>
        )}

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.username}</strong>
                    {u.id === currentUser.id && <span className="you-badge">You</span>}
                  </td>
                  <td>
                    {u.id !== currentUser.id ? (
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        className="role-select"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span className="role-badge">{u.role}</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge ${u.is_active ? 'online' : 'offline'}`}>
                      {u.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    {u.id !== currentUser.id && (
                      <div className="btn-group">
                        <button
                          className={`btn btn-sm ${u.is_active ? 'btn-secondary' : 'btn-success'}`}
                          onClick={() => handleToggleActive(u.id, u.is_active)}
                        >
                          {u.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(u.id, u.username)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default UserManagement;
