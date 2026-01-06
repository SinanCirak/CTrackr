import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiPlusCircle, HiX, HiDocument, HiCloudUpload, HiClipboardCheck, HiInformationCircle, HiClock, HiLocationMarker, HiVideoCamera } from 'react-icons/hi';
import { createApplication, getUploadUrl, uploadFileToS3 } from '../utils/api';
import type { CreateApplicationInput, ApplicationStatus } from '../types/application';
import './NewApplication.css';

export default function NewApplication() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [uploadingCoverLetter, setUploadingCoverLetter] = useState(false);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null);
  const [formData, setFormData] = useState<CreateApplicationInput>({
    company: '',
    position: '',
    status: 'applied',
    appliedDate: new Date().toISOString().split('T')[0],
    location: '',
    jobUrl: '',
    contactEmail: '',
    contactName: '',
    salary: '',
    notes: '',
  });

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
            <label htmlFor="status">Status *</label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              required
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

        {formData.interviewDate && (
          <div className="form-section interview-details">
            <h4>Interview Details</h4>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="interviewTime">
                  <HiClock className="label-icon" />
                  Interview Time
                </label>
                <input
                  type="time"
                  id="interviewTime"
                  name="interviewTime"
                  value={formData.interviewTime || ''}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="interviewPlace">
                  <HiLocationMarker className="label-icon" />
                  Interview Place
                </label>
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
              <label htmlFor="interviewLink">
                <HiVideoCamera className="label-icon" />
                Interview Link (Zoom/Meeting)
              </label>
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
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" onClick={() => navigate('/applications')} className="btn btn-secondary">
            <HiX className="btn-icon" />
            <span>Cancel</span>
          </button>
          <button type="submit" disabled={loading} className="btn btn-primary">
            <HiPlusCircle className="btn-icon" />
            <span>{loading ? 'Creating...' : 'Create Application'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

