import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Clock,
  FileText,
  LogIn,
  LogOut,
  MessageSquare,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatSmartDateTime, humanise } from '@/utils/format';
import { staggerContainer, staggerItem } from '@/animations/variants';
import type { GatePass, TimelineEntry } from '@/types';

const ACTION_META: Record<string, { icon: typeof FileText; tone: string; label: string }> = {
  SUBMITTED: { icon: FileText, tone: 'bg-brand-500/15 text-brand-500', label: 'Gate pass submitted' },
  RESUBMITTED: { icon: FileText, tone: 'bg-brand-500/15 text-brand-500', label: 'Resubmitted after changes' },
  MANAGER_APPROVED: { icon: CheckCircle2, tone: 'bg-success-500/15 text-success-500', label: 'Approved by manager' },
  MANAGER_REJECTED: { icon: XCircle, tone: 'bg-danger-500/15 text-danger-500', label: 'Rejected by manager' },
  CHANGES_REQUESTED: { icon: MessageSquare, tone: 'bg-info-500/15 text-info-500', label: 'Changes requested' },
  HR_REVIEW_OK: { icon: ShieldCheck, tone: 'bg-success-500/15 text-success-500', label: 'HR review — OK' },
  HR_REVIEW_NOT_OK: { icon: XCircle, tone: 'bg-warning-500/15 text-warning-500', label: 'HR review — Not OK' },
  HR_REJECTED: { icon: XCircle, tone: 'bg-danger-500/15 text-danger-500', label: 'Rejected by HR' },
  SECURITY_EXIT: { icon: LogOut, tone: 'bg-accent-500/15 text-accent-500', label: 'Exit recorded at gate' },
  SECURITY_ENTRY: { icon: LogIn, tone: 'bg-success-600/15 text-success-600', label: 'Return recorded at gate' },
  CANCELLED: { icon: XCircle, tone: 'bg-content-subtle/15 text-content-muted', label: 'Cancelled' },
  EXPIRED: { icon: Clock, tone: 'bg-danger-400/15 text-danger-400', label: 'Auto-expired' },
};

/**
 * The workflow trail. Reads top-down (newest last) so it tells the story in the
 * order it happened — the same order the approvals actually moved.
 */
export const StatusTimeline = ({ timeline }: { timeline: TimelineEntry[] }) => {
  if (!timeline?.length) {
    return <p className="text-sm text-content-subtle">No activity recorded yet.</p>;
  }

  return (
    <motion.ol variants={staggerContainer(0.06)} initial="initial" animate="animate" className="relative">
      {/* The connecting rail — stops at the last dot rather than running past it. */}
      <span
        className="absolute left-[19px] top-3 w-px bg-gradient-to-b from-line via-line to-transparent"
        style={{ height: `calc(100% - 2.5rem)` }}
        aria-hidden
      />

      {timeline.map((entry, index) => {
        const meta = ACTION_META[entry.action] ?? {
          icon: Clock,
          tone: 'bg-content-subtle/15 text-content-muted',
          label: humanise(entry.action),
        };
        const Icon = meta.icon;
        const isLast = index === timeline.length - 1;

        return (
          <motion.li key={entry._id ?? index} variants={staggerItem} className="relative flex gap-4 pb-6 last:pb-0">
            <div
              className={cn(
                'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-4 ring-[rgb(var(--surface))]',
                meta.tone
              )}
            >
              <Icon className="h-4 w-4" />
              {isLast && (
                <span className="absolute inset-0 animate-pulse-ring rounded-xl bg-current opacity-30" />
              )}
            </div>

            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-semibold text-content">{meta.label}</p>
                <time className="whitespace-nowrap text-xs text-content-subtle">
                  {formatSmartDateTime(entry.at)}
                </time>
              </div>

              <p className="mt-0.5 text-xs text-content-muted">
                by <span className="font-medium text-content">{entry.actorName}</span>
                {entry.actorRole && ` · ${humanise(entry.actorRole)}`}
              </p>

              {entry.comment && (
                <blockquote className="mt-2 rounded-xl border-l-2 border-brand-500/40 bg-surface-sunken/60 px-3 py-2 text-sm italic leading-relaxed text-content-muted">
                  “{entry.comment}”
                </blockquote>
              )}
            </div>
          </motion.li>
        );
      })}
    </motion.ol>
  );
};

/* ─── Horizontal stage tracker ───────────────────────────────────────────── */
const STAGES = [
  { key: 'EMPLOYEE', label: 'Submitted' },
  { key: 'MANAGER', label: 'Manager' },
  { key: 'HR', label: 'HR Review' },
  { key: 'SECURITY', label: 'Security' },
  { key: 'DONE', label: 'Completed' },
] as const;

/** At-a-glance "where is this pass" bar shown at the top of the detail page. */
export const WorkflowProgress = ({ gatePass }: { gatePass: GatePass }) => {
  const terminal = ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(gatePass.status);

  const reached = (() => {
    switch (gatePass.status) {
      case 'PENDING':
      case 'CHANGES_REQUESTED':
        return 1;
      case 'HR_REVIEW':
        return 2;
      case 'APPROVED':
        return 3;
      case 'OUT':
        return 3;
      case 'COMPLETED':
        return 4;
      default:
        return 0;
    }
  })();

  if (terminal) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-danger-500/25 bg-danger-500/5 px-4 py-3">
        <XCircle className="h-5 w-5 shrink-0 text-danger-500" />
        <div>
          <p className="text-sm font-semibold text-content">
            This gate pass is {gatePass.status.toLowerCase()}
          </p>
          {gatePass.approval?.comment && (
            <p className="mt-0.5 text-xs text-content-muted">{gatePass.approval.comment}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center">
      {STAGES.map((stage, index) => {
        const done = index < reached;
        const current = index === reached;

        return (
          <div key={stage.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'relative flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-colors',
                  done && 'bg-brand-gradient text-white shadow-glow-sm',
                  current && 'bg-brand-500/15 text-brand-500 ring-2 ring-brand-500',
                  !done && !current && 'bg-content/10 text-content-subtle'
                )}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                {current && (
                  <span className="absolute inset-0 animate-pulse-ring rounded-full bg-brand-500 opacity-40" />
                )}
              </div>
              <span
                className={cn(
                  'whitespace-nowrap text-2xs font-semibold',
                  done || current ? 'text-content' : 'text-content-subtle'
                )}
              >
                {stage.label}
              </span>
            </div>

            {index < STAGES.length - 1 && (
              <div className="mx-1 mb-5 h-0.5 flex-1 overflow-hidden rounded-full bg-content/10 sm:mx-2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: done ? '100%' : '0%' }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="h-full rounded-full bg-brand-gradient"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default StatusTimeline;
