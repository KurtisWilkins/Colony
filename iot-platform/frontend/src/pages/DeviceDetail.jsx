import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Card, Badge, Button, Select, AlertBanner, Loader, Table } from '../components/ui';
import { getFacilities, getBuildings, getUnits, assignDevice } from '../utils/api';
import { terminalChartTheme, terminalLineDataset } from '../styles/chartTheme';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

function DeviceDetail() {
  const { deviceId } = useParams();
  const navigate = useNavigate();

  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [latestTelemetry, setLatestTelemetry] = useState(null);
  const [telemetryHistory, setTelemetryHistory] = useState([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [commands, setCommands] = useState([]);
  const [commandMsg, setCommandMsg] = useState(null);

  // Assignment state
  const [facilities, setFacilities] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [units, setUnits] = useState([]);
  const [assignFacility, setAssignFacility] = useState('');
  const [assignBuilding, setAssignBuilding] = useState('');
  const [assignUnit, setAssignUnit] = useState('');
  const [assigning, setAssigning] = useState(false);

  const fetchDevice = useCallback(async () => {
    try {
      const res = await axios.get(`/api/devices/${deviceId}`);
      setDevice(res.data);
    } catch (err) {
      console.error('Failed to fetch device:', err);
    }
  }, [deviceId]);

  const fetchLatestTelemetry = useCallback(async () => {
    try {
      const res = await axios.get(`/api/telemetry/latest/${deviceId}`);
      setLatestTelemetry(res.data);
    } catch (err) {
      console.error('Failed to fetch latest telemetry:', err);
    }
  }, [deviceId]);

  const fetchTelemetryHistory = useCallback(async () => {
    try {
      const res = await axios.get(`/api/telemetry/${deviceId}?limit=50`);
      const data = Array.isArray(res.data) ? res.data : res.data.telemetry || [];
      setTelemetryHistory(data);
      if (!selectedKey && data.length > 0 && data[0].payload) {
        const keys = Object.keys(data[0].payload);
        if (keys.length > 0) setSelectedKey(keys[0]);
      }
    } catch (err) {
      console.error('Failed to fetch telemetry history:', err);
    }
  }, [deviceId, selectedKey]);

  const fetchCommands = useCallback(async () => {
    try {
      const res = await axios.get(`/api/commands/${deviceId}`);
      const data = Array.isArray(res.data) ? res.data : res.data.commands || [];
      setCommands(data);
    } catch (err) {
      console.error('Failed to fetch commands:', err);
    }
  }, [deviceId]);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchDevice(), fetchLatestTelemetry(), fetchTelemetryHistory(), fetchCommands()]);
      setLoading(false);
    };
    loadAll();
  }, [fetchDevice, fetchLatestTelemetry, fetchTelemetryHistory, fetchCommands]);

  useEffect(() => {
    const interval = setInterval(fetchLatestTelemetry, 10000);
    return () => clearInterval(interval);
  }, [fetchLatestTelemetry]);

  // Load facilities for assignment
  useEffect(() => {
    getFacilities().then(setFacilities).catch(() => {});
  }, []);

  // Load buildings when facility selected
  useEffect(() => {
    if (!assignFacility) { setBuildings([]); setAssignBuilding(''); return; }
    getBuildings(assignFacility).then(setBuildings).catch(() => setBuildings([]));
    setAssignBuilding('');
    setAssignUnit('');
  }, [assignFacility]);

  // Load units when building selected
  useEffect(() => {
    if (!assignBuilding) { setUnits([]); setAssignUnit(''); return; }
    getUnits(assignBuilding).then(setUnits).catch(() => setUnits([]));
    setAssignUnit('');
  }, [assignBuilding]);

  const handleAssign = async () => {
    if (!assignUnit) return;
    setAssigning(true);
    try {
      await assignDevice(deviceId, { unit_id: assignUnit });
      setCommandMsg({ type: 'success', text: 'DEVICE ASSIGNED TO UNIT SUCCESSFULLY.' });
      fetchDevice();
    } catch (err) {
      setCommandMsg({ type: 'error', text: `ASSIGNMENT FAILED: ${err.message}` });
    } finally {
      setAssigning(false);
      setTimeout(() => setCommandMsg(null), 5000);
    }
  };

  if (loading) {
    return <Loader type="spin" text="LOADING DEVICE" />;
  }

  if (!device) {
    return <AlertBanner variant="error">DEVICE NOT FOUND.</AlertBanner>;
  }

  const payloadKeys = [];
  if (telemetryHistory.length > 0 && telemetryHistory[0].payload) {
    for (const key of Object.keys(telemetryHistory[0].payload)) {
      const val = telemetryHistory[0].payload[key];
      if (typeof val === 'number' || !isNaN(Number(val))) {
        payloadKeys.push(key);
      }
    }
  }

  const chartHistory = [...telemetryHistory].reverse();
  const chartData = {
    labels: chartHistory.map((t) => new Date(t.received_at).toLocaleTimeString('en-US', { hour12: false })),
    datasets: [
      {
        ...terminalLineDataset,
        label: selectedKey.toUpperCase(),
        data: chartHistory.map((t) => {
          const val = t.payload?.[selectedKey];
          return typeof val === 'number' ? val : Number(val) || 0;
        }),
      },
    ],
  };

  const chartOptions = {
    ...terminalChartTheme,
    plugins: {
      ...terminalChartTheme.plugins,
      legend: { ...terminalChartTheme.plugins.legend, display: true },
    },
    scales: {
      x: {
        ...terminalChartTheme.scales.x,
        title: { ...terminalChartTheme.scales.x.title, display: true, text: 'TIME' },
      },
      y: {
        ...terminalChartTheme.scales.y,
        title: { ...terminalChartTheme.scales.y.title, display: true, text: selectedKey.toUpperCase() },
      },
    },
  };

  const cmdColumns = ['ISSUED AT', 'COMMAND TYPE', 'PAYLOAD', 'ACK'];
  const cmdData = commands.map((cmd) => [
    new Date(cmd.issued_at).toLocaleString(),
    cmd.command_type.toUpperCase(),
    <code style={{ fontSize: 'var(--text-xs)', color: 'var(--color-phosphor-dim)' }}>{JSON.stringify(cmd.payload)}</code>,
    <Badge variant={cmd.acknowledged ? 'online' : 'offline'}>{cmd.acknowledged ? 'YES' : 'NO'}</Badge>,
  ]);

  return (
    <div>
      {/* Device info header */}
      <Card title="DEVICE INFO" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <h1 style={styles.deviceName}>{device.device_name.toUpperCase()}</h1>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <Badge variant={device.is_online ? 'online' : 'offline'} />
            <Button size="sm" onClick={() => navigate(`/devices/${deviceId}/control`)}>
              CONTROL DASHBOARD
            </Button>
          </div>
        </div>
        <div style={styles.metaGrid}>
          <span style={styles.metaItem}><span style={styles.metaLabel}>FACILITY:</span> {device.facility}</span>
          <span style={styles.metaItem}><span style={styles.metaLabel}>BUILDING:</span> {device.building}</span>
          <span style={styles.metaItem}><span style={styles.metaLabel}>UNIT:</span> {device.unit}</span>
          <span style={styles.metaItem}><span style={styles.metaLabel}>TYPE:</span> {device.device_type}</span>
        </div>
      </Card>

      {/* Device Assignment */}
      <Card title="ASSIGN TO HIERARCHY" style={{ marginBottom: 'var(--space-4)' }}>
        {commandMsg && (
          <AlertBanner variant={commandMsg.type} dismissible onDismiss={() => setCommandMsg(null)}>
            {commandMsg.text}
          </AlertBanner>
        )}
        <div style={styles.assignGrid}>
          <Select
            label="FACILITY"
            value={assignFacility}
            onChange={(e) => setAssignFacility(e.target.value)}
            options={[
              { value: '', label: '[ SELECT FACILITY ]' },
              ...facilities.map(f => ({ value: f.id, label: f.name.toUpperCase() })),
            ]}
          />
          <Select
            label="BUILDING"
            value={assignBuilding}
            onChange={(e) => setAssignBuilding(e.target.value)}
            options={[
              { value: '', label: assignFacility ? '[ SELECT BUILDING ]' : '[ SELECT FACILITY FIRST ]' },
              ...buildings.map(b => ({ value: b.id, label: b.name.toUpperCase() })),
            ]}
          />
          <Select
            label="UNIT"
            value={assignUnit}
            onChange={(e) => setAssignUnit(e.target.value)}
            options={[
              { value: '', label: assignBuilding ? '[ SELECT UNIT ]' : '[ SELECT BUILDING FIRST ]' },
              ...units.map(u => ({ value: u.id, label: u.name.toUpperCase() })),
            ]}
          />
        </div>
        <Button
          size="sm"
          variant="primary"
          onClick={handleAssign}
          loading={assigning}
          disabled={!assignUnit}
          style={{ marginTop: 'var(--space-3)' }}
        >
          ASSIGN DEVICE
        </Button>
      </Card>

      {/* Live telemetry */}
      <Card title="LIVE TELEMETRY" style={{ marginBottom: 'var(--space-4)' }}>
        {latestTelemetry && latestTelemetry.payload ? (
          <>
            <div style={styles.telemetryGrid}>
              {Object.entries(latestTelemetry.payload).map(([key, value]) => (
                <div key={key} style={styles.telemetryItem}>
                  <div style={styles.telemetryKey}>{key.toUpperCase()}</div>
                  <div style={styles.telemetryValue}>
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </div>
                </div>
              ))}
            </div>
            {latestTelemetry.received_at && (
              <p style={styles.timestamp}>
                LAST UPDATED: {new Date(latestTelemetry.received_at).toLocaleString()}
              </p>
            )}
          </>
        ) : (
          <div style={styles.emptyState}>[ NO TELEMETRY DATA AVAILABLE ]</div>
        )}
      </Card>

      {/* Telemetry chart */}
      <Card title="TELEMETRY CHART" style={{ marginBottom: 'var(--space-4)' }}>
        {payloadKeys.length > 0 ? (
          <>
            <div style={{ maxWidth: 300, marginBottom: 'var(--space-3)' }}>
              <Select
                label="SELECT METRIC"
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
                options={payloadKeys.map((k) => ({ value: k, label: k.toUpperCase() }))}
              />
            </div>
            <div style={{ position: 'relative', height: '300px' }}>
              <Line data={chartData} options={chartOptions} />
            </div>
          </>
        ) : (
          <div style={styles.emptyState}>[ NO NUMERIC TELEMETRY DATA AVAILABLE FOR CHARTING ]</div>
        )}
      </Card>

      {/* Command history */}
      <Card title="COMMAND HISTORY">
        <Table
          columns={cmdColumns}
          data={cmdData}
          emptyMessage="[ NO COMMANDS HAVE BEEN SENT TO THIS DEVICE ]"
        />
      </Card>
    </div>
  );
}

const styles = {
  deviceName: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-xl)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    margin: 0,
    fontWeight: 'normal',
  },
  metaGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-4)',
  },
  metaItem: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-primary)',
  },
  metaLabel: {
    color: 'var(--color-phosphor-ghost)',
  },
  assignGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'var(--space-3)',
  },
  telemetryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 'var(--space-3)',
  },
  telemetryItem: {
    background: 'var(--color-bg-base)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-3) var(--space-4)',
  },
  telemetryKey: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wide)',
    fontFamily: 'var(--font-mono)',
  },
  telemetryValue: {
    fontSize: 'var(--text-lg)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    fontFamily: 'var(--font-display)',
    marginTop: 'var(--space-1)',
  },
  timestamp: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    marginTop: 'var(--space-3)',
  },
  emptyState: {
    textAlign: 'center',
    padding: 'var(--space-6)',
    color: 'var(--color-text-muted)',
    fontFamily: 'var(--font-mono)',
  },
};

export default DeviceDetail;
