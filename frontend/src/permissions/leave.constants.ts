import type { LeaveStatus } from '@/types/leave';

/**
 * Presentation metadata for leave statuses — the leave module's own equivalent
 * of `STATUS_META`. Separate file, same tone vocabulary, so the two modules look
 * like one product without either importing the other's contract.
 */
type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';

export const LEAVE_STATUS_META: Record<LeaveStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PENDING: { label: 'Pending', tone: 'warning' },
  CHANGES_REQUESTED: { label: 'Changes Requested', tone: 'info' },
  HR_REVIEW: { label: 'HR Review', tone: 'brand' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  COMPLETED: { label: 'Completed', tone: 'success' },
};

export default LEAVE_STATUS_META;
