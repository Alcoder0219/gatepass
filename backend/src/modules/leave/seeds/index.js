/**
 * Leave module seeder — idempotent, additive, and completely independent of the
 * gate pass seeder. It never touches a gate pass document.
 *
 *   npm run seed:leave
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import connectDatabase from '../../../config/database.js';
import logger from '../../../utils/logger.js';
// Registers Unit / Department / Role alongside User — populate() resolves refs
// through the global model registry, so they must be loaded before we call it.
import '../../../models/index.js';
import User from '../../../models/User.js';
import Counter from '../../../models/Counter.js';
import LeaveType from '../models/LeaveType.js';
import LeaveRequest from '../models/LeaveRequest.js';
import LeaveBalance from '../models/LeaveBalance.js';
import { currentLeaveYear } from '../services/leaveDashboard.service.js';
import { LEAVE_STATUS, LEAVE_STAGE } from '../constants/index.js';
import { dayjs } from '../../../utils/dates.js';

const LEAVE_TYPES = [
  { code: 'CL', name: 'Casual Leave', type: 'PAID', category: 'REGULAR', annualQuota: 12, color: '#6366f1', description: 'Short personal absences', includeWeeklyOff: false, includeHolidays: false },
  { code: 'SL', name: 'Sick Leave', type: 'PAID', category: 'REGULAR', annualQuota: 12, color: '#f59e0b', description: 'Illness and medical recovery', requiresAttachmentAfterDays: 3, includeWeeklyOff: false, includeHolidays: false },
  { code: 'EL', name: 'Earned Leave', type: 'PAID', category: 'REGULAR', annualQuota: 15, color: '#10b981', description: 'Accrued privilege leave', includeWeeklyOff: true, includeHolidays: true },
  { code: 'ML', name: 'Maternity Leave', type: 'PAID', category: 'STATUTORY', annualQuota: 182, color: '#ec4899', description: 'Statutory maternity leave', allowHalfDay: false, includeWeeklyOff: true, includeHolidays: true },
  { code: 'PL', name: 'Paternity Leave', type: 'PAID', category: 'STATUTORY', annualQuota: 7, color: '#06b6d4', description: 'Statutory paternity leave', allowHalfDay: false, includeWeeklyOff: false, includeHolidays: false },
  { code: 'LOP', name: 'Loss of Pay', type: 'UNPAID', category: 'OTHER', annualQuota: 0, color: '#64748b', description: 'Unpaid absence', includeWeeklyOff: true, includeHolidays: true },
];

/* Deterministic shape — no Math.random, so re-seeding gives the same picture. */
const REQUESTS = [
  { emp: 'rohit.verma@gatepasspro.io', type: 'CL', fromOffset: 2, days: 2, status: LEAVE_STATUS.PENDING, reason: 'Family function out of town' },
  { emp: 'priya.nair@gatepasspro.io', type: 'SL', fromOffset: -1, days: 3, status: LEAVE_STATUS.APPROVED, reason: 'Viral fever, advised rest' },
  { emp: 'imran.sheikh@gatepasspro.io', type: 'EL', fromOffset: -2, days: 5, status: LEAVE_STATUS.APPROVED, reason: 'Annual holiday with family' },
  { emp: 'kavita.joshi@gatepasspro.io', type: 'CL', fromOffset: 5, days: 1, status: LEAVE_STATUS.PENDING, reason: 'Bank and property paperwork' },
  { emp: 'arjun.s@gatepasspro.io', type: 'SL', fromOffset: 0, days: 2, status: LEAVE_STATUS.APPROVED, reason: 'Dental procedure' },
  { emp: 'meera.iyer@gatepasspro.io', type: 'EL', fromOffset: 10, days: 4, status: LEAVE_STATUS.HR_REVIEW, reason: 'Pre-booked travel' },
  { emp: 'karthik.raja@gatepasspro.io', type: 'CL', fromOffset: -8, days: 1, status: LEAVE_STATUS.REJECTED, reason: 'Personal work' },
  { emp: 'divya.menon@gatepasspro.io', type: 'LOP', fromOffset: -12, days: 2, status: LEAVE_STATUS.REJECTED, reason: 'Extended personal leave' },
  { emp: 'harpreet.singh@gatepasspro.io', type: 'EL', fromOffset: -20, days: 3, status: LEAVE_STATUS.COMPLETED, reason: 'Wedding in the family' },
  { emp: 'anjali.gupta@gatepasspro.io', type: 'SL', fromOffset: -25, days: 2, status: LEAVE_STATUS.COMPLETED, reason: 'Recovery after surgery' },
  { emp: 'suresh.patil@gatepasspro.io', type: 'CL', fromOffset: 1, days: 1, status: LEAVE_STATUS.PENDING, reason: "Child's school event" },
  { emp: 'farhan.qureshi@gatepasspro.io', type: 'EL', fromOffset: 0, days: 3, status: LEAVE_STATUS.APPROVED, reason: 'Short break' },
];

const stageFor = (status) => {
  if (status === LEAVE_STATUS.PENDING) return LEAVE_STAGE.MANAGER;
  if (status === LEAVE_STATUS.HR_REVIEW) return LEAVE_STAGE.HR;
  return LEAVE_STAGE.DONE;
};

const run = async () => {
  await connectDatabase();
  const leaveYear = currentLeaveYear();

  console.log('\n\x1b[1mGatePass Pro — leave module seed\x1b[0m');
  console.log(`  leave year: ${leaveYear}\n`);

  /* ── Leave types ──────────────────────────────────────────────────────── */
  for (const type of LEAVE_TYPES) {
    await LeaveType.findOneAndUpdate(
      { code: type.code },
      { $set: type },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  const types = await LeaveType.find({}).lean();
  const byCode = Object.fromEntries(types.map((t) => [t.code, t]));
  console.log(`\x1b[36m▸ Leave types\x1b[0m\n  \x1b[32m✓\x1b[0m ${types.length}: ${types.map((t) => t.code).join(', ')}`);

  /* ── Balances for every active employee ───────────────────────────────── */
  const employees = await User.find({ status: 'ACTIVE' }).select('_id email').lean();
  let balanceCount = 0;

  for (const employee of employees) {
    for (const type of types) {
      if (!type.annualQuota) continue; // LOP has no balance to carry
      await LeaveBalance.findOneAndUpdate(
        { employee: employee._id, leaveType: type._id, leaveYear },
        { $setOnInsert: { opening: 0, accrued: type.annualQuota, carriedForward: 0, used: 0, pending: 0, adjusted: 0 } },
        { upsert: true, setDefaultsOnInsert: true }
      );
      balanceCount += 1;
    }
  }
  console.log(`\n\x1b[36m▸ Leave balances\x1b[0m\n  \x1b[32m✓\x1b[0m ${balanceCount} rows across ${employees.length} employees`);

  /* ── Demo requests ────────────────────────────────────────────────────── */
  const existing = await LeaveRequest.countDocuments();
  if (existing > 0) {
    console.log(`\n\x1b[36m▸ Leave requests\x1b[0m\n  \x1b[33m!\x1b[0m ${existing} already exist — skipping`);
  } else {
    let created = 0;
    for (const row of REQUESTS) {
      const employee = await User.findOne({ email: row.emp })
        .populate('unit', 'code name')
        .populate('department', 'name')
        .populate('reportingManager', 'name');
      const type = byCode[row.type];
      if (!employee || !type) continue;

      const from = dayjs().add(row.fromOffset, 'day').startOf('day');
      const to = from.add(row.days - 1, 'day').endOf('day');
      const seq = await Counter.next(`leave:${employee.unit?.code ?? 'GEN'}:${from.year()}`);

      const approved = [LEAVE_STATUS.APPROVED, LEAVE_STATUS.COMPLETED].includes(row.status);

      await LeaveRequest.create({
        leaveNumber: `LV-${employee.unit?.code ?? 'GEN'}-${from.year()}-${String(seq).padStart(6, '0')}`,
        employee: employee._id,
        employeeCode: employee.employeeId,
        employeeName: employee.name,
        department: employee.department?._id ?? employee.department,
        departmentName: employee.department?.name ?? '',
        unit: employee.unit?._id ?? employee.unit,
        unitName: employee.unit?.name ?? '',
        designation: employee.designation ?? '',

        leaveType: type._id,
        leaveTypeCode: type.code,
        leaveTypeName: type.name,

        fromDate: from.toDate(),
        toDate: to.toDate(),
        totalDays: row.days,
        reason: row.reason,

        reportingManager: employee.reportingManager?._id ?? employee.reportingManager ?? null,
        reportingManagerName: employee.reportingManager?.name ?? '',

        status: row.status,
        stage: stageFor(row.status),
        approval: approved
          ? { approvedBy: employee.reportingManager?._id ?? null, approvedAt: from.subtract(1, 'day').toDate(), comment: 'Approved' }
          : {},
        timeline: [
          { action: 'SUBMITTED', toStatus: LEAVE_STATUS.PENDING, actor: employee._id, actorName: employee.name, comment: 'Leave applied' },
        ],
        createdBy: employee._id,
      });
      created += 1;
    }
    console.log(`\n\x1b[36m▸ Leave requests\x1b[0m\n  \x1b[32m✓\x1b[0m ${created} demo requests`);
  }

  const summary = await LeaveRequest.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
  console.log(`  ${summary.map((s) => `${s._id}: ${s.n}`).join(' · ')}`);

  console.log('\n\x1b[32mLeave seed complete\x1b[0m\n');
  await mongoose.disconnect();
};

run().catch((error) => {
  logger.error(`Leave seed failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
