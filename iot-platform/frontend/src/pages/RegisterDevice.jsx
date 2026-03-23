import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, Button, Input, Select, AlertBanner, Loader } from '../components/ui';

function RegisterDevice() {
  const navigate = useNavigate();

  const [facility, setFacility] = useState('');
  const [building, setBuilding] = useState('');
  const [unit, setUnit] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [deviceType, setDeviceType] = useState('sensor');

  const [facilities, setFacilities] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [units, setUnits] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHierarchy = async () => {
      try {
        const res = await axios.get('/api/hierarchy');
        const data = res.data || {};
        const facilitiesArr = data.facilities || [];

        const facilitySet = new Set();
        const buildingSet = new Set();
        const unitSet = new Set();

        for (const fac of facilitiesArr) {
          facilitySet.add(fac.name);
          for (const bld of fac.buildings || []) {
            buildingSet.add(bld.name);
            for (const u of bld.units || []) {
              unitSet.add(u.name);
            }
          }
        }

        setFacilities([...facilitySet]);
        setBuildings([...buildingSet]);
        setUnits([...unitSet]);
      } catch (err) {
        console.error('Failed to fetch hierarchy for autocomplete:', err);
      }
    };
    fetchHierarchy();
  }, []);

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
      setError(err.response?.data?.error || 'FAILED TO REGISTER DEVICE.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setDeviceName('');
    setResult(null);
    setError(null);
  };

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={styles.title}>REGISTER DEVICE</h1>
        <p style={styles.subtitle}>ADD A NEW DEVICE TO THE IOT PLATFORM</p>
      </div>

      <Card style={{ maxWidth: 560 }}>
        {result && (
          <AlertBanner variant="success">
            DEVICE REGISTERED SUCCESSFULLY!
            {result.id && <span> DEVICE ID: <strong>{result.id}</strong></span>}
            <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)' }}>
              <Button size="sm" onClick={resetForm}>REGISTER ANOTHER</Button>
              {result.id && (
                <Button size="sm" variant="secondary" onClick={() => navigate(`/device/${result.id}`)}>
                  VIEW DEVICE
                </Button>
              )}
            </div>
          </AlertBanner>
        )}

        {error && <AlertBanner variant="error">{error}</AlertBanner>}

        {!result && (
          <form onSubmit={handleSubmit}>
            <Input
              id="facility"
              label="FACILITY"
              prefix="> "
              type="text"
              list="facility-options"
              value={facility}
              onChange={(e) => setFacility(e.target.value)}
              placeholder="E.G., MAIN CAMPUS"
              required
            />
            <datalist id="facility-options">
              {facilities.map((f) => <option key={f} value={f} />)}
            </datalist>

            <Input
              id="building"
              label="BUILDING"
              prefix="> "
              type="text"
              list="building-options"
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              placeholder="E.G., BUILDING A"
              required
            />
            <datalist id="building-options">
              {buildings.map((b) => <option key={b} value={b} />)}
            </datalist>

            <Input
              id="unit"
              label="UNIT"
              prefix="> "
              type="text"
              list="unit-options"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="E.G., ROOM 101"
              required
            />
            <datalist id="unit-options">
              {units.map((u) => <option key={u} value={u} />)}
            </datalist>

            <Input
              id="deviceName"
              label="DEVICE NAME"
              prefix="> "
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="E.G., TEMPERATURE SENSOR 1"
              required
            />

            <Select
              id="deviceType"
              label="DEVICE TYPE"
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value)}
              options={[
                { value: 'sensor', label: 'SENSOR' },
                { value: 'actuator', label: 'ACTUATOR' },
                { value: 'combo', label: 'COMBO' },
              ]}
            />

            <Button
              type="submit"
              loading={submitting}
              disabled={submitting}
              style={{ width: '100%', marginTop: 'var(--space-2)' }}
            >
              REGISTER DEVICE
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

const styles = {
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
};

export default RegisterDevice;
