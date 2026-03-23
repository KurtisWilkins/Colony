import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { Card, Button, Badge, StatCard, Table, AlertBanner, Loader, Input } from '../components/ui';
import DeviceSelector from '../components/DeviceSelector';
import GaugeBar from '../components/GaugeBar';
import useWaterData from '../hooks/useWaterData';
import useDeviceState from '../hooks/useDeviceState';
import {
  getWaterSummaryAll,
  getWaterSessions,
  getWaterSummary,
  getDevices,
  sendFillStop,
} from '../utils/api';
import { terminalChartTheme, terminalBarDataset, terminalLineDataset } from '../styles/chartTheme';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

// Device color palette for multi-device charts
const DEVICE_COLORS = [
  { bg: 'rgba(0, 255, 65, 0.7)', border: '#00ff41' },
  { bg: 'rgba(0, 255, 247, 0.7)', border: '#00fff7' },
  { bg: 'rgba(255, 176, 0, 0.7)', border: '#ffb000' },
  { bg: 'rgba(57, 255, 20, 0.7)', border: '#39ff14' },
  { bg: 'rgba(0, 170, 42, 0.7)', border: '#00aa2a' },
  { bg: 'rgba(128, 255, 170, 0.7)', border: '#80ffaa' },
];

const PAGE_SIZE = 25;

function formatDuration(seconds) {
  if (seconds == null || isNaN(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function triggerBadgeVariant(trigger) {
  if (!trigger) return 'info';
  const t = trigger.toLowerCase();
  if (t.includes('manual')) return 'warning';
  if (t.includes('auto') || t.includes('schedule')) return 'online';
  if (t.includes('emergency') || t.includes('alert')) return 'offline';
  return 'info';
}

function WaterUsage() {
  const { deviceId } = useParams();
  const navigate = useNavigate();

  // View mode
  const [allDevicesMode, setAllDevicesMode] = useState(!deviceId);
  const effectiveDeviceId = allDevicesMode ? null : deviceId;

  // Single device hooks
  const { summary, sessions, loading, error, activeSession, refresh } = useWaterData(effectiveDeviceId);
  const { state: deviceState } = useDeviceState(effectiveDeviceId);

  // All-devices data
  const [allSummary, setAllSummary] = useState(null);
  const [allDevices, setAllDevices] = useState([]);
  const [allLoading, setAllLoading] = useState(false);
  const [allError, setAllError] = useState(null);

  // Chart range
  const [chartRange, setChartRange] = useState(30);

  // Session filters and pagination
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterTriggerType, setFilterTriggerType] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [currentPage, setCurrentPage] = useState(0);

  // Live flow state
  const [liveElapsed, setLiveElapsed] = useState(0);
  const liveTimerRef = useRef(null);
  const [flowHistory, setFlowHistory] = useState([]);

  // Stop fill confirm
  const [stopConfirm, setStopConfirm] = useState(false);
  const stopTimerRef = useRef(null);

  // Save status
  const [statusMsg, setStatusMsg] = useState(null);

  // Detect valve open
  const valveOpen = activeSession || deviceState?.valve_open || deviceState?.filling;

  // ── All-devices data loading ──────────────────────────────
  const loadAllDevicesData = useCallback(() => {
    setAllLoading(true);
    setAllError(null);
    Promise.all([getWaterSummaryAll(), getDevices()])
      .then(([summaryData, devicesData]) => {
        setAllSummary(summaryData);
        const devList = Array.isArray(devicesData) ? devicesData : devicesData.devices || [];
        setAllDevices(devList);
        setAllLoading(false);
      })
      .catch((err) => {
        setAllError(err.message);
        setAllLoading(false);
      });
  }, []);

  useEffect(() => {
    if (allDevicesMode) {
      loadAllDevicesData();
      const interval = setInterval(loadAllDevicesData, 60_000);
      return () => clearInterval(interval);
    }
  }, [allDevicesMode, loadAllDevicesData]);

  // ── Live flow timer ───────────────────────────────────────
  useEffect(() => {
    if (valveOpen && !allDevicesMode) {
      // Find active session start
      const activeSessionData = sessions.find((s) => !s.end_time && !s.ended_at);
      const startTime = activeSessionData
        ? new Date(activeSessionData.start_time || activeSessionData.started_at).getTime()
        : Date.now();

      liveTimerRef.current = setInterval(() => {
        setLiveElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      return () => {
        if (liveTimerRef.current) clearInterval(liveTimerRef.current);
      };
    } else {
      setLiveElapsed(0);
      if (liveTimerRef.current) clearInterval(liveTimerRef.current);
    }
  }, [valveOpen, allDevicesMode, sessions]);

  // Track flow history for sparkline
  useEffect(() => {
    if (valveOpen && deviceState?.flow_rate != null) {
      setFlowHistory((prev) => {
        const next = [...prev, deviceState.flow_rate];
        return next.length > 20 ? next.slice(-20) : next;
      });
    } else {
      setFlowHistory([]);
    }
  }, [valveOpen, deviceState?.flow_rate]);

  // Cleanup stop confirm timer
  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    };
  }, []);

  // ── Handlers ──────────────────────────────────────────────
  const handleDeviceSelect = useCallback((id) => {
    if (id) {
      setAllDevicesMode(false);
      navigate(`/devices/${id}/water`);
    }
  }, [navigate]);

  const toggleMode = useCallback(() => {
    if (allDevicesMode) {
      // Switch to single device - go to current or first
      if (deviceId) {
        setAllDevicesMode(false);
      }
    } else {
      setAllDevicesMode(true);
      navigate('/water');
    }
  }, [allDevicesMode, deviceId, navigate]);

  const handleStopFill = useCallback(() => {
    if (!stopConfirm) {
      setStopConfirm(true);
      stopTimerRef.current = setTimeout(() => setStopConfirm(false), 3000);
      return;
    }
    clearTimeout(stopTimerRef.current);
    setStopConfirm(false);
    if (!effectiveDeviceId) return;
    sendFillStop(effectiveDeviceId)
      .then(() => {
        setStatusMsg({ type: 'success', text: 'Fill stop command sent' });
        refresh();
      })
      .catch((err) => {
        setStatusMsg({ type: 'error', text: err.message || 'Failed to stop fill' });
      });
  }, [stopConfirm, effectiveDeviceId, refresh]);

  // ── Filtered sessions ─────────────────────────────────────
  const filteredSessions = useMemo(() => {
    let list = sessions || [];
    if (filterDateFrom) {
      const from = new Date(filterDateFrom).getTime();
      list = list.filter((s) => {
        const t = new Date(s.start_time || s.started_at).getTime();
        return t >= from;
      });
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo).getTime() + 86400000; // end of day
      list = list.filter((s) => {
        const t = new Date(s.start_time || s.started_at).getTime();
        return t <= to;
      });
    }
    if (filterTriggerType) {
      list = list.filter((s) =>
        (s.trigger_type || s.trigger || '').toLowerCase().includes(filterTriggerType.toLowerCase())
      );
    }
    if (filterSource) {
      list = list.filter((s) =>
        (s.source || s.trigger_source || '').toLowerCase().includes(filterSource.toLowerCase())
      );
    }
    return list;
  }, [sessions, filterDateFrom, filterDateTo, filterTriggerType, filterSource]);

  const totalPages = Math.ceil(filteredSessions.length / PAGE_SIZE);
  const pagedSessions = filteredSessions.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(0);
  }, [filterDateFrom, filterDateTo, filterTriggerType, filterSource]);

  // ── CSV Export ─────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    const headers = ['Started', 'Duration (s)', 'Liters', 'Flow Rate (L/min)', 'Trigger', 'Source', 'Tank Start %', 'Tank End %'];
    const rows = filteredSessions.map((s) => [
      s.start_time || s.started_at || '',
      s.duration_seconds ?? s.duration ?? '',
      (s.liters ?? s.volume_liters ?? 0).toFixed(2),
      (s.flow_rate_avg ?? s.avg_flow_rate ?? 0).toFixed(2),
      s.trigger_type || s.trigger || '',
      s.source || s.trigger_source || '',
      s.tank_start_pct ?? s.tank_level_start ?? '',
      s.tank_end_pct ?? s.tank_level_end ?? '',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `water-sessions-${effectiveDeviceId || 'all'}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filteredSessions, effectiveDeviceId]);

  // ── Chart data: daily usage ───────────────────────────────
  const dailyChartData = useMemo(() => {
    const days = chartRange;
    const now = new Date();
    const labels = [];
    const dataMap = {};

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      labels.push(key);
      dataMap[key] = 0;
    }

    // Single device mode
    if (!allDevicesMode) {
      (sessions || []).forEach((s) => {
        const dateKey = (s.start_time || s.started_at || '').split('T')[0];
        if (dataMap[dateKey] !== undefined) {
          dataMap[dateKey] += s.liters ?? s.volume_liters ?? 0;
        }
      });

      return {
        labels: labels.map((l) => {
          const d = new Date(l);
          return `${d.getMonth() + 1}/${d.getDate()}`;
        }),
        datasets: [
          {
            label: 'Liters',
            data: labels.map((l) => parseFloat(dataMap[l].toFixed(2))),
            ...terminalBarDataset,
          },
        ],
      };
    }

    // All devices mode: grouped bars
    const deviceDataMaps = {};
    const deviceNames = {};

    (allSummary?.devices || allSummary?.by_device || []).forEach((dev, idx) => {
      const id = dev.device_id || dev.id;
      deviceNames[id] = dev.device_name || dev.name || `Device ${idx + 1}`;
      deviceDataMaps[id] = {};
      labels.forEach((l) => { deviceDataMaps[id][l] = 0; });

      (dev.daily || []).forEach((day) => {
        const dateKey = (day.date || '').split('T')[0];
        if (deviceDataMaps[id][dateKey] !== undefined) {
          deviceDataMaps[id][dateKey] += day.liters ?? day.volume ?? 0;
        }
      });
    });

    const deviceIds = Object.keys(deviceDataMaps);
    return {
      labels: labels.map((l) => {
        const d = new Date(l);
        return `${d.getMonth() + 1}/${d.getDate()}`;
      }),
      datasets: deviceIds.map((id, idx) => {
        const color = DEVICE_COLORS[idx % DEVICE_COLORS.length];
        return {
          label: deviceNames[id] || id,
          data: labels.map((l) => parseFloat((deviceDataMaps[id][l] || 0).toFixed(2))),
          backgroundColor: color.bg,
          hoverBackgroundColor: color.border,
          borderColor: color.border,
          borderWidth: 1,
        };
      }),
    };
  }, [sessions, allDevicesMode, allSummary, chartRange]);

  const dailyChartOptions = useMemo(() => ({
    ...terminalChartTheme,
    plugins: {
      ...terminalChartTheme.plugins,
      legend: {
        ...terminalChartTheme.plugins.legend,
        display: allDevicesMode,
      },
    },
    scales: {
      ...terminalChartTheme.scales,
      y: {
        ...terminalChartTheme.scales.y,
        title: {
          ...terminalChartTheme.scales.y.title,
          display: true,
          text: 'LITERS',
        },
      },
    },
  }), [allDevicesMode]);

  // ── Sparkline data for live flow ──────────────────────────
  const sparklineData = useMemo(() => ({
    labels: flowHistory.map((_, i) => i),
    datasets: [
      {
        data: flowHistory,
        borderColor: '#ffb000',
        backgroundColor: 'rgba(255,176,0,0.1)',
        pointRadius: 0,
        tension: 0.4,
        fill: true,
        borderWidth: 1.5,
      },
    ],
  }), [flowHistory]);

  const sparklineOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
    scales: {
      x: { display: false },
      y: { display: false },
    },
    elements: { point: { radius: 0 } },
  }), []);

  // ── Summary values ────────────────────────────────────────
  const summaryData = allDevicesMode ? allSummary : summary;
  const todayLiters = summaryData?.today_liters ?? summaryData?.today?.liters ?? 0;
  const weekLiters = summaryData?.week_liters ?? summaryData?.this_week?.liters ?? 0;
  const monthLiters = summaryData?.month_liters ?? summaryData?.this_month?.liters ?? 0;
  const lifetimeLiters = summaryData?.lifetime_liters ?? summaryData?.lifetime?.liters ?? 0;
  const todaySessions = summaryData?.today_sessions ?? summaryData?.today?.sessions ?? 0;
  const weekSessions = summaryData?.week_sessions ?? summaryData?.this_week?.sessions ?? 0;
  const monthSessions = summaryData?.month_sessions ?? summaryData?.this_month?.sessions ?? 0;
  const lifetimeSessions = summaryData?.lifetime_sessions ?? summaryData?.lifetime?.sessions ?? 0;
  const lastMonthLiters = summaryData?.last_month_liters ?? summaryData?.last_month?.liters ?? null;
  const lifetimeTrend = lastMonthLiters != null && lastMonthLiters > 0
    ? (monthLiters >= lastMonthLiters ? 'up' : 'down')
    : null;

  // ── Device comparison data ────────────────────────────────
  const comparisonDevices = useMemo(() => {
    if (!allDevicesMode || !allSummary) return [];
    return allSummary.devices || allSummary.by_device || [];
  }, [allDevicesMode, allSummary]);

  const comparisonChartData = useMemo(() => {
    if (!comparisonDevices.length) return null;
    return {
      labels: comparisonDevices.map((d) => d.device_name || d.name || d.device_id || d.id),
      datasets: [
        {
          label: 'Lifetime Liters',
          data: comparisonDevices.map((d) => d.lifetime_liters ?? d.lifetime?.liters ?? 0),
          ...terminalBarDataset,
        },
      ],
    };
  }, [comparisonDevices]);

  const comparisonChartOptions = useMemo(() => ({
    ...terminalChartTheme,
    indexAxis: 'y',
    plugins: {
      ...terminalChartTheme.plugins,
      legend: { display: false },
    },
  }), []);

  const isLoading = allDevicesMode ? allLoading : loading;
  const displayError = allDevicesMode ? allError : error;

  // ── Table data for session history ────────────────────────
  const sessionTableColumns = [
    'STARTED', 'DURATION', 'LITERS', 'FLOW RATE', 'TRIGGER', 'SOURCE', 'TANK START %', 'TANK END %',
  ];

  const sessionTableData = pagedSessions.map((s) => {
    const trigger = s.trigger_type || s.trigger || '--';
    return [
      formatDate(s.start_time || s.started_at),
      formatDuration(s.duration_seconds ?? s.duration),
      (s.liters ?? s.volume_liters ?? 0).toFixed(2),
      `${(s.flow_rate_avg ?? s.avg_flow_rate ?? 0).toFixed(2)} L/min`,
      <Badge key="trigger" variant={triggerBadgeVariant(trigger)}>{trigger}</Badge>,
      s.source || s.trigger_source || '--',
      s.tank_start_pct != null ? `${s.tank_start_pct}%` : (s.tank_level_start != null ? `${s.tank_level_start}%` : '--'),
      s.tank_end_pct != null ? `${s.tank_end_pct}%` : (s.tank_level_end != null ? `${s.tank_level_end}%` : '--'),
    ];
  });

  // Comparison table data
  const comparisonTableColumns = [
    'DEVICE', 'FACILITY', 'LIFETIME', 'THIS MONTH', 'AVG/SESSION', 'SESSIONS',
  ];

  const comparisonTableData = comparisonDevices.map((d) => {
    const lifetime = d.lifetime_liters ?? d.lifetime?.liters ?? 0;
    const month = d.month_liters ?? d.this_month?.liters ?? 0;
    const totalSessions = d.lifetime_sessions ?? d.lifetime?.sessions ?? 0;
    const avg = totalSessions > 0 ? (lifetime / totalSessions).toFixed(2) : '0.00';
    return [
      d.device_name || d.name || d.device_id || d.id,
      d.facility || '--',
      `${lifetime.toFixed(1)} L`,
      `${month.toFixed(1)} L`,
      `${avg} L`,
      totalSessions,
    ];
  });

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: '1400px', margin: '0 auto' }}>
      {/* ── Top bar ──────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
          marginBottom: 'var(--space-4)',
        }}
      >
        <div style={{ flex: 1, minWidth: '250px' }}>
          <DeviceSelector value={effectiveDeviceId || ''} onSelect={handleDeviceSelect} />
        </div>

        <div
          style={{
            display: 'flex',
            gap: 0,
            marginBottom: 'var(--space-4)',
          }}
        >
          <button
            onClick={() => {
              setAllDevicesMode(false);
              if (deviceId) navigate(`/devices/${deviceId}/water`);
            }}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--letter-spacing-wider)',
              border: '1px solid var(--color-border)',
              borderRight: 'none',
              background: !allDevicesMode ? 'var(--color-phosphor-glow, rgba(0,255,65,0.1))' : 'transparent',
              color: !allDevicesMode ? 'var(--color-phosphor-primary)' : 'var(--color-phosphor-ghost)',
              cursor: 'pointer',
              transition: 'all 200ms ease',
            }}
          >
            SINGLE DEVICE
          </button>
          <button
            onClick={() => {
              setAllDevicesMode(true);
              navigate('/water');
            }}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--letter-spacing-wider)',
              border: '1px solid var(--color-border)',
              background: allDevicesMode ? 'var(--color-phosphor-glow, rgba(0,255,65,0.1))' : 'transparent',
              color: allDevicesMode ? 'var(--color-phosphor-primary)' : 'var(--color-phosphor-ghost)',
              cursor: 'pointer',
              transition: 'all 200ms ease',
            }}
          >
            ALL DEVICES
          </button>
        </div>
      </div>

      {/* Page title */}
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-2xl)',
          color: 'var(--color-phosphor-primary)',
          textShadow: 'var(--glow-text)',
          letterSpacing: 'var(--letter-spacing-wider)',
          textTransform: 'uppercase',
          marginBottom: 'var(--space-4)',
        }}
      >
        Water Usage {allDevicesMode ? '-- All Devices' : ''}
      </h1>

      {/* Status messages */}
      {statusMsg && (
        <AlertBanner
          variant={statusMsg.type === 'success' ? 'success' : 'error'}
          dismissible
          onDismiss={() => setStatusMsg(null)}
        >
          {statusMsg.text}
        </AlertBanner>
      )}

      {displayError && (
        <AlertBanner variant="error">{displayError}</AlertBanner>
      )}

      {isLoading && !summaryData && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
          <Loader />
        </div>
      )}

      {/* ── Section 1: SUMMARY STATS ─────────────────────────── */}
      <Card title="SUMMARY STATS" style={{ marginBottom: 'var(--space-4)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <div style={{ position: 'relative' }}>
            <StatCard
              value={`${todayLiters.toFixed(1)} L`}
              label={`TODAY (${todaySessions} sessions)`}
            />
            {valveOpen && !allDevicesMode && (
              <div
                style={{
                  position: 'absolute',
                  top: 'var(--space-2)',
                  right: 'var(--space-2)',
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-phosphor-bright)',
                  animation: 'blinkCursor 1.5s step-end infinite',
                }}
              >
                &#9679; FILLING IN PROGRESS
              </div>
            )}
          </div>

          <StatCard
            value={`${weekLiters.toFixed(1)} L`}
            label={`THIS WEEK (${weekSessions} sessions)`}
          />

          <StatCard
            value={`${monthLiters.toFixed(1)} L`}
            label={`THIS MONTH (${monthSessions} sessions)`}
          />

          <StatCard
            value={`${lifetimeLiters.toFixed(1)} L`}
            label={`LIFETIME (${lifetimeSessions} sessions)`}
            trend={lifetimeTrend}
          />
        </div>
      </Card>

      {/* ── Section 2: LIVE FLOW ─────────────────────────────── */}
      {valveOpen && !allDevicesMode && (
        <Card
          title="LIVE FLOW"
          style={{
            marginBottom: 'var(--space-4)',
            borderColor: 'var(--color-amber)',
            boxShadow: '0 0 12px rgba(255,176,0,0.3)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 'var(--space-4)',
              alignItems: 'center',
            }}
          >
            {/* Flow rate */}
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--text-3xl)',
                  color: 'var(--color-amber)',
                  textShadow: '0 0 12px rgba(255,176,0,0.6)',
                }}
              >
                {deviceState?.flow_rate != null
                  ? `${deviceState.flow_rate.toFixed(2)} L/min`
                  : '-- L/min'}
              </div>
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-phosphor-dim)',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--letter-spacing-wide)',
                }}
              >
                Flow Rate
              </div>
            </div>

            {/* Session duration */}
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--text-3xl)',
                  color: 'var(--color-amber)',
                  textShadow: '0 0 12px rgba(255,176,0,0.6)',
                }}
              >
                {formatDuration(liveElapsed)}
              </div>
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-phosphor-dim)',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--letter-spacing-wide)',
                }}
              >
                Session Duration
              </div>
            </div>

            {/* Session volume */}
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--text-3xl)',
                  color: 'var(--color-amber)',
                  textShadow: '0 0 12px rgba(255,176,0,0.6)',
                }}
              >
                {deviceState?.session_volume != null
                  ? `${deviceState.session_volume.toFixed(2)} L`
                  : '-- L'}
              </div>
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-phosphor-dim)',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--letter-spacing-wide)',
                }}
              >
                Session Volume
              </div>
            </div>

            {/* Sparkline */}
            <div style={{ height: '80px', minWidth: '120px' }}>
              {flowHistory.length > 1 && (
                <Line data={sparklineData} options={sparklineOptions} />
              )}
            </div>
          </div>

          {/* Tank level gauge */}
          <div style={{ marginTop: 'var(--space-4)' }}>
            <GaugeBar
              label="Tank Level"
              value={deviceState?.tank_level_pct ?? deviceState?.water_level_pct ?? null}
              unit="%"
              min={0}
              max={100}
              warningLow={20}
              criticalLow={10}
            />
          </div>

          {/* Stop button */}
          <div style={{ marginTop: 'var(--space-4)', textAlign: 'center' }}>
            <Button variant="danger" size="lg" onClick={handleStopFill}>
              {stopConfirm ? 'CONFIRM STOP?' : 'STOP FILL'}
            </Button>
          </div>
        </Card>
      )}

      {/* ── Section 3: DAILY USAGE ───────────────────────────── */}
      <Card title="DAILY USAGE" style={{ marginBottom: 'var(--space-4)' }}>
        {/* Range buttons */}
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-4)',
          }}
        >
          {[7, 30, 90].map((days) => (
            <Button
              key={days}
              variant={chartRange === days ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setChartRange(days)}
            >
              {days} DAYS
            </Button>
          ))}
        </div>

        <div style={{ height: '300px' }}>
          <Bar data={dailyChartData} options={dailyChartOptions} />
        </div>
      </Card>

      {/* ── Section 4: SESSION HISTORY ───────────────────────── */}
      {!allDevicesMode && (
        <Card title="SESSION HISTORY" style={{ marginBottom: 'var(--space-4)' }}>
          {/* Filters */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
              marginBottom: 'var(--space-4)',
              alignItems: 'flex-end',
            }}
          >
            <div style={{ minWidth: '140px' }}>
              <Input
                label="Date from"
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                style={{ marginBottom: 0 }}
              />
            </div>
            <div style={{ minWidth: '140px' }}>
              <Input
                label="Date to"
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                style={{ marginBottom: 0 }}
              />
            </div>
            <div style={{ minWidth: '120px' }}>
              <Input
                label="Trigger type"
                type="text"
                placeholder="auto, manual..."
                value={filterTriggerType}
                onChange={(e) => setFilterTriggerType(e.target.value)}
                style={{ marginBottom: 0 }}
              />
            </div>
            <div style={{ minWidth: '120px' }}>
              <Input
                label="Source"
                type="text"
                placeholder="sensor, user..."
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                style={{ marginBottom: 0 }}
              />
            </div>
            <div>
              <Button variant="secondary" size="sm" onClick={exportCSV}>
                EXPORT CSV
              </Button>
            </div>
          </div>

          {/* Table */}
          <Table
            columns={sessionTableColumns}
            data={sessionTableData}
            emptyMessage="[ NO WATER SESSIONS FOUND ]"
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 'var(--space-4)',
                marginTop: 'var(--space-4)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-phosphor-dim)',
              }}
            >
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage === 0}
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              >
                PREV
              </Button>
              <span>
                {currentPage + 1} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage >= totalPages - 1}
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                NEXT
              </Button>
            </div>
          )}

          {/* Result count */}
          <div
            style={{
              textAlign: 'center',
              marginTop: 'var(--space-2)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-phosphor-ghost)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''} found
          </div>
        </Card>
      )}

      {/* ── Section 5: DEVICE COMPARISON (all devices only) ── */}
      {allDevicesMode && comparisonDevices.length > 0 && (
        <Card title="DEVICE COMPARISON" style={{ marginBottom: 'var(--space-4)' }}>
          {/* Horizontal bar chart */}
          {comparisonChartData && (
            <div style={{ height: Math.max(200, comparisonDevices.length * 50) + 'px', marginBottom: 'var(--space-4)' }}>
              <Bar data={comparisonChartData} options={comparisonChartOptions} />
            </div>
          )}

          {/* Comparison table */}
          <Table
            columns={comparisonTableColumns}
            data={comparisonTableData}
            emptyMessage="[ NO DEVICE DATA ]"
          />
        </Card>
      )}
    </div>
  );
}

export default WaterUsage;
