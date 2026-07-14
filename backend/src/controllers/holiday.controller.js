import Holiday from '../models/Holiday.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/ApiResponse.js';
import { recordAudit, diff } from '../services/audit.service.js';
import { dayjs } from '../utils/dates.js';
import { AUDIT_ACTION } from '../constants/index.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const snapshot = (doc, keys) => {
  const plain = doc.toObject();
  return Object.fromEntries(
    keys.map((key) => {
      const value = plain[key];
      if (Array.isArray(value)) return [key, value.map(String)];
      if (value instanceof Date) return [key, value.toISOString()];
      return [key, value ?? null];
    })
  );
};

const buildFilter = ({ search, isActive, year, unit, type }) => {
  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive;
  if (type) filter.type = type;
  if (year) {
    filter.date = {
      $gte: dayjs(`${year}-01-01`).startOf('year').toDate(),
      $lte: dayjs(`${year}-12-31`).endOf('year').toDate(),
    };
  }
  // An empty `units` array means the holiday applies to every unit.
  if (unit) filter.$or = [{ units: unit }, { units: { $size: 0 } }];
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    const nameMatch = [{ name: rx }, { description: rx }];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: nameMatch }];
      delete filter.$or;
    } else {
      filter.$or = nameMatch;
    }
  }
  return filter;
};

/* ─── GET /holidays ───────────────────────────────────────────────────────── */
export const listHolidays = asyncHandler(async (req, res) => {
  const { page, limit, sort } = req.query;

  const result = await Holiday.paginate(buildFilter(req.query), {
    page,
    limit,
    sort,
    populate: [{ path: 'units', select: 'name code' }],
    lean: true,
  });

  return sendPaginated(res, result, 'Holidays fetched successfully');
});

/* ─── GET /holidays/lookup ────────────────────────────────────────────────── */
export const lookupHolidays = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.unit) filter.$or = [{ units: req.query.unit }, { units: { $size: 0 } }];

  const holidays = await Holiday.find(filter)
    .select('name date type restrictGatePass')
    .sort('date')
    .lean();

  return sendSuccess(res, { data: holidays, message: 'Holidays fetched successfully' });
});

/* ─── GET /holidays/:id ───────────────────────────────────────────────────── */
export const getHoliday = asyncHandler(async (req, res) => {
  const holiday = await Holiday.findById(req.params.id).populate('units', 'name code');
  if (!holiday) throw ApiError.notFound('Holiday not found');

  return sendSuccess(res, { data: holiday.toJSON(), message: 'Holiday fetched successfully' });
});

/* ─── POST /holidays ──────────────────────────────────────────────────────── */
export const createHoliday = asyncHandler(async (req, res) => {
  const holiday = await Holiday.create({ ...req.body, createdBy: req.user._id });

  await recordAudit({
    action: AUDIT_ACTION.HOLIDAY_UPSERT,
    actor: req.user,
    entity: 'Holiday',
    entityId: holiday._id,
    entityLabel: holiday.name,
    description: `Created holiday ${holiday.name} on ${dayjs(holiday.date).format('YYYY-MM-DD')}`,
    req,
  });

  return sendCreated(res, { data: holiday.toJSON(), message: 'Holiday created successfully' });
});

/* ─── PATCH /holidays/:id ─────────────────────────────────────────────────── */
export const updateHoliday = asyncHandler(async (req, res) => {
  const holiday = await Holiday.findById(req.params.id);
  if (!holiday) throw ApiError.notFound('Holiday not found');

  const keys = Object.keys(req.body);
  const before = snapshot(holiday, keys);

  Object.assign(holiday, req.body);
  await holiday.save();

  await recordAudit({
    action: AUDIT_ACTION.HOLIDAY_UPSERT,
    actor: req.user,
    entity: 'Holiday',
    entityId: holiday._id,
    entityLabel: holiday.name,
    description: `Updated holiday ${holiday.name}`,
    changes: diff(before, snapshot(holiday, keys)),
    req,
  });

  return sendSuccess(res, { data: holiday.toJSON(), message: 'Holiday updated successfully' });
});

/* ─── DELETE /holidays/:id ────────────────────────────────────────────────── */
export const deleteHoliday = asyncHandler(async (req, res) => {
  const holiday = await Holiday.findById(req.params.id);
  if (!holiday) throw ApiError.notFound('Holiday not found');

  holiday.isActive = false;
  await holiday.save();

  await recordAudit({
    action: AUDIT_ACTION.HOLIDAY_UPSERT,
    actor: req.user,
    entity: 'Holiday',
    entityId: holiday._id,
    entityLabel: holiday.name,
    description: `Deactivated holiday ${holiday.name}`,
    req,
  });

  return sendSuccess(res, { message: 'Holiday deactivated successfully' });
});

export default {
  listHolidays,
  lookupHolidays,
  getHoliday,
  createHoliday,
  updateHoliday,
  deleteHoliday,
};
