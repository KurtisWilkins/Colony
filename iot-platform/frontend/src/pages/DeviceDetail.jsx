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
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import StatusBadge from '../components/StatusBadge';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

/**
 * DeviceDetail page.
 * Shows full device info, live telemetry, telemetry chart, command panel, and command history.
 */
function DeviceDetail() {
  const { deviceId } = useParams();

  // Device info state
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(true);

  // Telemetry state
  const [latestTelemetry, setLatestTelemetry] = useState(null);
  const [telemetryHistory, setTelemetryHistory] = useState([]);
  const [selectedKey, setSelectedKey] = useState('');

  // Command state
  const [commands, setCommands] = useState([]);
  const [commandMsg, setCommandMsg] = useState(null);

  // Command form state
  const [relayNumber, setRelayNumber] = useState(1);
  const [relayState, setRelayState] = useState('on');
  const [pollingInterval, setPollingInterval] = useState(60);
  const [motorDirection, setMotorDirection] = useState('forward');
  const [motorSteps, setMotorSteps] = useState(100);
  const [customCommand, setCustomCommand] = useState('');

  // Fetch device info
  const fetchDevice = useCallback(async () => {
    try {
      const res = await axios.get(`/api/devices/${deviceId}`);
      setDevice(res.data);
    } catch (err) {
      console.error('Failed to fetch device:', err);
    }
  }, [deviceId]);

  // Fetch latest telemetry
  const fetchLatestTelemetry = useCallback(async () => {
    try {
      const res = await axios.get(`/api/telemetry/latest/${deviceId}`);
      setLatestTelemetry(res.data);
    } catch (err) {
      // Telemetry may not exist yet; that's okay
      console.error('Failed to fetch latest telemetry:', err);
    }
  }, [deviceId]);

  // Fetch telemetry history
  const fetchTelemetryHistory = useCallback(async () => {
    try {
      const res = await axios.get(`/api/telemetry/${deviceId}?limit=50`);
      const data = Array.isArray(res.data) ? res.data : res.data.telemetry || [];
      setTelemetryHistory(data);

      // Auto-select first payload key if none selected
      if (!selectedKey && data.length > 0 && data[0].payload) {
        const keys = Object.keys(data[0].payload);
        if (keys.length > 0) setSelectedKey(keys[0]);
      }
    } catch (err) {
      console.error('Failed to fetch telemetry history:', err);
    }
  }, [deviceId, selectedKey]);

  // Fetch command history
  const fetchCommands = useCallback(async () => {
    try {
      const res = await axios.get(`/api/commands/${deviceId}`);
      const data = Array.isArray(res.data) ? res.data : res.data.commands || [];
      setCommands(data);
    } catch (err) {
      console.error('Failed to fetch commands:', err);
    }
  }, [deviceId]);

  // Initial data load
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchDevice(), fetchLatestTelemetry(), fetchTelemetryHistory(), fetchCommands()]);
      setLoading(false);
    };
    loadAll();
  }, [fetchDevice, fetchLatestTelemetry, fetchTelemetryHistory, fetchCommands]);

  // Auto-refresh latest telemetry every 10 seconds
  useEffect(() => {
    const interval = setInterval(fetchLatestTelemetry, 10000);
    return () => clearInterval(interval);
  }, [fetchLatestTelemetry]);

  // Send a command to the device
  const sendCommand = async (commandType, payload) => {
    try {
      await axios.post(`/api/commands/${deviceId}`, {
        command_type: commandType,
        payload: payload,
      });
      setCommandMsg({ type: 'success', text: `Command "${commandType}" sent successfully.` });
      // Refresh command history
      fetchCommands();
    } catch (err) {
      setCommandMsg({
        type: 'error',
        text: `Failed to send command: ${err.response?.data?.error || err.message}`,
      });
    }
    // Clear message after 5 seconds
    setTimeout(() => setCommandMsg(null), 5000);
  };

  if (loading) {
    return <div className="loading">Loading device details...</div>;
  }

  if (!device) {
    return <div className="message message-error">Device not found.</div>;
  }

  // Extract payload keys from telemetry history for the chart dropdown
  const payloadKeys = [];
  if (telemetryHistory.length > 0 && telemetryHistory[0].payload) {
    for (const key of Object.keys(telemetryHistory[0].payload)) {
      // Only include numeric values that can be charted
      const val = telemetryHistory[0].payload[key];
      if (typeof val === 'number' || !isNaN(Number(val))) {
        payloadKeys.push(key);
      }
    }
  }

  // Build chart data for the selected key
  // Reverse so oldest is first (left) on x-axis
  const chartHistory = [...telemetryHistory].reverse();
  const chartData = {
    labels: chartHistory.map((t) =>
      new Date(t.received_at).toLocaleTimeString()
    ),
    datasets: [
      {
        label: selectedKey,
        data: chartHistory.map((t) => {
          const val = t.payload?.[selectedKey];
          return typeof val === 'number' ? val : Number(val) || 0;
        }),
        borderColor: '#4361ee',
        backgroundColor: 'rgba(67, 97, 238, 0.1)',
        tension: 0.3,
        fill: true,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true },
      title: { display: false },
    },
    scales: {
      x: { title: { display: true, text: 'Time' } },
      y: { title: { display: true, text: selectedKey } },
    },
  };

  return (
    <div>
      {/* Device metadata header */}
      <div className="panel">
        <div className="device-header">
          <h1>{device.device_name}</h1>
          <StatusBadge is_online={device.is_online} />
        </div>
        <div className="device-meta">
          <span><strong>Facility:</strong> {device.facility}</span>
          <span><strong>Building:</strong> {device.building}</span>
          <span><strong>Unit:</strong> {device.unit}</span>
          <span><strong>Type:</strong> {device.device_type}</span>
        </div>
      </div>

      {/* Live telemetry panel */}
      <div className="panel">
        <h2>Live Telemetry</h2>
        {latestTelemetry && latestTelemetry.payload ? (
          <div className="telemetry-live">
            {Object.entries(latestTelemetry.payload).map(([key, value]) => (
              <div key={key} className="telemetry-item">
                <div className="key">{key}</div>
                <div className="value">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">No telemetry data available.</div>
        )}
        {latestTelemetry?.received_at && (
          <p className="card-meta" style={{ marginTop: 12 }}>
            Last updated: {new Date(latestTelemetry.received_at).toLocaleString()}
          </p>
        )}
      </div>

      {/* Telemetry chart */}
      <div className="panel">
        <h2>Telemetry Chart</h2>
        {payloadKeys.length > 0 ? (
          <>
            {/* Dropdown to select which payload key to chart */}
            <div className="form-group" style={{ maxWidth: 300, marginBottom: 12 }}>
              <label>Select metric to chart</label>
              <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)}>
                {payloadKeys.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>
            <div className="chart-container">
              <Line data={chartData} options={chartOptions} />
            </div>
          </>
        ) : (
          <div className="empty-state">No numeric telemetry data available for charting.</div>
        )}
      </div>

      {/* Command panel */}
      <div className="panel">
        <h2>Send Commands</h2>

        {/* Command status message */}
        {commandMsg && (
          <div className={`message message-${commandMsg.type}`}>{commandMsg.text}</div>
        )}

        {/* Toggle Relay */}
        <div className="command-section">
          <h3>Toggle Relay</h3>
          <div className="form-inline">
            <div className="form-group">
              <label>Relay Number</label>
              <input
                type="number"
                min="1"
                value={relayNumber}
                onChange={(e) => setRelayNumber(Number(e.target.value))}
                style={{ width: 80 }}
              />
            </div>
            <div className="form-group">
              <label>State</label>
              <select value={relayState} onChange={(e) => setRelayState(e.target.value)} style={{ width: 100 }}>
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => sendCommand('toggle_relay', { relay: relayNumber, state: relayState })}
            >
              Send
            </button>
          </div>
        </div>

        {/* Set Polling Interval */}
        <div className="command-section">
          <h3>Set Polling Interval</h3>
          <div className="form-inline">
            <div className="form-group">
              <label>Seconds</label>
              <input
                type="number"
                min="1"
                value={pollingInterval}
                onChange={(e) => setPollingInterval(Number(e.target.value))}
                style={{ width: 100 }}
              />
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => sendCommand('set_interval', { interval_seconds: pollingInterval })}
            >
              Set Interval
            </button>
          </div>
        </div>

        {/* Request Immediate Reading */}
        <div className="command-section">
          <h3>Request Immediate Reading</h3>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => sendCommand('read_now', {})}
          >
            Request Reading
          </button>
        </div>

        {/* Motor Move */}
        <div className="command-section">
          <h3>Motor Move</h3>
          <div className="form-inline">
            <div className="form-group">
              <label>Direction</label>
              <select value={motorDirection} onChange={(e) => setMotorDirection(e.target.value)} style={{ width: 130 }}>
                <option value="forward">Forward</option>
                <option value="backward">Backward</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div className="form-group">
              <label>Steps</label>
              <input
                type="number"
                min="1"
                value={motorSteps}
                onChange={(e) => setMotorSteps(Number(e.target.value))}
                style={{ width: 100 }}
              />
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => sendCommand('motor_move', { direction: motorDirection, steps: motorSteps })}
            >
              Move
            </button>
          </div>
        </div>

        {/* Gripper controls */}
        <div className="command-section">
          <h3>Gripper</h3>
          <div className="btn-group">
            <button
              className="btn btn-success btn-sm"
              onClick={() => sendCommand('gripper_open', {})}
            >
              Gripper Open
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => sendCommand('gripper_close', {})}
            >
              Gripper Close
            </button>
          </div>
        </div>

        {/* Custom Command */}
        <div className="command-section">
          <h3>Custom Command</h3>
          <div className="form-group">
            <label>Raw JSON payload</label>
            <textarea
              value={customCommand}
              onChange={(e) => setCustomCommand(e.target.value)}
              placeholder='{"command_type": "custom", "payload": {}}'
            />
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              try {
                const parsed = JSON.parse(customCommand);
                sendCommand(parsed.command_type || 'custom', parsed.payload || parsed);
              } catch {
                setCommandMsg({ type: 'error', text: 'Invalid JSON. Please check your input.' });
                setTimeout(() => setCommandMsg(null), 5000);
              }
            }}
          >
            Send Custom Command
          </button>
        </div>
      </div>

      {/* Command history */}
      <div className="panel">
        <h2>Command History</h2>
        {commands.length === 0 ? (
          <div className="empty-state">No commands have been sent to this device.</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Issued At</th>
                  <th>Command Type</th>
                  <th>Payload</th>
                  <th>Acknowledged</th>
                </tr>
              </thead>
              <tbody>
                {commands.map((cmd, idx) => (
                  <tr key={cmd.command_id || idx}>
                    <td>{new Date(cmd.issued_at).toLocaleString()}</td>
                    <td>{cmd.command_type}</td>
                    <td>
                      <code>{JSON.stringify(cmd.payload)}</code>
                    </td>
                    <td>
                      <span className={`status-badge ${cmd.acknowledged ? 'online' : 'offline'}`}>
                        {cmd.acknowledged ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default DeviceDetail;
