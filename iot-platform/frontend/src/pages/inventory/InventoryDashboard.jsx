import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge, StatCard, Table, Loader, AlertBanner } from '../../components/ui';
import { getInventorySummary, getBatches, getJars } from '../../utils/api';

// ── Helpers ──────────────────────────────────────────────────────────────

function formatRelative(ts) {
  if (!ts) return 'never';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

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

// ── Component ────────────────────────────────────────────────────────────

function InventoryDashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [batches, setBatches] = useState([]);
  const [recentJars, setRecentJars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(() => {
    Promise.all([
      getInventorySummary().catch(() => null),
      getBatches({ status: 'active', limit: 10 }).catch(() => []),
      getJars({ limit: 20, sort: '-updated_at' }).catch(() => []),
    ])
      .then(([sum, bat, jars]) => {
        setSummary(sum);
        setBatches(Array.isArray(bat) ? bat : bat?.batches || []);
        setRecentJars(Array.isArray(jars) ? jars : jars?.jars || []);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 30000);
    return () => clearInterval(id);
  }, [fetchAll]);

  if (loading) return <Loader text="LOADING INVENTORY" />;

  const s = summary || {};
  const statusCounts = s.status_counts || {};
  const yieldStats = s.yield_this_month || {};

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>MUSHROOM INVENTORY</h1>
        <span style={styles.subtitle}>DASHBOARD OVERVIEW</span>
      </div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-phosphor-ghost)', marginBottom: 'var(--space-4)', lineHeight: 'var(--leading-relaxed)' }}>
        Track your mushroom jar inventory from inoculation to harvest. Register jars with NFC tags,
        monitor colonization progress, and analyze yield data across batches and strains.
      </div>

      {error && (
        <AlertBanner variant="error" dismissible>
          {error}
        </AlertBanner>
      )}

      {/* Status stat cards */}
      <div style={styles.statGrid}>
        <StatCard value={statusCounts.active || s.active_jars || 0} label={'\uD83E\uDED9 ACTIVE JARS'} icon={'\u2B21'} />
        <StatCard value={statusCounts.colonizing || 0} label={'\uD83C\uDF31 COLONIZING'} icon={'\u25CE'} />
        <StatCard value={statusCounts.fruiting || 0} label={'\uD83C\uDF44 FRUITING'} icon={'\u2740'} />
        <StatCard value={statusCounts.harvesting || 0} label={'\u2702\uFE0F HARVESTING'} icon={'\u2702'} />
        <StatCard value={statusCounts.resting || 0} label={'\uD83D\uDCA4 RESTING'} icon={'\u23F8'} />
        <StatCard value={statusCounts.contaminated || 0} label={'\u26A0\uFE0F CONTAMINATED'} icon={'\u26A0'} />
        <StatCard value={statusCounts.available || 0} label={'\u2705 AVAILABLE'} icon={'\u2713'} />
      </div>

      {/* Yield this month */}
      <div style={styles.sectionHeader}>[ YIELD THIS MONTH ]</div>
      <div style={styles.yieldGrid}>
        <StatCard
          value={yieldStats.total_grams ? `${yieldStats.total_grams}g` : '0g'}
          label={'\u2696\uFE0F TOTAL YIELD'}
        />
        <StatCard
          value={yieldStats.avg_per_jar ? `${yieldStats.avg_per_jar}g` : '0g'}
          label="AVG PER JAR"
        />
        <StatCard
          value={yieldStats.biological_efficiency ? `${yieldStats.biological_efficiency}%` : '--%'}
          label={'\uD83D\uDCCA BIOLOGICAL EFFICIENCY'}
        />
      </div>

      {/* Active batches */}
      <div style={{ marginTop: 'var(--space-6)' }}>
        <Card
          title="ACTIVE BATCHES"
          headerAction={
            <span
              style={styles.linkAction}
              onClick={() => navigate('/inventory/batches')}
            >
              VIEW ALL &gt;
            </span>
          }
        >
          <Table
            columns={['BATCH', 'RECIPE', 'STRAIN', 'JARS', 'STATUS', 'STARTED']}
            data={batches.map((b) => [
              b.batch_code || b.id,
              b.recipe_name || b.recipe || '--',
              b.strain_name || b.strain || '--',
              `${b.jar_count || 0}/${b.planned_jar_count || '?'}`,
              statusBadge(b.status || 'active'),
              formatRelative(b.created_at),
            ])}
            onRowClick={(idx) => {
              const b = batches[idx];
              if (b) navigate(`/inventory/batches?selected=${b.id}`);
            }}
            emptyMessage="[ NO ACTIVE BATCHES ]"
          />
        </Card>
      </div>

      {/* Recent activity */}
      <div style={{ marginTop: 'var(--space-6)' }}>
        <Card title="RECENT ACTIVITY">
          <Table
            columns={['TAG', 'STATUS', 'LOCATION', 'ACTION', 'WHEN']}
            data={recentJars.map((j) => [
              j.tag_id || j.nfc_tag || '--',
              statusBadge(j.status || 'unknown'),
              j.location_name || j.location || '--',
              j.last_action || '--',
              formatRelative(j.updated_at),
            ])}
            onRowClick={(idx) => {
              const j = recentJars[idx];
              if (j) navigate(`/inventory/jars/${j.id}`);
            }}
            emptyMessage="[ NO RECENT ACTIVITY ]"
          />
        </Card>
      </div>

      {(s.total_active_jars || statusCounts.active || s.active_jars || 0) === 0 && (
        <Card title="[ GETTING STARTED ]" style={{ marginTop: 'var(--space-4)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--color-phosphor-dim)', lineHeight: 'var(--leading-relaxed)' }}>
            <p style={{ marginBottom: 'var(--space-3)' }}>Welcome to the Mushroom Inventory System. Here's how to get started:</p>
            <ol style={{ paddingLeft: 'var(--space-4)', margin: 0 }}>
              <li style={{ marginBottom: 'var(--space-2)' }}><strong>Register Jars</strong> — Go to JARS and click "+ REGISTER JAR" to add your physical jars with NFC tag IDs</li>
              <li style={{ marginBottom: 'var(--space-2)' }}><strong>Create a Recipe</strong> — Go to REFERENCE to define your substrate recipe (grain type, supplements, hydration)</li>
              <li style={{ marginBottom: 'var(--space-2)' }}><strong>Add a Strain</strong> — Register your mushroom strain under REFERENCE (species, vendor, lot number)</li>
              <li style={{ marginBottom: 'var(--space-2)' }}><strong>Create a Batch</strong> — Go to BATCHES to start a new batch linking your recipe, strain, and jars together</li>
              <li style={{ marginBottom: 'var(--space-2)' }}><strong>Scan & Track</strong> — Tap NFC tags on your phone to log colonization checks, record harvests, and track movements</li>
            </ol>
            <p style={{ marginTop: 'var(--space-3)', color: 'var(--color-phosphor-ghost)' }}>
              Tip: Use the bulk tag writer tool (tools/bulk-tag-writer/) to register hundreds of NFC tags quickly with an ACR122U USB reader.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

const styles = {
  header: {
    marginBottom: 'var(--space-6)',
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
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 'var(--space-4)',
    marginBottom: 'var(--space-4)',
  },
  yieldGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 'var(--space-4)',
  },
  sectionHeader: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-ghost)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wider)',
    padding: 'var(--space-4) 0 var(--space-2)',
    borderTop: '1px solid var(--color-border)',
    marginTop: 'var(--space-4)',
  },
  linkAction: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
};

export default InventoryDashboard;
