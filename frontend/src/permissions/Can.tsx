import type { ReactNode } from 'react';
import { usePermissions } from './usePermissions';
import type { Permission } from './constants';

interface CanProps {
  /** Render the children only if the user holds this permission. */
  do?: Permission | string;
  /** …or at least one of these. */
  any?: (Permission | string)[];
  /** …or all of these. */
  all?: (Permission | string)[];
  /** …or holds one of these role keys. */
  role?: string[];
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Declarative permission gate for buttons, menu items and whole sections.
 *
 *   <Can do={PERMISSION.GATEPASS_APPROVE}><ApproveButton /></Can>
 */
export const Can = ({ do: permission, any, all, role, fallback = null, children }: CanProps) => {
  const { can, canAny, canAll, isRole } = usePermissions();

  const allowed =
    (permission ? can(permission) : true) &&
    (any ? canAny(...any) : true) &&
    (all ? canAll(...all) : true) &&
    (role ? isRole(...role) : true);

  return <>{allowed ? children : fallback}</>;
};

export default Can;
