import { useState, useEffect } from 'react';
import { HiUser, HiMail, HiPhone, HiLocationMarker, HiLink, HiBriefcase, HiAcademicCap, HiBadgeCheck, HiGlobe, HiPlus, HiX, HiSave, HiDocumentText } from 'react-icons/hi';
import { useAuth } from '../contexts/AuthContext';
import type { UserProfile, WorkExperience, Education, Certification, Language } from '../types/user';
import './Profile.css';

export default function Profile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [profile, setProfile] = useState<Partial<UserProfile>>({
    fullName: '',
    email: user?.signInDetails?.loginId || '',
    phone: '',
    address: '',
    linkedinUrl: '',
    githubUrl: '',
    portfolioUrl: '',
    summary: '',
    skills: [],
    experience: [],
    education: [],
    certifications: [],
    languages: [],
  });

  const [newSkill, setNewSkill] = useState('');
  const [editingExperience, setEditingExperience] = useState<WorkExperience | null>(null);
  const [editingEducation, setEditingEducation] = useState<Education | null>(null);
  const [editingCertification, setEditingCertification] = useState<Certification | null>(null);
  const [editingLanguage, setEditingLanguage] = useState<Language | null>(null);

  useEffect(() => {
    // Load profile from localStorage or API
    const savedProfile = localStorage.getItem('userProfile');
    if (savedProfile) {
      try {
        const parsed = JSON.parse(savedProfile);
        setProfile(parsed);
      } catch (e) {
        console.error('Error loading profile:', e);
      }
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleAddSkill = () => {
    if (newSkill.trim() && !profile.skills?.includes(newSkill.trim())) {
      setProfile(prev => ({
        ...prev,
        skills: [...(prev.skills || []), newSkill.trim()],
      }));
      setNewSkill('');
    }
  };

  const handleRemoveSkill = (skill: string) => {
    setProfile(prev => ({
      ...prev,
      skills: prev.skills?.filter(s => s !== skill) || [],
    }));
  };

  const handleAddExperience = () => {
    const newExp: WorkExperience = {
      id: Date.now().toString(),
      company: '',
      position: '',
      startDate: '',
      current: false,
      description: '',
      achievements: [],
    };
    setEditingExperience(newExp);
  };

  const handleSaveExperience = () => {
    if (!editingExperience) return;
    const existing = profile.experience || [];
    const index = existing.findIndex(e => e.id === editingExperience.id);
    if (index >= 0) {
      const updated = [...existing];
      updated[index] = editingExperience;
      setProfile(prev => ({ ...prev, experience: updated }));
    } else {
      setProfile(prev => ({ ...prev, experience: [...existing, editingExperience] }));
    }
    setEditingExperience(null);
  };

  const handleRemoveExperience = (id: string) => {
    setProfile(prev => ({
      ...prev,
      experience: prev.experience?.filter(e => e.id !== id) || [],
    }));
  };

  const handleAddEducation = () => {
    const newEdu: Education = {
      id: Date.now().toString(),
      institution: '',
      degree: '',
      field: '',
      startDate: '',
      current: false,
    };
    setEditingEducation(newEdu);
  };

  const handleSaveEducation = () => {
    if (!editingEducation) return;
    const existing = profile.education || [];
    const index = existing.findIndex(e => e.id === editingEducation.id);
    if (index >= 0) {
      const updated = [...existing];
      updated[index] = editingEducation;
      setProfile(prev => ({ ...prev, education: updated }));
    } else {
      setProfile(prev => ({ ...prev, education: [...existing, editingEducation] }));
    }
    setEditingEducation(null);
  };

  const handleRemoveEducation = (id: string) => {
    setProfile(prev => ({
      ...prev,
      education: prev.education?.filter(e => e.id !== id) || [],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Save to localStorage (later will be API)
      localStorage.setItem('userProfile', JSON.stringify(profile));
      setSuccess('Profile saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-page">
      <div className="page-hero">
        <div className="hero-icon">
          <HiUser />
        </div>
        <h1>My Profile</h1>
        <p>Complete your profile to generate personalized CVs and cover letters</p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div className="profile-form">
        <div className="form-section">
          <h2>
            <HiUser className="section-icon" />
            Personal Information
          </h2>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="fullName">Full Name *</label>
              <input
                type="text"
                id="fullName"
                name="fullName"
                value={profile.fullName}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="email">
                <HiMail className="label-icon" />
                Email *
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={profile.email}
                onChange={handleChange}
                required
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="phone">
                <HiPhone className="label-icon" />
                Phone
              </label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={profile.phone}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="address">
                <HiLocationMarker className="label-icon" />
                Address
              </label>
              <input
                type="text"
                id="address"
                name="address"
                value={profile.address}
                onChange={handleChange}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="linkedinUrl">
                <HiLink className="label-icon" />
                LinkedIn URL
              </label>
              <input
                type="url"
                id="linkedinUrl"
                name="linkedinUrl"
                value={profile.linkedinUrl}
                onChange={handleChange}
                placeholder="https://linkedin.com/in/..."
              />
            </div>
            <div className="form-group">
              <label htmlFor="githubUrl">
                <HiLink className="label-icon" />
                GitHub URL
              </label>
              <input
                type="url"
                id="githubUrl"
                name="githubUrl"
                value={profile.githubUrl}
                onChange={handleChange}
                placeholder="https://github.com/..."
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="portfolioUrl">
              <HiLink className="label-icon" />
              Portfolio URL
            </label>
            <input
              type="url"
              id="portfolioUrl"
              name="portfolioUrl"
              value={profile.portfolioUrl}
              onChange={handleChange}
              placeholder="https://..."
            />
          </div>
          <div className="form-group">
            <label htmlFor="summary">
              <HiDocumentText className="label-icon" />
              Professional Summary
            </label>
            <textarea
              id="summary"
              name="summary"
              value={profile.summary}
              onChange={handleChange}
              rows={4}
              placeholder="Brief summary of your professional background and career goals..."
            />
          </div>
        </div>

        <div className="form-section">
          <h2>
            <HiBriefcase className="section-icon" />
            Skills
          </h2>
          <div className="skills-input">
            <input
              type="text"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddSkill()}
              placeholder="Add a skill (e.g., JavaScript, React, Python)"
            />
            <button type="button" onClick={handleAddSkill} className="btn-add">
              <HiPlus />
            </button>
          </div>
          <div className="skills-list">
            {profile.skills?.map((skill) => (
              <span key={skill} className="skill-tag">
                {skill}
                <button type="button" onClick={() => handleRemoveSkill(skill)} className="skill-remove">
                  <HiX />
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="form-section">
          <h2>
            <HiBriefcase className="section-icon" />
            Work Experience
          </h2>
          {profile.experience?.map((exp) => (
            <div key={exp.id} className="experience-item">
              <div className="item-header">
                <div>
                  <h3>{exp.position} at {exp.company}</h3>
                  <p>{exp.startDate} - {exp.endDate || 'Present'}</p>
                </div>
                <div className="item-actions">
                  <button type="button" onClick={() => setEditingExperience(exp)}>Edit</button>
                  <button type="button" onClick={() => handleRemoveExperience(exp.id)}>Remove</button>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={handleAddExperience} className="btn-add-item">
            <HiPlus />
            Add Experience
          </button>
        </div>

        <div className="form-section">
          <h2>
            <HiAcademicCap className="section-icon" />
            Education
          </h2>
          {profile.education?.map((edu) => (
            <div key={edu.id} className="education-item">
              <div className="item-header">
                <div>
                  <h3>{edu.degree} in {edu.field}</h3>
                  <p>{edu.institution} - {edu.startDate} - {edu.endDate || 'Present'}</p>
                </div>
                <div className="item-actions">
                  <button type="button" onClick={() => setEditingEducation(edu)}>Edit</button>
                  <button type="button" onClick={() => handleRemoveEducation(edu.id)}>Remove</button>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={handleAddEducation} className="btn-add-item">
            <HiPlus />
            Add Education
          </button>
        </div>

        <div className="form-actions">
          <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary">
            <HiSave className="btn-icon" />
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* Experience Modal */}
      {editingExperience && (
        <ExperienceModal
          experience={editingExperience}
          onSave={(exp) => {
            setEditingExperience(exp);
            handleSaveExperience();
          }}
          onClose={() => setEditingExperience(null)}
        />
      )}

      {/* Education Modal */}
      {editingEducation && (
        <EducationModal
          education={editingEducation}
          onSave={(edu) => {
            setEditingEducation(edu);
            handleSaveEducation();
          }}
          onClose={() => setEditingEducation(null)}
        />
      )}
    </div>
  );
}

// Experience Modal Component
function ExperienceModal({ experience, onSave, onClose }: { experience: WorkExperience; onSave: (exp: WorkExperience) => void; onClose: () => void }) {
  const [formData, setFormData] = useState(experience);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Experience</h3>
          <button onClick={onClose} className="modal-close">
            <HiX />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Company *</label>
            <input type="text" name="company" value={formData.company} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Position *</label>
            <input type="text" name="position" value={formData.position} onChange={handleChange} required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Start Date *</label>
              <input type="date" name="startDate" value={formData.startDate} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>End Date</label>
              <input type="date" name="endDate" value={formData.endDate || ''} onChange={handleChange} disabled={formData.current} />
            </div>
          </div>
          <div className="form-group">
            <label>
              <input type="checkbox" name="current" checked={formData.current} onChange={handleChange} />
              Current Position
            </label>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea name="description" value={formData.description} onChange={handleChange} rows={4} />
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={() => onSave(formData)} className="btn btn-primary">Save</button>
        </div>
      </div>
    </div>
  );
}

// Education Modal Component
function EducationModal({ education, onSave, onClose }: { education: Education; onSave: (edu: Education) => void; onClose: () => void }) {
  const [formData, setFormData] = useState(education);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: e.target.checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Education</h3>
          <button onClick={onClose} className="modal-close">
            <HiX />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Institution *</label>
            <input type="text" name="institution" value={formData.institution} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Degree *</label>
            <input type="text" name="degree" value={formData.degree} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Field of Study *</label>
            <input type="text" name="field" value={formData.field} onChange={handleChange} required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Start Date *</label>
              <input type="date" name="startDate" value={formData.startDate} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>End Date</label>
              <input type="date" name="endDate" value={formData.endDate || ''} onChange={handleChange} disabled={formData.current} />
            </div>
          </div>
          <div className="form-group">
            <label>
              <input type="checkbox" name="current" checked={formData.current} onChange={handleChange} />
              Currently Studying
            </label>
          </div>
          <div className="form-group">
            <label>GPA</label>
            <input type="text" name="gpa" value={formData.gpa || ''} onChange={handleChange} placeholder="e.g., 3.8/4.0" />
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={() => onSave(formData)} className="btn btn-primary">Save</button>
        </div>
      </div>
    </div>
  );
}

