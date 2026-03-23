import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Breadcrumb, Card, Loader } from '../components/ui';

function UnitList() {
  const { facility, building } = useParams();
  const [units, setUnits] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUnits = async () => {
      try {
        const res = await axios.get(
          `/api/hierarchy/${encodeURIComponent(facility)}/${encodeURIComponent(building)}`
        );
        setUnits(res.data);
      } catch (err) {
        console.error('Failed to fetch units:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchUnits();
  }, [facility, building]);

  if (loading) {
    return <Loader type="spin" text="LOADING UNITS" />;
  }

  const breadcrumbItems = [
    { label: 'Facilities', path: '/devices' },
    { label: facility, path: `/devices/${encodeURIComponent(facility)}` },
    { label: building, path: `/devices/${encodeURIComponent(facility)}/${encodeURIComponent(building)}` },
  ];

  const unitsList = units?.units || [];

  return (
    <div>
      <Breadcrumb items={breadcrumbItems} />

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={styles.title}>{building.toUpperCase()} &mdash; UNITS</h1>
      </div>

      {unitsList.length === 0 ? (
        <div style={styles.emptyState}>[ NO UNITS FOUND IN THIS BUILDING ]</div>
      ) : (
        <div style={styles.cardGrid}>
          {unitsList.map((u) => (
            <Card
              key={u.name}
              clickable
              onClick={() =>
                navigate(
                  `/devices/${encodeURIComponent(facility)}/${encodeURIComponent(building)}/${encodeURIComponent(u.name)}`
                )
              }
            >
              <h3 style={styles.cardTitle}>{u.name.toUpperCase()}</h3>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-2xl)',
    color: 'var(--color-phosphor-primary)',
    textShadow: 'var(--glow-text)',
    letterSpacing: 'var(--letter-spacing-wider)',
    margin: 0,
    fontWeight: 'normal',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 'var(--space-4)',
  },
  cardTitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-md)',
    color: 'var(--color-phosphor-primary)',
    margin: 0,
    fontWeight: 'normal',
  },
  emptyState: {
    textAlign: 'center',
    padding: 'var(--space-8)',
    color: 'var(--color-text-muted)',
    fontFamily: 'var(--font-mono)',
  },
};

export default UnitList;
