import AuditLog from '../models/AuditLog.js';
import logger from '../utils/logger.js';

/**
 * Fire-and-forget audit writer. Auditing must never break the request it is
 * recording, so failures are logged and swallowed.
 */
export const recordAudit = async ({
  action,
  actor = null,
  entity = '',
  entityId = null,
  entityLabel = '',
  description = '',
  changes = null,
  status = 'SUCCESS',
  req = null,
  unit = null,
}) => {
  try {
    await AuditLog.create({
      action,
      actor: actor?._id ?? actor ?? null,
      actorName: actor?.name ?? 'System',
      actorRole: actor?.role?.key ?? '',
      entity,
      entityId,
      entityLabel,
      description,
      changes,
      status,
      unit: unit ?? actor?.unit?._id ?? actor?.unit ?? null,
      ip: req ? req.ip || req.headers?.['x-forwarded-for'] || '' : '',
      userAgent: req?.headers?.['user-agent'] ?? '',
      method: req?.method ?? '',
      path: req?.originalUrl ?? '',
    });
  } catch (error) {
    logger.error(`Failed to write audit log for ${action}: ${error.message}`);
  }
};

/**
 * Shallow field-level diff, used to store a readable `changes` blob on updates.
 * Only the keys present in `after` are compared.
 */
export const diff = (before, after) => {
  const changes = {};
  for (const key of Object.keys(after)) {
    const from = before?.[key];
    const to = after[key];
    const same = JSON.stringify(from ?? null) === JSON.stringify(to ?? null);
    if (!same) changes[key] = { from: from ?? null, to: to ?? null };
  }
  return Object.keys(changes).length ? changes : null;
};

export default { recordAudit, diff };
