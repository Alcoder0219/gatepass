import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { FileDown, FileSpreadsheet, FileText, Printer } from 'lucide-react';

import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Select,
  TableSkeleton,
  type SelectOption,
} from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { Can } from '@/permissions/Can';
import { PERMISSION } from '@/permissions/constants';
import { BarChart, DonutChart, LineChart, toBars, CHART_HEIGHT } from '@/components/leave/reportCharts';
import { leaveReportApi, leaveTypeApi, leaveAllocationApi } from '@/services/leave.endpoints';
import { departmentApi, unitApi } from '@/services/endpoints';
import { errorMessage } from '@/services/api';
import { formatDateTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import { pageVariants, staggerContainer, staggerItem } from '@/animations/variants';
import type { LeaveType, ReportKey } from '@/types/leave';

const ALL = 'ALL';

const LeaveReports = () => {
  const [key, setKey] = useState<ReportKey>('BALANCE');
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    leaveType: ALL,
    unit: ALL,
    department: ALL,
    leaveYear: '',
  });
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: catalogue = [] } = useQuery({
    queryKey: ['leave', 'reports', 'catalogue'],
    queryFn: leaveReportApi.catalogue,
  });

  const { data: years } = useQuery({
    queryKey: ['leave', 'allocations', 'years'],
    queryFn: leaveAllocationApi.years,
  });
  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['leave', 'types', 'lookup'],
    queryFn: leaveTypeApi.lookup,
  });
  const { data: units = [] } = useQuery({ queryKey: ['units', 'lookup'], queryFn: unitApi.lookup });
  const { data: departments = [] } = useQuery({
    queryKey: ['departments', 'lookup', filters.unit],
    queryFn: () => departmentApi.lookup(filters.unit === ALL ? undefined : filters.unit),
  });

  const query = useMemo(
    () => ({
      from: filters.from || undefined,
      to: filters.to || undefined,
      leaveType: filters.leaveType === ALL ? undefined : filters.leaveType,
      unit: filters.unit === ALL ? undefined : filters.unit,
      department: filters.department === ALL ? undefined : filters.department,
      leaveYear: filters.leaveYear || undefined,
    }),
    [filters]
  );

  const reportQuery = useQuery({
    queryKey: ['leave', 'reports', key, query],
    queryFn: () => leaveReportApi.run(key, query),
  });

  const report = reportQuery.data;

  const download = async (format: 'xlsx' | 'csv' | 'pdf') => {
    setDownloading(format);
    try {
      await leaveReportApi.download(key, format, query);
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch (error) {
      toast.error(errorMessage(error, 'Export failed'));
    } finally {
      setDownloading(null);
    }
  };

  const opt = (rows: { _id: string; name: string; code?: string }[], allLabel: string): SelectOption[] => [
    { value: ALL, label: allLabel },
    ...rows.map((row) => ({ value: row._id, label: row.code ? `${row.code} — ${row.name}` : row.name })),
  ];

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate">
      {/* `print:hidden` keeps the chrome off the printed page — the table and
          charts are all that should reach paper. */}
      <div className="print:hidden">
        <PageHeader
          title="Leave Reports"
          subtitle="Ten views over the leave data, with Excel, PDF and print output."
          icon={<FileSpreadsheet className="h-5 w-5" />}
          breadcrumbs={[{ label: 'Leave Management' }, { label: 'Leave Reports' }]}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
                Print
              </Button>
              <Can do={PERMISSION.LEAVE_REPORTS_EXPORT}>
                <Button
                  variant="secondary"
                  leftIcon={<FileText className="h-4 w-4" />}
                  isLoading={downloading === 'pdf'}
                  onClick={() => void download('pdf')}
                >
                  PDF
                </Button>
                <Button
                  leftIcon={<FileDown className="h-4 w-4" />}
                  isLoading={downloading === 'xlsx'}
                  onClick={() => void download('xlsx')}
                >
                  Excel
                </Button>
              </Can>
            </div>
          }
        />

        {/* ── Report picker ───────────────────────────────────────────────── */}
        <div className="mb-6 flex flex-wrap gap-2">
          {catalogue.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setKey(entry.key)}
              className={cn(
                'rounded-xl px-3.5 py-2 text-sm font-medium transition-colors',
                key === entry.key
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-content/5 text-content-muted hover:text-content'
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {/* ── Filters ─────────────────────────────────────────────────────── */}
        <Card padding="sm" className="mb-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Input
              label="From"
              type="date"
              value={filters.from}
              onChange={(event) => setFilters({ ...filters, from: event.target.value })}
            />
            <Input
              label="To"
              type="date"
              value={filters.to}
              onChange={(event) => setFilters({ ...filters, to: event.target.value })}
            />
            <Select
              label="Leave year"
              options={[
                { value: '', label: 'Current' },
                ...(years?.years ?? []).map((y) => ({ value: y, label: y })),
              ]}
              value={filters.leaveYear}
              onChange={(event) => setFilters({ ...filters, leaveYear: event.target.value })}
            />
            <Select
              label="Leave type"
              options={opt(
                leaveTypes.map((t: LeaveType) => ({ _id: t._id, name: t.name, code: t.code })),
                'All types'
              )}
              value={filters.leaveType}
              onChange={(event) => setFilters({ ...filters, leaveType: event.target.value })}
            />
            <Select
              label="Company"
              options={opt(units, 'All companies')}
              value={filters.unit}
              onChange={(event) => setFilters({ ...filters, unit: event.target.value, department: ALL })}
            />
            <Select
              label="Department"
              options={opt(departments, 'All departments')}
              value={filters.department}
              onChange={(event) => setFilters({ ...filters, department: event.target.value })}
            />
          </div>
        </Card>
      </div>

      {reportQuery.isPending ? (
        <TableSkeleton rows={8} />
      ) : !report ? (
        <EmptyState title="Could not generate the report" message="Adjust the filters and try again." />
      ) : (
        <div className="space-y-6">
          {/* ── Summary ───────────────────────────────────────────────────── */}
          <Card>
            <CardHeader
              title={report.title}
              subtitle={`${report.rows.length} row(s) · generated ${formatDateTime(report.generatedAt)}`}
            />
            <motion.div
              variants={staggerContainer(0.04)}
              initial="initial"
              animate="animate"
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              {Object.entries(report.summary).map(([label, value]) => (
                <motion.div key={label} variants={staggerItem} className="rounded-2xl bg-content/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                    {label.replace(/([A-Z])/g, ' $1')}
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-content">
                    {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </Card>

          {/* ── Charts ────────────────────────────────────────────────────── */}
          {report.charts.length > 0 && (
            <div className={cn('grid gap-6', report.charts.length > 1 ? 'xl:grid-cols-2' : '')}>
              {report.charts.map((chart) => (
                <Card key={chart.title}>
                  <CardHeader title={chart.title} />
                  {chart.data.length === 0 ? (
                    <p className="py-8 text-center text-sm text-content-muted">No data in this range.</p>
                  ) : chart.type === 'donut' ? (
                    <DonutChart data={chart.data} height={CHART_HEIGHT} />
                  ) : chart.type === 'line' ? (
                    <LineChart data={chart.data} height={CHART_HEIGHT} />
                  ) : (
                    <BarChart data={toBars(chart.data)} height={CHART_HEIGHT} />
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* ── Table ─────────────────────────────────────────────────────── */}
          <Card padding="none">
            {report.rows.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No rows"
                  message="Nothing matches these filters. Widen the date range or clear a filter."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      {report.columns.map((col) => (
                        <th
                          key={col.key}
                          className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-content-muted"
                        >
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row, index) => (
                      <tr
                        key={index}
                        className={cn('border-b border-line/60 last:border-0', index % 2 && 'bg-content/[0.03]')}
                      >
                        {report.columns.map((col) => (
                          <td key={col.key} className="whitespace-nowrap px-4 py-2.5 text-content">
                            {row[col.key] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </motion.div>
  );
};

export default LeaveReports;
