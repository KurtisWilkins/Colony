/**
 * Terminal-themed Chart.js configuration.
 * Spread into chart options to apply the phosphor terminal aesthetic.
 */
export const terminalChartTheme = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: '#00aa2a',
        font: {
          family: "'Share Tech Mono', 'Courier New', monospace",
          size: 11,
        },
      },
    },
    title: {
      display: false,
    },
    tooltip: {
      backgroundColor: '#0f1a0f',
      borderColor: '#003a10',
      borderWidth: 1,
      titleColor: '#00ff41',
      bodyColor: '#00ff41',
      titleFont: {
        family: "'Share Tech Mono', 'Courier New', monospace",
        size: 12,
      },
      bodyFont: {
        family: "'Share Tech Mono', 'Courier New', monospace",
        size: 11,
      },
      cornerRadius: 2,
      padding: 8,
    },
  },
  scales: {
    x: {
      ticks: {
        color: '#00aa2a',
        font: {
          family: "'Share Tech Mono', 'Courier New', monospace",
          size: 10,
        },
      },
      title: {
        color: '#00aa2a',
        font: {
          family: "'Share Tech Mono', 'Courier New', monospace",
          size: 11,
        },
      },
      grid: {
        color: '#003a10',
        lineWidth: 0.5,
        borderDash: [3, 3],
      },
      border: {
        color: '#003a10',
      },
    },
    y: {
      ticks: {
        color: '#00aa2a',
        font: {
          family: "'Share Tech Mono', 'Courier New', monospace",
          size: 10,
        },
      },
      title: {
        color: '#00aa2a',
        font: {
          family: "'Share Tech Mono', 'Courier New', monospace",
          size: 11,
        },
      },
      grid: {
        color: '#003a10',
        lineWidth: 0.5,
        borderDash: [3, 3],
      },
      border: {
        color: '#003a10',
      },
    },
  },
};

/**
 * Default dataset styling for line charts.
 */
export const terminalLineDataset = {
  borderColor: '#00ff41',
  backgroundColor: 'rgba(0, 255, 65, 0.08)',
  pointBackgroundColor: 'transparent',
  pointBorderColor: 'transparent',
  pointHoverBackgroundColor: '#39ff14',
  pointHoverBorderColor: '#39ff14',
  pointHoverRadius: 5,
  pointRadius: 0,
  tension: 0.3,
  fill: true,
  borderWidth: 1.5,
};

/**
 * Default dataset styling for bar charts.
 */
export const terminalBarDataset = {
  backgroundColor: 'rgba(0, 255, 65, 0.7)',
  hoverBackgroundColor: '#39ff14',
  borderColor: '#00ff41',
  borderWidth: 1,
};
