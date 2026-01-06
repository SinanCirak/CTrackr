import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiPlusCircle, HiX, HiDocument, HiCloudUpload, HiClipboardCheck, HiInformationCircle, HiSparkles } from 'react-icons/hi';
import { createApplication, getUploadUrl, uploadFileToS3 } from '../utils/api';
import type { CreateApplicationInput, ApplicationStatus } from '../types/application';
import type { UserProfile } from '../types/user';
import './NewApplication.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.example.com';

export default function NewApplication() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [uploadingCoverLetter, setUploadingCoverLetter] = useState(false);
  const [generatingCV, setGeneratingCV] = useState(false);
  const [generatingCoverLetter, setGeneratingCoverLetter] = useState(false);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null);
  const [formData, setFormData] = useState<CreateApplicationInput>({
    company: '',
    position: '',
    status: 'applied', // Always 'applied' for new applications
    appliedDate: new Date().toISOString().split('T')[0],
    location: '',
    jobUrl: '',
    contactEmail: '',
    contactName: '',
    salary: '',
    notes: '',
    jobDescription: '',
    requirements: '',
  });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    // Load user profile from localStorage
    const savedProfile = localStorage.getItem('userProfile');
    if (savedProfile) {
      try {
        const parsed = JSON.parse(savedProfile);
        setUserProfile(parsed);
      } catch (e) {
        console.error('Error loading profile:', e);
      }
    }
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
    const date = new Date().toISOString().split('T')[0];
    
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

      // Get presigned URL
      const { uploadUrl, fileUrl } = await getUploadUrl(newFileName, file.type);

      // Upload file to S3
      await uploadFileToS3(uploadUrl, file);

      // Update form data with file URL
      if (type === 'cv') {
        setFormData(prev => ({ ...prev, cvUrl: fileUrl }));
      } else {
        setFormData(prev => ({ ...prev, coverLetterUrl: fileUrl }));
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
    if (!formData.company || !formData.position) {
      setError('Please fill in company and position first');
      return;
    }

    if (!userProfile || !userProfile.fullName) {
      setError('Please complete your profile first to generate documents');
      navigate('/profile');
      return;
    }

    if (documentType === 'cv' && formData.cvUrl) {
      setError('CV already exists. Please remove it first to generate a new one.');
      return;
    }

    if (documentType === 'coverLetter' && formData.coverLetterUrl) {
      setError('Cover Letter already exists. Please remove it first to generate a new one.');
      return;
    }

    try {
      if (documentType === 'cv') {
        setGeneratingCV(true);
      } else {
        setGeneratingCoverLetter(true);
      }
      setError(null);

      const tempApp = {
        id: 'temp',
        company: formData.company,
        position: formData.position,
        status: 'applied', // Always 'applied' for new applications
        appliedDate: formData.appliedDate,
        location: formData.location,
        salary: formData.salary,
        jobUrl: formData.jobUrl,
        contactName: formData.contactName,
        contactEmail: formData.contactEmail,
        notes: formData.notes,
        jobDescription: formData.jobDescription,
        requirements: formData.requirements,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const response = await fetch(`${API_BASE_URL}/generate-documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userProfile,
          jobApplication: tempApp,
          documentType,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate ${documentType}`);
      }

      const data = await response.json();
      
      // Update form data with the generated document URL
      if (documentType === 'cv') {
        setFormData(prev => ({ ...prev, cvUrl: data.fileUrl }));
        // Create a mock file object for display
        const mockFile = new File([''], 'generated-cv.pdf', { type: 'application/pdf' });
        setCvFile(mockFile);
      } else {
        setFormData(prev => ({ ...prev, coverLetterUrl: data.fileUrl }));
        // Create a mock file object for display
        const mockFile = new File([''], 'generated-cover-letter.pdf', { type: 'application/pdf' });
        setCoverLetterFile(mockFile);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to generate ${documentType}`);
    } finally {
      if (documentType === 'cv') {
        setGeneratingCV(false);
      } else {
        setGeneratingCoverLetter(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await createApplication(formData);
      navigate('/applications');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create application');
    } finally {
      setLoading(false);
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
          <input
            type="url"
            id="jobUrl"
            name="jobUrl"
            value={formData.jobUrl}
            onChange={handleChange}
            placeholder="https://..."
          />
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
          <h4>Job Details (for AI Generation)</h4>
          <p className="section-description">Provide detailed information about the job to help AI generate better CV and Cover Letter.</p>
          
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
              <div className="file-upload-wrapper">
                <input
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
              {formData.cvUrl && cvFile && (
                <div className="uploaded-file-display">
                  <div className="uploaded-file-info">
                    <HiDocument className="uploaded-file-icon" />
                    <span className="uploaded-file-name">{cvFile.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, cvUrl: undefined }));
                        setCvFile(null);
                      }}
                      className="remove-file-btn"
                      aria-label="Remove file"
                    >
                      <HiX />
                    </button>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => handleGenerateDocument('cv')}
                disabled={generatingCV || !!formData.cvUrl}
                className="btn-generate-doc"
              >
                {generatingCV ? (
                  <>
                    <div className="spinner-small"></div>
                    <span>Generating CV...</span>
                  </>
                ) : (
                  <>
                    <HiSparkles className="btn-icon" />
                    <span>Generate CV</span>
                  </>
                )}
              </button>
            </div>

            <div className="form-group">
              <label htmlFor="coverLetter">
                <HiDocument className="label-icon" />
                Cover Letter
              </label>
              <div className="file-upload-wrapper">
                <input
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
              {formData.coverLetterUrl && coverLetterFile && (
                <div className="uploaded-file-display">
                  <div className="uploaded-file-info">
                    <HiDocument className="uploaded-file-icon" />
                    <span className="uploaded-file-name">{coverLetterFile.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, coverLetterUrl: undefined }));
                        setCoverLetterFile(null);
                      }}
                      className="remove-file-btn"
                      aria-label="Remove file"
                    >
                      <HiX />
                    </button>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => handleGenerateDocument('coverLetter')}
                disabled={generatingCoverLetter || !!formData.coverLetterUrl}
                className="btn-generate-doc"
              >
                {generatingCoverLetter ? (
                  <>
                    <div className="spinner-small"></div>
                    <span>Generating Cover Letter...</span>
                  </>
                ) : (
                  <>
                    <HiSparkles className="btn-icon" />
                    <span>Generate Cover Letter</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <div className="form-actions-buttons">
            <button type="submit" disabled={loading} className="btn btn-primary">
              <HiPlusCircle className="btn-icon" />
              <span>{loading ? 'Creating...' : 'Create Application'}</span>
            </button>
            <button type="button" onClick={() => navigate('/applications')} className="btn btn-secondary">
              <HiX className="btn-icon" />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

