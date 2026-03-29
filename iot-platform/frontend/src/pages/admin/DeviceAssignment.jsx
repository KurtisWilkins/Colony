import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Badge, AlertBanner, Loader } from '../../components/ui';
import { getUsers, getDevices, getUserDevices, assignUserDevice, removeUserDevice } from '../../utils/api';

const ROLE_BADGE_VARIANT = {
  admin: 'offline',
  manager: 'warning',
  operator: 'info',
  viewer: null,
};

function RoleBadge({ role }) {
  const variant = ROLE_BADGE_VARIANT[role];
  if (variant) return <Badge variant={variant}>{role.toUpperCase()}</Badge>;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
      padding: '2px var(--space-2)', fontSize: 'var(--text-xs)',
      fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
      letterSpacing: 'var(--letter-spacing-wide)',
      background: 'rgba(0,255,65,0.05)', color: 'var(--color-phosphor-ghost)',
      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: '0.5rem' }}>&#9679;</span>
      {(role || 'viewer').toUpperCase()}
    </span>
  );
}

function DeviceAssignment() {
  const [users, setUsers] = useState([]);
  const [allDevices, setAllDevices] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [userDevices, setUserDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, devicesRes] = await Promise.all([getUsers(), getDevices()]);
      setUsers(usersRes.users || usersRes || []);
      setAllDevices(devicesRes.devices || devicesRes || []);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchUserDevices = useCallback(async (userId) => {
    setDevicesLoading(true);
    try {
      const res = await getUserDevices(userId);
      setUserDevices(res.devices || res || []);
    } catch (err) {
      setError(err.message);
      setUserDevices([]);
    }
    setDevicesLoading(false);
  }, []);

  const selectUser = (userId) => {
    setSelectedUserId(userId);
    setSuccess('');
    setError('');
    fetchUserDevices(userId);
  };

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(t);
    }
  }, [success]);

  const handleAssign = async (deviceId) => {
    setError('');
    try {
      await assignUserDevice(selectedUserId, deviceId);
      setSuccess('DEVICE ASSIGNED.');
      await fetchUserDevices(selectedUserId);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemove = async (deviceId) => {
    setError('');
    try {
      await removeUserDevice(selectedUserId, deviceId);
      setSuccess('DEVICE REMOVED.');
      await fetchUserDevices(selectedUserId);
    } catch (err) {
      setError(err.message);
    }
  };

  const selectedUser = users.find((u) => u.id === selectedUserId);
  const assignedIds = new Set(userDevices.map((d) => d.id || d.device_id));
  const availableDevices = allDevices.filter((d) => !assignedIds.has(d.id || d.device_id));

  if (loading) {
    return <Loader type="spin" text="LOADING" />;
  }

  return (
    <div style={{ maxWidth: '1200px' }}>
      <h1 style={styles.pageTitle}>DEVICE ASSIGNMENT</h1>
      <div style={styles.pageSub}>ASSIGN DEVICES TO USERS</div>

      {error && <AlertBanner variant="error">{error}</AlertBanner>}
      {success && <AlertBanner variant="success">{success}</AlertBanner>}

      <div style={styles.panels}>
        {/* Left: User list */}
        <div style={styles.leftPanel}>
          <Card>
            <div style={styles.panelHeader}>USERS</div>
            <div style={styles.listContainer}>
              {users.map((u) => {
                const deviceCount = u.device_count ?? '?';
                const isSelected = selectedUserId === u.id;
                return (
                  <div
                    key={u.id}
                    onClick={() => selectUser(u.id)}
                    style={{
                      ...styles.userRow,
                      background: isSelected ? 'var(--color-phosphor-glow)' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--color-phosphor-primary)' : '3px solid transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--color-bg-elevated)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: 1 }}>
                      <span style={{ color: 'var(--color-phosphor-bright)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                        {u.username}
                      </span>
                      <RoleBadge role={u.role || 'viewer'} />
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                      color: 'var(--color-phosphor-ghost)',
                    }}>
                      {deviceCount} DEV
                    </span>
                  </div>
                );
              })}
              {users.length === 0 && (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-phosphor-ghost)', fontFamily: 'var(--font-mono)' }}>
                  [ NO USERS ]
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right: Device assignments */}
        <div style={styles.rightPanel}>
          {!selectedUser ? (
            <Card>
              <div style={{
                padding: 'var(--space-8)', textAlign: 'center',
                color: 'var(--color-phosphor-ghost)', fontFamily: 'var(--font-mono)',
              }}>
                SELECT A USER TO MANAGE DEVICE ASSIGNMENTS
              </div>
            </Card>
          ) : devicesLoading ? (
            <Loader type="spin" text="LOADING DEVICES" />
          ) : (
            <>
              {/* Assigned */}
              <Card>
                <div style={styles.panelHeader}>
                  ASSIGNED TO {selectedUser.username.toUpperCase()}
                  <span style={{ color: 'var(--color-phosphor-ghost)', fontSize: 'var(--text-xs)', marginLeft: 'var(--space-2)' }}>
                    ({userDevices.length})
                  </span>
                </div>
                <div style={styles.listContainer}>
                  {userDevices.length === 0 && (
                    <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-phosphor-ghost)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                      [ NO DEVICES ASSIGNED ]
                    </div>
                  )}
                  {userDevices.map((d) => {
                    const id = d.id || d.device_id;
                    return (
                      <div key={id} style={styles.deviceRow}>
                        <div>
                          <div style={{ color: 'var(--color-phosphor-bright)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                            {d.name || id}
                          </div>
                          <div style={{ color: 'var(--color-phosphor-ghost)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                            {d.type || 'DEVICE'} {d.location ? `// ${d.location}` : ''}
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => handleRemove(id)}
                          style={{ color: 'var(--color-red-alert)', borderColor: 'rgba(255,49,49,0.3)' }}>
                          REMOVE
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Available */}
              <Card style={{ marginTop: 'var(--space-4)' }}>
                <div style={styles.panelHeader}>
                  AVAILABLE DEVICES
                  <span style={{ color: 'var(--color-phosphor-ghost)', fontSize: 'var(--text-xs)', marginLeft: 'var(--space-2)' }}>
                    ({availableDevices.length})
                  </span>
                </div>
                <div style={styles.listContainer}>
                  {availableDevices.length === 0 && (
                    <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-phosphor-ghost)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                      [ ALL DEVICES ASSIGNED ]
                    </div>
                  )}
                  {availableDevices.map((d) => {
                    const id = d.id || d.device_id;
                    return (
                      <div key={id} style={styles.deviceRow}>
                        <div>
                          <div style={{ color: 'var(--color-phosphor-dim)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                            {d.name || id}
                          </div>
                          <div style={{ color: 'var(--color-phosphor-ghost)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                            {d.type || 'DEVICE'} {d.location ? `// ${d.location}` : ''}
                          </div>
                        </div>
                        <Button size="sm" onClick={() => handleAssign(id)}>ASSIGN</Button>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
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
  panels: {
    display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  leftPanel: { flex: '0 0 320px', minWidth: '280px' },
  rightPanel: { flex: 1, minWidth: '300px' },
  panelHeader: {
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--color-border)',
    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)', textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wider)',
  },
  listContainer: { maxHeight: '480px', overflowY: 'auto' },
  userRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)', cursor: 'pointer',
    borderBottom: '1px solid var(--color-border)',
    transition: 'all var(--transition-fast)',
  },
  deviceRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--color-border)',
  },
};

export default DeviceAssignment;
