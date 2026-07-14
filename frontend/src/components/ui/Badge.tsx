import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { STATUS_META, TYPE_META } from '@/permissions/constants';
import type { GatePassStatus, GatePassType } from '@/types';

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';

const TONES: Record<Tone, string> = {
  brand: 'bg-brand-500/15 text-brand-700 dark:text-brand-300 ring-brand-500/25',
  accent: 'bg-accent-500/15 text-accent-700 dark:text-accent-300 ring-accent-500/25',
  success: 'bg-success-500/15 text-success-700 dark:text-success-400 ring-success-500/25',
  warning: 'bg-warning-500/15 text-warning-700 dark:text-warning-400 ring-warning-500/25',
  danger: 'bg-danger-500/15 text-danger-700 dark:text-danger-400 ring-danger-500/25',
  info: 'bg-info-500/15 text-info-700 dark:text-info-400 ring-info-500/25',
  neutral: 'bg-content-subtle/15 text-content-muted ring-content-subtle/25',
};

export const Badge = ({
  children,
  tone = 'neutral',
  className,
  dot,
  icon,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
  icon?: ReactNode;
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
      TONES[tone],
      className
    )}
  >
    {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
    {icon}
    {children}
  </span>
);

/**
 * The status pill. Colour, label and meaning come from one map (STATUS_META),
 * so a status never renders inconsistently across the app.
 */
export const StatusBadge = ({
  status,
  className,
  pulse,
}: {
  status: GatePassStatus;
  className?: string;
  /** Ring animation — used for OUT, where someone is physically outside. */
  pulse?: boolean;
}) => {
  const meta = STATUS_META[status] ?? STATUS_META.DRAFT;

  return (
    <span
      title={meta.description}
      className={cn(
        'relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        meta.className,
        className
      )}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {pulse && (
          <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-current" />
        )}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      {meta.label}
    </span>
  );
};

export const TypeBadge = ({ type, className }: { type: GatePassType; className?: string }) => {
  const meta = TYPE_META[type] ?? TYPE_META.OFFICIAL;
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        meta.className,
        className
      )}
    >
      {meta.label}
    </span>
  );
};

export default Badge;
