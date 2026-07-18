import Settings from '../models/Settings.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import { invalidateSettingsCache, getSettings as getCachedSettings } from '../services/settings.service.js';
import { recordAudit, diff } from '../services/audit.service.js';
import { AUDIT_ACTION } from '../constants/index.js';

const POPULATE = [
  { path: 'unitLimits.unit', select: 'name code' },
  { path: 'departmentLimits.department', select: 'name code unit' },
  { path: 'roleLimits.role', select: 'name key color' },
];

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

/**
 * Recursive merge — objects are merged key by key, arrays and scalars replace.
 * This is what lets the SPA PATCH a single toggle without echoing the whole
 * settings document back at us.
 */
const deepMerge = (base, patch) => {
  const output = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    output[key] = isPlainObject(value) ? deepMerge(output[key], value) : value;
  }
  return output;
};

const pick = (source, keys) =>
  Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));

/** GET /settings */
export const getSettings = asyncHandler(async (_req, res) => {
  const settings = await Settings.getSingleton();
  await settings.populate(POPULATE);

  return sendSuccess(res, { message: 'Settings fetched', data: settings });
});

/** PATCH /settings */
export const updateSettings = asyncHandler(async (req, res) => {
  const patch = req.body;
  const settings = await Settings.getSingleton();

  const before = settings.toObject();
  const touched = Object.keys(patch);

  for (const key of touched) {
    const current = before[key];
    settings.set(key, isPlainObject(patch[key]) ? deepMerge(current, patch[key]) : patch[key]);
  }
  settings.updatedBy = req.user._id;

  try {
    await settings.save();
  } catch (error) {
    if (error.name === 'ValidationError') {
      throw ApiError.unprocessable(
        'The settings are not valid',
        Object.values(error.errors).map((e) => ({ field: e.path, message: e.message }))
      );
    }
    throw error;
  }

  invalidateSettingsCache();

  const after = settings.toObject();
  const changes = diff(pick(before, touched), pick(after, touched));

  await recordAudit({
    action: AUDIT_ACTION.SETTINGS_UPDATE,
    actor: req.user,
    entity: 'Settings',
    entityId: settings._id,
    entityLabel: 'System settings',
    description: `Updated system settings: ${touched.join(', ')}`,
    changes,
    req,
  });

  await settings.populate(POPULATE);

  return sendSuccess(res, { message: 'Settings updated', data: settings });
});

/**
 * GET /settings/public — the slice every authenticated screen needs (branding,
 * workflow toggles, working hours). No permission gate: an employee must be able
 * to render the shell.
 */
export const getPublicSettings = asyncHandler(async (_req, res) => {
  // Served from the shared 60s settings cache — this endpoint is hit on every
  // page load by every user, and the data changes at most a few times a day.
  const settings = await getCachedSettings();

  return sendSuccess(res, {
    message: 'Public settings fetched',
    data: {
      company: {
        name: settings.company?.name ?? 'GatePass Pro',
        logo: settings.company?.logo ?? '',
      },
      branding: settings.branding,
      workflow: {
        approvalRequired: settings.workflow?.approvalRequired,
        hrReviewRequired: settings.workflow?.hrReviewRequired,
        securityApprovalRequired: settings.workflow?.securityApprovalRequired,
        attachmentMandatory: settings.workflow?.attachmentMandatory,
        reasonMandatory: settings.workflow?.reasonMandatory,
        purposeMandatory: settings.workflow?.purposeMandatory,
        hrReviewForPersonalOnly: settings.workflow?.hrReviewForPersonalOnly,
        expiryHours: settings.workflow?.expiryHours,
      },
      workingHours: settings.workingHours,
      security: { qrEnabled: settings.security?.qrEnabled },
    },
  });
});

export default { getSettings, updateSettings, getPublicSettings };
