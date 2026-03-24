import { useState, useEffect, useRef, useCallback } from 'react';
import { getWaterSummary, getWaterSessions } from '../utils/api';

/**
 * Loads water summary and sessions for a device.
 * Polls every 5s when a session is active (valve open), 60s otherwise.
 *
 * @param {string} deviceId
 * @returns {{
 *   summary: object|null,
 *   sessions: Array,
 *   loading: boolean,
 *   error: string|null,
 *   activeSession: boolean,
 *   refresh: function
 * }}
 */
export default function useWaterData(deviceId) {
  const [summary, setSummary] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSession, setActiveSession] = useState(false);
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(() => {
    if (!deviceId) return Promise.resolve();
    return Promise.all([
      getWaterSummary(deviceId),
      getWaterSessions(deviceId),
    ])
      .then(([summaryData, sessionsData]) => {
        if (!mountedRef.current) return;
        setSummary(summaryData);
        const list = Array.isArray(sessionsData) ? sessionsData : sessionsData.sessions || [];
        setSessions(list);

        // Detect active session: a session with no end_time
        const hasActive = list.some((s) => !s.end_time && !s.ended_at);
        setActiveSession(hasActive);
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
    return fetchData();
  }, [fetchData]);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    if (!deviceId) {
      setSummary(null);
      setSessions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchData();
    return () => { mountedRef.current = false; };
  }, [deviceId, fetchData]);

  // Adaptive polling based on activeSession
  useEffect(() => {
    if (!deviceId) return;
    if (intervalRef.current) clearInterval(intervalRef.current);

    const interval = activeSession ? 5_000 : 60_000;
    intervalRef.current = setInterval(() => {
      fetchData();
    }, interval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [deviceId, activeSession, fetchData]);

  return { summary, sessions, loading, error, activeSession, refresh };
}
