import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, Inbox, XCircle } from 'lucide-react';
import { gatePassApi } from '@/services/endpoints';
import { useGatePassFilters } from '@/hooks/useGatePassFilters';
import { useGatePassActions } from '@/hooks/useGatePassActions';
import { PageHeader } from '@/components/common/PageHeader';
import { GatePassTable } from '@/components/gatepass/GatePassTable';
import { GatePassFilters } from '@/components/gatepass/GatePassFilters';
import { Button, Card, Modal, Textarea, Tooltip, type Column } from '@/components/ui';
import { formatRelative } from '@/utils/format';
import type { GatePass } from '@/types';

const PendingApprovals = () => {
  const { filters, setFilter, setPage, reset, activeCount } = useGatePassFilters();
  const { approve, reject } = useGatePassActions();

  /** Rows the user just decided — hidden immediately, before the refetch lands. */
  const [resolved, setResolved] = useState<string[]>([]);
  const [rejecting, setRejecting] = useState<GatePass | null>(null);
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['gate-passes', 'pending-approval', filters],
    queryFn: () => gatePassApi.pendingApproval(filters),
  });

  const rows = useMemo(
    () => (data?.items ?? []).filter((row) => !resolved.includes(row._id)),
    [data?.items, resolved]
  );

  const waiting = data?.meta?.total ?? 0;

  /** The oldest request on this page — the one the queue is failing hardest. */
  const oldest = useMemo(
    () =>
      rows.reduce<GatePass | null>(
        (worst, row) =>
          !worst || new Date(row.createdAt) < new Date(worst.createdAt) ? row : worst,
        null
      ),
    [rows]
  );

  const decideApprove = (row: GatePass, element: HTMLElement) => {
    setResolved((current) => [...current, row._id]);
    approve.mutate(
      { id: row._id, origin: element },
      // Put it back if the server said no — an optimistic hide must be reversible.
      { onError: () => setResolved((current) => current.filter((id) => id !== row._id)) }
    );
  };

  const submitRejection = () => {
    if (!rejecting) return;
    const trimmed = comment.trim();
    if (trimmed.length < 5) {
      setCommentError('Write at least 5 characters — the employee will read this.');
      return;
    }

    const id = rejecting._id;
    setResolved((current) => [...current, id]);
    reject.mutate(
      { id, comment: trimmed },
      { onError: () => setResolved((current) => current.filter((item) => item !== id)) }
    );

    setRejecting(null);
    setComment('');
    setCommentError(null);
  };

  const actionColumn: Column<GatePass> = {
    key: 'actions',
    header: 'Decision',
    headerClassName: 'text-right',
    className: 'text-right',
    render: (row) => (
      <div className="flex items-center justify-end gap-1.5">
        <Tooltip content="Approve">
          <Button
            variant="success"
            size="xs"
            aria-label={`Approve ${row.gatePassNumber}`}
            leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
            onClick={(event) => {
              event.stopPropagation();
              decideApprove(row, event.currentTarget);
            }}
          >
            Approve
          </Button>
        </Tooltip>

        <Tooltip content="Reject with a reason">
          <Button
            variant="ghost"
            size="xs"
            aria-label={`Reject ${row.gatePassNumber}`}
            className="text-danger-500 hover:bg-danger-500/10"
            leftIcon={<XCircle className="h-3.5 w-3.5" />}
            onClick={(event) => {
              event.stopPropagation();
              setComment('');
              setCommentError(null);
              setRejecting(row);
            }}
          >
            Reject
          </Button>
        </Tooltip>
      </div>
    ),
  };

  return (
    <>
      <PageHeader
        icon={<Inbox className="h-5 w-5" />}
        title="Pending approvals"
        subtitle="Requests routed to you. Approving here does not take you off the page."
        breadcrumbs={[{ label: 'Approvals' }, { label: 'Pending' }]}
      />

      {/* Summary strip — the queue's health in one line. */}
      <Card className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" padding="sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-warning-500/15 text-warning-500">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums leading-none text-content">{waiting}</p>
            <p className="mt-1 text-sm text-content-muted">
              {waiting === 1 ? 'request is waiting' : 'requests are waiting'} on you
            </p>
          </div>
        </div>

        {oldest && (
          <div className="sm:text-right">
            <p className="text-2xs font-semibold uppercase tracking-wider text-content-subtle">
              Oldest request
            </p>
            <p className="mt-1 text-sm text-content">
              <span className="font-mono font-semibold">{oldest.gatePassNumber}</span>
              <span className="text-content-muted"> · raised {formatRelative(oldest.createdAt)}</span>
            </p>
          </div>
        )}
      </Card>

      <GatePassFilters
        filters={filters}
        onChange={setFilter}
        onReset={reset}
        activeCount={activeCount}
        hideStatus
      />

      <GatePassTable
        data={rows}
        isLoading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        sort={filters.sort}
        onSortChange={(sort) => setFilter({ sort })}
        basePath="/approvals"
        actionColumn={actionColumn}
        emptyTitle="Your queue is clear"
        emptyMessage="Nothing is waiting on your decision right now."
      />

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Reject this gate pass"
        description={`${rejecting?.employeeName ?? 'The employee'} only sees the comment you write here.`}
        dismissible={!reject.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)} disabled={reject.isPending}>
              Cancel
            </Button>
            <Button variant="danger" isLoading={reject.isPending} onClick={submitRejection}>
              Reject
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason for rejection"
          required
          showCount
          maxLength={1000}
          value={comment}
          onChange={(event) => {
            setComment(event.target.value);
            setCommentError(null);
          }}
          placeholder="Explain what is wrong, so they can fix it or plan around it…"
          error={commentError ?? undefined}
        />
      </Modal>
    </>
  );
};

export default PendingApprovals;
