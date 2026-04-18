import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Badge,
  Select,
  Table,
  StatCard,
  Loader,
  AlertBanner,
} from '../components/ui';
import DeviceSelector from '../components/DeviceSelector';
import { getClimateSessions, getClimateSummary } from '../utils/api';

// ── Helpers ─────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  if (seconds == null) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTimestamp(ts) {
  if (!ts) return '---';
  const d = new Date(ts);
  return d.toLocaleString('en-US', { hour12: false });
}

function triggerBadge(trigger) {
  if (!trigger) return null;
  const t = trigger.toLowerCase();
  if (t.includes('auto')) return <Badge variant="online">AUTO</Badge>;
  if (t.includes('manual')) return <Badge variant="info">MANUAL</Badge>;
  if (t.includes('safety')) return <Badge variant="error">SAFETY</Badge>;
  if (t.includes('schedule')) return <Badge variant="warning">SCHEDULE</Badge>;
  return <Badge>{trigger.toUpperCase()}</Badge>;
}

function deviceTypeBadge(type) {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t.includes('heater')) return <Badge variant="warning">HEATER</Badge>;
  if (t.includes('cool')) return <Badge variant="info">COOLING</Badge>;
  if (t.includes('dehumid')) return <Badge variant="online">DEHUMID</Badge>;
  return <Badge>{type.toUpperCase()}</Badge>;
}

// ── Component ───────────────────────────────────────────────────────────

function ClimateHistory() {
  const { deviceId } = useParams();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [deviceType, setDeviceType] = useState('');
  const [trigger, setTrigger] = useState('');
  const [excludeTest, setExcludeTest] = useState('true');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 25;

  // ── Fetch summary ─────────────────────────────────────────────────

  useEffect(() => {
    if (!deviceId) return;
    getClimateSummary(deviceId)
      .then((data) => setSummary(data))
      .catch(() => {});
  }, [deviceId]);

  // ── Fetch sessions ────────────────────────────────────────────────

  const fetchSessions = useCallback(() => {
    if (!deviceId) return;
    setLoading(true);
    const params = {
      page: String(page),
      page_size: String(pageSize),
    };
    if (deviceType) params.device_type = deviceType;
    if (trigger) params.trigger = trigger;
    if (excludeTest === 'true') params.exclude_test = 'true';

    getClimateSessions(deviceId, params)
      .then((data) => {
        const list = Array.isArray(data) ? data : data.sessions || [];
        setSessions(list);
        if (data.total_pages) setTotalPages(data.total_pages);
        else if (data.total) setTotalPages(Math.ceil(data.total / pageSize));
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [deviceId, page, deviceType, trigger, excludeTest]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [deviceType, trigger, excludeTest]);

  // ── No device selected ────────────────────────────────────────────

  if (!deviceId) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <DeviceSelector
          value={deviceId}
          onSelect={(id) => navigate(`/devices/${id}/climate-history`)}
        />
        <Card>
          <div style={styles.emptyState}>SELECT A DEVICE ABOVE TO VIEW CLIMATE HISTORY</div>
        </Card>
      </div>
    );
  }

  // ── Summary stats ─────────────────────────────────────────────────

  const s = summary || {};
  const today = s.today || {};
  const month = s.month || {};

  // ── Table columns ─────────────────────────────────────────────────

  const columns = [
    {
      header: 'TYPE',
      accessor: (row) => deviceTypeBadge(row.device_type || row.type),
    },
    {
      header: 'TRIGGER',
      accessor: (row) => triggerBadge(row.trigger),
    },
    {
      header: 'STARTED',
      accessor: (row) => formatTimestamp(row.started_at),
    },
    {
      header: 'DURATION',
      accessor: (row) => formatDuration(row.duration_s ?? row.duration),
    },
    {
      header: 'TEMP START',
      accessor: (row) => row.temp_start_c != null ? `${row.temp_start_c}°C` : '--',
    },
    {
      header: 'TEMP END',
      accessor: (row) => row.temp_end_c != null ? `${row.temp_end_c}°C` : '--',
    },
    {
      header: 'MODE',
      accessor: (row) => row.climate_mode ? (
        <Badge variant={row.climate_mode === 'day' ? 'online' : 'warning'}>
          {row.climate_mode.toUpperCase()}
        </Badge>
      ) : '--',
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <DeviceSelector
        value={deviceId}
        onSelect={(id) => navigate(`/devices/${id}/climate-history`)}
      />

      <h1 style={styles.pageTitle}>CLIMATE HISTORY</h1>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-phosphor-ghost)', marginBottom: 'var(--space-4)', lineHeight: 'var(--leading-relaxed)' }}>
        {'📊'} Review climate device runtime and activation history. Track heater, cooling, and dehumidifier usage to optimize energy consumption and growing conditions.
      </div>

      {error && <AlertBanner variant="error">{error}</AlertBanner>}

      {/* ═══ SUMMARY STATS ═══ */}
      <div style={styles.statGrid}>
        <StatCard label="HEATER TODAY" value={formatDuration(today.heater_runtime_s)} />
        <StatCard label="COOLING TODAY" value={formatDuration(today.cooling_runtime_s)} />
        <StatCard label="DEHUMID TODAY" value={formatDuration(today.dehumid_runtime_s)} />
        <StatCard label="HEATER THIS MONTH" value={formatDuration(month.heater_runtime_s)} />
        <StatCard label="COOLING THIS MONTH" value={formatDuration(month.cooling_runtime_s)} />
        <StatCard label="DEHUMID THIS MONTH" value={formatDuration(month.dehumid_runtime_s)} />
      </div>

      {/* ═══ SESSION TABLE ═══ */}
      <Card title="[ SESSION HISTORY ]">
        {/* Filters */}
        <div style={styles.filterRow}>
          <div>
            <label style={styles.filterLabel}>DEVICE TYPE</label>
            <select
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="">ALL</option>
              <option value="heater">HEATER</option>
              <option value="cooling">COOLING</option>
              <option value="dehumidifier">DEHUMIDIFIER</option>
            </select>
          </div>
          <div>
            <label style={styles.filterLabel}>TRIGGER</label>
            <select
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="">ALL</option>
              <option value="auto">AUTO</option>
              <option value="manual">MANUAL</option>
              <option value="safety">SAFETY</option>
              <option value="schedule">SCHEDULE</option>
            </select>
          </div>
          <div>
            <label style={styles.filterLabel}>EXCLUDE TEST</label>
            <select
              value={excludeTest}
              onChange={(e) => setExcludeTest(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="true">YES</option>
              <option value="false">NO</option>
            </select>
          </div>
        </div>

        {loading ? (
          <Loader type="spin" text="LOADING SESSIONS" />
        ) : sessions.length === 0 ? (
          <div style={styles.emptyState}>[ NO CLIMATE SESSIONS FOUND ]</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th key={col.header} style={styles.th}>{col.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((row, idx) => (
                    <tr key={row.id || idx} style={styles.tr}>
                      {columns.map((col) => (
                        <td key={col.header} style={styles.td}>
                          {col.accessor(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={styles.pagination}>
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                PREV
              </Button>
              <span style={styles.pageInfo}>
                PAGE {page} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                NEXT
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = {
  pageTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-2xl)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    letterSpacing: 'var(--letter-spacing-wider)',
    margin: '0 0 var(--space-4) 0',
  },
  emptyState: {
    textAlign: 'center',
    padding: 'var(--space-6)',
    color: 'var(--color-phosphor-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    textShadow: 'var(--glow-text)',
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-4)',
  },
  filterRow: {
    display: 'flex',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
    marginBottom: 'var(--space-4)',
    padding: 'var(--space-3)',
    background: 'var(--color-bg-base)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
  },
  filterLabel: {
    display: 'block',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    letterSpacing: 'var(--letter-spacing-wide)',
    marginBottom: 'var(--space-1)',
  },
  filterSelect: {
    padding: 'var(--space-1) var(--space-2)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-primary)',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    outline: 'none',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
  },
  th: {
    textAlign: 'left',
    padding: 'var(--space-2) var(--space-3)',
    color: 'var(--color-phosphor-ghost)',
    fontSize: 'var(--text-xs)',
    letterSpacing: 'var(--letter-spacing-wider)',
    borderBottom: '1px solid var(--color-border)',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid var(--color-border)',
  },
  td: {
    padding: 'var(--space-2) var(--space-3)',
    color: 'var(--color-phosphor-dim)',
    whiteSpace: 'nowrap',
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-3)',
    marginTop: 'var(--space-4)',
    padding: 'var(--space-3) 0',
  },
  pageInfo: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
};

export default ClimateHistory;
