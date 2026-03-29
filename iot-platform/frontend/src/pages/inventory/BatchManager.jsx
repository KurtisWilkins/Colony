import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Badge, Table, Button, Input, Select, Modal, Loader, AlertBanner,
} from '../../components/ui';
import {
  getBatches, getBatch, createBatch, addJarsToBatch,
  getStrains, getRecipes, getJars,
} from '../../utils/api';

// ── Helpers ──────────────────────────────────────────────────────────────

function statusBadge(status) {
  const map = {
    active: 'online', planning: 'info', completed: 'warning', cancelled: 'offline',
  };
  return <Badge variant={map[status] || 'info'}>{status}</Badge>;
}

function fmtDate(ts) {
  if (!ts) return '--';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Component ────────────────────────────────────────────────────────────

function BatchManager() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('selected');

  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchJars, setBatchJars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);

  // Lookups
  const [strains, setStrains] = useState([]);
  const [recipes, setRecipes] = useState([]);

  // Create batch modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    recipe_id: '', strain_id: '', planned_jar_count: '', notes: '',
  });
  const [createError, setCreateError] = useState(null);
  const [createLoading, setCreateLoading] = useState(false);

  // Add jars modal
  const [showAddJars, setShowAddJars] = useState(false);
  const [addJarsForm, setAddJarsForm] = useState({ jar_ids: '', tag_ids: '' });
  const [addJarsError, setAddJarsError] = useState(null);
  const [addJarsLoading, setAddJarsLoading] = useState(false);

  useEffect(() => {
    getStrains().then((d) => setStrains(Array.isArray(d) ? d : d?.strains || [])).catch(() => {});
    getRecipes().then((d) => setRecipes(Array.isArray(d) ? d : d?.recipes || [])).catch(() => {});
  }, []);

  const fetchBatches = useCallback(() => {
    setLoading(true);
    getBatches()
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.batches || [];
        setBatches(list);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  // Load batch detail when selected
  useEffect(() => {
    if (!selectedId) {
      setSelectedBatch(null);
      setBatchJars([]);
      return;
    }
    setDetailLoading(true);
    Promise.all([
      getBatch(selectedId).catch(() => null),
      getJars({ batch_id: selectedId }).catch(() => []),
    ])
      .then(([batch, jars]) => {
        setSelectedBatch(batch);
        setBatchJars(Array.isArray(jars) ? jars : jars?.jars || []);
      })
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const handleCreateBatch = () => {
    if (!createForm.strain_id) {
      setCreateError('Strain is required');
      return;
    }
    setCreateLoading(true);
    setCreateError(null);
    createBatch({
      recipe_id: createForm.recipe_id || undefined,
      strain_id: createForm.strain_id,
      planned_jar_count: Number(createForm.planned_jar_count) || undefined,
      notes: createForm.notes || undefined,
    })
      .then(() => {
        setShowCreate(false);
        setCreateForm({ recipe_id: '', strain_id: '', planned_jar_count: '', notes: '' });
        fetchBatches();
      })
      .catch((err) => setCreateError(err.message))
      .finally(() => setCreateLoading(false));
  };

  const handleAddJars = () => {
    if (!selectedId) return;
    const tagList = addJarsForm.tag_ids
      .split(/[,\n]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tagList.length === 0) {
      setAddJarsError('Enter at least one tag ID');
      return;
    }
    setAddJarsLoading(true);
    setAddJarsError(null);
    addJarsToBatch(selectedId, { tag_ids: tagList })
      .then(() => {
        setShowAddJars(false);
        setAddJarsForm({ jar_ids: '', tag_ids: '' });
        // Refresh detail
        setSearchParams({ selected: selectedId });
      })
      .catch((err) => setAddJarsError(err.message))
      .finally(() => setAddJarsLoading(false));
  };

  if (loading) return <Loader text="LOADING BATCHES" />;

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>BATCH MANAGER</h1>
          <span style={styles.subtitle}>{batches.length} BATCHES</span>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ NEW BATCH</Button>
      </div>

      {error && <AlertBanner variant="error" dismissible>{error}</AlertBanner>}

      <div style={styles.layout}>
        {/* Batch list */}
        <div style={styles.listPane}>
          <Card title="ALL BATCHES">
            <Table
              columns={['BATCH', 'STRAIN', 'RECIPE', 'JARS', 'STATUS', 'DATE']}
              data={batches.map((b) => [
                b.batch_code || `B-${b.id}`,
                b.strain_name || b.strain || '--',
                b.recipe_name || b.recipe || '--',
                `${b.jar_count || 0}/${b.planned_jar_count || '?'}`,
                statusBadge(b.status || 'active'),
                fmtDate(b.created_at),
              ])}
              onRowClick={(idx) => {
                const b = batches[idx];
                if (b) setSearchParams({ selected: String(b.id) });
              }}
              emptyMessage="[ NO BATCHES ]"
            />
          </Card>
        </div>

        {/* Batch detail */}
        <div style={styles.detailPane}>
          {selectedId ? (
            detailLoading ? (
              <Loader text="LOADING BATCH" />
            ) : selectedBatch ? (
              <Card
                title={`BATCH: ${selectedBatch.batch_code || selectedBatch.id}`}
                headerAction={
                  <Button size="sm" variant="secondary" onClick={() => setShowAddJars(true)}>
                    + ADD JARS
                  </Button>
                }
              >
                <div style={styles.detailGrid}>
                  <div style={styles.detailLabel}>STRAIN</div>
                  <div style={styles.detailValue}>{selectedBatch.strain_name || '--'}</div>
                  <div style={styles.detailLabel}>RECIPE</div>
                  <div style={styles.detailValue}>{selectedBatch.recipe_name || '--'}</div>
                  <div style={styles.detailLabel}>STATUS</div>
                  <div style={styles.detailValue}>{statusBadge(selectedBatch.status)}</div>
                  <div style={styles.detailLabel}>PLANNED</div>
                  <div style={styles.detailValue}>{selectedBatch.planned_jar_count || '--'} jars</div>
                  <div style={styles.detailLabel}>ACTUAL</div>
                  <div style={styles.detailValue}>{batchJars.length} jars</div>
                  <div style={styles.detailLabel}>CREATED</div>
                  <div style={styles.detailValue}>{fmtDate(selectedBatch.created_at)}</div>
                  {selectedBatch.notes && (
                    <>
                      <div style={styles.detailLabel}>NOTES</div>
                      <div style={styles.detailValue}>{selectedBatch.notes}</div>
                    </>
                  )}
                </div>

                <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
                  <div style={styles.subTitle}>JARS IN BATCH</div>
                  <Table
                    columns={['TAG', 'STATUS', 'LOCATION', 'COLONIZATION']}
                    data={batchJars.map((j) => [
                      j.tag_id || j.nfc_tag || `J-${j.id}`,
                      statusBadge(j.status || 'unknown'),
                      j.location_name || j.location || '--',
                      j.colonization_pct != null ? `${j.colonization_pct}%` : '--',
                    ])}
                    onRowClick={(idx) => {
                      const j = batchJars[idx];
                      if (j) navigate(`/inventory/jars/${j.id}`);
                    }}
                    emptyMessage="[ NO JARS IN BATCH ]"
                  />
                </div>
              </Card>
            ) : (
              <AlertBanner variant="warning">Batch not found</AlertBanner>
            )
          ) : (
            <Card>
              <div style={styles.placeholder}>
                SELECT A BATCH TO VIEW DETAILS
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Create Batch Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="CREATE NEW BATCH">
        {createError && <AlertBanner variant="error">{createError}</AlertBanner>}
        <Select
          label="Recipe"
          options={[
            { value: '', label: '-- SELECT RECIPE --' },
            ...recipes.map((r) => ({ value: String(r.id), label: r.name })),
          ]}
          value={createForm.recipe_id}
          onChange={(e) => setCreateForm({ ...createForm, recipe_id: e.target.value })}
        />
        <Select
          label="Strain"
          options={[
            { value: '', label: '-- SELECT STRAIN --' },
            ...strains.map((s) => ({ value: String(s.id), label: s.name })),
          ]}
          value={createForm.strain_id}
          onChange={(e) => setCreateForm({ ...createForm, strain_id: e.target.value })}
        />
        <Input
          label="Planned Jar Count"
          type="number"
          value={createForm.planned_jar_count}
          onChange={(e) => setCreateForm({ ...createForm, planned_jar_count: e.target.value })}
          placeholder="E.G. 12"
        />
        <Input
          label="Notes"
          value={createForm.notes}
          onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
          placeholder="OPTIONAL..."
        />
        <div style={styles.modalActions}>
          <Button variant="secondary" onClick={() => setShowCreate(false)}>CANCEL</Button>
          <Button onClick={handleCreateBatch} loading={createLoading}>CREATE BATCH</Button>
        </div>
      </Modal>

      {/* Add Jars Modal */}
      <Modal open={showAddJars} onClose={() => setShowAddJars(false)} title="ADD JARS TO BATCH">
        {addJarsError && <AlertBanner variant="error">{addJarsError}</AlertBanner>}
        <Input
          label="Tag IDs (comma or newline separated)"
          value={addJarsForm.tag_ids}
          onChange={(e) => setAddJarsForm({ ...addJarsForm, tag_ids: e.target.value })}
          placeholder="TAG-001, TAG-002, ..."
        />
        <div style={styles.modalActions}>
          <Button variant="secondary" onClick={() => setShowAddJars(false)}>CANCEL</Button>
          <Button onClick={handleAddJars} loading={addJarsLoading}>ADD JARS</Button>
        </div>
      </Modal>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

const styles = {
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-6)',
    flexWrap: 'wrap',
    gap: 'var(--space-3)',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-2xl)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    margin: 0,
    letterSpacing: 'var(--letter-spacing-wider)',
  },
  subtitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-ghost)',
    letterSpacing: 'var(--letter-spacing-wider)',
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-4)',
    alignItems: 'start',
  },
  listPane: {
    minWidth: 0,
  },
  detailPane: {
    minWidth: 0,
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: 'var(--space-2) var(--space-4)',
  },
  detailLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-ghost)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  detailValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-phosphor-primary)',
  },
  subTitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wider)',
    marginBottom: 'var(--space-3)',
  },
  placeholder: {
    textAlign: 'center',
    padding: 'var(--space-12)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-phosphor-ghost)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  modalActions: {
    display: 'flex',
    gap: 'var(--space-3)',
    justifyContent: 'flex-end',
    marginTop: 'var(--space-4)',
  },
};

export default BatchManager;
