import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Badge, Table, Button, Input, Select, Modal, Loader, AlertBanner,
} from '../../components/ui';
import {
  getJars, createJar, getInventoryLocations, getBatches, getStrains,
} from '../../utils/api';

// ── Helpers ──────────────────────────────────────────────────────────────

function statusBadge(status) {
  const map = {
    colonizing: 'info',
    fruiting: 'online',
    harvesting: 'online',
    resting: 'warning',
    contaminated: 'offline',
    retired: 'offline',
    available: 'info',
  };
  return <Badge variant={map[status] || 'info'}>{status}</Badge>;
}

function formatRelative(ts) {
  if (!ts) return '--';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ── Component ────────────────────────────────────────────────────────────

function JarList() {
  const navigate = useNavigate();
  const [jars, setJars] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [searchTag, setSearchTag] = useState('');

  // Lookup data
  const [locations, setLocations] = useState([]);
  const [batches, setBatches] = useState([]);
  const [strains, setStrains] = useState([]);

  // Register modal
  const [showRegister, setShowRegister] = useState(false);
  const [regForm, setRegForm] = useState({ tag_id: '', strain_id: '', location_id: '', notes: '' });
  const [regError, setRegError] = useState(null);
  const [regLoading, setRegLoading] = useState(false);

  const perPage = 25;

  // Load lookup data on mount
  useEffect(() => {
    getInventoryLocations().then((d) => setLocations(Array.isArray(d) ? d : d?.locations || [])).catch(() => {});
    getBatches().then((d) => setBatches(Array.isArray(d) ? d : d?.batches || [])).catch(() => {});
    getStrains().then((d) => setStrains(Array.isArray(d) ? d : d?.strains || [])).catch(() => {});
  }, []);

  const fetchJars = useCallback(() => {
    setLoading(true);
    const params = { page, limit: perPage };
    if (filterStatus) params.status = filterStatus;
    if (filterLocation) params.location_id = filterLocation;
    if (filterBatch) params.batch_id = filterBatch;
    if (searchTag) params.tag = searchTag;

    getJars(params)
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.jars || [];
        setJars(list);
        setTotal(data?.total || list.length);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, filterStatus, filterLocation, filterBatch, searchTag]);

  useEffect(() => {
    fetchJars();
  }, [fetchJars]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const handleRegister = () => {
    if (!regForm.tag_id) {
      setRegError('Tag ID is required');
      return;
    }
    setRegLoading(true);
    setRegError(null);
    createJar(regForm)
      .then((jar) => {
        setShowRegister(false);
        setRegForm({ tag_id: '', strain_id: '', location_id: '', notes: '' });
        fetchJars();
      })
      .catch((err) => setRegError(err.message))
      .finally(() => setRegLoading(false));
  };

  const statusOptions = [
    { value: '', label: 'ALL STATUS' },
    { value: 'colonizing', label: 'COLONIZING' },
    { value: 'fruiting', label: 'FRUITING' },
    { value: 'harvesting', label: 'HARVESTING' },
    { value: 'resting', label: 'RESTING' },
    { value: 'contaminated', label: 'CONTAMINATED' },
    { value: 'available', label: 'AVAILABLE' },
    { value: 'retired', label: 'RETIRED' },
  ];

  const locationOptions = [
    { value: '', label: 'ALL LOCATIONS' },
    ...locations.map((l) => ({ value: String(l.id), label: l.name || l.label || `LOC-${l.id}` })),
  ];

  const batchOptions = [
    { value: '', label: 'ALL BATCHES' },
    ...batches.map((b) => ({ value: String(b.id), label: b.batch_code || `BATCH-${b.id}` })),
  ];

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>JAR INVENTORY</h1>
          <span style={styles.subtitle}>{total} TOTAL JARS</span>
        </div>
        <Button onClick={() => setShowRegister(true)}>+ REGISTER JAR</Button>
      </div>

      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-phosphor-ghost)', marginBottom: 'var(--space-4)' }}>
        Each jar has a unique NFC tag. Register jars here, then scan them with your phone to track their lifecycle.
        Status: {'\uD83D\uDFE2'} available {'\u2192'} {'\uD83D\uDCE6'} in batch {'\u2192'} {'\uD83D\uDD25'} sterilizing {'\u2192'} {'\uD83D\uDC89'} inoculating {'\u2192'} {'\uD83C\uDF31'} colonizing {'\u2192'} {'\uD83C\uDF44'} fruiting {'\u2192'} {'\u2702\uFE0F'} harvesting {'\u2192'} {'\uD83D\uDCA4'} resting
      </p>

      {error && (
        <AlertBanner variant="error" dismissible>
          {error}
        </AlertBanner>
      )}

      {/* Filter bar */}
      <Card style={{ marginBottom: 'var(--space-4)' }}>
        <div style={styles.filterBar}>
          <div style={styles.filterItem}>
            <Select
              options={statusOptions}
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            />
          </div>
          <div style={styles.filterItem}>
            <Select
              options={locationOptions}
              value={filterLocation}
              onChange={(e) => { setFilterLocation(e.target.value); setPage(1); }}
            />
          </div>
          <div style={styles.filterItem}>
            <Select
              options={batchOptions}
              value={filterBatch}
              onChange={(e) => { setFilterBatch(e.target.value); setPage(1); }}
            />
          </div>
          <div style={styles.filterItem}>
            <Input
              placeholder="SEARCH TAG ID..."
              value={searchTag}
              onChange={(e) => setSearchTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { setPage(1); fetchJars(); }
              }}
              style={{ marginBottom: 0 }}
            />
          </div>
        </div>
      </Card>

      {/* Jar table */}
      {loading ? (
        <Loader text="LOADING JARS" />
      ) : (
        <Card>
          <Table
            columns={['TAG ID', 'STATUS', 'LOCATION', 'BATCH', 'STRAIN', 'CYCLE #', 'LAST ACTION']}
            data={jars.map((j) => [
              j.tag_id || j.nfc_tag || '--',
              statusBadge(j.status || 'unknown'),
              j.location_name || j.location || '--',
              j.batch_code || j.batch || '--',
              j.strain_name || j.strain || '--',
              j.cycle_number || j.cycle || '--',
              formatRelative(j.updated_at),
            ])}
            onRowClick={(idx) => {
              const j = jars[idx];
              if (j) navigate(`/inventory/jars/${j.id}`);
            }}
            emptyMessage="[ NO JARS FOUND ]"
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={styles.pagination}>
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                &lt; PREV
              </Button>
              <span style={styles.pageInfo}>
                PAGE {page} OF {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                NEXT &gt;
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Register jar modal */}
      <Modal open={showRegister} onClose={() => setShowRegister(false)} title="REGISTER NEW JAR">
        {regError && <AlertBanner variant="error">{regError}</AlertBanner>}
        <Input
          label="NFC Tag ID"
          prefix=">"
          value={regForm.tag_id}
          onChange={(e) => setRegForm({ ...regForm, tag_id: e.target.value })}
          placeholder="SCAN OR ENTER TAG..."
        />
        <Select
          label="Strain"
          options={[
            { value: '', label: '-- SELECT STRAIN --' },
            ...strains.map((s) => ({ value: String(s.id), label: s.name })),
          ]}
          value={regForm.strain_id}
          onChange={(e) => setRegForm({ ...regForm, strain_id: e.target.value })}
        />
        <Select
          label="Location"
          options={[
            { value: '', label: '-- SELECT LOCATION --' },
            ...locations.map((l) => ({ value: String(l.id), label: l.name || l.label || `LOC-${l.id}` })),
          ]}
          value={regForm.location_id}
          onChange={(e) => setRegForm({ ...regForm, location_id: e.target.value })}
        />
        <Input
          label="Notes"
          value={regForm.notes}
          onChange={(e) => setRegForm({ ...regForm, notes: e.target.value })}
          placeholder="OPTIONAL NOTES..."
        />
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
          <Button variant="secondary" onClick={() => setShowRegister(false)}>CANCEL</Button>
          <Button onClick={handleRegister} loading={regLoading}>REGISTER</Button>
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
  filterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-3)',
    alignItems: 'flex-end',
  },
  filterItem: {
    flex: '1 1 180px',
    minWidth: '150px',
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--space-4) 0 var(--space-2)',
    borderTop: '1px solid var(--color-border)',
    marginTop: 'var(--space-2)',
  },
  pageInfo: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
};

export default JarList;
