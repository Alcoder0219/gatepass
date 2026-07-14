/**
 * Mirror of the backend's permission vocabulary (`backend/src/constants/index.js`).
 * Keep the two in sync — the backend remains the enforcement point; this copy
 * only decides what the UI shows.
 */

export const PERMISSION = {
  DASHBOARD_VIEW: 'dashboard.view',
  ANALYTICS_VIEW: 'analytics.view',

  GATEPASS_CREATE: 'gatepass.create',
  GATEPASS_VIEW_OWN: 'gatepass.view_own',
  GATEPASS_VIEW_DEPARTMENT: 'gatepass.view_department',
  GATEPASS_VIEW_ALL: 'gatepass.view_all',
  GATEPASS_UPDATE: 'gatepass.update',
  GATEPASS_DELETE: 'gatepass.delete',
  GATEPASS_APPROVE: 'gatepass.approve',
  GATEPASS_REJECT: 'gatepass.reject',
  GATEPASS_REQUEST_CHANGES: 'gatepass.request_changes',
  GATEPASS_CANCEL: 'gatepass.cancel',
  GATEPASS_EXPORT: 'gatepass.export',
  GATEPASS_PRINT: 'gatepass.print',

  HR_REVIEW: 'hr.review',
  HR_REVIEW_VIEW: 'hr.review_view',

  SECURITY_ACCESS: 'security.access',
  SECURITY_MARK_EXIT: 'security.mark_exit',
  SECURITY_MARK_RETURN: 'security.mark_return',
  SECURITY_SCAN: 'security.scan',

  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',

  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',

  ROLES_VIEW: 'roles.view',
  ROLES_MANAGE: 'roles.manage',

  UNITS_MANAGE: 'units.manage',
  DEPARTMENTS_MANAGE: 'departments.manage',
  HOLIDAYS_MANAGE: 'holidays.manage',

  SETTINGS_VIEW: 'settings.view',
  SETTINGS_UPDATE: 'settings.update',

  NOTIFICATIONS_VIEW: 'notifications.view',
  AUDIT_VIEW: 'audit.view',
  TUTORIALS_VIEW: 'tutorials.view',
} as const;

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];

export const ROLE = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  HOD: 'HOD',
  HR: 'HR',
  SECURITY: 'SECURITY',
  EMPLOYEE: 'EMPLOYEE',
} as const;

/* ─── Status presentation ────────────────────────────────────────────────── */
import type { GatePassStatus, GatePassType } from '@/types';

interface StatusMeta {
  label: string;
  /** Tailwind classes for the badge. */
  className: string;
  /** Hex, for charts — Recharts cannot read Tailwind classes. */
  color: string;
  description: string;
}

export const STATUS_META: Record<GatePassStatus, StatusMeta> = {
  DRAFT: {
    label: 'Draft',
    className: 'bg-content-subtle/15 text-content-muted ring-content-subtle/25',
    color: '#94a3b8',
    description: 'Not submitted yet',
  },
  PENDING: {
    label: 'Pending',
    className: 'bg-warning-500/15 text-warning-700 dark:text-warning-400 ring-warning-500/25',
    color: '#f59e0b',
    description: 'Waiting for the reporting manager',
  },
  CHANGES_REQUESTED: {
    label: 'Changes Requested',
    className: 'bg-info-500/15 text-info-700 dark:text-info-400 ring-info-500/25',
    color: '#3b82f6',
    description: 'The manager asked for changes',
  },
  HR_REVIEW: {
    label: 'HR Review',
    className: 'bg-brand-500/15 text-brand-700 dark:text-brand-300 ring-brand-500/25',
    color: '#6366f1',
    description: 'Approved by the manager, with HR',
  },
  APPROVED: {
    label: 'Approved',
    className: 'bg-success-500/15 text-success-700 dark:text-success-400 ring-success-500/25',
    color: '#10b981',
    description: 'Cleared — show the QR at the gate',
  },
  OUT: {
    label: 'Out',
    className: 'bg-accent-500/15 text-accent-700 dark:text-accent-300 ring-accent-500/25',
    color: '#06b6d4',
    description: 'Currently outside the gate',
  },
  COMPLETED: {
    label: 'Completed',
    className: 'bg-success-600/15 text-success-700 dark:text-success-400 ring-success-600/25',
    color: '#059669',
    description: 'Returned — the pass is closed',
  },
  REJECTED: {
    label: 'Rejected',
    className: 'bg-danger-500/15 text-danger-700 dark:text-danger-400 ring-danger-500/25',
    color: '#ef4444',
    description: 'Rejected',
  },
  CANCELLED: {
    label: 'Cancelled',
    className: 'bg-content-subtle/15 text-content-muted ring-content-subtle/25',
    color: '#64748b',
    description: 'Withdrawn by the employee',
  },
  EXPIRED: {
    label: 'Expired',
    className: 'bg-danger-400/10 text-danger-600 dark:text-danger-400 ring-danger-400/20',
    color: '#f87171',
    description: 'Auto-closed — never used',
  },
};

export const TYPE_META: Record<GatePassType, { label: string; className: string; color: string }> = {
  OFFICIAL: {
    label: 'Official',
    className: 'bg-brand-500/15 text-brand-700 dark:text-brand-300 ring-brand-500/25',
    color: '#6366f1',
  },
  PERSONAL: {
    label: 'Personal',
    className: 'bg-accent-500/15 text-accent-700 dark:text-accent-300 ring-accent-500/25',
    color: '#06b6d4',
  },
};

/** Categorical palette for charts — ordered for maximum adjacent contrast. */
export const CHART_COLORS = [
  '#6366f1',
  '#06b6d4',
  '#f59e0b',
  '#10b981',
  '#8b5cf6',
  '#ef4444',
  '#3b82f6',
  '#ec4899',
];
