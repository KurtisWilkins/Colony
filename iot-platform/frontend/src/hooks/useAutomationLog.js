import { useState, useEffect, useRef, useCallback } from 'react';
import { getAutomationEvents } from '../utils/api';

const MAX_EVENTS = 200;

/**
 * Loads automation events for a device and polls every 15s.
 * Caps stored events at 200 in memory.
 *
 * @param {string} deviceId
 * @returns {{ events: Array, loading: boolean, error: string|null }}
 */
export default function useAutomationLog(deviceId) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);

  const fetchEvents = useCallback(() => {
    if (!deviceId) return Promise.resolve();
    return getAutomationEvents(deviceId)
      .then((data) => {
        if (!mountedRef.current) return;
        const list = Array.isArray(data) ? data : data.events || [];
        setEvents(list.slice(0, MAX_EVENTS));
        setError(null);
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
    if (!deviceId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchEvents();

    intervalRef.current = setInterval(() => {
      fetchEvents();
    }, 15_000);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [deviceId, fetchEvents]);

  return { events, loading, error };
}
