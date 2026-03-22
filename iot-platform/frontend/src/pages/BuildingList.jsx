import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Breadcrumb from '../components/Breadcrumb';

/**
 * BuildingList page.
 * Shows all buildings within a given facility.
 */
function BuildingList() {
  const { facility } = useParams();
  const [buildings, setBuildings] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchBuildings = async () => {
      try {
        const res = await axios.get(`/api/hierarchy/${encodeURIComponent(facility)}`);
        setBuildings(res.data);
      } catch (err) {
        console.error('Failed to fetch buildings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchBuildings();
  }, [facility]);

  if (loading) {
    return <div className="loading">Loading buildings...</div>;
  }

  // Breadcrumb navigation
  const breadcrumbItems = [
    { label: 'Facilities', path: '/devices' },
    { label: facility, path: `/devices/${encodeURIComponent(facility)}` },
  ];

  // Extract buildings array from the API response
  const buildingsList = buildings?.buildings || [];

  return (
    <div>
      <Breadcrumb items={breadcrumbItems} />

      <div className="page-header">
        <h1>{facility} - Buildings</h1>
      </div>

      {buildingsList.length === 0 ? (
        <div className="empty-state">No buildings found in this facility.</div>
      ) : (
        <div className="card-grid">
          {buildingsList.map((bld) => (
            <div
              key={bld.name}
              className="card card-clickable"
              onClick={() =>
                navigate(`/devices/${encodeURIComponent(facility)}/${encodeURIComponent(bld.name)}`)
              }
            >
              <h3>{bld.name}</h3>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default BuildingList;
