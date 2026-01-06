import type { JobApplication, CreateApplicationInput, UpdateApplicationInput } from '../types/application';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.example.com';

export async function createApplication(input: CreateApplicationInput): Promise<JobApplication> {
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
  const response = await fetch(`${API_BASE_URL}/applications/${id}`);

  if (!response.ok) {
    throw new Error(`Failed to get application: ${response.statusText}`);
  }

  return response.json();
}

export async function listApplications(): Promise<JobApplication[]> {
  const response = await fetch(`${API_BASE_URL}/applications`);

  if (!response.ok) {
    throw new Error(`Failed to list applications: ${response.statusText}`);
  }

  return response.json();
}

export async function updateApplication(id: string, input: UpdateApplicationInput): Promise<JobApplication> {
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
  const response = await fetch(`${API_BASE_URL}/applications/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete application: ${response.statusText}`);
  }
}

