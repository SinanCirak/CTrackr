import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { HiPlusCircle, HiLocationMarker, HiCalendar, HiBriefcase, HiClipboardList, HiChartBar, HiFilter, HiChevronDown, HiDocument } from 'react-icons/hi';
import { listApplications, updateApplication } from '../utils/api';
import type { JobApplication, ApplicationStatus } from '../types/application';
import './Applications.css';

export default function Applications() {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [openStatusMenu, setOpenStatusMenu] = useState<string | null>(null);

  useEffect(() => {
    loadApplications();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openStatusMenu && !(event.target as Element).closest('.status-container')) {
        setOpenStatusMenu(null);
      }
    };

    if (openStatusMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openStatusMenu]);

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

  const handleStatusChange = async (appId: string, newStatus: ApplicationStatus) => {
    try {
      setUpdatingStatus(appId);
      const updated = await updateApplication(appId, { status: newStatus });
      setApplications(prev => prev.map(app => app.id === appId ? updated : app));
      setOpenStatusMenu(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const statusOptions: ApplicationStatus[] = ['applied', 'interview', 'offer', 'rejected', 'withdrawn', 'accepted'];

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      applied: '#6366F1',
      interview: '#F59E0B',
      offer: '#10B981',
      rejected: '#EF4444',
      withdrawn: '#6B7280',
      accepted: '#10B981',
    };
    return colors[status] || '#6B7280';
  };

  if (loading) {
    return <div className="loading">Loading applications...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="applications">
      <div className="page-hero">
        <div className="hero-icon">
          <HiBriefcase />
        </div>
        <h1>Job Applications</h1>
        <p>Manage and track all your job applications in one place. Stay organized throughout your job search journey.</p>
        <div className="hero-actions">
          <Link to="/applications/new" className="btn btn-primary">
            <HiPlusCircle className="btn-icon" />
            <span>Add New Application</span>
          </Link>
        </div>
      </div>

      <div className="quick-stats">
        <div className="stat-card">
          <div className="stat-icon">
            <HiBriefcase />
          </div>
          <div className="stat-content">
            <div className="stat-value">{applications.length}</div>
            <div className="stat-label">Total Applications</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <HiChartBar />
          </div>
          <div className="stat-content">
            <div className="stat-value">{applications.filter(a => a.status === 'interview').length}</div>
            <div className="stat-label">In Interview</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <HiClipboardList />
          </div>
          <div className="stat-content">
            <div className="stat-value">{applications.filter(a => a.status === 'offer' || a.status === 'accepted').length}</div>
            <div className="stat-label">Offers</div>
          </div>
        </div>
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
            <div key={app.id} className="application-card-wrapper">
              <Link to={`/applications/${app.id}`} className="application-card">
                <div className="card-header">
                  <h3>{app.company}</h3>
                  <div className="status-container">
                    <button
                      className="status-badge status-badge-clickable"
                      style={{ backgroundColor: getStatusColor(app.status) }}
                      onClick={(e) => {
                        e.preventDefault();
                        setOpenStatusMenu(openStatusMenu === app.id ? null : app.id);
                      }}
                      disabled={updatingStatus === app.id}
                    >
                      {updatingStatus === app.id ? '...' : app.status}
                      <HiChevronDown className="status-chevron" />
                    </button>
                    {openStatusMenu === app.id && (
                      <div className="status-dropdown" onClick={(e) => e.stopPropagation()}>
                        {statusOptions.map((status) => (
                          <button
                            key={status}
                            className={`status-option ${app.status === status ? 'active' : ''}`}
                            onClick={(e) => {
                              e.preventDefault();
                              handleStatusChange(app.id, status);
                            }}
                            style={{
                              backgroundColor: app.status === status ? getStatusColor(status) : 'transparent',
                              color: app.status === status ? 'white' : '#334155',
                            }}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <p className="position">{app.position}</p>
                <div className="card-details">
                  <span className="detail-item">
                    <HiCalendar className="detail-icon" />
                    {new Date(app.appliedDate).toLocaleDateString()}
                  </span>
                  {app.location && (
                    <span className="detail-item">
                      <HiLocationMarker className="detail-icon" />
                      {app.location}
                    </span>
                  )}
                  <span className="detail-item">
                    <HiDocument className="detail-icon" />
                    {app.cvUrl && app.coverLetterUrl 
                      ? 'CV, Cover Letter'
                      : app.cvUrl 
                        ? 'CV'
                        : app.coverLetterUrl
                          ? 'Cover Letter'
                          : 'No documents'}
                  </span>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

