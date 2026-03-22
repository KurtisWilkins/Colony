import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

/**
 * HierarchyView page.
 * Displays all facilities as cards.
 * Each card shows the facility name, total device count, and online count.
 */
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
    return <div className="loading">Loading facilities...</div>;
  }

  const facilitiesArr = hierarchy?.facilities || [];

  if (facilitiesArr.length === 0) {
    return (
      <div>
        <div className="page-header">
          <h1>Facilities</h1>
        </div>
        <div className="empty-state">No facilities found. Register a device to get started.</div>
      </div>
    );
  }

  // Count devices and online devices per facility
  const facilityStats = (fac) => {
    let deviceCount = 0;
    let onlineCount = 0;
    for (const bld of (fac.buildings || [])) {
      for (const u of (bld.units || [])) {
        const devices = u.devices || [];
        deviceCount += devices.length;
        onlineCount += devices.filter((d) => d.is_online).length;
      }
    }
    return { deviceCount, onlineCount };
  };

  return (
    <div>
      <div className="page-header">
        <h1>Facilities</h1>
        <p>Select a facility to explore its devices</p>
      </div>

      <div className="card-grid">
        {facilitiesArr.map((fac) => {
          const stats = facilityStats(fac);
          return (
            <div
              key={fac.name}
              className="card card-clickable"
              onClick={() => navigate(`/devices/${encodeURIComponent(fac.name)}`)}
            >
              <h3>{fac.name}</h3>
              <p className="card-meta">
                {stats.deviceCount} device(s) &middot;{' '}
                {stats.onlineCount} online
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default HierarchyView;
