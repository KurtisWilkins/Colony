import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { StatCard, Card, Loader, AlertBanner } from '../components/ui';

function Dashboard() {
  const [status, setStatus] = useState(null);
  const [hierarchy, setHierarchy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStatus = async () => {
    try {
      const res = await axios.get('/api/status');
      setStatus(res.data);
    } catch (err) {
      console.error('Failed to fetch status:', err);
      setError('FAILED TO FETCH PLATFORM STATUS.');
    }
  };

  const fetchHierarchy = async () => {
    try {
      const res = await axios.get('/api/hierarchy');
      setHierarchy(res.data);
    } catch (err) {
      console.error('Failed to fetch hierarchy:', err);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchStatus(), fetchHierarchy()]);
      setLoading(false);
    };
    loadData();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <Loader type="spin" text="LOADING DASHBOARD" />;
  }

  if (error) {
    return <AlertBanner variant="error">{error}</AlertBanner>;
  }

  const totalFacilities = status?.total_facilities ?? 0;
  const totalBuildings = status?.total_buildings ?? 0;
  const totalUnits = status?.total_units ?? 0;
  const onlineCount = status?.online_devices ?? 0;
  const offlineCount = status?.offline_devices ?? 0;
  const totalDevices = onlineCount + offlineCount;
  const totalTelemetry = status?.total_telemetry_records ?? 0;

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>DASHBOARD</h1>
        <p style={styles.subtitle}>PLATFORM OVERVIEW AND REAL-TIME STATUS</p>
      </div>

      <div style={styles.statGrid}>
        <StatCard value={totalFacilities} label="FACILITIES" />
        <StatCard value={totalBuildings} label="BUILDINGS" />
        <StatCard value={totalUnits} label="UNITS" />
        <StatCard value={totalDevices} label="TOTAL DEVICES" />
        <StatCard value={onlineCount} label="ONLINE" trend={onlineCount > 0 ? 'up' : null} />
        <StatCard value={offlineCount} label="OFFLINE" trend={offlineCount > 0 ? 'down' : null} />
        <StatCard value={totalTelemetry.toLocaleString()} label="TELEMETRY RECORDS" />
      </div>

      <Card title="ALERTS">
        <div style={styles.emptyState}>
          [ NO ALERTS AT THIS TIME ]
        </div>
      </Card>
    </div>
  );
}

const styles = {
  header: {
    marginBottom: 'var(--space-6)',
  },
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
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 'var(--space-4)',
    marginBottom: 'var(--space-6)',
  },
  emptyState: {
    textAlign: 'center',
    padding: 'var(--space-8)',
    color: 'var(--color-text-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-base)',
  },
};

export default Dashboard;
