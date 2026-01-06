import type { JobApplication, CreateApplicationInput, UpdateApplicationInput } from '../types/application';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.example.com';
const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true' || !import.meta.env.VITE_API_BASE_URL;

// Mock data for development
const mockApplications: JobApplication[] = [
  {
    id: '1',
    company: 'Google',
    position: 'Senior Software Engineer',
    status: 'interview',
    appliedDate: '2024-01-15',
    interviewDate: '2024-01-25',
    interviewTime: '14:00',
    interviewPlace: 'Zoom',
    interviewLink: 'https://zoom.us/j/123456789',
    location: 'Mountain View, CA',
    salary: '$180k - $220k',
    jobUrl: 'https://careers.google.com',
    contactName: 'John Smith',
    contactEmail: 'john.smith@google.com',
    notes: 'First round interview scheduled. Focus on system design and algorithms.',
    cvUrl: 'https://example.com/cv-google.pdf',
    coverLetterUrl: 'https://example.com/cover-letter-google.pdf',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-20T14:30:00Z',
  },
  {
    id: '2',
    company: 'Microsoft',
    position: 'Full Stack Developer',
    status: 'applied',
    appliedDate: '2024-01-20',
    location: 'Seattle, WA',
    salary: '$150k - $180k',
    jobUrl: 'https://careers.microsoft.com',
    contactName: 'Sarah Johnson',
    contactEmail: 'sarah.j@microsoft.com',
    notes: 'Applied through LinkedIn. Waiting for response.',
    createdAt: '2024-01-20T09:15:00Z',
    updatedAt: '2024-01-20T09:15:00Z',
  },
  {
    id: '3',
    company: 'Amazon',
    position: 'Cloud Solutions Architect',
    status: 'offer',
    appliedDate: '2023-12-10',
    interviewDate: '2024-01-05',
    offerDate: '2024-01-18',
    location: 'Seattle, WA',
    salary: '$200k - $250k',
    jobUrl: 'https://www.amazon.jobs',
    contactName: 'Mike Chen',
    contactEmail: 'mchen@amazon.com',
    notes: 'Received offer! Need to respond by January 25th. Great team and benefits.',
    cvUrl: 'https://example.com/cv-amazon.pdf',
    coverLetterUrl: 'https://example.com/cover-letter-amazon.pdf',
    createdAt: '2023-12-10T11:00:00Z',
    updatedAt: '2024-01-18T16:45:00Z',
  },
  {
    id: '4',
    company: 'Apple',
    position: 'iOS Developer',
    status: 'rejected',
    appliedDate: '2023-12-05',
    interviewDate: '2023-12-20',
    rejectedDate: '2024-01-10',
    location: 'Cupertino, CA',
    salary: '$160k - $200k',
    jobUrl: 'https://www.apple.com/careers',
    contactName: 'Emily Davis',
    contactEmail: 'emily.davis@apple.com',
    notes: 'Went through 3 rounds. Feedback: need more Swift experience.',
    createdAt: '2023-12-05T08:30:00Z',
    updatedAt: '2024-01-10T10:20:00Z',
  },
  {
    id: '5',
    company: 'Meta',
    position: 'Frontend Engineer',
    status: 'applied',
    appliedDate: '2024-01-22',
    location: 'Menlo Park, CA',
    salary: '$170k - $210k',
    jobUrl: 'https://www.metacareers.com',
    notes: 'Applied for React/TypeScript position. Strong match with my skills.',
    createdAt: '2024-01-22T13:20:00Z',
    updatedAt: '2024-01-22T13:20:00Z',
  },
  {
    id: '6',
    company: 'Netflix',
    position: 'Backend Engineer',
    status: 'interview',
    appliedDate: '2024-01-10',
    interviewDate: '2024-01-28',
    interviewTime: '10:30',
    interviewPlace: 'Office - Building 3, Room 201',
    location: 'Los Gatos, CA',
    salary: '$190k - $230k',
    jobUrl: 'https://jobs.netflix.com',
    contactName: 'David Lee',
    contactEmail: 'dlee@netflix.com',
    notes: 'Technical interview next week. Prepare for distributed systems questions.',
    cvUrl: 'https://example.com/cv-netflix.pdf',
    createdAt: '2024-01-10T14:00:00Z',
    updatedAt: '2024-01-25T09:00:00Z',
  },
  {
    id: '7',
    company: 'Tesla',
    position: 'Software Engineer',
    status: 'accepted',
    appliedDate: '2023-11-20',
    interviewDate: '2023-12-15',
    offerDate: '2023-12-28',
    location: 'Palo Alto, CA',
    salary: '$175k - $215k',
    jobUrl: 'https://www.tesla.com/careers',
    contactName: 'Robert Kim',
    contactEmail: 'rkim@tesla.com',
    notes: 'Accepted offer! Starting February 1st. Excited to work on autonomous driving.',
    createdAt: '2023-11-20T10:30:00Z',
    updatedAt: '2024-01-05T11:00:00Z',
  },
  {
    id: '8',
    company: 'Stripe',
    position: 'Payment Systems Engineer',
    status: 'withdrawn',
    appliedDate: '2024-01-08',
    location: 'San Francisco, CA',
    salary: '$180k - $220k',
    jobUrl: 'https://stripe.com/jobs',
    notes: 'Withdrew application - accepted another offer.',
    createdAt: '2024-01-08T12:00:00Z',
    updatedAt: '2024-01-18T15:30:00Z',
  },
];

export async function createApplication(input: CreateApplicationInput): Promise<JobApplication> {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const newApplication: JobApplication = {
      id: String(mockApplications.length + 1),
      ...input,
      status: input.status || 'applied',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockApplications.unshift(newApplication);
    return newApplication;
  }

  const response = await fetch(`${API_BASE_URL}/applications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Failed to create application: ${response.statusText}`);
  }

  return response.json();
}

export async function getApplication(id: string): Promise<JobApplication> {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const application = mockApplications.find(app => app.id === id);
    if (!application) {
      throw new Error('Application not found');
    }
    return application;
  }

  const response = await fetch(`${API_BASE_URL}/applications/${id}`);

  if (!response.ok) {
    throw new Error(`Failed to get application: ${response.statusText}`);
  }

  return response.json();
}

export async function listApplications(): Promise<JobApplication[]> {
  if (USE_MOCK_DATA) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    return [...mockApplications];
  }

  const response = await fetch(`${API_BASE_URL}/applications`);

  if (!response.ok) {
    throw new Error(`Failed to list applications: ${response.statusText}`);
  }

  return response.json();
}

export async function updateApplication(id: string, input: UpdateApplicationInput): Promise<JobApplication> {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const index = mockApplications.findIndex(app => app.id === id);
    if (index === -1) {
      throw new Error('Application not found');
    }
    mockApplications[index] = {
      ...mockApplications[index],
      ...input,
      updatedAt: new Date().toISOString(),
    };
    return mockApplications[index];
  }

  const response = await fetch(`${API_BASE_URL}/applications/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Failed to update application: ${response.statusText}`);
  }

  return response.json();
}

export async function deleteApplication(id: string): Promise<void> {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const index = mockApplications.findIndex(app => app.id === id);
    if (index !== -1) {
      mockApplications.splice(index, 1);
    }
    return;
  }

  const response = await fetch(`${API_BASE_URL}/applications/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete application: ${response.statusText}`);
  }
}

export interface UploadUrlResponse {
  uploadUrl: string;
  fileUrl: string;
  fileKey: string;
}

export async function getUploadUrl(fileName: string, fileType: string): Promise<UploadUrlResponse> {
  const response = await fetch(`${API_BASE_URL}/upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fileName, fileType }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get upload URL: ${response.statusText}`);
  }

  return response.json();
}

export async function uploadFileToS3(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload file: ${response.statusText}`);
  }
}

