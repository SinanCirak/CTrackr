import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { HiPlusCircle, HiLocationMarker, HiCalendar, HiBriefcase, HiChevronDown, HiDocument, HiDownload } from 'react-icons/hi';
import { useAuth } from '../contexts/AuthContext';
import { listApplications, updateApplication } from '../utils/api';
import { dateOnlyToBoundaryMs, formatDateOnlyForDisplay } from '../utils/date';
import type { JobApplication, ApplicationStatus } from '../types/application';
import './Applications.css';

export default function Applications() {
  const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
  const isActiveApplication = (status: ApplicationStatus) => ['applied', 'interview', 'offer'].includes(status);
  const REJECTED_FOLLOW_UP_NOTE = 'Follow-up completed because application was rejected.';
  const { user } = useAuth();
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [staleCache, setStaleCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [openStatusMenu, setOpenStatusMenu] = useState<string | null>(null);

  const userId = useMemo(
    () => user?.userId || (user as any)?.sub || (user as any)?.username,
    [user]
  );

  const getCacheKey = (id: string) => `applications_cache_${id}`;

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const cacheRaw = localStorage.getItem(getCacheKey(userId));
    if (cacheRaw) {
      try {
        const parsedCache = JSON.parse(cacheRaw) as
          | JobApplication[]
          | { items?: JobApplication[]; savedAt?: number };
        const cachedItems = Array.isArray(parsedCache)
          ? parsedCache
          : Array.isArray(parsedCache?.items)
            ? parsedCache.items
            : [];
        const cacheAgeMs = typeof parsedCache === 'object' && !Array.isArray(parsedCache) && parsedCache?.savedAt
          ? Date.now() - parsedCache.savedAt
          : Number.POSITIVE_INFINITY;
        const cacheIsStale = cacheAgeMs > CACHE_MAX_AGE_MS;

        if (cachedItems.length > 0) {
          setStaleCache(cacheIsStale);
          setApplications(cachedItems);
          setLoading(false);
          loadApplications(userId, true);
          return;
        }
      } catch {
        // Ignore invalid cache and continue normal fetch.
      }
    }

    loadApplications(userId);
  }, [userId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: PointerEvent) => {
      if (openStatusMenu && !(event.target as Element).closest('.status-container')) {
        setOpenStatusMenu(null);
      }
    };

    if (openStatusMenu) {
      document.addEventListener('pointerdown', handleClickOutside);
      return () => document.removeEventListener('pointerdown', handleClickOutside);
    }
  }, [openStatusMenu]);

  async function loadApplications(idFromArg?: string, silent = false) {
    const activeUserId = idFromArg || userId;
    if (!activeUserId) {
      setLoading(false);
      return;
    }

    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const data = await listApplications(activeUserId);
      setApplications(data);
      localStorage.setItem(getCacheKey(activeUserId), JSON.stringify({
        items: data,
        savedAt: Date.now(),
      }));
      setStaleCache(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load applications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

    const baseFiltered = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const normalizeDate = (v: string) => v.trim().replace(/[/.]/g, '-');

    return applications.filter((app) => {
      if (
        normalizedSearch &&
        !app.company.toLowerCase().includes(normalizedSearch) &&
        !app.position.toLowerCase().includes(normalizedSearch) &&
        !(app.location || '').toLowerCase().includes(normalizedSearch)
      ) {
        return false;
      }

      const appliedTime = dateOnlyToBoundaryMs(app.appliedDate, false);
      const fromTime = dateOnlyToBoundaryMs(normalizeDate(dateFrom), false);
      const toTime = dateOnlyToBoundaryMs(normalizeDate(dateTo), true);

      return appliedTime >= fromTime && appliedTime <= toTime;
    });
  }, [applications, searchTerm, dateFrom, dateTo]);
  const statusCounts = useMemo(() => {
    return baseFiltered.reduce<Record<string, number>>((acc, app) => {
      acc[app.status] = (acc[app.status] || 0) + 1;
      if (isActiveApplication(app.status)) {
        acc.active = (acc.active || 0) + 1;
      }
      return acc;
    }, {});
  }, [baseFiltered]);
  const followUpCounts = useMemo(() => {
    return baseFiltered.reduce(
      (acc, app) => {
        if (app.status === 'rejected') {
          return acc;
        }
        const status = app.followUpStatus || 'pending';
        if (status === 'completed') {
          acc.completed += 1;
        } else {
          acc.pending += 1;
        }
        return acc;
      },
      { pending: 0, completed: 0 }
    );
  }, [baseFiltered]);

  const filteredApplications = useMemo(() => {
    if (filter === 'all') return baseFiltered;
    if (filter === 'active') return baseFiltered.filter(app => isActiveApplication(app.status));
    if (filter === 'followup-pending') {
      return baseFiltered.filter(app => app.status !== 'rejected' && (app.followUpStatus || 'pending') === 'pending');
    }
    if (filter === 'followup-completed') {
      return baseFiltered.filter(app => app.followUpStatus === 'completed' || app.status === 'rejected');
    }
    return baseFiltered.filter(app => app.status === filter);
  }, [baseFiltered, filter]);

  const handleStatusChange = async (appId: string, newStatus: ApplicationStatus) => {
    try {
      setUpdatingStatus(appId);
      const updatePayload =
        newStatus === 'rejected'
          ? {
              status: newStatus,
              followUpStatus: 'completed' as const,
              followUpMessage: REJECTED_FOLLOW_UP_NOTE,
            }
          : { status: newStatus };
      const updated = await updateApplication(appId, updatePayload);
      setApplications(prev => prev.map(app => app.id === appId ? updated : app));
      setOpenStatusMenu(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const statusOptions: ApplicationStatus[] = ['applied', 'interview', 'offer', 'rejected', 'withdrawn', 'accepted'];
  const statusLabels: Record<ApplicationStatus, string> = {
    applied: 'Applied',
    interview: 'Interview',
    offer: 'Offer',
    rejected: 'Rejected',
    withdrawn: 'Withdrawn',
    accepted: 'Accepted',
  };

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

  const handleExportExcel = () => {
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = filteredApplications.map((app) => ([
      escapeCsv(app.company),
      escapeCsv(app.position),
      escapeCsv(formatDateOnlyForDisplay(app.appliedDate)),
      escapeCsv(app.location || '-'),
      escapeCsv(statusLabels[app.status]),
    ].join(',')));

    const csvContent = [
      'Company Name,Position,Application Date,Location,Application Status',
      ...rows,
    ].join('\r\n');

    const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `applications-${filter}-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading && applications.length === 0) {
    return <div className="loading">Loading applications...</div>;
  }

  if (error && applications.length === 0) {
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

      <div className="filter-bar">
        <button 
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All ({baseFiltered.length})
        </button>
        <button 
          className={filter === 'active' ? 'active' : ''}
          onClick={() => setFilter('active')}
        >
          Active ({statusCounts.active || 0})
        </button>
        <button 
          className={filter === 'interview' ? 'active' : ''}
          onClick={() => setFilter('interview')}
        >
          Interview ({statusCounts.interview || 0})
        </button>
        <button 
          className={filter === 'offer' ? 'active' : ''}
          onClick={() => setFilter('offer')}
        >
          Offer ({statusCounts.offer || 0})
        </button>
        <button 
          className={filter === 'rejected' ? 'active' : ''}
          onClick={() => setFilter('rejected')}
        >
          Rejected ({statusCounts.rejected || 0})
        </button>
        <button
          className={filter === 'followup-pending' ? 'active' : ''}
          onClick={() => setFilter('followup-pending')}
        >
          Follow-up Pending ({followUpCounts.pending})
        </button>
        <button
          className={filter === 'followup-completed' ? 'active' : ''}
          onClick={() => setFilter('followup-completed')}
        >
          Follow-up Done ({followUpCounts.completed})
        </button>
      </div>

      <div className="search-row">
        <div className="search-input-wrap">
          <input
            type="text"
            className="search-input"
            placeholder="Search company, job title, or location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchTerm('')}
              aria-label="Clear search"
            >
              x
            </button>
          )}
        </div>
        <div className="date-range-filters">
          <div className="date-field">
            <label className="date-field-label" htmlFor="applications-date-from">From</label>
            <input
              id="applications-date-from"
              type="date"
              className="date-input"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="Filter from date"
            />
          </div>
          <span className="date-range-separator">to</span>
          <div className="date-field">
            <label className="date-field-label" htmlFor="applications-date-to">To</label>
            <input
              id="applications-date-to"
              type="date"
              className="date-input"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="Filter to date"
            />
          </div>
          <button
            type="button"
            className="clear-date-btn"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
            disabled={!dateFrom && !dateTo}
          >
            Clear
          </button>
          <button
            type="button"
            className="clear-date-btn export-date-btn"
            onClick={handleExportExcel}
            disabled={filteredApplications.length === 0}
          >
            <HiDownload className="btn-icon" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {(refreshing || error) && (
        <div className="sync-hint">
          {refreshing
            ? (staleCache ? 'Cached data is old. Refreshing latest applications...' : 'Updating latest applications...')
            : `Showing cached data. ${error}`}
        </div>
      )}

      {filteredApplications.length === 0 ? (
        <div className="empty-state">
          <p>{applications.length === 0 ? 'No applications found.' : 'No applications match your filters.'}</p>
          <Link to="/applications/new" className="btn btn-primary">
            Add Your First Application
          </Link>
        </div>
      ) : (
        <div className="applications-grid">
          {filteredApplications.map((app) => (
            <div key={app.id} className="application-card-wrapper">
              <div className="application-card">
                <div className="card-header">
                  <Link to={`/applications/${app.id}`} className="card-title-link">
                    <h3>{app.company}</h3>
                  </Link>
                  <div className="status-container">
                    <button
                      className="status-badge status-badge-clickable"
                      style={{ backgroundColor: getStatusColor(app.status) }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
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
                <Link to={`/applications/${app.id}`} className="card-body-link">
                  <p className="position">{app.position}</p>
                  <div className="card-details">
                    <span className="detail-item">
                      <HiCalendar className="detail-icon" />
                      {formatDateOnlyForDisplay(app.appliedDate)}
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
                    <span className="detail-item">
                      Follow-up: {(app.followUpStatus || 'pending') === 'completed' ? 'Done' : 'Pending'}
                    </span>
                  </div>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  }
