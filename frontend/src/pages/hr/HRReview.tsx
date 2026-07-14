import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Ban,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  History,
  Inbox,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { GatePassFilters } from '@/components/gatepass/GatePassFilters';
import { GatePassTable } from '@/components/gatepass/GatePassTable';
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  Modal,
  Select,
  StatCard,
  StatCardSkeleton,
  Tabs,
  Textarea,
  TypeBadge,
  type Column,
} from '@/components/ui';
import { useGatePassFilters } from '@/hooks/useGatePassFilters';
import { usePermissions } from '@/permissions/usePermissions';
import { PERMISSION } from '@/permissions/constants';
import { errorMessage } from '@/services/api';
import { hrApi } from '@/services/endpoints';
import { staggerContainer } from '@/animations/variants';
import { formatDateTime, formatDuration, formatSmartDateTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { GatePass, HRReviewRecord } from '@/types';

/* ────────────────────────────────────────────────────────────────────────────
 * The decision. Three outcomes, and they are NOT symmetric:
 *   OK      → the pass moves forward to Security.
 *   NOT_OK  → the pass goes BACK to the manager, who must fix and re-approve.
 *   REJECT  → the pass is killed outright; the employee must raise a new one.
 * Everything except OK demands a written reason, because someone downstream
 * has to act on it.
 * ──────────────────────────────────────────────────────────────────────────── */
type Decision = 'OK' | 'NOT_OK' | 'REJECT';

const reviewSchema = z
  .object({
    status: z.enum(['OK', 'NOT_OK', 'REJECT']),
    comment: z.string().trim().max(1000),
  })
  .refine((values) => values.status === 'OK' || values.comment.length >= 5, {
    message: 'Give at least 5 characters — this is the only thing the recipient sees.',
    path: ['comment'],
  });

type ReviewValues = z.infer<typeof reviewSchema>;

const nameOf = (value: unknown): string =>
  typeof value === 'object' && value !== null && 'name' in value
    ? String((value as { name: string }).name)
    : '';

const imageOf = (value: unknown): string | undefined =>
  typeof value === 'object' && value !== null && 'profileImage' in value
    ? ((value as { profileImage?: string }).profileImage ?? undefined)
    : undefined;

/* ─── Read-only summary rows inside the review modal ─────────────────────── */
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <p className="text-2xs font-semibold uppercase tracking-wider text-content-subtle">{label}</p>
    <div className="mt-1 text-sm text-content">{children}</div>
  </div>
);

/* ─── The two-card decision picker ───────────────────────────────────────── */
const DecisionCard = ({
  active,
  tone,
  icon,
  title,
  consequence,
  onSelect,
}: {
  active: boolean;
  tone: 'success' | 'warning';
  icon: React.ReactNode;
  title: string;
  consequence: string;
  onSelect: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    aria-pressed={active}
    className={cn(
      'flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all duration-200',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/70',
      active
        ? tone === 'success'
          ? 'border-success-500 bg-success-500/10 shadow-glass'
          : 'border-warning-500 bg-warning-500/10 shadow-glass'
        : 'border-line bg-surface-raised hover:border-content-subtle/50'
    )}
  >
    <span
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-xl',
        tone === 'success'
          ? 'bg-success-500/15 text-success-500'
          : 'bg-warning-500/15 text-warning-500'
      )}
    >
      {icon}
    </span>
    <span className="text-base font-semibold text-content">{title}</span>
    <span className="text-xs leading-relaxed text-content-muted">{consequence}</span>
  </button>
);

/* ════════════════════════════════════════════════════════════════════════════
 * Page
 * ════════════════════════════════════════════════════════════════════════════ */
const HRReview = () => {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canReview = can(PERMISSION.HR_REVIEW);
  const canReject = can(PERMISSION.GATEPASS_REJECT);

  const [tab, setTab] = useState<'queue' | 'history'>('queue');
  const [active, setActive] = useState<GatePass | null>(null);

  const { filters, setFilter, setPage, reset, activeCount } = useGatePassFilters();

  /* ── Data ─────────────────────────────────────────────────────────────── */
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['hr', 'stats'],
    queryFn: hrApi.stats,
    staleTime: 30_000,
  });

  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ['hr', 'queue', filters],
    queryFn: () => hrApi.queue(filters),
    enabled: tab === 'queue',
  });

  const [historyStatus, setHistoryStatus] = useState('');
  const [historyPage, setHistoryPage] = useState(1);

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['hr', 'reviews', historyStatus, historyPage],
    queryFn: () => hrApi.reviews({ status: historyStatus, page: historyPage, limit: 20 }),
    enabled: tab === 'history',
  });

  /* ── Review form ──────────────────────────────────────────────────────── */
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset: resetForm,
    formState: { errors },
  } = useForm<ReviewValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { status: 'OK', comment: '' },
  });

  const decision = watch('status');
  const comment = watch('comment');

  const openReview = (pass: GatePass) => {
    resetForm({ status: 'OK', comment: '' });
    setActive(pass);
  };

  const closeReview = () => setActive(null);

  const mutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: ReviewValues }) =>
      values.status === 'REJECT'
        ? hrApi.reject(id, values.comment)
        : hrApi.review(id, { status: values.status, comment: values.comment || undefined }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['hr'] });
      void queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });

      const message: Record<Decision, string> = {
        OK: 'Reviewed OK — the pass is now with Security.',
        NOT_OK: 'Sent back to the manager with your comment.',
        REJECT: 'Gate pass rejected.',
      };
      toast.success(message[variables.values.status]);
      closeReview();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const onSubmit = handleSubmit((values) => {
    if (!active) return;
    mutation.mutate({ id: active._id, values });
  });

  /* ── Queue table action ───────────────────────────────────────────────── */
  const actionColumn: Column<GatePass> = {
    key: 'review',
    header: 'Action',
    headerClassName: 'text-right',
    className: 'text-right',
    render: (row) => (
      <Button
        size="sm"
        leftIcon={<ClipboardCheck className="h-4 w-4" />}
        onClick={(event) => {
          event.stopPropagation();
          openReview(row);
        }}
      >
        Review
      </Button>
    ),
  };

  /* ── History table ────────────────────────────────────────────────────── */
  const historyColumns: Column<HRReviewRecord>[] = [
    {
      key: 'gatePassNumber',
      header: 'Gate Pass',
      render: (row) => (
        <p className="whitespace-nowrap font-mono text-sm font-semibold text-content">
          {row.gatePassNumber}
        </p>
      ),
    },
    {
      key: 'employee',
      header: 'Employee',
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={nameOf(row.employee)} src={imageOf(row.employee)} size="sm" />
          <p className="truncate text-sm font-medium text-content">{nameOf(row.employee) || '—'}</p>
        </div>
      ),
    },
    {
      key: 'reviewerName',
      header: 'Reviewer',
      hideBelow: 'lg',
      render: (row) => (
        <p className="truncate text-sm text-content-muted">{row.reviewerName || nameOf(row.reviewer) || '—'}</p>
      ),
    },
    {
      key: 'status',
      header: 'Decision',
      render: (row) => (
        <Badge
          tone={row.status === 'OK' ? 'success' : 'warning'}
          icon={
            row.status === 'OK' ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Undo2 className="h-3.5 w-3.5" />
            )
          }
        >
          {row.status === 'OK' ? 'Review OK' : 'Not OK'}
        </Badge>
      ),
    },
    {
      key: 'comment',
      header: 'Comment',
      hideBelow: 'xl',
      className: 'max-w-[260px]',
      render: (row) =>
        row.comment ? (
          <p className="truncate text-sm text-content-muted" title={row.comment}>
            {row.comment}
          </p>
        ) : (
          <span className="text-sm text-content-subtle">—</span>
        ),
    },
    {
      key: 'reviewedAt',
      header: 'Reviewed',
      hideBelow: 'md',
      render: (row) => (
        <p className="whitespace-nowrap text-sm text-content-muted">
          {formatSmartDateTime(row.reviewedAt)}
        </p>
      ),
    },
  ];

  const approverName = active ? nameOf(active.approval?.approvedBy) || active.reportingManagerName : '';

  return (
    <div>
      <PageHeader
        title="HR Review"
        subtitle="Manager-approved passes waiting on HR before they reach the gate."
        icon={<ShieldCheck className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Workflow' }, { label: 'HR Review' }]}
      />

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      {statsLoading ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <StatCardSkeleton key={index} />
          ))}
        </div>
      ) : (
        <motion.div
          variants={staggerContainer(0.06)}
          initial="initial"
          animate="animate"
          className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <StatCard
            label="Pending review"
            value={stats?.pending ?? 0}
            icon={<Inbox className="h-5 w-5" />}
            tone="brand"
            hint="Sitting in your queue"
          />
          <StatCard
            label="Reviewed OK today"
            value={stats?.okToday ?? 0}
            icon={<CheckCircle2 className="h-5 w-5" />}
            tone="success"
            hint="Sent on to Security"
          />
          <StatCard
            label="Not OK today"
            value={stats?.notOkToday ?? 0}
            icon={<Undo2 className="h-5 w-5" />}
            tone="warning"
            hint="Sent back to managers"
          />
          <StatCard
            label="Avg. review time"
            value={stats?.avgReviewMinutes ?? 0}
            icon={<Clock className="h-5 w-5" />}
            tone="accent"
            hint={`${formatDuration(stats?.avgReviewMinutes ?? 0)} from approval, last 30 days`}
          />
        </motion.div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <Tabs
        layoutId="hr-review-tabs"
        value={tab}
        onChange={(value) => setTab(value as 'queue' | 'history')}
        className="mb-5 w-full sm:w-auto sm:self-start"
        tabs={[
          {
            value: 'queue',
            label: 'Queue',
            icon: <Inbox className="h-4 w-4" />,
            count: stats?.pending ?? 0,
          },
          { value: 'history', label: 'Review History', icon: <History className="h-4 w-4" /> },
        ]}
      />

      {tab === 'queue' ? (
        <>
          <GatePassFilters
            filters={filters}
            onChange={setFilter}
            onReset={reset}
            activeCount={activeCount}
            hideStatus
          />

          <GatePassTable
            data={queue?.items ?? []}
            isLoading={queueLoading}
            meta={queue?.meta}
            onPageChange={setPage}
            sort={filters.sort}
            onSortChange={(sort) => setFilter({ sort })}
            basePath="/hr-review"
            actionColumn={canReview ? actionColumn : undefined}
            emptyTitle="The queue is clear"
            emptyMessage="No manager-approved passes are waiting on HR right now."
          />
        </>
      ) : (
        <div className="space-y-5">
          <div className="max-w-xs">
            <Select
              label="Decision"
              value={historyStatus}
              onChange={(event) => {
                setHistoryStatus(event.target.value);
                setHistoryPage(1);
              }}
              options={[
                { value: 'OK', label: 'Review OK' },
                { value: 'NOT_OK', label: 'Not OK' },
              ]}
              placeholder="All decisions"
            />
          </div>

          <DataTable
            data={history?.items ?? []}
            columns={historyColumns}
            isLoading={historyLoading}
            rowKey={(row) => row._id}
            meta={history?.meta}
            onPageChange={setHistoryPage}
            emptyTitle="No reviews yet"
            emptyMessage="Every HR decision you record will be listed here."
            mobileCard={(row) => (
              <div className="card space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-semibold text-content">
                      {row.gatePassNumber}
                    </p>
                    <p className="truncate text-xs text-content-muted">{nameOf(row.employee)}</p>
                  </div>
                  <Badge tone={row.status === 'OK' ? 'success' : 'warning'}>
                    {row.status === 'OK' ? 'Review OK' : 'Not OK'}
                  </Badge>
                </div>
                {row.comment && <p className="line-clamp-2 text-sm text-content-muted">{row.comment}</p>}
                <div className="flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-content-subtle">
                  <span className="truncate">{row.reviewerName || nameOf(row.reviewer)}</span>
                  <span className="shrink-0">{formatSmartDateTime(row.reviewedAt)}</span>
                </div>
              </div>
            )}
          />
        </div>
      )}

      {/* ── Review modal ───────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(active)}
        onClose={closeReview}
        dismissible={!mutation.isPending}
        size="lg"
        title="Review gate pass"
        description={active?.gatePassNumber}
        icon={<ClipboardCheck className="h-5 w-5" />}
        footer={
          <>
            <Button variant="secondary" onClick={closeReview} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              variant={
                decision === 'OK' ? 'success' : decision === 'REJECT' ? 'danger' : 'primary'
              }
              onClick={() => void onSubmit()}
              isLoading={mutation.isPending}
              leftIcon={
                decision === 'OK' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : decision === 'REJECT' ? (
                  <Ban className="h-4 w-4" />
                ) : (
                  <Undo2 className="h-4 w-4" />
                )
              }
            >
              {decision === 'OK'
                ? 'Send to Security'
                : decision === 'REJECT'
                  ? 'Reject gate pass'
                  : 'Send back to manager'}
            </Button>
          </>
        }
      >
        {active && (
          <form onSubmit={onSubmit} className="space-y-6">
            {/* Summary — read-only, dense, enough to decide without leaving the page. */}
            <div className="rounded-2xl border border-line bg-surface-sunken/50 p-4">
              <div className="flex items-center gap-3">
                <Avatar
                  name={active.employeeName}
                  src={imageOf(active.employee)}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-content">{active.employeeName}</p>
                  <p className="truncate text-xs text-content-muted">
                    {active.employeeCode} · {active.departmentName}
                  </p>
                </div>
                <TypeBadge type={active.type} />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Reason">
                  <p className="leading-relaxed text-content-muted">{active.reason}</p>
                </Field>
                <Field label="Expected out → in">
                  <p className="text-content-muted">
                    {formatDateTime(active.expectedOutTime)}
                    <span className="mx-1.5 text-content-subtle">→</span>
                    {formatDateTime(active.expectedInTime)}
                  </p>
                </Field>
              </div>

              <div className="mt-4 border-t border-line pt-4">
                <Field label="Approved by">
                  <p className="font-medium text-content">
                    {approverName || '—'}
                    {active.approval?.approvedAt && (
                      <span className="ml-2 text-xs font-normal text-content-subtle">
                        {formatSmartDateTime(active.approval.approvedAt)}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm italic text-content-muted">
                    {active.approval?.comment ? `“${active.approval.comment}”` : 'No comment left.'}
                  </p>
                </Field>
              </div>
            </div>

            {/* Decision */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-content">Your decision</p>

              <div className="grid gap-3 sm:grid-cols-2">
                <DecisionCard
                  active={decision === 'OK'}
                  tone="success"
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  title="Review OK"
                  consequence="Clears HR and moves the pass forward to Security. The employee gets their QR code and can leave."
                  onSelect={() => setValue('status', 'OK', { shouldValidate: true })}
                />
                <DecisionCard
                  active={decision === 'NOT_OK'}
                  tone="warning"
                  icon={<Undo2 className="h-5 w-5" />}
                  title="Not OK"
                  consequence="Sends the pass BACK to the manager, not to the employee. They must fix what you flag and approve it again."
                  onSelect={() => setValue('status', 'NOT_OK', { shouldValidate: true })}
                />
              </div>

              {canReject && (
                <button
                  type="button"
                  onClick={() => setValue('status', 'REJECT', { shouldValidate: true })}
                  aria-pressed={decision === 'REJECT'}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500/60',
                    decision === 'REJECT'
                      ? 'border-danger-500 bg-danger-500/10'
                      : 'border-line bg-surface-raised hover:border-danger-500/40'
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger-500/15 text-danger-500">
                    <Ban className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-content">Reject outright</span>
                    <span className="block text-xs text-content-muted">
                      Kills the pass for good. Nobody can revive it — the employee must raise a new one.
                    </span>
                  </span>
                </button>
              )}
            </div>

            <Textarea
              label="Comment"
              required={decision !== 'OK'}
              maxLength={1000}
              showCount
              value={comment}
              placeholder={
                decision === 'OK'
                  ? 'Optional — anything Security should know.'
                  : decision === 'NOT_OK'
                    ? 'What must the manager fix before re-approving?'
                    : 'Why is this pass being rejected?'
              }
              error={errors.comment?.message}
              hint={decision === 'OK' ? 'Optional for an OK review.' : undefined}
              {...register('comment')}
            />
          </form>
        )}
      </Modal>
    </div>
  );
};

export default HRReview;
