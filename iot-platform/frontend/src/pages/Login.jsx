import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

function Login() {
  const { login, setup } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);

  // Check if initial setup is needed
  useEffect(() => {
    const checkSetup = async () => {
      try {
        // Try creating a setup with empty data to see if setup is available
        const res = await axios.post('/api/auth/setup', {});
        // If we get a 400 (missing fields), setup is available
        setIsSetupMode(false);
      } catch (err) {
        if (err.response?.status === 400) {
          // Setup endpoint exists and no users yet -- setup mode
          setIsSetupMode(true);
        } else if (err.response?.status === 403) {
          // Users already exist -- normal login
          setIsSetupMode(false);
        }
      }
      setCheckingSetup(false);
    };
    checkSetup();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Username and password are required.');
      return;
    }

    if (isSetupMode) {
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
    }

    setLoading(true);
    try {
      if (isSetupMode) {
        await setup(username, password);
      } else {
        await login(username, password);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Authentication failed. Please try again.');
    }
    setLoading(false);
  };

  if (checkingSetup) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="loading">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Colony IoT</h1>
          <p>{isSetupMode ? 'Create your admin account' : 'Sign in to your account'}</p>
        </div>

        {error && <div className="message message-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete={isSetupMode ? 'new-password' : 'current-password'}
            />
          </div>

          {isSetupMode && (
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
              />
            </div>
          )}

          <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
            {loading ? 'Please wait...' : isSetupMode ? 'Create Admin Account' : 'Sign In'}
          </button>
        </form>

        {isSetupMode && (
          <p className="login-note">
            This is the first-time setup. The account you create will have full admin privileges.
          </p>
        )}
      </div>
    </div>
  );
}

export default Login;
