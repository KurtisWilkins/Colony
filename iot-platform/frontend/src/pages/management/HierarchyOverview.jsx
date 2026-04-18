import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Badge, Loader, AlertBanner } from '../../components/ui';
import { getTree } from '../../utils/api';

function timeAgo(isoString) {
  if (!isoString) return 'never';
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function HierarchyOverview() {
  const navigate = useNavigate();
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const fetchTree = useCallback(async () => {
    try {
      const data = await getTree();
      setTree(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTree();
    const interval = setInterval(fetchTree, 60000);
    return () => clearInterval(interval);
  }, [fetchTree]);

  // Refresh time-ago every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const toggle = (key) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) return <Loader type="spin" text="LOADING HIERARCHY" />;

  const totalDevices = tree.reduce((sum, f) =>
    sum + f.buildings.reduce((bs, b) =>
      bs + b.units.reduce((us, u) => us + u.devices.length, 0), 0), 0);

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-phosphor-ghost)', marginBottom: 'var(--space-4)', lineHeight: 'var(--leading-relaxed)' }}>
        {'📋'} The hierarchy tree shows your complete facility structure: Facility → Building → Unit → Device. Create and manage these in the FACILITIES, BUILDINGS, and UNITS pages under System Management.
      </div>
      <Card
        title="SYSTEM HIERARCHY"
        headerAction={
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Badge variant="info">{tree.length} FACILITIES</Badge>
            <Badge variant="info">{totalDevices} DEVICES</Badge>
            <Button variant="secondary" size="sm" onClick={fetchTree}>REFRESH</Button>
          </div>
        }
      >
        {error && <AlertBanner variant="error" dismissible>{error}</AlertBanner>}

        {tree.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyText}>[ NO FACILITIES CONFIGURED ]</div>
            <Button variant="primary" size="sm" onClick={() => navigate('/manage/facilities')}>
              + ADD FACILITY
            </Button>
          </div>
        ) : (
          <div style={styles.tree}>
            {tree.map((f) => {
              const fKey = f.facility.id;
              const fCollapsed = collapsed[fKey];
              const fDevices = f.buildings.reduce((bs, b) =>
                bs + b.units.reduce((us, u) => us + u.devices.length, 0), 0);

              return (
                <div key={fKey} style={styles.node}>
                  <div style={styles.facilityRow}>
                    <span style={styles.toggle} onClick={() => toggle(fKey)}>
                      {fCollapsed ? '\u25B6' : '\u25BC'}
                    </span>
                    <span
                      style={styles.facilityName}
                      onClick={() => navigate(`/manage/facilities?selected=${fKey}`)}
                    >
                      {f.facility.name.toUpperCase()}
                    </span>
                    <span style={styles.count}>
                      {f.buildings.length} building{f.buildings.length !== 1 ? 's' : ''} / {fDevices} device{fDevices !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {!fCollapsed && (
                    <div style={styles.children}>
                      {f.buildings.length === 0 ? (
                        <div style={styles.emptyChild}>
                          <span style={styles.emptyLabel}>[ NO BUILDINGS CONFIGURED ]</span>
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/manage/buildings?facility=${fKey}`)}>
                            + ADD BUILDING
                          </Button>
                        </div>
                      ) : (
                        f.buildings.map((b) => {
                          const bKey = b.building.id;
                          const bCollapsed = collapsed[bKey];
                          const bDevices = b.units.reduce((us, u) => us + u.devices.length, 0);

                          return (
                            <div key={bKey} style={styles.node}>
                              <div style={styles.buildingRow}>
                                <span style={styles.toggle} onClick={() => toggle(bKey)}>
                                  {bCollapsed ? '\u25B6' : '\u25BC'}
                                </span>
                                <span
                                  style={styles.buildingName}
                                  onClick={() => navigate(`/manage/buildings?facility=${f.facility.id}&selected=${bKey}`)}
                                >
                                  {b.building.name.toUpperCase()}
                                </span>
                                <span style={styles.count}>
                                  {b.units.length} unit{b.units.length !== 1 ? 's' : ''} / {bDevices} device{bDevices !== 1 ? 's' : ''}
                                </span>
                              </div>

                              {!bCollapsed && (
                                <div style={styles.children}>
                                  {b.units.length === 0 ? (
                                    <div style={styles.emptyChild}>
                                      <span style={styles.emptyLabel}>[ NO UNITS CONFIGURED ]</span>
                                      <Button variant="ghost" size="sm" onClick={() => navigate(`/manage/units?building=${bKey}`)}>
                                        + ADD UNIT
                                      </Button>
                                    </div>
                                  ) : (
                                    b.units.map((u) => {
                                      const uKey = u.unit.id;
                                      const uCollapsed = collapsed[uKey];

                                      return (
                                        <div key={uKey} style={styles.node}>
                                          <div style={styles.unitRow}>
                                            <span style={styles.toggle} onClick={() => toggle(uKey)}>
                                              {uCollapsed ? '\u25B6' : '\u25BC'}
                                            </span>
                                            <span
                                              style={styles.unitName}
                                              onClick={() => navigate(`/manage/units?building=${bKey}&selected=${uKey}`)}
                                            >
                                              {u.unit.name.toUpperCase()}
                                            </span>
                                            <Badge variant="info">{u.unit.unit_type.toUpperCase().replace('_', ' ')}</Badge>
                                            <span style={styles.count}>
                                              {u.devices.length} device{u.devices.length !== 1 ? 's' : ''}
                                            </span>
                                          </div>

                                          {!uCollapsed && (
                                            <div style={styles.children}>
                                              {u.devices.length === 0 ? (
                                                <div style={styles.emptyChild}>
                                                  <span style={styles.emptyLabel}>[ NO DEVICES ASSIGNED ]</span>
                                                </div>
                                              ) : (
                                                u.devices.map((d) => (
                                                  <div
                                                    key={d.id}
                                                    style={styles.deviceRow}
                                                    onClick={() => navigate(`/devices/${d.id}/control`)}
                                                  >
                                                    <span style={{
                                                      color: d.is_online ? 'var(--color-phosphor-primary)' : 'var(--color-red-alert)',
                                                      fontSize: '0.6rem',
                                                    }}>
                                                      {d.is_online ? '\u25CF' : '\u25CB'}
                                                    </span>
                                                    <span style={{
                                                      ...styles.deviceName,
                                                      color: d.is_online ? 'var(--color-phosphor-primary)' : 'var(--color-red-alert)',
                                                    }}>
                                                      {d.device_name}
                                                    </span>
                                                    <Badge variant={d.is_online ? 'online' : 'offline'} />
                                                    <span style={styles.lastSeen}>
                                                      last: {timeAgo(d.last_seen)}
                                                    </span>
                                                  </div>
                                                ))
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

const styles = {
  tree: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
  },
  node: {
    marginBottom: 'var(--space-1)',
  },
  facilityRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) 0',
    borderBottom: '1px solid var(--color-border)',
  },
  facilityName: {
    color: 'var(--color-phosphor-bright)',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-base)',
    letterSpacing: 'var(--letter-spacing-wider)',
    cursor: 'pointer',
    textShadow: 'var(--glow-text)',
  },
  buildingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-1) 0',
  },
  buildingName: {
    color: 'var(--color-phosphor-primary)',
    cursor: 'pointer',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  unitRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-1) 0',
  },
  unitName: {
    color: 'var(--color-phosphor-dim)',
    cursor: 'pointer',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  deviceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-1) 0',
    cursor: 'pointer',
    transition: 'background var(--transition-fast)',
  },
  deviceName: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
  },
  lastSeen: {
    color: 'var(--color-phosphor-ghost)',
    fontSize: 'var(--text-xs)',
    marginLeft: 'auto',
  },
  toggle: {
    cursor: 'pointer',
    color: 'var(--color-phosphor-dim)',
    fontSize: 'var(--text-xs)',
    userSelect: 'none',
    width: '14px',
    textAlign: 'center',
  },
  count: {
    color: 'var(--color-phosphor-ghost)',
    fontSize: 'var(--text-xs)',
    marginLeft: 'auto',
  },
  children: {
    paddingLeft: 'var(--space-6)',
    borderLeft: '1px solid var(--color-border)',
    marginLeft: '6px',
  },
  empty: {
    textAlign: 'center',
    padding: 'var(--space-8)',
  },
  emptyText: {
    color: 'var(--color-phosphor-ghost)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    marginBottom: 'var(--space-4)',
  },
  emptyChild: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-1) 0',
  },
  emptyLabel: {
    color: 'var(--color-phosphor-ghost)',
    fontSize: 'var(--text-xs)',
  },
};

export default HierarchyOverview;
