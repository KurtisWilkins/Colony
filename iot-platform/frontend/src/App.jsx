import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

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

function App() {
  const { user, loading, logout, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="loading">Loading...</div>
        </div>
      </div>
    );
  }

  // Not authenticated -- show login
  if (!user) {
    return <Login />;
  }

  return (
    <div className="app-layout">
      {/* Sidebar navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Colony IoT</h2>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Dashboard
          </NavLink>
          <NavLink to="/devices" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Devices
          </NavLink>
          <NavLink to="/register" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Register
          </NavLink>
          {isAdmin && (
            <NavLink to="/users" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Users
            </NavLink>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">{user.username}</div>
          <button className="btn btn-sm btn-secondary sidebar-logout" onClick={logout}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="mobile-header">
        <h2>Colony IoT</h2>
        <div className="mobile-user">
          <span>{user.username}</span>
          <button className="btn btn-sm btn-secondary" onClick={logout}>Sign Out</button>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="mobile-nav">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'mobile-nav-item active' : 'mobile-nav-item'}>
          Home
        </NavLink>
        <NavLink to="/devices" className={({ isActive }) => isActive ? 'mobile-nav-item active' : 'mobile-nav-item'}>
          Devices
        </NavLink>
        <NavLink to="/register" className={({ isActive }) => isActive ? 'mobile-nav-item active' : 'mobile-nav-item'}>
          Register
        </NavLink>
        {isAdmin && (
          <NavLink to="/users" className={({ isActive }) => isActive ? 'mobile-nav-item active' : 'mobile-nav-item'}>
            Users
          </NavLink>
        )}
      </nav>

      {/* Main content area */}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/devices" element={<HierarchyView />} />
          <Route path="/devices/:facility" element={<BuildingList />} />
          <Route path="/devices/:facility/:building" element={<UnitList />} />
          <Route path="/devices/:facility/:building/:unit" element={<DeviceList />} />
          <Route path="/device/:deviceId" element={<DeviceDetail />} />
          <Route path="/register" element={<RegisterDevice />} />
          {isAdmin && <Route path="/users" element={<UserManagement />} />}
        </Routes>
      </main>
    </div>
  );
}

export default App;
