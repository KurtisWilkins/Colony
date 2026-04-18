import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, Button, Badge, Select, Modal } from './ui';

function PendingDevices() {
  const [devices, setDevices] = useState([]);
  const [claimTarget, setClaimTarget] = useState(null);
  const [deviceType, setDeviceType] = useState('sensor');
  const [loading, setLoading] = useState(false);

  const fetchPending = useCallback(async () => {
    try {
      const res = await axios.get('/api/devices/pending');
      setDevices(res.data);
    } catch {
      // silent — dashboard still works without this
    }
  }, []);

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 15000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  const handleClaim = async () => {
    if (!claimTarget) return;
    setLoading(true);
    try {
      await axios.post(`/api/devices/${claimTarget.id}/claim`, { device_type: deviceType });
      setClaimTarget(null);
      setDeviceType('sensor');
      fetchPending();
    } catch {
      // keep modal open on error
    }
    setLoading(false);
  };

  const handleDismiss = async (id) => {
    try {
      await axios.delete(`/api/devices/${id}/dismiss`);
      fetchPending();
    } catch {
      // silent
    }
  };

  if (devices.length === 0) return null;

  const timeSince = (iso) => {
    if (!iso) return 'never';
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <>
      <Card
        title={`UNKNOWN DEVICES DETECTED (${devices.length})`}
        style={{ marginBottom: 'var(--space-6)', borderColor: 'var(--color-amber-dim)' }}
        headerAction={
          <Badge variant="warning">PENDING</Badge>
        }
      >
        <div style={styles.hint}>
          New devices publishing to MQTT. Claim to add or dismiss to ignore.
        </div>
        <div style={styles.list}>
          {devices.map((d) => (
            <div key={d.id} style={styles.row}>
              <div style={styles.deviceInfo}>
                <div style={styles.deviceName}>{d.device_name}</div>
                <div style={styles.devicePath}>
                  {d.facility} / {d.building} / {d.unit}
                </div>
                <div style={styles.deviceMeta}>
                  {d.is_online ? (
                    <Badge variant="online">ONLINE</Badge>
                  ) : (
                    <Badge variant="offline">OFFLINE</Badge>
                  )}
                  <span style={styles.lastSeen}>Last seen: {timeSince(d.last_seen)}</span>
                </div>
              </div>
              <div style={styles.actions}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => { setClaimTarget(d); setDeviceType('sensor'); }}
                >
                  CLAIM
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDismiss(d.id)}
                >
                  DISMISS
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={!!claimTarget}
        onClose={() => setClaimTarget(null)}
        title="CLAIM DEVICE"
      >
        {claimTarget && (
          <div>
            <div style={styles.claimInfo}>
              <div style={styles.claimLabel}>DEVICE</div>
              <div style={styles.claimValue}>{claimTarget.device_name}</div>
              <div style={styles.claimLabel}>LOCATION</div>
              <div style={styles.claimValue}>
                {claimTarget.facility} / {claimTarget.building} / {claimTarget.unit}
              </div>
            </div>
            <Select
              label="DEVICE TYPE"
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value)}
              options={[
                { value: 'sensor', label: 'Sensor' },
                { value: 'actuator', label: 'Actuator' },
                { value: 'combo', label: 'Combo (Sensor + Actuator)' },
                { value: 'irrigation', label: 'Irrigation Controller' },
                { value: 'environment', label: 'Environment Controller' },
              ]}
            />
            <div style={styles.claimActions}>
              <Button variant="secondary" size="sm" onClick={() => setClaimTarget(null)}>
                CANCEL
              </Button>
              <Button variant="primary" size="sm" loading={loading} onClick={handleClaim}>
                CONFIRM CLAIM
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

const styles = {
  hint: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-ghost)',
    marginBottom: 'var(--space-4)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-4)',
    padding: 'var(--space-3)',
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    flexWrap: 'wrap',
  },
  deviceInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
    minWidth: 0,
    flex: 1,
  },
  deviceName: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-amber)',
    fontWeight: 'bold',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  devicePath: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
  },
  deviceMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginTop: 'var(--space-1)',
  },
  lastSeen: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
  },
  actions: {
    display: 'flex',
    gap: 'var(--space-2)',
    flexShrink: 0,
  },
  claimInfo: {
    marginBottom: 'var(--space-4)',
    padding: 'var(--space-3)',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
  },
  claimLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    letterSpacing: 'var(--letter-spacing-wider)',
    marginBottom: 'var(--space-1)',
  },
  claimValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-phosphor-primary)',
    marginBottom: 'var(--space-3)',
  },
  claimActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 'var(--space-3)',
    marginTop: 'var(--space-4)',
  },
};

export default PendingDevices;
