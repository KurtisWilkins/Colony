import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Breadcrumb, Card, Loader } from '../components/ui';

function BuildingList() {
  const { facility } = useParams();
  const [buildings, setBuildings] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchBuildings = async () => {
      try {
        const res = await axios.get(`/api/hierarchy/${encodeURIComponent(facility)}`);
        setBuildings(res.data);
      } catch (err) {
        console.error('Failed to fetch buildings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchBuildings();
  }, [facility]);

  if (loading) {
    return <Loader type="spin" text="LOADING BUILDINGS" />;
  }

  const breadcrumbItems = [
    { label: 'Facilities', path: '/devices' },
    { label: facility, path: `/devices/${encodeURIComponent(facility)}` },
  ];

  const buildingsList = buildings?.buildings || [];

  return (
    <div>
      <Breadcrumb items={breadcrumbItems} />

      <div style={styles.header}>
        <h1 style={styles.title}>{facility.toUpperCase()} &mdash; BUILDINGS</h1>
      </div>

      {buildingsList.length === 0 ? (
        <div style={styles.emptyState}>[ NO BUILDINGS FOUND IN THIS FACILITY ]</div>
      ) : (
        <div style={styles.cardGrid}>
          {buildingsList.map((bld) => (
            <Card
              key={bld.name}
              clickable
              onClick={() =>
                navigate(`/devices/${encodeURIComponent(facility)}/${encodeURIComponent(bld.name)}`)
              }
            >
              <h3 style={styles.cardTitle}>{bld.name.toUpperCase()}</h3>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  header: { marginBottom: 'var(--space-6)' },
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

export default BuildingList;
