import { useQuery } from '@tanstack/react-query';
import { XCircle } from 'lucide-react';
import { gatePassApi } from '@/services/endpoints';
import { useGatePassFilters } from '@/hooks/useGatePassFilters';
import { PageHeader } from '@/components/common/PageHeader';
import { GatePassTable } from '@/components/gatepass/GatePassTable';
import { GatePassFilters } from '@/components/gatepass/GatePassFilters';
import { Button, type Column } from '@/components/ui';
import { formatSmartDateTime } from '@/utils/format';
import type { GatePass } from '@/types';

const RejectedPasses = () => {
  const { filters, setFilter, setPage, reset, activeCount } = useGatePassFilters();

  const query = { ...filters, status: 'REJECTED' };

  const { data, isLoading } = useQuery({
    queryKey: ['gate-passes', 'rejected', query],
    queryFn: () => gatePassApi.list(query),
  });

  /** A rejection is only useful if you can see WHY, without opening the row. */
  const rejectionColumn: Column<GatePass> = {
    key: 'rejection',
    header: 'Rejected by / reason',
    className: 'max-w-[280px]',
    render: (row) => {
      const rejecter = row.approval?.rejectedBy;
      const by =
        rejecter && typeof rejecter === 'object' ? rejecter.name : row.reportingManagerName;

      return (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-content">{by || '—'}</p>
          <p className="truncate text-xs text-content-subtle">
            {formatSmartDateTime(row.approval?.rejectedAt)}
          </p>
          {row.approval?.comment && (
            <p
              className="mt-1 line-clamp-2 border-l-2 border-danger-500/40 pl-2 text-xs italic text-content-muted"
              title={row.approval.comment}
            >
              “{row.approval.comment}”
            </p>
          )}
        </div>
      );
    },
  };

  return (
    <>
      <PageHeader
        icon={<XCircle className="h-5 w-5" />}
        title="Rejected passes"
        subtitle="Turned down, and the reason each employee was given."
        breadcrumbs={[{ label: 'Approvals' }, { label: 'Rejected' }]}
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
        actionColumn={rejectionColumn}
        emptyTitle="Nothing has been rejected"
        emptyMessage={
          activeCount
            ? 'No rejected passes match these filters.'
            : 'Rejected passes land here, together with the comment the employee was given.'
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

export default RejectedPasses;
