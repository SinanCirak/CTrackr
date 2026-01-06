import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getApplication, updateApplication, deleteApplication } from '../utils/api';
import type { JobApplication, UpdateApplicationInput } from '../types/application';
import './ApplicationDetail.css';

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [application, setApplication] = useState<JobApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<UpdateApplicationInput>({});

  useEffect(() => {
    if (id) {
      loadApplication();
    }
  }, [id]);

  async function loadApplication() {
    if (!id) return;
    try {
      setLoading(true);
      const data = await getApplication(id);
      setApplication(data);
      setFormData({
        company: data.company,
        position: data.position,
        status: data.status,
        appliedDate: data.appliedDate,
        interviewDate: data.interviewDate,
        offerDate: data.offerDate,
        rejectedDate: data.rejectedDate,
        location: data.location,
        salary: data.salary,
        jobUrl: data.jobUrl,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        notes: data.notes,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load application');
    } finally {
      setLoading(false);
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value || undefined,
    }));
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    try {
      const updated = await updateApplication(id, formData);
      setApplication(updated);
      setEditing(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update application');
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm('Are you sure you want to delete this application?')) return;

    try {
      await deleteApplication(id);
      navigate('/applications');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete application');
    }
  };

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
    return <div className="loading">Loading application...</div>;
  }

  if (error && !application) {
    return <div className="error">Error: {error}</div>;
  }

  if (!application) {
    return <div className="error">Application not found</div>;
  }

  return (
    <div className="application-detail">
      <div className="detail-header">
        <button onClick={() => navigate('/applications')} className="back-btn">
          ← Back
        </button>
        <div className="header-actions">
          {!editing && (
            <>
              <button onClick={() => setEditing(true)} className="btn btn-secondary">
                Edit
              </button>
              <button onClick={handleDelete} className="btn btn-danger">
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {editing ? (
        <form onSubmit={handleUpdate} className="application-form">
          <div className="form-group">
            <label htmlFor="company">Company</label>
            <input
              type="text"
              id="company"
              name="company"
              value={formData.company || ''}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label htmlFor="position">Position</label>
            <input
              type="text"
              id="position"
              name="position"
              value={formData.position || ''}
              onChange={handleChange}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="status">Status</label>
              <select
                id="status"
                name="status"
                value={formData.status || 'applied'}
                onChange={handleChange}
              >
                <option value="applied">Applied</option>
                <option value="interview">Interview</option>
                <option value="offer">Offer</option>
                <option value="rejected">Rejected</option>
                <option value="withdrawn">Withdrawn</option>
                <option value="accepted">Accepted</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="appliedDate">Applied Date</label>
              <input
                type="date"
                id="appliedDate"
                name="appliedDate"
                value={formData.appliedDate || ''}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="interviewDate">Interview Date</label>
              <input
                type="date"
                id="interviewDate"
                name="interviewDate"
                value={formData.interviewDate || ''}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="offerDate">Offer Date</label>
              <input
                type="date"
                id="offerDate"
                name="offerDate"
                value={formData.offerDate || ''}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes || ''}
              onChange={handleChange}
              rows={5}
            />
          </div>

          <div className="form-actions">
            <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Changes
            </button>
          </div>
        </form>
      ) : (
        <div className="detail-content">
          <div className="detail-card">
            <div className="card-header">
              <div>
                <h1>{application.company}</h1>
                <p className="position">{application.position}</p>
              </div>
              <span 
                className="status-badge"
                style={{ backgroundColor: getStatusColor(application.status) }}
              >
                {application.status}
              </span>
            </div>

            <div className="detail-section">
              <h3>Application Details</h3>
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="label">Applied Date:</span>
                  <span className="value">{new Date(application.appliedDate).toLocaleDateString()}</span>
                </div>
                {application.interviewDate && (
                  <div className="detail-item">
                    <span className="label">Interview Date:</span>
                    <span className="value">{new Date(application.interviewDate).toLocaleDateString()}</span>
                  </div>
                )}
                {application.offerDate && (
                  <div className="detail-item">
                    <span className="label">Offer Date:</span>
                    <span className="value">{new Date(application.offerDate).toLocaleDateString()}</span>
                  </div>
                )}
                {application.location && (
                  <div className="detail-item">
                    <span className="label">Location:</span>
                    <span className="value">{application.location}</span>
                  </div>
                )}
                {application.salary && (
                  <div className="detail-item">
                    <span className="label">Salary:</span>
                    <span className="value">{application.salary}</span>
                  </div>
                )}
                {application.jobUrl && (
                  <div className="detail-item">
                    <span className="label">Job URL:</span>
                    <a href={application.jobUrl} target="_blank" rel="noopener noreferrer" className="value">
                      View Job Posting
                    </a>
                  </div>
                )}
              </div>
            </div>

            {(application.contactName || application.contactEmail) && (
              <div className="detail-section">
                <h3>Contact Information</h3>
                <div className="detail-grid">
                  {application.contactName && (
                    <div className="detail-item">
                      <span className="label">Name:</span>
                      <span className="value">{application.contactName}</span>
                    </div>
                  )}
                  {application.contactEmail && (
                    <div className="detail-item">
                      <span className="label">Email:</span>
                      <a href={`mailto:${application.contactEmail}`} className="value">
                        {application.contactEmail}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {application.notes && (
              <div className="detail-section">
                <h3>Notes</h3>
                <p className="notes">{application.notes}</p>
              </div>
            )}

            <div className="detail-meta">
              <span>Created: {new Date(application.createdAt).toLocaleString()}</span>
              <span>Updated: {new Date(application.updatedAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

