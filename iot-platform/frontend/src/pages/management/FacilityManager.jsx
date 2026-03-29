import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Button, Input, Textarea, AlertBanner, Loader, Badge } from '../../components/ui';
import { getFacilities, createFacility, updateFacility, deleteFacility } from '../../utils/api';

function FacilityManager() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [facilities, setFacilities] = useState([]);
  const [selected, setSelected] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Form state
  const [form, setForm] = useState({ name: '', description: '', location: '' });

  const fetchFacilities = useCallback(async () => {
    try {
      const data = await getFacilities();
      setFacilities(data);
      // Auto-select from URL param
      const selectedId = searchParams.get('selected');
      if (selectedId && !selected) {
        const found = data.find(f => f.id === selectedId);
        if (found) {
          setSelected(found);
          setForm({ name: found.name, description: found.description || '', location: found.location || '' });
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [searchParams, selected]);

  useEffect(() => { fetchFacilities(); }, [fetchFacilities]);

  const selectFacility = (f) => {
    setSelected(f);
    setIsNew(false);
    setForm({ name: f.name, description: f.description || '', location: f.location || '' });
    setError(null);
    setSuccess(null);
    setConfirmDelete(false);
  };

  const startNew = () => {
    setSelected(null);
    setIsNew(true);
    setForm({ name: '', description: '', location: '' });
    setError(null);
    setSuccess(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('Facility name is required');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (isNew) {
        const created = await createFacility(form);
        setIsNew(false);
        setSelected(created);
        setSuccess('Facility created');
      } else {
        const updated = await updateFacility(selected.id, form);
        setSelected(updated);
        setSuccess('Facility updated');
      }
      await fetchFacilities();
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
      await deleteFacility(selected.id);
      setSelected(null);
      setIsNew(false);
      setForm({ name: '', description: '', location: '' });
      setSuccess('Facility deleted');
      await fetchFacilities();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  if (loading) return <Loader type="spin" text="LOADING FACILITIES" />;

  return (
    <div style={styles.layout}>
      {/* Left column: list */}
      <div style={styles.leftCol}>
        <Card title="FACILITIES">
          {facilities.length === 0 ? (
            <div style={styles.emptyList}>[ NO FACILITIES ]</div>
          ) : (
            facilities.map((f) => (
              <div
                key={f.id}
                onClick={() => selectFacility(f)}
                style={{
                  ...styles.listItem,
                  borderLeftColor: selected?.id === f.id ? 'var(--color-phosphor-primary)' : 'transparent',
                  background: selected?.id === f.id ? 'var(--color-phosphor-glow)' : 'transparent',
                }}
              >
                <span style={styles.listName}>{f.name.toUpperCase()}</span>
                <span style={styles.listMeta}>
                  {f.building_count} building{f.building_count !== 1 ? 's' : ''} / {f.device_count} device{f.device_count !== 1 ? 's' : ''}
                </span>
              </div>
            ))
          )}
          <div style={{ padding: 'var(--space-3)' }}>
            <Button variant="primary" size="sm" onClick={startNew} style={{ width: '100%' }}>
              + NEW FACILITY
            </Button>
          </div>
        </Card>
      </div>

      {/* Right column: detail/form */}
      <div style={styles.rightCol}>
        {(selected || isNew) ? (
          <Card title={isNew ? 'NEW FACILITY' : `EDIT: ${selected.name.toUpperCase()}`}>
            {error && <AlertBanner variant="error" dismissible onDismiss={() => setError(null)}>{error}</AlertBanner>}
            {success && <AlertBanner variant="success" dismissible onDismiss={() => setSuccess(null)}>{success}</AlertBanner>}

            <Input
              label="FACILITY NAME"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={100}
              placeholder="e.g. Basement Lab"
            />
            <Textarea
              label="DESCRIPTION"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional description"
            />
            <Input
              label="LOCATION"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              maxLength={200}
              placeholder="Physical address or description"
            />

            {/* Buildings in this facility */}
            {selected && selected.buildings && (
              <div style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                <div style={styles.subHeader}>[ BUILDINGS ]</div>
                {selected.buildings && selected.buildings.length > 0 ? (
                  selected.buildings.map((b) => (
                    <div
                      key={b.id}
                      style={styles.subItem}
                      onClick={() => navigate(`/manage/buildings?facility=${selected.id}&selected=${b.id}`)}
                    >
                      <span style={styles.treePrefix}>{'\u251C\u2500\u2500'}</span>
                      <span style={styles.subName}>{b.name.toUpperCase()}</span>
                      <span style={styles.subMeta}>{b.unit_count} unit{b.unit_count !== 1 ? 's' : ''}</span>
                    </div>
                  ))
                ) : null}
                <div
                  style={styles.subItem}
                  onClick={() => navigate(`/manage/buildings?facility=${selected.id}`)}
                >
                  <span style={styles.treePrefix}>{'\u2514\u2500\u2500'}</span>
                  <Button variant="ghost" size="sm">+ ADD BUILDING</Button>
                </div>
              </div>
            )}

            <div style={styles.actions}>
              <Button variant="primary" onClick={handleSave} loading={saving}>
                {isNew ? 'CREATE FACILITY' : 'SAVE FACILITY'}
              </Button>
              {selected && (
                <Button variant="danger" onClick={handleDelete} loading={saving}>
                  {confirmDelete ? 'CONFIRM DELETE?' : 'DELETE FACILITY'}
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <Card>
            <div style={styles.placeholder}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-phosphor-ghost)', marginBottom: 'var(--space-4)', lineHeight: 'var(--leading-relaxed)', textAlign: 'left' }}>
                Facilities are the top level of your location hierarchy. Create facilities to organize your buildings, units, and devices. Example: "Basement Lab", "Greenhouse", "Outdoor Garden".
              </div>
              Select a facility or create a new one
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

export default FacilityManager;
