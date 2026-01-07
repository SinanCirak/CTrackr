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
  jobDescription?: string;
  requirements?: string;
  createdAt: string;
  updatedAt: string;
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
  jobDescription?: string;
  requirements?: string;
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
  jobDescription?: string;
  requirements?: string;
}

