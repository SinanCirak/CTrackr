import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getCurrentAuthUser, getAuthSession, handleSignOut, type SignInInput, type SignUpInput } from '../utils/auth';
import type { User } from 'aws-amplify/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (input: SignInInput) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAuth = async () => {
    try {
      const currentUser = await getCurrentAuthUser();
      setUser(currentUser);
    } catch (error) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshAuth();
  }, []);

  const signIn = async (input: SignInInput) => {
    const { handleSignIn } = await import('../utils/auth');
    await handleSignIn(input);
    await refreshAuth();
  };

  const signUp = async (input: SignUpInput) => {
    const { handleSignUp } = await import('../utils/auth');
    await handleSignUp(input);
  };

  const signOut = async () => {
    await handleSignOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signUp,
        signOut,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

