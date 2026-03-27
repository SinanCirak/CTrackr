export type ApplicationStatus = 
  | 'applied'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
  | 'accepted';

export interface JobApplication {
  id: string;
  userId?: string; // Optional for backward compatibility
  company: string;
  position: string;
  status: ApplicationStatus;
  appliedDate: string;
  interviewDate?: string;
  interviewTime?: string;
  interviewPlace?: string;
  interviewLink?: string;
  offerDate?: string;
  rejectedDate?: string;
  notes?: string;
  salary?: string;
  location?: string;
  jobUrl?: string;
  contactEmail?: string;
  contactName?: string;
  cvUrl?: string;
  cvFileKey?: string;
  coverLetterUrl?: string;
  coverLetterFileKey?: string;
  cvVersions?: DocumentVersion[];
  coverLetterVersions?: DocumentVersion[];
  jobDescription?: string;
  requirements?: string;
  parsedJob?: ParsedJob;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedJob {
  jobSummary: string;
  requirementsSummary: string;
  keywords: string[];
  parsedAt: string;
}

export interface DocumentVersion {
  version: number;
  label: string;
  url: string;
  fileKey?: string;
  createdAt: string;
  source: 'generated' | 'uploaded';
}

export interface CreateApplicationInput {
  userId?: string; // Optional for backward compatibility
  company: string;
  position: string;
  status?: ApplicationStatus;
  appliedDate: string;
  interviewDate?: string;
  interviewTime?: string;
  interviewPlace?: string;
  interviewLink?: string;
  offerDate?: string;
  rejectedDate?: string;
  notes?: string;
  salary?: string;
  location?: string;
  jobUrl?: string;
  contactEmail?: string;
  contactName?: string;
  cvUrl?: string;
  cvFileKey?: string;
  coverLetterUrl?: string;
  coverLetterFileKey?: string;
  cvVersions?: DocumentVersion[];
  coverLetterVersions?: DocumentVersion[];
  jobDescription?: string;
  requirements?: string;
  parsedJob?: ParsedJob;
}

export interface UpdateApplicationInput {
  company?: string;
  position?: string;
  status?: ApplicationStatus;
  appliedDate?: string;
  interviewDate?: string;
  interviewTime?: string;
  interviewPlace?: string;
  interviewLink?: string;
  offerDate?: string;
  rejectedDate?: string;
  notes?: string;
  salary?: string;
  location?: string;
  jobUrl?: string;
  contactEmail?: string;
  contactName?: string;
  cvUrl?: string;
  cvFileKey?: string;
  coverLetterUrl?: string;
  coverLetterFileKey?: string;
  cvVersions?: DocumentVersion[];
  coverLetterVersions?: DocumentVersion[];
  jobDescription?: string;
  requirements?: string;
  parsedJob?: ParsedJob;
}

