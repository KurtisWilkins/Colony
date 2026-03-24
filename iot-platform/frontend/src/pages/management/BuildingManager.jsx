import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Button, Input, Textarea, Select, AlertBanner, Loader, Badge } from '../../components/ui';
import { getFacilities, getBuildings, createBuilding, updateBuilding, deleteBuilding } from '../../utils/api';

function BuildingManager() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [facilities, setFacilities] = useState([]);
  const [facilityId, setFacilityId] = useState(searchParams.get('facility') || '');
  const [buildings, setBuildings] = useState([]);
  const [selected, setSelected] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [form, setForm] = useState({ name: '', description: '', floor_count: 1 });

  const fetchFacilities = useCallback(async () => {
    try {
      const data = await getFacilities();
      setFacilities(data);
      if (!facilityId && data.length > 0) {
        setFacilityId(data[0].id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [facilityId]);

  const fetchBuildings = useCallback(async () => {
    if (!facilityId) return;
    try {
      const data = await getBuildings(facilityId);
      setBuildings(data);
      // Auto-select from URL param
      const selectedId = searchParams.get('selected');
      if (selectedId) {
        const found = data.find(b => b.id === selectedId);
        if (found) {
          setSelected(found);
          setForm({ name: found.name, description: found.description || '', floor_count: found.floor_count || 1 });
        }
      }
    } catch (err) {
      setError(err.message);
    }
  }, [facilityId, searchParams]);

  useEffect(() => { fetchFacilities(); }, [fetchFacilities]);
  useEffect(() => { fetchBuildings(); }, [fetchBuildings]);

  const handleFacilityChange = (e) => {
    setFacilityId(e.target.value);
    setSelected(null);
    setIsNew(false);
    setBuildings([]);
  };

  const selectBuilding = (b) => {
    setSelected(b);
    setIsNew(false);
    setForm({ name: b.name, description: b.description || '', floor_count: b.floor_count || 1 });
    setError(null);
    setSuccess(null);
    setConfirmDelete(false);
  };

  const startNew = () => {
    setSelected(null);
    setIsNew(true);
    setForm({ name: '', description: '', floor_count: 1 });
    setError(null);
    setSuccess(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Building name is required'); return; }
    if (!facilityId) { setError('Select a facility first'); return; }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (isNew) {
        const created = await createBuilding({ ...form, facility_id: facilityId });
        setIsNew(false);
        setSelected(created);
        setSuccess('Building created');
      } else {
        const updated = await updateBuilding(selected.id, form);
        setSelected(updated);
        setSuccess('Building updated');
      }
      await fetchBuildings();
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
      await deleteBuilding(selected.id);
      setSelected(null);
      setIsNew(false);
      setForm({ name: '', description: '', floor_count: 1 });
      setSuccess('Building deleted');
      await fetchBuildings();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  if (loading) return <Loader type="spin" text="LOADING BUILDINGS" />;

  const facilityOptions = facilities.map(f => ({ value: f.id, label: f.name.toUpperCase() }));

  return (
    <div style={styles.layout}>
      <div style={styles.leftCol}>
        <Card title="BUILDINGS">
          <div style={{ padding: '0 var(--space-4) var(--space-2)' }}>
            <Select
              label="FACILITY"
              value={facilityId}
              onChange={handleFacilityChange}
              options={[{ value: '', label: '-- SELECT FACILITY --' }, ...facilityOptions]}
            />
          </div>
          {buildings.length === 0 ? (
            <div style={styles.emptyList}>
              {facilityId ? '[ NO BUILDINGS ]' : '[ SELECT A FACILITY ]'}
            </div>
          ) : (
            buildings.map((b) => (
              <div
                key={b.id}
                onClick={() => selectBuilding(b)}
                style={{
                  ...styles.listItem,
                  borderLeftColor: selected?.id === b.id ? 'var(--color-phosphor-primary)' : 'transparent',
                  background: selected?.id === b.id ? 'var(--color-phosphor-glow)' : 'transparent',
                }}
              >
                <span style={styles.listName}>{b.name.toUpperCase()}</span>
                <span style={styles.listMeta}>
                  {b.unit_count} unit{b.unit_count !== 1 ? 's' : ''} / {b.device_count} device{b.device_count !== 1 ? 's' : ''}
                </span>
              </div>
            ))
          )}
          {facilityId && (
            <div style={{ padding: 'var(--space-3)' }}>
              <Button variant="primary" size="sm" onClick={startNew} style={{ width: '100%' }}>
                + NEW BUILDING
              </Button>
            </div>
          )}
        </Card>
      </div>

      <div style={styles.rightCol}>
        {(selected || isNew) ? (
          <Card title={isNew ? 'NEW BUILDING' : `EDIT: ${selected.name.toUpperCase()}`}>
            {error && <AlertBanner variant="error" dismissible onDismiss={() => setError(null)}>{error}</AlertBanner>}
            {success && <AlertBanner variant="success" dismissible onDismiss={() => setSuccess(null)}>{success}</AlertBanner>}

            <Input
              label="BUILDING NAME"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={100}
              placeholder="e.g. Tent Room A"
            />
            <Textarea
              label="DESCRIPTION"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional description"
            />
            <Input
              label="FLOOR COUNT"
              type="number"
              min={1}
              max={99}
              value={form.floor_count}
              onChange={(e) => setForm({ ...form, floor_count: parseInt(e.target.value) || 1 })}
            />

            {/* Units in this building */}
            {selected && selected.units && (
              <div style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                <div style={styles.subHeader}>[ UNITS ]</div>
                {selected.units.map((u) => (
                  <div
                    key={u.id}
                    style={styles.subItem}
                    onClick={() => navigate(`/manage/units?building=${selected.id}&selected=${u.id}`)}
                  >
                    <span style={styles.treePrefix}>{'\u251C\u2500\u2500'}</span>
                    <span style={styles.subName}>{u.name.toUpperCase()}</span>
                    <Badge variant="info">{(u.unit_type || 'other').toUpperCase().replace('_', ' ')}</Badge>
                    <span style={styles.subMeta}>{u.device_count} device{u.device_count !== 1 ? 's' : ''}</span>
                  </div>
                ))}
                <div
                  style={styles.subItem}
                  onClick={() => navigate(`/manage/units?building=${selected.id}`)}
                >
                  <span style={styles.treePrefix}>{'\u2514\u2500\u2500'}</span>
                  <Button variant="ghost" size="sm">+ ADD UNIT</Button>
                </div>
              </div>
            )}

            <div style={styles.actions}>
              <Button variant="primary" onClick={handleSave} loading={saving}>
                {isNew ? 'CREATE BUILDING' : 'SAVE BUILDING'}
              </Button>
              {selected && (
                <Button variant="danger" onClick={handleDelete} loading={saving}>
                  {confirmDelete ? 'CONFIRM DELETE?' : 'DELETE BUILDING'}
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <Card>
            <div style={styles.placeholder}>
              Select a building or create a new one
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
  subItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-1) 0',
    cursor: 'pointer',
  },
  treePrefix: {
    color: 'var(--color-phosphor-ghost)',
    fontFamily: 'var(--font-mono)',
  },
  subName: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
  },
  subMeta: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    marginLeft: 'auto',
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

export default BuildingManager;
