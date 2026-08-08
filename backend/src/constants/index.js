/**
 * Single source of truth for the RBAC vocabulary, workflow states and enums.
 * The frontend mirrors this file in `frontend/src/permissions/constants.ts`.
 * Roles are DYNAMIC (stored in the Role collection) — these keys are only the
 * system-provisioned defaults that the seeder creates and that cannot be deleted.
 */

/* ─── Roles (system defaults; more can be created at runtime) ─────────────── */
export const ROLE = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  HOD: 'HOD',
  HR: 'HR',
  SECURITY: 'SECURITY',
  EMPLOYEE: 'EMPLOYEE',
});

export const SYSTEM_ROLES = Object.values(ROLE);

/* ─── Data scope: how much data a role may read ───────────────────────────── */
export const DATA_SCOPE = Object.freeze({
  OWN: 'OWN', // only records the user created
  DEPARTMENT: 'DEPARTMENT', // records of the user's department
  REPORTEES: 'REPORTEES', // records of users whose reportingManager is the user
  UNIT: 'UNIT', // records within the user's unit(s)
  ALL: 'ALL', // everything
});

export const DATA_SCOPES = Object.values(DATA_SCOPE);

/* ─── Permissions ─────────────────────────────────────────────────────────── */
/**
 * Every permission is a `module.action` key. A Role holds a flat array of these.
 * `group` drives the toggle UI on the Roles screen; `sidebar` marks the
 * permission that gates a sidebar entry so the frontend can build the nav.
 */
export const PERMISSION = Object.freeze({
  // Dashboard & analytics
  DASHBOARD_VIEW: 'dashboard.view',
  ANALYTICS_VIEW: 'analytics.view',

  // Gate pass lifecycle
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

  // HR review stage
  HR_REVIEW: 'hr.review',
  HR_REVIEW_VIEW: 'hr.review_view',

  // Security stage
  SECURITY_ACCESS: 'security.access',
  SECURITY_MARK_EXIT: 'security.mark_exit',
  SECURITY_MARK_RETURN: 'security.mark_return',
  SECURITY_SCAN: 'security.scan',

  // Leave management — leave types
  LEAVE_TYPE_VIEW: 'leave_type.view',
  LEAVE_TYPE_CREATE: 'leave_type.create',
  LEAVE_TYPE_UPDATE: 'leave_type.update',
  LEAVE_TYPE_DELETE: 'leave_type.delete',

  // Leave management — allocation of balances to employees
  LEAVE_ALLOCATION_VIEW: 'leave_allocation.view',
  LEAVE_ALLOCATION_CREATE: 'leave_allocation.create',
  LEAVE_ALLOCATION_UPDATE: 'leave_allocation.update',
  LEAVE_ALLOCATION_DELETE: 'leave_allocation.delete',

  // Leave management — applying for leave
  LEAVE_APPLY: 'leave.apply',
  LEAVE_VIEW_OWN: 'leave.view_own',
  LEAVE_APPLY_BULK: 'leave.apply_bulk',

  // Leave management — approval workflow (Employee → HOD → HR)
  LEAVE_APPROVE: 'leave.approve',
  LEAVE_HR_REVIEW: 'leave.hr_review',

  /**
   * Deletion is deliberately a single permission covering view AND act: the
   * register exposes every employee's leave history, so seeing it is as
   * privileged as using it. Granted to HR and Admin only.
   */
  LEAVE_DELETE: 'leave.delete',

  // Leave management — reporting
  LEAVE_REPORTS_VIEW: 'leave.reports_view',
  LEAVE_REPORTS_EXPORT: 'leave.reports_export',

  // Reports
  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',

  // Administration
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
});

export const PERMISSIONS = Object.values(PERMISSION);

/**
 * Catalogue consumed by the Role & Permission management screen. Each entry is
 * rendered as a toggle inside its group.
 */
export const PERMISSION_CATALOGUE = [
  {
    group: 'Dashboard',
    permissions: [
      { key: PERMISSION.DASHBOARD_VIEW, label: 'Dashboard', description: 'Access the dashboard', sidebar: true },
      { key: PERMISSION.ANALYTICS_VIEW, label: 'Analytics', description: 'View analytics & AI insights', sidebar: true },
    ],
  },
  {
    group: 'Gate Pass',
    permissions: [
      { key: PERMISSION.GATEPASS_CREATE, label: 'Create Gate Pass', description: 'Raise a new gate pass', sidebar: true },
      { key: PERMISSION.GATEPASS_VIEW_OWN, label: 'View Own', description: 'See own gate passes', sidebar: true },
      { key: PERMISSION.GATEPASS_VIEW_DEPARTMENT, label: 'View Department', description: 'See department / reportee gate passes' },
      { key: PERMISSION.GATEPASS_VIEW_ALL, label: 'View All', description: 'See every gate pass' },
      { key: PERMISSION.GATEPASS_UPDATE, label: 'Update', description: 'Edit a gate pass' },
      { key: PERMISSION.GATEPASS_CANCEL, label: 'Cancel', description: 'Cancel own gate pass' },
      { key: PERMISSION.GATEPASS_DELETE, label: 'Delete', description: 'Delete a gate pass' },
      { key: PERMISSION.GATEPASS_EXPORT, label: 'Export', description: 'Export to Excel / CSV / PDF' },
      { key: PERMISSION.GATEPASS_PRINT, label: 'Print', description: 'Print a gate pass' },
    ],
  },
  {
    group: 'Approvals',
    permissions: [
      { key: PERMISSION.GATEPASS_APPROVE, label: 'Approve', description: 'Approve a pending gate pass', sidebar: true },
      { key: PERMISSION.GATEPASS_REJECT, label: 'Reject', description: 'Reject a gate pass' },
      { key: PERMISSION.GATEPASS_REQUEST_CHANGES, label: 'Request Changes', description: 'Send back to the employee' },
    ],
  },
  {
    group: 'HR Review',
    permissions: [
      { key: PERMISSION.HR_REVIEW_VIEW, label: 'HR Queue', description: 'See the HR review queue', sidebar: true },
      { key: PERMISSION.HR_REVIEW, label: 'Review', description: 'Mark review OK / Not OK' },
    ],
  },
  {
    group: 'Security',
    permissions: [
      { key: PERMISSION.SECURITY_ACCESS, label: 'Security Access', description: 'Open the security console', sidebar: true },
      { key: PERMISSION.SECURITY_SCAN, label: 'Scan QR', description: 'Scan and verify a gate pass QR' },
      { key: PERMISSION.SECURITY_MARK_EXIT, label: 'Mark Exit', description: 'Record actual out time' },
      { key: PERMISSION.SECURITY_MARK_RETURN, label: 'Mark Return', description: 'Record actual in time' },
    ],
  },
  {
    group: 'Leave Management',
    permissions: [
      { key: PERMISSION.LEAVE_TYPE_VIEW, label: 'Leave Types', description: 'View the leave type catalogue', sidebar: true },
      { key: PERMISSION.LEAVE_TYPE_CREATE, label: 'Create Leave Type', description: 'Add a new leave type' },
      { key: PERMISSION.LEAVE_TYPE_UPDATE, label: 'Update Leave Type', description: 'Edit an existing leave type' },
      { key: PERMISSION.LEAVE_TYPE_DELETE, label: 'Delete Leave Type', description: 'Deactivate or delete a leave type' },
      { key: PERMISSION.LEAVE_ALLOCATION_VIEW, label: 'Leave Allocation', description: 'View allocated leave balances', sidebar: true },
      { key: PERMISSION.LEAVE_ALLOCATION_CREATE, label: 'Create Allocation', description: 'Allocate leave to employees' },
      { key: PERMISSION.LEAVE_ALLOCATION_UPDATE, label: 'Update Allocation', description: 'Revise an allocated balance' },
      { key: PERMISSION.LEAVE_ALLOCATION_DELETE, label: 'Delete Allocation', description: 'Remove an allocation' },
      { key: PERMISSION.LEAVE_APPLY, label: 'Apply Leave', description: 'Raise a leave application for yourself', sidebar: true },
      { key: PERMISSION.LEAVE_VIEW_OWN, label: 'My Leaves', description: 'See your own leave applications', sidebar: true },
      { key: PERMISSION.LEAVE_APPLY_BULK, label: 'Bulk Apply', description: 'Apply leave on behalf of other employees' },
      { key: PERMISSION.LEAVE_APPROVE, label: 'Leave Approval', description: 'Approve or reject at the manager stage', sidebar: true },
      { key: PERMISSION.LEAVE_HR_REVIEW, label: 'Leave HR Review', description: 'Approve or reject at the HR stage', sidebar: true },
      { key: PERMISSION.LEAVE_DELETE, label: 'Leave Deletion', description: 'Delete leave records and restore the balance — HR and Admin only', sidebar: true },
      { key: PERMISSION.LEAVE_REPORTS_VIEW, label: 'Leave Reports', description: 'Open the leave reporting module', sidebar: true },
      { key: PERMISSION.LEAVE_REPORTS_EXPORT, label: 'Export Leave Reports', description: 'Download reports as Excel, CSV or PDF' },
    ],
  },
  {
    group: 'Reports',
    permissions: [
      { key: PERMISSION.REPORTS_VIEW, label: 'Reports', description: 'Open the reports module', sidebar: true },
      { key: PERMISSION.REPORTS_EXPORT, label: 'Export Reports', description: 'Download report data' },
    ],
  },
  {
    group: 'Administration',
    permissions: [
      { key: PERMISSION.USERS_VIEW, label: 'Users', description: 'View users', sidebar: true },
      { key: PERMISSION.USERS_CREATE, label: 'Create User', description: 'Create a user' },
      { key: PERMISSION.USERS_UPDATE, label: 'Update User', description: 'Edit a user' },
      { key: PERMISSION.USERS_DELETE, label: 'Delete User', description: 'Deactivate / delete a user' },
      { key: PERMISSION.ROLES_VIEW, label: 'Roles', description: 'View roles & permissions', sidebar: true },
      { key: PERMISSION.ROLES_MANAGE, label: 'Manage Roles', description: 'Create roles, toggle permissions' },
      { key: PERMISSION.UNITS_MANAGE, label: 'Manage Units', description: 'Create & edit units', sidebar: true },
      { key: PERMISSION.DEPARTMENTS_MANAGE, label: 'Manage Departments', description: 'Create & edit departments', sidebar: true },
      { key: PERMISSION.HOLIDAYS_MANAGE, label: 'Manage Holidays', description: 'Maintain the holiday calendar' },
    ],
  },
  {
    group: 'System',
    permissions: [
      { key: PERMISSION.SETTINGS_VIEW, label: 'Settings', description: 'View system settings', sidebar: true },
      { key: PERMISSION.SETTINGS_UPDATE, label: 'Update Settings', description: 'Change system settings' },
      { key: PERMISSION.NOTIFICATIONS_VIEW, label: 'Notifications', description: 'See notifications', sidebar: true },
      { key: PERMISSION.AUDIT_VIEW, label: 'Audit Logs', description: 'Read the audit trail', sidebar: true },
      { key: PERMISSION.TUTORIALS_VIEW, label: 'Tutorials', description: 'Open the tutorials module', sidebar: true },
    ],
  },
];

/* ─── Gate pass workflow ──────────────────────────────────────────────────── */
export const GATEPASS_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING: 'PENDING', // waiting on the reporting manager
  CHANGES_REQUESTED: 'CHANGES_REQUESTED', // manager sent it back to the employee
  REJECTED: 'REJECTED', // terminal — rejected by manager or HR
  HR_REVIEW: 'HR_REVIEW', // manager approved, waiting on HR
  APPROVED: 'APPROVED', // fully approved, visible to security
  OUT: 'OUT', // security recorded the exit
  COMPLETED: 'COMPLETED', // employee returned, in-time recorded
  CANCELLED: 'CANCELLED', // withdrawn by the employee
  EXPIRED: 'EXPIRED', // auto-closed by the expiry job
});

export const GATEPASS_STATUSES = Object.values(GATEPASS_STATUS);

/** Statuses that still occupy an "active" slot against the max-active-pass limit. */
export const ACTIVE_STATUSES = [
  GATEPASS_STATUS.PENDING,
  GATEPASS_STATUS.CHANGES_REQUESTED,
  GATEPASS_STATUS.HR_REVIEW,
  GATEPASS_STATUS.APPROVED,
  GATEPASS_STATUS.OUT,
];

/** Statuses that count towards the daily/weekly/monthly/yearly quota. */
export const QUOTA_STATUSES = [
  GATEPASS_STATUS.PENDING,
  GATEPASS_STATUS.HR_REVIEW,
  GATEPASS_STATUS.APPROVED,
  GATEPASS_STATUS.OUT,
  GATEPASS_STATUS.COMPLETED,
];

export const GATEPASS_TYPE = Object.freeze({
  OFFICIAL: 'OFFICIAL',
  PERSONAL: 'PERSONAL',
});

export const GATEPASS_TYPES = Object.values(GATEPASS_TYPE);

/** Workflow stage — a coarse pointer to who currently owns the record. */
export const WORKFLOW_STAGE = Object.freeze({
  EMPLOYEE: 'EMPLOYEE',
  MANAGER: 'MANAGER',
  HR: 'HR',
  SECURITY: 'SECURITY',
  DONE: 'DONE',
});

/** Legal status transitions. Enforced in the gate pass service. */
export const STATUS_TRANSITIONS = Object.freeze({
  [GATEPASS_STATUS.DRAFT]: [GATEPASS_STATUS.PENDING, GATEPASS_STATUS.CANCELLED],
  [GATEPASS_STATUS.PENDING]: [
    GATEPASS_STATUS.HR_REVIEW,
    GATEPASS_STATUS.APPROVED,
    GATEPASS_STATUS.REJECTED,
    GATEPASS_STATUS.CHANGES_REQUESTED,
    GATEPASS_STATUS.CANCELLED,
    GATEPASS_STATUS.EXPIRED,
  ],
  [GATEPASS_STATUS.CHANGES_REQUESTED]: [
    GATEPASS_STATUS.PENDING,
    GATEPASS_STATUS.CANCELLED,
    GATEPASS_STATUS.EXPIRED,
  ],
  [GATEPASS_STATUS.HR_REVIEW]: [
    GATEPASS_STATUS.APPROVED,
    GATEPASS_STATUS.REJECTED,
    GATEPASS_STATUS.PENDING, // HR "Not OK" → back to the manager
    GATEPASS_STATUS.CANCELLED,
    GATEPASS_STATUS.EXPIRED,
  ],
  [GATEPASS_STATUS.APPROVED]: [
    GATEPASS_STATUS.OUT,
    GATEPASS_STATUS.CANCELLED,
    GATEPASS_STATUS.EXPIRED,
  ],
  [GATEPASS_STATUS.OUT]: [GATEPASS_STATUS.COMPLETED, GATEPASS_STATUS.EXPIRED],
  [GATEPASS_STATUS.COMPLETED]: [],
  [GATEPASS_STATUS.REJECTED]: [],
  [GATEPASS_STATUS.CANCELLED]: [],
  [GATEPASS_STATUS.EXPIRED]: [],
});

/* ─── Notifications ───────────────────────────────────────────────────────── */
export const NOTIFICATION_TYPE = Object.freeze({
  SUBMITTED: 'SUBMITTED',
  APPROVAL: 'APPROVAL',
  REJECT: 'REJECT',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REVIEW: 'REVIEW',
  REVIEW_FAILED: 'REVIEW_FAILED',
  EXIT: 'EXIT',
  COMPLETED: 'COMPLETED',
  REMINDER: 'REMINDER',
  CANCELLED: 'CANCELLED',
  SYSTEM: 'SYSTEM',
});

export const NOTIFICATION_TYPES = Object.values(NOTIFICATION_TYPE);

/* ─── Audit ───────────────────────────────────────────────────────────────── */
export const AUDIT_ACTION = Object.freeze({
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  PASSWORD_RESET: 'PASSWORD_RESET',
  GATEPASS_CREATE: 'GATEPASS_CREATE',
  GATEPASS_UPDATE: 'GATEPASS_UPDATE',
  GATEPASS_DELETE: 'GATEPASS_DELETE',
  GATEPASS_APPROVE: 'GATEPASS_APPROVE',
  GATEPASS_REJECT: 'GATEPASS_REJECT',
  GATEPASS_REQUEST_CHANGES: 'GATEPASS_REQUEST_CHANGES',
  GATEPASS_CANCEL: 'GATEPASS_CANCEL',
  HR_REVIEW_OK: 'HR_REVIEW_OK',
  HR_REVIEW_NOT_OK: 'HR_REVIEW_NOT_OK',
  SECURITY_EXIT: 'SECURITY_EXIT',
  SECURITY_ENTRY: 'SECURITY_ENTRY',
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_DELETE: 'USER_DELETE',
  ROLE_CREATE: 'ROLE_CREATE',
  ROLE_UPDATE: 'ROLE_UPDATE',
  ROLE_DELETE: 'ROLE_DELETE',
  SETTINGS_UPDATE: 'SETTINGS_UPDATE',
  UNIT_UPSERT: 'UNIT_UPSERT',
  DEPARTMENT_UPSERT: 'DEPARTMENT_UPSERT',
  HOLIDAY_UPSERT: 'HOLIDAY_UPSERT',
  EXPORT: 'EXPORT',
  // Leave management. These MUST exist here: `recordAudit` swallows its errors,
  // so an action missing from this enum fails the audit write silently.
  LEAVE_TYPE_CREATE: 'LEAVE_TYPE_CREATE',
  LEAVE_TYPE_UPDATE: 'LEAVE_TYPE_UPDATE',
  LEAVE_TYPE_DELETE: 'LEAVE_TYPE_DELETE',
  LEAVE_ALLOCATION_CREATE: 'LEAVE_ALLOCATION_CREATE',
  LEAVE_ALLOCATION_UPDATE: 'LEAVE_ALLOCATION_UPDATE',
  LEAVE_ALLOCATION_DELETE: 'LEAVE_ALLOCATION_DELETE',
  LEAVE_APPLY: 'LEAVE_APPLY',
  LEAVE_APPLY_BULK: 'LEAVE_APPLY_BULK',
  LEAVE_APPROVE: 'LEAVE_APPROVE',
  LEAVE_HR_APPROVE: 'LEAVE_HR_APPROVE',
  LEAVE_REJECT: 'LEAVE_REJECT',
  LEAVE_SEND_BACK: 'LEAVE_SEND_BACK',
  LEAVE_DELETE: 'LEAVE_DELETE',
});

export const AUDIT_ACTIONS = Object.values(AUDIT_ACTION);

/* ─── Socket events ───────────────────────────────────────────────────────── */
export const SOCKET_EVENT = Object.freeze({
  NOTIFICATION: 'notification:new',
  NOTIFICATION_READ: 'notification:read',
  GATEPASS_UPDATED: 'gatepass:updated',
  GATEPASS_CREATED: 'gatepass:created',
  ACTIVITY: 'activity:new',
  DASHBOARD_REFRESH: 'dashboard:refresh',
});

/** Socket rooms. Users join their own room, their role room and their unit room. */
export const socketRooms = {
  user: (userId) => `user:${userId}`,
  role: (roleKey) => `role:${roleKey}`,
  unit: (unitId) => `unit:${unitId}`,
};

export default {
  ROLE,
  SYSTEM_ROLES,
  DATA_SCOPE,
  DATA_SCOPES,
  PERMISSION,
  PERMISSIONS,
  PERMISSION_CATALOGUE,
  GATEPASS_STATUS,
  GATEPASS_STATUSES,
  GATEPASS_TYPE,
  GATEPASS_TYPES,
  WORKFLOW_STAGE,
  STATUS_TRANSITIONS,
  ACTIVE_STATUSES,
  QUOTA_STATUSES,
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPES,
  AUDIT_ACTION,
  AUDIT_ACTIONS,
  SOCKET_EVENT,
  socketRooms,
};
