import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  AlarmClock,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Files,
  Hourglass,
  Layers,
  Printer,
  Timer,
} from 'lucide-react';
import { reportApi } from '@/services/endpoints';
import { errorMessage } from '@/services/api';
import { useGatePassFilters } from '@/hooks/useGatePassFilters';
import { GatePassFilters } from '@/components/gatepass/GatePassFilters';
import { GatePassTable } from '@/components/gatepass/GatePassTable';
import { PageHeader } from '@/components/common/PageHeader';
import { Button, Card, CardHeader, ChartSkeleton, Dropdown, StatCard, StatCardSkeleton } from '@/components/ui';
import { BarChart, DonutChart, toBars, toStatusSlices, type BarDatum, type DonutDatum } from '@/components/charts';
import { Can } from '@/permissions/Can';
import { PERMISSION } from '@/permissions/constants';
import { pageVariants, staggerContainer } from '@/animations/variants';
import { formatDuration } from '@/utils/format';
import type { GatePass, GatePassStatus } from '@/types';

type ExportFormat = 'xlsx' | 'csv' | 'pdf';

/** The summary endpoint is an open record — read it defensively, never with `any`. */
const readNumber = (source: Record<string, unknown> | undefined, ...keys: string[]): number => {
  if (!source) return 0;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return 0;
};

/** Pulls an aggregate series out of the summary when the backend supplies one. */
const readSeries = (
  source: Record<string, unknown> | undefined,
  ...keys: string[]
): Record<string, unknown>[] => {
  if (!source) return [];
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
    }
  }
  return [];
};

const countBy = <T,>(rows: T[], pick: (row: T) => string) => {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = pick(row);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].map(([name, count]) => ({ name, count }));
};

/* ─── Page ───────────────────────────────────────────────────────────────── */
const Reports = () => {
  const { filters, setFilter, setPage, reset, activeCount } = useGatePassFilters();
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['reports', 'summary', filters],
    queryFn: () => reportApi.summary(filters),
  });

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['reports', 'gate-passes', filters],
    queryFn: () => reportApi.gatePasses(filters),
    placeholderData: (previous) => previous,
  });

  const rows: GatePass[] = report?.items ?? [];

  const stats = useMemo(
    () => ({
      total: readNumber(summary, 'total', 'totalPasses', 'count') || (report?.meta.total ?? 0),
      approvalMinutes: readNumber(summary, 'avgApprovalMinutes', 'averageApprovalMinutes'),
      outsideMinutes: readNumber(
        summary,
        'avgTimeOutsideMinutes',
        'avgOutsideMinutes',
        'averageTimeOutside'
      ),
      lateRate: Math.round(readNumber(summary, 'lateReturnRate', 'latePercentage') * 10) / 10,
    }),
    [summary, report]
  );

  /* Charts prefer the server's aggregates; if the summary doesn't carry them,
   * they fall back to the rows on screen — which is honest, because that is
   * exactly what the filters returned. */
  const statusSlices = useMemo<DonutDatum[]>(() => {
    const series = readSeries(summary, 'byStatus', 'statusBreakdown');

    if (series.length) {
      return toStatusSlices(
        series.map((row) => ({
          status: String(row.status ?? row._id ?? 'DRAFT'),
          count: readNumber(row, 'count', 'total'),
        }))
      );
    }

    return toStatusSlices(
      countBy(rows, (row) => row.status).map((entry) => ({
        status: entry.name as GatePassStatus,
        count: entry.count,
      }))
    );
  }, [summary, rows]);

  const departmentBars = useMemo<BarDatum[]>(() => {
    const series = readSeries(summary, 'byDepartment', 'departmentBreakdown');

    if (series.length) {
      return toBars(
        series.map((row) => ({
          name: String(row.name ?? row._id ?? '—'),
          count: readNumber(row, 'count', 'total'),
        }))
      );
    }

    return toBars(countBy(rows, (row) => row.departmentName || '—'));
  }, [summary, rows]);

  const runExport = async (format: ExportFormat) => {
    setExporting(format);
    const label = format === 'xlsx' ? 'Excel' : format.toUpperCase();

    try {
      await reportApi.export(format, filters);
      toast.success(`${label} report downloaded`);
    } catch (error) {
      toast.error(errorMessage(error, `Could not generate the ${label} report`));
    } finally {
      setExporting(null);
    }
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate">
      <PageHeader
        className="no-print"
        title="Reports"
        subtitle="Slice the gate pass ledger, then take it with you"
        icon={<Files className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Reports' }]}
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<Printer className="h-4 w-4" />}
              onClick={() => window.print()}
            >
              Print
            </Button>

            <Can do={PERMISSION.REPORTS_EXPORT}>
              <Dropdown
                trigger={
                  <Button
                    isLoading={exporting !== null}
                    leftIcon={<Download className="h-4 w-4" />}
                    rightIcon={<ChevronDown className="h-4 w-4" />}
                  >
                    {exporting ? 'Exporting…' : 'Export'}
                  </Button>
                }
                items={[
                  {
                    label: 'Excel (.xlsx)',
                    icon: <FileSpreadsheet className="h-4 w-4" />,
                    disabled: exporting !== null,
                    onClick: () => void runExport('xlsx'),
                  },
                  {
                    label: 'CSV (.csv)',
                    icon: <Layers className="h-4 w-4" />,
                    disabled: exporting !== null,
                    onClick: () => void runExport('csv'),
                  },
                  {
                    label: 'PDF (.pdf)',
                    icon: <FileText className="h-4 w-4" />,
                    disabled: exporting !== null,
                    onClick: () => void runExport('pdf'),
                  },
                ]}
              />
            </Can>
          </>
        }
      />

      <div className="no-print">
        <GatePassFilters
          filters={filters}
          onChange={setFilter}
          onReset={reset}
          activeCount={activeCount}
        />
      </div>

      <div className="print-page space-y-6">
        {/* ── Summary strip ───────────────────────────────────────────────── */}
        {summaryLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <StatCardSkeleton key={index} />
            ))}
          </div>
        ) : (
          <motion.div
            variants={staggerContainer(0.05)}
            initial="initial"
            animate="animate"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <StatCard
              label="Total passes"
              value={stats.total}
              icon={<Files className="h-5 w-5" />}
              tone="brand"
              hint={activeCount > 0 ? 'Matching these filters' : 'All time'}
            />
            <StatCard
              label="Avg approval"
              value={Math.round(stats.approvalMinutes)}
              icon={<Hourglass className="h-5 w-5" />}
              tone="accent"
              hint={formatDuration(stats.approvalMinutes)}
            />
            <StatCard
              label="Avg time outside"
              value={Math.round(stats.outsideMinutes)}
              icon={<Timer className="h-5 w-5" />}
              tone="info"
              hint={formatDuration(stats.outsideMinutes)}
            />
            <StatCard
              label="Late-return rate"
              value={Math.round(stats.lateRate)}
              icon={<AlarmClock className="h-5 w-5" />}
              tone={stats.lateRate >= 10 ? 'danger' : 'success'}
              hint="% of passes returned late"
            />
          </motion.div>
        )}

        {/* ── Charts ──────────────────────────────────────────────────────── */}
        {summaryLoading || reportLoading ? (
          <div className="grid gap-6 xl:grid-cols-2">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Status mix" subtitle="Across the current filter" />
              <DonutChart data={statusSlices} height={260} centreLabel="Passes" />
            </Card>

            <Card>
              <CardHeader title="By department" subtitle="Across the current filter" />
              <BarChart data={departmentBars} orientation="horizontal" height={260} />
            </Card>
          </div>
        )}

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <GatePassTable
          data={rows}
          isLoading={reportLoading}
          meta={report?.meta}
          onPageChange={setPage}
          sort={filters.sort}
          onSortChange={(sort) => setFilter({ sort })}
          emptyTitle="No rows in this report"
          emptyMessage="Widen the filters — nothing matches the current selection."
        />
      </div>
    </motion.div>
  );
};

export default Reports;
