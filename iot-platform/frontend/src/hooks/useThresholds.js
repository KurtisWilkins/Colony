import { useState, useEffect, useRef, useCallback } from 'react';
import { getThresholds, updateThresholds, resetThresholds } from '../utils/api';

/**
 * Loads and manages thresholds for a device.
 * Tracks dirty state for unsaved changes.
 *
 * @param {string} deviceId
 * @returns {{
 *   thresholds: object|null,
 *   loading: boolean,
 *   error: string|null,
 *   save: function,
 *   reset: function,
 *   reload: function,
 *   dirty: boolean,
 *   setField: function
 * }}
 */
export default function useThresholds(deviceId) {
  const [thresholds, setThresholds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const originalRef = useRef(null);
  const mountedRef = useRef(true);

  const load = useCallback(() => {
    if (!deviceId) return Promise.resolve();
    setLoading(true);
    setError(null);
    return getThresholds(deviceId)
      .then((data) => {
        if (!mountedRef.current) return;
        setThresholds(data);
        originalRef.current = JSON.parse(JSON.stringify(data));
        setDirty(false);
        setLoading(false);
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setError(err.message);
        setLoading(false);
      });
  }, [deviceId]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  const setField = useCallback((key, value) => {
    setThresholds((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      const isDirty = JSON.stringify(next) !== JSON.stringify(originalRef.current);
      setDirty(isDirty);
      return next;
    });
  }, []);

  const save = useCallback(() => {
    if (!deviceId || !thresholds) return Promise.reject(new Error('No data'));
    setError(null);

    // Basic validation: numeric fields should be numbers
    const numericKeys = Object.keys(thresholds).filter(
      (k) => typeof originalRef.current?.[k] === 'number'
    );
    for (const key of numericKeys) {
      const val = Number(thresholds[key]);
      if (isNaN(val)) {
        const msg = `Invalid value for ${key}`;
        setError(msg);
        return Promise.reject(new Error(msg));
      }
    }

    setLoading(true);
    return updateThresholds(deviceId, thresholds)
      .then((data) => {
        if (!mountedRef.current) return;
        const updated = data.thresholds || data;
        setThresholds(updated);
        originalRef.current = JSON.parse(JSON.stringify(updated));
        setDirty(false);
        setLoading(false);
        return updated;
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setError(err.message);
        setLoading(false);
        throw err;
      });
  }, [deviceId, thresholds]);

  const reset = useCallback(() => {
    if (!deviceId) return Promise.resolve();
    setLoading(true);
    setError(null);
    return resetThresholds(deviceId)
      .then((data) => {
        if (!mountedRef.current) return;
        const defaults = data.thresholds || data;
        setThresholds(defaults);
        originalRef.current = JSON.parse(JSON.stringify(defaults));
        setDirty(false);
        setLoading(false);
        return defaults;
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setError(err.message);
        setLoading(false);
        throw err;
      });
  }, [deviceId]);

  return { thresholds, loading, error, save, reset, reload: load, dirty, setField };
}
