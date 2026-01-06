import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { listApplications } from '../utils/api';
import type { JobApplication } from '../types/application';
import './Applications.css';

export default function Applications() {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadApplications();
  }, []);

  async function loadApplications() {
    try {
      setLoading(true);
      const data = await listApplications();
      setApplications(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  }

  const filteredApplications = filter === 'all' 
    ? applications 
    : applications.filter(app => app.status === filter);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      applied: '#646cff',
      interview: '#ffa500',
      offer: '#00ff00',
      rejected: '#ff4444',
      withdrawn: '#888',
      accepted: '#00cc00',
    };
    return colors[status] || '#888';
  };

  if (loading) {
    return <div className="loading">Loading applications...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="applications">
      <div className="applications-header">
        <h1>Job Applications</h1>
        <Link to="/applications/new" className="btn btn-primary">
          Add New Application
        </Link>
      </div>

      <div className="filter-bar">
        <button 
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All ({applications.length})
        </button>
        <button 
          className={filter === 'applied' ? 'active' : ''}
          onClick={() => setFilter('applied')}
        >
          Applied
        </button>
        <button 
          className={filter === 'interview' ? 'active' : ''}
          onClick={() => setFilter('interview')}
        >
          Interview
        </button>
        <button 
          className={filter === 'offer' ? 'active' : ''}
          onClick={() => setFilter('offer')}
        >
          Offer
        </button>
        <button 
          className={filter === 'rejected' ? 'active' : ''}
          onClick={() => setFilter('rejected')}
        >
          Rejected
        </button>
      </div>

      {filteredApplications.length === 0 ? (
        <div className="empty-state">
          <p>No applications found.</p>
          <Link to="/applications/new" className="btn btn-primary">
            Add Your First Application
          </Link>
        </div>
      ) : (
        <div className="applications-grid">
          {filteredApplications.map((app) => (
            <Link key={app.id} to={`/applications/${app.id}`} className="application-card">
              <div className="card-header">
                <h3>{app.company}</h3>
                <span 
                  className="status-badge"
                  style={{ backgroundColor: getStatusColor(app.status) }}
                >
                  {app.status}
                </span>
              </div>
              <p className="position">{app.position}</p>
              <div className="card-details">
                <span>Applied: {new Date(app.appliedDate).toLocaleDateString()}</span>
                {app.location && <span>📍 {app.location}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

