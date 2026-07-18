import { parse } from 'csv-parse/sync';
import crypto from 'node:crypto';
import { Department, Role, Unit, User } from '../models/index.js';
import ApiError from '../utils/ApiError.js';

/**
 * Bulk user import from CSV.
 *
 * The wire format is deliberately human-readable: an HR administrator builds this
 * file in Excel, so the columns hold NAMES ("Production", "Corporate", "Employee")
 * and not ObjectIds. Resolving those names to references — and saying precisely
 * which cell is wrong when one does not resolve — is most of the job here.
 *
 * Everything is validated before anything is written. A half-applied import of a
 * staff list is far worse than a rejected one: the administrator cannot tell what
 * landed, and re-running the file then collides with the rows that did.
 */

export const COLUMNS = [
  'employeeId',
  'name',
  'email',
  'phone',
  'designation',
  'department',
  'unit',
  'role',
  'reportingManager',
  'status',
  'password',
];

const REQUIRED = ['employeeId', 'name', 'email', 'department', 'unit', 'role'];
const STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^$|^[0-9+\-\s()]{7,20}$/;

export const generatePassword = () => `Gp@${crypto.randomBytes(6).toString('base64url')}9`;

/** The file an administrator downloads, fills in, and uploads back. */
export const templateCsv = () =>
  `${COLUMNS.join(',')}\n` +
  'EMP1001,Asha Verma,asha.verma@example.com,+91 98765 43210,Line Supervisor,Production,Corporate,Employee,EMP0001SA,ACTIVE,\n' +
  'EMP1002,Rakesh Nair,rakesh.nair@example.com,,Shift Engineer,Production,Corporate,Employee,,ACTIVE,\n';

const norm = (value) => (value ?? '').toString().trim();
const key = (value) => norm(value).toLowerCase();

/**
 * Departments are unique per unit, not globally (`{ code, unit }` is the unique
 * index), so a department can only be resolved once its row's unit is known.
 */
const buildLookups = async () => {
  const [units, departments, roles, managers] = await Promise.all([
    Unit.find({}).select('_id name code').lean(),
    Department.find({}).select('_id name code unit').lean(),
    Role.find({ isActive: true }).select('_id name').lean(),
    User.find({}).select('_id employeeId email name').lean(),
  ]);

  const unitBy = new Map();
  units.forEach((unit) => {
    unitBy.set(key(unit.name), unit);
    if (unit.code) unitBy.set(key(unit.code), unit);
  });

  // Keyed by `${unitId}::${name|code}` — the same department name legitimately
  // exists in more than one unit.
  const deptBy = new Map();
  departments.forEach((dept) => {
    const scope = String(dept.unit);
    deptBy.set(`${scope}::${key(dept.name)}`, dept);
    if (dept.code) deptBy.set(`${scope}::${key(dept.code)}`, dept);
  });

  const roleBy = new Map(roles.map((role) => [key(role.name), role]));

  const managerBy = new Map();
  managers.forEach((user) => {
    managerBy.set(key(user.employeeId), user);
    managerBy.set(key(user.email), user);
  });

  return { unitBy, deptBy, roleBy, managerBy };
};

export const parseCsv = (buffer) => {
  let records;
  try {
    records = parse(buffer, {
      columns: (header) => header.map((column) => norm(column)),
      skip_empty_lines: true,
      trim: true,
      bom: true, // Excel writes a BOM; without this the first column name is mangled.
      relax_column_count: true,
    });
  } catch (error) {
    throw ApiError.badRequest(`That file could not be read as CSV: ${error.message}`);
  }

  if (!records.length) throw ApiError.badRequest('The file has no data rows.');

  const unknown = Object.keys(records[0]).filter((column) => column && !COLUMNS.includes(column));
  if (unknown.length) {
    throw ApiError.badRequest(
      `Unrecognised column(s): ${unknown.join(', ')}. Expected: ${COLUMNS.join(', ')}`
    );
  }

  const missing = REQUIRED.filter((column) => !(column in records[0]));
  if (missing.length) {
    throw ApiError.badRequest(`The file is missing required column(s): ${missing.join(', ')}`);
  }

  return records;
};

/**
 * Validates every row and resolves its references. Returns one result per row,
 * in file order, so the UI can point at "row 14" and mean the same line the
 * administrator sees in Excel (hence `line = index + 2`, past the header).
 */
export const validateRows = async (records) => {
  const { unitBy, deptBy, roleBy, managerBy } = await buildLookups();

  // Duplicate detection has to consider the file against ITSELF as well as
  // against the database — two rows claiming one email is a common paste error.
  const seenEmail = new Map();
  const seenEmployeeId = new Map();

  const emails = records.map((r) => key(r.email)).filter(Boolean);
  const employeeIds = records.map((r) => norm(r.employeeId).toUpperCase()).filter(Boolean);

  const clashes = await User.find({
    $or: [{ email: { $in: emails } }, { employeeId: { $in: employeeIds } }],
  })
    .select('email employeeId')
    .lean();

  const takenEmail = new Set(clashes.map((user) => key(user.email)));
  const takenEmployeeId = new Set(clashes.map((user) => norm(user.employeeId).toUpperCase()));

  return records.map((record, index) => {
    const line = index + 2;
    const errors = [];
    const add = (field, message) => errors.push({ field, message });

    const employeeId = norm(record.employeeId).toUpperCase();
    const name = norm(record.name);
    const email = key(record.email);
    const phone = norm(record.phone);
    const designation = norm(record.designation);
    const status = norm(record.status).toUpperCase() || 'ACTIVE';
    const password = norm(record.password);

    if (!employeeId) add('employeeId', 'Employee ID is required');
    if (name.length < 2) add('name', 'Name is required');

    if (!email) add('email', 'Email is required');
    else if (!EMAIL_RE.test(email)) add('email', `"${record.email}" is not a valid email address`);

    if (phone && !PHONE_RE.test(phone)) add('phone', `"${phone}" is not a valid phone number`);
    if (!STATUSES.includes(status)) add('status', `Status must be one of ${STATUSES.join(', ')}`);
    if (password && password.length < 8) add('password', 'Password must be at least 8 characters');

    // Duplicates — inside the file first, then against existing records.
    if (email) {
      if (seenEmail.has(email)) add('email', `Duplicate of row ${seenEmail.get(email)} in this file`);
      else seenEmail.set(email, line);
      if (takenEmail.has(email)) add('email', 'A user with this email already exists');
    }

    if (employeeId) {
      if (seenEmployeeId.has(employeeId)) {
        add('employeeId', `Duplicate of row ${seenEmployeeId.get(employeeId)} in this file`);
      } else seenEmployeeId.set(employeeId, line);
      if (takenEmployeeId.has(employeeId)) add('employeeId', 'This employee ID is already taken');
    }

    // Unit must resolve before department, which is scoped to it.
    const unit = unitBy.get(key(record.unit));
    if (!norm(record.unit)) add('unit', 'Unit is required');
    else if (!unit) add('unit', `No unit named "${record.unit}"`);

    let department = null;
    if (!norm(record.department)) {
      add('department', 'Department is required');
    } else if (unit) {
      department = deptBy.get(`${String(unit._id)}::${key(record.department)}`);
      if (!department) {
        add('department', `"${record.department}" is not a department of unit "${unit.name}"`);
      }
    }

    const role = roleBy.get(key(record.role));
    if (!norm(record.role)) add('role', 'Role is required');
    else if (!role) add('role', `No active role named "${record.role}"`);

    // A manager may be named by employee ID or email, and may be someone created
    // earlier in this same file — resolved in a second pass, below.
    let reportingManager = null;
    let managerRef = null;
    if (norm(record.reportingManager)) {
      const found = managerBy.get(key(record.reportingManager));
      if (found) reportingManager = found._id;
      else managerRef = key(record.reportingManager);
    }

    return {
      line,
      valid: errors.length === 0,
      errors,
      raw: record,
      data: errors.length
        ? null
        : {
            employeeId,
            name,
            email,
            phone: phone || undefined,
            designation: designation || undefined,
            status,
            password: password || undefined,
            department: department?._id,
            unit: unit?._id,
            role: role?._id,
            reportingManager,
          },
      managerRef,
    };
  });
};

/** Second pass: a manager listed in the file itself, once we know the file is coherent. */
const resolveInFileManagers = (results) => {
  const byIdentifier = new Map();
  results.forEach((result) => {
    if (!result.data) return;
    byIdentifier.set(key(result.data.employeeId), result);
    byIdentifier.set(key(result.data.email), result);
  });

  results.forEach((result) => {
    if (!result.managerRef || !result.data) return;
    if (!byIdentifier.has(result.managerRef)) {
      result.valid = false;
      result.errors.push({
        field: 'reportingManager',
        message: `No user or imported row matches "${result.raw.reportingManager}"`,
      });
      result.data = null;
    }
  });
};

/**
 * @param {object[]} results  from validateRows
 * @param {object}   options  { dryRun, skipInvalid, actor }
 */
export const importUsers = async (results, { dryRun = false, skipInvalid = false, actor }) => {
  resolveInFileManagers(results);

  const invalid = results.filter((result) => !result.valid);
  const valid = results.filter((result) => result.valid);

  const summary = {
    total: results.length,
    valid: valid.length,
    invalid: invalid.length,
    created: 0,
    rows: results.map(({ line, valid: ok, errors, raw }) => ({
      line,
      valid: ok,
      errors,
      employeeId: norm(raw.employeeId),
      name: norm(raw.name),
      email: norm(raw.email),
    })),
    credentials: [],
  };

  if (dryRun) return summary;

  // Strict by default: an import that would only half-apply is refused outright,
  // so the administrator fixes the file rather than reconciling a partial state.
  if (invalid.length && !skipInvalid) {
    return { ...summary, refused: true };
  }

  if (!valid.length) return summary;

  const created = [];
  for (const result of valid) {
    const generated = result.data.password ? null : generatePassword();

    // Sequential, not insertMany: the User model hashes the password in a `save`
    // hook, which insertMany bypasses — bulk-inserting would store plaintext.
    // eslint-disable-next-line no-await-in-loop
    const user = await User.create({
      ...result.data,
      password: result.data.password ?? generated,
      createdBy: actor._id,
      updatedBy: actor._id,
    });

    created.push({ result, user, generated });
  }

  // Managers that pointed at a row in this same file: link them now that the
  // rows have _ids.
  const byIdentifier = new Map();
  created.forEach(({ user }) => {
    byIdentifier.set(key(user.employeeId), user._id);
    byIdentifier.set(key(user.email), user._id);
  });

  await Promise.all(
    created
      .filter(({ result }) => result.managerRef && byIdentifier.has(result.managerRef))
      .map(({ result, user }) =>
        User.updateOne(
          { _id: user._id },
          { reportingManager: byIdentifier.get(result.managerRef) }
        )
      )
  );

  summary.created = created.length;
  summary.credentials = created.map(({ user, generated }) => ({
    name: user.name,
    email: user.email,
    employeeId: user.employeeId,
    // Only ever present for a password WE generated — never echo one the
    // administrator supplied, and this is the only moment it is knowable.
    temporaryPassword: generated,
  }));

  return summary;
};

export default { parseCsv, validateRows, importUsers, templateCsv, COLUMNS };