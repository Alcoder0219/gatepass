import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/permissions/usePermissions';
import { Button, EmptyState } from '@/components/ui';
import { FullPageLoader } from '@/components/common/FullPageLoader';

/**
 * Route-level gate. Two distinct failures, two distinct outcomes:
 *   not signed in  → redirect to /login (remembering where they were headed)
 *   signed in, but lacking the permission → a 403 screen, NOT a redirect.
 * Silently bouncing an authorised-but-unpermitted user to the dashboard makes
 * the app feel broken; telling them is honest.
 */
export const ProtectedRoute = ({
  children,
  permissions,
  requireAll = false,
}: {
  children: ReactNode;
  permissions?: string[];
  requireAll?: boolean;
}) => {
  const { isAuthenticated, isLoading } = useAuth();
  const { canAny, canAll } = usePermissions();
  const location = useLocation();

  if (isLoading) return <FullPageLoader />;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (permissions?.length) {
    const allowed = requireAll ? canAll(...permissions) : canAny(...permissions);
    if (!allowed) {
      return (
        <EmptyState
          icon={<ShieldAlert className="h-7 w-7" />}
          title="You don't have access to this page"
          message="Your role doesn't include the permission this module requires. If you think that's wrong, ask an administrator to review your role."
          action={
            <Button variant="secondary" onClick={() => window.history.back()}>
              Go back
            </Button>
          }
        />
      );
    }
  }

  return <>{children}</>;
};

/** Keeps an already-signed-in user off /login and /forgot-password. */
export const PublicOnlyRoute = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <FullPageLoader />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

export default ProtectedRoute;
