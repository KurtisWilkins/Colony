import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('iot_token'));
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  // Set axios default auth header whenever token changes
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('iot_token', token);
    } else {
      delete axios.defaults.headers.common['Authorization'];
      localStorage.removeItem('iot_token');
    }
  }, [token]);

  // Validate token on mount
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        // Check if setup is needed (no users exist)
        try {
          const res = await axios.get('/api/auth/me');
          // This shouldn't succeed without a token, but just in case
          setUser(res.data);
        } catch {
          // Check if setup is needed by trying /api/auth/setup with GET-like behavior
          // We'll handle this in the login page
        }
        setLoading(false);
        return;
      }

      try {
        const res = await axios.get('/api/auth/me');
        setUser(res.data);
      } catch {
        // Token invalid/expired
        setToken(null);
        setUser(null);
      }
      setLoading(false);
    };

    validateToken();
  }, [token]);

  const login = useCallback(async (username, password) => {
    const res = await axios.post('/api/auth/login', { username, password });
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data;
  }, []);

  const setup = useCallback(async (username, password) => {
    const res = await axios.post('/api/auth/setup', { username, password });
    setToken(res.data.token);
    setUser(res.data.user);
    setNeedsSetup(false);
    return res.data;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = {
    user,
    token,
    loading,
    needsSetup,
    setNeedsSetup,
    login,
    setup,
    logout,
    isAdmin: user?.role === 'admin',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
