import React, { useState, useEffect, useCallback } from 'react';
import { Card, Badge, Loader, AlertBanner, ProgressBar } from '../components/ui';

function ServerHealth() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health/detailed', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHealth(data);
      setError(null);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, 10000);
    return () => clearInterval(id);
  }, [fetchHealth]);

  if (loading && !health) return <Loader type="spin" text="LOADING SERVER HEALTH" />;

  function severity(pct) {
    if (pct >= 90) return 'danger';
    if (pct >= 70) return 'warning';
    return 'default';
  }

  function tempSeverity(temp) {
    if (temp == null) return 'default';
    if (temp >= 80) return 'danger';
    if (temp >= 65) return 'warning';
    return 'default';
  }

  const h = health || {};
  const cpu = h.cpu || {};
  const mem = h.memory || {};
  const disk = h.disk || {};
  const net = h.network || {};
  const dbInfo = h.database || {};
  const proc = h.process || {};
  const services = h.services || {};
  const server = h.server || {};

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={styles.header}>
        <h1 style={styles.title}>SERVER HEALTH</h1>
        <p style={styles.subtitle}>
          RASPBERRY PI SYSTEM MONITORING — AUTO-REFRESH 10S
        </p>
        {lastUpdate && (
          <p style={styles.lastUpdate}>
            LAST UPDATE: {lastUpdate.toLocaleTimeString('en-US', { hour12: false })}
          </p>
        )}
      </div>

      {error && <AlertBanner variant="error">HEALTH CHECK FAILED: {error}</AlertBanner>}

      {/* Service Status */}
      <Card title="SERVICE STATUS" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={styles.serviceGrid}>
          <ServiceBadge name="FLASK" running={services.flask} />
          <ServiceBadge name="MQTT SERVICE" running={services.mqtt_service} />
          <ServiceBadge name="MOSQUITTO" running={services.mosquitto} />
        </div>
        <div style={styles.uptimeRow}>
          <span style={styles.metaLabel}>UPTIME:</span>
          <span style={styles.metaValue}>{server.uptime_human || '---'}</span>
        </div>
      </Card>

      {/* CPU & Temperature */}
      <div style={styles.twoCol}>
        <Card title="CPU" style={{ marginBottom: 'var(--space-4)' }}>
          <MetricBar label="CPU USAGE" value={cpu.percent} unit="%" severity={severity(cpu.percent || 0)} />
          <div style={styles.metricGrid}>
            <MetricItem label="CORES" value={cpu.count} />
            <MetricItem label="FREQ" value={cpu.freq_mhz ? `${cpu.freq_mhz} MHz` : '---'} />
            <MetricItem label="LOAD 1M" value={cpu.load_1m} warn={cpu.load_1m > cpu.count} />
            <MetricItem label="LOAD 5M" value={cpu.load_5m} warn={cpu.load_5m > cpu.count} />
            <MetricItem label="LOAD 15M" value={cpu.load_15m} warn={cpu.load_15m > cpu.count} />
          </div>
        </Card>

        <Card title="TEMPERATURE" style={{ marginBottom: 'var(--space-4)' }}>
          {cpu.temperature_c != null ? (
            <>
              <div style={styles.tempDisplay}>
                <span style={{
                  ...styles.tempValue,
                  color: cpu.temperature_c >= 80 ? 'var(--color-red-alert)' :
                         cpu.temperature_c >= 65 ? 'var(--color-amber)' :
                         'var(--color-phosphor-primary)',
                }}>
                  {cpu.temperature_c.toFixed(1)}
                </span>
                <span style={styles.tempUnit}>°C</span>
              </div>
              <ProgressBar
                value={Math.min(100, (cpu.temperature_c / 85) * 100)}
                variant={tempSeverity(cpu.temperature_c)}
                showLabel
              />
              <div style={styles.tempGuide}>
                <span>COOL &lt;50°C</span>
                <span>NORMAL 50-65°C</span>
                <span>WARM 65-80°C</span>
                <span>HOT &gt;80°C</span>
              </div>
            </>
          ) : (
            <div style={styles.emptyState}>[ TEMPERATURE SENSOR NOT AVAILABLE ]</div>
          )}
        </Card>
      </div>

      {/* Memory & Disk */}
      <div style={styles.twoCol}>
        <Card title="MEMORY" style={{ marginBottom: 'var(--space-4)' }}>
          <MetricBar label="RAM" value={mem.percent} unit="%" severity={severity(mem.percent || 0)} />
          <div style={styles.metricGrid}>
            <MetricItem label="TOTAL" value={`${mem.total_mb} MB`} />
            <MetricItem label="USED" value={`${mem.used_mb} MB`} />
            <MetricItem label="AVAILABLE" value={`${mem.available_mb} MB`} />
            <MetricItem label="SWAP USED" value={`${mem.swap_used_mb}/${mem.swap_total_mb} MB`}
                        warn={mem.swap_percent > 50} />
          </div>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <div style={styles.subLabel}>FLASK PROCESS</div>
            <div style={styles.metricGrid}>
              <MetricItem label="RSS" value={`${proc.flask_rss_mb} MB`} />
              <MetricItem label="VMS" value={`${proc.flask_vms_mb} MB`} />
            </div>
          </div>
        </Card>

        <Card title="DISK" style={{ marginBottom: 'var(--space-4)' }}>
          <MetricBar label="STORAGE" value={disk.percent} unit="%" severity={severity(disk.percent || 0)} />
          <div style={styles.metricGrid}>
            <MetricItem label="TOTAL" value={`${disk.total_gb} GB`} />
            <MetricItem label="USED" value={`${disk.used_gb} GB`} />
            <MetricItem label="FREE" value={`${disk.free_gb} GB`} warn={disk.free_gb < 2} />
          </div>
        </Card>
      </div>

      {/* Database */}
      <Card title="DATABASE" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={styles.metricGrid}>
          <MetricItem label="DB SIZE" value={dbInfo.size_mb ? `${dbInfo.size_mb} MB` : '---'} />
          <MetricItem label="DEVICES" value={dbInfo.devices} />
          <MetricItem label="TELEMETRY RECORDS" value={dbInfo.telemetry_records?.toLocaleString()} />
          <MetricItem label="FACILITIES" value={dbInfo.facilities} />
          <MetricItem label="INGEST RATE" value={`${dbInfo.telemetry_per_min}/min`}
                      warn={dbInfo.telemetry_per_min > 100} />
        </div>
        {dbInfo.telemetry_records > 100000 && (
          <AlertBanner variant="warning" style={{ marginTop: 'var(--space-3)' }}>
            TELEMETRY TABLE HAS {dbInfo.telemetry_records.toLocaleString()} RECORDS.
            CONSIDER ARCHIVING OLD DATA TO MAINTAIN PERFORMANCE.
          </AlertBanner>
        )}
      </Card>

      {/* Network */}
      <Card title="NETWORK I/O" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={styles.metricGrid}>
          <MetricItem label="SENT" value={`${net.bytes_sent_mb} MB`} />
          <MetricItem label="RECEIVED" value={`${net.bytes_recv_mb} MB`} />
          <MetricItem label="PACKETS OUT" value={net.packets_sent?.toLocaleString()} />
          <MetricItem label="PACKETS IN" value={net.packets_recv?.toLocaleString()} />
          <MetricItem label="ERRORS IN" value={net.errors_in} warn={net.errors_in > 0} />
          <MetricItem label="ERRORS OUT" value={net.errors_out} warn={net.errors_out > 0} />
        </div>
      </Card>

      {/* Best Practices */}
      <Card title="HEALTH GUIDELINES">
        <div style={styles.guidelines}>
          <Guideline
            label="CPU USAGE"
            status={cpu.percent < 70 ? 'ok' : cpu.percent < 90 ? 'warn' : 'bad'}
            text={cpu.percent < 70 ? 'CPU load is healthy' : cpu.percent < 90 ? 'CPU load is elevated — check for runaway processes' : 'CPU is critically loaded — reduce workload'}
          />
          <Guideline
            label="MEMORY"
            status={mem.percent < 70 ? 'ok' : mem.percent < 90 ? 'warn' : 'bad'}
            text={mem.percent < 70 ? 'Memory usage is healthy' : mem.percent < 90 ? 'Memory usage is high — monitor for growth' : 'Memory critically low — consider adding swap or reducing services'}
          />
          <Guideline
            label="DISK SPACE"
            status={disk.percent < 70 ? 'ok' : disk.percent < 90 ? 'warn' : 'bad'}
            text={disk.percent < 70 ? 'Disk space is healthy' : disk.percent < 90 ? 'Disk filling up — archive old telemetry data' : 'Disk critically full — immediate cleanup needed'}
          />
          <Guideline
            label="TEMPERATURE"
            status={cpu.temperature_c == null ? 'ok' : cpu.temperature_c < 65 ? 'ok' : cpu.temperature_c < 80 ? 'warn' : 'bad'}
            text={cpu.temperature_c == null ? 'No temperature data' : cpu.temperature_c < 65 ? 'Temperature is normal' : cpu.temperature_c < 80 ? 'Running warm — ensure adequate ventilation' : 'Overheating — add cooling or reduce load'}
          />
          <Guideline
            label="TELEMETRY RATE"
            status={dbInfo.telemetry_per_min < 30 ? 'ok' : dbInfo.telemetry_per_min < 100 ? 'warn' : 'bad'}
            text={`${dbInfo.telemetry_per_min}/min — ${dbInfo.telemetry_per_min < 30 ? 'sustainable rate' : dbInfo.telemetry_per_min < 100 ? 'moderate rate, monitor DB size' : 'high rate — consider longer sensor intervals'}`}
          />
          <Guideline
            label="SERVICES"
            status={services.flask && services.mqtt_service && services.mosquitto ? 'ok' : 'bad'}
            text={services.flask && services.mqtt_service && services.mosquitto ? 'All services running' : 'One or more services are down — check systemd'}
          />
        </div>
      </Card>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function ServiceBadge({ name, running }) {
  return (
    <div style={styles.serviceItem}>
      <Badge variant={running ? 'online' : 'offline'} />
      <span style={{
        ...styles.serviceName,
        color: running ? 'var(--color-phosphor-primary)' : 'var(--color-red-alert)',
      }}>
        {name}
      </span>
    </div>
  );
}

function MetricBar({ label, value, unit, severity: sev }) {
  return (
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <div style={styles.metricBarHeader}>
        <span style={styles.metricBarLabel}>{label}</span>
        <span style={{
          ...styles.metricBarValue,
          color: sev === 'danger' ? 'var(--color-red-alert)' :
                 sev === 'warning' ? 'var(--color-amber)' :
                 'var(--color-phosphor-primary)',
        }}>
          {value != null ? `${value}${unit}` : '---'}
        </span>
      </div>
      <ProgressBar value={value || 0} variant={sev} />
    </div>
  );
}

function MetricItem({ label, value, warn }) {
  return (
    <div style={styles.metricItem}>
      <span style={styles.metricLabel}>{label}</span>
      <span style={{
        ...styles.metricValue,
        color: warn ? 'var(--color-amber)' : 'var(--color-phosphor-primary)',
      }}>
        {value ?? '---'}
      </span>
    </div>
  );
}

function Guideline({ label, status, text }) {
  const color = status === 'ok' ? 'var(--color-phosphor-primary)' :
                status === 'warn' ? 'var(--color-amber)' : 'var(--color-red-alert)';
  const icon = status === 'ok' ? '[OK]' : status === 'warn' ? '[!!]' : '[XX]';

  return (
    <div style={styles.guidelineRow}>
      <span style={{ ...styles.guidelineIcon, color }}>{icon}</span>
      <span style={styles.guidelineLabel}>{label}</span>
      <span style={{ ...styles.guidelineText, color }}>{text}</span>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = {
  header: { marginBottom: 'var(--space-6)' },
  title: {
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)',
    color: 'var(--color-phosphor-primary)', textShadow: 'var(--glow-text)',
    letterSpacing: 'var(--letter-spacing-wider)', margin: 0, fontWeight: 'normal',
  },
  subtitle: {
    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)', letterSpacing: 'var(--letter-spacing-wide)',
    marginTop: 'var(--space-1)',
  },
  lastUpdate: {
    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)', marginTop: 'var(--space-1)',
  },
  twoCol: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)',
  },
  serviceGrid: {
    display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap',
    marginBottom: 'var(--space-3)',
  },
  serviceItem: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
  },
  serviceName: {
    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  uptimeRow: {
    display: 'flex', gap: 'var(--space-2)', fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
  },
  metaLabel: { color: 'var(--color-phosphor-ghost)' },
  metaValue: { color: 'var(--color-phosphor-primary)' },
  metricGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 'var(--space-2)',
  },
  metricItem: {
    display: 'flex', flexDirection: 'column', padding: 'var(--space-2)',
    background: 'var(--color-bg-base)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
  },
  metricLabel: {
    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)', letterSpacing: 'var(--letter-spacing-wide)',
  },
  metricValue: {
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)',
    color: 'var(--color-phosphor-primary)', marginTop: 'var(--space-1)',
  },
  metricBarHeader: {
    display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)',
  },
  metricBarLabel: {
    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-dim)', letterSpacing: 'var(--letter-spacing-wide)',
  },
  metricBarValue: {
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)',
  },
  subLabel: {
    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)', letterSpacing: 'var(--letter-spacing-wider)',
    marginBottom: 'var(--space-2)',
  },
  tempDisplay: {
    textAlign: 'center', marginBottom: 'var(--space-3)',
  },
  tempValue: {
    fontFamily: 'var(--font-display)', fontSize: '3rem',
    textShadow: 'var(--glow-text)',
  },
  tempUnit: {
    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)',
    color: 'var(--color-phosphor-dim)', marginLeft: 'var(--space-1)',
  },
  tempGuide: {
    display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-2)',
    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
  },
  guidelines: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
  },
  guidelineRow: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: 'var(--space-2) 0',
    borderBottom: '1px solid var(--color-border)',
    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
  },
  guidelineIcon: {
    fontWeight: 'bold', minWidth: '3em',
  },
  guidelineLabel: {
    color: 'var(--color-phosphor-dim)', minWidth: '140px',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  guidelineText: {},
  emptyState: {
    textAlign: 'center', padding: 'var(--space-6)',
    color: 'var(--color-phosphor-ghost)', fontFamily: 'var(--font-mono)',
  },
};

export default ServerHealth;
