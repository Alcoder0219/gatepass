import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus, XCircle } from 'lucide-react';
import { gatePassApi } from '@/services/endpoints';
import { useGatePassFilters } from '@/hooks/useGatePassFilters';
import { useGatePassActions } from '@/hooks/useGatePassActions';
import { PageHeader } from '@/components/common/PageHeader';
import { GatePassTable } from '@/components/gatepass/GatePassTable';
import { GatePassFilters } from '@/components/gatepass/GatePassFilters';
import { Button, ConfirmDialog, Tabs, type Column, type TabItem } from '@/components/ui';
import type { GatePass, GatePassStatus } from '@/types';

/** The stats endpoint answers `{ total, byStatus }`; the client type is looser. */
interface StatsShape {
  total: number;
  byStatus: Record<GatePassStatus, number>;
}

const CANCELLABLE: GatePassStatus[] = ['PENDING', 'CHANGES_REQUESTED'];

const TABS: { value: string; label: string; status?: GatePassStatus }[] = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending', status: 'PENDING' },
  { value: 'APPROVED', label: 'Approved', status: 'APPROVED' },
  { value: 'COMPLETED', label: 'Completed', status: 'COMPLETED' },
  { value: 'REJECTED', label: 'Rejected', status: 'REJECTED' },
];

const MyGatePasses = () => {
  const { filters, setFilter, setPage, reset, activeCount } = useGatePassFilters();
  const { cancel } = useGatePassActions();
  const [cancelling, setCancelling] = useState<GatePass | null>(null);

  const activeTab = typeof filters.status === 'string' ? filters.status : '';

  const { data, isLoading } = useQuery({
    queryKey: ['gate-passes', 'mine', filters],
    queryFn: () => gatePassApi.mine(filters),
  });

  const { data: stats } = useQuery({
    queryKey: ['gate-passes', 'stats', 'mine'],
    queryFn: gatePassApi.stats,
  });

  const counts = stats as unknown as StatsShape | undefined;

  const tabs: TabItem[] = TABS.map((tab) => ({
    value: tab.value,
    label: tab.label,
    count: tab.status ? (counts?.byStatus?.[tab.status] ?? 0) : (counts?.total ?? 0),
  }));

  /** Cancel lives on the row so an employee can withdraw without opening the pass. */
  const actionColumn: Column<GatePass> = {
    key: 'actions',
    header: '',
    headerClassName: 'w-px',
    render: (row) =>
      CANCELLABLE.includes(row.status) ? (
        <Button
          variant="ghost"
          size="xs"
          leftIcon={<XCircle className="h-3.5 w-3.5" />}
          onClick={(event) => {
            event.stopPropagation();
            setCancelling(row);
          }}
        >
          Cancel
        </Button>
      ) : null,
  };

  return (
    <>
      <PageHeader
        icon={<FileText className="h-5 w-5" />}
        title="My gate passes"
        subtitle="Everything you've raised, and where each one stands."
        breadcrumbs={[{ label: 'Gate passes' }, { label: 'Mine' }]}
        actions={
          <Link to="/gate-pass/new">
            <Button leftIcon={<Plus className="h-4 w-4" />}>New gate pass</Button>
          </Link>
        }
      />

      <Tabs
        tabs={tabs}
        value={activeTab}
        onChange={(value) => setFilter({ status: value })}
        layoutId="my-gate-pass-tab"
        className="mb-5"
      />

      <GatePassFilters
        filters={filters}
        onChange={setFilter}
        onReset={reset}
        activeCount={activeCount}
        hideStatus={Boolean(activeTab)}
      />

      <GatePassTable
        data={data?.items ?? []}
        isLoading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        sort={filters.sort}
        onSortChange={(sort) => setFilter({ sort })}
        basePath="/my-gate-pass"
        hideEmployee
        actionColumn={actionColumn}
        emptyTitle={activeCount ? 'Nothing matches these filters' : 'No gate passes yet'}
        emptyMessage={
          activeCount
            ? 'Try clearing a filter or two.'
            : 'When you raise a gate pass it will show up here, with its approval trail.'
        }
        emptyAction={
          activeCount ? (
            <Button variant="secondary" onClick={reset}>
              Clear filters
            </Button>
          ) : (
            <Link to="/gate-pass/new">
              <Button leftIcon={<Plus className="h-4 w-4" />}>Raise your first gate pass</Button>
            </Link>
          )
        }
      />

      <ConfirmDialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          if (!cancelling) return;
          await cancel.mutateAsync({ id: cancelling._id }).catch(() => undefined);
          setCancelling(null);
        }}
        isLoading={cancel.isPending}
        tone="danger"
        title="Cancel this gate pass?"
        confirmLabel="Yes, cancel it"
        cancelLabel="Keep it"
        message={
          <>
            <span className="font-mono font-semibold text-content">{cancelling?.gatePassNumber}</span>{' '}
            will be withdrawn and your manager will no longer see it in their queue. This cannot be
            undone — you would have to raise a new pass.
          </>
        }
      />
    </>
  );
};

export default MyGatePasses;
