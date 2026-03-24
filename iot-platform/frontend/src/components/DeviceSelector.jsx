import React, { useState, useEffect } from 'react';
import { getDevices } from '../utils/api';

/**
 * Terminal-styled device selector dropdown.
 * Fetches all registered devices and renders a select with
 * FACILITY > BUILDING > UNIT > DEVICE_NAME labels.
 *
 * @param {object} props
 * @param {string}        props.value    - Currently selected device ID
 * @param {function}      props.onSelect - Callback with selected device ID
 */
function DeviceSelector({ value, onSelect }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDevices()
      .then((data) => {
        if (!cancelled) {
          setDevices(Array.isArray(data) ? data : data.devices || []);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function formatLabel(d) {
    const parts = [d.facility, d.building, d.unit, d.device_name || d.name].filter(Boolean);
    return parts.join(' > ');
  }

  function handleChange(e) {
    if (onSelect) onSelect(e.target.value);
  }

  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <label
        style={{
          display: 'block',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-phosphor-dim)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--letter-spacing-wide)',
          marginBottom: 'var(--space-1)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        Device
      </label>

      <div style={{ position: 'relative' }}>
        <select
          value={value || ''}
          onChange={handleChange}
          disabled={loading}
          style={{
            width: '100%',
            padding: 'var(--space-2) var(--space-8) var(--space-2) var(--space-3)',
            background: 'var(--color-bg-input, var(--color-bg-surface))',
            border: `1px solid ${error ? 'var(--color-red-alert)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-phosphor-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-base)',
            appearance: 'none',
            WebkitAppearance: 'none',
            cursor: loading ? 'wait' : 'pointer',
            outline: 'none',
            transition: 'border-color 200ms ease, box-shadow 200ms ease',
            opacity: loading ? 0.6 : 1,
          }}
          onFocus={(e) => {
            e.target.style.borderColor = 'var(--color-border-focus, var(--color-phosphor-dim))';
            e.target.style.boxShadow = 'var(--glow-sm)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = error ? 'var(--color-red-alert)' : 'var(--color-border)';
            e.target.style.boxShadow = 'none';
          }}
        >
          <option value="" style={{ background: 'var(--color-bg-elevated, #111)', color: 'var(--color-phosphor-dim)' }}>
            {loading ? '[ LOADING... ]' : '[ SELECT DEVICE ]'}
          </option>
          {devices.map((d) => {
            const id = d.device_id || d.id;
            const online = d.online !== undefined ? d.online : d.status === 'online';
            return (
              <option
                key={id}
                value={id}
                style={{
                  background: 'var(--color-bg-elevated, #111)',
                  color: online ? 'var(--color-phosphor-primary)' : 'var(--color-red-alert)',
                }}
              >
                {formatLabel(d)} {online ? '[ON]' : '[OFF]'}
              </option>
            );
          })}
        </select>

        {/* Dropdown arrow */}
        <span
          style={{
            position: 'absolute',
            right: 'var(--space-3)',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-phosphor-dim)',
            pointerEvents: 'none',
            fontSize: 'var(--text-sm)',
          }}
        >
          &#9660;
        </span>
      </div>

      {error && (
        <div
          style={{
            marginTop: 'var(--space-1)',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-red-alert)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          ERR: {error}
        </div>
      )}
    </div>
  );
}

export default DeviceSelector;
