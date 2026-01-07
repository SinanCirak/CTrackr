import { Amplify } from 'aws-amplify';
import {
  signIn,
  signUp,
  signOut,
  confirmSignUp,
  resendSignUpCode,
  getCurrentUser,
  fetchAuthSession,
  type SignInOutput,
  type SignUpOutput,
} from 'aws-amplify/auth';

// Check if Cognito is configured
const USE_MOCK_AUTH = !import.meta.env.VITE_COGNITO_USER_POOL_ID || !import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID;

// Configure Amplify only if Cognito credentials are provided
if (!USE_MOCK_AUTH) {
  const amplifyConfig = {
    Auth: {
      Cognito: {
        userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
        userPoolClientId: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID || '',
        region: import.meta.env.VITE_AWS_REGION || 'ca-central-1',
      },
    },
  };
  Amplify.configure(amplifyConfig);
}

// Mock user storage
let mockUser: any = null;
const MOCK_USER_KEY = 'ctrackr_mock_user';

export interface SignUpInput {
  email: string;
  password: string;
  name: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export async function handleSignUp(input: SignUpInput): Promise<SignUpOutput> {
  if (USE_MOCK_AUTH) {
    // Mock sign up - just store user info
    const mockUserData = {
      userId: `mock-${Date.now()}`,
      username: input.email,
      signInDetails: {
        loginId: input.email,
      },
      attributes: {
        email: input.email,
        name: input.name,
      },
    };
    localStorage.setItem(MOCK_USER_KEY, JSON.stringify(mockUserData));
    mockUser = mockUserData;
    return {
      isSignUpComplete: true,
      userId: mockUserData.userId,
      nextStep: { signUpStep: 'DONE' },
    };
  }

  try {
    const { isSignUpComplete, userId, nextStep } = await signUp({
      username: input.email,
      password: input.password,
      options: {
        userAttributes: {
          email: input.email,
          name: input.name,
        },
      },
    });
    return { isSignUpComplete, userId, nextStep };
  } catch (error) {
    throw error;
  }
}

export async function handleSignIn(input: SignInInput): Promise<SignInOutput> {
  if (USE_MOCK_AUTH) {
    // Mock sign in - check if user exists in localStorage
    const savedUser = localStorage.getItem(MOCK_USER_KEY);
    if (savedUser) {
      const userData = JSON.parse(savedUser);
      if (userData.username === input.email) {
        mockUser = userData;
        return {
          isSignedIn: true,
          nextStep: { signInStep: 'DONE' },
        };
      }
    }
    // If no user exists, create one (for development)
    const mockUserData = {
      userId: `mock-${Date.now()}`,
      username: input.email,
      signInDetails: {
        loginId: input.email,
      },
      attributes: {
        email: input.email,
        name: input.email.split('@')[0],
      },
    };
    localStorage.setItem(MOCK_USER_KEY, JSON.stringify(mockUserData));
    mockUser = mockUserData;
    return {
      isSignedIn: true,
      nextStep: { signInStep: 'DONE' },
    };
  }

  try {
    const { isSignedIn, nextStep } = await signIn({
      username: input.email,
      password: input.password,
    });
    return { isSignedIn, nextStep };
  } catch (error) {
    throw error;
  }
}

export async function handleSignOut(): Promise<void> {
  if (USE_MOCK_AUTH) {
    localStorage.removeItem(MOCK_USER_KEY);
    mockUser = null;
    return;
  }

  try {
    await signOut();
  } catch (error) {
    throw error;
  }
}

export async function handleConfirmSignUp(email: string, confirmationCode: string): Promise<void> {
  if (USE_MOCK_AUTH) {
    // Mock confirmation - just return success
    return;
  }

  try {
    await confirmSignUp({
      username: email,
      confirmationCode,
    });
  } catch (error) {
    throw error;
  }
}

export async function handleResendSignUpCode(email: string): Promise<void> {
  try {
    await resendSignUpCode({
      username: email,
    });
  } catch (error) {
    throw error;
  }
}

export async function getCurrentAuthUser() {
  if (USE_MOCK_AUTH) {
    // Check localStorage for mock user
    if (mockUser) {
      return mockUser;
    }
    const savedUser = localStorage.getItem(MOCK_USER_KEY);
    if (savedUser) {
      try {
        mockUser = JSON.parse(savedUser);
        return mockUser;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  try {
    const user = await getCurrentUser();
    return user;
  } catch (error) {
    return null;
  }
}

export async function getAuthSession() {
  try {
    const session = await fetchAuthSession();
    return session;
  } catch (error) {
    return null;
  }
}

