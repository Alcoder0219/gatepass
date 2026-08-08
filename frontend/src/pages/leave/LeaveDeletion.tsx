import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import {
  CalendarX2,
  Download,
  FileWarning,
  History,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  Users,
} from 'lucide-react';

import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  ListSkeleton,
  Modal,
  Pagination,
  Select,
  StatCard,
  Textarea,
  type SelectOption,
} from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { LEAVE_STATUS_META } from '@/permissions/leave.constants';
import { leaveDeletionApi, leaveTypeApi } from '@/services/leave.endpoints';
import { unitApi } from '@/services/endpoints';
import { errorMessage } from '@/services/api';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate, formatDateTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import { pageVariants, staggerContainer, staggerItem } from '@/animations/variants';
import type { DeletableRequest, LeaveStatus, LeaveType } from '@/types/leave';

const ALL = 'ALL';

const STATUS_OPTIONS: SelectOption[] = [
  { value: ALL, label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'HR_REVIEW', label: 'HR Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const BUCKET_LABEL: Record<string, string> = {
  PENDING: 'Reserved days released',
  USED: 'Used days refunded',
  NONE: 'Nothing to restore',
};

/** What deleting this record will do to the balance, stated before it happens. */
const restorePreview = (status: LeaveStatus) => {
  if (['PENDING', 'HR_REVIEW', 'CHANGES_REQUESTED'].includes(status)) {
    return { bucket: 'PENDING', text: 'the reserved days will be released back' };
  }
  if (['APPROVED', 'COMPLETED'].includes(status)) {
    return { bucket: 'USED', text: 'the deducted days will be refunded' };
  }
  return { bucket: 'NONE', text: 'no days are held, so nothing will change' };
};

const LeaveDeletion = () => {
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'DELETE' | 'LOG'>('DELETE');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [leaveType, setLeaveType] = useState(ALL);
  const [unit, setUnit] = useState(ALL);

  const [target, setTarget] = useState<DeletableRequest | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const debouncedSearch = useDebounce(search, 350);

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['leave', 'types', 'lookup'],
    queryFn: leaveTypeApi.lookup,
  });
  const { data: units = [] } = useQuery({ queryKey: ['units', 'lookup'], queryFn: unitApi.lookup });

  const filters = {
    page,
    limit: 10,
    search: debouncedSearch,
    status: status === ALL ? undefined : status,
    leaveType: leaveType === ALL ? undefined : leaveType,
    unit: unit === ALL ? undefined : unit,
  };

  const listQuery = useQuery({
    queryKey: ['leave', 'deletion', tab, filters],
    queryFn: () => (tab === 'DELETE' ? leaveDeletionApi.candidates(filters) : leaveDeletionApi.log(filters)),
  });

  const summaryQuery = useQuery({
    queryKey: ['leave', 'deletion', 'summary', filters],
    queryFn: () => leaveDeletionApi.summary(filters),
    enabled: tab === 'LOG',
  });

  const remove = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => leaveDeletionApi.remove(id, text),
    onSuccess: (row) => {
      toast.success(
        row.deletion && row.deletion.restoredDays > 0
          ? `${row.leaveNumber} deleted — ${row.deletion.restoredDays} day(s) returned to the balance`
          : `${row.leaveNumber} deleted`
      );
      setTarget(null);
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not delete the leave record')),
  });

  const confirmDelete = () => {
    if (!target) return;
    if (reason.trim().length < 10) {
      setReasonError('Give a reason of at least 10 characters — this is a permanent audit record');
      return;
    }
    remove.mutate({ id: target._id, text: reason.trim() });
  };

  const changeTab = (next: 'DELETE' | 'LOG') => {
    setTab(next);
    setPage(1);
  };

  const opt = (rows: { _id: string; name: string; code?: string }[], allLabel: string): SelectOption[] => [
    { value: ALL, label: allLabel },
    ...rows.map((row) => ({ value: row._id, label: row.code ? `${row.code} — ${row.name}` : row.name })),
  ];

  const rows = listQuery.data?.items ?? [];
  const totals = summaryQuery.data?.totals;

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate">
      <PageHeader
        title="Leave Deletion"
        subtitle="Delete a leave record and return the days. HR and Admin only — every deletion is logged."
        icon={<CalendarX2 className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Leave Management' }, { label: 'Leave Deletion' }]}
        actions={
          tab === 'LOG' ? (
            <Button
              variant="secondary"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={() => {
                void leaveDeletionApi
                  .exportCsv(filters)
                  .then(() => toast.success('Deletion log exported'))
                  .catch((error) => toast.error(errorMessage(error, 'Export failed')));
              }}
            >
              Export CSV
            </Button>
          ) : undefined
        }
      />

      {/* ── Restricted-access banner ──────────────────────────────────────── */}
      <Card padding="sm" className="mb-6 ring-1 ring-inset ring-danger-500/20">
        <p className="flex items-start gap-2 text-sm text-content-muted">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger-500" />
          <span>
            Deleting a leave record is permanent and restores the employee’s balance. The action, the
            person and the reason are written to the audit log.
          </span>
        </p>
      </Card>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {([
          { key: 'DELETE' as const, label: 'Delete leave', icon: Trash2 },
          { key: 'LOG' as const, label: 'Deletion log & report', icon: History },
        ]).map((entry) => {
          const Icon = entry.icon;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => changeTab(entry.key)}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors',
                tab === entry.key
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-content/5 text-content-muted hover:text-content'
              )}
            >
              <Icon className="h-4 w-4" />
              {entry.label}
            </button>
          );
        })}
      </div>

      {/* ── Report ────────────────────────────────────────────────────────── */}
      {tab === 'LOG' && (
        <motion.div
          variants={staggerContainer(0.05)}
          initial="initial"
          animate="animate"
          className="mb-6 grid gap-4 sm:grid-cols-3"
        >
          <StatCard
            label="Deletions"
            value={totals?.deletions ?? 0}
            icon={<Trash2 className="h-5 w-5" />}
            tone="danger"
          />
          <StatCard
            label="Days restored"
            value={totals?.daysRestored ?? 0}
            icon={<RotateCcw className="h-5 w-5" />}
            tone="success"
          />
          <StatCard
            label="Employees affected"
            value={totals?.employees ?? 0}
            icon={<Users className="h-5 w-5" />}
            tone="brand"
          />
        </motion.div>
      )}

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <Card padding="sm" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Leave number, employee or reason…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <Select
            options={STATUS_OPTIONS}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          />
          <Select
            options={opt(
              leaveTypes.map((t: LeaveType) => ({ _id: t._id, name: t.name, code: t.code })),
              'All leave types'
            )}
            value={leaveType}
            onChange={(event) => {
              setLeaveType(event.target.value);
              setPage(1);
            }}
          />
          <Select
            options={opt(units, 'All units')}
            value={unit}
            onChange={(event) => {
              setUnit(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </Card>

      {/* ── List ──────────────────────────────────────────────────────────── */}
      {listQuery.isPending ? (
        <ListSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileWarning className="h-7 w-7" />}
          title={tab === 'DELETE' ? 'No leave records match those filters' : 'Nothing has been deleted'}
          message={
            tab === 'DELETE'
              ? 'Adjust the filters to find the record you need to remove.'
              : 'Deleted records appear here with who removed them, when and why.'
          }
        />
      ) : (
        <motion.div
          variants={staggerContainer(0.04)}
          initial="initial"
          animate="animate"
          className="space-y-4"
        >
          {rows.map((row) => {
            const meta = LEAVE_STATUS_META[row.status];
            return (
              <motion.div key={row._id} variants={staggerItem}>
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
                          {' · '}
                          {row.totalDays} day{row.totalDays === 1 ? '' : 's'}
                        </p>
                        <p className="mt-1 line-clamp-1 text-xs text-content-subtle">“{row.reason}”</p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-col lg:items-end">
                      <Badge tone={meta.tone} dot>
                        {meta.label}
                      </Badge>
                      {tab === 'DELETE' ? (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            setTarget(row);
                            setReason('');
                            setReasonError('');
                          }}
                          leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                        >
                          Delete
                        </Button>
                      ) : (
                        <Badge tone={row.deletion?.restoredDays ? 'success' : 'neutral'}>
                          {row.deletion?.restoredDays ?? 0} day(s) restored
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Who deleted it, when, and why. */}
                  {tab === 'LOG' && row.deletion && (
                    <div className="mt-3 grid gap-2 border-t border-line pt-3 text-xs sm:grid-cols-3">
                      <p className="text-content-muted">
                        <span className="text-content-subtle">Deleted by</span>{' '}
                        <span className="font-semibold text-content">{row.deletion.deletedByName}</span>
                      </p>
                      <p className="text-content-muted">
                        <span className="text-content-subtle">When</span>{' '}
                        {formatDateTime(row.deletion.deletedAt)}
                      </p>
                      <p className="text-content-muted">
                        <span className="text-content-subtle">Restored</span>{' '}
                        {BUCKET_LABEL[row.deletion.restoredFrom] ?? '—'}
                      </p>
                      <p className="text-content-muted sm:col-span-3">
                        <span className="text-content-subtle">Reason</span>{' '}
                        <span className="text-content">“{row.deletion.reason}”</span>
                      </p>
                    </div>
                  )}
                </Card>
              </motion.div>
            );
          })}

          {listQuery.data?.meta && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
        </motion.div>
      )}

      {/* ── Breakdown ─────────────────────────────────────────────────────── */}
      {tab === 'LOG' && summaryQuery.data && summaryQuery.data.byDeleter.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Who has been deleting" subtitle="Within the current filters" />
          <ul className="space-y-2">
            {summaryQuery.data.byDeleter.map((entry) => (
              <li key={entry._id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-content">{entry._id || 'Unknown'}</span>
                <span className="shrink-0 tabular-nums text-content-muted">
                  {entry.count} deletion(s) · {entry.days} day(s) restored
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Confirm ───────────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        size="md"
        icon={<Trash2 className="h-5 w-5" />}
        title="Delete this leave record?"
        description={
          target
            ? `${target.leaveNumber} · ${target.employeeName} · ${target.totalDays} day(s) of ${target.leaveTypeName}`
            : ''
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} isLoading={remove.isPending}>
              Delete and restore
            </Button>
          </>
        }
      >
        {target && (
          <div className="space-y-4">
            <p className="rounded-xl bg-warning-500/10 p-3 text-sm text-warning-700 dark:text-warning-400">
              This record is <span className="font-semibold">{target.status.toLowerCase().replace('_', ' ')}</span>
              , so {restorePreview(target.status).text}
              {restorePreview(target.status).bucket !== 'NONE' && (
                <> — <span className="font-semibold">{target.totalDays} day(s)</span></>
              )}
              .
            </p>

            <Textarea
              label="Reason for deletion"
              required
              rows={3}
              maxLength={500}
              showCount
              placeholder="Why this record is being removed — kept permanently in the audit log"
              error={reasonError}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError('');
              }}
            />
          </div>
        )}
      </Modal>
    </motion.div>
  );
};

export default LeaveDeletion;
