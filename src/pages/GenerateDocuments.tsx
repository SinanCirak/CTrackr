import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HiDocument, HiDownload, HiSparkles, HiArrowLeft, HiCheckCircle, HiXCircle } from 'react-icons/hi';
import { getApplication } from '../utils/api';
import type { JobApplication } from '../types/application';
import type { UserProfile } from '../types/user';
import './GenerateDocuments.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.example.com';

export default function GenerateDocuments() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [application, setApplication] = useState<JobApplication | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingCV, setGeneratingCV] = useState(false);
  const [generatingCoverLetter, setGeneratingCoverLetter] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [coverLetterUrl, setCoverLetterUrl] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      setLoading(true);
      
      // Load application
      if (id) {
        const app = await getApplication(id);
        setApplication(app);
      } else {
        // Check for temp application from New Application page
        const tempApp = localStorage.getItem('tempApplication');
        if (tempApp) {
          try {
            const parsed = JSON.parse(tempApp);
            setApplication(parsed);
            localStorage.removeItem('tempApplication');
          } catch (e) {
            console.error('Error loading temp application:', e);
          }
        }
      }

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  const generateDocument = async (documentType: 'cv' | 'coverLetter') => {
    if (!application || !userProfile) {
      setError('Application and user profile are required');
      return;
    }

    try {
      if (documentType === 'cv') {
        setGeneratingCV(true);
      } else {
        setGeneratingCoverLetter(true);
      }
      setError(null);
      setSuccess(null);

      const timezoneOffset = -new Date().getTimezoneOffset();
      const response = await fetch(`${API_BASE_URL}/generate-documents`, {
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
        throw new Error(`Failed to generate ${documentType}`);
      }

      const data = await response.json();
      
      if (documentType === 'cv') {
        setCvUrl(data.fileUrl);
        setSuccess('CV generated successfully!');
      } else {
        setCoverLetterUrl(data.fileUrl);
        setSuccess('Cover Letter generated successfully!');
      }

      // Update application with the new document URL
      if (id) {
        const updateData: any = {};
        if (documentType === 'cv') {
          updateData.cvUrl = data.fileUrl;
        } else {
          updateData.coverLetterUrl = data.fileUrl;
        }
        // You can call updateApplication here if needed
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

  if (loading) {
    return (
      <div className="generate-documents">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading application and profile...</p>
        </div>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="generate-documents">
        <div className="error-state">
          <HiXCircle className="error-icon" />
          <p>Application not found</p>
          <button onClick={() => navigate('/applications')} className="btn btn-primary">
            Back to Applications
          </button>
        </div>
      </div>
    );
  }

  if (!userProfile || !userProfile.fullName) {
    return (
      <div className="generate-documents">
        <div className="error-state">
          <HiXCircle className="error-icon" />
          <p>Please complete your profile first to generate documents</p>
          <button onClick={() => navigate('/profile')} className="btn btn-primary">
            Go to Profile
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="generate-documents">
      <div className="page-header">
        <button onClick={() => navigate(`/applications/${id}`)} className="back-btn">
          <HiArrowLeft className="btn-icon" />
          <span>Back</span>
        </button>
        <h1>Generate Documents</h1>
        <p>Create personalized CV and Cover Letter for {application.company}</p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div className="application-info">
        <h2>
          <HiDocument className="section-icon" />
          Application Details
        </h2>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Company</span>
            <span className="info-value">{application.company}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Position</span>
            <span className="info-value">{application.position}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Applied Date</span>
            <span className="info-value">{new Date(application.appliedDate).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      <div className="documents-section">
        <h2>
          <HiSparkles className="section-icon" />
          Generate Documents
        </h2>
        <p className="section-description">
          Use AI to generate personalized CV and Cover Letter tailored to this job application.
          You can generate them separately or both at once.
        </p>

        <div className="documents-grid">
          <div className="document-card">
            <div className="document-header">
              <HiDocument className="document-icon" />
              <h3>CV / Resume</h3>
            </div>
            <p className="document-description">
              Generate a professional CV tailored to the {application.position} position at {application.company}
            </p>
            {cvUrl ? (
              <div className="document-success">
                <HiCheckCircle className="success-icon" />
                <p>CV Generated Successfully!</p>
                <a href={cvUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                  <HiDownload className="btn-icon" />
                  Download CV
                </a>
              </div>
            ) : (
              <button
                onClick={() => generateDocument('cv')}
                disabled={generatingCV}
                className="btn btn-primary btn-generate"
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
            )}
          </div>

          <div className="document-card">
            <div className="document-header">
              <HiDocument className="document-icon" />
              <h3>Cover Letter</h3>
            </div>
            <p className="document-description">
              Generate a compelling cover letter for {application.company} highlighting your relevant experience
            </p>
            {coverLetterUrl ? (
              <div className="document-success">
                <HiCheckCircle className="success-icon" />
                <p>Cover Letter Generated Successfully!</p>
                <a href={coverLetterUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                  <HiDownload className="btn-icon" />
                  Download Cover Letter
                </a>
              </div>
            ) : (
              <button
                onClick={() => generateDocument('coverLetter')}
                disabled={generatingCoverLetter}
                className="btn btn-primary btn-generate"
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
            )}
          </div>
        </div>

        <div className="generate-both-section">
          <button
            onClick={() => {
              generateDocument('cv');
              setTimeout(() => generateDocument('coverLetter'), 1000);
            }}
            disabled={generatingCV || generatingCoverLetter}
            className="btn btn-secondary btn-generate-both"
          >
            <HiSparkles className="btn-icon" />
            <span>Generate Both Documents</span>
          </button>
        </div>
      </div>
    </div>
  );
}

