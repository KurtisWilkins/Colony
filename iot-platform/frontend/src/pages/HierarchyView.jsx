import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, Loader, Badge } from '../components/ui';

function HierarchyView() {
  const [hierarchy, setHierarchy] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchHierarchy = async () => {
      try {
        const res = await axios.get('/api/hierarchy');
        setHierarchy(res.data);
      } catch (err) {
        console.error('Failed to fetch hierarchy:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHierarchy();
  }, []);

  if (loading) {
    return <Loader type="spin" text="LOADING FACILITIES" />;
  }

  const facilitiesArr = hierarchy?.facilities || [];

  const facilityStats = (fac) => {
    let deviceCount = 0;
    let onlineCount = 0;
    for (const bld of fac.buildings || []) {
      for (const u of bld.units || []) {
        const devices = u.devices || [];
        deviceCount += devices.length;
        onlineCount += devices.filter((d) => d.is_online).length;
      }
    }
    return { deviceCount, onlineCount };
  };

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>FACILITIES</h1>
        <p style={styles.subtitle}>SELECT A FACILITY TO EXPLORE ITS DEVICES</p>
      </div>

      {facilitiesArr.length === 0 ? (
        <div style={styles.emptyState}>
          [ NO FACILITIES FOUND. REGISTER A DEVICE TO GET STARTED. ]
        </div>
      ) : (
        <div style={styles.cardGrid}>
          {facilitiesArr.map((fac) => {
            const stats = facilityStats(fac);
            return (
              <Card
                key={fac.name}
                clickable
                onClick={() => navigate(`/devices/${encodeURIComponent(fac.name)}`)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <h3 style={styles.cardTitle}>{fac.name.toUpperCase()}</h3>
                  <Badge variant={stats.onlineCount > 0 ? 'online' : 'offline'}>
                    {stats.onlineCount} ONLINE
                  </Badge>
                </div>
                <p style={styles.cardMeta}>{stats.deviceCount} DEVICE(S)</p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  header: { marginBottom: 'var(--space-6)' },
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
  },
  emptyState: {
    textAlign: 'center',
    padding: 'var(--space-8)',
    color: 'var(--color-text-muted)',
    fontFamily: 'var(--font-mono)',
  },
};

export default HierarchyView;
