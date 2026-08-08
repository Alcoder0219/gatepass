/** Leave module types. Kept out of `types/index.ts` so the modules stay separate. */

export type LeaveStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'CHANGES_REQUESTED'
  | 'HR_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'COMPLETED';

/* ─── Leave type catalogue ────────────────────────────────────────────────────
 * Mirrors `backend/src/modules/leave/constants/index.js`. Both value sets are
 * ASSUMPTIONS pending the Business Blueprint — see the note in that file.
 * ────────────────────────────────────────────────────────────────────────────*/
export type LeaveNature = 'PAID' | 'UNPAID';
export type LeaveCategory = 'REGULAR' | 'SPECIAL' | 'STATUTORY' | 'OTHER';

export const LEAVE_NATURE_OPTIONS: { value: LeaveNature; label: string }[] = [
  { value: 'PAID', label: 'Paid' },
  { value: 'UNPAID', label: 'Unpaid' },
];

export const LEAVE_CATEGORY_OPTIONS: { value: LeaveCategory; label: string }[] = [
  { value: 'REGULAR', label: 'Regular' },
  { value: 'SPECIAL', label: 'Special' },
  { value: 'STATUTORY', label: 'Statutory' },
  { value: 'OTHER', label: 'Other' },
];

export interface LeaveType {
  _id: string;
  code: string;
  name: string;
  type: LeaveNature;
  category: LeaveCategory;
  includeWeeklyOff: boolean;
  includeHolidays: boolean;
  description: string;
  annualQuota: number;
  allowHalfDay: boolean;
  requiresAttachmentAfterDays: number;
  color: string;
  isActive: boolean;
  isPaid?: boolean;
  createdAt: string;
  updatedAt: string;
  usage?: { requests: number; balances: number };
}

export interface LeaveTypePayload {
  code: string;
  name: string;
  type: LeaveNature;
  category: LeaveCategory;
  includeWeeklyOff: boolean;
  includeHolidays: boolean;
  description: string;
  annualQuota: number;
  allowHalfDay: boolean;
  requiresAttachmentAfterDays: number;
  isActive: boolean;
}

export interface LeaveTypeFilters {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  type?: LeaveNature | 'ALL';
  category?: LeaveCategory | 'ALL';
  isActive?: boolean;
}

/* ─── Application ─────────────────────────────────────────────────────────── */
export type DayPart = 'FULL' | 'FIRST_HALF' | 'SECOND_HALF';

export interface BalanceFigures {
  entitled: number;
  used: number;
  pending: number;
  available: number;
}

export interface ApplyLeaveType {
  _id: string;
  code: string;
  name: string;
  type: LeaveNature;
  category: LeaveCategory;
  color: string;
  allowHalfDay: boolean;
  includeWeeklyOff: boolean;
  includeHolidays: boolean;
  annualQuota: number;
  balance: BalanceFigures;
}

export interface ApplyPrefill {
  leaveYear: string;
  employee: {
    _id: string;
    name: string;
    employeeId: string;
    designation: string;
    department: string;
    unit: string;
    reportingManager: string;
    hasManager: boolean;
  };
  leaveTypes: ApplyLeaveType[];
}

export interface DayBreakdown {
  date: string;
  dayPart: DayPart;
  charged: number;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string;
  reason: string;
}

export interface LeavePreview {
  totalDays: number;
  breakdown: DayBreakdown[];
  workingDays: number;
  nonWorkingDays: number;
  spanDays: number;
  leaveYear: string;
  balance: BalanceFigures;
  sufficient: boolean;
  shortfall: number;
  overlap: { leaveNumber: string; fromDate: string; toDate: string; status: LeaveStatus } | null;
}

export interface ApplyPayload {
  leaveType: string;
  fromDate: string;
  toDate: string;
  fromDayPart: DayPart;
  toDayPart: DayPart;
  reason: string;
  contactDuringLeave: string;
  handoverNotes: string;
}

export interface BulkApplyResult {
  requested: number;
  applied: { employee: string; employeeName: string; leaveNumber: string; totalDays: number }[];
  failed: { employee: string; employeeName: string; reason: string }[];
}

/* ─── Approval ────────────────────────────────────────────────────────────── */
export type ApprovalStage = 'MANAGER' | 'HR' | 'HISTORY';

export interface TimelineEntry {
  _id: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  actorName?: string;
  actorRole?: string;
  comment: string;
  at: string;
}

export interface ApprovalRequest {
  _id: string;
  leaveNumber: string;
  employee: string;
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  unitName: string;
  designation: string;
  leaveTypeName: string;
  leaveTypeCode: string;
  fromDate: string;
  toDate: string;
  fromDayPart: DayPart;
  toDayPart: DayPart;
  totalDays: number;
  reason: string;
  contactDuringLeave: string;
  handoverNotes: string;
  reportingManagerName: string;
  status: LeaveStatus;
  stage: string;
  leaveYear: string;
  appliedOnBehalf: boolean;
  balanceSnapshot?: { availableAtSubmission: number; afterDeduction: number };
  approval?: { approvedAt?: string; rejectedAt?: string; comment?: string };
  hrReview?: { reviewedAt?: string; status?: string | null; comment?: string };
  timeline: TimelineEntry[];
  workingDaysBreakdown?: DayBreakdown[];
  createdAt: string;
}

/* ─── Reports ─────────────────────────────────────────────────────────────── */
export type ReportKey =
  | 'BALANCE'
  | 'REGISTER'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'DEPARTMENT'
  | 'COMPANY'
  | 'EMPLOYEE'
  | 'UTILIZATION'
  | 'YEARLY';

export interface ReportColumn {
  key: string;
  header: string;
  width?: number;
}

export interface ReportChart {
  type: 'bar' | 'donut' | 'line';
  title: string;
  data: { name: string; count: number; days?: number }[];
}

export interface LeaveReport {
  key: ReportKey;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  summary: Record<string, number>;
  charts: ReportChart[];
  generatedAt: string;
}

export interface ReportFilters {
  from?: string;
  to?: string;
  leaveType?: string;
  unit?: string;
  department?: string;
  employee?: string;
  status?: string;
  leaveYear?: string;
}

/* ─── Deletion ────────────────────────────────────────────────────────────── */
export interface DeletionBlock {
  deletedBy: string | null;
  deletedByName: string;
  deletedAt: string | null;
  reason: string;
  statusAtDeletion: string;
  restoredDays: number;
  restoredFrom: 'PENDING' | 'USED' | 'NONE' | '';
}

export interface DeletableRequest extends ApprovalRequest {
  isDeleted: boolean;
  deletion?: DeletionBlock;
}

export interface DeletionFilters {
  page?: number;
  limit?: number;
  search?: string;
  employee?: string;
  leaveType?: string;
  status?: string;
  unit?: string;
  department?: string;
  from?: string;
  to?: string;
  deletedBy?: string;
  deletedFrom?: string;
  deletedTo?: string;
}

export interface DeletionSummary {
  totals: { deletions: number; daysRestored: number; employees: number };
  byBucket: { _id: string; count: number; days: number }[];
  byStatus: { _id: string; count: number }[];
  byDeleter: { _id: string; count: number; days: number }[];
  byLeaveType: { _id: string; count: number; days: number }[];
}

export interface QueueCounts {
  manager: number;
  hr: number;
}

export interface LeaveRequestRow {
  _id: string;
  leaveNumber: string;
  leaveTypeName: string;
  leaveTypeCode: string;
  fromDate: string;
  toDate: string;
  totalDays: number;
  status: LeaveStatus;
  reason: string;
  createdAt: string;
}

/* ─── Allocation ──────────────────────────────────────────────────────────── */
export interface AllocationLine {
  _id: string;
  leaveType: { _id: string; code: string; name: string; color: string; type: LeaveNature };
  leaveYear: string;
  opening: number;
  accrued: number;
  carriedForward: number;
  adjusted: number;
  remarks: string;
  allocatedAt: string | null;
  entitled: number;
  used: number;
  pending: number;
  available: number;
}

export interface AllocationRow {
  employee: { _id: string; name: string; employeeId: string; email: string; designation: string };
  department: { _id: string; name: string } | null;
  /** "Company" on the UI — this system models sites as Units. */
  unit: { _id: string; name: string } | null;
  leaveYear: string | null;
  allocations: AllocationLine[];
  totals: { entitled: number; used: number; available: number };
}

export interface AllocationFilters {
  page?: number;
  limit?: number;
  year?: string;
  unit?: string;
  department?: string;
  employee?: string;
  search?: string;
  sort?: string;
  allocatedOnly?: boolean;
}

export interface AllocationPayload {
  leaveYear: string;
  employees: string[];
  allocations: {
    leaveType: string;
    opening: number;
    accrued: number;
    carriedForward: number;
    adjusted: number;
  }[];
  remarks: string;
  overwrite: boolean;
}

export interface AllocationSummary {
  employees: number;
  leaveTypes: number;
  created: number;
  updated: number;
}

export interface LeaveBalanceSummary {
  id: string;
  code: string;
  name: string;
  color: string;
  isPaid: boolean;
  entitled: number;
  used: number;
  pending: number;
  available: number;
}

export interface EmployeeOnLeave {
  id: string;
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  leaveTypeName: string;
  leaveTypeCode: string;
  fromDate: string;
  toDate: string;
  totalDays: number;
}

export interface RecentLeaveApplication {
  id: string;
  leaveNumber: string;
  employeeName: string;
  leaveTypeName: string;
  leaveTypeCode: string;
  fromDate: string;
  toDate: string;
  totalDays: number;
  status: LeaveStatus;
  createdAt: string;
}

export interface LeaveDashboardStats {
  leaveYear: string;
  /** TEAM when the caller sees more than their own records. */
  scope: 'OWN' | 'TEAM';
  totals: {
    leaveTypes: number;
    pending: number;
    approved: number;
    rejected: number;
    onLeaveToday: number;
    totalRequests: number;
  };
  onLeaveToday: EmployeeOnLeave[];
  recentApplications: RecentLeaveApplication[];
  balanceSummary: LeaveBalanceSummary[];
}
