import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Breadcrumb from '../components/Breadcrumb';

/**
 * UnitList page.
 * Shows all units within a given facility and building.
 */
function UnitList() {
  const { facility, building } = useParams();
  const [units, setUnits] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUnits = async () => {
      try {
        const res = await axios.get(
          `/api/hierarchy/${encodeURIComponent(facility)}/${encodeURIComponent(building)}`
        );
        setUnits(res.data);
      } catch (err) {
        console.error('Failed to fetch units:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchUnits();
  }, [facility, building]);

  if (loading) {
    return <div className="loading">Loading units...</div>;
  }

  // Breadcrumb navigation
  const breadcrumbItems = [
    { label: 'Facilities', path: '/devices' },
    { label: facility, path: `/devices/${encodeURIComponent(facility)}` },
    { label: building, path: `/devices/${encodeURIComponent(facility)}/${encodeURIComponent(building)}` },
  ];

  // Extract units array from the API response
  const unitsList = units?.units || [];

  return (
    <div>
      <Breadcrumb items={breadcrumbItems} />

      <div className="page-header">
        <h1>{building} - Units</h1>
      </div>

      {unitsList.length === 0 ? (
        <div className="empty-state">No units found in this building.</div>
      ) : (
        <div className="card-grid">
          {unitsList.map((u) => (
            <div
              key={u.name}
              className="card card-clickable"
              onClick={() =>
                navigate(
                  `/devices/${encodeURIComponent(facility)}/${encodeURIComponent(building)}/${encodeURIComponent(u.name)}`
                )
              }
            >
              <h3>{u.name}</h3>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default UnitList;
