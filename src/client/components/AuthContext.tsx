import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setCsrfToken } from '../api';

export type UserRole = 'admin' | 'student' | 'reviewer' | 'anonymous';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'student' | 'reviewer';
  departmentId: string;
}

export interface DemoActor {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'student' | 'reviewer';
  title: string;
}

export const SEEDED_ACTORS: DemoActor[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Dr. Alok Verma',
    email: 'admin@karya.local',
    role: 'admin',
    title: 'Department Administrator',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Aarav Patel',
    email: 'student.a@karya.local',
    role: 'student',
    title: 'Student A (Primary Applicant)',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Bhavya Singh',
    email: 'student.b@karya.local',
    role: 'student',
    title: 'Student B (Independent Cohort)',
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'Prof. Priya Iyer',
    email: 'mentor@karya.local',
    role: 'reviewer',
    title: 'Faculty Mentor (Stage 0 Reviewer)',
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    name: 'Dean R. K. Nair',
    email: 'dean@karya.local',
    role: 'reviewer',
    title: 'Dean / Final Authority (Stage 1 Reviewer)',
  },
];

interface AuthContextType {
  user: UserProfile | null;
  role: UserRole;
  loading: boolean;
  error: string | null;
  unreadCount: number;
  login: (userId: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const data = await api<{ count: number }>('/api/notifications/unread-count');
      setUnreadCount(data.count ?? 0);
    } catch {
      // Ignore background notification fetch errors
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api<{ user: UserProfile | null; csrfToken: string }>('/api/session');
      if (data.csrfToken) {
        setCsrfToken(data.csrfToken);
      }
      setUser(data.user);
      if (data.user) {
        refreshUnreadCount();
      } else {
        setUnreadCount(0);
      }
    } catch {
      // Normal state for unauthenticated visitor
      setUser(null);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, [refreshUnreadCount]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = async (userId: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await api<{ user: UserProfile; csrfToken: string }>('/api/session', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      if (data.csrfToken) {
        setCsrfToken(data.csrfToken);
      }
      setUser(data.user);
      await refreshUnreadCount();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      await api('/api/session', { method: 'DELETE' });
      setUser(null);
      setUnreadCount(0);
      // Refresh to get a fresh anonymous CSRF token
      await refreshSession();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign out failed');
    } finally {
      setLoading(false);
    }
  };

  const role: UserRole = user ? user.role : 'anonymous';

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        error,
        unreadCount,
        login,
        logout,
        refreshSession,
        refreshUnreadCount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
