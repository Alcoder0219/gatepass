import crypto from 'node:crypto';
import QRCode from 'qrcode';
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
 * The QR encodes an opaque token (not the mongo id) plus the pass number, so a
 * scan can be resolved without exposing internal identifiers, and a token can
 * be rotated if a pass is re-issued.
 */
export const generateQrToken = () => crypto.randomBytes(24).toString('hex');

export const generateQrCode = async (gatePass) => {
  const payload = JSON.stringify({
    v: 1,
    no: gatePass.gatePassNumber,
    t: gatePass.qrToken,
  });

  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
};

/** Parses whatever the scanner produced — raw token, JSON payload or pass number. */
export const parseQrPayload = (raw) => {
  if (!raw || typeof raw !== 'string') return {};
  const trimmed = raw.trim();

  try {
    const parsed = JSON.parse(trimmed);
    return { token: parsed.t, gatePassNumber: parsed.no };
  } catch {
    // Not JSON — a bare token is 48 hex chars, anything else we treat as a number.
    if (/^[a-f0-9]{48}$/i.test(trimmed)) return { token: trimmed };
    return { gatePassNumber: trimmed.toUpperCase() };
  }
};

export default { generateGatePassNumber, generateQrToken, generateQrCode, parseQrPayload };
