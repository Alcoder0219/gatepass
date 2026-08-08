import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  ClipboardCheck,
  History,
  Search,
  ShieldCheck,
  Undo2,
  UserCheck,
  XCircle,
} from 'lucide-react';

import {
  Avatar,
  Badge,
  Button,
  Card,
  Input,
  ListSkeleton,
  Modal,
  Pagination,
  EmptyState,
  Textarea,
} from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { PERMISSION } from '@/permissions/constants';
import { usePermissions } from '@/permissions/usePermissions';
import { LEAVE_STATUS_META } from '@/permissions/leave.constants';
import { leaveApprovalApi } from '@/services/leave.endpoints';
import { errorMessage } from '@/services/api';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate, formatRelative } from '@/utils/format';
import { cn } from '@/utils/cn';
import { pageVariants, staggerContainer, staggerItem } from '@/animations/variants';
import type { ApprovalRequest, ApprovalStage } from '@/types/leave';

type Decision = 'APPROVE' | 'REJECT' | 'SEND_BACK';

const DECISION_META: Record<Decision, { title: string; label: string; required: boolean; hint: string }> = {
  APPROVE: {
    title: 'Approve this application',
    label: 'Approve',
    required: false,
    hint: 'Remarks are optional and are shown to the employee.',
  },
  REJECT: {
    title: 'Reject this application',
    label: 'Reject',
    required: true,
    hint: 'A reason is required. The balance is released, never deducted.',
  },
  SEND_BACK: {
    title: 'Send back to the manager',
    label: 'Send back',
    required: true,
    hint: 'Explain what the manager needs to reconsider.',
  },
};

/* ─── Row ─────────────────────────────────────────────────────────────────── */
const RequestCard = ({
  row,
  onDecide,
  canDecide,
  canSendBack,
}: {
  row: ApprovalRequest;
  onDecide: (row: ApprovalRequest, decision: Decision) => void;
  canDecide: boolean;
  canSendBack: boolean;
}) => {
  const meta = LEAVE_STATUS_META[row.status];

  return (
    <motion.div variants={staggerItem}>
      <Card padding="sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 gap-3">
            <Avatar name={row.employeeName} size="sm" className="shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-content">
                {row.employeeName}
                <span className="ml-2 font-mono text-xs font-normal text-content-muted">
                  {row.employeeCode}
                </span>
              </p>
              <p className="mt-0.5 truncate text-xs text-content-muted">
                <span className="font-mono font-semibold text-brand-600 dark:text-brand-300">
                  {row.leaveNumber}
                </span>
                {' · '}
                {row.leaveTypeName}
                {' · '}
                {formatDate(row.fromDate)} – {formatDate(row.toDate)}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-content-subtle">“{row.reason}”</p>
              {row.appliedOnBehalf && (
                <Badge tone="info" className="mt-2">
                  Applied on their behalf
                </Badge>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-col lg:items-end">
            <div className="flex items-center gap-2">
              <Badge tone="brand">{row.totalDays} day{row.totalDays === 1 ? '' : 's'}</Badge>
              <Badge tone={meta.tone} dot>
                {meta.label}
              </Badge>
            </div>
            <span className="text-2xs text-content-subtle">{formatRelative(row.createdAt)}</span>

            {canDecide && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onDecide(row, 'REJECT')}
                  leftIcon={<XCircle className="h-3.5 w-3.5" />}
                >
                  Reject
                </Button>
                {canSendBack && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDecide(row, 'SEND_BACK')}
                    leftIcon={<Undo2 className="h-3.5 w-3.5" />}
                  >
                    Send back
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => onDecide(row, 'APPROVE')}
                  leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                >
                  Approve
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* History — the decision trail so far. */}
        {row.timeline?.length > 1 && (
          <ol className="mt-3 space-y-1 border-t border-line pt-3">
            {row.timeline.map((entry) => (
              <li key={entry._id} className="flex flex-wrap items-baseline gap-x-2 text-2xs">
                <span className="font-semibold text-content">{entry.actorName}</span>
                <span className="text-content-muted">
                  {entry.action.toLowerCase().replace(/_/g, ' ')}
                </span>
                {entry.comment && <span className="text-content-subtle">“{entry.comment}”</span>}
                <span className="ml-auto shrink-0 text-content-subtle">{formatRelative(entry.at)}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </motion.div>
  );
};

/* ─── Page ────────────────────────────────────────────────────────────────── */
const LeaveApproval = () => {
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const canManager = can(PERMISSION.LEAVE_APPROVE);
  const canHr = can(PERMISSION.LEAVE_HR_REVIEW);

  const tabs = useMemo(() => {
    const list: { key: ApprovalStage; label: string; icon: typeof UserCheck }[] = [];
    if (canManager) list.push({ key: 'MANAGER', label: 'Pending my approval', icon: UserCheck });
    if (canHr) list.push({ key: 'HR', label: 'HR review', icon: ShieldCheck });
    list.push({ key: 'HISTORY', label: 'History', icon: History });
    return list;
  }, [canManager, canHr]);

  const [stage, setStage] = useState<ApprovalStage>(tabs[0]?.key ?? 'HISTORY');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350);

  const [target, setTarget] = useState<{ row: ApprovalRequest; decision: Decision } | null>(null);
  const [remarks, setRemarks] = useState('');
  const [remarkError, setRemarkError] = useState('');

  useEffect(() => {
    setPage(1);
  }, [stage, debouncedSearch]);

  const { data: counts } = useQuery({
    queryKey: ['leave', 'approvals', 'counts'],
    queryFn: leaveApprovalApi.counts,
  });

  const listQuery = useQuery({
    queryKey: ['leave', 'approvals', { stage, page, debouncedSearch }],
    queryFn: () => leaveApprovalApi.queue({ stage, page, limit: 10, search: debouncedSearch }),
  });

  const decide = useMutation({
    mutationFn: ({ row, decision, text }: { row: ApprovalRequest; decision: Decision; text: string }) => {
      if (decision === 'APPROVE') return leaveApprovalApi.approve(row._id, text);
      if (decision === 'REJECT') return leaveApprovalApi.reject(row._id, text);
      return leaveApprovalApi.sendBack(row._id, text);
    },
    onSuccess: (updated) => {
      toast.success(
        updated.status === 'APPROVED'
          ? `${updated.leaveNumber} approved — ${updated.totalDays} day(s) deducted`
          : updated.status === 'REJECTED'
            ? `${updated.leaveNumber} rejected — balance released, not deducted`
            : `${updated.leaveNumber} updated`
      );
      setTarget(null);
      setRemarks('');
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not record the decision')),
  });

  const openDecision = (row: ApprovalRequest, decision: Decision) => {
    setTarget({ row, decision });
    setRemarks('');
    setRemarkError('');
  };

  const confirm = () => {
    if (!target) return;
    const spec = DECISION_META[target.decision];
    if (spec.required && remarks.trim().length < 5) {
      setRemarkError('Give a reason of at least 5 characters');
      return;
    }
    decide.mutate({ row: target.row, decision: target.decision, text: remarks.trim() });
  };

  const rows = listQuery.data?.items ?? [];
  const decidable = stage !== 'HISTORY';

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate">
      <PageHeader
        title="Leave Approval"
        subtitle="Employee → manager → HR. The balance is deducted only on final approval."
        icon={<ClipboardCheck className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Leave Management' }, { label: 'Leave Approval' }]}
      />

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const badge = tab.key === 'MANAGER' ? counts?.manager : tab.key === 'HR' ? counts?.hr : undefined;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStage(tab.key)}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors',
                stage === tab.key
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-content/5 text-content-muted hover:text-content'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {badge !== undefined && badge > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-2xs font-bold',
                    stage === tab.key ? 'bg-white/20' : 'bg-danger-500 text-white'
                  )}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Card padding="sm" className="mb-6">
        <Input
          placeholder="Search by leave number, employee or reason…"
          leftIcon={<Search className="h-4 w-4" />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </Card>

      {/* ── Queue ─────────────────────────────────────────────────────────── */}
      {listQuery.isPending ? (
        <ListSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-7 w-7" />}
          title={decidable ? 'Nothing waiting on you' : 'No decided applications yet'}
          message={
            decidable
              ? 'Applications appear here the moment they reach your stage of the workflow.'
              : 'Approved and rejected applications are listed here.'
          }
        />
      ) : (
        <motion.div
          variants={staggerContainer(0.05)}
          initial="initial"
          animate="animate"
          className="space-y-4"
        >
          {rows.map((row) => (
            <RequestCard
              key={row._id}
              row={row}
              onDecide={openDecision}
              canDecide={decidable}
              canSendBack={stage === 'HR' && canHr}
            />
          ))}

          {listQuery.data?.meta && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
        </motion.div>
      )}

      {/* ── Decision ──────────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        size="md"
        icon={
          target?.decision === 'APPROVE' ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : target?.decision === 'REJECT' ? (
            <XCircle className="h-5 w-5" />
          ) : (
            <Undo2 className="h-5 w-5" />
          )
        }
        title={target ? DECISION_META[target.decision].title : ''}
        description={
          target
            ? `${target.row.employeeName} · ${target.row.totalDays} day(s) of ${target.row.leaveTypeName} · ${formatDate(target.row.fromDate)} – ${formatDate(target.row.toDate)}`
            : ''
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)} disabled={decide.isPending}>
              Cancel
            </Button>
            <Button
              onClick={confirm}
              isLoading={decide.isPending}
              variant={target?.decision === 'APPROVE' ? 'primary' : 'danger'}
            >
              {target ? DECISION_META[target.decision].label : ''}
            </Button>
          </>
        }
      >
        {target && (
          <div className="space-y-4">
            {target.decision === 'APPROVE' && target.row.status === 'HR_REVIEW' && (
              <p className="rounded-xl bg-warning-500/10 p-3 text-sm text-warning-700 dark:text-warning-400">
                This is the final approval — {target.row.totalDays} day(s) will be deducted from{' '}
                {target.row.employeeName}’s {target.row.leaveTypeName} balance.
              </p>
            )}
            {target.decision === 'REJECT' && (
              <p className="rounded-xl bg-content/5 p-3 text-sm text-content-muted">
                Rejecting releases the reserved days back to the employee. Nothing is deducted.
              </p>
            )}

            <Textarea
              label="Remarks"
              required={DECISION_META[target.decision].required}
              rows={3}
              maxLength={1000}
              showCount
              placeholder="Visible to the employee"
              hint={DECISION_META[target.decision].hint}
              error={remarkError}
              value={remarks}
              onChange={(event) => {
                setRemarks(event.target.value);
                setRemarkError('');
              }}
            />
          </div>
        )}
      </Modal>
    </motion.div>
  );
};

export default LeaveApproval;
