import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, StatCard, Loader, AlertBanner, Select } from '../../components/ui';
import {
  getInventorySummary, getYieldByFlush, getContaminationRate,
} from '../../utils/api';

// ── Terminal chart theme ─────────────────────────────────────────────────

const terminalChartTheme = {
  phosphor: 'rgba(0, 255, 65, 1)',
  phosphorDim: 'rgba(0, 255, 65, 0.5)',
  phosphorGhost: 'rgba(0, 255, 65, 0.2)',
  amber: 'rgba(255, 176, 0, 1)',
  amberDim: 'rgba(255, 176, 0, 0.5)',
  red: 'rgba(255, 49, 49, 1)',
  redDim: 'rgba(255, 49, 49, 0.3)',
  cyan: 'rgba(0, 255, 247, 1)',
  cyanDim: 'rgba(0, 255, 247, 0.3)',
  gridColor: 'rgba(0, 255, 65, 0.1)',
  textColor: 'rgba(0, 255, 65, 0.6)',
  bgSurface: 'rgba(0, 12, 2, 1)',
};

// ── Bar chart component (canvas-based, no Chart.js dependency) ──────────

function BarChart({ data, labels, title, yLabel, color }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !data || data.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = 280;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = terminalChartTheme.bgSurface;
    ctx.fillRect(0, 0, w, h);

    const pad = { top: 30, right: 20, bottom: 50, left: 60 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const maxVal = Math.max(...data, 1);
    const barW = Math.min(40, (chartW / data.length) * 0.6);
    const gap = chartW / data.length;

    // Title
    ctx.fillStyle = terminalChartTheme.textColor;
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    if (title) ctx.fillText(title.toUpperCase(), pad.left, 16);

    // Y axis label
    if (yLabel) {
      ctx.save();
      ctx.translate(12, pad.top + chartH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText(yLabel.toUpperCase(), 0, 0);
      ctx.restore();
    }

    // Grid lines
    ctx.strokeStyle = terminalChartTheme.gridColor;
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (chartH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();

      // Y labels
      const val = maxVal - (maxVal / gridLines) * i;
      ctx.fillStyle = terminalChartTheme.textColor;
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(0), pad.left - 8, y + 4);
    }

    // Bars
    const barColor = color || terminalChartTheme.phosphor;
    const barColorDim = color ? color.replace('1)', '0.3)') : terminalChartTheme.phosphorGhost;

    data.forEach((val, i) => {
      const x = pad.left + gap * i + (gap - barW) / 2;
      const barH = (val / maxVal) * chartH;
      const y = pad.top + chartH - barH;

      // Bar shadow/glow
      ctx.fillStyle = barColorDim;
      ctx.fillRect(x - 1, y - 1, barW + 2, barH + 2);

      // Bar
      ctx.fillStyle = barColor;
      ctx.fillRect(x, y, barW, barH);

      // Value on top
      ctx.fillStyle = terminalChartTheme.textColor;
      ctx.textAlign = 'center';
      ctx.font = '10px monospace';
      if (val > 0) ctx.fillText(val.toFixed(1), x + barW / 2, y - 4);

      // X label
      const lbl = (labels && labels[i]) || `#${i + 1}`;
      ctx.fillStyle = terminalChartTheme.textColor;
      ctx.textAlign = 'center';
      ctx.font = '10px monospace';
      ctx.fillText(lbl, x + barW / 2, h - pad.bottom + 16);
    });

    // Border
    ctx.strokeStyle = terminalChartTheme.gridColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, chartW, chartH);
  }, [data, labels, title, yLabel, color]);

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────

function InventoryAnalytics() {
  const [summary, setSummary] = useState(null);
  const [yieldData, setYieldData] = useState(null);
  const [contamData, setContamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [yieldPeriod, setYieldPeriod] = useState('30');

  const fetchAll = useCallback(() => {
    setLoading(true);
    Promise.all([
      getInventorySummary().catch(() => null),
      getYieldByFlush({ days: yieldPeriod }).catch(() => null),
      getContaminationRate().catch(() => null),
    ])
      .then(([sum, yld, contam]) => {
        setSummary(sum);
        setYieldData(yld);
        setContamData(contam);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [yieldPeriod]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading) return <Loader text="LOADING ANALYTICS" />;

  const s = summary || {};
  const statusCounts = s.status_counts || {};
  const yieldStats = s.yield_this_month || {};

  // Parse yield by flush data
  const flushYields = yieldData?.flushes || yieldData?.data || [];
  const flushLabels = flushYields.map((f) => f.label || `F${f.flush_number || f.flush}`);
  const flushValues = flushYields.map((f) => f.avg_yield || f.yield || f.value || 0);

  // Contamination data
  const contam = contamData || {};
  const contamRate = contam.rate != null ? contam.rate : contam.contamination_rate;
  const contamTotal = contam.total_contaminated || contam.contaminated || 0;
  const contamTotalJars = contam.total_jars || 0;

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>INVENTORY ANALYTICS</h1>
        <span style={styles.subtitle}>YIELD & PERFORMANCE METRICS</span>
      </div>

      {error && <AlertBanner variant="error" dismissible>{error}</AlertBanner>}

      {/* Summary stats */}
      <div style={styles.statGrid}>
        <StatCard value={s.total_jars || statusCounts.active || 0} label="TOTAL JARS" icon={'\u2B21'} />
        <StatCard
          value={yieldStats.total_grams ? `${yieldStats.total_grams}g` : '0g'}
          label="YIELD THIS MONTH"
          icon={'\u2191'}
        />
        <StatCard
          value={yieldStats.avg_per_jar ? `${yieldStats.avg_per_jar}g` : '0g'}
          label="AVG PER JAR"
        />
        <StatCard
          value={yieldStats.biological_efficiency ? `${yieldStats.biological_efficiency}%` : '--%'}
          label="BIO EFFICIENCY"
        />
        <StatCard
          value={s.total_flushes || 0}
          label="TOTAL FLUSHES"
        />
        <StatCard
          value={s.total_harvests || 0}
          label="TOTAL HARVESTS"
        />
      </div>

      {/* Yield by flush chart */}
      <div style={{ marginTop: 'var(--space-6)' }}>
        <Card
          title="YIELD BY FLUSH NUMBER"
          headerAction={
            <Select
              options={[
                { value: '7', label: '7 DAYS' },
                { value: '30', label: '30 DAYS' },
                { value: '90', label: '90 DAYS' },
                { value: '365', label: '1 YEAR' },
              ]}
              value={yieldPeriod}
              onChange={(e) => setYieldPeriod(e.target.value)}
              style={{ marginBottom: 0, minWidth: '120px' }}
            />
          }
        >
          {flushValues.length > 0 ? (
            <BarChart
              data={flushValues}
              labels={flushLabels}
              title="AVG YIELD PER FLUSH (g)"
              yLabel="GRAMS"
              color={terminalChartTheme.phosphor}
            />
          ) : (
            <div style={styles.emptyChart}>[ NO YIELD DATA FOR SELECTED PERIOD ]</div>
          )}
        </Card>
      </div>

      {/* Contamination rate */}
      <div style={{ marginTop: 'var(--space-6)' }}>
        <Card title="CONTAMINATION RATE">
          <div style={styles.contamGrid}>
            <div style={styles.contamMain}>
              <div style={styles.contamRate}>
                {contamRate != null ? `${(contamRate * 100).toFixed(1)}%` : '--%'}
              </div>
              <div style={styles.contamLabel}>CONTAMINATION RATE</div>
            </div>
            <div style={styles.contamStats}>
              <div style={styles.contamStatRow}>
                <span style={styles.contamStatLabel}>CONTAMINATED</span>
                <span style={styles.contamStatValue}>{contamTotal}</span>
              </div>
              <div style={styles.contamStatRow}>
                <span style={styles.contamStatLabel}>TOTAL JARS</span>
                <span style={styles.contamStatValue}>{contamTotalJars}</span>
              </div>
              {contam.by_type && Object.entries(contam.by_type).length > 0 && (
                <>
                  <div style={{ ...styles.contamStatLabel, marginTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)' }}>
                    BY TYPE
                  </div>
                  {Object.entries(contam.by_type).map(([type, count]) => (
                    <div key={type} style={styles.contamStatRow}>
                      <span style={styles.contamStatLabel}>{type.toUpperCase()}</span>
                      <span style={styles.contamStatValue}>{count}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Visual contamination bar */}
          <div style={styles.contamBar}>
            <div
              style={{
                ...styles.contamBarFill,
                width: `${Math.min(100, (contamRate || 0) * 100)}%`,
              }}
            />
          </div>
          <div style={styles.contamBarLabels}>
            <span>0%</span>
            <span>{contamRate != null ? `${(contamRate * 100).toFixed(1)}%` : '--'}</span>
            <span>100%</span>
          </div>
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 'var(--space-4)',
  },
  emptyChart: {
    textAlign: 'center',
    padding: 'var(--space-12)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-phosphor-ghost)',
  },
  contamGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-6)',
    marginBottom: 'var(--space-4)',
  },
  contamMain: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contamRate: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-3xl)',
    color: 'var(--color-red-alert)',
    textShadow: '0 0 12px rgba(255,49,49,0.5)',
    lineHeight: 1,
  },
  contamLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wide)',
    marginTop: 'var(--space-2)',
  },
  contamStats: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  contamStatRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contamStatLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-ghost)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  contamStatValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-phosphor-primary)',
  },
  contamBar: {
    height: '8px',
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  contamBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, rgba(255,49,49,0.3), rgba(255,49,49,0.8))',
    borderRadius: '4px',
    transition: 'width 0.5s ease',
  },
  contamBarLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    marginTop: 'var(--space-1)',
  },
};

export default InventoryAnalytics;
