import React from 'react';

/**
 * StatusBadge component.
 * Renders a green "Online" or red "Offline" badge based on the is_online prop.
 */
function StatusBadge({ is_online }) {
  return (
    <span className={`status-badge ${is_online ? 'online' : 'offline'}`}>
      {is_online ? 'Online' : 'Offline'}
    </span>
  );
}

export default StatusBadge;
