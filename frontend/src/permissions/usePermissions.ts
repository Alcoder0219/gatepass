import { useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE, type Permission } from './constants';

/**
 * The UI's read of the RBAC model. It decides what to *render*; the API is
 * still the enforcement point — a hidden button is a UX affordance, not a
 * security control.
 */
export const usePermissions = () => {
  const { user, permissions } = useAuth();

  const roleKey = user?.role?.key;
  const isSuperAdmin = roleKey === ROLE.SUPER_ADMIN;

  const set = useMemo(() => new Set(permissions), [permissions]);

  const can = useCallback(
    (permission: Permission | string) => isSuperAdmin || set.has(permission),
    [isSuperAdmin, set]
  );

  const canAny = useCallback(
    (...list: (Permission | string)[]) => isSuperAdmin || list.some((p) => set.has(p)),
    [isSuperAdmin, set]
  );

  const canAll = useCallback(
    (...list: (Permission | string)[]) => isSuperAdmin || list.every((p) => set.has(p)),
    [isSuperAdmin, set]
  );

  const isRole = useCallback((...keys: string[]) => Boolean(roleKey && keys.includes(roleKey)), [roleKey]);

  return {
    can,
    canAny,
    canAll,
    isRole,
    isSuperAdmin,
    isAdmin: isSuperAdmin || roleKey === ROLE.ADMIN,
    roleKey,
    dataScope: user?.role?.dataScope,
    permissions,
  };
};

export default usePermissions;
