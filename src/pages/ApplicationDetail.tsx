import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HiArrowLeft, HiPencil, HiTrash, HiX, HiCheck, HiLocationMarker, HiCalendar, HiCurrencyDollar, HiLink, HiMail, HiUser, HiDocument, HiDownload, HiClock, HiVideoCamera } from 'react-icons/hi';
import { getApplication, updateApplication, deleteApplication, getProfile, deleteFile } from '../utils/api';
import { formatDateOnlyForDisplay } from '../utils/date';
import type { JobApplication, UpdateApplicationInput, DocumentVersion } from '../types/application';
import { useAuth } from '../contexts/AuthContext';
import './ApplicationDetail.css';

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [application, setApplication] = useState<JobApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<UpdateApplicationInput>({});
  const [generating, setGenerating] = useState({ cv: false, coverLetter: false });

  const buildVersionEntry = (fileUrl: string, fileKey: string | undefined, version: number, source: 'generated' | 'uploaded'): DocumentVersion => ({
    version,
    label: `v${version}`,
    url: fileUrl,
    fileKey,
    createdAt: new Date().toISOString(),
    source,
  });

  const getLatestVersion = (versions: DocumentVersion[] | undefined) => {
    if (!versions || versions.length === 0) return null;
    return [...versions].sort((a, b) => b.version - a.version)[0];
  };

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
        interviewTime: data.interviewTime,
        interviewPlace: data.interviewPlace,
        interviewLink: data.interviewLink,
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

  const handleGenerateDocument = async (documentType: 'cv' | 'coverLetter') => {
    if (!id || !application) return;

    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
    if (!apiBaseUrl) {
      setGenerationError('API base URL is not configured.');
      return;
    }

    const userId = user?.userId || (user as any)?.sub || (user as any)?.username;
    if (!userId) {
      setGenerationError('Please sign in to generate documents.');
      return;
    }

    try {
      setGenerationError(null);
      setGenerating(prev => ({ ...prev, [documentType]: true }));

      const userProfile = await getProfile(userId);
      if (!userProfile) {
        throw new Error('Profile not found. Please save your profile first.');
      }

      const timezoneOffset = -new Date().getTimezoneOffset();
      const response = await fetch(`${apiBaseUrl}/generate-documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userProfile,
          jobApplication: application,
          documentType,
          timezoneOffset,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to generate document.');
      }

      const result = await response.json();
      const s3Key = result.s3Key as string | undefined;
      const isCv = documentType === 'cv';
      const existingVersions = isCv
        ? application?.cvVersions ?? []
        : application?.coverLetterVersions ?? [];
      const fallbackVersion = existingVersions.length + 1;
      const versionNumber = typeof result.version === 'number' ? result.version : fallbackVersion;
      const newVersion = buildVersionEntry(result.fileUrl, s3Key, versionNumber, 'generated');
      const updatedVersions = [...existingVersions, newVersion];

      const nextParsedJob = result.haikuPrep
        ? { ...(application.parsedJob || {}), haikuPrep: result.haikuPrep }
        : application.parsedJob;
      const updatePayload = isCv
        ? { cvUrl: result.fileUrl, cvFileKey: s3Key, cvVersions: updatedVersions, parsedJob: nextParsedJob }
        : { coverLetterUrl: result.fileUrl, coverLetterFileKey: s3Key, coverLetterVersions: updatedVersions, parsedJob: nextParsedJob };

      const updated = await updateApplication(id, updatePayload);
      setApplication(updated);
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Failed to generate document.');
    } finally {
      setGenerating(prev => ({ ...prev, [documentType]: false }));
    }
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

  const handleDeleteVersion = async (type: 'cv' | 'coverLetter', version: DocumentVersion) => {
    if (!application || !id) return;
    try {
      if (version.fileKey) {
        await deleteFile(version.fileKey);
      }

      const currentVersions = type === 'cv' ? application.cvVersions ?? [] : application.coverLetterVersions ?? [];
      const updatedVersions = currentVersions.filter(item => item.version !== version.version);
      const latest = getLatestVersion(updatedVersions);

      const updatePayload =
        type === 'cv'
          ? {
              cvVersions: updatedVersions,
              cvUrl: latest?.url,
              cvFileKey: latest?.fileKey,
            }
          : {
              coverLetterVersions: updatedVersions,
              coverLetterUrl: latest?.url,
              coverLetterFileKey: latest?.fileKey,
            };

      const updated = await updateApplication(id, updatePayload);
      setApplication(updated);
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Failed to delete document version.');
    }
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
          <HiArrowLeft className="btn-icon" />
          <span>Back</span>
        </button>
        <div className="header-actions">
          {!editing && (
            <>
              <button onClick={() => setEditing(true)} className="btn btn-secondary">
                <HiPencil className="btn-icon" />
                <span>Edit</span>
              </button>
              <button onClick={handleDelete} className="btn btn-danger">
                <HiTrash className="btn-icon" />
                <span>Delete</span>
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {generationError && <div className="error-message">{generationError}</div>}

      {!editing && application && (
        <div className="application-hero">
          <div className="hero-content">
            <h1>{application.company}</h1>
            <p className="hero-position">{application.position}</p>
            <div className="hero-status">
              <span 
                className="status-badge-large"
                style={{ backgroundColor: getStatusColor(application.status) }}
              >
                {application.status}
              </span>
            </div>
          </div>
        </div>
      )}

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

          {formData.interviewDate && (
            <div className="form-section interview-details">
              <h4>Interview Details</h4>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="interviewTime">Interview Time</label>
                  <input
                    type="time"
                    id="interviewTime"
                    name="interviewTime"
                    value={formData.interviewTime || ''}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="interviewPlace">Interview Place</label>
                  <input
                    type="text"
                    id="interviewPlace"
                    name="interviewPlace"
                    value={formData.interviewPlace || ''}
                    onChange={handleChange}
                    placeholder="e.g., Office, Zoom, Teams"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="interviewLink">Interview Link (Zoom/Meeting)</label>
                <input
                  type="url"
                  id="interviewLink"
                  name="interviewLink"
                  value={formData.interviewLink || ''}
                  onChange={handleChange}
                  placeholder="https://zoom.us/j/..."
                />
              </div>
            </div>
          )}

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
              <HiX className="btn-icon" />
              <span>Cancel</span>
            </button>
            <button type="submit" className="btn btn-primary">
              <HiCheck className="btn-icon" />
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      ) : (
        <div className="detail-content">
          <div className="detail-card">

            <div className="detail-section">
              <h3>Application Details</h3>
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="label">
                    <HiCalendar className="label-icon" />
                    Applied Date
                  </span>
                  <span className="value">{formatDateOnlyForDisplay(application.appliedDate)}</span>
                </div>
                {application.interviewDate && (
                  <>
                    <div className="detail-item">
                      <span className="label">
                        <HiCalendar className="label-icon" />
                        Interview Date
                      </span>
                      <span className="value">{formatDateOnlyForDisplay(application.interviewDate)}</span>
                    </div>
                    {application.interviewTime && (
                      <div className="detail-item">
                        <span className="label">
                          <HiClock className="label-icon" />
                          Interview Time
                        </span>
                        <span className="value">{application.interviewTime}</span>
                      </div>
                    )}
                    {application.interviewPlace && (
                      <div className="detail-item">
                        <span className="label">
                          <HiLocationMarker className="label-icon" />
                          Interview Place
                        </span>
                        <span className="value">{application.interviewPlace}</span>
                      </div>
                    )}
                    {application.interviewLink && (
                      <div className="detail-item">
                        <span className="label">
                          <HiVideoCamera className="label-icon" />
                          Interview Link
                        </span>
                        <a href={application.interviewLink} target="_blank" rel="noopener noreferrer" className="value">
                          Join Interview (Zoom/Meeting)
                        </a>
                      </div>
                    )}
                  </>
                )}
                {application.offerDate && (
                  <div className="detail-item">
                    <span className="label">
                      <HiCalendar className="label-icon" />
                      Offer Date
                    </span>
                    <span className="value">{formatDateOnlyForDisplay(application.offerDate)}</span>
                  </div>
                )}
                {application.location && (
                  <div className="detail-item">
                    <span className="label">
                      <HiLocationMarker className="label-icon" />
                      Location
                    </span>
                    <span className="value">{application.location}</span>
                  </div>
                )}
                {application.salary && (
                  <div className="detail-item">
                    <span className="label">
                      <HiCurrencyDollar className="label-icon" />
                      Salary
                    </span>
                    <span className="value">{application.salary}</span>
                  </div>
                )}
                {application.jobUrl && (
                  <div className="detail-item">
                    <span className="label">
                      <HiLink className="label-icon" />
                      Job URL
                    </span>
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
                      <span className="label">
                        <HiUser className="label-icon" />
                        Name
                      </span>
                      <span className="value">{application.contactName}</span>
                    </div>
                  )}
                  {application.contactEmail && (
                    <div className="detail-item">
                      <span className="label">
                        <HiMail className="label-icon" />
                        Email
                      </span>
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

            <div className="detail-section">
              <h3>Documents</h3>
              <p className="section-description">Generate tailored documents or download existing files</p>
              <div className="document-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleGenerateDocument('cv')}
                  disabled={generating.cv}
                >
                  {generating.cv ? 'Generating CV...' : 'Generate CV'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleGenerateDocument('coverLetter')}
                  disabled={generating.coverLetter}
                >
                  {generating.coverLetter ? 'Generating Cover Letter...' : 'Generate Cover Letter'}
                </button>
              </div>
              {(() => {
                const hasCvVersions = (application.cvVersions?.length ?? 0) > 0;
                const hasCoverVersions = (application.coverLetterVersions?.length ?? 0) > 0;
                if (!hasCvVersions && !hasCoverVersions && !application.cvUrl && !application.coverLetterUrl) {
                  return null;
                }
                return (
                <>
                  {hasCvVersions && (
                    <div className="documents-grid">
                      {(application.cvVersions ?? []).map(version => (
                        <div key={`cv-${version.version}`} className="document-card">
                          <div className="document-icon-wrapper">
                            <HiDocument className="document-icon" />
                          </div>
                          <div className="document-content">
                            <h4>Generated CV {version.label}</h4>
                            <p>{new Date(version.createdAt).toLocaleString()} • {version.source}</p>
                            <span className="document-url">{version.url.substring(0, 50)}...</span>
                          </div>
                          <div className="document-actions-inline">
                            <a href={version.url} target="_blank" rel="noopener noreferrer" className="download-icon">
                              <HiDownload />
                            </a>
                            <button type="button" className="delete-icon" onClick={() => handleDeleteVersion('cv', version)}>
                              <HiX />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {hasCoverVersions && (
                    <div className="documents-grid">
                      {(application.coverLetterVersions ?? []).map(version => (
                        <div key={`cover-${version.version}`} className="document-card">
                          <div className="document-icon-wrapper">
                            <HiDocument className="document-icon" />
                          </div>
                          <div className="document-content">
                            <h4>Generated Cover Letter {version.label}</h4>
                            <p>{new Date(version.createdAt).toLocaleString()} • {version.source}</p>
                            <span className="document-url">{version.url.substring(0, 50)}...</span>
                          </div>
                          <div className="document-actions-inline">
                            <a href={version.url} target="_blank" rel="noopener noreferrer" className="download-icon">
                              <HiDownload />
                            </a>
                            <button type="button" className="delete-icon" onClick={() => handleDeleteVersion('coverLetter', version)}>
                              <HiX />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
                );
              })()}
            </div>

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

