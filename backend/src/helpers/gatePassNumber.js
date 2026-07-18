import Counter from '../models/Counter.js';
import { dayjs } from '../utils/dates.js';

/**
 * Gate pass numbers are unit- and year-scoped so they stay short and readable
 * while remaining globally unique:  GP-MNR-2026-000123
 *
 * The sequence comes from an atomic `$inc` on the Counter collection, which is
 * safe under concurrency and across multiple API instances — counting existing
 * documents would race.
 */
export const generateGatePassNumber = async (unitCode) => {
  const year = dayjs().year();
  const key = `gatepass:${unitCode}:${year}`;
  const seq = await Counter.next(key);
  return `GP-${unitCode}-${year}-${String(seq).padStart(6, '0')}`;
};

/**
 * Normalises whatever security typed into the verify box into a lookup.
 * A bare token is 48 hex chars; anything else is treated as a pass number.
 */
export const parseQrPayload = (raw) => {
  if (!raw || typeof raw !== 'string') return {};
  const trimmed = raw.trim();

  if (/^[a-f0-9]{48}$/i.test(trimmed)) return { token: trimmed };
  return { gatePassNumber: trimmed.toUpperCase() };
};

export default { generateGatePassNumber, parseQrPayload };
