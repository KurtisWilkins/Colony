import { useState, useEffect, useRef, useCallback } from 'react';
import { getDeviceState } from '../utils/api';

/**
 * Polls device state at regular intervals.
 * Polls every 10s when online, 60s when offline.
 *
 * @param {string} deviceId
 * @returns {{ state: object|null, loading: boolean, error: string|null, refresh: function }}
 */
export default function useDeviceState(deviceId) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);

  const fetchState = useCallback(() => {
    if (!deviceId) return Promise.resolve();
    return getDeviceState(deviceId)
      .then((data) => {
        if (!mountedRef.current) return;
        setState(data);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setError(err.message);
        setLoading(false);
      });
  }, [deviceId]);

  const refresh = useCallback(() => {
    setLoading(true);
    return fetchState();
  }, [fetchState]);

  useEffect(() => {
    mountedRef.current = true;
    if (!deviceId) {
      setState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchState();

    function startPolling() {
      if (intervalRef.current) clearInterval(intervalRef.current);

      const isOnline = state?.online !== false;
      const interval = isOnline ? 10_000 : 60_000;

      intervalRef.current = setInterval(() => {
        fetchState();
      }, interval);
    }

    startPolling();

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [deviceId, fetchState]);

  // Adjust polling interval when online status changes
  useEffect(() => {
    if (!deviceId) return;
    if (intervalRef.current) clearInterval(intervalRef.current);

    const isOnline = state?.online !== false;
    const interval = isOnline ? 10_000 : 60_000;

    intervalRef.current = setInterval(() => {
      fetchState();
    }, interval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [deviceId, state?.online, fetchState]);

  return { state, loading, error, refresh };
}
