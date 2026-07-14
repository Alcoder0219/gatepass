import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { gatePassApi } from '@/services/endpoints';
import { useGatePassFilters } from '@/hooks/useGatePassFilters';
import { PageHeader } from '@/components/common/PageHeader';
import { GatePassTable } from '@/components/gatepass/GatePassTable';
import { GatePassFilters } from '@/components/gatepass/GatePassFilters';
import { Button, type Column } from '@/components/ui';
import { formatSmartDateTime } from '@/utils/format';
import type { GatePass } from '@/types';

const ApprovedPasses = () => {
  const { filters, setFilter, setPage, reset, activeCount } = useGatePassFilters();

  /** The status is the identity of this screen — it is not a user-facing filter. */
  const query = { ...filters, status: 'APPROVED' };

  const { data, isLoading } = useQuery({
    queryKey: ['gate-passes', 'approved', query],
    queryFn: () => gatePassApi.list(query),
  });

  const approverColumn: Column<GatePass> = {
    key: 'approval',
    header: 'Approved by',
    hideBelow: 'lg',
    render: (row) => {
      const approver = row.approval?.approvedBy;
      const name =
        approver && typeof approver === 'object' ? approver.name : row.reportingManagerName;

      return (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-content">{name || '—'}</p>
          <p className="truncate text-xs text-content-muted">
            {formatSmartDateTime(row.approval?.approvedAt)}
          </p>
        </div>
      );
    },
  };

  return (
    <>
      <PageHeader
        icon={<CheckCircle2 className="h-5 w-5" />}
        title="Approved passes"
        subtitle="Cleared for the gate — waiting to be used, or already in flight."
        breadcrumbs={[{ label: 'Approvals' }, { label: 'Approved' }]}
      />

      <GatePassFilters
        filters={filters}
        onChange={setFilter}
        onReset={reset}
        activeCount={activeCount}
        hideStatus
      />

      <GatePassTable
        data={data?.items ?? []}
        isLoading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        sort={filters.sort}
        onSortChange={(sort) => setFilter({ sort })}
        basePath="/gate-passes"
        actionColumn={approverColumn}
        emptyTitle="No approved passes"
        emptyMessage={
          activeCount
            ? 'Nothing approved matches these filters.'
            : 'Passes appear here the moment they clear approval.'
        }
        emptyAction={
          activeCount ? (
            <Button variant="secondary" onClick={reset}>
              Clear filters
            </Button>
          ) : undefined
        }
      />
    </>
  );
};

export default ApprovedPasses;
