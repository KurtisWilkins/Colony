/**
 * API utility for grow tent control operations.
 * All functions use fetch() and return parsed JSON promises.
 */

const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';

function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  };
  return fetch(url, config).then((r) => {
    if (!r.ok) {
      return r.json().catch(() => ({})).then((body) => {
        const err = new Error(body.error || body.message || `Request failed: ${r.status}`);
        err.status = r.status;
        err.body = body;
        throw err;
      });
    }
    return r.json();
  });
}

// ── Device state & thresholds ──────────────────────────────────────────

export function getDeviceState(deviceId) {
  return request(`/api/control/${deviceId}/state`);
}

export function getThresholds(deviceId) {
  return request(`/api/control/${deviceId}/thresholds`);
}

export function updateThresholds(deviceId, data) {
  return request(`/api/control/${deviceId}/thresholds`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function resetThresholds(deviceId) {
  return request(`/api/control/${deviceId}/thresholds/reset`, {
    method: 'POST',
  });
}

// ── Fan commands ────────────────────────────────────────────────────────

export function sendFanOn(deviceId) {
  return request(`/api/control/${deviceId}/fan/on`, { method: 'POST' });
}

export function sendFanOff(deviceId) {
  return request(`/api/control/${deviceId}/fan/off`, { method: 'POST' });
}

export function sendFanSpeed(deviceId, speed_pct) {
  return request(`/api/control/${deviceId}/fan/speed`, {
    method: 'POST',
    body: JSON.stringify({ speed_pct }),
  });
}

// ── Mister commands ─────────────────────────────────────────────────────

export function sendMisterOn(deviceId) {
  return request(`/api/control/${deviceId}/mister/on`, { method: 'POST' });
}

export function sendMisterOff(deviceId) {
  return request(`/api/control/${deviceId}/mister/off`, { method: 'POST' });
}

// ── Valve / fill commands ───────────────────────────────────────────────

export function sendValveOpen(deviceId) {
  return request(`/api/control/${deviceId}/valve/open`, { method: 'POST' });
}

export function sendValveClose(deviceId) {
  return request(`/api/control/${deviceId}/valve/close`, { method: 'POST' });
}

export function sendFillStart(deviceId) {
  return request(`/api/control/${deviceId}/fill/start`, { method: 'POST' });
}

export function sendFillStop(deviceId) {
  return request(`/api/control/${deviceId}/fill/stop`, { method: 'POST' });
}

// ── Sensor commands ─────────────────────────────────────────────────────

export function sendReadNow(deviceId) {
  return request(`/api/control/${deviceId}/read`, { method: 'POST' });
}

// ── Telemetry & water ───────────────────────────────────────────────────

export function getTelemetry(deviceId, hours = 24) {
  return request(`/api/telemetry/${deviceId}?hours=${hours}`);
}

export function getWaterSessions(deviceId, limit = 50) {
  return request(`/api/water/${deviceId}/sessions?limit=${limit}`);
}

export function getWaterSummary(deviceId) {
  return request(`/api/water/${deviceId}/summary`);
}

export function getWaterSummaryAll() {
  return request('/api/water/summary');
}

// ── Automation & alerts ─────────────────────────────────────────────────

export function getAutomationEvents(deviceId, limit = 100) {
  return request(`/api/automation/${deviceId}/events?limit=${limit}`);
}

export function getActiveAlerts(deviceId) {
  return request(`/api/alerts/${deviceId}/active`);
}

// ── Devices ─────────────────────────────────────────────────────────────

export function getDevices() {
  return request('/api/devices');
}
