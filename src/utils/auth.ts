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

// Configure Amplify
const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
      userPoolClientId: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID || '',
      region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
    },
  },
};

Amplify.configure(amplifyConfig);

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
  try {
    await signOut();
  } catch (error) {
    throw error;
  }
}

export async function handleConfirmSignUp(email: string, confirmationCode: string): Promise<void> {
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

