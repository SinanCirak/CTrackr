import { useState, useEffect } from 'react';
import { HiUser, HiMail, HiPhone, HiLocationMarker, HiLink, HiBriefcase, HiAcademicCap, HiBadgeCheck, HiPlus, HiX, HiSave, HiDocumentText, HiCode, HiDownload } from 'react-icons/hi';
import { useAuth } from '../contexts/AuthContext';
import { getProfile, updateProfile } from '../utils/api';
import type { UserProfile, WorkExperience, Education, Certification, Project, SkillCategory, VolunteerExperience } from '../types/user';
import './Profile.css';
import jsPDF from 'jspdf';

export default function Profile() {
  const { user } = useAuth();
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
    skillCategories: [],
    experience: [],
    volunteerExperience: [],
    education: [],
    certifications: [],
    projects: [],
    languages: [],
  });

  const [editingSkillCategory, setEditingSkillCategory] = useState<SkillCategory | null>(null);
  const [editingExperience, setEditingExperience] = useState<WorkExperience | null>(null);
  const [editingVolunteerExperience, setEditingVolunteerExperience] = useState<VolunteerExperience | null>(null);
  const [editingEducation, setEditingEducation] = useState<Education | null>(null);
  const [editingCertification, setEditingCertification] = useState<Certification | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  useEffect(() => {
    // Load profile from API or localStorage
    const loadProfile = async () => {
      // Get userId from user object (Cognito sub or mock userId)
      const userId = user?.userId || (user as any)?.sub || (user as any)?.username;
      
      if (!userId) {
        // Fallback to localStorage if no user
        const savedProfile = localStorage.getItem('userProfile');
        if (savedProfile) {
          try {
            const parsed = JSON.parse(savedProfile);
            setProfile(parsed);
          } catch (e) {
            console.error('Error loading profile:', e);
          }
        }
        return;
      }

      try {
        const savedProfile = await getProfile(userId);
        if (savedProfile) {
          setProfile(savedProfile);
        } else {
          // Try localStorage as fallback
          const localProfile = localStorage.getItem('userProfile');
          if (localProfile) {
            try {
              const parsed = JSON.parse(localProfile);
              setProfile(parsed);
            } catch (e) {
              console.error('Error loading profile:', e);
            }
          }
        }
      } catch (err) {
        console.error('Error loading profile from API:', err);
        // Fallback to localStorage
        const savedProfile = localStorage.getItem('userProfile');
        if (savedProfile) {
          try {
            const parsed = JSON.parse(savedProfile);
            setProfile(parsed);
          } catch (e) {
            console.error('Error loading profile:', e);
          }
        }
      }
    };

    loadProfile();
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
    setError(null);
  };


  const handleAddSkillCategory = () => {
    const newCategory: SkillCategory = {
      id: Date.now().toString(),
      category: '',
      skills: [],
      description: '',
    };
    setEditingSkillCategory(newCategory);
  };

  const handleSaveSkillCategory = (category?: SkillCategory) => {
    const categoryToSave = category || editingSkillCategory;
    if (!categoryToSave) return;
    const existing = profile.skillCategories || [];
    const index = existing.findIndex(c => c.id === categoryToSave.id);
    if (index >= 0) {
      const updated = [...existing];
      updated[index] = categoryToSave;
      setProfile(prev => ({ ...prev, skillCategories: updated }));
    } else {
      setProfile(prev => ({ ...prev, skillCategories: [...existing, categoryToSave] }));
    }
    setEditingSkillCategory(null);
  };

  const handleRemoveSkillCategory = (id: string) => {
    setProfile(prev => ({
      ...prev,
      skillCategories: prev.skillCategories?.filter(c => c.id !== id) || [],
    }));
  };

  const handleAddExperience = () => {
    const newExp: WorkExperience = {
      id: Date.now().toString(),
      company: '',
      location: '',
      position: '',
      startDate: '',
      current: false,
      description: '',
      achievements: [],
    };
    setEditingExperience(newExp);
  };

  const handleSaveExperience = (experience?: WorkExperience) => {
    const experienceToSave = experience || editingExperience;
    if (!experienceToSave) return;
    const existing = profile.experience || [];
    const index = existing.findIndex(e => e.id === experienceToSave.id);
    if (index >= 0) {
      const updated = [...existing];
      updated[index] = experienceToSave;
      setProfile(prev => ({ ...prev, experience: updated }));
    } else {
      setProfile(prev => ({ ...prev, experience: [...existing, experienceToSave] }));
    }
    setEditingExperience(null);
  };

  const handleRemoveExperience = (id: string) => {
    setProfile(prev => ({
      ...prev,
      experience: prev.experience?.filter(e => e.id !== id) || [],
    }));
  };

  const handleAddVolunteerExperience = () => {
    const newVolunteer: VolunteerExperience = {
      id: Date.now().toString(),
      organization: '',
      location: '',
      role: '',
      startDate: '',
      current: false,
      highlights: [],
    };
    setEditingVolunteerExperience(newVolunteer);
  };

  const handleSaveVolunteerExperience = (volunteer?: VolunteerExperience) => {
    const volunteerToSave = volunteer || editingVolunteerExperience;
    if (!volunteerToSave) return;
    const existing = profile.volunteerExperience || [];
    const index = existing.findIndex(v => v.id === volunteerToSave.id);
    if (index >= 0) {
      const updated = [...existing];
      updated[index] = volunteerToSave;
      setProfile(prev => ({ ...prev, volunteerExperience: updated }));
    } else {
      setProfile(prev => ({ ...prev, volunteerExperience: [...existing, volunteerToSave] }));
    }
    setEditingVolunteerExperience(null);
  };

  const handleRemoveVolunteerExperience = (id: string) => {
    setProfile(prev => ({
      ...prev,
      volunteerExperience: prev.volunteerExperience?.filter(v => v.id !== id) || [],
    }));
  };

  const handleAddEducation = () => {
    const newEdu: Education = {
      id: Date.now().toString(),
      institution: '',
      location: '',
      degree: '',
      field: '',
      startDate: '',
      current: false,
    };
    setEditingEducation(newEdu);
  };

  const handleSaveEducation = (education?: Education) => {
    const educationToSave = education || editingEducation;
    if (!educationToSave) return;
    const existing = profile.education || [];
    const index = existing.findIndex(e => e.id === educationToSave.id);
    if (index >= 0) {
      const updated = [...existing];
      updated[index] = educationToSave;
      setProfile(prev => ({ ...prev, education: updated }));
    } else {
      setProfile(prev => ({ ...prev, education: [...existing, educationToSave] }));
    }
    setEditingEducation(null);
  };

  const handleRemoveEducation = (id: string) => {
    setProfile(prev => ({
      ...prev,
      education: prev.education?.filter(e => e.id !== id) || [],
    }));
  };

  const handleAddCertification = () => {
    const newCert: Certification = {
      id: Date.now().toString(),
      name: '',
      code: '',
      issuer: '',
      issueDate: '',
    };
    setEditingCertification(newCert);
  };

  const handleSaveCertification = (certification?: Certification) => {
    const certificationToSave = certification || editingCertification;
    if (!certificationToSave) return;
    const existing = profile.certifications || [];
    const index = existing.findIndex(c => c.id === certificationToSave.id);
    if (index >= 0) {
      const updated = [...existing];
      updated[index] = certificationToSave;
      setProfile(prev => ({ ...prev, certifications: updated }));
    } else {
      setProfile(prev => ({ ...prev, certifications: [...existing, certificationToSave] }));
    }
    setEditingCertification(null);
  };

  const handleRemoveCertification = (id: string) => {
    setProfile(prev => ({
      ...prev,
      certifications: prev.certifications?.filter(c => c.id !== id) || [],
    }));
  };

  const handleAddProject = () => {
    const newProject: Project = {
      id: Date.now().toString(),
      name: '',
      description: '',
      year: '',
      technologies: [],
      achievements: [],
    };
    setEditingProject(newProject);
  };

  const handleSaveProject = (project?: Project) => {
    const projectToSave = project || editingProject;
    if (!projectToSave) return;
    const existing = profile.projects || [];
    const index = existing.findIndex(p => p.id === projectToSave.id);
    if (index >= 0) {
      const updated = [...existing];
      updated[index] = projectToSave;
      setProfile(prev => ({ ...prev, projects: updated }));
    } else {
      setProfile(prev => ({ ...prev, projects: [...existing, projectToSave] }));
    }
    setEditingProject(null);
  };

  const handleRemoveProject = (id: string) => {
    setProfile(prev => ({
      ...prev,
      projects: prev.projects?.filter(p => p.id !== id) || [],
    }));
  };

  const handleSave = async () => {
    // Get userId from user object (Cognito sub or mock userId)
    const userId = user?.userId || (user as any)?.sub || (user as any)?.username;
    
    if (!userId) {
      setError('Please sign in to save your profile');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const profileToSave: UserProfile = {
        id: (profile as UserProfile).id || '',
        userId: userId,
        fullName: profile.fullName || '',
        email: profile.email || '',
        phone: profile.phone,
        address: profile.address,
        linkedinUrl: profile.linkedinUrl,
        githubUrl: profile.githubUrl,
        portfolioUrl: profile.portfolioUrl,
        summary: profile.summary,
        skills: profile.skills || [],
        skillCategories: profile.skillCategories || [],
        experience: profile.experience || [],
        volunteerExperience: profile.volunteerExperience || [],
        education: profile.education || [],
        certifications: profile.certifications || [],
        projects: profile.projects || [],
        languages: profile.languages || [],
        createdAt: (profile as UserProfile).createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const savedProfile = await updateProfile(profileToSave);
      setProfile(savedProfile);
      
      // Also save to localStorage as backup
      localStorage.setItem('userProfile', JSON.stringify(savedProfile));
      
      setSuccess('Profile saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePDF = () => {
    if (!profile.fullName) {
      setError('Please fill in your full name first');
      return;
    }

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const bulletIndent = 3;
      let yPos = margin;

      // Header Section - 3 lines (name, contact, links)
      doc.setFont('helvetica', 'bold');
      let nameFontSize = 18;
      const nameText = profile.fullName.toUpperCase();
      while (nameFontSize > 12) {
        doc.setFontSize(nameFontSize);
        if (doc.getTextWidth(nameText) <= pageWidth - (margin * 2)) break;
        nameFontSize -= 1;
      }
      doc.text(nameText, pageWidth / 2, yPos, { align: 'center' });

      // Line 2: contact (phone | email | address)
      yPos += 5;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const contactLine = [];
      if (profile.phone) contactLine.push(profile.phone.replace(/[\s-()]/g, ''));
      if (profile.email) contactLine.push(profile.email);
      if (profile.address) contactLine.push(profile.address);
      if (contactLine.length > 0) {
        doc.text(contactLine.join(' | '), pageWidth / 2, yPos, { align: 'center' });
      }

      // Line 3: links (website | linkedin | github)
      yPos += 6;
      const linkLine = [];
      if (profile.portfolioUrl) {
        let website = profile.portfolioUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
        if (!website.endsWith('/')) website += '/';
        linkLine.push(website);
      }
      if (profile.linkedinUrl) {
        let linkedin = profile.linkedinUrl.replace(/^https?:\/\//, '');
        if (!linkedin.startsWith('www.')) linkedin = 'www.' + linkedin;
        if (!linkedin.endsWith('/')) linkedin += '/';
        linkLine.push(linkedin);
      }
      if (profile.githubUrl) {
        let github = profile.githubUrl.replace(/^https?:\/\//, '');
        if (!github.startsWith('www.')) github = 'www.' + github;
        if (!github.endsWith('/')) github += '/';
        linkLine.push(github);
      }
      if (linkLine.length > 0) {
        doc.text(linkLine.join(' | '), pageWidth / 2, yPos, { align: 'center' });
      }

      // Horizontal line
      yPos += 5;
      doc.setLineWidth(0.5);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 12;

      // Professional Summary
      if (profile.summary) {
        if (yPos > 265) {
          doc.addPage();
          yPos = margin;
        }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('PROFESSIONAL SUMMARY', margin, yPos);
        yPos += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        // Split summary into paragraphs if there are line breaks
        const summaryParagraphs = profile.summary.split(/\n\n+/);
        summaryParagraphs.forEach((paragraph, idx) => {
          if (yPos > 265) {
            doc.addPage();
            yPos = margin;
          }
          const paragraphLines = doc.splitTextToSize(paragraph.trim(), pageWidth - (margin * 2));
          doc.text(paragraphLines, margin, yPos);
          yPos += paragraphLines.length * 5;
          if (idx < summaryParagraphs.length - 1) {
            yPos += 3; // Space between paragraphs
          }
        });
        yPos += 3;
      }

      const formatMonthYear = (dateStr?: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) return dateStr;
        const month = date.toLocaleString('en-US', { month: 'short' });
        return `${month}/${date.getFullYear()}`;
      };

      // Experience
      if (profile.experience && profile.experience.length > 0) {
        if (yPos > 265) {
          doc.addPage();
          yPos = margin;
        }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('EXPERIENCE', margin, yPos);
        yPos += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        profile.experience?.forEach((exp) => {
          if (yPos > 265) {
            doc.addPage();
            yPos = margin;
          }
          const positionText = exp.position;
          const dateText = `${formatMonthYear(exp.startDate)} – ${exp.endDate ? formatMonthYear(exp.endDate) : 'Present'}`;
          doc.setFont('helvetica', 'bold');
          doc.text(positionText, margin, yPos);
          doc.setFont('helvetica', 'normal');
          doc.text(dateText, pageWidth - margin, yPos, { align: 'right' });
          yPos += 5;

          const companyLine = exp.location
            ? `${exp.company}, ${exp.location}`
            : exp.company;
          doc.text(companyLine, margin, yPos);
          yPos += 5;
          
          if (exp.achievements && exp.achievements.length > 0) {
            yPos += 0;
            exp.achievements.forEach((achievement) => {
              if (yPos > 265) {
                doc.addPage();
                yPos = margin;
              }
              const achievementLines = doc.splitTextToSize(`• ${achievement}`, pageWidth - (margin * 2));
              doc.text(achievementLines, margin + bulletIndent, yPos);
              yPos += achievementLines.length * 5 - 1;
            });
          }
          
          yPos += 3;
        });
        yPos += 3;
      }

      // Projects
      if (profile.projects && profile.projects.length > 0) {
        if (yPos > 265) {
          doc.addPage();
          yPos = margin;
        }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('PROJECTS', margin, yPos);
        yPos += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        profile.projects?.forEach((project) => {
          if (yPos > 265) {
            doc.addPage();
            yPos = margin;
          }
          const projectName = project.year ? `${project.name} (${project.year})` : project.name;
          doc.setFont('helvetica', 'bold');
          doc.text(projectName, margin, yPos);
          doc.setFont('helvetica', 'normal');
          
          const descLines = doc.splitTextToSize(project.description, pageWidth - (margin * 2));
          doc.text(descLines, margin, yPos);
          yPos += descLines.length * 5;
          
          if (project.technologies && project.technologies.length > 0) {
            yPos += 2;
            doc.text(`Technologies: ${project.technologies.join(', ')}`, margin, yPos);
            yPos += 5;
          }
          
          if (project.achievements && project.achievements.length > 0) {
            yPos += 0;
            project.achievements.forEach((achievement) => {
              if (yPos > 265) {
                doc.addPage();
                yPos = margin;
              }
              const achievementLines = doc.splitTextToSize(`• ${achievement}`, pageWidth - (margin * 2));
              doc.text(achievementLines, margin + bulletIndent, yPos);
              yPos += achievementLines.length * 5 - 1;
            });
          }

          if (project.url) {
            const liveDemoLine = `Live Demo: ${project.url}`;
            const demoLines = doc.splitTextToSize(liveDemoLine, pageWidth - (margin * 2));
            doc.text(demoLines, margin, yPos);
            yPos += demoLines.length * 5;
          }
          
          yPos += 5;
        });
        yPos += 3;
      }

      // Technical Skills (Categorized)
      if (profile.skillCategories && profile.skillCategories.length > 0) {
        if (yPos > 265) {
          doc.addPage();
          yPos = margin;
        }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('SKILLS', margin, yPos);
        yPos += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        profile.skillCategories?.forEach((category, idx) => {
          if (yPos > 265) {
            doc.addPage();
            yPos = margin;
          }
          
          doc.setFont('helvetica', 'bold');
          doc.text(category.category, margin, yPos);
          yPos += 5;
          
          doc.setFont('helvetica', 'normal');
          const skillsText = category.skills.join(', ');
          let skillsLine = skillsText;
          if (category.description) {
            skillsLine += ` — ${category.description}`;
          }
          
          const skillsLines = doc.splitTextToSize(skillsLine, pageWidth - (margin * 2));
          doc.text(skillsLines, margin, yPos);
          yPos += skillsLines.length * 5;
          
          if (idx < (profile.skillCategories?.length || 0) - 1) {
            yPos += 1;
          }
        });
        yPos += 3;
      } else if (profile.skills && profile.skills.length > 0) {
        if (yPos > 265) {
          doc.addPage();
          yPos = margin;
        }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('SKILLS', margin, yPos);
        yPos += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const skillsText = profile.skills.join(', ');
        const skillsLines = doc.splitTextToSize(skillsText, pageWidth - (margin * 2));
        doc.text(skillsLines, margin, yPos);
        yPos += skillsLines.length * 5 + 8;
      }

      // Languages
      const languages = profile.languages ?? [];
      if (languages.length > 0) {
        if (yPos > 265) {
          doc.addPage();
          yPos = margin;
        }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('LANGUAGES', margin, yPos);
        yPos += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        languages.forEach((lang, idx) => {
          if (yPos > 265) {
            doc.addPage();
            yPos = margin;
          }
          const line = `${lang.language} — ${lang.proficiency}`;
          doc.text(line, margin, yPos);
          yPos += 5;
          if (idx < languages.length - 1) {
            yPos += 0;
          }
        });
        yPos += 3;
      }

      // Education
      if (profile.education && profile.education.length > 0) {
        if (yPos > 265) {
          doc.addPage();
          yPos = margin;
        }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('EDUCATION', margin, yPos);
        yPos += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        profile.education?.forEach((edu) => {
          if (yPos > 265) {
            doc.addPage();
            yPos = margin;
          }
          const degreeText = `${edu.degree}, ${edu.field}`;
          const dateText = edu.endDate
            ? formatMonthYear(edu.endDate)
            : edu.current
              ? 'Present'
              : formatMonthYear(edu.startDate);

          doc.setFont('helvetica', 'bold');
          doc.text(degreeText, margin, yPos);
          doc.setFont('helvetica', 'normal');
          if (dateText) {
            doc.text(dateText, pageWidth - margin, yPos, { align: 'right' });
          }
          yPos += 5;
          const schoolLine = edu.location
            ? `${edu.institution} – ${edu.location}`
            : edu.institution;
          doc.text(schoolLine, margin, yPos);
          yPos += 5;
        });
        yPos += 3;
      }

      // Certifications
      if (profile.certifications && profile.certifications.length > 0) {
        if (yPos > 265) {
          doc.addPage();
          yPos = margin;
        }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('CERTIFICATIONS', margin, yPos);
        yPos += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        profile.certifications?.forEach((cert) => {
          if (yPos > 265) {
            doc.addPage();
            yPos = margin;
          }
          const certName = (cert.code ? `${cert.name} (${cert.code})` : cert.name).trim();
          const issuerPart = cert.issuer ? `, ${cert.issuer.trim()}` : '';
          const datePart = cert.issueDate ? ` – ${cert.issueDate}` : '';
          const bulletPrefix = `• ${certName}`;
          const restLine = `${issuerPart}${datePart}`.trim();
          const prefixX = margin + bulletIndent;

          doc.setFont('helvetica', 'bold');
          const prefixWidth = doc.getTextWidth(bulletPrefix);
          doc.text(bulletPrefix, prefixX, yPos);

          doc.setFont('helvetica', 'normal');
          if (restLine) {
            const gap = restLine.startsWith(',') ? 0.5 : 2;
            const availableWidth = pageWidth - margin - (prefixX + prefixWidth + gap);
            const restLines = doc.splitTextToSize(restLine, Math.max(availableWidth, 10));
            const firstLineX = prefixX + prefixWidth + gap;
            doc.text(restLines[0], firstLineX, yPos);

            for (let i = 1; i < restLines.length; i += 1) {
              doc.text(restLines[i], margin + bulletIndent + 6, yPos + (i * 5));
            }
            yPos += restLines.length * 5 - 1;
          } else {
            yPos += 5 - 1;
          }
        });
        yPos += 3;
      }

      // Volunteer Experience
      if (profile.volunteerExperience && profile.volunteerExperience.length > 0) {
        if (yPos > 265) {
          doc.addPage();
          yPos = margin;
        }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('VOLUNTEER EXPERIENCE', margin, yPos);
        yPos += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        profile.volunteerExperience.forEach((vol) => {
          if (yPos > 265) {
            doc.addPage();
            yPos = margin;
          }
          const roleText = vol.role;
          const dateText = `${formatMonthYear(vol.startDate)} – ${vol.endDate ? formatMonthYear(vol.endDate) : 'Present'}`;
          doc.setFont('helvetica', 'bold');
          doc.text(roleText, margin, yPos);
          doc.setFont('helvetica', 'normal');
          doc.text(dateText, pageWidth - margin, yPos, { align: 'right' });
          yPos += 5;

          const orgLine = vol.location
            ? `${vol.organization} – ${vol.location}`
            : vol.organization;
          doc.text(orgLine, margin, yPos);
          yPos += 5;

          if (vol.highlights && vol.highlights.length > 0) {
            yPos += 2;
            vol.highlights.forEach((highlight) => {
              if (yPos > 265) {
                doc.addPage();
                yPos = margin;
              }
              const lines = doc.splitTextToSize(`• ${highlight}`, pageWidth - (margin * 2));
              doc.text(lines, margin + bulletIndent, yPos);
              yPos += lines.length * 5 - 1;
            });
          }

          yPos += 5;
        });
        yPos += 3;
      }

      // Save PDF
      const fileName = `CV_${profile.fullName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      setSuccess('CV PDF generated successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate PDF');
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
            Technical Skills (Categorized)
          </h2>
          {profile.skillCategories?.map((category) => (
            <div key={category.id} className="skill-category-item">
              <div className="item-header">
                <div>
                  <h3>{category.category}</h3>
                  <p className="skills-list-inline">
                    {category.skills.join(', ')}
                    {category.description && ` — ${category.description}`}
                  </p>
                </div>
                <div className="item-actions">
                  <button type="button" onClick={() => setEditingSkillCategory(category)}>Edit</button>
                  <button type="button" onClick={() => handleRemoveSkillCategory(category.id)}>Remove</button>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={handleAddSkillCategory} className="btn-add-item">
            <HiPlus />
            Add Skill Category
          </button>
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
            <HiBriefcase className="section-icon" />
            Volunteer Experience
          </h2>
          {profile.volunteerExperience?.map((vol) => (
            <div key={vol.id} className="experience-item">
              <div className="item-header">
                <div>
                  <h3>{vol.role} at {vol.organization}</h3>
                  <p>{vol.startDate} - {vol.endDate || 'Present'}</p>
                </div>
                <div className="item-actions">
                  <button type="button" onClick={() => setEditingVolunteerExperience(vol)}>Edit</button>
                  <button type="button" onClick={() => handleRemoveVolunteerExperience(vol.id)}>Remove</button>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={handleAddVolunteerExperience} className="btn-add-item">
            <HiPlus />
            Add Volunteer Experience
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

        <div className="form-section">
          <h2>
            <HiBadgeCheck className="section-icon" />
            Certifications
          </h2>
          {profile.certifications?.map((cert) => (
            <div key={cert.id} className="certification-item">
              <div className="item-header">
                <div>
                  <h3>{cert.name}{cert.code ? ` (${cert.code})` : ''}</h3>
                  <p>{cert.issuer ? `${cert.issuer} • ${cert.issueDate}` : cert.issueDate}</p>
                </div>
                <div className="item-actions">
                  <button type="button" onClick={() => setEditingCertification(cert)}>Edit</button>
                  <button type="button" onClick={() => handleRemoveCertification(cert.id)}>Remove</button>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={handleAddCertification} className="btn-add-item">
            <HiPlus />
            Add Certification
          </button>
        </div>

        <div className="form-section">
          <h2>
            <HiCode className="section-icon" />
            Projects
          </h2>
          {profile.projects?.map((project) => (
            <div key={project.id} className="project-item">
              <div className="item-header">
                <div>
                  <h3>{project.name} {project.year && `(${project.year})`}</h3>
                  <p>{project.description}</p>
                  {project.technologies && project.technologies.length > 0 && (
                    <p className="technologies">Technologies: {project.technologies.join(', ')}</p>
                  )}
                  {project.achievements && project.achievements.length > 0 && (
                    <ul className="achievements-list">
                      {project.achievements.map((achievement, idx) => (
                        <li key={idx}>{achievement}</li>
                      ))}
                    </ul>
                  )}
                  {project.url && (
                    <p className="project-url">
                      <a href={project.url} target="_blank" rel="noopener noreferrer">
                        {project.url}
                      </a>
                    </p>
                  )}
                </div>
                <div className="item-actions">
                  <button type="button" onClick={() => setEditingProject(project)}>Edit</button>
                  <button type="button" onClick={() => handleRemoveProject(project.id)}>Remove</button>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={handleAddProject} className="btn-add-item">
            <HiPlus />
            Add Project
          </button>
        </div>

        <div className="form-actions">
          <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary">
            <HiSave className="btn-icon" />
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
          <button type="button" onClick={handleGeneratePDF} className="btn btn-secondary">
            <HiDownload className="btn-icon" />
            Generate CV PDF (Draft)
          </button>
        </div>
      </div>

      {/* Experience Modal */}
      {editingExperience && (
        <ExperienceModal
          experience={editingExperience}
          onSave={(exp) => {
            handleSaveExperience(exp);
          }}
          onClose={() => setEditingExperience(null)}
        />
      )}

      {/* Volunteer Experience Modal */}
      {editingVolunteerExperience && (
        <VolunteerExperienceModal
          experience={editingVolunteerExperience}
          onSave={(vol) => {
            handleSaveVolunteerExperience(vol);
          }}
          onClose={() => setEditingVolunteerExperience(null)}
        />
      )}

      {/* Education Modal */}
      {editingEducation && (
        <EducationModal
          education={editingEducation}
          onSave={(edu) => {
            handleSaveEducation(edu);
          }}
          onClose={() => setEditingEducation(null)}
        />
      )}

      {/* Certification Modal */}
      {editingCertification && (
        <CertificationModal
          certification={editingCertification}
          onSave={(cert) => {
            handleSaveCertification(cert);
          }}
          onClose={() => setEditingCertification(null)}
        />
      )}

      {/* Project Modal */}
      {editingProject && (
        <ProjectModal
          project={editingProject}
          onSave={(proj) => {
            handleSaveProject(proj);
          }}
          onClose={() => setEditingProject(null)}
        />
      )}

      {/* Skill Category Modal */}
      {editingSkillCategory && (
        <SkillCategoryModal
          category={editingSkillCategory}
          onSave={(cat) => {
            handleSaveSkillCategory(cat);
          }}
          onClose={() => setEditingSkillCategory(null)}
        />
      )}
    </div>
  );
}

// Experience Modal Component
function ExperienceModal({ experience, onSave, onClose }: { experience: WorkExperience; onSave: (exp: WorkExperience) => void; onClose: () => void }) {
  const [formData, setFormData] = useState(experience);
  const [achievementsText, setAchievementsText] = useState(
    (experience.achievements || []).join('\n')
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleAchievementsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setAchievementsText(value);
    const lines = value
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    setFormData(prev => ({ ...prev, achievements: lines }));
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
            <label>Location</label>
            <input type="text" name="location" value={formData.location || ''} onChange={handleChange} placeholder="e.g., Canada" />
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
            <label>Highlights (one per line)</label>
            <textarea
              name="achievements"
              value={achievementsText}
              onChange={handleAchievementsChange}
              rows={5}
              placeholder="• Architected serverless backends using AWS Lambda, API Gateway, DynamoDB, S3, and Cognito"
            />
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

// Volunteer Experience Modal Component
function VolunteerExperienceModal({ experience, onSave, onClose }: { experience: VolunteerExperience; onSave: (exp: VolunteerExperience) => void; onClose: () => void }) {
  const [formData, setFormData] = useState(experience);
  const [highlightsText, setHighlightsText] = useState(
    (experience.highlights || []).join('\n')
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleHighlightsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setHighlightsText(value);
    const lines = value
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    setFormData(prev => ({ ...prev, highlights: lines }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Volunteer Experience</h3>
          <button onClick={onClose} className="modal-close">
            <HiX />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Organization *</label>
            <input type="text" name="organization" value={formData.organization} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Location</label>
            <input type="text" name="location" value={formData.location || ''} onChange={handleChange} placeholder="e.g., Herne, Germany" />
          </div>
          <div className="form-group">
            <label>Role *</label>
            <input type="text" name="role" value={formData.role} onChange={handleChange} required />
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
              Current Role
            </label>
          </div>
          <div className="form-group">
            <label>Highlights (one per line)</label>
            <textarea
              name="highlights"
              value={highlightsText}
              onChange={handleHighlightsChange}
              rows={5}
              placeholder="• Organized youth education programs and mentoring activities"
            />
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
            <label>Location</label>
            <input
              type="text"
              name="location"
              value={formData.location || ''}
              onChange={handleChange}
              placeholder="e.g., Hamilton, ON"
            />
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

// Certification Modal Component
function CertificationModal({ certification, onSave, onClose }: { certification: Certification; onSave: (cert: Certification) => void; onClose: () => void }) {
  const [formData, setFormData] = useState(certification);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Certification</h3>
          <button onClick={onClose} className="modal-close">
            <HiX />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Certification Name *</label>
            <input 
              type="text" 
              name="name" 
              value={formData.name} 
              onChange={handleChange} 
              required 
              placeholder="e.g., AWS Certified Solutions Architect - Associate"
            />
          </div>
          <div className="form-group">
            <label>Issuer (Optional)</label>
            <input
              type="text"
              name="issuer"
              value={formData.issuer || ''}
              onChange={handleChange}
              placeholder="e.g., AWS, Microsoft, HashiCorp"
            />
          </div>
          <div className="form-group">
            <label>Code (Optional)</label>
            <input 
              type="text" 
              name="code" 
              value={formData.code || ''} 
              onChange={handleChange} 
              placeholder="e.g., SAA-C03"
            />
          </div>
          <div className="form-group">
            <label>Issue Date *</label>
            <input 
              type="text" 
              name="issueDate" 
              value={formData.issueDate} 
              onChange={handleChange} 
              required 
              placeholder="e.g., November, 2025"
            />
            <small style={{ color: '#64748B', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
              Format: Month, Year (e.g., November, 2025)
            </small>
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

// Project Modal Component
function ProjectModal({ project, onSave, onClose }: { project: Project; onSave: (proj: Project) => void; onClose: () => void }) {
  const [formData, setFormData] = useState(project);
  const [newTechnology, setNewTechnology] = useState('');
  const [highlightsText, setHighlightsText] = useState(
    (project.achievements || []).join('\n')
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleHighlightsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setHighlightsText(value);
    const lines = value
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    setFormData(prev => ({ ...prev, achievements: lines }));
  };

  const handleAddTechnology = () => {
    if (newTechnology.trim()) {
      setFormData(prev => ({
        ...prev,
        technologies: [...(prev.technologies || []), newTechnology.trim()],
      }));
      setNewTechnology('');
    }
  };

  const handleRemoveTechnology = (index: number) => {
    setFormData(prev => ({
      ...prev,
      technologies: prev.technologies?.filter((_, i) => i !== index) || [],
    }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Project</h3>
          <button onClick={onClose} className="modal-close">
            <HiX />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Project Name *</label>
            <input type="text" name="name" value={formData.name} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Year</label>
            <input type="text" name="year" value={formData.year || ''} onChange={handleChange} placeholder="e.g., 2024" />
          </div>
          <div className="form-group">
            <label>Description *</label>
            <textarea name="description" value={formData.description} onChange={handleChange} rows={4} required />
          </div>
          <div className="form-group">
            <label>Project URL</label>
            <input type="url" name="url" value={formData.url || ''} onChange={handleChange} placeholder="https://..." />
          </div>
          <div className="form-group">
            <label>Technologies</label>
            <div className="tags-input">
              <input
                type="text"
                value={newTechnology}
                onChange={(e) => setNewTechnology(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTechnology())}
                placeholder="Add technology (e.g., React, AWS)"
              />
              <button type="button" onClick={handleAddTechnology} className="btn-add">
                <HiPlus />
              </button>
            </div>
            <div className="tags-list">
              {formData.technologies?.map((tech, idx) => (
                <span key={idx} className="tag">
                  {tech}
                  <button type="button" onClick={() => handleRemoveTechnology(idx)} className="tag-remove">
                    <HiX />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Highlights (one per line)</label>
            <textarea
              value={highlightsText}
              onChange={handleHighlightsChange}
              placeholder="• Developed a React-based tool to estimate AWS infrastructure costs"
              rows={5}
            />
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

// Skill Category Modal Component
function SkillCategoryModal({ category, onSave, onClose }: { category: SkillCategory; onSave: (cat: SkillCategory) => void; onClose: () => void }) {
  const [formData, setFormData] = useState(category);
  const [newSkill, setNewSkill] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddSkill = () => {
    if (newSkill.trim() && !formData.skills.includes(newSkill.trim())) {
      setFormData(prev => ({
        ...prev,
        skills: [...prev.skills, newSkill.trim()],
      }));
      setNewSkill('');
    }
  };

  const handleRemoveSkill = (skill: string) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.filter(s => s !== skill),
    }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Skill Category</h3>
          <button onClick={onClose} className="modal-close">
            <HiX />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Category Name *</label>
            <input 
              type="text" 
              name="category" 
              value={formData.category} 
              onChange={handleChange} 
              required 
              placeholder="e.g., Programming Languages, Cloud & DevOps, Frameworks"
            />
          </div>
          <div className="form-group">
            <label>Skills *</label>
            <div className="tags-input">
              <input
                type="text"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSkill())}
                placeholder="Add skill (e.g., React, AWS, Python)"
              />
              <button type="button" onClick={handleAddSkill} className="btn-add">
                <HiPlus />
              </button>
            </div>
            <div className="tags-list">
              {formData.skills.map((skill, idx) => (
                <span key={idx} className="tag">
                  {skill}
                  <button type="button" onClick={() => handleRemoveSkill(skill)} className="tag-remove">
                    <HiX />
                  </button>
                </span>
              ))}
            </div>
            {formData.skills.length === 0 && (
              <small style={{ color: '#EF4444', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>
                At least one skill is required
              </small>
            )}
          </div>
          <div className="form-group">
            <label>Description (Optional)</label>
            <textarea 
              name="description" 
              value={formData.description || ''} 
              onChange={handleChange} 
              rows={3}
              placeholder="Optional description for this skill category..."
            />
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button 
            onClick={() => onSave(formData)} 
            className="btn btn-primary"
            disabled={!formData.category.trim() || formData.skills.length === 0}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
