import Holiday from '../../../models/Holiday.js';
import { getSettings } from '../../../services/settings.service.js';
import ApiError from '../../../utils/ApiError.js';
import { dayjs } from '../../../utils/dates.js';
import { DAY_PART } from '../constants/index.js';

/**
 * Working-day maths for a leave range.
 *
 * Weekly offs come from the SHARED `Settings.workingHours.weekendDays` — read
 * only, never written, so gate pass behaviour is untouched. Holidays come from
 * the existing Holiday collection, matched against the employee's unit.
 *
 * Whether those non-working days are CHARGED to the employee is decided per
 * leave type by `includeWeeklyOff` / `includeHolidays` — the sandwich rule.
 */

/** Holidays inside the range that apply to this unit (or to every unit). */
const holidaysIn = async (from, to, unitId) => {
  const rows = await Holiday.find({
    isActive: true,
    date: { $gte: from.startOf('day').toDate(), $lte: to.endOf('day').toDate() },
    $or: [{ units: { $size: 0 } }, { units: unitId }],
  })
    .select('name date')
    .lean();

  return new Map(rows.map((row) => [dayjs(row.date).format('YYYY-MM-DD'), row.name]));
};

/**
 * Expands a leave range into a per-date breakdown and a total.
 *
 * Returns `{ totalDays, breakdown[], workingDays, nonWorkingDays }`. The
 * breakdown is stored on the request so a disputed day count can be explained
 * six months later without recomputing against rules that may have changed.
 */
export const computeLeaveDays = async ({
  leaveType,
  fromDate,
  toDate,
  fromDayPart = DAY_PART.FULL,
  toDayPart = DAY_PART.FULL,
  unitId,
}) => {
  const from = dayjs(fromDate).startOf('day');
  const to = dayjs(toDate).startOf('day');

  if (to.isBefore(from)) {
    throw ApiError.badRequest('The end date cannot be before the start date');
  }

  const spanDays = to.diff(from, 'day') + 1;
  if (spanDays > 366) {
    throw ApiError.badRequest('A single leave application cannot span more than a year');
  }

  const settings = await getSettings();
  const weekendDays = settings.workingHours?.weekendDays ?? [0];
  const holidays = await holidaysIn(from, to, unitId);

  const singleDay = spanDays === 1;

  // Half days only make sense at the edges of a range: you cannot start a
  // multi-day leave in the FIRST half, nor end one in the SECOND half.
  if (!singleDay) {
    if (fromDayPart === DAY_PART.FIRST_HALF) {
      throw ApiError.badRequest(
        'A multi-day leave cannot start with a first-half day — use the second half or a full day.'
      );
    }
    if (toDayPart === DAY_PART.SECOND_HALF) {
      throw ApiError.badRequest(
        'A multi-day leave cannot end with a second-half day — use the first half or a full day.'
      );
    }
  }

  if (!leaveType.allowHalfDay && (fromDayPart !== DAY_PART.FULL || toDayPart !== DAY_PART.FULL)) {
    throw ApiError.badRequest(`${leaveType.name} cannot be taken as a half day.`);
  }

  const breakdown = [];
  let totalDays = 0;
  let workingDays = 0;
  let nonWorkingDays = 0;

  for (let index = 0; index < spanDays; index += 1) {
    const date = from.add(index, 'day');
    const key = date.format('YYYY-MM-DD');

    const isWeekend = weekendDays.includes(date.day());
    const holidayName = holidays.get(key);
    const isHoliday = Boolean(holidayName);

    let dayPart = DAY_PART.FULL;
    if (singleDay) dayPart = fromDayPart;
    else if (index === 0) dayPart = fromDayPart;
    else if (index === spanDays - 1) dayPart = toDayPart;

    let charge = dayPart === DAY_PART.FULL ? 1 : 0.5;
    let reason = 'Working day';

    if (isWeekend && !leaveType.includeWeeklyOff) {
      charge = 0;
      reason = 'Weekly off — not charged';
    } else if (isHoliday && !leaveType.includeHolidays) {
      charge = 0;
      reason = `${holidayName} — not charged`;
    } else if (isWeekend) {
      reason = 'Weekly off — charged';
    } else if (isHoliday) {
      reason = `${holidayName} — charged`;
    }

    if (isWeekend || isHoliday) nonWorkingDays += 1;
    else workingDays += 1;

    totalDays += charge;
    breakdown.push({
      date: date.toDate(),
      dayPart,
      charged: charge,
      isWeekend,
      isHoliday,
      holidayName: holidayName ?? '',
      reason,
    });
  }

  // Rounded to a half day: floating-point addition of 0.5s can drift.
  totalDays = Math.round(totalDays * 2) / 2;

  return { totalDays, breakdown, workingDays, nonWorkingDays, spanDays };
};

export default { computeLeaveDays };
