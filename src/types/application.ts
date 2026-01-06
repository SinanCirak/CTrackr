export type ApplicationStatus = 
  | 'applied'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
  | 'accepted';

export interface JobApplication {
  id: string;
  company: string;
  position: string;
  status: ApplicationStatus;
  appliedDate: string;
  interviewDate?: string;
  offerDate?: string;
  rejectedDate?: string;
  notes?: string;
  salary?: string;
  location?: string;
  jobUrl?: string;
  contactEmail?: string;
  contactName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApplicationInput {
  company: string;
  position: string;
  status?: ApplicationStatus;
  appliedDate: string;
  interviewDate?: string;
  offerDate?: string;
  rejectedDate?: string;
  notes?: string;
  salary?: string;
  location?: string;
  jobUrl?: string;
  contactEmail?: string;
  contactName?: string;
}

export interface UpdateApplicationInput {
  company?: string;
  position?: string;
  status?: ApplicationStatus;
  appliedDate?: string;
  interviewDate?: string;
  offerDate?: string;
  rejectedDate?: string;
  notes?: string;
  salary?: string;
  location?: string;
  jobUrl?: string;
  contactEmail?: string;
  contactName?: string;
}

