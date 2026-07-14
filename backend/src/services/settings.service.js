import Settings from '../models/Settings.js';
import Holiday from '../models/Holiday.js';
import GatePass from '../models/GatePass.js';
import ApiError from '../utils/ApiError.js';
import { GATEPASS_TYPE, QUOTA_STATUSES, ACTIVE_STATUSES } from '../constants/index.js';
import { periodRange, timeToMinutes, minutesOfDay, dayjs } from '../utils/dates.js';

/** In-process cache — settings are read on nearly every write path. */
let cache = null;
let cachedAt = 0;
const TTL_MS = 60_000;

export const getSettings = async ({ fresh = false } = {}) => {
  if (!fresh && cache && Date.now() - cachedAt < TTL_MS) return cache;
  cache = await Settings.getSingleton();
  cachedAt = Date.now();
  return cache;
};

export const invalidateSettingsCache = () => {
  cache = null;
  cachedAt = 0;
};

/**
 * Resolves the effective quota for a user, most-specific-wins:
 *   role override → department override → unit override → global default
 */
export const resolveLimits = async (user, type) => {
  const settings = await getSettings();
  const bucket = type === GATEPASS_TYPE.PERSONAL ? 'personal' : 'official';

  const roleId = (user.role?._id ?? user.role)?.toString();
  const deptId = (user.department?._id ?? user.department)?.toString();
  const unitId = (user.unit?._id ?? user.unit)?.toString();

  const pick = (list, key, id) =>
    list?.find((row) => (row[key]?._id ?? row[key])?.toString() === id)?.limits?.[bucket];

  return (
    pick(settings.roleLimits, 'role', roleId) ??
    pick(settings.departmentLimits, 'department', deptId) ??
    pick(settings.unitLimits, 'unit', unitId) ??
    settings.limits[bucket]
  );
};

/**
 * Full pre-flight check for a new gate pass. Throws an ApiError with a helpful
 * message on the first rule that fails; returns the quota snapshot otherwise.
 */
export const assertCanCreateGatePass = async (user, { type, expectedOutTime, expectedInTime }) => {
  const settings = await getSettings();
  const out = dayjs(expectedOutTime);
  const back = dayjs(expectedInTime);

  if (!back.isAfter(out)) {
    throw ApiError.badRequest('Expected in-time must be after the expected out-time');
  }

  // ── Working hours ────────────────────────────────────────────────────────
  const { workingHours } = settings;
  if (workingHours.enforceGateHours) {
    const open = timeToMinutes(workingHours.gateOpenTime);
    const close = timeToMinutes(workingHours.gateCloseTime);
    const outMinutes = minutesOfDay(out.toDate());
    if (open !== null && close !== null && (outMinutes < open || outMinutes > close)) {
      throw ApiError.badRequest(
        `Gate passes may only be raised between ${workingHours.gateOpenTime} and ${workingHours.gateCloseTime}`
      );
    }
  }

  if (workingHours.restrictWeekend && workingHours.weekendDays.includes(out.day())) {
    throw ApiError.badRequest('Gate passes cannot be raised for a weekend');
  }

  if (workingHours.restrictHolidays) {
    const unitId = user.unit?._id ?? user.unit;
    const holiday = await Holiday.findOne({
      isActive: true,
      restrictGatePass: true,
      date: { $gte: out.startOf('day').toDate(), $lte: out.endOf('day').toDate() },
      $or: [{ units: { $size: 0 } }, { units: unitId }],
    }).lean();
    if (holiday) {
      throw ApiError.badRequest(`${holiday.name} is a holiday — gate passes are restricted`);
    }
  }

  // ── Concurrency ──────────────────────────────────────────────────────────
  const activeCount = await GatePass.countDocuments({
    employee: user._id,
    status: { $in: ACTIVE_STATUSES },
    isDeleted: false,
  });

  if (activeCount >= settings.maxActiveGatePasses) {
    throw ApiError.badRequest(
      `You already have ${activeCount} active gate pass(es). The limit is ${settings.maxActiveGatePasses}.`
    );
  }

  if (!settings.allowMultiplePending) {
    const pending = await GatePass.countDocuments({
      employee: user._id,
      status: { $in: ['PENDING', 'CHANGES_REQUESTED', 'HR_REVIEW'] },
      isDeleted: false,
    });
    if (pending > 0) {
      throw ApiError.badRequest(
        'You already have a gate pass awaiting approval. Wait for it to be decided before raising another.'
      );
    }
  }

  // ── Quotas ───────────────────────────────────────────────────────────────
  const limits = await resolveLimits(user, type);
  const usage = {};

  for (const period of ['daily', 'weekly', 'monthly', 'yearly']) {
    const limit = limits[period];
    if (!limit && limit !== 0) continue;

    const { from, to } = periodRange(period, expectedOutTime);
    const used = await GatePass.countDocuments({
      employee: user._id,
      type,
      status: { $in: QUOTA_STATUSES },
      isDeleted: false,
      expectedOutTime: { $gte: from, $lte: to },
    });

    usage[period] = { used, limit };

    if (used >= limit) {
      const label = type === GATEPASS_TYPE.PERSONAL ? 'personal' : 'official';
      throw ApiError.badRequest(
        `You have reached your ${period} limit of ${limit} ${label} gate pass(es).`
      );
    }
  }

  return { limits, usage, settings };
};

/** Read-only quota snapshot for the "you have N of M left" widget on the form. */
export const getQuotaSnapshot = async (user) => {
  const snapshot = {};
  for (const type of [GATEPASS_TYPE.OFFICIAL, GATEPASS_TYPE.PERSONAL]) {
    const limits = await resolveLimits(user, type);
    const periods = {};
    for (const period of ['daily', 'weekly', 'monthly', 'yearly']) {
      const { from, to } = periodRange(period);
      const used = await GatePass.countDocuments({
        employee: user._id,
        type,
        status: { $in: QUOTA_STATUSES },
        isDeleted: false,
        expectedOutTime: { $gte: from, $lte: to },
      });
      periods[period] = { used, limit: limits[period], remaining: Math.max(0, limits[period] - used) };
    }
    snapshot[type] = periods;
  }
  return snapshot;
};

export default {
  getSettings,
  invalidateSettingsCache,
  resolveLimits,
  assertCanCreateGatePass,
  getQuotaSnapshot,
};
