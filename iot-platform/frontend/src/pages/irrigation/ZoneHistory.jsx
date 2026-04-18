import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Badge, AlertBanner, Loader, StatCard, Table, Toggle } from '../../components/ui';
import DeviceSelector from '../../components/DeviceSelector';
import {
  getZoneEvents,
  getZoneRuntimeSummary,
  getIrrigationZones,
} from '../../utils/api';

// ── Helpers ──────────────────────────────────────────────────────────────

function formatTimestamp(ts) {
  if (!ts) return '---';
  const d = new Date(ts);
  return d.toLocaleString('en-US', { hour12: false });
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '--';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatMinutes(totalMin) {
  if (!totalMin && totalMin !== 0) return '--';
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const PAGE_SIZE = 25;

// ── Component ────────────────────────────────────────────────────────────

function ZoneHistory() {
  const { deviceId } = useParams();
  const navigate = useNavigate();

  const [zones, setZones] = useState([]);
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [filterZone, setFilterZone] = useState('all');
  const [excludeTest, setExcludeTest] = useState(true);
  const [page, setPage] = useState(0);

  // ── Fetch summary & zones ──────────────────────────────────────────────

  const fetchInitial = useCallback(() => {
    if (!deviceId) return;
    setLoading(true);
    Promise.all([
      getIrrigationZones(deviceId).catch(() => []),
      getZoneRuntimeSummary(deviceId).catch(() => null),
    ])
      .then(([zData, sData]) => {
        const zList = Array.isArray(zData) ? zData : zData.zones || [];
        setZones(zList);
        setSummary(sData);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [deviceId]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  // ── Fetch events (paginated, filtered) ─────────────────────────────────

  const fetchEvents = useCallback(() => {
    if (!deviceId) return;
    setEventsLoading(true);

    const params = {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    };
    if (filterZone !== 'all') {
      params.zone_index = filterZone;
    }
    if (excludeTest) {
      params.exclude_test = 'true';
    }

    getZoneEvents(deviceId, params)
      .then((data) => {
        if (Array.isArray(data)) {
          setEvents(data);
          setTotalEvents(data.length >= PAGE_SIZE ? (page + 2) * PAGE_SIZE : page * PAGE_SIZE + data.length);
        } else {
          setEvents(data.events || []);
          setTotalEvents(data.total ?? (data.events || []).length);
        }
      })
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  }, [deviceId, page, filterZone, excludeTest]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [filterZone, excludeTest]);

  // ── Derived stats ──────────────────────────────────────────────────────

  const todayMin = summary?.today_minutes ?? summary?.today ?? 0;
  const weekMin = summary?.week_minutes ?? summary?.week ?? 0;
  const monthMin = summary?.month_minutes ?? summary?.month ?? 0;
  const activations = summary?.activation_count ?? summary?.activations ?? 0;

  // ── No device ──────────────────────────────────────────────────────────

  if (!deviceId) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <DeviceSelector value={deviceId} onSelect={(id) => navigate(`/devices/${id}/irrigation/history`)} />
        <Card>
          <div style={styles.emptyState}>SELECT A DEVICE ABOVE TO VIEW ZONE HISTORY</div>
        </Card>
      </div>
    );
  }

  if (loading) {
    return <Loader type="spin" text="LOADING HISTORY" />;
  }

  if (error) {
    return <AlertBanner variant="error">FAILED TO LOAD: {error}</AlertBanner>;
  }

  // ── Table data ─────────────────────────────────────────────────────────

  const tableColumns = ['TIME', 'ZONE', 'EVENT', 'TRIGGER', 'DURATION'];
  const tableData = events.map((evt) => [
    formatTimestamp(evt.timestamp || evt.created_at),
    <span style={{ color: 'var(--color-phosphor-primary)', fontWeight: 'bold' }}>
      Z{(evt.zone_index ?? 0) + 1}
    </span>,
    <span style={{ textTransform: 'uppercase' }}>{evt.event || evt.type || '--'}</span>,
    <span style={{ color: 'var(--color-phosphor-ghost)' }}>{evt.trigger || evt.source || '--'}</span>,
    <span style={{ color: 'var(--color-amber)' }}>{formatDuration(evt.duration_s)}</span>,
  ]);

  const totalPages = Math.max(1, Math.ceil(totalEvents / PAGE_SIZE));

  // Zone options for filter
  const zoneOptions = [{ value: 'all', label: 'All Zones' }];
  for (let i = 0; i < 16; i++) {
    const z = zones[i];
    zoneOptions.push({
      value: String(i),
      label: `Z${i + 1} ${z?.name || ''}`.trim(),
    });
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <DeviceSelector value={deviceId} onSelect={(id) => navigate(`/devices/${id}/irrigation/history`)} />

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-phosphor-ghost)', marginBottom: 'var(--space-4)', lineHeight: 'var(--leading-relaxed)' }}>
        {'📊'} Review zone activation history, runtime totals, and watering patterns. Filter by zone, trigger type, and date range to analyze irrigation efficiency.
      </div>

      {/* ═══ SUMMARY STATS ═══ */}
      <div style={styles.statsRow}>
        <StatCard value={formatMinutes(todayMin)} label="Today" />
        <StatCard value={formatMinutes(weekMin)} label="This Week" />
        <StatCard value={formatMinutes(monthMin)} label="This Month" />
        <StatCard value={activations} label="Activations" />
      </div>

      {/* ═══ FILTER BAR ═══ */}
      <div style={styles.filterBar}>
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>ZONE</label>
          <select
            value={filterZone}
            onChange={(e) => setFilterZone(e.target.value)}
            style={styles.filterSelect}
          >
            {zoneOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div style={styles.filterGroup}>
          <Toggle
            checked={excludeTest}
            onChange={setExcludeTest}
            label="EXCLUDE TEST"
          />
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { fetchInitial(); fetchEvents(); }}
          >
            REFRESH
          </Button>
        </div>
      </div>

      {/* ═══ EVENT TABLE ═══ */}
      <Card title="Event History">
        {eventsLoading ? (
          <Loader type="spin" text="LOADING EVENTS" />
        ) : (
          <Table
            columns={tableColumns}
            data={tableData}
            emptyMessage="[ NO EVENTS FOUND ]"
          />
        )}

        {/* Pagination */}
        {totalEvents > PAGE_SIZE && (
          <div style={styles.pagination}>
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              PREV
            </Button>
            <span style={styles.pageInfo}>
              PAGE {page + 1} / {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={events.length < PAGE_SIZE}
              onClick={() => setPage((p) => p + 1)}
            >
              NEXT
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

const styles = {
  emptyState: {
    textAlign: 'center',
    padding: 'var(--space-8)',
    color: 'var(--color-phosphor-ghost)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-lg)',
    letterSpacing: 'var(--letter-spacing-wider)',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 'var(--space-4)',
    marginBottom: 'var(--space-4)',
  },
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    flexWrap: 'wrap',
    padding: 'var(--space-3) var(--space-4)',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    marginBottom: 'var(--space-4)',
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  filterLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-dim)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  filterSelect: {
    padding: 'var(--space-1) var(--space-3)',
    background: 'var(--color-bg-input)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-phosphor-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    appearance: 'none',
    WebkitAppearance: 'none',
    cursor: 'pointer',
    outline: 'none',
    minWidth: '120px',
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-4)',
    paddingTop: 'var(--space-4)',
    borderTop: '1px solid var(--color-border)',
    marginTop: 'var(--space-3)',
  },
  pageInfo: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
};

export default ZoneHistory;
