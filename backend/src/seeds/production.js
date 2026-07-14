/**
 * Production bootstrap.
 *
 * The difference from `npm run seed` is the whole point of this file: the demo
 * seeder creates 20 users that all share SEED_DEFAULT_PASSWORD and 42 fake gate
 * passes. On a public deployment those are working backdoors. This script seeds
 * ONLY what the app cannot run without —
 *
 *   units · departments · roles · settings · holidays
 *
 * — plus exactly one super admin, taken from the environment. No demo users, no
 * demo gate passes, no shared password.
 *
 * It is idempotent: every write is an upsert keyed on a natural key, so running
 * it twice is safe. It never overwrites an existing super admin's password.
 *
 *   npm run seed:prod
 */
import mongoose from 'mongoose';
import dayjs from 'dayjs';

import env from '../config/env.js';
import logger from '../utils/logger.js';
import { Unit, Department, Role, User, Settings, Holiday } from '../models/index.js';
import { UNITS, DEPARTMENTS, ROLES, SETTINGS, HOLIDAYS } from './data.js';

const ADMIN = {
  name: process.env.SUPERADMIN_NAME || 'Super Admin',
  email: (process.env.SUPERADMIN_EMAIL || '').toLowerCase().trim(),
  password: process.env.SUPERADMIN_PASSWORD || '',
  employeeId: process.env.SUPERADMIN_EMPLOYEE_ID || 'EMP0001SA',
};

const step = (message) => logger.info(`▸ ${message}`);

/* ─── Reference data ──────────────────────────────────────────────────────── */
const seedUnits = async () => {
  const units = new Map();
  for (const unit of UNITS) {
    const doc = await Unit.findOneAndUpdate(
      { code: unit.code },
      { $set: { ...unit, isActive: true } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    units.set(unit.code, doc);
  }
  step(`${units.size} units`);
  return units;
};

const seedDepartments = async (units) => {
  const departments = new Map();
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
  step(`${departments.size} departments`);
  return departments;
};

const seedRoles = async () => {
  const roles = new Map();
  for (const role of ROLES) {
    const doc = await Role.findOneAndUpdate(
      { key: role.key },
      { $set: { ...role, isSystem: true, isActive: true } },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    );
    roles.set(role.key, doc);
  }
  step(`${roles.size} roles`);
  return roles;
};

/* ─── The one human ───────────────────────────────────────────────────────── */
const seedSuperAdmin = async (units, departments, roles) => {
  const role = roles.get('SUPER_ADMIN');
  if (!role) throw new Error('SUPER_ADMIN role missing — roles failed to seed');

  // Park the admin in the first unit's first department; they see everything
  // anyway (dataScope ALL), so this is bookkeeping, not a restriction.
  const unit = [...units.values()][0];
  const department = [...departments.values()].find(
    (d) => String(d.unit) === String(unit._id)
  );

  const existing = await User.findOne({ email: ADMIN.email });
  if (existing) {
    // Never silently reset a live admin's password.
    existing.set({ role: role._id, status: 'ACTIVE' });
    await existing.save();
    step(`super admin already exists — left password untouched (${ADMIN.email})`);
    return existing;
  }

  const admin = await User.create({
    employeeId: ADMIN.employeeId,
    name: ADMIN.name,
    email: ADMIN.email,
    password: ADMIN.password, // bcrypt-hashed by the model's pre-save hook
    designation: 'Super Administrator',
    unit: unit._id,
    department: department._id,
    role: role._id,
    status: 'ACTIVE',
  });
  step(`super admin created: ${ADMIN.email}`);
  return admin;
};

/* ─── Settings + holidays ─────────────────────────────────────────────────── */
const seedSettings = async (admin) => {
  const settings = await Settings.getSingleton();
  settings.set({ ...SETTINGS, updatedBy: admin._id });
  await settings.save();
  step(`settings written (company: ${SETTINGS.company.name})`);
};

const seedHolidays = async (admin) => {
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
          units: [],
          isActive: true,
          createdBy: admin._id,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }
  step(`${holidays.length} holidays for ${year}`);
};

/* ─── Run ─────────────────────────────────────────────────────────────────── */
const run = async () => {
  if (!ADMIN.email || !ADMIN.password) {
    throw new Error(
      'SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD must be set in the environment before seeding production.'
    );
  }
  if (ADMIN.password.length < 8) {
    throw new Error('SUPERADMIN_PASSWORD must be at least 8 characters.');
  }

  await mongoose.connect(env.mongoUri);
  logger.info(`Connected → ${mongoose.connection.name}`);

  const units = await seedUnits();
  const departments = await seedDepartments(units);
  const roles = await seedRoles();
  const admin = await seedSuperAdmin(units, departments, roles);
  await seedSettings(admin);
  await seedHolidays(admin);

  const users = await User.countDocuments();
  logger.info(`Done. Users in database: ${users} (expected 1 on a fresh install)`);
  if (users > 1) {
    logger.warn('More than one user exists — if this database ever ran the DEMO seeder, remove those accounts.');
  }

  await mongoose.disconnect();
};

run().catch((error) => {
  logger.error(`Production seed failed: ${error.message}`);
  process.exit(1);
});
