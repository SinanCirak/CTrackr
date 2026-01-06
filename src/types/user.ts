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
  skills: string[];
  experience: WorkExperience[];
  education: Education[];
  certifications: Certification[];
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
  name: string;
  issuer: string;
  issueDate: string;
  expiryDate?: string;
  credentialId?: string;
  credentialUrl?: string;
}

export interface Language {
  id: string;
  language: string;
  proficiency: 'native' | 'fluent' | 'conversational' | 'basic';
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
  skills?: string[];
  experience?: WorkExperience[];
  education?: Education[];
  certifications?: Certification[];
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
  skills?: string[];
  experience?: WorkExperience[];
  education?: Education[];
  certifications?: Certification[];
  languages?: Language[];
}

