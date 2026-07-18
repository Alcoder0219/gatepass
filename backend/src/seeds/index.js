/* eslint-disable no-console */
/**
 * GatePass Pro seeder.
 *
 *   npm run seed         → idempotent upsert by natural key
 *   npm run seed:fresh   → drops the collections first, then seeds
 *
 * Everything is upserted by a natural key (unit code, department code + unit,
 * role key, user email, holiday name + date), so running it twice is safe. The
 * demo gate passes are only generated when the collection is empty — they carry
 * generated numbers and cannot be meaningfully upserted.
 */
import mongoose from 'mongoose';

import env from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import {
  User,
  Role,
  Unit,
  Department,
  GatePass,
  HRReview,
  SecurityLog,
  Notification,
  AuditLog,
  Settings,
  Holiday,
  Counter,
} from '../models/index.js';
import { generateGatePassNumber } from '../helpers/gatePassNumber.js';
import { dayjs } from '../utils/dates.js';
import {
  GATEPASS_STATUS,
  GATEPASS_TYPE,
  WORKFLOW_STAGE,
  ROLE,
  NOTIFICATION_TYPE,
} from '../constants/index.js';
import {
  UNITS,
  DEPARTMENTS,
  ROLES,
  USERS,
  HOLIDAYS,
  OFFICIAL_REASONS,
  PERSONAL_REASONS,
  GATEPASS_MIX,
  SETTINGS,
} from './data.js';

const FRESH = process.argv.includes('--fresh');

/* ─── Tiny deterministic RNG so re-seeding produces the same demo shape ───── */
let seedState = 20260713;
const random = () => {
  seedState = (seedState * 1_664_525 + 1_013_904_223) % 4_294_967_296;
  return seedState / 4_294_967_296;
};
const pick = (list) => list[Math.floor(random() * list.length)];
const between = (min, max) => Math.floor(random() * (max - min + 1)) + min;

const log = {
  step: (message) => console.log(`\n\x1b[36m▸ ${message}\x1b[0m`),
  done: (message) => console.log(`  \x1b[32m✓\x1b[0m ${message}`),
  warn: (message) => console.log(`  \x1b[33m!\x1b[0m ${message}`),
};

/* ─── --fresh ─────────────────────────────────────────────────────────────── */
const wipe = async () => {
  log.step('Dropping collections (--fresh)');
  const models = [
    GatePass,
    HRReview,
    SecurityLog,
    Notification,
    AuditLog,
    Holiday,
    Settings,
    User,
    Department,
    Role,
    Unit,
    Counter,
  ];

  for (const model of models) {
    try {
      await model.collection.drop();
      log.done(`dropped ${model.collection.collectionName}`);
    } catch (error) {
      // 26 = NamespaceNotFound — nothing to drop, which is fine.
      if (error.code !== 26) throw error;
    }
  }

  // Dropping a collection drops its indexes with it — rebuild them before we
  // insert, or the unique constraints (email, unit code, pass number) are gone.
  await Promise.all(models.map((model) => model.syncIndexes()));
  log.done('indexes rebuilt');
};

/* ─── Units ───────────────────────────────────────────────────────────────── */
const seedUnits = async () => {
  log.step('Units');
  const units = new Map();

  for (const unit of UNITS) {
    const doc = await Unit.findOneAndUpdate(
      { code: unit.code },
      { $set: { ...unit, isActive: true } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    units.set(unit.code, doc);
  }

  log.done(`${units.size} units: ${[...units.keys()].join(', ')}`);
  return units;
};

/* ─── Departments ─────────────────────────────────────────────────────────── */
const seedDepartments = async (units) => {
  log.step('Departments');
  const departments = new Map(); // `${unitCode}:${deptCode}` → doc

  for (const unit of units.values()) {
    for (const dept of DEPARTMENTS) {
      const doc = await Department.findOneAndUpdate(
        { code: dept.code, unit: unit._id },
        { $set: { ...dept, unit: unit._id, isActive: true } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      departments.set(`${unit.code}:${dept.code}`, doc);
    }
  }

  log.done(`${departments.size} departments (${DEPARTMENTS.length} per unit × ${units.size} units)`);
  return departments;
};

/* ─── Roles ───────────────────────────────────────────────────────────────── */
const seedRoles = async () => {
  log.step('Roles');
  const roles = new Map();

  for (const role of ROLES) {
    const doc = await Role.findOneAndUpdate(
      { key: role.key },
      { $set: { ...role, isSystem: true, isActive: true } },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    );
    roles.set(role.key, doc);
    log.done(`${role.key.padEnd(12)} ${String(role.permissions.length).padStart(2)} permissions · scope ${role.dataScope} · level ${role.level}`);
  }

  return roles;
};

/* ─── Users ───────────────────────────────────────────────────────────────── */
const seedUsers = async (units, departments, roles) => {
  log.step('Users');
  const users = new Map(); // email → doc

  // Pass 1 — create/refresh everyone without the manager wiring.
  for (const spec of USERS) {
    const unit = units.get(spec.unit);
    const department = departments.get(`${spec.unit}:${spec.department}`);
    const role = roles.get(spec.role);

    if (!unit || !department || !role) {
      throw new Error(`Bad seed user ${spec.email}: unknown unit/department/role`);
    }

    let user = await User.findOne({ email: spec.email }).select('+password');

    if (user) {
      user.set({
        employeeId: spec.employeeId,
        name: spec.name,
        phone: spec.phone ?? '',
        designation: spec.designation ?? '',
        unit: unit._id,
        department: department._id,
        role: role._id,
        status: 'ACTIVE',
      });
      await user.save(); // password untouched — the pre-save hook is a no-op.
    } else {
      user = await User.create({
        employeeId: spec.employeeId,
        name: spec.name,
        email: spec.email,
        phone: spec.phone ?? '',
        designation: spec.designation ?? '',
        password: env.seed.defaultPassword, // hashed by the model's pre-save hook
        unit: unit._id,
        department: department._id,
        role: role._id,
        status: 'ACTIVE',
      });
    }

    users.set(spec.email, user);
  }

  // Pass 2 — wire the reporting lines now that every user exists.
  for (const spec of USERS) {
    if (!spec.manager) continue;
    const user = users.get(spec.email);
    const manager = users.get(spec.manager);
    if (!manager) throw new Error(`Unknown manager ${spec.manager} for ${spec.email}`);

    user.reportingManager = manager._id;
    await user.save();
  }

  // Point each department's `hod` at the HOD who owns it, and each unit's head.
  for (const spec of USERS.filter((u) => u.role === ROLE.HOD)) {
    const hod = users.get(spec.email);
    await Department.updateOne(
      { _id: hod.department },
      { $set: { hod: hod._id } }
    );
    await Unit.updateOne({ _id: hod.unit }, { $set: { headOfUnit: hod._id } });
  }

  log.done(`${users.size} users (password: ${env.seed.defaultPassword})`);
  return users;
};

/* ─── Settings ────────────────────────────────────────────────────────────── */
const seedSettings = async (admin) => {
  log.step('Settings');
  const settings = await Settings.getSingleton();
  settings.set({ ...SETTINGS, updatedBy: admin?._id ?? null });
  await settings.save();
  log.done('singleton written with the default workflow, limits and branding');
  return settings;
};

/* ─── Holidays ────────────────────────────────────────────────────────────── */
const seedHolidays = async (admin) => {
  log.step('Holidays');
  const year = dayjs().year();
  const holidays = HOLIDAYS(year);

  for (const holiday of holidays) {
    const date = dayjs(holiday.date).startOf('day').toDate();
    await Holiday.findOneAndUpdate(
      { name: holiday.name, date },
      {
        $set: {
          name: holiday.name,
          date,
          type: holiday.type,
          restrictGatePass: holiday.restrictGatePass,
          units: [], // empty = every unit
          isActive: true,
          createdBy: admin?._id ?? null,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  log.done(`${holidays.length} holidays for ${year}`);
};

/* ─── Demo gate passes ────────────────────────────────────────────────────── */

const STAGE_BY_STATUS = {
  [GATEPASS_STATUS.PENDING]: WORKFLOW_STAGE.MANAGER,
  [GATEPASS_STATUS.CHANGES_REQUESTED]: WORKFLOW_STAGE.EMPLOYEE,
  [GATEPASS_STATUS.HR_REVIEW]: WORKFLOW_STAGE.HR,
  [GATEPASS_STATUS.APPROVED]: WORKFLOW_STAGE.SECURITY,
  [GATEPASS_STATUS.OUT]: WORKFLOW_STAGE.SECURITY,
  [GATEPASS_STATUS.COMPLETED]: WORKFLOW_STAGE.DONE,
  [GATEPASS_STATUS.REJECTED]: WORKFLOW_STAGE.DONE,
  [GATEPASS_STATUS.CANCELLED]: WORKFLOW_STAGE.DONE,
};

/** Statuses whose pass has cleared HR and therefore carries a QR. */
const QR_STATUSES = [GATEPASS_STATUS.APPROVED, GATEPASS_STATUS.OUT, GATEPASS_STATUS.COMPLETED];

const seedGatePasses = async (units, departments, users) => {
  log.step('Demo gate passes');

  const existing = await GatePass.countDocuments();
  if (existing > 0 && !FRESH) {
    log.warn(`${existing} gate passes already exist — skipping the demo data (run with --fresh to rebuild)`);
    return;
  }

  const hr = users.get('hr@gatepasspro.io');
  const security = users.get('security@gatepasspro.io');
  const employees = USERS.filter((u) => u.role === ROLE.EMPLOYEE);

  const unitById = new Map([...units.values()].map((u) => [String(u._id), u]));
  const deptById = new Map([...departments.values()].map((d) => [String(d._id), d]));

  const passes = [];
  const hrReviews = [];
  const securityLogs = [];
  const notifications = [];

  for (const bucket of GATEPASS_MIX) {
    for (let i = 0; i < bucket.count; i += 1) {
      const spec = pick(employees);
      const employee = users.get(spec.email);
      const manager = users.get(spec.manager);
      const unit = unitById.get(String(employee.unit));
      const department = deptById.get(String(employee.department));

      const type = random() > 0.45 ? GATEPASS_TYPE.OFFICIAL : GATEPASS_TYPE.PERSONAL;
      const { reason, purpose } =
        type === GATEPASS_TYPE.OFFICIAL ? pick(OFFICIAL_REASONS) : pick(PERSONAL_REASONS);

      // Backdate: fresh statuses stay near "now", terminal ones spread over 60 days.
      const daysAgo = between(0, bucket.recentDays);
      const createdAt = dayjs()
        .subtract(daysAgo, 'day')
        .startOf('day')
        .add(between(8, 11), 'hour')
        .add(between(0, 59), 'minute')
        .toDate();

      const expectedOutTime = dayjs(createdAt).add(between(2, 6), 'hour').toDate();
      const expectedInTime = dayjs(expectedOutTime).add(between(1, 5), 'hour').toDate();

      const gatePassNumber = await generateGatePassNumber(unit.code);
      const _id = new mongoose.Types.ObjectId();

      const timeline = [
        {
          action: 'CREATED',
          toStatus: GATEPASS_STATUS.PENDING,
          actor: employee._id,
          actorName: employee.name,
          actorRole: ROLE.EMPLOYEE,
          comment: 'Gate pass raised',
          at: createdAt,
        },
      ];

      const pass = {
        _id,
        gatePassNumber,
        employee: employee._id,
        employeeCode: employee.employeeId,
        employeeName: employee.name,
        department: department._id,
        departmentName: department.name,
        unit: unit._id,
        unitName: unit.name,
        designation: employee.designation,
        type,
        reason,
        purpose,
        expectedOutTime,
        expectedInTime,
        reportingManager: manager._id,
        reportingManagerName: manager.name,
        status: bucket.status,
        stage: STAGE_BY_STATUS[bucket.status],
        approval: {},
        hrReview: {},
        security: {},
        timeline,
        createdBy: employee._id,
        isDeleted: false,
        createdAt,
        updatedAt: createdAt,
      };

      const approvedAt = dayjs(createdAt).add(between(20, 180), 'minute').toDate();
      const hrReviewedAt = dayjs(approvedAt).add(between(15, 120), 'minute').toDate();

      /* ── Manager decision ── */
      if (bucket.status === GATEPASS_STATUS.CHANGES_REQUESTED) {
        timeline.push({
          action: 'CHANGES_REQUESTED',
          fromStatus: GATEPASS_STATUS.PENDING,
          toStatus: GATEPASS_STATUS.CHANGES_REQUESTED,
          actor: manager._id,
          actorName: manager.name,
          actorRole: ROLE.HOD,
          comment: 'Please attach the visit approval mail and resubmit.',
          at: approvedAt,
        });
        pass.approval.comment = 'Please attach the visit approval mail and resubmit.';
        pass.updatedAt = approvedAt;
      }

      if (bucket.status === GATEPASS_STATUS.REJECTED) {
        timeline.push({
          action: 'REJECTED',
          fromStatus: GATEPASS_STATUS.PENDING,
          toStatus: GATEPASS_STATUS.REJECTED,
          actor: manager._id,
          actorName: manager.name,
          actorRole: ROLE.HOD,
          comment: 'Line coverage is not available for this slot.',
          at: approvedAt,
        });
        pass.approval = {
          rejectedBy: manager._id,
          rejectedAt: approvedAt,
          comment: 'Line coverage is not available for this slot.',
        };
        pass.updatedAt = approvedAt;
      }

      if (bucket.status === GATEPASS_STATUS.CANCELLED) {
        timeline.push({
          action: 'CANCELLED',
          fromStatus: GATEPASS_STATUS.PENDING,
          toStatus: GATEPASS_STATUS.CANCELLED,
          actor: employee._id,
          actorName: employee.name,
          actorRole: ROLE.EMPLOYEE,
          comment: 'No longer required.',
          at: approvedAt,
        });
        pass.updatedAt = approvedAt;
      }

      const managerApproved = [
        GATEPASS_STATUS.HR_REVIEW,
        ...QR_STATUSES,
      ].includes(bucket.status);

      if (managerApproved) {
        pass.approval = {
          approvedBy: manager._id,
          approvedAt,
          comment: 'Approved — coordinate the handover before leaving.',
        };
        timeline.push({
          action: 'APPROVED',
          fromStatus: GATEPASS_STATUS.PENDING,
          toStatus: GATEPASS_STATUS.HR_REVIEW,
          actor: manager._id,
          actorName: manager.name,
          actorRole: ROLE.HOD,
          comment: 'Approved — coordinate the handover before leaving.',
          at: approvedAt,
        });
        pass.updatedAt = approvedAt;
      }

      /* ── HR review ── */
      if (bucket.status === GATEPASS_STATUS.HR_REVIEW) {
        pass.hrReview = { status: 'PENDING', comment: '' };
      }

      if (QR_STATUSES.includes(bucket.status)) {
        pass.hrReview = {
          reviewedBy: hr._id,
          reviewedAt: hrReviewedAt,
          status: 'OK',
          comment: 'Attendance and leave balance verified.',
        };
        timeline.push({
          action: 'HR_REVIEW_OK',
          fromStatus: GATEPASS_STATUS.HR_REVIEW,
          toStatus: GATEPASS_STATUS.APPROVED,
          actor: hr._id,
          actorName: hr.name,
          actorRole: ROLE.HR,
          comment: 'Attendance and leave balance verified.',
          at: hrReviewedAt,
        });

        hrReviews.push({
          gatePass: _id,
          gatePassNumber,
          employee: employee._id,
          reviewer: hr._id,
          reviewerName: hr.name,
          status: 'OK',
          comment: 'Attendance and leave balance verified.',
          unit: unit._id,
          department: department._id,
          reviewedAt: hrReviewedAt,
          createdAt: hrReviewedAt,
          updatedAt: hrReviewedAt,
        });

        pass.expiresAt = dayjs(expectedInTime).add(24, 'hour').toDate();
        pass.updatedAt = hrReviewedAt;
      }

      /* ── Security movement ── */
      const wentOut = [GATEPASS_STATUS.OUT, GATEPASS_STATUS.COMPLETED].includes(bucket.status);

      if (wentOut) {
        const actualOutTime = dayjs(expectedOutTime).add(between(-10, 25), 'minute').toDate();
        pass.security.exitBy = security._id;
        pass.security.actualOutTime = actualOutTime;
        pass.security.exitRemark = 'ID card verified at the main gate.';

        timeline.push({
          action: 'SECURITY_EXIT',
          fromStatus: GATEPASS_STATUS.APPROVED,
          toStatus: GATEPASS_STATUS.OUT,
          actor: security._id,
          actorName: security.name,
          actorRole: ROLE.SECURITY,
          comment: 'Exit recorded at the main gate.',
          at: actualOutTime,
        });

        securityLogs.push({
          gatePass: _id,
          gatePassNumber,
          employee: employee._id,
          employeeName: employee.name,
          employeeCode: employee.employeeId,
          type: 'EXIT',
          recordedBy: security._id,
          recordedByName: security.name,
          recordedAt: actualOutTime,
          remark: 'ID card verified at the main gate.',
          verificationMethod: 'MANUAL',
          unit: unit._id,
          gate: 'MAIN',
          createdAt: actualOutTime,
          updatedAt: actualOutTime,
        });
        pass.updatedAt = actualOutTime;

        if (bucket.status === GATEPASS_STATUS.COMPLETED) {
          // ~1 in 4 returns late, which gives the late-return insight something to bite on.
          const late = random() < 0.25;
          const drift = late ? between(15, 90) : between(-30, 5);
          const actualInTime = dayjs(expectedInTime).add(drift, 'minute').toDate();
          const lateByMinutes = Math.max(
            0,
            dayjs(actualInTime).diff(dayjs(expectedInTime), 'minute')
          );

          pass.security.entryBy = security._id;
          pass.security.actualInTime = actualInTime;
          pass.security.entryRemark = late ? 'Returned late — reason noted at the gate.' : 'Returned on time.';
          pass.isLate = lateByMinutes > 0;
          pass.lateByMinutes = lateByMinutes;

          timeline.push({
            action: 'SECURITY_ENTRY',
            fromStatus: GATEPASS_STATUS.OUT,
            toStatus: GATEPASS_STATUS.COMPLETED,
            actor: security._id,
            actorName: security.name,
            actorRole: ROLE.SECURITY,
            comment: pass.security.entryRemark,
            at: actualInTime,
          });

          securityLogs.push({
            gatePass: _id,
            gatePassNumber,
            employee: employee._id,
            employeeName: employee.name,
            employeeCode: employee.employeeId,
            type: 'ENTRY',
            recordedBy: security._id,
            recordedByName: security.name,
            recordedAt: actualInTime,
            remark: pass.security.entryRemark,
            verificationMethod: 'MANUAL',
            unit: unit._id,
            gate: 'MAIN',
            isLate: pass.isLate,
            lateByMinutes,
            createdAt: actualInTime,
            updatedAt: actualInTime,
          });
          pass.updatedAt = actualInTime;
        }
      }

      /* ── A notification for whoever currently owns the pass ── */
      if (bucket.status === GATEPASS_STATUS.PENDING) {
        notifications.push({
          recipient: manager._id,
          actor: employee._id,
          type: NOTIFICATION_TYPE.SUBMITTED,
          title: 'Gate pass awaiting your approval',
          message: `${employee.name} raised ${gatePassNumber} — ${reason}`,
          link: `/gate-pass/${_id}`,
          gatePass: _id,
          isRead: false,
          createdAt,
          updatedAt: createdAt,
        });
      }

      if (bucket.status === GATEPASS_STATUS.HR_REVIEW) {
        notifications.push({
          recipient: hr._id,
          actor: manager._id,
          type: NOTIFICATION_TYPE.REVIEW,
          title: 'Gate pass awaiting HR review',
          message: `${gatePassNumber} for ${employee.name} was approved by ${manager.name}`,
          link: `/hr/review/${_id}`,
          gatePass: _id,
          isRead: false,
          createdAt: approvedAt,
          updatedAt: approvedAt,
        });
      }

      passes.push(pass);
    }
  }

  // `timestamps: false` keeps the backdated createdAt/updatedAt we just built.
  await GatePass.insertMany(passes, { timestamps: false });
  if (hrReviews.length) await HRReview.insertMany(hrReviews, { timestamps: false });
  if (securityLogs.length) await SecurityLog.insertMany(securityLogs, { timestamps: false });
  if (notifications.length) await Notification.insertMany(notifications, { timestamps: false });

  const counts = GATEPASS_MIX.map((b) => `${b.status}: ${b.count}`).join(' · ');
  log.done(`${passes.length} gate passes — ${counts}`);
  log.done(`${hrReviews.length} HR reviews · ${securityLogs.length} security logs · ${notifications.length} notifications`);
};

/* ─── Credentials table ───────────────────────────────────────────────────── */
const printCredentials = () => {
  const password = env.seed.defaultPassword;
  const rows = USERS.map((user) => ({
    email: user.email,
    password,
    role: user.role,
    name: user.name,
  }));

  const widths = {
    email: Math.max(5, ...rows.map((r) => r.email.length)),
    password: Math.max(8, ...rows.map((r) => r.password.length)),
    role: Math.max(4, ...rows.map((r) => r.role.length)),
    name: Math.max(4, ...rows.map((r) => r.name.length)),
  };

  const line = (l, m, r) =>
    `${l}${'─'.repeat(widths.email + 2)}${m}${'─'.repeat(widths.password + 2)}${m}${'─'.repeat(
      widths.role + 2
    )}${m}${'─'.repeat(widths.name + 2)}${r}`;

  const row = (email, pwd, role, name) =>
    `│ ${email.padEnd(widths.email)} │ ${pwd.padEnd(widths.password)} │ ${role.padEnd(
      widths.role
    )} │ ${name.padEnd(widths.name)} │`;

  console.log('\n\x1b[1mSeeded credentials\x1b[0m');
  console.log(line('┌', '┬', '┐'));
  console.log(row('EMAIL', 'PASSWORD', 'ROLE', 'NAME'));
  console.log(line('├', '┼', '┤'));
  rows.forEach((r) => console.log(row(r.email, r.password, r.role, r.name)));
  console.log(line('└', '┴', '┘'));
  console.log('\nAll accounts share the same password (SEED_DEFAULT_PASSWORD).\n');
};

/* ─── Entry point ─────────────────────────────────────────────────────────── */
const run = async () => {
  const startedAt = Date.now();
  console.log('\n\x1b[1mGatePass Pro — database seed\x1b[0m');
  console.log(`  mode: ${FRESH ? 'FRESH (collections will be dropped)' : 'UPSERT (idempotent)'}`);

  await connectDatabase();
  if (FRESH) await wipe();

  const units = await seedUnits();
  const departments = await seedDepartments(units);
  const roles = await seedRoles();
  const users = await seedUsers(units, departments, roles);

  await seedSettings(users.get('admin@gatepasspro.io'));
  await seedHolidays(users.get('admin@gatepasspro.io'));
  await seedGatePasses(units, departments, users);

  console.log(`\n\x1b[32mSeed complete in ${((Date.now() - startedAt) / 1000).toFixed(1)}s\x1b[0m`);
  printCredentials();

  await disconnectDatabase();
  process.exit(0);
};

run().catch(async (error) => {
  console.error('\n\x1b[31mSeed failed:\x1b[0m', error);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
