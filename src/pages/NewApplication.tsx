import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiPlusCircle, HiX, HiDocument, HiCloudUpload, HiClipboardCheck, HiInformationCircle, HiDownload, HiSparkles } from 'react-icons/hi';
import { useAuth } from '../contexts/AuthContext';
import { createApplication, getUploadUrl, uploadFileToS3, deleteFile, getProfile, extractJobInformation, getMatchScore } from '../utils/api';
import { getTodayDateLocalISO } from '../utils/date';
import type { CreateApplicationInput, DocumentVersion } from '../types/application';
import './NewApplication.css';

export default function NewApplication() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [uploadingCoverLetter, setUploadingCoverLetter] = useState(false);
  const [fetchingJobInfo, setFetchingJobInfo] = useState(false);
  const [jobInfoStatus, setJobInfoStatus] = useState<string | null>(null);
  const [calculatingMatch, setCalculatingMatch] = useState(false);
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [matchSummary, setMatchSummary] = useState<string | null>(null);
  const [generating, setGenerating] = useState({ cv: false, coverLetter: false });
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null);
  const generatedFileKeysRef = useRef<string[]>([]);
  const createdRef = useRef(false);
  const cvFileInputRef = useRef<HTMLInputElement>(null);
  const coverLetterFileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<CreateApplicationInput>({
    company: '',
    position: '',
    status: 'applied', // Always 'applied' for new applications
    appliedDate: getTodayDateLocalISO(),
    location: '',
    jobUrl: '',
    contactEmail: '',
    contactName: '',
    salary: '',
    notes: '',
    jobDescription: '',
    requirements: '',
    cvVersions: [],
    coverLetterVersions: [],
  });

  const getMatchScoreMeta = (score: number | null) => {
    if (score === null) {
      return {
        tone: 'neutral',
        label: 'Not Calculated',
        guidance: 'Run the score to see how strong this match looks.',
      };
    }

    if (score < 50) {
      return {
        tone: 'low',
        label: 'Do Not Apply',
        guidance: 'Mismatch. This is likely a poor use of time unless you are only exploring.',
      };
    }

    if (score < 65) {
      return {
        tone: 'caution',
        label: 'Low Priority',
        guidance: 'Risky match. Apply selectively if you are casting a wide net.',
      };
    }

    if (score < 75) {
      return {
        tone: 'good',
        label: 'Apply',
        guidance: 'Borderline but viable. A strong resume and story could still earn an interview.',
      };
    }

    if (score < 85) {
      return {
        tone: 'strong',
        label: 'Strong Candidate',
        guidance: 'Good fit. Most requirements line up and this is worth prioritizing.',
      };
    }

    return {
      tone: 'excellent',
      label: 'Excellent Match',
      guidance: 'Near-perfect fit. Interview odds should be meaningfully stronger here.',
    };
  };
  const matchScoreMeta = getMatchScoreMeta(matchScore);

  const buildVersionEntry = (fileUrl: string, fileKey: string | undefined, version: number, source: 'generated' | 'uploaded'): DocumentVersion => ({
    version,
    label: `v${version}`,
    url: fileUrl,
    fileKey,
    createdAt: new Date().toISOString(),
    source,
  });

  const removeVersion = (versions: DocumentVersion[] | undefined, fileKey?: string, url?: string) => {
    if (!versions || versions.length === 0) return [];
    return versions.filter(version => {
      if (fileKey && version.fileKey === fileKey) return false;
      if (url && version.url === url) return false;
      return true;
    });
  };

  const deleteGeneratedVersions = async (versions: DocumentVersion[] | undefined) => {
    if (!versions || versions.length === 0) return;
    const generatedKeys = versions
      .filter(version => version.source === 'generated' && version.fileKey)
      .map(version => version.fileKey as string);
    if (generatedKeys.length === 0) return;
    await Promise.all(generatedKeys.map(fileKey => deleteFile(fileKey)));
  };

  const handleCancel = async () => {
    try {
      await deleteGeneratedVersions(formData.cvVersions);
      await deleteGeneratedVersions(formData.coverLetterVersions);
      if (generatedFileKeysRef.current.length > 0) {
        await Promise.all(generatedFileKeysRef.current.map(fileKey => deleteFile(fileKey)));
      }
    } catch (err) {
      console.error('Failed to delete generated files on cancel:', err);
    } finally {
      createdRef.current = true;
      navigate('/applications');
    }
  };

  useEffect(() => {
    return () => {
      if (createdRef.current) return;
      const keys = generatedFileKeysRef.current;
      if (keys.length === 0) return;
      keys.forEach(async (fileKey) => {
        try {
          await deleteFile(fileKey);
        } catch (err) {
          console.error('Failed to cleanup generated file:', err);
        }
      });
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const generateFileName = (originalFileName: string, type: 'cv' | 'coverLetter', companyName: string): string => {
    // Get file extension
    const fileExtension = originalFileName.split('.').pop() || 'pdf';
    
    // Sanitize company name (remove special characters, spaces to underscores)
    const sanitizedCompany = companyName
      .trim()
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase()
      .substring(0, 50); // Limit length
    
    // Get current date in YYYY-MM-DD format
    const date = getTodayDateLocalISO();
    
    // Generate new file name
    const prefix = type === 'cv' ? 'CV' : 'CoverLetter';
    return `${prefix}_${sanitizedCompany}_${date}.${fileExtension}`;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'cv' | 'coverLetter') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if company name is provided
    if (!formData.company || formData.company.trim() === '') {
      setError('Please enter company name before uploading files.');
      return;
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Only PDF and DOC/DOCX files are allowed.');
      return;
    }

    // Validate file size (max 10MB)
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

      // Generate file name with company name and date
      const newFileName = generateFileName(file.name, type, formData.company);

      // Get userId from user object (Cognito sub or mock userId)
      const userId = user?.userId || (user as any)?.sub || (user as any)?.username;
      
      // Get presigned URL with userId, companyName, and fileCategory
      const { uploadUrl, fileUrl, fileKey } = await getUploadUrl(
        newFileName, 
        file.type, 
        userId, 
        formData.company, 
        type === 'cv' ? 'CV' : 'CoverLetter'
      );

      // Upload file to S3
      await uploadFileToS3(uploadUrl, file);

      // Update form data with file URL, fileKey, and version history
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Get userId from user object (Cognito sub or mock userId)
    const userId = user?.userId || (user as any)?.sub || (user as any)?.username;
    
    if (!userId) {
      setError('Please sign in to create an application');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createApplication({ ...formData, userId });
      createdRef.current = true;
      navigate('/applications');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create application');
    } finally {
      setLoading(false);
    }
  };

  const cleanAutofillValue = (value: string | undefined, maxLength: number, preserveLines = false) => {
    const raw = String(value || '');
    const cleaned = preserveLines
      ? raw.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
      : raw.replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    if (cleaned === '[object Object]') return '';
    if (cleaned.toLowerCase().startsWith('job description:') && maxLength < 500) return '';
    if (cleaned.length > maxLength) return '';
    return cleaned;
  };

  const normalizeCompanyName = (value: string | undefined) => {
    const cleaned = String(value || '').trim();
    if (!cleaned) return '';

    const companyAliases: Array<{ pattern: RegExp; value: string }> = [
      { pattern: /^bank of montreal$/i, value: 'BMO' },
    ];

    const match = companyAliases.find(alias => alias.pattern.test(cleaned));
    return match ? match.value : cleaned;
  };

  const getStoredProfile = () => {
    try {
      const savedProfile = localStorage.getItem('userProfile');
      if (!savedProfile) return null;
      return JSON.parse(savedProfile);
    } catch (error) {
      console.error('Failed to load local profile for match score:', error);
      return null;
    }
  };

  const calculateMatchScore = async (applicationData: CreateApplicationInput, autoTriggered = false) => {
    const positionText = String(applicationData.position || '').trim();
    const requirementsText = String(applicationData.requirements || '').trim();
    const descriptionText = String(applicationData.jobDescription || '').trim();

    if (!positionText && !requirementsText && !descriptionText) {
      if (!autoTriggered) {
        setError('Please enter the job description or requirements before calculating match score.');
      }
      return;
    }

    const userId = user?.userId || (user as any)?.sub || (user as any)?.username;

    try {
      setCalculatingMatch(true);
      setError(null);
      setMatchSummary(autoTriggered ? 'Calculating match score from the fetched job information...' : 'Calculating your match score...');

      const profile = (userId ? await getProfile(userId) : null) || getStoredProfile();

      if (!profile) {
        setMatchScore(null);
        setMatchSummary('Add your profile details first so match score can compare your experience with the job.');
        return;
      }

      const result = await getMatchScore(profile, applicationData);
      const summaryParts = [
        result.summary,
        ...(result.strengths || []).slice(0, 2).map(item => `Strength: ${item}`),
        ...(result.gaps || []).slice(0, 1).map(item => `Gap: ${item}`),
      ].filter(Boolean);

      setMatchScore(result.score);
      setMatchSummary(summaryParts.join(' | '));
    } catch (err) {
      console.error('Failed to calculate match score:', err);
      setMatchScore(null);
      setMatchSummary('Could not calculate match score right now.');
      if (!autoTriggered) {
        setError(err instanceof Error ? err.message : 'Failed to calculate match score');
      }
    } finally {
      setCalculatingMatch(false);
    }
  };

  const handleGetInformation = async () => {
    if (!formData.jobUrl || !formData.jobUrl.trim()) {
      setError('Please enter a job URL first.');
      return;
    }

    try {
      setFetchingJobInfo(true);
      setJobInfoStatus('Getting information from the job post...');
      setError(null);

      const result = await extractJobInformation(formData.jobUrl.trim());
      setJobInfoStatus('Parsing and filling the form...');
      const nextFormData: CreateApplicationInput = {
        ...formData,
        jobUrl: result.sourceUrl || formData.jobUrl,
        company: normalizeCompanyName(cleanAutofillValue(result.company, 160)) || formData.company,
        position: cleanAutofillValue(result.position, 220) || formData.position,
        location: cleanAutofillValue(result.location, 220) || formData.location,
        salary: cleanAutofillValue(result.salary, 160) || formData.salary,
        contactEmail: cleanAutofillValue(result.contactEmail, 160) || formData.contactEmail,
        contactName: cleanAutofillValue(result.contactName, 160) || formData.contactName,
        jobDescription: cleanAutofillValue(result.jobDescription, 8000, true) || formData.jobDescription,
        requirements: cleanAutofillValue(result.requirements, 5000, true) || formData.requirements,
      };
      setFormData(prev => ({
        ...prev,
        ...nextFormData,
      }));
      await calculateMatchScore(nextFormData, true);
      setJobInfoStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get job information');
      setJobInfoStatus(null);
    } finally {
      setFetchingJobInfo(false);
    }
  };

  const handleGenerateDocument = async (documentType: 'cv' | 'coverLetter') => {
    if (!formData.company || !formData.position) {
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
          jobApplication: formData,
          documentType,
          timezoneOffset,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to generate document.');
      }

      const result = await response.json();
      const nextParsedJob = result.haikuPrep
        ? { ...(formData.parsedJob || {}), haikuPrep: result.haikuPrep }
        : formData.parsedJob;

      if (documentType === 'cv') {
        setFormData(prev => {
          const currentVersions = prev.cvVersions ?? [];
          const fallbackVersion = currentVersions.length + 1;
          const versionNumber = typeof result.version === 'number' ? result.version : fallbackVersion;
          const newVersion = buildVersionEntry(result.fileUrl, result.s3Key, versionNumber, 'generated');
          return {
            ...prev,
            cvUrl: result.fileUrl,
            cvFileKey: result.s3Key,
            cvVersions: [...currentVersions, newVersion],
            parsedJob: nextParsedJob,
          };
        });
        if (result.s3Key) {
          generatedFileKeysRef.current = [...generatedFileKeysRef.current, result.s3Key];
        }
      } else {
        setFormData(prev => {
          const currentVersions = prev.coverLetterVersions ?? [];
          const fallbackVersion = currentVersions.length + 1;
          const versionNumber = typeof result.version === 'number' ? result.version : fallbackVersion;
          const newVersion = buildVersionEntry(result.fileUrl, result.s3Key, versionNumber, 'generated');
          return {
            ...prev,
            coverLetterUrl: result.fileUrl,
            coverLetterFileKey: result.s3Key,
            coverLetterVersions: [...currentVersions, newVersion],
            parsedJob: nextParsedJob,
          };
        });
        if (result.s3Key) {
          generatedFileKeysRef.current = [...generatedFileKeysRef.current, result.s3Key];
        }
      }
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Failed to generate document.');
    } finally {
      setGenerating(prev => ({ ...prev, [documentType]: false }));
    }
  };

  return (
    <div className="new-application">
      <div className="page-hero">
        <div className="hero-icon">
          <HiPlusCircle />
        </div>
        <h1>Add New Application</h1>
        <p>Create a new job application entry. Fill in the details below to start tracking your application.</p>
      </div>

      <div className="info-cards">
        <div className="info-card">
          <HiInformationCircle className="info-icon" />
          <div className="info-content">
            <h3>Quick Tips</h3>
            <p>Make sure to include all relevant details like company name, position, and application date for better tracking.</p>
          </div>
        </div>
        <div className="info-card">
          <HiClipboardCheck className="info-icon" />
          <div className="info-content">
            <h3>Documents</h3>
            <p>You can upload your CV and Cover Letter. Supported formats: PDF, DOC, DOCX (max 10MB).</p>
          </div>
        </div>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      {generationError && <div className="error-message">{generationError}</div>}

      <form onSubmit={handleSubmit} className="application-form">
        <div className="form-group">
          <label htmlFor="company">Company *</label>
          <input
            type="text"
            id="company"
            name="company"
            value={formData.company}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="position">Position *</label>
          <input
            type="text"
            id="position"
            name="position"
            value={formData.position}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="appliedDate">Applied Date *</label>
            <input
              type="date"
              id="appliedDate"
              name="appliedDate"
              value={formData.appliedDate}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="location">Location</label>
            <input
              type="text"
              id="location"
              name="location"
              value={formData.location}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="salary">Salary</label>
            <input
              type="text"
              id="salary"
              name="salary"
              value={formData.salary}
              onChange={handleChange}
              placeholder="e.g., $100k - $120k"
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="jobUrl">Job URL</label>
          <div className="job-url-row">
            <input
              type="url"
              id="jobUrl"
              name="jobUrl"
              value={formData.jobUrl}
              onChange={handleChange}
              placeholder="https://..."
            />
            <button
              type="button"
              className="btn btn-secondary job-info-btn"
              onClick={handleGetInformation}
              disabled={fetchingJobInfo}
            >
              <HiSparkles className="btn-icon" />
              <span>{fetchingJobInfo ? 'Getting...' : 'Get Information'}</span>
            </button>
          </div>
          {jobInfoStatus && <p className="job-info-status">{jobInfoStatus}</p>}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="contactName">Contact Name</label>
            <input
              type="text"
              id="contactName"
              name="contactName"
              value={formData.contactName}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label htmlFor="contactEmail">Contact Email</label>
            <input
              type="email"
              id="contactEmail"
              name="contactEmail"
              value={formData.contactEmail}
              onChange={handleChange}
            />
          </div>
        </div>

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
            value={formData.notes}
            onChange={handleChange}
            rows={5}
            placeholder="Additional notes about this application..."
          />
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
                className="btn-generate-doc"
                onClick={() => handleGenerateDocument('cv')}
                disabled={generating.cv}
              >
                {generating.cv ? (
                  <>
                    <span className="spinner-small" />
                    Generating CV...
                  </>
                ) : (
                  'Generate CV'
                )}
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
                  {uploadingCv ? (
                    <span>Uploading...</span>
                  ) : cvFile ? (
                    <span>✓ {cvFile.name}</span>
                  ) : (
                    <span>Choose CV File (PDF, DOC, DOCX)</span>
                  )}
                </label>
              </div>
              {formData.cvUrl && !cvFile && !(formData.cvVersions && formData.cvVersions.length > 0) && (
                <div className="uploaded-file-display">
                  <div className="uploaded-file-info">
                    <HiDocument className="uploaded-file-icon" />
                    <span className="uploaded-file-name">Generated CV</span>
                    <a
                      href={formData.cvUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="remove-file-btn"
                      aria-label="Download generated CV"
                    >
                      <HiDownload />
                    </a>
                  </div>
                </div>
              )}
              {formData.cvVersions && formData.cvVersions.length > 0 && (
                <div className="uploaded-file-display">
                  <div className="uploaded-file-info">
                    <HiDocument className="uploaded-file-icon" />
                    <span className="uploaded-file-name">Generated CV Versions</span>
                  </div>
                  {formData.cvVersions.map(version => (
                    <div key={`cv-version-${version.version}`} className="uploaded-file-info">
                      <span className="uploaded-file-name">{version.label}</span>
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
                        onClick={async () => {
                          try {
                            if (version.fileKey) {
                              await deleteFile(version.fileKey);
                            }
                          } catch (err) {
                            console.error('Error deleting file from S3:', err);
                          }
                          setFormData(prev => {
                            const updatedVersions = removeVersion(prev.cvVersions, version.fileKey, version.url);
                            const latest = updatedVersions[updatedVersions.length - 1];
                            return {
                              ...prev,
                              cvVersions: updatedVersions,
                              cvUrl: latest?.url,
                              cvFileKey: latest?.fileKey,
                            };
                          });
                        }}
                        aria-label={`Delete ${version.label}`}
                      >
                        <HiX />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {formData.cvUrl && cvFile && (
                <div className="uploaded-file-display">
                  <div className="uploaded-file-info">
                    <HiDocument className="uploaded-file-icon" />
                    <span className="uploaded-file-name">{cvFile.name}</span>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('Delete CV button clicked');
                        console.log('formData.cvFileKey:', formData.cvFileKey);
                        console.log('formData.cvUrl:', formData.cvUrl);
                        try {
                          // Delete file from S3 if fileKey exists
                          let fileKeyToDelete = formData.cvFileKey;
                          
                          // If no fileKey but URL exists, try to extract key from URL
                          if (!fileKeyToDelete && formData.cvUrl) {
                            console.log('No cvFileKey found, trying to extract from URL');
                            // Try to extract key from URL (pattern: userId/CV_CompanyName_DDMMYYYY_HHMM.ext)
                            const urlMatch = formData.cvUrl.match(/([a-zA-Z0-9_-]+\/(?:CV|CoverLetter)_[^\/\?]+\.(pdf|doc|docx))(?:\?|$)/);
                            if (urlMatch) {
                              fileKeyToDelete = urlMatch[1];
                              console.log('Extracted fileKey from URL:', fileKeyToDelete);
                            } else {
                              console.warn('Could not extract fileKey from URL:', formData.cvUrl);
                            }
                          }
                          
                          if (fileKeyToDelete) {
                            console.log('Deleting file from S3 with key:', fileKeyToDelete);
                            await deleteFile(fileKeyToDelete);
                            console.log('File deleted successfully from S3');
                          } else {
                            console.warn('No fileKey found, skipping S3 deletion');
                          }
                        } catch (err) {
                          console.error('Error deleting file from S3:', err);
                          // Continue with state cleanup even if S3 deletion fails
                        }
                        // Clear state
                        setFormData(prev => ({
                          ...prev,
                          cvUrl: undefined,
                          cvFileKey: undefined,
                          cvVersions: removeVersion(prev.cvVersions, formData.cvFileKey, formData.cvUrl),
                        }));
                        setCvFile(null);
                        // Clear file input value to allow re-upload
                        if (cvFileInputRef.current) {
                          cvFileInputRef.current.value = '';
                        }
                        console.log('State cleared');
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      className="remove-file-btn"
                      aria-label="Remove file"
                    >
                      <HiX />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="coverLetter">
                <HiDocument className="label-icon" />
                Cover Letter
              </label>
              <button
                type="button"
                className="btn-generate-doc"
                onClick={() => handleGenerateDocument('coverLetter')}
                disabled={generating.coverLetter}
              >
                {generating.coverLetter ? (
                  <>
                    <span className="spinner-small" />
                    Generating Cover Letter...
                  </>
                ) : (
                  'Generate Cover Letter'
                )}
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
                  {uploadingCoverLetter ? (
                    <span>Uploading...</span>
                  ) : coverLetterFile ? (
                    <span>✓ {coverLetterFile.name}</span>
                  ) : (
                    <span>Choose Cover Letter (PDF, DOC, DOCX)</span>
                  )}
                </label>
              </div>
              {formData.coverLetterUrl && !coverLetterFile && !(formData.coverLetterVersions && formData.coverLetterVersions.length > 0) && (
                <div className="uploaded-file-display">
                  <div className="uploaded-file-info">
                    <HiDocument className="uploaded-file-icon" />
                    <span className="uploaded-file-name">Generated Cover Letter</span>
                    <a
                      href={formData.coverLetterUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="remove-file-btn"
                      aria-label="Download generated cover letter"
                    >
                      <HiDownload />
                    </a>
                  </div>
                </div>
              )}
              {formData.coverLetterVersions && formData.coverLetterVersions.length > 0 && (
                <div className="uploaded-file-display">
                  <div className="uploaded-file-info">
                    <HiDocument className="uploaded-file-icon" />
                    <span className="uploaded-file-name">Generated Cover Letter Versions</span>
                  </div>
                  {formData.coverLetterVersions.map(version => (
                    <div key={`cover-version-${version.version}`} className="uploaded-file-info">
                      <span className="uploaded-file-name">{version.label}</span>
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
                        onClick={async () => {
                          try {
                            if (version.fileKey) {
                              await deleteFile(version.fileKey);
                            }
                          } catch (err) {
                            console.error('Error deleting file from S3:', err);
                          }
                          setFormData(prev => {
                            const updatedVersions = removeVersion(prev.coverLetterVersions, version.fileKey, version.url);
                            const latest = updatedVersions[updatedVersions.length - 1];
                            return {
                              ...prev,
                              coverLetterVersions: updatedVersions,
                              coverLetterUrl: latest?.url,
                              coverLetterFileKey: latest?.fileKey,
                            };
                          });
                        }}
                        aria-label={`Delete ${version.label}`}
                      >
                        <HiX />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {formData.coverLetterUrl && coverLetterFile && (
                <div className="uploaded-file-display">
                  <div className="uploaded-file-info">
                    <HiDocument className="uploaded-file-icon" />
                    <span className="uploaded-file-name">{coverLetterFile.name}</span>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('Delete Cover Letter button clicked');
                        console.log('formData.coverLetterFileKey:', formData.coverLetterFileKey);
                        console.log('formData.coverLetterUrl:', formData.coverLetterUrl);
                        try {
                          // Delete file from S3 if fileKey exists
                          let fileKeyToDelete = formData.coverLetterFileKey;
                          
                          // If no fileKey but URL exists, try to extract key from URL
                          if (!fileKeyToDelete && formData.coverLetterUrl) {
                            console.log('No coverLetterFileKey found, trying to extract from URL');
                            // Try to extract key from URL (pattern: userId/CV_CompanyName_DDMMYYYY_HHMM.ext)
                            const urlMatch = formData.coverLetterUrl.match(/([a-zA-Z0-9_-]+\/(?:CV|CoverLetter)_[^\/\?]+\.(pdf|doc|docx))(?:\?|$)/);
                            if (urlMatch) {
                              fileKeyToDelete = urlMatch[1];
                              console.log('Extracted fileKey from URL:', fileKeyToDelete);
                            } else {
                              console.warn('Could not extract fileKey from URL:', formData.coverLetterUrl);
                            }
                          }
                          
                          if (fileKeyToDelete) {
                            console.log('Deleting file from S3 with key:', fileKeyToDelete);
                            await deleteFile(fileKeyToDelete);
                            console.log('File deleted successfully from S3');
                          } else {
                            console.warn('No fileKey found, skipping S3 deletion');
                          }
                        } catch (err) {
                          console.error('Error deleting file from S3:', err);
                          // Continue with state cleanup even if S3 deletion fails
                        }
                        // Clear state
                        setFormData(prev => ({
                          ...prev,
                          coverLetterUrl: undefined,
                          coverLetterFileKey: undefined,
                          coverLetterVersions: removeVersion(prev.coverLetterVersions, formData.coverLetterFileKey, formData.coverLetterUrl),
                        }));
                        setCoverLetterFile(null);
                        // Clear file input value to allow re-upload
                        if (coverLetterFileInputRef.current) {
                          coverLetterFileInputRef.current.value = '';
                        }
                        console.log('State cleared');
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      className="remove-file-btn"
                      aria-label="Remove file"
                    >
                      <HiX />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`match-score-section match-score-section-${matchScoreMeta.tone}`} aria-live="polite">
          <div className="match-score-header">
            <div>
              <span className="match-score-eyebrow">Match Score</span>
              <h4>How well your profile matches this role</h4>
              <p className="match-score-copy">
                If job data is fetched from a URL, the score is calculated automatically. If you enter details manually, use the button to calculate it.
              </p>
            </div>
            <div className="match-score-display">
              <div className={`match-score-value ${matchScore !== null ? 'has-score' : ''} match-score-value-${matchScoreMeta.tone}`}>
                {calculatingMatch ? '...' : matchScore !== null ? `${matchScore}/100` : '--/100'}
              </div>
              <span className={`match-score-badge match-score-badge-${matchScoreMeta.tone}`}>
                {calculatingMatch ? 'Calculating' : matchScoreMeta.label}
              </span>
            </div>
          </div>

          <div className="match-score-actions">
            <button
              type="button"
              className="btn btn-primary match-score-btn"
              onClick={() => calculateMatchScore(formData)}
              disabled={calculatingMatch}
            >
              <HiSparkles className="btn-icon" />
              <span>{calculatingMatch ? 'Calculating...' : 'Calculate Match'}</span>
            </button>
            <div className="match-score-text">
              <p className="match-score-guidance">{matchScoreMeta.guidance}</p>
              {matchSummary && <p className="match-score-summary">{matchSummary}</p>}
            </div>
          </div>
        </div>

        <div className="form-actions">
          <div className="form-actions-buttons">
            <button type="submit" disabled={loading} className="btn btn-primary">
              <HiPlusCircle className="btn-icon" />
              <span>{loading ? 'Creating...' : 'Create Application'}</span>
            </button>
            <button type="button" onClick={handleCancel} className="btn btn-secondary">
              <HiX className="btn-icon" />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

