import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { HOME_FOR_ROLE, useAuth } from './AuthContext';
import type { Role } from '../lib/types';
import { Spinner } from '../components/Feedback';

interface Props {
  children: ReactNode;
  roles?: Role[];
}

/**
 * Client-side route guard. Server-side RBAC is the real enforcement — this
 * only avoids showing UI the user could never use.
 */
export function ProtectedRoute({ children, roles }: Props) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading…" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={HOME_FOR_ROLE[user.role]} replace />;
  }

  return <>{children}</>;
}
