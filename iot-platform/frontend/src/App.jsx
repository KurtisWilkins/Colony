import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Loader, Badge } from './components/ui';

// Page imports
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import HierarchyView from './pages/HierarchyView';
import BuildingList from './pages/BuildingList';
import UnitList from './pages/UnitList';
import DeviceList from './pages/DeviceList';
import DeviceDetail from './pages/DeviceDetail';
import RegisterDevice from './pages/RegisterDevice';
import UserManagement from './pages/UserManagement';
import ControlDashboard from './pages/ControlDashboard';

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', color: 'var(--color-phosphor-dim)' }}>
      {time.toLocaleTimeString('en-US', { hour12: false })}
    </span>
  );
}

function App() {
  const { user, loading, logout, isAdmin } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  if (loading) {
    return <Loader type="spin" text="BOOTING SYSTEM" fullscreen />;
  }

  if (!user) {
    return <Login />;
  }

  const navItems = [
    { to: '/', label: 'DASHBOARD', end: true },
    { to: '/devices', label: 'DEVICES' },
    { to: '/register', label: 'REGISTER' },
    ...(isAdmin ? [{ to: '/users', label: 'USERS' }] : []),
  ];

  return (
    <div style={styles.layout}>
      {/* Desktop Sidebar */}
      <aside style={styles.sidebar} className="desktop-sidebar">
        <div style={styles.sidebarHeader}>
          <div style={styles.logoText} className="glow-text">COLONY</div>
          <div style={styles.logoSub}>IOT PLATFORM</div>
        </div>
        <nav style={styles.sidebarNav}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {}),
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={styles.sidebarFooter}>
          <div style={styles.sidebarUser}>
            <span style={{ color: 'var(--color-phosphor-ghost)', fontSize: 'var(--text-xs)' }}>USER:</span>{' '}
            {user.username.toUpperCase()}
          </div>
          <button onClick={logout} style={styles.logoutBtn}>
            SIGN OUT
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header style={styles.mobileHeader} className="mobile-header">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={styles.hamburger}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? '\u2715' : '\u2261'}
        </button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', color: 'var(--color-phosphor-primary)', textShadow: 'var(--glow-text)' }}>
          COLONY
        </span>
        <button onClick={logout} style={styles.mobileLogout}>OUT</button>
      </header>

      {/* Mobile slide-out menu */}
      {mobileMenuOpen && (
        <div
          style={styles.mobileOverlay}
          onClick={() => setMobileMenuOpen(false)}
        >
          <nav
            style={styles.mobileMenu}
            onClick={(e) => e.stopPropagation()}
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                style={({ isActive }) => ({
                  ...styles.mobileNavLink,
                  ...(isActive ? styles.navLinkActive : {}),
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      {/* Main content area */}
      <div style={styles.mainWrapper}>
        {/* Top Bar */}
        <div style={styles.topBar} className="desktop-topbar">
          <div />
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <Clock />
          </div>
        </div>

        <main style={styles.mainContent}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/devices" element={<HierarchyView />} />
            <Route path="/devices/:facility" element={<BuildingList />} />
            <Route path="/devices/:facility/:building" element={<UnitList />} />
            <Route path="/devices/:facility/:building/:unit" element={<DeviceList />} />
            <Route path="/device/:deviceId" element={<DeviceDetail />} />
            <Route path="/devices/:deviceId/control" element={<ControlDashboard />} />
            <Route path="/register" element={<RegisterDevice />} />
            {isAdmin && <Route path="/users" element={<UserManagement />} />}
          </Routes>
        </main>
      </div>
    </div>
  );
}

const styles = {
  layout: {
    display: 'flex',
    minHeight: '100vh',
    background: 'var(--color-bg-base)',
  },
  /* Sidebar */
  sidebar: {
    width: '220px',
    minWidth: '220px',
    background: 'var(--color-bg-surface)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    zIndex: 100,
  },
  sidebarHeader: {
    padding: 'var(--space-6) var(--space-4) var(--space-4)',
    borderBottom: '1px solid var(--color-border)',
  },
  logoText: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-2xl)',
    color: 'var(--color-phosphor-primary)',
    letterSpacing: 'var(--letter-spacing-wider)',
    lineHeight: 1,
  },
  logoSub: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
    letterSpacing: 'var(--letter-spacing-wider)',
    marginTop: 'var(--space-1)',
  },
  sidebarNav: {
    display: 'flex',
    flexDirection: 'column',
    padding: 'var(--space-3) 0',
    flex: 1,
  },
  navLink: {
    display: 'block',
    padding: 'var(--space-3) var(--space-4)',
    color: 'var(--color-phosphor-dim)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    textDecoration: 'none',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wider)',
    borderLeft: '3px solid transparent',
    transition: 'all var(--transition-base)',
  },
  navLinkActive: {
    color: 'var(--color-phosphor-primary)',
    borderLeftColor: 'var(--color-phosphor-primary)',
    background: 'var(--color-phosphor-glow)',
    textShadow: 'var(--glow-text)',
  },
  sidebarFooter: {
    padding: 'var(--space-3) var(--space-4)',
    borderTop: '1px solid var(--color-border)',
  },
  sidebarUser: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-dim)',
    marginBottom: 'var(--space-2)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  logoutBtn: {
    width: '100%',
    padding: 'var(--space-1) var(--space-3)',
    background: 'transparent',
    border: '1px solid var(--color-phosphor-ghost)',
    color: 'var(--color-phosphor-ghost)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wider)',
    cursor: 'pointer',
    transition: 'all var(--transition-base)',
  },
  /* Top Bar */
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-2) var(--space-6)',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-bg-surface)',
    minHeight: '40px',
  },
  /* Main */
  mainWrapper: {
    flex: 1,
    marginLeft: '220px',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
  },
  mainContent: {
    flex: 1,
    padding: 'var(--space-6)',
    background: 'var(--color-bg-base)',
  },
  /* Mobile */
  mobileHeader: {
    display: 'none',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 200,
    background: 'var(--color-bg-surface)',
    borderBottom: '1px solid var(--color-border)',
    padding: 'var(--space-3) var(--space-4)',
  },
  hamburger: {
    background: 'none',
    border: 'none',
    color: 'var(--color-phosphor-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xl)',
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
  },
  mobileLogout: {
    background: 'none',
    border: '1px solid var(--color-phosphor-ghost)',
    color: 'var(--color-phosphor-ghost)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    padding: '2px var(--space-2)',
    cursor: 'pointer',
    textTransform: 'uppercase',
  },
  mobileOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,5,0,0.85)',
    zIndex: 150,
    display: 'flex',
  },
  mobileMenu: {
    width: '220px',
    background: 'var(--color-bg-surface)',
    borderRight: '1px solid var(--color-border)',
    paddingTop: '60px',
    display: 'flex',
    flexDirection: 'column',
  },
  mobileNavLink: {
    display: 'block',
    padding: 'var(--space-4) var(--space-4)',
    color: 'var(--color-phosphor-dim)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-base)',
    textDecoration: 'none',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wider)',
    borderLeft: '3px solid transparent',
  },
};

export default App;
