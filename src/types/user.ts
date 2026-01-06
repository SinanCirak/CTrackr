export interface SkillCategory {
  id: string;
  category: string; // e.g., "Programming", "Cloud & DevOps"
  skills: string[]; // Array of skills in this category
  description?: string; // Optional description after the skills
}

export interface UserProfile {
  id: string;
  userId: string; // Cognito user ID
  fullName: string;
  email: string;
  phone?: string;
  address?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  summary?: string;
  skills: string[]; // Legacy: flat array of skills (for backward compatibility)
  skillCategories: SkillCategory[]; // New: categorized skills
  experience: WorkExperience[];
  education: Education[];
  certifications: Certification[];
  projects: Project[];
  languages: Language[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkExperience {
  id: string;
  company: string;
  position: string;
  startDate: string;
  endDate?: string;
  current: boolean;
  description: string;
  achievements: string[];
}

export interface Education {
  id: string;
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate?: string;
  current: boolean;
  gpa?: string;
}

export interface Certification {
  id: string;
  name: string; // Full certification name, e.g., "AWS Certified Solutions Architect - Associate"
  code?: string; // Optional code, e.g., "SAA-C03"
  issueDate: string; // Format: "Month, Year" e.g., "November, 2025"
}

export interface Language {
  id: string;
  language: string;
  proficiency: 'native' | 'fluent' | 'conversational' | 'basic';
}

export interface Project {
  id: string;
  name: string;
  description: string;
  year?: string;
  technologies?: string[];
  url?: string;
  achievements: string[];
}

export interface CreateUserProfileInput {
  fullName: string;
  email: string;
  phone?: string;
  address?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  summary?: string;
  skills?: string[]; // Legacy support
  skillCategories?: SkillCategory[];
  experience?: WorkExperience[];
  education?: Education[];
  certifications?: Certification[];
  projects?: Project[];
  languages?: Language[];
}

export interface UpdateUserProfileInput {
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  summary?: string;
  skills?: string[]; // Legacy support
  skillCategories?: SkillCategory[];
  experience?: WorkExperience[];
  education?: Education[];
  certifications?: Certification[];
  projects?: Project[];
  languages?: Language[];
}

