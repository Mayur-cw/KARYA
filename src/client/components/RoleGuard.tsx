import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, UserRole } from './AuthContext';
import { LoadingSkeleton } from './LoadingSkeleton';

interface RoleGuardProps {
  allowedRoles: UserRole[];
  requiresAuth?: boolean;
  children: React.ReactNode;
}

export function RoleGuard({
  allowedRoles,
  requiresAuth = true,
  children,
}: RoleGuardProps) {
  const { role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ padding: '40px 20px', maxWidth: '600px', margin: '0 auto' }}>
        <LoadingSkeleton label="Verifying security credentials and access permissions..." />
      </div>
    );
  }

  if (requiresAuth && role === 'anonymous') {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  if (!allowedRoles.includes(role)) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
}
