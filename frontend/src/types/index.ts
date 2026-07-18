/** Mirrors the backend's `src/constants/index.js` and mongoose models. */

/* ─── Enums ──────────────────────────────────────────────────────────────── */
export type RoleKey = 'SUPER_ADMIN' | 'ADMIN' | 'HOD' | 'HR' | 'SECURITY' | 'EMPLOYEE' | (string & {});

export type DataScope = 'OWN' | 'DEPARTMENT' | 'REPORTEES' | 'UNIT' | 'ALL';

export type GatePassStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'CHANGES_REQUESTED'
  | 'REJECTED'
  | 'HR_REVIEW'
  | 'APPROVED'
  | 'OUT'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export type GatePassType = 'OFFICIAL' | 'PERSONAL';

export type WorkflowStage = 'EMPLOYEE' | 'MANAGER' | 'HR' | 'SECURITY' | 'DONE';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export type NotificationType =
  | 'SUBMITTED'
  | 'APPROVAL'
  | 'REJECT'
  | 'CHANGES_REQUESTED'
  | 'REVIEW'
  | 'REVIEW_FAILED'
  | 'EXIT'
  | 'COMPLETED'
  | 'REMINDER'
  | 'CANCELLED'
  | 'SYSTEM';

/* ─── API envelope ───────────────────────────────────────────────────────── */
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface ApiErrorShape {
  success: false;
  message: string;
  code?: string;
  errors?: { field: string; message: string }[];
}

/* ─── Entities ───────────────────────────────────────────────────────────── */
export interface Unit {
  _id: string;
  code: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  gateOpenTime?: string | null;
  gateCloseTime?: string | null;
  headOfUnit?: User | string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  _id: string;
  code: string;
  name: string;
  description?: string;
  unit: Unit | string;
  hod?: User | string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  _id: string;
  key: RoleKey;
  name: string;
  description?: string;
  permissions: string[];
  dataScope: DataScope;
  unitRestrictions?: string[];
  departmentRestrictions?: string[];
  level: number;
  color: string;
  isSystem: boolean;
  isActive: boolean;
  userCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  _id: string;
  employeeId: string;
  name: string;
  email: string;
  phone?: string;
  department: Department | string;
  designation?: string;
  unit: Unit | string;
  role: Role;
  reportingManager?: User | string | null;
  profileImage?: string;
  status: UserStatus;
  extraPermissions?: string[];
  deniedPermissions?: string[];
  lastLoginAt?: string | null;
  initials?: string;
  preferences?: {
    theme: 'light' | 'dark' | 'system';
    emailNotifications: boolean;
    pushNotifications: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  _id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  uploadedAt: string;
}

export interface TimelineEntry {
  _id: string;
  action: string;
  fromStatus?: GatePassStatus;
  toStatus?: GatePassStatus;
  actor?: User | string;
  actorName: string;
  actorRole?: string;
  comment: string;
  at: string;
  meta?: Record<string, unknown>;
}

export interface GatePass {
  _id: string;
  gatePassNumber: string;

  employee: User | string;
  employeeCode: string;
  employeeName: string;
  department: Department | string;
  departmentName: string;
  unit: Unit | string;
  unitName: string;
  designation?: string;

  type: GatePassType;
  reason: string;
  purpose?: string;
  expectedOutTime: string;
  expectedInTime: string;
  attachments: Attachment[];
  remarks?: string;

  reportingManager: User | string;
  reportingManagerName: string;

  status: GatePassStatus;
  stage: WorkflowStage;

  approval: {
    approvedBy?: User | string | null;
    approvedAt?: string | null;
    rejectedBy?: User | string | null;
    rejectedAt?: string | null;
    comment: string;
  };

  hrReview: {
    reviewedBy?: User | string | null;
    reviewedAt?: string | null;
    status?: 'PENDING' | 'OK' | 'NOT_OK' | null;
    comment: string;
  };

  security: {
    exitBy?: User | string | null;
    actualOutTime?: string | null;
    exitPhoto?: string;
    exitRemark?: string;
    entryBy?: User | string | null;
    actualInTime?: string | null;
    entryPhoto?: string;
    entryRemark?: string;
  };

  expiresAt?: string | null;
  isLate: boolean;
  lateByMinutes: number;
  actualDurationMinutes?: number | null;
  isActive?: boolean;

  timeline: TimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  _id: string;
  recipient: string;
  actor?: User | string | null;
  type: NotificationType;
  title: string;
  message: string;
  link: string;
  gatePass?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface AuditLog {
  _id: string;
  action: string;
  actor?: User | string | null;
  actorName: string;
  actorRole: string;
  entity: string;
  entityId?: string | null;
  entityLabel: string;
  description: string;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
  ip: string;
  userAgent: string;
  status: 'SUCCESS' | 'FAILURE';
  createdAt: string;
}

export interface SecurityLog {
  _id: string;
  gatePass: GatePass | string;
  gatePassNumber: string;
  employee: User | string;
  employeeName: string;
  employeeCode: string;
  type: 'EXIT' | 'ENTRY';
  recordedBy: User | string;
  recordedByName: string;
  recordedAt: string;
  photo?: string;
  remark?: string;
  verificationMethod: 'QR' | 'MANUAL' | 'SEARCH';
  isLate: boolean;
  lateByMinutes: number;
}

export interface HRReviewRecord {
  _id: string;
  gatePass: GatePass | string;
  gatePassNumber: string;
  employee: User | string;
  reviewer: User | string;
  reviewerName: string;
  status: 'OK' | 'NOT_OK';
  comment: string;
  reviewedAt: string;
}

export interface Holiday {
  _id: string;
  name: string;
  date: string;
  type: 'PUBLIC' | 'RESTRICTED' | 'COMPANY';
  units: string[];
  restrictGatePass: boolean;
  description?: string;
  isActive: boolean;
}

/* ─── Settings ───────────────────────────────────────────────────────────── */
export interface QuotaLimit {
  daily: number;
  weekly: number;
  monthly: number;
  yearly: number;
}

export interface Settings {
  _id: string;
  key: string;
  company: { name: string; logo: string; email: string; phone: string; address: string };
  limits: { official: QuotaLimit; personal: QuotaLimit };
  unitLimits: { unit: Unit | string; limits: { official: QuotaLimit; personal: QuotaLimit } }[];
  departmentLimits: {
    department: Department | string;
    limits: { official: QuotaLimit; personal: QuotaLimit };
  }[];
  roleLimits: { role: Role | string; limits: { official: QuotaLimit; personal: QuotaLimit } }[];
  maxActiveGatePasses: number;
  allowMultiplePending: boolean;
  workingHours: {
    gateOpenTime: string;
    gateCloseTime: string;
    weekendDays: number[];
    restrictWeekend: boolean;
    restrictHolidays: boolean;
    enforceGateHours: boolean;
  };
  workflow: {
    approvalRequired: boolean;
    hrReviewRequired: boolean;
    securityApprovalRequired: boolean;
    attachmentMandatory: boolean;
    reasonMandatory: boolean;
    purposeMandatory: boolean;
    hrReviewForPersonalOnly: boolean;
    autoClosePass: boolean;
    expiryHours: number;
    autoReminder: boolean;
    reminderBeforeMinutes: number;
  };
  notifications: { email: boolean; push: boolean; sms: boolean; whatsapp: boolean; inApp: boolean };
  security: {
    requireExitPhoto: boolean;
    requireEntryPhoto: boolean;
    allowManualVerification: boolean;
    qrEnabled: boolean;
  };
  branding: { primaryColor: string; accentColor: string; defaultTheme: 'light' | 'dark' | 'system' };
  updatedAt: string;
}

/* ─── Dashboard / reports ────────────────────────────────────────────────── */
export interface DashboardStats {
  pending: number;
  approved: number;
  rejected: number;
  completed: number;
  todayTotal: number;
  personal: number;
  official: number;
  currentlyOut: number;
  overdue: number;
  trend?: Record<string, number>;
}

export interface DashboardCharts {
  monthlyTrend: { label: string; official: number; personal: number; total: number }[];
  byDepartment: { name: string; count: number }[];
  byUnit: { name: string; count: number }[];
  byStatus: { status: GatePassStatus; count: number }[];
  byManager: { name: string; approved: number; rejected: number; pending: number }[];
}

export interface ActivityItem {
  id: string;
  gatePassId: string;
  gatePassNumber: string;
  action: string;
  actorName: string;
  comment?: string;
  at: string;
}

export interface Insight {
  id: string;
  title: string;
  message: string;
  sentiment: 'positive' | 'neutral' | 'warning';
  metric?: string;
}

export interface QuotaSnapshot {
  [type: string]: Record<string, { used: number; limit: number; remaining: number }>;
}

export interface GatePassPrefill {
  employeeCode: string;
  employeeName: string;
  department: { id: string; name: string };
  unit: { id: string; name: string };
  designation: string;
  reportingManager: { id: string; name: string } | null;
  quota: QuotaSnapshot;
  workflow: Partial<Settings['workflow']> & Partial<Settings['workingHours']>;
}

export interface PermissionCatalogueGroup {
  group: string;
  permissions: { key: string; label: string; description: string; sidebar?: boolean }[];
}

export interface SecurityVerification {
  valid: boolean;
  reason: string;
  canExit: boolean;
  canReturn: boolean;
}

export interface GlobalSearchResults {
  gatePasses: (GatePass & { type_: 'gatePass'; link: string })[];
  employees: (User & { type_: 'employee'; link: string })[];
  departments: (Department & { type_: 'department'; link: string })[];
  units: (Unit & { type_: 'unit'; link: string })[];
}

/* ─── Filters shared by the list screens ─────────────────────────────────── */
export interface GatePassFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: GatePassStatus | GatePassStatus[] | string;
  type?: GatePassType;
  unit?: string;
  department?: string;
  employee?: string;
  reportingManager?: string;
  from?: string;
  to?: string;
  sort?: string;
}

/* ─── Bulk user import ───────────────────────────────────────────────────── */

export interface UserImportRowError {
  field: string;
  message: string;
}

export interface UserImportRow {
  /** 1-based line in the source file, counting the header — matches Excel. */
  line: number;
  valid: boolean;
  errors: UserImportRowError[];
  employeeId: string;
  name: string;
  email: string;
}

export interface UserImportCredential {
  name: string;
  email: string;
  employeeId: string;
  /** Only present when the server generated the password. */
  temporaryPassword: string | null;
}

export interface UserImportSummary {
  total: number;
  valid: number;
  invalid: number;
  created: number;
  rows: UserImportRow[];
  credentials: UserImportCredential[];
}
