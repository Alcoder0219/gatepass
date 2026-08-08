/**
 * Leave module vocabulary. Deliberately SEPARATE from `src/constants/index.js`:
 * the leave workflow has its own states and its own transition table, and the
 * gate pass contract must not grow leave concerns.
 *
 * Nothing here is referenced by any gate pass file.
 */

export const LEAVE_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING: 'PENDING', // waiting on the reporting manager
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  HR_REVIEW: 'HR_REVIEW', // manager approved, waiting on HR
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED', // terminal
  CANCELLED: 'CANCELLED', // withdrawn / cancelled after approval
  COMPLETED: 'COMPLETED', // the leave period has passed
});

export const LEAVE_STATUSES = Object.values(LEAVE_STATUS);

/** Anything still moving through the approval chain. */
export const PENDING_STATUSES = [
  LEAVE_STATUS.PENDING,
  LEAVE_STATUS.HR_REVIEW,
  LEAVE_STATUS.CHANGES_REQUESTED,
];

/** Approved, or approved-and-since-closed. */
export const APPROVED_STATUSES = [LEAVE_STATUS.APPROVED, LEAVE_STATUS.COMPLETED];

/**
 * Statuses that still hold a claim on the employee's calendar and on their
 * balance. Used for overlap detection — a rejected or cancelled application
 * frees the dates again.
 */
export const ACTIVE_HOLD_STATUSES = [
  LEAVE_STATUS.PENDING,
  LEAVE_STATUS.CHANGES_REQUESTED,
  LEAVE_STATUS.HR_REVIEW,
  LEAVE_STATUS.APPROVED,
  LEAVE_STATUS.COMPLETED,
];

export const LEAVE_STAGE = Object.freeze({
  EMPLOYEE: 'EMPLOYEE',
  MANAGER: 'MANAGER',
  HR: 'HR',
  DONE: 'DONE',
});

/** Half-day support: a request records the part of the first and last day. */
export const DAY_PART = Object.freeze({
  FULL: 'FULL',
  FIRST_HALF: 'FIRST_HALF',
  SECOND_HALF: 'SECOND_HALF',
});

export const DAY_PARTS = Object.values(DAY_PART);

/**
 * Legal status transitions — the workflow contract.
 *
 *   Employee → HOD → HR → Approved / Rejected
 *
 * `leaveApproval.service.js` refuses any move that is not listed here, which is
 * what stops a second approver from deciding an application twice (and, with
 * it, double-committing the balance).
 */
export const LEAVE_TRANSITIONS = Object.freeze({
  [LEAVE_STATUS.DRAFT]: [LEAVE_STATUS.PENDING, LEAVE_STATUS.CANCELLED],
  // Manager stage.
  [LEAVE_STATUS.PENDING]: [
    LEAVE_STATUS.HR_REVIEW,
    LEAVE_STATUS.REJECTED,
    LEAVE_STATUS.CHANGES_REQUESTED,
    LEAVE_STATUS.CANCELLED,
  ],
  [LEAVE_STATUS.CHANGES_REQUESTED]: [LEAVE_STATUS.PENDING, LEAVE_STATUS.CANCELLED],
  // HR stage. "Not OK" sends it back to the manager rather than killing it.
  [LEAVE_STATUS.HR_REVIEW]: [
    LEAVE_STATUS.APPROVED,
    LEAVE_STATUS.REJECTED,
    LEAVE_STATUS.PENDING,
    LEAVE_STATUS.CANCELLED,
  ],
  [LEAVE_STATUS.APPROVED]: [LEAVE_STATUS.COMPLETED, LEAVE_STATUS.CANCELLED],
  [LEAVE_STATUS.COMPLETED]: [],
  [LEAVE_STATUS.REJECTED]: [],
  [LEAVE_STATUS.CANCELLED]: [],
});

/* ─── Leave type catalogue ────────────────────────────────────────────────────
 * ASSUMPTION — no Business Blueprint was supplied, so these two value sets are
 * inferred from standard Indian enterprise HRMS practice. They are the ONLY
 * place either list is defined (the frontend mirrors this file), so correcting
 * them against the real document is a single edit here plus the mirror.
 * ────────────────────────────────────────────────────────────────────────────*/

/** The "Leave Type" field: does taking this leave cost the employee pay? */
export const LEAVE_NATURE = Object.freeze({
  PAID: 'PAID',
  UNPAID: 'UNPAID',
});

export const LEAVE_NATURES = Object.values(LEAVE_NATURE);

/** The "Leave Category" field: what kind of entitlement this is. */
export const LEAVE_CATEGORY = Object.freeze({
  REGULAR: 'REGULAR', // the everyday entitlements — casual, sick, earned
  SPECIAL: 'SPECIAL', // marriage, bereavement, compensatory off
  STATUTORY: 'STATUTORY', // legally mandated — maternity, paternity
  OTHER: 'OTHER',
});

export const LEAVE_CATEGORIES = Object.values(LEAVE_CATEGORY);

export default {
  LEAVE_STATUS,
  LEAVE_STATUSES,
  PENDING_STATUSES,
  APPROVED_STATUSES,
  ACTIVE_HOLD_STATUSES,
  LEAVE_TRANSITIONS,
  LEAVE_STAGE,
  DAY_PART,
  DAY_PARTS,
  LEAVE_NATURE,
  LEAVE_NATURES,
  LEAVE_CATEGORY,
  LEAVE_CATEGORIES,
};
