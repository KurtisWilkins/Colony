import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SummaryCard from '../components/SummaryCard';

/**
 * Dashboard page.
 * Fetches platform status and hierarchy data to display summary cards.
 * Auto-refreshes status every 30 seconds.
 */
function Dashboard() {
  const [status, setStatus] = useState(null);
  const [hierarchy, setHierarchy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch status data from the API
  const fetchStatus = async () => {
    try {
      const res = await axios.get('/api/status');
      setStatus(res.data);
    } catch (err) {
      console.error('Failed to fetch status:', err);
      setError('Failed to fetch platform status.');
    }
  };

  // Fetch hierarchy data to compute facility count
  const fetchHierarchy = async () => {
    try {
      const res = await axios.get('/api/hierarchy');
      setHierarchy(res.data);
    } catch (err) {
      console.error('Failed to fetch hierarchy:', err);
    }
  };

  useEffect(() => {
    // Initial fetch
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchStatus(), fetchHierarchy()]);
      setLoading(false);
    };
    loadData();

    // Auto-refresh status every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="message message-error">{error}</div>;
  }

  // Compute summary values from status and hierarchy data
  const facilitiesArr = hierarchy?.facilities || [];
  const totalFacilities = facilitiesArr.length;
  const onlineCount = status?.online_devices ?? 0;
  const offlineCount = status?.offline_devices ?? 0;
  const totalDevices = onlineCount + offlineCount;
  const totalTelemetry = status?.total_telemetry_records ?? 0;

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Platform overview and real-time status</p>
      </div>

      {/* Summary cards */}
      <div className="summary-grid">
        <SummaryCard title="Facilities" value={totalFacilities} subtitle="Registered locations" />
        <SummaryCard title="Total Devices" value={totalDevices} subtitle="All registered devices" />
        <SummaryCard title="Online" value={onlineCount} subtitle="Currently reporting" />
        <SummaryCard title="Offline" value={offlineCount} subtitle="Not reporting" />
        <SummaryCard title="Telemetry Records" value={totalTelemetry} subtitle="Total stored" />
      </div>

      {/* Alerts panel - scaffold with empty state */}
      <div className="panel alerts-panel">
        <h2>Alerts</h2>
        <div className="empty-state">
          No alerts at this time.
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
