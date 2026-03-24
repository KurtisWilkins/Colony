import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Button, Input, Textarea, Select, AlertBanner, Loader, Badge } from '../../components/ui';
import {
  getFacilities, getBuildings, getUnits,
  createUnit, updateUnit, deleteUnit,
  getUnassignedDevices, assignDevice, unassignDevice,
  getUnit,
} from '../../utils/api';

const UNIT_TYPES = [
  { value: 'grow_tent', label: 'GROW TENT' },
  { value: 'reservoir', label: 'RESERVOIR' },
  { value: 'server_room', label: 'SERVER ROOM' },
  { value: 'other', label: 'OTHER' },
];

function UnitManager() {
  const [searchParams] = useSearchParams();
  const [facilities, setFacilities] = useState([]);
  const [facilityId, setFacilityId] = useState('');
  const [buildings, setBuildings] = useState([]);
  const [buildingId, setBuildingId] = useState(searchParams.get('building') || '');
  const [units, setUnits] = useState([]);
  const [selected, setSelected] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Device assignment
  const [assignedDevices, setAssignedDevices] = useState([]);
  const [unassigned, setUnassigned] = useState([]);

  const [form, setForm] = useState({ name: '', description: '', unit_type: 'grow_tent' });

  // Load facilities
  useEffect(() => {
    (async () => {
      try {
        const data = await getFacilities();
        setFacilities(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load buildings when facility changes
  useEffect(() => {
    if (!facilityId) { setBuildings([]); return; }
    (async () => {
      try {
        const data = await getBuildings(facilityId);
        setBuildings(data);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [facilityId]);

  // Resolve initial building → facility mapping
  useEffect(() => {
    if (buildingId && facilities.length > 0 && buildings.length === 0) {
      // Need to find which facility this building belongs to
      (async () => {
        for (const f of facilities) {
          try {
            const bs = await getBuildings(f.id);
            if (bs.find(b => b.id === buildingId)) {
              setFacilityId(f.id);
              setBuildings(bs);
              break;
            }
          } catch { /* skip */ }
        }
      })();
    }
  }, [buildingId, facilities, buildings.length]);

  // Load units when building changes
  const fetchUnits = useCallback(async () => {
    if (!buildingId) { setUnits([]); return; }
    try {
      const data = await getUnits(buildingId);
      setUnits(data);
      // Auto-select from URL
      const selectedId = searchParams.get('selected');
      if (selectedId) {
        const found = data.find(u => u.id === selectedId);
        if (found) selectUnit(found);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [buildingId, searchParams]);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  const fetchDevices = useCallback(async (unitId) => {
    try {
      const unitData = await getUnit(unitId);
      setAssignedDevices(unitData.devices || []);
      const unassignedData = await getUnassignedDevices();
      setUnassigned(unassignedData);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const selectUnit = async (u) => {
    setSelected(u);
    setIsNew(false);
    setForm({ name: u.name, description: u.description || '', unit_type: u.unit_type || 'grow_tent' });
    setError(null);
    setSuccess(null);
    setConfirmDelete(false);
    await fetchDevices(u.id);
  };

  const startNew = () => {
    setSelected(null);
    setIsNew(true);
    setForm({ name: '', description: '', unit_type: 'grow_tent' });
    setAssignedDevices([]);
    setUnassigned([]);
    setError(null);
    setSuccess(null);
  };

  const handleFacilityChange = (e) => {
    setFacilityId(e.target.value);
    setBuildingId('');
    setSelected(null);
    setIsNew(false);
    setUnits([]);
  };

  const handleBuildingChange = (e) => {
    setBuildingId(e.target.value);
    setSelected(null);
    setIsNew(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Unit name is required'); return; }
    if (!buildingId) { setError('Select a building first'); return; }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (isNew) {
        const created = await createUnit({ ...form, building_id: buildingId });
        setIsNew(false);
        setSelected(created);
        setSuccess('Unit created');
        await fetchDevices(created.id);
      } else {
        const updated = await updateUnit(selected.id, form);
        setSelected(updated);
        setSuccess('Unit updated');
      }
      await fetchUnits();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await deleteUnit(selected.id);
      setSelected(null);
      setIsNew(false);
      setForm({ name: '', description: '', unit_type: 'grow_tent' });
      setSuccess('Unit deleted');
      await fetchUnits();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  const handleAssign = async (deviceId) => {
    try {
      await assignDevice(deviceId, { unit_id: selected.id });
      setSuccess('Device assigned');
      await fetchDevices(selected.id);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUnassign = async (deviceId) => {
    try {
      await unassignDevice(deviceId);
      setSuccess('Device unassigned');
      await fetchDevices(selected.id);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <Loader type="spin" text="LOADING UNITS" />;

  const facilityOptions = facilities.map(f => ({ value: f.id, label: f.name.toUpperCase() }));
  const buildingOptions = buildings.map(b => ({ value: b.id, label: b.name.toUpperCase() }));

  return (
    <div style={styles.layout}>
      <div style={styles.leftCol}>
        <Card title="UNITS">
          <div style={{ padding: '0 var(--space-4) var(--space-2)' }}>
            <Select
              label="FACILITY"
              value={facilityId}
              onChange={handleFacilityChange}
              options={[{ value: '', label: '-- SELECT --' }, ...facilityOptions]}
            />
            <Select
              label="BUILDING"
              value={buildingId}
              onChange={handleBuildingChange}
              options={[{ value: '', label: '-- SELECT --' }, ...buildingOptions]}
            />
          </div>
          {units.length === 0 ? (
            <div style={styles.emptyList}>
              {buildingId ? '[ NO UNITS ]' : '[ SELECT A BUILDING ]'}
            </div>
          ) : (
            units.map((u) => (
              <div
                key={u.id}
                onClick={() => selectUnit(u)}
                style={{
                  ...styles.listItem,
                  borderLeftColor: selected?.id === u.id ? 'var(--color-phosphor-primary)' : 'transparent',
                  background: selected?.id === u.id ? 'var(--color-phosphor-glow)' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span style={styles.listName}>{u.name.toUpperCase()}</span>
                  <Badge variant="info">{(u.unit_type || 'other').toUpperCase().replace('_', ' ')}</Badge>
                </div>
                <span style={styles.listMeta}>
                  {u.device_count} device{u.device_count !== 1 ? 's' : ''}
                </span>
              </div>
            ))
          )}
          {buildingId && (
            <div style={{ padding: 'var(--space-3)' }}>
              <Button variant="primary" size="sm" onClick={startNew} style={{ width: '100%' }}>
                + NEW UNIT
              </Button>
            </div>
          )}
        </Card>
      </div>

      <div style={styles.rightCol}>
        {(selected || isNew) ? (
          <Card title={isNew ? 'NEW UNIT' : `EDIT: ${selected.name.toUpperCase()}`}>
            {error && <AlertBanner variant="error" dismissible onDismiss={() => setError(null)}>{error}</AlertBanner>}
            {success && <AlertBanner variant="success" dismissible onDismiss={() => setSuccess(null)}>{success}</AlertBanner>}

            <Input
              label="UNIT NAME"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={100}
              placeholder="e.g. Grow Tent 1"
            />
            <Textarea
              label="DESCRIPTION"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional description"
            />
            <Select
              label="UNIT TYPE"
              value={form.unit_type}
              onChange={(e) => setForm({ ...form, unit_type: e.target.value })}
              options={UNIT_TYPES}
            />

            {/* Device assignment - only for existing units */}
            {selected && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <div style={styles.deviceSection}>
                  <div style={styles.deviceCol}>
                    <div style={styles.subHeader}>[ ASSIGNED DEVICES ]</div>
                    {assignedDevices.length === 0 ? (
                      <div style={styles.emptyDevices}>[ NO DEVICES ASSIGNED ]</div>
                    ) : (
                      assignedDevices.map((d) => (
                        <div key={d.id} style={styles.deviceRow}>
                          <span style={{
                            color: d.is_online ? 'var(--color-phosphor-primary)' : 'var(--color-red-alert)',
                            fontSize: '0.5rem',
                          }}>
                            {d.is_online ? '\u25CF' : '\u25CB'}
                          </span>
                          <span style={{
                            ...styles.deviceName,
                            color: d.is_online ? 'var(--color-phosphor-primary)' : 'var(--color-red-alert)',
                          }}>
                            {d.device_name}
                          </span>
                          <Badge variant={d.is_online ? 'online' : 'offline'} />
                          <Button variant="danger" size="sm" onClick={() => handleUnassign(d.id)}>
                            UNASSIGN
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                  <div style={styles.deviceCol}>
                    <div style={styles.subHeader}>[ UNASSIGNED DEVICES ]</div>
                    {unassigned.length === 0 ? (
                      <div style={styles.emptyDevices}>[ ALL DEVICES ASSIGNED ]</div>
                    ) : (
                      unassigned.map((d) => (
                        <div key={d.id} style={styles.deviceRow}>
                          <span style={{
                            color: d.is_online ? 'var(--color-phosphor-primary)' : 'var(--color-red-alert)',
                            fontSize: '0.5rem',
                          }}>
                            {d.is_online ? '\u25CF' : '\u25CB'}
                          </span>
                          <span style={styles.deviceName}>{d.device_name}</span>
                          <Button variant="primary" size="sm" onClick={() => handleAssign(d.id)}>
                            ASSIGN HERE
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            <div style={styles.actions}>
              <Button variant="primary" onClick={handleSave} loading={saving}>
                {isNew ? 'CREATE UNIT' : 'SAVE UNIT'}
              </Button>
              {selected && (
                <Button variant="danger" onClick={handleDelete} loading={saving}>
                  {confirmDelete ? 'CONFIRM DELETE?' : 'DELETE UNIT'}
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <Card>
            <div style={styles.placeholder}>
              Select a unit or create a new one
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

const styles = {
  layout: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.5fr',
    gap: 'var(--space-4)',
  },
  leftCol: {},
  rightCol: {},
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--space-3) var(--space-4)',
    borderLeft: '3px solid transparent',
    cursor: 'pointer',
    transition: 'all var(--transition-base)',
    borderBottom: '1px solid var(--color-border)',
  },
  listName: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-primary)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  listMeta: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
  },
  emptyList: {
    padding: 'var(--space-4)',
    textAlign: 'center',
    color: 'var(--color-phosphor-ghost)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
  },
  subHeader: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    letterSpacing: 'var(--letter-spacing-wider)',
    marginBottom: 'var(--space-2)',
  },
  deviceSection: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-4)',
  },
  deviceCol: {},
  deviceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) 0',
    borderBottom: '1px solid var(--color-border)',
  },
  deviceName: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    flex: 1,
  },
  emptyDevices: {
    color: 'var(--color-phosphor-ghost)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    padding: 'var(--space-2) 0',
  },
  actions: {
    display: 'flex',
    gap: 'var(--space-3)',
    marginTop: 'var(--space-4)',
  },
  placeholder: {
    textAlign: 'center',
    padding: 'var(--space-8)',
    color: 'var(--color-phosphor-ghost)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
  },
};

export default UnitManager;
