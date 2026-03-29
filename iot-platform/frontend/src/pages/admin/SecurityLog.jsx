import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, StatCard, Select, Input, Table, AlertBanner, Loader } from '../../components/ui';
import { getSecurityEvents, getUsers } from '../../utils/api';

const EVENT_TYPES = [
  { value: '', label: 'ALL EVENTS' },
  { value: 'login', label: 'LOGIN' },
  { value: 'login_failed', label: 'FAILED LOGIN' },
  { value: 'logout', label: 'LOGOUT' },
  { value: 'password_change', label: 'PASSWORD CHANGE' },
  { value: 'user_created', label: 'USER CREATED' },
  { value: 'user_updated', label: 'USER UPDATED' },
  { value: 'device_assigned', label: 'DEVICE ASSIGNED' },
  { value: 'credential_rotate', label: 'CREDENTIAL ROTATE' },
  { value: 'credential_revoke', label: 'CREDENTIAL REVOKE' },
];

const EVENT_SEVERITY = {
  login: 'success',
  logout: 'success',
  password_change: 'warning',
  login_failed: 'error',
  user_created: 'success',
  user_updated: 'warning',
  device_assigned: 'success',
  credential_rotate: 'warning',
  credential_revoke: 'error',
};

const SEVERITY_COLORS = {
  success: 'var(--color-phosphor-primary)',
  warning: 'var(--color-amber)',
  error: 'var(--color-red-alert)',
};

function SecurityLog() {
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ loginsToday: 0, failedAttempts: 0, activeSessions: 0 });

  // Filters
  const [eventType, setEventType] = useState('');
  const [userId, setUserId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const intervalRef = useRef(null);

  const fetchEvents = useCallback(async () => {
    try {
      const params = {};
      if (eventType) params.event_type = eventType;
      if (userId) params.user_id = userId;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;

      const res = await getSecurityEvents(params);
      const eventList = res.events || res || [];
      setEvents(eventList);

      // Compute stats
      const today = new Date().toISOString().slice(0, 10);
      const loginsToday = eventList.filter(
        (e) => (e.event_type === 'login') && (e.timestamp || e.created_at || '').startsWith(today)
      ).length;
      const failedAttempts = eventList.filter(
        (e) => e.event_type === 'login_failed'
      ).length;
      const activeSessions = res.active_sessions ?? eventList.filter(
        (e) => e.event_type === 'login'
      ).length - eventList.filter(
        (e) => e.event_type === 'logout'
      ).length;

      setStats({
        loginsToday,
        failedAttempts,
        activeSessions: Math.max(0, activeSessions),
      });
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [eventType, userId, dateFrom, dateTo]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const res = await getUsers();
        setUsers(res.users || res || []);
      } catch { /* ignore */ }
    };
    loadUsers();
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchEvents();
  }, [fetchEvents]);

  // Auto-refresh every 30s
  useEffect(() => {
    intervalRef.current = setInterval(fetchEvents, 30000);
    return () => clearInterval(intervalRef.current);
  }, [fetchEvents]);

  const formatTimestamp = (ts) => {
    if (!ts) return '---';
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      hour12: false, month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).toUpperCase();
  };

  const userOptions = [
    { value: '', label: 'ALL USERS' },
    ...users.map((u) => ({ value: String(u.id), label: u.username.toUpperCase() })),
  ];

  const columns = ['TIMESTAMP', 'EVENT TYPE', 'USER', 'IP', 'DETAILS'];

  const tableData = events.map((ev) => {
    const severity = EVENT_SEVERITY[ev.event_type] || 'success';
    const color = SEVERITY_COLORS[severity];
    return [
      <span style={{ color: 'var(--color-phosphor-ghost)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>
        {formatTimestamp(ev.timestamp || ev.created_at)}
      </span>,
      <span style={{ color, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 'bold' }}>
        {(ev.event_type || 'UNKNOWN').toUpperCase().replace(/_/g, ' ')}
      </span>,
      <span style={{ color: 'var(--color-phosphor-dim)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
        {ev.username || ev.user || '---'}
      </span>,
      <span style={{ color: 'var(--color-phosphor-ghost)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
        {ev.ip_address || ev.ip || '---'}
      </span>,
      <span style={{ color: 'var(--color-phosphor-ghost)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', whiteSpace: 'nowrap' }}>
        {ev.details || ev.message || '---'}
      </span>,
    ];
  });

  return (
    <div style={{ maxWidth: '1200px' }}>
      <h1 style={styles.pageTitle}>SECURITY LOG</h1>
      <div style={styles.pageSub}>AUTHENTICATION & ACCESS EVENTS // AUTO-REFRESH 30S</div>

      {error && <AlertBanner variant="error">{error}</AlertBanner>}

      {/* Stats */}
      <div style={styles.statsGrid}>
        <StatCard value={stats.loginsToday} label="LOGINS TODAY" icon="\u2192" />
        <StatCard value={stats.failedAttempts} label="FAILED ATTEMPTS" icon="\u2717" />
        <StatCard value={stats.activeSessions} label="ACTIVE SESSIONS" icon="\u2261" />
      </div>

      {/* Filters */}
      <Card style={{ marginBottom: 'var(--space-4)' }}>
        <div style={styles.filterBar}>
          <div style={{ flex: '1 1 180px', minWidth: '150px' }}>
            <Select
              id="event-type-filter"
              label="Event Type"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              options={EVENT_TYPES}
            />
          </div>
          <div style={{ flex: '1 1 180px', minWidth: '150px' }}>
            <Select
              id="user-filter"
              label="User"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              options={userOptions}
            />
          </div>
          <div style={{ flex: '1 1 160px', minWidth: '140px' }}>
            <Input
              id="date-from"
              label="From"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div style={{ flex: '1 1 160px', minWidth: '140px' }}>
            <Input
              id="date-to"
              label="To"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Event Log */}
      <Card>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
            <Loader type="spin" text="LOADING EVENTS" />
          </div>
        ) : (
          <Table columns={columns} data={tableData} emptyMessage="[ NO SECURITY EVENTS ]" />
        )}
      </Card>
    </div>
  );
}

const styles = {
  pageTitle: {
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)',
    color: 'var(--color-phosphor-primary)', textShadow: 'var(--glow-text)',
    letterSpacing: 'var(--letter-spacing-wider)', margin: 0,
  },
  pageSub: {
    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-ghost)', letterSpacing: 'var(--letter-spacing-wide)',
    marginTop: 'var(--space-1)', marginBottom: 'var(--space-6)',
  },
  statsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 'var(--space-4)', marginBottom: 'var(--space-6)',
  },
  filterBar: {
    display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap',
    padding: 'var(--space-4)',
  },
};

export default SecurityLog;
