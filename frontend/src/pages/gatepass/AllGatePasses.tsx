import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Download, LayoutList } from 'lucide-react';
import { gatePassApi, reportApi } from '@/services/endpoints';
import { errorMessage } from '@/services/api';
import { useGatePassFilters } from '@/hooks/useGatePassFilters';
import { PageHeader } from '@/components/common/PageHeader';
import { GatePassTable } from '@/components/gatepass/GatePassTable';
import { GatePassFilters } from '@/components/gatepass/GatePassFilters';
import { Button, Tabs, type TabItem } from '@/components/ui';
import { Can } from '@/permissions/Can';
import { PERMISSION } from '@/permissions/constants';
import type { GatePassStatus } from '@/types';

interface StatsShape {
  total: number;
  byStatus: Record<GatePassStatus, number>;
}

const TABS: { value: string; label: string; status?: GatePassStatus }[] = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending', status: 'PENDING' },
  { value: 'HR_REVIEW', label: 'HR review', status: 'HR_REVIEW' },
  { value: 'APPROVED', label: 'Approved', status: 'APPROVED' },
  { value: 'OUT', label: 'Out', status: 'OUT' },
  { value: 'COMPLETED', label: 'Completed', status: 'COMPLETED' },
  { value: 'REJECTED', label: 'Rejected', status: 'REJECTED' },
];

const AllGatePasses = () => {
  const { filters, setFilter, setPage, reset, activeCount } = useGatePassFilters();
  const [exporting, setExporting] = useState(false);

  const activeTab = typeof filters.status === 'string' ? filters.status : '';

  const { data, isLoading } = useQuery({
    queryKey: ['gate-passes', 'list', filters],
    queryFn: () => gatePassApi.list(filters),
  });

  const { data: stats } = useQuery({
    queryKey: ['gate-passes', 'stats', 'all'],
    queryFn: gatePassApi.stats,
  });

  const counts = stats as unknown as StatsShape | undefined;

  const tabs: TabItem[] = TABS.map((tab) => ({
    value: tab.value,
    label: tab.label,
    count: tab.status ? (counts?.byStatus?.[tab.status] ?? 0) : (counts?.total ?? 0),
  }));

  /** Exports exactly what is on screen — the same filters, not the whole table. */
  const exportRows = async () => {
    setExporting(true);
    try {
      await reportApi.export('xlsx', filters);
      toast.success('Export downloaded');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        icon={<LayoutList className="h-5 w-5" />}
        title="All gate passes"
        subtitle="Every pass you're allowed to see, across the organisation."
        breadcrumbs={[{ label: 'Gate passes' }, { label: 'All' }]}
        actions={
          <Can do={PERMISSION.GATEPASS_EXPORT}>
            <Button
              variant="secondary"
              onClick={() => void exportRows()}
              isLoading={exporting}
              leftIcon={<Download className="h-4 w-4" />}
            >
              Export
            </Button>
          </Can>
        }
      />

      <Tabs
        tabs={tabs}
        value={activeTab}
        onChange={(value) => setFilter({ status: value })}
        layoutId="all-gate-pass-tab"
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
        basePath="/gate-passes"
        emptyTitle="No gate passes found"
        emptyMessage={
          activeCount
            ? 'Nothing matches these filters. Try widening the date range.'
            : 'Once employees start raising passes they will appear here.'
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

export default AllGatePasses;
