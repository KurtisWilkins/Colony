import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Breadcrumb from '../components/Breadcrumb';
import StatusBadge from '../components/StatusBadge';

/**
 * DeviceList page.
 * Shows all devices within a given facility/building/unit.
 * Each card displays device_name, device_type, online/offline badge, and last_seen time.
 */
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
        // The response may be an array of devices or an object containing them
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
    return <div className="loading">Loading devices...</div>;
  }

  // Breadcrumb navigation
  const breadcrumbItems = [
    { label: 'Facilities', path: '/devices' },
    { label: facility, path: `/devices/${encodeURIComponent(facility)}` },
    { label: building, path: `/devices/${encodeURIComponent(facility)}/${encodeURIComponent(building)}` },
    { label: unit, path: `/devices/${encodeURIComponent(facility)}/${encodeURIComponent(building)}/${encodeURIComponent(unit)}` },
  ];

  // Format the last_seen timestamp for display
  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div>
      <Breadcrumb items={breadcrumbItems} />

      <div className="page-header">
        <h1>{unit} - Devices</h1>
      </div>

      {devices.length === 0 ? (
        <div className="empty-state">No devices found in this unit.</div>
      ) : (
        <div className="card-grid">
          {devices.map((device) => (
            <div
              key={device.id}
              className="card card-clickable"
              onClick={() => navigate(`/device/${device.id}`)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <h3>{device.device_name}</h3>
                <StatusBadge is_online={device.is_online} />
              </div>
              <p className="card-meta">Type: {device.device_type}</p>
              <p className="card-meta">Last seen: {formatLastSeen(device.last_seen)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DeviceList;
