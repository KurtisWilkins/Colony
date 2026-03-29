import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge, Button, Loader, AlertBanner } from '../../components/ui';
import { getInventoryLocations, getJars } from '../../utils/api';

// ── Helpers ──────────────────────────────────────────────────────────────

function statusColor(status) {
  const map = {
    colonizing: 'var(--color-cyan-accent)',
    fruiting: 'var(--color-phosphor-bright)',
    harvesting: 'var(--color-phosphor-primary)',
    resting: 'var(--color-amber)',
    contaminated: 'var(--color-red-alert)',
    available: 'var(--color-phosphor-dim)',
  };
  return map[status] || 'var(--color-phosphor-ghost)';
}

function statusBadge(status) {
  const map = {
    colonizing: 'info', fruiting: 'online', harvesting: 'online',
    resting: 'warning', contaminated: 'offline', available: 'info',
  };
  return <Badge variant={map[status] || 'info'}>{status}</Badge>;
}

// ── Build location tree from flat list ───────────────────────────────────

function buildTree(locations) {
  // Group locations into racks -> shelves -> positions
  const racks = {};
  for (const loc of locations) {
    const rack = loc.rack || loc.rack_name || loc.parent_name || 'DEFAULT';
    const shelf = loc.shelf || loc.shelf_name || loc.name || `POS-${loc.id}`;
    const positions = loc.positions || loc.capacity || 1;

    if (!racks[rack]) racks[rack] = {};
    if (!racks[rack][shelf]) {
      racks[rack][shelf] = {
        id: loc.id,
        name: shelf,
        positions: positions,
        occupants: [],
        location: loc,
      };
    }
  }
  return racks;
}

// ── Position Grid ────────────────────────────────────────────────────────

function PositionGrid({ positions, occupants, onPositionClick }) {
  const posCount = typeof positions === 'number' ? positions : 6;
  const grid = [];

  for (let i = 0; i < posCount; i++) {
    const jar = occupants.find(
      (j) => j.position === i + 1 || j.position === i || j.slot === i + 1
    );
    grid.push(
      <div
        key={i}
        onClick={() => onPositionClick(jar, i + 1)}
        style={{
          ...styles.posCell,
          borderColor: jar ? statusColor(jar.status) : 'var(--color-border)',
          background: jar ? 'rgba(0, 255, 65, 0.03)' : 'var(--color-bg-base)',
          cursor: jar ? 'pointer' : 'default',
          boxShadow: jar ? `0 0 6px ${statusColor(jar.status)}33` : 'none',
        }}
        title={jar ? `${jar.tag_id || jar.nfc_tag} - ${jar.status}` : `EMPTY (POS ${i + 1})`}
      >
        {jar ? (
          <div style={styles.posOccupied}>
            <div style={{ ...styles.posTag, color: statusColor(jar.status) }}>
              {jar.tag_id || jar.nfc_tag || `J${jar.id}`}
            </div>
            <div style={styles.posStatus}>{jar.status?.toUpperCase() || '?'}</div>
          </div>
        ) : (
          <div style={styles.posEmpty}>
            <span style={styles.posEmptyIcon}>{'\u25A1'}</span>
            <span style={styles.posNumber}>{i + 1}</span>
          </div>
        )}
      </div>
    );
  }

  return <div style={styles.posGrid}>{grid}</div>;
}

// ── Main Component ───────────────────────────────────────────────────────

function LocationManager() {
  const navigate = useNavigate();
  const [locations, setLocations] = useState([]);
  const [jars, setJars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedRacks, setExpandedRacks] = useState({});
  const [expandedShelves, setExpandedShelves] = useState({});

  const fetchAll = useCallback(() => {
    setLoading(true);
    Promise.all([
      getInventoryLocations().catch(() => []),
      getJars({ status: 'active', limit: 500 }).catch(() => []),
    ])
      .then(([locData, jarData]) => {
        const locs = Array.isArray(locData) ? locData : locData?.locations || [];
        const jarList = Array.isArray(jarData) ? jarData : jarData?.jars || [];
        setLocations(locs);
        setJars(jarList);
        setError(null);

        // Auto-expand all racks
        const racks = {};
        locs.forEach((l) => {
          const rack = l.rack || l.rack_name || l.parent_name || 'DEFAULT';
          racks[rack] = true;
        });
        setExpandedRacks(racks);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const toggleRack = (rack) => {
    setExpandedRacks((prev) => ({ ...prev, [rack]: !prev[rack] }));
  };

  const toggleShelf = (key) => {
    setExpandedShelves((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePositionClick = (jar) => {
    if (jar) navigate(`/inventory/jars/${jar.id}`);
  };

  if (loading) return <Loader text="LOADING LOCATIONS" />;

  const tree = buildTree(locations);
  const rackNames = Object.keys(tree).sort();

  // Map jars to their locations
  const jarsByLocation = {};
  jars.forEach((j) => {
    const locId = j.location_id || j.location;
    if (locId) {
      if (!jarsByLocation[locId]) jarsByLocation[locId] = [];
      jarsByLocation[locId].push(j);
    }
  });

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>LOCATION MANAGER</h1>
        <span style={styles.subtitle}>
          {locations.length} LOCATIONS | {jars.length} ACTIVE JARS
        </span>
      </div>

      {error && <AlertBanner variant="error" dismissible>{error}</AlertBanner>}

      {/* Legend */}
      <Card style={{ marginBottom: 'var(--space-4)' }}>
        <div style={styles.legend}>
          <span style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: 'var(--color-cyan-accent)' }} /> COLONIZING
          </span>
          <span style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: 'var(--color-phosphor-bright)' }} /> FRUITING
          </span>
          <span style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: 'var(--color-phosphor-primary)' }} /> HARVESTING
          </span>
          <span style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: 'var(--color-amber)' }} /> RESTING
          </span>
          <span style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: 'var(--color-red-alert)' }} /> CONTAMINATED
          </span>
          <span style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: 'var(--color-phosphor-ghost)', border: '1px solid var(--color-border)' }} /> EMPTY
          </span>
        </div>
      </Card>

      {/* Location tree */}
      {rackNames.length === 0 ? (
        <Card>
          <div style={styles.emptyText}>[ NO LOCATIONS CONFIGURED ]</div>
        </Card>
      ) : (
        rackNames.map((rack) => {
          const shelves = tree[rack];
          const shelfNames = Object.keys(shelves).sort();
          const rackJarCount = shelfNames.reduce((sum, s) => {
            const shelfLoc = shelves[s];
            return sum + (jarsByLocation[shelfLoc.id] || []).length;
          }, 0);

          return (
            <Card key={rack} style={{ marginBottom: 'var(--space-3)' }}>
              <div
                onClick={() => toggleRack(rack)}
                style={styles.rackHeader}
              >
                <span style={styles.rackToggle}>
                  {expandedRacks[rack] ? '\u25BC' : '\u25B6'}
                </span>
                <span style={styles.rackName}>{rack}</span>
                <span style={styles.rackCount}>{rackJarCount} jars</span>
              </div>

              {expandedRacks[rack] && (
                <div style={styles.rackContent}>
                  {shelfNames.map((shelfName) => {
                    const shelf = shelves[shelfName];
                    const shelfKey = `${rack}:${shelfName}`;
                    const shelfJars = jarsByLocation[shelf.id] || [];
                    const isExpanded = expandedShelves[shelfKey] !== false; // default expanded

                    return (
                      <div key={shelfKey} style={styles.shelfBlock}>
                        <div
                          onClick={() => toggleShelf(shelfKey)}
                          style={styles.shelfHeader}
                        >
                          <span style={styles.shelfToggle}>
                            {isExpanded ? '\u25BE' : '\u25B8'}
                          </span>
                          <span style={styles.shelfName}>{shelfName}</span>
                          <span style={styles.shelfCount}>
                            {shelfJars.length}/{shelf.positions || '?'} occupied
                          </span>
                        </div>

                        {isExpanded && (
                          <PositionGrid
                            positions={shelf.positions}
                            occupants={shelfJars}
                            onPositionClick={handlePositionClick}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

const styles = {
  header: {
    marginBottom: 'var(--space-6)',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-2xl)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    margin: 0,
    letterSpacing: 'var(--letter-spacing-wider)',
  },
  subtitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-ghost)',
    letterSpacing: 'var(--letter-spacing-wider)',
  },
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-4)',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-dim)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wide)',
  },
  legendDot: {
    display: 'inline-block',
    width: '10px',
    height: '10px',
    borderRadius: '2px',
  },
  rackHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    cursor: 'pointer',
    padding: 'var(--space-2) 0',
  },
  rackToggle: {
    color: 'var(--color-phosphor-dim)',
    fontSize: 'var(--text-sm)',
    width: '16px',
    textAlign: 'center',
  },
  rackName: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-lg)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    letterSpacing: 'var(--letter-spacing-wider)',
    flex: 1,
  },
  rackCount: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-phosphor-ghost)',
  },
  rackContent: {
    marginTop: 'var(--space-2)',
    paddingLeft: 'var(--space-4)',
    borderLeft: '2px solid var(--color-border)',
  },
  shelfBlock: {
    marginBottom: 'var(--space-3)',
  },
  shelfHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    cursor: 'pointer',
    padding: 'var(--space-2) 0',
  },
  shelfToggle: {
    color: 'var(--color-phosphor-ghost)',
    fontSize: 'var(--text-xs)',
    width: '14px',
    textAlign: 'center',
  },
  shelfName: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-phosphor-dim)',
    textTransform: 'uppercase',
    letterSpacing: 'var(--letter-spacing-wide)',
    flex: 1,
  },
  shelfCount: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-phosphor-ghost)',
  },
  posGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) 0',
  },
  posCell: {
    border: '1px solid',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-2)',
    minHeight: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all var(--transition-base)',
  },
  posOccupied: {
    textAlign: 'center',
  },
  posTag: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    letterSpacing: 'var(--letter-spacing-wide)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '90px',
  },
  posStatus: {
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    color: 'var(--color-phosphor-ghost)',
    textTransform: 'uppercase',
    marginTop: '2px',
  },
  posEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  },
  posEmptyIcon: {
    fontSize: 'var(--text-lg)',
    color: 'var(--color-phosphor-ghost)',
    opacity: 0.3,
  },
  posNumber: {
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    color: 'var(--color-phosphor-ghost)',
    opacity: 0.4,
  },
  emptyText: {
    textAlign: 'center',
    padding: 'var(--space-8)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-phosphor-ghost)',
  },
};

export default LocationManager;
