import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

/**
 * RegisterDevice page.
 * Form to register a new device with facility, building, unit, device_name, and device_type.
 * Provides datalist autocomplete for facility/building/unit from existing hierarchy.
 */
function RegisterDevice() {
  const navigate = useNavigate();

  // Form fields
  const [facility, setFacility] = useState('');
  const [building, setBuilding] = useState('');
  const [unit, setUnit] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [deviceType, setDeviceType] = useState('sensor');

  // Autocomplete options from hierarchy
  const [facilities, setFacilities] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [units, setUnits] = useState([]);

  // Status
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Fetch hierarchy for autocomplete suggestions
  useEffect(() => {
    const fetchHierarchy = async () => {
      try {
        const res = await axios.get('/api/hierarchy');
        const data = res.data || {};
        const facilitiesArr = data.facilities || [];

        // Extract unique facilities, buildings, and units from nested hierarchy
        const facilitySet = new Set();
        const buildingSet = new Set();
        const unitSet = new Set();

        for (const fac of facilitiesArr) {
          facilitySet.add(fac.name);
          for (const bld of (fac.buildings || [])) {
            buildingSet.add(bld.name);
            for (const u of (bld.units || [])) {
              unitSet.add(u.name);
            }
          }
        }

        setFacilities([...facilitySet]);
        setBuildings([...buildingSet]);
        setUnits([...unitSet]);
      } catch (err) {
        // Hierarchy may not exist yet; that's okay
        console.error('Failed to fetch hierarchy for autocomplete:', err);
      }
    };
    fetchHierarchy();
  }, []);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const res = await axios.post('/api/devices', {
        facility,
        building,
        unit,
        device_name: deviceName,
        device_type: deviceType,
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to register device.');
    } finally {
      setSubmitting(false);
    }
  };

  // Reset form for registering another device
  const resetForm = () => {
    setDeviceName('');
    setResult(null);
    setError(null);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Register Device</h1>
        <p>Add a new device to the IoT platform</p>
      </div>

      <div className="panel" style={{ maxWidth: 560 }}>
        {/* Success message */}
        {result && (
          <div className="message message-success">
            Device registered successfully!
            {result.id && (
              <span> Device ID: <strong>{result.id}</strong></span>
            )}
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={resetForm} style={{ marginRight: 8 }}>
                Register Another
              </button>
              {result.id && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigate(`/device/${result.id}`)}
                >
                  View Device
                </button>
              )}
            </div>
          </div>
        )}

        {/* Error message */}
        {error && <div className="message message-error">{error}</div>}

        {/* Registration form (hidden after success) */}
        {!result && (
          <form onSubmit={handleSubmit}>
            {/* Facility input with datalist autocomplete */}
            <div className="form-group">
              <label htmlFor="facility">Facility</label>
              <input
                id="facility"
                type="text"
                list="facility-options"
                value={facility}
                onChange={(e) => setFacility(e.target.value)}
                placeholder="e.g., Main Campus"
                required
              />
              <datalist id="facility-options">
                {facilities.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>

            {/* Building input with datalist autocomplete */}
            <div className="form-group">
              <label htmlFor="building">Building</label>
              <input
                id="building"
                type="text"
                list="building-options"
                value={building}
                onChange={(e) => setBuilding(e.target.value)}
                placeholder="e.g., Building A"
                required
              />
              <datalist id="building-options">
                {buildings.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            {/* Unit input with datalist autocomplete */}
            <div className="form-group">
              <label htmlFor="unit">Unit</label>
              <input
                id="unit"
                type="text"
                list="unit-options"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g., Room 101"
                required
              />
              <datalist id="unit-options">
                {units.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>

            {/* Device name */}
            <div className="form-group">
              <label htmlFor="deviceName">Device Name</label>
              <input
                id="deviceName"
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g., Temperature Sensor 1"
                required
              />
            </div>

            {/* Device type dropdown */}
            <div className="form-group">
              <label htmlFor="deviceType">Device Type</label>
              <select
                id="deviceType"
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value)}
              >
                <option value="sensor">Sensor</option>
                <option value="actuator">Actuator</option>
                <option value="combo">Combo</option>
              </select>
            </div>

            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Registering...' : 'Register Device'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default RegisterDevice;
