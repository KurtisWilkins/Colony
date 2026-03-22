import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';

// Page imports
import Dashboard from './pages/Dashboard';
import HierarchyView from './pages/HierarchyView';
import BuildingList from './pages/BuildingList';
import UnitList from './pages/UnitList';
import DeviceList from './pages/DeviceList';
import DeviceDetail from './pages/DeviceDetail';
import RegisterDevice from './pages/RegisterDevice';

function App() {
  return (
    <div className="app-layout">
      {/* Sidebar navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>IoT Platform</h2>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Dashboard
          </NavLink>
          <NavLink to="/devices" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Devices
          </NavLink>
          <NavLink to="/register" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Register Device
          </NavLink>
        </nav>
      </aside>

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
        </Routes>
      </main>
    </div>
  );
}

export default App;
