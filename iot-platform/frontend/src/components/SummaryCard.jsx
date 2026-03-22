import React from 'react';

/**
 * SummaryCard component for the dashboard.
 * Displays a title, large value, and optional subtitle.
 */
function SummaryCard({ title, value, subtitle }) {
  return (
    <div className="summary-card">
      <div className="summary-title">{title}</div>
      <div className="summary-value">{value}</div>
      {subtitle && <div className="summary-subtitle">{subtitle}</div>}
    </div>
  );
}

export default SummaryCard;
