import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
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
import { Card, Badge, Button, Input, Select, Textarea, AlertBanner, Loader, Table } from '../components/ui';
import { terminalChartTheme, terminalLineDataset } from '../styles/chartTheme';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

function DeviceDetail() {
  const { deviceId } = useParams();

  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [latestTelemetry, setLatestTelemetry] = useState(null);
  const [telemetryHistory, setTelemetryHistory] = useState([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [commands, setCommands] = useState([]);
  const [commandMsg, setCommandMsg] = useState(null);

  const [relayNumber, setRelayNumber] = useState(1);
  const [relayState, setRelayState] = useState('on');
  const [pollingInterval, setPollingInterval] = useState(60);
  const [motorDirection, setMotorDirection] = useState('forward');
  const [motorSteps, setMotorSteps] = useState(100);
  const [customCommand, setCustomCommand] = useState('');

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

  const sendCommand = async (commandType, payload) => {
    try {
      await axios.post(`/api/commands/${deviceId}`, { command_type: commandType, payload });
      setCommandMsg({ type: 'success', text: `COMMAND "${commandType.toUpperCase()}" SENT SUCCESSFULLY.` });
      fetchCommands();
    } catch (err) {
      setCommandMsg({ type: 'error', text: `FAILED TO SEND COMMAND: ${err.response?.data?.error || err.message}` });
    }
    setTimeout(() => setCommandMsg(null), 5000);
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

  // Command history table data
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
          <Badge variant={device.is_online ? 'online' : 'offline'} />
        </div>
        <div style={styles.metaGrid}>
          <span style={styles.metaItem}><span style={styles.metaLabel}>FACILITY:</span> {device.facility}</span>
          <span style={styles.metaItem}><span style={styles.metaLabel}>BUILDING:</span> {device.building}</span>
          <span style={styles.metaItem}><span style={styles.metaLabel}>UNIT:</span> {device.unit}</span>
          <span style={styles.metaItem}><span style={styles.metaLabel}>TYPE:</span> {device.device_type}</span>
        </div>
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

      {/* Command panel */}
      <Card title="SEND COMMANDS" style={{ marginBottom: 'var(--space-4)' }}>
        {commandMsg && (
          <AlertBanner variant={commandMsg.type} dismissible>
            {commandMsg.text}
          </AlertBanner>
        )}

        {/* Toggle Relay */}
        <div style={styles.cmdSection}>
          <h3 style={styles.cmdTitle}>TOGGLE RELAY</h3>
          <div style={styles.cmdRow}>
            <Input
              label="RELAY #"
              type="number"
              min="1"
              value={relayNumber}
              onChange={(e) => setRelayNumber(Number(e.target.value))}
              style={{ width: 80 }}
            />
            <Select
              label="STATE"
              value={relayState}
              onChange={(e) => setRelayState(e.target.value)}
              options={[{ value: 'on', label: 'ON' }, { value: 'off', label: 'OFF' }]}
              style={{ width: 100 }}
            />
            <div style={{ alignSelf: 'flex-end', marginBottom: 'var(--space-4)' }}>
              <Button size="sm" onClick={() => sendCommand('toggle_relay', { relay: relayNumber, state: relayState })}>
                SEND
              </Button>
            </div>
          </div>
        </div>

        {/* Set Polling Interval */}
        <div style={styles.cmdSection}>
          <h3 style={styles.cmdTitle}>SET POLLING INTERVAL</h3>
          <div style={styles.cmdRow}>
            <Input
              label="SECONDS"
              type="number"
              min="1"
              value={pollingInterval}
              onChange={(e) => setPollingInterval(Number(e.target.value))}
              style={{ width: 100 }}
            />
            <div style={{ alignSelf: 'flex-end', marginBottom: 'var(--space-4)' }}>
              <Button size="sm" onClick={() => sendCommand('set_interval', { interval_seconds: pollingInterval })}>
                SET INTERVAL
              </Button>
            </div>
          </div>
        </div>

        {/* Immediate Reading */}
        <div style={styles.cmdSection}>
          <h3 style={styles.cmdTitle}>REQUEST IMMEDIATE READING</h3>
          <Button size="sm" onClick={() => sendCommand('read_now', {})}>
            REQUEST READING
          </Button>
        </div>

        {/* Motor Move */}
        <div style={styles.cmdSection}>
          <h3 style={styles.cmdTitle}>MOTOR MOVE</h3>
          <div style={styles.cmdRow}>
            <Select
              label="DIRECTION"
              value={motorDirection}
              onChange={(e) => setMotorDirection(e.target.value)}
              options={[
                { value: 'forward', label: 'FORWARD' },
                { value: 'backward', label: 'BACKWARD' },
                { value: 'left', label: 'LEFT' },
                { value: 'right', label: 'RIGHT' },
              ]}
              style={{ width: 140 }}
            />
            <Input
              label="STEPS"
              type="number"
              min="1"
              value={motorSteps}
              onChange={(e) => setMotorSteps(Number(e.target.value))}
              style={{ width: 100 }}
            />
            <div style={{ alignSelf: 'flex-end', marginBottom: 'var(--space-4)' }}>
              <Button size="sm" onClick={() => sendCommand('motor_move', { direction: motorDirection, steps: motorSteps })}>
                MOVE
              </Button>
            </div>
          </div>
        </div>

        {/* Gripper */}
        <div style={styles.cmdSection}>
          <h3 style={styles.cmdTitle}>GRIPPER</h3>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button size="sm" onClick={() => sendCommand('gripper_open', {})}>GRIPPER OPEN</Button>
            <Button size="sm" variant="danger" onClick={() => sendCommand('gripper_close', {})}>GRIPPER CLOSE</Button>
          </div>
        </div>

        {/* Custom Command */}
        <div style={{ ...styles.cmdSection, borderBottom: 'none' }}>
          <h3 style={styles.cmdTitle}>CUSTOM COMMAND</h3>
          <Textarea
            label="RAW JSON PAYLOAD"
            value={customCommand}
            onChange={(e) => setCustomCommand(e.target.value)}
            placeholder='{"command_type": "custom", "payload": {}}'
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              try {
                const parsed = JSON.parse(customCommand);
                sendCommand(parsed.command_type || 'custom', parsed.payload || parsed);
              } catch {
                setCommandMsg({ type: 'error', text: 'INVALID JSON. CHECK YOUR INPUT.' });
                setTimeout(() => setCommandMsg(null), 5000);
              }
            }}
          >
            SEND CUSTOM COMMAND
          </Button>
        </div>
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
  cmdSection: {
    marginBottom: 'var(--space-4)',
    paddingBottom: 'var(--space-4)',
    borderBottom: '1px solid var(--color-border)',
  },
  cmdTitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    letterSpacing: 'var(--letter-spacing-wide)',
    marginBottom: 'var(--space-3)',
    fontWeight: 'normal',
  },
  cmdRow: {
    display: 'flex',
    gap: 'var(--space-3)',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
};

export default DeviceDetail;
