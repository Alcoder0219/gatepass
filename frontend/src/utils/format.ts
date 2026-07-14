import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from 'date-fns';

const toDate = (value: string | Date | null | undefined) => {
  if (!value) return null;
  const date = typeof value === 'string' ? parseISO(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDate = (value?: string | Date | null, pattern = 'dd MMM yyyy') => {
  const date = toDate(value);
  return date ? format(date, pattern) : '—';
};

export const formatDateTime = (value?: string | Date | null) => formatDate(value, 'dd MMM yyyy, HH:mm');

export const formatTime = (value?: string | Date | null) => formatDate(value, 'HH:mm');

/** "Today, 14:30" / "Yesterday, 09:05" / "12 Mar 2026, 09:05" */
export const formatSmartDateTime = (value?: string | Date | null) => {
  const date = toDate(value);
  if (!date) return '—';
  if (isToday(date)) return `Today, ${format(date, 'HH:mm')}`;
  if (isYesterday(date)) return `Yesterday, ${format(date, 'HH:mm')}`;
  return format(date, 'dd MMM yyyy, HH:mm');
};

export const formatRelative = (value?: string | Date | null) => {
  const date = toDate(value);
  return date ? formatDistanceToNow(date, { addSuffix: true }) : '—';
};

export const formatDuration = (minutes?: number | null) => {
  if (minutes == null || minutes < 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
};

export const formatNumber = (value?: number | null) =>
  value == null ? '—' : new Intl.NumberFormat('en-IN').format(value);

export const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
};

export const initialsOf = (name?: string) =>
  (name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

/** Turns an upper-snake action key into a readable label: HR_REVIEW_OK → "HR review OK". */
export const humanise = (value?: string) => {
  if (!value) return '—';
  const spaced = value.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).replace(/\bhr\b/gi, 'HR');
};

/** Resolves a stored upload path against the API origin. */
export const assetUrl = (path?: string) => {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return path.startsWith('/') ? path : `/${path}`;
};

/** Converts a Date into the `datetime-local` input format (local time, no TZ). */
export const toDateTimeLocal = (value?: string | Date | null) => {
  const date = toDate(value) ?? new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
