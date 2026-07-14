import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import utc from 'dayjs/plugin/utc.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(isoWeek);
dayjs.extend(utc);
dayjs.extend(customParseFormat);

export { dayjs };

/** Inclusive start / exclusive end boundaries for a quota period. */
export const periodRange = (period, reference = new Date()) => {
  const ref = dayjs(reference);
  switch (period) {
    case 'daily':
      return { from: ref.startOf('day').toDate(), to: ref.endOf('day').toDate() };
    case 'weekly':
      return { from: ref.startOf('isoWeek').toDate(), to: ref.endOf('isoWeek').toDate() };
    case 'monthly':
      return { from: ref.startOf('month').toDate(), to: ref.endOf('month').toDate() };
    case 'yearly':
      return { from: ref.startOf('year').toDate(), to: ref.endOf('year').toDate() };
    default:
      throw new Error(`Unknown quota period: ${period}`);
  }
};

/** "HH:mm" → minutes since midnight. */
export const timeToMinutes = (value) => {
  if (!value || typeof value !== 'string') return null;
  const [h, m] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

export const minutesOfDay = (date) => {
  const d = dayjs(date);
  return d.hour() * 60 + d.minute();
};

export const isWeekend = (date, weekendDays = [0, 6]) => weekendDays.includes(dayjs(date).day());

export const isSameDay = (a, b) => dayjs(a).isSame(dayjs(b), 'day');

/** Builds a `{ $gte, $lte }` filter from optional from/to query params. */
export const dateFilter = (from, to) => {
  const filter = {};
  if (from) filter.$gte = dayjs(from).startOf('day').toDate();
  if (to) filter.$lte = dayjs(to).endOf('day').toDate();
  return Object.keys(filter).length ? filter : undefined;
};

export const humanDuration = (fromDate, toDate) => {
  if (!fromDate || !toDate) return null;
  const minutes = dayjs(toDate).diff(dayjs(fromDate), 'minute');
  if (minutes < 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
};

export default { dayjs, periodRange, timeToMinutes, minutesOfDay, isWeekend, dateFilter, humanDuration };
