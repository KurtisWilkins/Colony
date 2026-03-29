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

      {error && (
        <AlertBanner variant="error" dismissible>
          {error}
        </AlertBanner>
      )}

      {/* Status stat cards */}
      <div style={styles.statGrid}>
        <StatCard value={statusCounts.active || s.active_jars || 0} label="ACTIVE JARS" icon={'\u2B21'} />
        <StatCard value={statusCounts.colonizing || 0} label="COLONIZING" icon={'\u25CE'} />
        <StatCard value={statusCounts.fruiting || 0} label="FRUITING" icon={'\u2740'} />
        <StatCard value={statusCounts.harvesting || 0} label="HARVESTING" icon={'\u2702'} />
        <StatCard value={statusCounts.resting || 0} label="RESTING" icon={'\u23F8'} />
        <StatCard value={statusCounts.contaminated || 0} label="CONTAMINATED" icon={'\u26A0'} />
        <StatCard value={statusCounts.available || 0} label="AVAILABLE" icon={'\u2713'} />
      </div>

      {/* Yield this month */}
      <div style={styles.sectionHeader}>[ YIELD THIS MONTH ]</div>
      <div style={styles.yieldGrid}>
        <StatCard
          value={yieldStats.total_grams ? `${yieldStats.total_grams}g` : '0g'}
          label="TOTAL YIELD"
        />
        <StatCard
          value={yieldStats.avg_per_jar ? `${yieldStats.avg_per_jar}g` : '0g'}
          label="AVG PER JAR"
        />
        <StatCard
          value={yieldStats.biological_efficiency ? `${yieldStats.biological_efficiency}%` : '--%'}
          label="BIOLOGICAL EFFICIENCY"
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
