import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  HiArrowLeft,
  HiPencil,
  HiTrash,
  HiX,
  HiCheck,
  HiLocationMarker,
  HiCalendar,
  HiCurrencyDollar,
  HiLink,
  HiMail,
  HiUser,
  HiDocument,
  HiDownload,
  HiClock,
  HiVideoCamera,
  HiCloudUpload,
} from 'react-icons/hi';
import {
  getApplication,
  updateApplication,
  deleteApplication,
  getProfile,
  deleteFile,
  getUploadUrl,
  uploadFileToS3,
} from '../utils/api';
import { formatDateOnlyForDisplay, getTodayDateLocalISO } from '../utils/date';
import type { JobApplication, UpdateApplicationInput, DocumentVersion } from '../types/application';
import { useAuth } from '../contexts/AuthContext';
import './ApplicationDetail.css';

function buildFormData(data: JobApplication): UpdateApplicationInput {
  return {
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
    jobDescription: data.jobDescription,
    requirements: data.requirements,
    cvUrl: data.cvUrl,
    cvFileKey: data.cvFileKey,
    coverLetterUrl: data.coverLetterUrl,
    coverLetterFileKey: data.coverLetterFileKey,
    cvVersions: data.cvVersions ?? [],
    coverLetterVersions: data.coverLetterVersions ?? [],
    parsedJob: data.parsedJob,
    followUpStatus: data.followUpStatus,
    followUpDate: data.followUpDate,
    followUpMessage: data.followUpMessage,
    followUpChannel: data.followUpChannel,
    followUpContact: data.followUpContact,
    followUpContactInfo: data.followUpContactInfo,
    roleSummary: data.roleSummary,
    relatedProject: data.relatedProject,
  };
}

export default function ApplicationDetail() {
  const REJECTED_FOLLOW_UP_NOTE = 'Follow-up completed because application was rejected.';
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
  const [uploadingCv, setUploadingCv] = useState(false);
  const [uploadingCoverLetter, setUploadingCoverLetter] = useState(false);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null);
  const cvFileInputRef = useRef<HTMLInputElement>(null);
  const coverLetterFileInputRef = useRef<HTMLInputElement>(null);
  const userId = user?.userId || (user as any)?.sub || (user as any)?.username;
  const profileOwnerName =
    (user as any)?.name ||
    (user as any)?.given_name ||
    (user as any)?.preferred_username ||
    (user as any)?.email ||
    'Your Name';
  const getGreetingName = (rawContact?: string) => {
    const cleaned = (rawContact || '').trim();
    if (!cleaned) return 'there';
    return cleaned.split(/\s+/)[0];
  };

  const buildFollowUpMessage = (data: UpdateApplicationInput, current?: JobApplication | null) => {
    const contact = data.followUpContact?.trim() || current?.followUpContact?.trim() || data.contactName?.trim() || current?.contactName?.trim() || '';
    const greetingName = getGreetingName(contact);
    const role = data.position?.trim() || current?.position?.trim() || 'the role';
    const company = data.company?.trim() || current?.company?.trim() || 'your company';
    const channel = (data.followUpChannel || current?.followUpChannel) === 'linkedin' ? 'LinkedIn' : 'email';
    const contactInfo = data.followUpContactInfo?.trim() || current?.followUpContactInfo?.trim();
    const roleSummary = data.roleSummary?.trim() || current?.roleSummary?.trim();
    const relatedProject = data.relatedProject?.trim() || current?.relatedProject?.trim();
    const highlights = [roleSummary, relatedProject ? `A related project is ${relatedProject}.` : '']
      .filter(Boolean)
      .join(' ');

    return [
      `Hi ${greetingName},`,
      '',
      `I hope you're doing well. I wanted to quickly follow up on my application for the ${role} role at ${company}.`,
      `I am reaching out via ${channel}.`,
      contactInfo ? `Contact info: ${contactInfo}.` : '',
      highlights,
      'I am still very interested in the opportunity and would be happy to share any additional information if helpful.',
      '',
      'Thanks,',
      profileOwnerName,
    ].filter(Boolean).join('\n');
  };

  const buildVersionEntry = (
    fileUrl: string,
    fileKey: string | undefined,
    version: number,
    source: 'generated' | 'uploaded'
  ): DocumentVersion => ({
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

  const removeVersion = (versions: DocumentVersion[] | undefined, fileKey?: string, url?: string) => {
    if (!versions || versions.length === 0) return [];
    return versions.filter(version => {
      if (fileKey && version.fileKey === fileKey) return false;
      if (url && version.url === url) return false;
      return true;
    });
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
      setFormData(buildFormData(data));
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

  const startEditing = () => {
    if (!application) return;
    setFormData(buildFormData(application));
    setCvFile(null);
    setCoverLetterFile(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    if (application) {
      setFormData(buildFormData(application));
    }
    setCvFile(null);
    setCoverLetterFile(null);
    if (cvFileInputRef.current) cvFileInputRef.current.value = '';
    if (coverLetterFileInputRef.current) coverLetterFileInputRef.current.value = '';
    setEditing(false);
    setError(null);
    setGenerationError(null);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    try {
      const payload: UpdateApplicationInput =
        formData.status === 'rejected'
          ? {
              ...formData,
              followUpStatus: 'completed',
              followUpMessage:
                formData.followUpMessage?.trim() || REJECTED_FOLLOW_UP_NOTE,
            }
          : formData;
      const updated = await updateApplication(id, payload);
      setApplication(updated);
      setFormData(buildFormData(updated));
      if (userId) {
        const cacheKey = `applications_cache_${userId}`;
        const cacheRaw = localStorage.getItem(cacheKey);
        if (cacheRaw) {
          try {
            const parsedCache = JSON.parse(cacheRaw) as
              | JobApplication[]
              | { items?: JobApplication[]; savedAt?: number };
            const existingItems = Array.isArray(parsedCache)
              ? parsedCache
              : Array.isArray(parsedCache?.items)
                ? parsedCache.items
                : [];
            const nextItems = existingItems.map(app => (app.id === updated.id ? updated : app));
            localStorage.setItem(cacheKey, JSON.stringify({
              items: nextItems,
              savedAt: Date.now(),
            }));
          } catch {
            // Ignore cache parse errors and continue with fresh state.
          }
        }
      }
      setCvFile(null);
      setCoverLetterFile(null);
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

  const generateFileName = (originalFileName: string, type: 'cv' | 'coverLetter', companyName: string): string => {
    const fileExtension = originalFileName.split('.').pop() || 'pdf';
    const sanitizedCompany = companyName
      .trim()
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase()
      .substring(0, 50);
    const date = getTodayDateLocalISO();
    const prefix = type === 'cv' ? 'CV' : 'CoverLetter';
    return `${prefix}_${sanitizedCompany}_${date}.${fileExtension}`;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'cv' | 'coverLetter') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!formData.company || formData.company.trim() === '') {
      setError('Please enter company name before uploading files.');
      return;
    }

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Only PDF and DOC/DOCX files are allowed.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB.');
      return;
    }

    try {
      if (type === 'cv') {
        setUploadingCv(true);
        setCvFile(file);
      } else {
        setUploadingCoverLetter(true);
        setCoverLetterFile(file);
      }

      setError(null);

      const newFileName = generateFileName(file.name, type, formData.company);
      const userId = user?.userId || (user as any)?.sub || (user as any)?.username;

      const { uploadUrl, fileUrl, fileKey } = await getUploadUrl(
        newFileName,
        file.type,
        userId,
        formData.company,
        type === 'cv' ? 'CV' : 'CoverLetter'
      );

      await uploadFileToS3(uploadUrl, file);

      if (type === 'cv') {
        setFormData(prev => {
          const currentVersions = prev.cvVersions ?? [];
          const nextVersion = currentVersions.length + 1;
          const newVersion = buildVersionEntry(fileUrl, fileKey, nextVersion, 'uploaded');
          return {
            ...prev,
            cvUrl: fileUrl,
            cvFileKey: fileKey,
            cvVersions: [...currentVersions, newVersion],
          };
        });
      } else {
        setFormData(prev => {
          const currentVersions = prev.coverLetterVersions ?? [];
          const nextVersion = currentVersions.length + 1;
          const newVersion = buildVersionEntry(fileUrl, fileKey, nextVersion, 'uploaded');
          return {
            ...prev,
            coverLetterUrl: fileUrl,
            coverLetterFileKey: fileKey,
            coverLetterVersions: [...currentVersions, newVersion],
          };
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file');
      if (type === 'cv') {
        setCvFile(null);
      } else {
        setCoverLetterFile(null);
      }
    } finally {
      if (type === 'cv') {
        setUploadingCv(false);
      } else {
        setUploadingCoverLetter(false);
      }
    }
  };

  const handleGenerateDocument = async (documentType: 'cv' | 'coverLetter') => {
    if (!id) return;

    const currentApplication = editing ? { ...application, ...formData } : application;
    if (!currentApplication) return;

    if (!currentApplication.company || !currentApplication.position) {
      setGenerationError('Please enter company and position before generating documents.');
      return;
    }

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
          jobApplication: currentApplication,
          documentType,
          timezoneOffset,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to generate document.');
      }

      const result = await response.json();
      const isCv = documentType === 'cv';
      const existingVersions = isCv
        ? currentApplication.cvVersions ?? []
        : currentApplication.coverLetterVersions ?? [];
      const fallbackVersion = existingVersions.length + 1;
      const versionNumber = typeof result.version === 'number' ? result.version : fallbackVersion;
      const newVersion = buildVersionEntry(result.fileUrl, result.s3Key, versionNumber, 'generated');
      const updatedVersions = [...existingVersions, newVersion];
      const nextParsedJob = result.haikuPrep
        ? { ...(currentApplication.parsedJob || {}), haikuPrep: result.haikuPrep }
        : currentApplication.parsedJob;

      const updatePayload = isCv
        ? { cvUrl: result.fileUrl, cvFileKey: result.s3Key, cvVersions: updatedVersions, parsedJob: nextParsedJob }
        : {
            coverLetterUrl: result.fileUrl,
            coverLetterFileKey: result.s3Key,
            coverLetterVersions: updatedVersions,
            parsedJob: nextParsedJob,
          };

      const updated = await updateApplication(id, updatePayload);
      setApplication(updated);
      setFormData(prev => ({
        ...prev,
        ...updatePayload,
      }));
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Failed to generate document.');
    } finally {
      setGenerating(prev => ({ ...prev, [documentType]: false }));
    }
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
      setFormData(prev => ({ ...prev, ...updatePayload }));
      if (type === 'cv' && updatedVersions.length === 0) setCvFile(null);
      if (type === 'coverLetter' && updatedVersions.length === 0) setCoverLetterFile(null);
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Failed to delete document version.');
    }
  };

  const handleRemoveDirectFile = async (type: 'cv' | 'coverLetter') => {
    if (!id || !application) return;

    const fileKey = type === 'cv' ? application.cvFileKey : application.coverLetterFileKey;
    const fileUrl = type === 'cv' ? application.cvUrl : application.coverLetterUrl;
    const versions = type === 'cv' ? application.cvVersions : application.coverLetterVersions;

    try {
      if (fileKey) {
        await deleteFile(fileKey);
      }

      const updatedVersions = removeVersion(versions, fileKey, fileUrl);
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
      setFormData(prev => ({ ...prev, ...updatePayload }));
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Failed to remove document.');
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

  const renderVersionList = (type: 'cv' | 'coverLetter', versions: DocumentVersion[] | undefined) => {
    if (!versions || versions.length === 0) return null;

    return (
      <div className="uploaded-file-display">
        <div className="uploaded-file-info uploaded-file-heading">
          <HiDocument className="uploaded-file-icon" />
          <span className="uploaded-file-name">{type === 'cv' ? 'CV Versions' : 'Cover Letter Versions'}</span>
        </div>
        {versions.map(version => (
          <div key={`${type}-version-${version.version}`} className="uploaded-file-info">
            <span className="uploaded-file-name">
              {version.label} ({version.source})
            </span>
            <a
              href={version.url}
              target="_blank"
              rel="noopener noreferrer"
              className="remove-file-btn"
              aria-label={`Download ${version.label}`}
            >
              <HiDownload />
            </a>
            <button
              type="button"
              className="remove-file-btn"
              onClick={() => {
                if (editing) {
                  setFormData(prev => {
                    const currentVersions = type === 'cv' ? prev.cvVersions : prev.coverLetterVersions;
                    const updatedVersions = removeVersion(currentVersions, version.fileKey, version.url);
                    const latest = updatedVersions[updatedVersions.length - 1];
                    return type === 'cv'
                      ? { ...prev, cvVersions: updatedVersions, cvUrl: latest?.url, cvFileKey: latest?.fileKey }
                      : {
                          ...prev,
                          coverLetterVersions: updatedVersions,
                          coverLetterUrl: latest?.url,
                          coverLetterFileKey: latest?.fileKey,
                        };
                  });
                  return;
                }

                handleDeleteVersion(type, version);
              }}
              aria-label={`Delete ${version.label}`}
            >
              <HiX />
            </button>
          </div>
        ))}
      </div>
    );
  };

  const renderDirectFile = (
    type: 'cv' | 'coverLetter',
    fileUrl: string | undefined,
    fileName: string | undefined,
    hasVersions: boolean
  ) => {
    if (!fileUrl || hasVersions) return null;

    return (
      <div className="uploaded-file-display">
        <div className="uploaded-file-info">
          <HiDocument className="uploaded-file-icon" />
          <span className="uploaded-file-name">{fileName || (type === 'cv' ? 'Uploaded CV' : 'Uploaded Cover Letter')}</span>
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="remove-file-btn"
            aria-label={`Download ${type}`}
          >
            <HiDownload />
          </a>
          <button
            type="button"
            className="remove-file-btn"
            onClick={() => {
              if (editing) {
                setFormData(prev =>
                  type === 'cv'
                    ? { ...prev, cvUrl: undefined, cvFileKey: undefined, cvVersions: [] }
                    : { ...prev, coverLetterUrl: undefined, coverLetterFileKey: undefined, coverLetterVersions: [] }
                );
                if (type === 'cv') {
                  setCvFile(null);
                  if (cvFileInputRef.current) cvFileInputRef.current.value = '';
                } else {
                  setCoverLetterFile(null);
                  if (coverLetterFileInputRef.current) coverLetterFileInputRef.current.value = '';
                }
                return;
              }

              handleRemoveDirectFile(type);
            }}
            aria-label={`Delete ${type}`}
          >
            <HiX />
          </button>
        </div>
      </div>
    );
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

  const currentView = editing ? { ...application, ...formData } : application;
  const hasCvVersions = (currentView.cvVersions?.length ?? 0) > 0;
  const hasCoverVersions = (currentView.coverLetterVersions?.length ?? 0) > 0;

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
              <button onClick={startEditing} className="btn btn-secondary">
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

      {!editing && (
        <div className="application-hero">
          <div className="hero-content">
            <h1>{application.company}</h1>
            <p className="hero-position">{application.position}</p>
            <div className="hero-status">
              <span className="status-badge-large" style={{ backgroundColor: getStatusColor(application.status) }}>
                {application.status}
              </span>
            </div>
          </div>
        </div>
      )}

      {editing ? (
        <form onSubmit={handleUpdate} className="application-form">
          <div className="form-group">
            <label htmlFor="company">Company *</label>
            <input type="text" id="company" name="company" value={formData.company || ''} onChange={handleChange} required />
          </div>

          <div className="form-group">
            <label htmlFor="position">Position *</label>
            <input type="text" id="position" name="position" value={formData.position || ''} onChange={handleChange} required />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" value={formData.status || 'applied'} onChange={handleChange}>
                <option value="applied">Applied</option>
                <option value="interview">Interview</option>
                <option value="offer">Offer</option>
                <option value="rejected">Rejected</option>
                <option value="withdrawn">Withdrawn</option>
                <option value="accepted">Accepted</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="appliedDate">Applied Date *</label>
              <input
                type="date"
                id="appliedDate"
                name="appliedDate"
                value={formData.appliedDate || ''}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="location">Location</label>
              <input type="text" id="location" name="location" value={formData.location || ''} onChange={handleChange} />
            </div>

            <div className="form-group">
              <label htmlFor="salary">Salary</label>
              <input
                type="text"
                id="salary"
                name="salary"
                value={formData.salary || ''}
                onChange={handleChange}
                placeholder="e.g., $100k - $120k"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="jobUrl">Job URL</label>
            <input
              type="url"
              id="jobUrl"
              name="jobUrl"
              value={formData.jobUrl || ''}
              onChange={handleChange}
              placeholder="https://..."
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="contactName">Contact Name</label>
              <input type="text" id="contactName" name="contactName" value={formData.contactName || ''} onChange={handleChange} />
            </div>

            <div className="form-group">
              <label htmlFor="contactEmail">Contact Email</label>
              <input
                type="email"
                id="contactEmail"
                name="contactEmail"
                value={formData.contactEmail || ''}
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
              <input type="date" id="offerDate" name="offerDate" value={formData.offerDate || ''} onChange={handleChange} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="rejectedDate">Rejected Date</label>
              <input
                type="date"
                id="rejectedDate"
                name="rejectedDate"
                value={formData.rejectedDate || ''}
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
                <label htmlFor="interviewLink">Interview Link</label>
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

          <div className="form-section">
            <h4>Job Details</h4>
            <p className="section-description">Provide detailed information about the job position.</p>

            <div className="form-group">
              <label htmlFor="jobDescription">Job Description</label>
              <textarea
                id="jobDescription"
                name="jobDescription"
                value={formData.jobDescription || ''}
                onChange={handleChange}
                rows={6}
                placeholder="Paste the full job description here..."
              />
            </div>

            <div className="form-group">
              <label htmlFor="requirements">Requirements & Qualifications</label>
              <textarea
                id="requirements"
                name="requirements"
                value={formData.requirements || ''}
                onChange={handleChange}
                rows={6}
                placeholder="List the required skills, experience, and qualifications..."
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
              placeholder="Additional notes about this application..."
            />
          </div>

          <div className="form-section">
            <h4>Follow-up</h4>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="followUpStatus">Follow-up Status</label>
                <select id="followUpStatus" name="followUpStatus" value={formData.followUpStatus || 'pending'} onChange={handleChange}>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="followUpDate">Follow-up Date</label>
                <input type="date" id="followUpDate" name="followUpDate" value={formData.followUpDate || ''} onChange={handleChange} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="roleSummary">Role Summary (for follow-up)</label>
                <input type="text" id="roleSummary" name="roleSummary" value={formData.roleSummary || ''} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="relatedProject">Related Project</label>
                <input type="text" id="relatedProject" name="relatedProject" value={formData.relatedProject || ''} onChange={handleChange} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="followUpChannel">Follow-up Channel</label>
                <select id="followUpChannel" name="followUpChannel" value={formData.followUpChannel || 'email'} onChange={handleChange}>
                  <option value="email">Email</option>
                  <option value="linkedin">LinkedIn</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="followUpContact">Follow-up Contact</label>
                <input type="text" id="followUpContact" name="followUpContact" value={formData.followUpContact || ''} onChange={handleChange} />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="followUpContactInfo">Follow-up Contact Info</label>
              <input
                type="text"
                id="followUpContactInfo"
                name="followUpContactInfo"
                value={formData.followUpContactInfo || ''}
                onChange={handleChange}
                placeholder={formData.followUpChannel === 'linkedin' ? 'LinkedIn profile URL' : 'Email address'}
              />
            </div>
            <div className="form-group">
              <label htmlFor="followUpMessage">Follow-up Message</label>
              <textarea
                id="followUpMessage"
                name="followUpMessage"
                value={formData.followUpMessage || ''}
                onChange={handleChange}
                rows={5}
                placeholder="Write or auto-generate your follow-up message..."
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setFormData(prev => ({
                    ...prev,
                    followUpMessage: buildFollowUpMessage(prev, application),
                  }));
                }}
              >
                Auto Generate Follow-up Message
              </button>
            </div>
          </div>

          <div className="form-section">
            <h3>Documents</h3>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="cv">
                  <HiDocument className="label-icon" />
                  CV / Resume
                </label>
                <button
                  type="button"
                  className="btn btn-secondary btn-generate-doc"
                  onClick={() => handleGenerateDocument('cv')}
                  disabled={generating.cv}
                >
                  {generating.cv ? 'Generating CV...' : 'Generate CV'}
                </button>
                <div className="file-upload-wrapper">
                  <input
                    ref={cvFileInputRef}
                    type="file"
                    id="cv"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => handleFileChange(e, 'cv')}
                    disabled={uploadingCv}
                    className="file-input"
                  />
                  <label htmlFor="cv" className="file-upload-label">
                    <HiCloudUpload className="upload-icon" />
                    <span>{uploadingCv ? 'Uploading...' : cvFile ? cvFile.name : 'Choose CV File (PDF, DOC, DOCX)'}</span>
                  </label>
                </div>
                {renderVersionList('cv', formData.cvVersions)}
                {renderDirectFile('cv', formData.cvUrl, cvFile?.name, hasCvVersions)}
              </div>

              <div className="form-group">
                <label htmlFor="coverLetter">
                  <HiDocument className="label-icon" />
                  Cover Letter
                </label>
                <button
                  type="button"
                  className="btn btn-secondary btn-generate-doc"
                  onClick={() => handleGenerateDocument('coverLetter')}
                  disabled={generating.coverLetter}
                >
                  {generating.coverLetter ? 'Generating Cover Letter...' : 'Generate Cover Letter'}
                </button>
                <div className="file-upload-wrapper">
                  <input
                    ref={coverLetterFileInputRef}
                    type="file"
                    id="coverLetter"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => handleFileChange(e, 'coverLetter')}
                    disabled={uploadingCoverLetter}
                    className="file-input"
                  />
                  <label htmlFor="coverLetter" className="file-upload-label">
                    <HiCloudUpload className="upload-icon" />
                    <span>
                      {uploadingCoverLetter
                        ? 'Uploading...'
                        : coverLetterFile
                          ? coverLetterFile.name
                          : 'Choose Cover Letter (PDF, DOC, DOCX)'}
                    </span>
                  </label>
                </div>
                {renderVersionList('coverLetter', formData.coverLetterVersions)}
                {renderDirectFile('coverLetter', formData.coverLetterUrl, coverLetterFile?.name, hasCoverVersions)}
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" onClick={cancelEditing} className="btn btn-secondary">
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
                  <div className="detail-item">
                    <span className="label">
                      <HiCalendar className="label-icon" />
                      Interview Date
                    </span>
                    <span className="value">{formatDateOnlyForDisplay(application.interviewDate)}</span>
                  </div>
                )}
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
                      Join Interview
                    </a>
                  </div>
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
                {application.rejectedDate && (
                  <div className="detail-item">
                    <span className="label">
                      <HiCalendar className="label-icon" />
                      Rejected Date
                    </span>
                    <span className="value">{formatDateOnlyForDisplay(application.rejectedDate)}</span>
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

            {(application.jobDescription || application.requirements) && (
              <div className="detail-section">
                <h3>Job Details</h3>
                {application.jobDescription && (
                  <div className="text-block">
                    <h4>Job Description</h4>
                    <p className="notes">{application.jobDescription}</p>
                  </div>
                )}
                {application.requirements && (
                  <div className="text-block">
                    <h4>Requirements & Qualifications</h4>
                    <p className="notes">{application.requirements}</p>
                  </div>
                )}
              </div>
            )}

            {application.notes && (
              <div className="detail-section">
                <h3>Notes</h3>
                <p className="notes">{application.notes}</p>
              </div>
            )}

            {(application.followUpStatus || application.followUpDate || application.followUpMessage || application.followUpChannel || application.followUpContact || application.followUpContactInfo || application.roleSummary || application.relatedProject) && (
              <div className="detail-section">
                <h3>Follow-up</h3>
                <div className="detail-grid">
                  {application.followUpStatus && (
                    <div className="detail-item">
                      <span className="label">Status</span>
                      <span className="value">{application.followUpStatus}</span>
                    </div>
                  )}
                  {application.followUpDate && (
                    <div className="detail-item">
                      <span className="label">Follow-up Date</span>
                      <span className="value">{formatDateOnlyForDisplay(application.followUpDate)}</span>
                    </div>
                  )}
                  {application.followUpChannel && (
                    <div className="detail-item">
                      <span className="label">Channel</span>
                      <span className="value">{application.followUpChannel === 'linkedin' ? 'LinkedIn' : 'Email'}</span>
                    </div>
                  )}
                  {application.followUpContact && (
                    <div className="detail-item">
                      <span className="label">Contact</span>
                      <span className="value">{application.followUpContact}</span>
                    </div>
                  )}
                  {application.followUpContactInfo && (
                    <div className="detail-item">
                      <span className="label">Contact Info</span>
                      <span className="value">{application.followUpContactInfo}</span>
                    </div>
                  )}
                  {application.roleSummary && (
                    <div className="detail-item">
                      <span className="label">Role Summary</span>
                      <span className="value">{application.roleSummary}</span>
                    </div>
                  )}
                  {application.relatedProject && (
                    <div className="detail-item">
                      <span className="label">Related Project</span>
                      <span className="value">{application.relatedProject}</span>
                    </div>
                  )}
                </div>
                {application.followUpMessage && (
                  <div className="text-block">
                    <h4>Follow-up Message</h4>
                    <p className="notes">{application.followUpMessage}</p>
                  </div>
                )}
              </div>
            )}

            <div className="detail-section">
              <h3>Documents</h3>
              <p className="section-description">Generate tailored documents or download existing files.</p>
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
              {renderVersionList('cv', application.cvVersions)}
              {renderDirectFile('cv', application.cvUrl, 'Uploaded CV', (application.cvVersions?.length ?? 0) > 0)}
              {renderVersionList('coverLetter', application.coverLetterVersions)}
              {renderDirectFile(
                'coverLetter',
                application.coverLetterUrl,
                'Uploaded Cover Letter',
                (application.coverLetterVersions?.length ?? 0) > 0
              )}
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
