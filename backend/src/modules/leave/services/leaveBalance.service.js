import ApiError from '../../../utils/ApiError.js';
import logger from '../../../utils/logger.js';
import LeaveBalance from '../models/LeaveBalance.js';
import { LEAVE_NATURE } from '../constants/index.js';

/**
 * Every balance mutation goes through here. Nothing else may write `pending` or
 * `used` — a read-then-write anywhere else reintroduces the overdraw race this
 * module exists to prevent.
 *
 * Lifecycle:
 *   RESERVE  on submit   pending += days
 *   COMMIT   on approval pending -= days ; used += days
 *   RELEASE  on reject / withdraw / cancel   pending -= days
 *
 * Only RESERVE is wired today (the approval screens land later), but the whole
 * cycle lives here so the rules stay in one place.
 */

/** `entitled - used - pending`, expressed for the aggregation pipeline. */
const availableExpr = {
  $subtract: [
    { $add: ['$opening', '$accrued', '$carriedForward', '$adjusted'] },
    { $add: ['$used', '$pending'] },
  ],
};

export const derive = (row) => {
  const entitled =
    (row.opening ?? 0) + (row.accrued ?? 0) + (row.carriedForward ?? 0) + (row.adjusted ?? 0);
  const used = row.used ?? 0;
  const pending = row.pending ?? 0;
  return { entitled, used, pending, available: Math.max(0, entitled - used - pending) };
};

/** Read-only snapshot for the apply form. */
export const getBalance = async (employeeId, leaveTypeId, leaveYear) => {
  const row = await LeaveBalance.findOne({
    employee: employeeId,
    leaveType: leaveTypeId,
    leaveYear,
  }).lean();
  return row ? { _id: row._id, ...derive(row) } : null;
};

/**
 * Reserves `days` against a balance.
 *
 * The guard lives INSIDE the update filter, so mongo evaluates availability and
 * applies the increment in one atomic operation. Two applications submitted in
 * the same millisecond cannot both pass — the second one matches no document
 * and comes back null. A read-then-write would let both through.
 *
 * Unpaid types (LOP) carry no entitlement, so they are never reserved.
 */
export const reserve = async ({ employeeId, leaveType, leaveYear, days, employeeName }) => {
  if (leaveType.type === LEAVE_NATURE.UNPAID) return { skipped: true, reason: 'UNPAID' };
  if (days <= 0) return { skipped: true, reason: 'ZERO_DAYS' };

  const updated = await LeaveBalance.findOneAndUpdate(
    {
      employee: employeeId,
      leaveType: leaveType._id,
      leaveYear,
      $expr: { $gte: [availableExpr, days] },
    },
    { $inc: { pending: days } },
    { new: true }
  ).lean();

  if (updated) return { skipped: false, balance: derive(updated) };

  // Distinguish "no allocation at all" from "not enough left" — they need very
  // different actions from the person reading the message.
  const existing = await LeaveBalance.findOne({
    employee: employeeId,
    leaveType: leaveType._id,
    leaveYear,
  }).lean();

  const who = employeeName ? `${employeeName} has` : 'You have';

  if (!existing) {
    throw ApiError.unprocessable(
      `${who} no ${leaveType.name} allocated for ${leaveYear}. Ask HR to allocate it first.`,
      [{ field: 'leaveType', message: `No ${leaveType.code} balance for ${leaveYear}` }]
    );
  }

  const { available } = derive(existing);
  throw ApiError.unprocessable(
    `Insufficient balance: ${who} ${available} day(s) of ${leaveType.name} left but applied for ${days}.`,
    [
      {
        field: 'leaveType',
        message: `${available} day(s) available, ${days} requested`,
      },
    ]
  );
};

/** Undoes a reserve. Never throws — it runs on the failure path. */
export const release = async ({ employeeId, leaveTypeId, leaveYear, days }) => {
  if (days <= 0) return;
  try {
    await LeaveBalance.updateOne(
      { employee: employeeId, leaveType: leaveTypeId, leaveYear },
      { $inc: { pending: -days } }
    );
  } catch (error) {
    logger.error(`Failed to release ${days} reserved day(s): ${error.message}`);
  }
};

/**
 * Gives back days that were already COMMITTED — the deletion path for an
 * application that had been approved. `release()` cannot serve here: that
 * decrements `pending`, and an approved request no longer holds any.
 *
 * Clamped at zero so a double-delete can never drive `used` negative.
 */
export const refund = async ({ employeeId, leaveTypeId, leaveYear, days }) => {
  if (days <= 0) return null;
  try {
    return await LeaveBalance.findOneAndUpdate(
      { employee: employeeId, leaveType: leaveTypeId, leaveYear, used: { $gte: days } },
      { $inc: { used: -days } },
      { new: true }
    ).lean();
  } catch (error) {
    logger.error(`Failed to refund ${days} used day(s): ${error.message}`);
    return null;
  }
};

/** Moves reserved days into `used`. Called when an application is approved. */
export const commit = async ({ employeeId, leaveTypeId, leaveYear, days }) => {
  if (days <= 0) return null;
  return LeaveBalance.findOneAndUpdate(
    { employee: employeeId, leaveType: leaveTypeId, leaveYear },
    { $inc: { pending: -days, used: days } },
    { new: true }
  ).lean();
};

export default { getBalance, reserve, release, refund, commit, derive };
