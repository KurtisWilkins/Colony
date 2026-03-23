import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Breadcrumb, Card, Badge, Loader } from '../components/ui';

function DeviceList() {
  const { facility, building, unit } = useParams();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await axios.get(
          `/api/hierarchy/${encodeURIComponent(facility)}/${encodeURIComponent(building)}/${encodeURIComponent(unit)}`
        );
        const data = Array.isArray(res.data) ? res.data : res.data.devices || [];
        setDevices(data);
      } catch (err) {
        console.error('Failed to fetch devices:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDevices();
  }, [facility, building, unit]);

  if (loading) {
    return <Loader type="spin" text="LOADING DEVICES" />;
  }

  const breadcrumbItems = [
    { label: 'Facilities', path: '/devices' },
    { label: facility, path: `/devices/${encodeURIComponent(facility)}` },
    { label: building, path: `/devices/${encodeURIComponent(facility)}/${encodeURIComponent(building)}` },
    { label: unit, path: `/devices/${encodeURIComponent(facility)}/${encodeURIComponent(building)}/${encodeURIComponent(unit)}` },
  ];

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'NEVER';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div>
      <Breadcrumb items={breadcrumbItems} />

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={styles.title}>{unit.toUpperCase()} &mdash; DEVICES</h1>
      </div>

      {devices.length === 0 ? (
        <div style={styles.emptyState}>[ NO DEVICES FOUND IN THIS UNIT ]</div>
      ) : (
        <div style={styles.cardGrid}>
          {devices.map((device) => (
            <Card
              key={device.id}
              clickable
              onClick={() => navigate(`/device/${device.id}`)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                <h3 style={styles.cardTitle}>{device.device_name.toUpperCase()}</h3>
                <Badge variant={device.is_online ? 'online' : 'offline'} />
              </div>
              <p style={styles.cardMeta}>TYPE: {device.device_type.toUpperCase()}</p>
              <p style={styles.cardMeta}>LAST SEEN: {formatLastSeen(device.last_seen)}</p>
            </Card>
          ))}
        </div>
      )}
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
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 'var(--space-4)',
  },
  cardTitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-md)',
    color: 'var(--color-phosphor-primary)',
    margin: 0,
    fontWeight: 'normal',
  },
  cardMeta: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    margin: 0,
    marginTop: 'var(--space-1)',
  },
  emptyState: {
    textAlign: 'center',
    padding: 'var(--space-8)',
    color: 'var(--color-text-muted)',
    fontFamily: 'var(--font-mono)',
  },
};

export default DeviceList;
