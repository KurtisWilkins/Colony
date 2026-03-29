import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Badge, Button, Table, Loader, AlertBanner, Modal, Input, Select, Textarea,
} from '../../components/ui';
import {
  getJar, getColonizationHistory, logColonizationCheck,
  reportContamination, moveJar, startFlush, recordHarvest,
  retireJar, getInventoryLocations,
} from '../../utils/api';

// ── Helpers ──────────────────────────────────────────────────────────────

function statusBadge(status) {
  const map = {
    colonizing: 'info', fruiting: 'online', harvesting: 'online',
    resting: 'warning', contaminated: 'offline', retired: 'offline', available: 'info',
  };
  return <Badge variant={map[status] || 'info'}>{status}</Badge>;
}

function fmtDate(ts) {
  if (!ts) return '--';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function fmtRelative(ts) {
  if (!ts) return '--';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ── Component ────────────────────────────────────────────────────────────

function JarDetail() {
  const { jarId } = useParams();
  const navigate = useNavigate();

  const [jar, setJar] = useState(null);
  const [colonHistory, setColonHistory] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  // Modal states
  const [modal, setModal] = useState(null); // 'colonCheck' | 'contamination' | 'move' | 'flush' | 'harvest' | 'retire'
  const [formData, setFormData] = useState({});
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  const fetchJar = useCallback(() => {
    if (!jarId) return;
    Promise.all([
      getJar(jarId),
      getColonizationHistory(jarId).catch(() => []),
      getInventoryLocations().catch(() => []),
    ])
      .then(([jarData, colonData, locData]) => {
        setJar(jarData);
        setColonHistory(Array.isArray(colonData) ? colonData : colonData?.checks || []);
        setLocations(Array.isArray(locData) ? locData : locData?.locations || []);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [jarId]);

  useEffect(() => {
    fetchJar();
  }, [fetchJar]);

  const openModal = (type) => {
    setModal(type);
    setFormData({});
    setFormError(null);
  };
  const closeModal = () => { setModal(null); setFormData({}); setFormError(null); };

  const handleAction = (actionFn, successMsg) => {
    setFormLoading(true);
    setFormError(null);
    actionFn()
      .then(() => {
        setActionMsg(successMsg);
        closeModal();
        fetchJar();
        setTimeout(() => setActionMsg(null), 4000);
      })
      .catch((err) => setFormError(err.message))
      .finally(() => setFormLoading(false));
  };

  if (loading) return <Loader text="LOADING JAR" />;
  if (error && !jar) {
    return (
      <div>
        <AlertBanner variant="error">{error}</AlertBanner>
        <Button variant="secondary" onClick={() => navigate('/inventory/jars')}>
          &lt; BACK TO JARS
        </Button>
      </div>
    );
  }
  if (!jar) return <AlertBanner variant="error">Jar not found</AlertBanner>;

  const flushes = jar.flushes || [];
  const movements = jar.movements || jar.move_history || [];
  const timeline = jar.timeline || jar.lifecycle || [];

  return (
    <div>
      {/* Header */}
      <div style={styles.headerRow}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/inventory/jars')}>
          &lt; JARS
        </Button>
      </div>

      {actionMsg && <AlertBanner variant="success" dismissible>{actionMsg}</AlertBanner>}
      {error && <AlertBanner variant="warning" dismissible>{error}</AlertBanner>}

      <div style={styles.jarHeader}>
        <div>
          <div style={styles.tagId}>{jar.tag_id || jar.nfc_tag || `JAR-${jar.id}`}</div>
          <div style={styles.metaRow}>
            {statusBadge(jar.status)}
            <span style={styles.metaText}>LOCATION: {jar.location_name || jar.location || '--'}</span>
            <span style={styles.metaText}>CYCLE #{jar.cycle_number || jar.cycle || 1}</span>
          </div>
        </div>
        <div style={styles.actionButtons}>
          {jar.status === 'colonizing' && (
            <Button size="sm" onClick={() => openModal('colonCheck')}>LOG CHECK</Button>
          )}
          {(jar.status === 'fruiting' || jar.status === 'colonizing') && (
            <Button size="sm" variant="amber" onClick={() => openModal('flush')}>START FLUSH</Button>
          )}
          {jar.status !== 'contaminated' && jar.status !== 'retired' && (
            <Button size="sm" variant="danger" onClick={() => openModal('contamination')}>
              CONTAMINATION
            </Button>
          )}
          {jar.status !== 'retired' && (
            <>
              <Button size="sm" variant="secondary" onClick={() => openModal('move')}>MOVE</Button>
              <Button size="sm" variant="secondary" onClick={() => openModal('retire')}>RETIRE</Button>
            </>
          )}
        </div>
      </div>

      {/* Current cycle info */}
      <div style={styles.grid2}>
        <Card title="CURRENT CYCLE">
          <div style={styles.infoGrid}>
            <div style={styles.infoLabel}>STRAIN</div>
            <div style={styles.infoValue}>{jar.strain_name || jar.strain || '--'}</div>
            <div style={styles.infoLabel}>BATCH</div>
            <div style={styles.infoValue}>{jar.batch_code || jar.batch || '--'}</div>
            <div style={styles.infoLabel}>INOCULATED</div>
            <div style={styles.infoValue}>{fmtDate(jar.inoculation_date || jar.created_at)}</div>
            <div style={styles.infoLabel}>COLONIZATION</div>
            <div style={styles.infoValue}>{jar.colonization_pct != null ? `${jar.colonization_pct}%` : '--'}</div>
            <div style={styles.infoLabel}>TOTAL FLUSHES</div>
            <div style={styles.infoValue}>{flushes.length}</div>
            <div style={styles.infoLabel}>TOTAL YIELD</div>
            <div style={styles.infoValue}>
              {jar.total_yield_grams ? `${jar.total_yield_grams}g` : '--'}
            </div>
          </div>
        </Card>

        <Card title="COLONIZATION CHECKS">
          {colonHistory.length === 0 ? (
            <div style={styles.emptyText}>[ NO CHECKS RECORDED ]</div>
          ) : (
            <Table
              columns={['DATE', '%', 'NOTES']}
              data={colonHistory.map((c) => [
                fmtDate(c.checked_at || c.created_at),
                `${c.colonization_pct || c.percentage || 0}%`,
                c.notes || '--',
              ])}
              emptyMessage="[ NO CHECKS ]"
            />
          )}
        </Card>
      </div>

      {/* Flush / harvest history */}
      <div style={{ marginTop: 'var(--space-4)' }}>
        <Card
          title="FLUSH / HARVEST HISTORY"
          headerAction={
            flushes.length > 0 && jar.status !== 'retired' ? (
              <Button size="sm" variant="secondary" onClick={() => openModal('flush')}>
                + NEW FLUSH
              </Button>
            ) : null
          }
        >
          {flushes.length === 0 ? (
            <div style={styles.emptyText}>[ NO FLUSHES YET ]</div>
          ) : (
            <Table
              columns={['FLUSH #', 'STARTED', 'HARVEST DATE', 'YIELD (g)', 'STATUS']}
              data={flushes.map((f, i) => [
                `#${f.flush_number || i + 1}`,
                fmtDate(f.started_at || f.created_at),
                fmtDate(f.harvested_at),
                f.yield_grams != null ? `${f.yield_grams}g` : '--',
                statusBadge(f.status || (f.harvested_at ? 'harvested' : 'active')),
              ])}
              onRowClick={(idx) => {
                const f = flushes[idx];
                if (f && !f.harvested_at) openModal('harvest');
                if (f && !f.harvested_at) setFormData({ flush_id: f.id, flush_number: f.flush_number || idx + 1 });
              }}
              emptyMessage="[ NO FLUSHES ]"
            />
          )}
        </Card>
      </div>

      {/* Movement log */}
      <div style={{ marginTop: 'var(--space-4)' }}>
        <Card title="MOVEMENT LOG">
          {movements.length === 0 ? (
            <div style={styles.emptyText}>[ NO MOVEMENTS RECORDED ]</div>
          ) : (
            <Table
              columns={['DATE', 'FROM', 'TO', 'MOVED BY']}
              data={movements.map((m) => [
                fmtDate(m.moved_at || m.created_at),
                m.from_location || m.from || '--',
                m.to_location || m.to || '--',
                m.moved_by || m.user || '--',
              ])}
              emptyMessage="[ NO MOVEMENTS ]"
            />
          )}
        </Card>
      </div>

      {/* Lifecycle timeline */}
      <div style={{ marginTop: 'var(--space-4)' }}>
        <Card title="LIFECYCLE TIMELINE">
          {timeline.length === 0 ? (
            <div style={styles.emptyText}>[ NO TIMELINE DATA ]</div>
          ) : (
            <div style={styles.timeline}>
              {timeline.map((event, idx) => (
                <div key={idx} style={styles.timelineItem}>
                  <div style={styles.timelineDot} />
                  <div style={styles.timelineContent}>
                    <div style={styles.timelineEvent}>
                      {event.event || event.action || event.type || 'EVENT'}
                    </div>
                    <div style={styles.timelineDate}>{fmtDate(event.timestamp || event.created_at)}</div>
                    {event.notes && <div style={styles.timelineNotes}>{event.notes}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────── */}

      {/* Colonization Check */}
      <Modal open={modal === 'colonCheck'} onClose={closeModal} title="LOG COLONIZATION CHECK">
        {formError && <AlertBanner variant="error">{formError}</AlertBanner>}
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <label style={styles.formLabel}>COLONIZATION PERCENTAGE</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={formData.colonization_pct || 0}
              onChange={(e) => setFormData({ ...formData, colonization_pct: Number(e.target.value) })}
              style={{ flex: 1, accentColor: 'var(--color-phosphor-primary)' }}
            />
            <span style={styles.sliderValue}>{formData.colonization_pct || 0}%</span>
          </div>
        </div>
        <Textarea
          label="Notes"
          value={formData.notes || ''}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="OBSERVATIONS..."
        />
        <div style={styles.modalActions}>
          <Button variant="secondary" onClick={closeModal}>CANCEL</Button>
          <Button
            loading={formLoading}
            onClick={() => handleAction(
              () => logColonizationCheck(jarId, formData),
              'Colonization check logged',
            )}
          >
            LOG CHECK
          </Button>
        </div>
      </Modal>

      {/* Contamination Report */}
      <Modal open={modal === 'contamination'} onClose={closeModal} title="REPORT CONTAMINATION">
        {formError && <AlertBanner variant="error">{formError}</AlertBanner>}
        <Input
          label="Contamination Type"
          value={formData.contamination_type || ''}
          onChange={(e) => setFormData({ ...formData, contamination_type: e.target.value })}
          placeholder="E.G. TRICHODERMA, COBWEB..."
        />
        <Textarea
          label="Notes"
          value={formData.notes || ''}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="DESCRIBE CONTAMINATION..."
        />
        <div style={styles.modalActions}>
          <Button variant="secondary" onClick={closeModal}>CANCEL</Button>
          <Button
            variant="danger"
            loading={formLoading}
            onClick={() => handleAction(
              () => reportContamination(jarId, formData),
              'Contamination reported',
            )}
          >
            REPORT
          </Button>
        </div>
      </Modal>

      {/* Move Jar */}
      <Modal open={modal === 'move'} onClose={closeModal} title="MOVE JAR">
        {formError && <AlertBanner variant="error">{formError}</AlertBanner>}
        <Select
          label="Destination"
          options={[
            { value: '', label: '-- SELECT LOCATION --' },
            ...locations.map((l) => ({ value: String(l.id), label: l.name || l.label || `LOC-${l.id}` })),
          ]}
          value={formData.location_id || ''}
          onChange={(e) => setFormData({ ...formData, location_id: e.target.value })}
        />
        <Textarea
          label="Notes"
          value={formData.notes || ''}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="OPTIONAL..."
        />
        <div style={styles.modalActions}>
          <Button variant="secondary" onClick={closeModal}>CANCEL</Button>
          <Button
            loading={formLoading}
            onClick={() => handleAction(
              () => moveJar(jarId, formData),
              'Jar moved successfully',
            )}
          >
            MOVE
          </Button>
        </div>
      </Modal>

      {/* Start Flush */}
      <Modal open={modal === 'flush'} onClose={closeModal} title="START NEW FLUSH">
        {formError && <AlertBanner variant="error">{formError}</AlertBanner>}
        <Input
          label="Flush Number"
          type="number"
          value={formData.flush_number || flushes.length + 1}
          onChange={(e) => setFormData({ ...formData, flush_number: Number(e.target.value) })}
        />
        <Textarea
          label="Notes"
          value={formData.notes || ''}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="OPTIONAL..."
        />
        <div style={styles.modalActions}>
          <Button variant="secondary" onClick={closeModal}>CANCEL</Button>
          <Button
            variant="amber"
            loading={formLoading}
            onClick={() => handleAction(
              () => startFlush(jarId, { flush_number: formData.flush_number || flushes.length + 1, notes: formData.notes }),
              'Flush started',
            )}
          >
            START FLUSH
          </Button>
        </div>
      </Modal>

      {/* Record Harvest */}
      <Modal open={modal === 'harvest'} onClose={closeModal} title="RECORD HARVEST">
        {formError && <AlertBanner variant="error">{formError}</AlertBanner>}
        <Input
          label="Pre-Weight (g)"
          type="number"
          step="0.1"
          value={formData.pre_weight || ''}
          onChange={(e) => setFormData({ ...formData, pre_weight: e.target.value })}
          placeholder="WEIGHT BEFORE HARVEST"
        />
        <Input
          label="Harvest Weight (g)"
          type="number"
          step="0.1"
          value={formData.yield_grams || ''}
          onChange={(e) => setFormData({ ...formData, yield_grams: e.target.value })}
          placeholder="FRESH WEIGHT HARVESTED"
        />
        <Input
          label="Post-Weight (g)"
          type="number"
          step="0.1"
          value={formData.post_weight || ''}
          onChange={(e) => setFormData({ ...formData, post_weight: e.target.value })}
          placeholder="WEIGHT AFTER HARVEST"
        />
        <Textarea
          label="Notes"
          value={formData.notes || ''}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
        {formData.pre_weight && formData.yield_grams && (
          <div style={styles.yieldCalc}>
            CALCULATED YIELD: {formData.yield_grams}g
            {formData.post_weight && ` | SUBSTRATE LOSS: ${(formData.pre_weight - formData.post_weight).toFixed(1)}g`}
          </div>
        )}
        <div style={styles.modalActions}>
          <Button variant="secondary" onClick={closeModal}>CANCEL</Button>
          <Button
            loading={formLoading}
            onClick={() => {
              const activeFlush = flushes.find((f) => !f.harvested_at);
              const flushId = formData.flush_id || (activeFlush && activeFlush.id);
              if (!flushId) {
                setFormError('No active flush to harvest');
                return;
              }
              handleAction(
                () => recordHarvest(flushId, {
                  pre_weight: Number(formData.pre_weight),
                  yield_grams: Number(formData.yield_grams),
                  post_weight: Number(formData.post_weight),
                  notes: formData.notes,
                }),
                'Harvest recorded',
              );
            }}
          >
            RECORD HARVEST
          </Button>
        </div>
      </Modal>

      {/* Retire Jar */}
      <Modal open={modal === 'retire'} onClose={closeModal} title="RETIRE JAR">
        {formError && <AlertBanner variant="error">{formError}</AlertBanner>}
        <AlertBanner variant="warning">
          This will mark the jar as retired. It can be re-registered later with a new cycle.
        </AlertBanner>
        <Input
          label="Reason"
          value={formData.reason || ''}
          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
          placeholder="REASON FOR RETIREMENT..."
        />
        <div style={styles.modalActions}>
          <Button variant="secondary" onClick={closeModal}>CANCEL</Button>
          <Button
            variant="danger"
            loading={formLoading}
            onClick={() => handleAction(
              () => retireJar(jarId, formData),
              'Jar retired',
            )}
          >
            RETIRE JAR
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

const styles = {
  headerRow: {
    marginBottom: 'var(--space-3)',
  },
  jarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 'var(--space-4)',
    marginBottom: 'var(--space-6)',
  },
  tagId: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-2xl)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    letterSpacing: 'var(--letter-spacing-wider)',
    marginBottom: 'var(--space-2)',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
  },
  metaText: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  actionButtons: {
    display: 'flex',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
    gap: 'var(--space-4)',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: 'var(--space-2) var(--space-4)',
  },
  infoLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-ghost)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  infoValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-phosphor-primary)',
  },
  emptyText: {
    textAlign: 'center',
    padding: 'var(--space-6)',
    color: 'var(--color-text-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-base)',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  timelineItem: {
    display: 'flex',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) 0',
    borderLeft: '2px solid var(--color-border)',
    marginLeft: '6px',
    paddingLeft: 'var(--space-4)',
    position: 'relative',
  },
  timelineDot: {
    position: 'absolute',
    left: '-5px',
    top: 'var(--space-3)',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: 'var(--color-phosphor-primary)',
    boxShadow: '0 0 6px var(--color-phosphor-primary)',
  },
  timelineContent: {
    flex: 1,
  },
  timelineEvent: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-phosphor-primary)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  timelineDate: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-ghost)',
  },
  timelineNotes: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    marginTop: 'var(--space-1)',
  },
  formLabel: {
    display: 'block',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wide)',
    marginBottom: 'var(--space-1)',
    fontFamily: 'var(--font-mono)',
  },
  sliderValue: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-xl)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    minWidth: '50px',
    textAlign: 'right',
  },
  modalActions: {
    display: 'flex',
    gap: 'var(--space-3)',
    justifyContent: 'flex-end',
    marginTop: 'var(--space-4)',
  },
  yieldCalc: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-bright)',
    padding: 'var(--space-2) var(--space-3)',
    background: 'rgba(0, 255, 65, 0.05)',
    border: '1px solid var(--color-phosphor-ghost)',
    borderRadius: 'var(--radius-sm)',
    marginBottom: 'var(--space-2)',
  },
};

export default JarDetail;
