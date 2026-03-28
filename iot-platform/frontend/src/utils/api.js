/**
 * API utility for grow tent control operations.
 * All functions use fetch() and return parsed JSON promises.
 */

const BASE = import.meta.env.VITE_API_BASE || '';

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

// ── Hierarchy management ────────────────────────────────────────────────

export function getTree() {
  return request('/api/manage/tree');
}

export function getFacilities() {
  return request('/api/manage/facilities');
}

export function createFacility(data) {
  return request('/api/manage/facilities', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getFacility(id) {
  return request(`/api/manage/facilities/${id}`);
}

export function updateFacility(id, data) {
  return request(`/api/manage/facilities/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteFacility(id) {
  return request(`/api/manage/facilities/${id}`, { method: 'DELETE' });
}

export function getBuildings(facilityId) {
  return request(`/api/manage/buildings?facility_id=${facilityId}`);
}

export function createBuilding(data) {
  return request('/api/manage/buildings', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getBuilding(id) {
  return request(`/api/manage/buildings/${id}`);
}

export function updateBuilding(id, data) {
  return request(`/api/manage/buildings/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteBuilding(id) {
  return request(`/api/manage/buildings/${id}`, { method: 'DELETE' });
}

export function getUnits(buildingId) {
  return request(`/api/manage/units?building_id=${buildingId}`);
}

export function createUnit(data) {
  return request('/api/manage/units', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getUnit(id) {
  return request(`/api/manage/units/${id}`);
}

export function updateUnit(id, data) {
  return request(`/api/manage/units/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteUnit(id) {
  return request(`/api/manage/units/${id}`, { method: 'DELETE' });
}

export function getUnassignedDevices() {
  return request('/api/manage/devices/unassigned');
}

export function assignDevice(deviceId, data) {
  return request(`/api/manage/devices/${deviceId}/assign`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function unassignDevice(deviceId) {
  return request(`/api/manage/devices/${deviceId}/assign`, { method: 'DELETE' });
}

// ── Test Mode ────────────────────────────────────────────────────────────

export function enableTestMode(deviceId) {
  return request(`/api/control/${deviceId}/test_mode/on`, { method: 'POST' });
}

export function disableTestMode(deviceId) {
  return request(`/api/control/${deviceId}/test_mode/off`, { method: 'POST' });
}

// ── Irrigation ───────────────────────────────────────────────────────────

export function getIrrigationZones(deviceId) {
  return request(`/api/irrigation/${deviceId}/zones`);
}

export function updateIrrigationZone(deviceId, zoneIndex, data) {
  return request(`/api/irrigation/${deviceId}/zones/${zoneIndex}`, {
    method: 'PUT', body: JSON.stringify(data),
  });
}

export function openZone(deviceId, zoneIndex, runtime_s) {
  return request(`/api/irrigation/${deviceId}/zones/${zoneIndex}/open`, {
    method: 'POST', body: JSON.stringify({ runtime_s }),
  });
}

export function closeZone(deviceId, zoneIndex) {
  return request(`/api/irrigation/${deviceId}/zones/${zoneIndex}/close`, { method: 'POST' });
}

export function closeAllZones(deviceId) {
  return request(`/api/irrigation/${deviceId}/close_all`, { method: 'POST' });
}

export function runIrrigationProgram(deviceId, zones, runtime_s) {
  return request(`/api/irrigation/${deviceId}/run_program`, {
    method: 'POST', body: JSON.stringify({ zones, runtime_s }),
  });
}

export function getIrrigationSchedules(deviceId) {
  return request(`/api/irrigation/${deviceId}/schedules`);
}

export function updateIrrigationSchedule(deviceId, zoneIndex, data) {
  return request(`/api/irrigation/${deviceId}/schedules/${zoneIndex}`, {
    method: 'PUT', body: JSON.stringify(data),
  });
}

export function getSeasonalConfigs(deviceId) {
  return request(`/api/irrigation/${deviceId}/seasonal`);
}

export function updateSeasonalConfig(deviceId, index, data) {
  return request(`/api/irrigation/${deviceId}/seasonal/${index}`, {
    method: 'PUT', body: JSON.stringify(data),
  });
}

export function deleteSeasonalConfig(deviceId, index) {
  return request(`/api/irrigation/${deviceId}/seasonal/${index}`, { method: 'DELETE' });
}

export function getIrrigationState(deviceId) {
  return request(`/api/irrigation/${deviceId}/state`);
}

export function getZoneEvents(deviceId, params = {}) {
  const q = new URLSearchParams(params).toString();
  return request(`/api/irrigation/${deviceId}/events${q ? '?' + q : ''}`);
}

export function getZoneRuntimeSummary(deviceId) {
  return request(`/api/irrigation/${deviceId}/runtime_summary`);
}

export function pushWeatherData(deviceId, data) {
  return request(`/api/irrigation/${deviceId}/weather`, {
    method: 'POST', body: JSON.stringify(data),
  });
}

export function getWeatherHistory(deviceId) {
  return request(`/api/irrigation/${deviceId}/weather/history`);
}
