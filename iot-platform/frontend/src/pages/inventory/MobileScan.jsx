import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Badge, Button, AlertBanner, Loader, Input, Select } from '../../components/ui';
import {
  getJarByTag, scanTag, logColonizationCheck, moveJar,
  startFlush, recordHarvest, getInventoryLocations,
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

// ── Mobile styles (touch-optimized) ──────────────────────────────────────

const mobile = {
  container: {
    maxWidth: '480px',
    margin: '0 auto',
    padding: 'var(--space-3)',
  },
  bigButton: {
    width: '100%',
    minHeight: '60px',
    fontSize: '18px',
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wider)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    border: '1px solid',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'all var(--transition-base)',
    marginBottom: 'var(--space-3)',
    borderRadius: 'var(--radius-sm)',
  },
  tagDisplay: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-2xl)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    textAlign: 'center',
    padding: 'var(--space-4)',
    letterSpacing: 'var(--letter-spacing-wider)',
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-4)',
    flexWrap: 'wrap',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: 'var(--space-2) 0',
    borderBottom: '1px solid var(--color-border)',
    fontFamily: 'var(--font-mono)',
    fontSize: '16px',
  },
  infoLabel: {
    color: 'var(--color-phosphor-ghost)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wide)',
    fontSize: '14px',
  },
  infoValue: {
    color: 'var(--color-phosphor-primary)',
  },
  flowTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-xl)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    textAlign: 'center',
    marginBottom: 'var(--space-4)',
    letterSpacing: 'var(--letter-spacing-wider)',
  },
  slider: {
    width: '100%',
    height: '40px',
    accentColor: 'var(--color-phosphor-primary)',
    marginBottom: 'var(--space-2)',
  },
  sliderValue: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-3xl)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    textAlign: 'center',
    lineHeight: 1,
    marginBottom: 'var(--space-4)',
  },
  scanPrompt: {
    textAlign: 'center',
    padding: 'var(--space-12) var(--space-4)',
  },
  scanIcon: {
    fontSize: '64px',
    color: 'var(--color-phosphor-dim)',
    marginBottom: 'var(--space-4)',
    display: 'block',
  },
  scanText: {
    fontFamily: 'var(--font-mono)',
    fontSize: '18px',
    color: 'var(--color-phosphor-dim)',
    letterSpacing: 'var(--letter-spacing-wider)',
    textTransform: 'uppercase',
  },
};

// ── Sub-flows ────────────────────────────────────────────────────────────

function ColonizationFlow({ jar, onComplete, onCancel }) {
  const [pct, setPct] = useState(jar.colonization_pct || 0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submit = () => {
    setLoading(true);
    logColonizationCheck(jar.id, { colonization_pct: pct, notes })
      .then(() => onComplete('Colonization check logged'))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  return (
    <div>
      <div style={mobile.flowTitle}>COLONIZATION CHECK</div>
      {error && <AlertBanner variant="error">{error}</AlertBanner>}
      <div style={mobile.sliderValue}>{pct}%</div>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={pct}
        onChange={(e) => setPct(Number(e.target.value))}
        style={mobile.slider}
      />
      <Input
        label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="OBSERVATIONS..."
        style={{ fontSize: '16px', minHeight: '44px' }}
      />
      <button
        onClick={submit}
        disabled={loading}
        style={{ ...mobile.bigButton, borderColor: 'var(--color-phosphor-primary)', color: 'var(--color-phosphor-primary)' }}
      >
        {loading ? 'SAVING...' : 'SUBMIT CHECK'}
      </button>
      <button
        onClick={onCancel}
        style={{ ...mobile.bigButton, borderColor: 'var(--color-phosphor-ghost)', color: 'var(--color-phosphor-ghost)' }}
      >
        CANCEL
      </button>
    </div>
  );
}

function HarvestFlow({ jar, onComplete, onCancel }) {
  const [step, setStep] = useState(1); // 1=pre-weight, 2=confirm, 3=post-weight
  const [preWeight, setPreWeight] = useState('');
  const [yieldGrams, setYieldGrams] = useState('');
  const [postWeight, setPostWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submit = () => {
    const activeFlush = (jar.flushes || []).find((f) => !f.harvested_at);
    if (!activeFlush) {
      setError('No active flush found. Start a flush first.');
      return;
    }
    setLoading(true);
    recordHarvest(activeFlush.id, {
      pre_weight: Number(preWeight) || undefined,
      yield_grams: Number(yieldGrams),
      post_weight: Number(postWeight) || undefined,
      notes,
    })
      .then(() => onComplete(`Harvest recorded: ${yieldGrams}g`))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  return (
    <div>
      <div style={mobile.flowTitle}>HARVEST FLOW</div>
      {error && <AlertBanner variant="error">{error}</AlertBanner>}

      {step === 1 && (
        <>
          <Input
            label="Pre-Harvest Weight (g)"
            type="number"
            step="0.1"
            value={preWeight}
            onChange={(e) => setPreWeight(e.target.value)}
            placeholder="WEIGH JAR BEFORE PICKING..."
            style={{ fontSize: '18px', minHeight: '50px' }}
          />
          <button
            onClick={() => setStep(2)}
            style={{ ...mobile.bigButton, borderColor: 'var(--color-phosphor-primary)', color: 'var(--color-phosphor-primary)' }}
          >
            NEXT: HARVEST
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <AlertBanner variant="info">
            Harvest your mushrooms now, then enter the fresh weight below.
          </AlertBanner>
          <Input
            label="Harvest Weight (g)"
            type="number"
            step="0.1"
            value={yieldGrams}
            onChange={(e) => setYieldGrams(e.target.value)}
            placeholder="FRESH WEIGHT OF HARVEST..."
            style={{ fontSize: '18px', minHeight: '50px' }}
          />
          <button
            onClick={() => setStep(3)}
            disabled={!yieldGrams}
            style={{
              ...mobile.bigButton,
              borderColor: yieldGrams ? 'var(--color-phosphor-primary)' : 'var(--color-phosphor-ghost)',
              color: yieldGrams ? 'var(--color-phosphor-primary)' : 'var(--color-phosphor-ghost)',
            }}
          >
            NEXT: POST-WEIGHT
          </button>
        </>
      )}

      {step === 3 && (
        <>
          <Input
            label="Post-Harvest Weight (g)"
            type="number"
            step="0.1"
            value={postWeight}
            onChange={(e) => setPostWeight(e.target.value)}
            placeholder="WEIGH JAR AFTER PICKING..."
            style={{ fontSize: '18px', minHeight: '50px' }}
          />
          <Input
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="OPTIONAL NOTES..."
            style={{ fontSize: '16px', minHeight: '44px' }}
          />
          {yieldGrams && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '16px',
              color: 'var(--color-phosphor-bright)',
              textAlign: 'center',
              padding: 'var(--space-3)',
              background: 'rgba(0,255,65,0.05)',
              border: '1px solid var(--color-phosphor-ghost)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 'var(--space-3)',
            }}>
              YIELD: {yieldGrams}g
              {preWeight && postWeight && ` | SUBSTRATE LOSS: ${(Number(preWeight) - Number(postWeight)).toFixed(1)}g`}
            </div>
          )}
          <button
            onClick={submit}
            disabled={loading || !yieldGrams}
            style={{
              ...mobile.bigButton,
              borderColor: 'var(--color-amber)',
              color: 'var(--color-amber)',
              fontSize: '20px',
              minHeight: '70px',
            }}
          >
            {loading ? 'RECORDING...' : 'CONFIRM HARVEST'}
          </button>
        </>
      )}

      <button
        onClick={step > 1 ? () => setStep(step - 1) : onCancel}
        style={{ ...mobile.bigButton, borderColor: 'var(--color-phosphor-ghost)', color: 'var(--color-phosphor-ghost)' }}
      >
        {step > 1 ? 'BACK' : 'CANCEL'}
      </button>
    </div>
  );
}

function MoveFlow({ jar, locations, onComplete, onCancel }) {
  const [locationId, setLocationId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submit = () => {
    if (!locationId) return;
    setLoading(true);
    moveJar(jar.id, { location_id: locationId })
      .then(() => {
        const loc = locations.find((l) => String(l.id) === locationId);
        onComplete(`Moved to ${loc?.name || 'new location'}`);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  return (
    <div>
      <div style={mobile.flowTitle}>MOVE JAR</div>
      {error && <AlertBanner variant="error">{error}</AlertBanner>}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ ...mobile.infoLabel, marginBottom: 'var(--space-2)' }}>
          CURRENT: {jar.location_name || jar.location || 'UNKNOWN'}
        </div>
        <Select
          label="New Location"
          options={[
            { value: '', label: '-- SELECT DESTINATION --' },
            ...locations.map((l) => ({ value: String(l.id), label: l.name || l.label || `LOC-${l.id}` })),
          ]}
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          style={{ fontSize: '16px', minHeight: '50px' }}
        />
      </div>
      <button
        onClick={submit}
        disabled={loading || !locationId}
        style={{
          ...mobile.bigButton,
          borderColor: locationId ? 'var(--color-phosphor-primary)' : 'var(--color-phosphor-ghost)',
          color: locationId ? 'var(--color-phosphor-primary)' : 'var(--color-phosphor-ghost)',
        }}
      >
        {loading ? 'MOVING...' : 'CONFIRM MOVE'}
      </button>
      <button
        onClick={onCancel}
        style={{ ...mobile.bigButton, borderColor: 'var(--color-phosphor-ghost)', color: 'var(--color-phosphor-ghost)' }}
      >
        CANCEL
      </button>
    </div>
  );
}

// ── Main MobileScan component ────────────────────────────────────────────

function MobileScan() {
  const { tagId: urlTagId } = useParams();
  const navigate = useNavigate();

  const [manualTag, setManualTag] = useState('');
  const [jar, setJar] = useState(null);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [activeFlow, setActiveFlow] = useState(null); // 'colonCheck' | 'harvest' | 'move'

  // Load locations
  useEffect(() => {
    getInventoryLocations()
      .then((d) => setLocations(Array.isArray(d) ? d : d?.locations || []))
      .catch(() => {});
  }, []);

  const loadJar = useCallback((tagId) => {
    if (!tagId) return;
    setLoading(true);
    setError(null);
    setActiveFlow(null);
    setSuccessMsg(null);
    getJarByTag(tagId)
      .then((data) => {
        setJar(data);
      })
      .catch((err) => {
        setJar(null);
        setError(err.status === 404 ? `No jar found for tag: ${tagId}` : err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  // Auto-load from URL param
  useEffect(() => {
    if (urlTagId) loadJar(urlTagId);
  }, [urlTagId, loadJar]);

  const handleManualLookup = () => {
    if (!manualTag.trim()) return;
    navigate(`/scan/${encodeURIComponent(manualTag.trim())}`);
  };

  const handleFlowComplete = (msg) => {
    setActiveFlow(null);
    setSuccessMsg(msg);
    // Reload jar data
    if (jar) loadJar(jar.tag_id || jar.nfc_tag || urlTagId);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  // Context-sensitive quick actions based on jar status
  const getQuickActions = (jarData) => {
    if (!jarData) return [];
    const actions = [];
    const status = jarData.status;

    if (status === 'colonizing') {
      actions.push({ label: 'LOG COLONIZATION CHECK', flow: 'colonCheck', color: 'var(--color-phosphor-primary)' });
      actions.push({ label: 'START FLUSH', flow: 'flush', color: 'var(--color-amber)' });
    }
    if (status === 'fruiting') {
      actions.push({ label: 'RECORD HARVEST', flow: 'harvest', color: 'var(--color-amber)' });
    }
    if (status === 'harvesting') {
      actions.push({ label: 'RECORD HARVEST', flow: 'harvest', color: 'var(--color-amber)' });
    }
    if (status !== 'retired' && status !== 'contaminated') {
      actions.push({ label: 'MOVE JAR', flow: 'move', color: 'var(--color-cyan-accent)' });
    }
    actions.push({
      label: 'VIEW FULL DETAILS',
      flow: 'detail',
      color: 'var(--color-phosphor-dim)',
    });

    return actions;
  };

  return (
    <div style={mobile.container}>
      {/* Success message */}
      {successMsg && <AlertBanner variant="success" dismissible>{successMsg}</AlertBanner>}

      {/* Error */}
      {error && <AlertBanner variant="error" dismissible>{error}</AlertBanner>}

      {/* Loading */}
      {loading && <Loader text="SCANNING" />}

      {/* Active flow */}
      {activeFlow === 'colonCheck' && jar && (
        <ColonizationFlow
          jar={jar}
          onComplete={handleFlowComplete}
          onCancel={() => setActiveFlow(null)}
        />
      )}

      {activeFlow === 'harvest' && jar && (
        <HarvestFlow
          jar={jar}
          onComplete={handleFlowComplete}
          onCancel={() => setActiveFlow(null)}
        />
      )}

      {activeFlow === 'move' && jar && (
        <MoveFlow
          jar={jar}
          locations={locations}
          onComplete={handleFlowComplete}
          onCancel={() => setActiveFlow(null)}
        />
      )}

      {activeFlow === 'flush' && jar && (
        <div>
          <div style={mobile.flowTitle}>START FLUSH</div>
          <AlertBanner variant="info">
            Starting flush #{(jar.flushes || []).length + 1} for this jar.
          </AlertBanner>
          <button
            onClick={() => {
              setLoading(true);
              startFlush(jar.id, { flush_number: (jar.flushes || []).length + 1 })
                .then(() => handleFlowComplete('Flush started'))
                .catch((err) => setError(err.message))
                .finally(() => setLoading(false));
            }}
            style={{
              ...mobile.bigButton,
              borderColor: 'var(--color-amber)',
              color: 'var(--color-amber)',
              fontSize: '20px',
              minHeight: '70px',
            }}
          >
            CONFIRM START FLUSH
          </button>
          <button
            onClick={() => setActiveFlow(null)}
            style={{ ...mobile.bigButton, borderColor: 'var(--color-phosphor-ghost)', color: 'var(--color-phosphor-ghost)' }}
          >
            CANCEL
          </button>
        </div>
      )}

      {/* Jar status card + quick actions (when no active flow) */}
      {!activeFlow && !loading && jar && (
        <div>
          <div style={mobile.tagDisplay}>{jar.tag_id || jar.nfc_tag || `JAR-${jar.id}`}</div>
          <div style={mobile.statusRow}>
            {statusBadge(jar.status)}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--color-phosphor-dim)' }}>
              CYCLE #{jar.cycle_number || jar.cycle || 1}
            </span>
          </div>

          <Card style={{ marginBottom: 'var(--space-4)' }}>
            <div style={mobile.infoRow}>
              <span style={mobile.infoLabel}>STRAIN</span>
              <span style={mobile.infoValue}>{jar.strain_name || jar.strain || '--'}</span>
            </div>
            <div style={mobile.infoRow}>
              <span style={mobile.infoLabel}>LOCATION</span>
              <span style={mobile.infoValue}>{jar.location_name || jar.location || '--'}</span>
            </div>
            <div style={mobile.infoRow}>
              <span style={mobile.infoLabel}>BATCH</span>
              <span style={mobile.infoValue}>{jar.batch_code || jar.batch || '--'}</span>
            </div>
            <div style={mobile.infoRow}>
              <span style={mobile.infoLabel}>COLONIZATION</span>
              <span style={mobile.infoValue}>{jar.colonization_pct != null ? `${jar.colonization_pct}%` : '--'}</span>
            </div>
            <div style={mobile.infoRow}>
              <span style={mobile.infoLabel}>FLUSHES</span>
              <span style={mobile.infoValue}>{(jar.flushes || []).length}</span>
            </div>
            <div style={{ ...mobile.infoRow, borderBottom: 'none' }}>
              <span style={mobile.infoLabel}>TOTAL YIELD</span>
              <span style={mobile.infoValue}>{jar.total_yield_grams ? `${jar.total_yield_grams}g` : '--'}</span>
            </div>
          </Card>

          {/* Quick actions */}
          <div>
            {getQuickActions(jar).map((action) => (
              <button
                key={action.flow}
                onClick={() => {
                  if (action.flow === 'detail') {
                    navigate(`/inventory/jars/${jar.id}`);
                  } else {
                    setActiveFlow(action.flow);
                  }
                }}
                style={{
                  ...mobile.bigButton,
                  borderColor: action.color,
                  color: action.color,
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scan prompt (when no jar loaded and no active flow) */}
      {!activeFlow && !loading && !jar && (
        <div>
          <Card title="[ NFC JAR SCANNING ]" style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)', color: 'var(--color-phosphor-dim)', lineHeight: 'var(--leading-relaxed)' }}>
              <p style={{ marginBottom: 'var(--space-3)', fontSize: '18px' }}>{'\uD83D\uDCF1'} TAP YOUR JAR'S NFC TAG ON YOUR PHONE</p>
              <p style={{ marginBottom: 'var(--space-2)', color: 'var(--color-phosphor-ghost)' }}>
                Each jar has an NFC sticker on the bottom. Hold your phone near it to instantly view the jar's status and log actions.
              </p>
              <p style={{ color: 'var(--color-phosphor-ghost)', fontSize: 'var(--text-xs)' }}>
                Or enter a tag ID manually below if NFC is not available.
              </p>
            </div>
          </Card>

          <div style={mobile.scanPrompt}>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Input
              value={manualTag}
              onChange={(e) => setManualTag(e.target.value)}
              placeholder="TAG ID..."
              onKeyDown={(e) => { if (e.key === 'Enter') handleManualLookup(); }}
              style={{ fontSize: '18px', minHeight: '50px', marginBottom: 0 }}
            />
            <button
              onClick={handleManualLookup}
              disabled={!manualTag.trim()}
              style={{
                ...mobile.bigButton,
                width: 'auto',
                minWidth: '80px',
                marginBottom: 0,
                borderColor: manualTag.trim() ? 'var(--color-phosphor-primary)' : 'var(--color-phosphor-ghost)',
                color: manualTag.trim() ? 'var(--color-phosphor-primary)' : 'var(--color-phosphor-ghost)',
              }}
            >
              GO
            </button>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}

export default MobileScan;
