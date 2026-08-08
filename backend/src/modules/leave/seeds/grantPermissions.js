/**
 * Grants the leave-type permissions to the system roles that should hold them.
 *
 * Run explicitly — never on boot:
 *   npm run migrate:leave-permissions            (dry run, prints the diff)
 *   npm run migrate:leave-permissions -- --commit
 *   npm run migrate:leave-permissions -- --revoke --commit
 *
 * ADDITIVE ONLY. It never removes a permission a role already holds, so no gate
 * pass permission can be touched. `--revoke` pulls back exactly the leave keys
 * this script grants and nothing else.
 *
 * Super Admin is skipped on purpose: `rbac.middleware.js` short-circuits every
 * check for it, so the module already works there without any grant.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import connectDatabase from '../../../config/database.js';
import logger from '../../../utils/logger.js';
import Role from '../../../models/Role.js';
import { clearAuthCache } from '../../../utils/authCache.js';
import { PERMISSION, ROLE } from '../../../constants/index.js';

const LEAVE_TYPE_PERMISSIONS = [
  PERMISSION.LEAVE_TYPE_VIEW,
  PERMISSION.LEAVE_TYPE_CREATE,
  PERMISSION.LEAVE_TYPE_UPDATE,
  PERMISSION.LEAVE_TYPE_DELETE,
];

const LEAVE_ALLOCATION_PERMISSIONS = [
  PERMISSION.LEAVE_ALLOCATION_VIEW,
  PERMISSION.LEAVE_ALLOCATION_CREATE,
  PERMISSION.LEAVE_ALLOCATION_UPDATE,
  PERMISSION.LEAVE_ALLOCATION_DELETE,
];

/**
 * Who gets what.
 *   HOD      — reads the catalogue and sees their reportees' allocations.
 *   Employee — reads the catalogue and sees their own allocation only.
 * Row-level visibility is enforced by `buildUserScope`, so the same VIEW
 * permission shows each role a different slice of the register.
 */
/** Self-service: everyone who works here may apply for their own leave. */
const SELF_SERVICE = [PERMISSION.LEAVE_APPLY, PERMISSION.LEAVE_VIEW_OWN];

/** Reporting. Row-level scope still narrows what each role actually sees. */
const REPORTING = [PERMISSION.LEAVE_REPORTS_VIEW, PERMISSION.LEAVE_REPORTS_EXPORT];

const GRANTS = {
  [ROLE.ADMIN]: [
    ...LEAVE_TYPE_PERMISSIONS,
    ...LEAVE_ALLOCATION_PERMISSIONS,
    ...SELF_SERVICE,
    PERMISSION.LEAVE_APPLY_BULK,
    // Admin oversees both stages of the workflow.
    PERMISSION.LEAVE_APPROVE,
    PERMISSION.LEAVE_HR_REVIEW,
    // System Admin — deletion.
    PERMISSION.LEAVE_DELETE,
    ...REPORTING,
  ],
  [ROLE.HR]: [
    ...LEAVE_TYPE_PERMISSIONS,
    ...LEAVE_ALLOCATION_PERMISSIONS,
    ...SELF_SERVICE,
    PERMISSION.LEAVE_APPLY_BULK,
    // HR owns stage 2 only — the manager stage is the HOD's.
    PERMISSION.LEAVE_HR_REVIEW,
    // HR Admin — deletion. Deliberately NOT granted to HOD or Employee.
    PERMISSION.LEAVE_DELETE,
    ...REPORTING,
  ],
  [ROLE.HOD]: [
    PERMISSION.LEAVE_TYPE_VIEW,
    PERMISSION.LEAVE_ALLOCATION_VIEW,
    ...SELF_SERVICE,
    // HOD owns stage 1.
    PERMISSION.LEAVE_APPROVE,
    // Reports too — `buildLeaveScope` limits them to their own reportees.
    ...REPORTING,
  ],
  [ROLE.EMPLOYEE]: [PERMISSION.LEAVE_TYPE_VIEW, PERMISSION.LEAVE_ALLOCATION_VIEW, ...SELF_SERVICE],
};

const run = async () => {
  const commit = process.argv.includes('--commit');
  const revoke = process.argv.includes('--revoke');

  await connectDatabase();

  console.log(`\n\x1b[1mLeave type permissions — ${revoke ? 'REVOKE' : 'GRANT'}\x1b[0m`);
  console.log(`  mode: ${commit ? '\x1b[31mCOMMIT\x1b[0m' : '\x1b[33mDRY RUN\x1b[0m (pass --commit to apply)'}\n`);

  let changed = 0;

  for (const [roleKey, permissions] of Object.entries(GRANTS)) {
    const role = await Role.findOne({ key: roleKey });
    if (!role) {
      console.log(`  \x1b[33m!\x1b[0m ${roleKey.padEnd(12)} not found — skipped`);
      continue;
    }

    const held = new Set(role.permissions);
    const delta = revoke
      ? permissions.filter((p) => held.has(p))
      : permissions.filter((p) => !held.has(p));

    if (!delta.length) {
      console.log(`  \x1b[90m·\x1b[0m ${roleKey.padEnd(12)} already correct`);
      continue;
    }

    console.log(`  \x1b[32m✓\x1b[0m ${roleKey.padEnd(12)} ${revoke ? '−' : '+'} ${delta.join(', ')}`);
    changed += delta.length;

    if (commit) {
      // $addToSet / $pull touch ONLY the leave keys — every other permission on
      // the role document is left exactly as it was.
      await Role.updateOne(
        { _id: role._id },
        revoke
          ? { $pull: { permissions: { $in: delta } } }
          : { $addToSet: { permissions: { $each: delta } } }
      );
    }
  }

  if (commit && changed) {
    // Authorisation is cached for ~15s per user; without this the grant would
    // appear not to work until the TTL expired.
    clearAuthCache();
    console.log('\n  auth cache cleared');
  }

  console.log(
    changed
      ? `\n\x1b[32m${commit ? 'Applied' : 'Would apply'} ${changed} permission change(s)\x1b[0m\n`
      : '\n\x1b[32mNothing to do — every role is already correct\x1b[0m\n'
  );

  await mongoose.disconnect();
};

run().catch((error) => {
  logger.error(`Leave permission migration failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
