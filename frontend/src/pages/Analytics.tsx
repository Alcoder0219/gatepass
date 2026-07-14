import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCheck,
  GitCompareArrows,
  Hourglass,
  Percent,
  Timer,
} from 'lucide-react';
import { dashboardApi, reportApi } from '@/services/endpoints';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardHeader, ChartSkeleton, StatCardSkeleton, Switch, Tabs } from '@/components/ui';
import {
  AreaTrendChart,
  BarChart,
  ChartLegend,
  DonutChart,
  StackedBarChart,
  toBars,
  toStatusSlices,
  type TrendPoint,
} from '@/components/charts';
import { TYPE_META } from '@/permissions/constants';
import { pageVariants, staggerContainer, staggerItem } from '@/animations/variants';
import { formatDuration, formatNumber } from '@/utils/format';
import { cn } from '@/utils/cn';

const PERIODS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
];

/** The reports summary is an open record — read it defensively, never with `any`. */
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

const isoDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

/* ─── KPI tile ───────────────────────────────────────────────────────────── */
const KpiTile = ({
  label,
  value,
  hint,
  icon,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  /** Percentage change vs. the previous period — only shown in comparison mode. */
  delta?: number;
}) => {
  const positive = (delta ?? 0) >= 0;

  return (
    <motion.div variants={staggerItem} className="card card-hover p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wider text-content-muted">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-content">{value}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {delta !== undefined && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold',
                  positive
                    ? 'bg-success-500/15 text-success-600 dark:text-success-400'
                    : 'bg-danger-500/15 text-danger-600 dark:text-danger-400'
                )}
              >
                {positive ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {Math.abs(delta)}%
              </span>
            )}
            {hint && <span className="truncate text-xs text-content-subtle">{hint}</span>}
          </div>
        </div>

        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand-600 dark:text-brand-300">
          {icon}
        </div>
      </div>
    </motion.div>
  );
};

/* ─── Page ───────────────────────────────────────────────────────────────── */
const Analytics = () => {
  const [period, setPeriod] = useState('30');
  const [compare, setCompare] = useState(false);

  const days = Number(period);

  const { data: charts, isLoading: chartsLoading } = useQuery({
    queryKey: ['dashboard', 'charts', days],
    queryFn: () => dashboardApi.charts(days),
  });

  /* Comparison mode pulls a double-length window and splits it in half, so the
   * previous period is aligned bucket-for-bucket with the current one. */
  const { data: extended, isLoading: extendedLoading } = useQuery({
    queryKey: ['dashboard', 'charts', days * 2],
    queryFn: () => dashboardApi.charts(days * 2),
    enabled: compare,
  });

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['reports', 'summary', { from: isoDaysAgo(days) }],
    queryFn: () => reportApi.summary({ from: isoDaysAgo(days) }),
  });

  const trend = useMemo<TrendPoint[]>(() => charts?.monthlyTrend ?? [], [charts]);

  const comparedTrend = useMemo<TrendPoint[]>(() => {
    if (!compare || !extended?.monthlyTrend.length || !trend.length) return trend;

    const previous = extended.monthlyTrend.slice(
      0,
      Math.max(0, extended.monthlyTrend.length - trend.length)
    );

    return trend.map((point, index) => {
      const offset = previous.length - trend.length + index;
      const match = offset >= 0 ? previous[offset] : undefined;
      return { ...point, previous: match?.total ?? 0 };
    });
  }, [compare, extended, trend]);

  const totals = useMemo(() => {
    const official = trend.reduce((sum, point) => sum + point.official, 0);
    const personal = trend.reduce((sum, point) => sum + point.personal, 0);
    const current = trend.reduce((sum, point) => sum + (point.total ?? point.official + point.personal), 0);

    const previous = comparedTrend.reduce(
      (sum, point) => sum + (typeof point.previous === 'number' ? point.previous : 0),
      0
    );

    return { official, personal, current, previous };
  }, [trend, comparedTrend]);

  const volumeDelta =
    compare && totals.previous > 0
      ? Math.round(((totals.current - totals.previous) / totals.previous) * 1000) / 10
      : undefined;

  /* KPIs derived from the reports summary — every read has a fallback so a
   * missing key degrades to 0 instead of NaN. */
  const kpis = useMemo(() => {
    const total = readNumber(summary, 'total', 'totalPasses', 'count');
    const completed = readNumber(summary, 'completed', 'completedCount');
    const lateReturns = readNumber(summary, 'lateReturns', 'lateReturnCount', 'late');

    return {
      approvalMinutes: readNumber(summary, 'avgApprovalMinutes', 'averageApprovalMinutes'),
      outsideMinutes: readNumber(summary, 'avgTimeOutsideMinutes', 'avgOutsideMinutes', 'averageTimeOutside'),
      lateRate:
        readNumber(summary, 'lateReturnRate') || percent(lateReturns, completed || total),
      completionRate: readNumber(summary, 'completionRate') || percent(completed, total),
      total,
    };
  }, [summary]);

  const officialShare = percent(totals.official, totals.official + totals.personal);

  const statusSlices = useMemo(() => toStatusSlices(charts?.byStatus ?? []), [charts]);
  const departmentBars = useMemo(() => toBars(charts?.byDepartment ?? [], 10), [charts]);
  const unitBars = useMemo(() => toBars(charts?.byUnit ?? [], 8), [charts]);

  const isLoading = chartsLoading || (compare && extendedLoading);

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate">
      <PageHeader
        title="Analytics"
        subtitle="How gate passes actually flow — volume, approvers and turnaround"
        icon={<BarChart3 className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Analytics' }]}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-content-muted">
              <GitCompareArrows className="h-4 w-4" />
              <span className="hidden sm:inline">Compare</span>
              <Switch checked={compare} onChange={setCompare} />
            </div>
            <Tabs tabs={PERIODS} value={period} onChange={setPeriod} layoutId="analytics-period" />
          </div>
        }
      />

      <div className="space-y-6">
        {/* ── KPIs ────────────────────────────────────────────────────────── */}
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
            <KpiTile
              label="Avg approval turnaround"
              value={formatDuration(kpis.approvalMinutes)}
              hint="Submitted → decided"
              icon={<Hourglass className="h-5 w-5" />}
            />
            <KpiTile
              label="Late-return rate"
              value={`${kpis.lateRate}%`}
              hint="Returned after the expected time"
              icon={<Timer className="h-5 w-5" />}
            />
            <KpiTile
              label="Completion rate"
              value={`${kpis.completionRate}%`}
              hint={`${formatNumber(kpis.total)} passes in range`}
              icon={<CheckCheck className="h-5 w-5" />}
            />
            <KpiTile
              label="Official vs personal"
              value={`${officialShare}% / ${Math.round((100 - officialShare) * 10) / 10}%`}
              hint={`${formatNumber(totals.official)} official · ${formatNumber(totals.personal)} personal`}
              icon={<Percent className="h-5 w-5" />}
              delta={volumeDelta}
            />
          </motion.div>
        )}

        {/* ── Charts ──────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="grid gap-6 xl:grid-cols-3">
            <ChartSkeleton className="xl:col-span-2" />
            <ChartSkeleton />
            <ChartSkeleton className="xl:col-span-3" />
          </div>
        ) : (
          <motion.div
            variants={staggerContainer(0.08)}
            initial="initial"
            animate="animate"
            className="space-y-6"
          >
            <div className="grid gap-6 xl:grid-cols-3">
              <Card animated className="xl:col-span-2">
                <CardHeader
                  title="Volume trend"
                  subtitle={
                    compare
                      ? `Last ${days} days against the ${days} before them`
                      : `Official vs personal over the last ${days} days`
                  }
                  action={
                    <ChartLegend
                      items={[
                        { name: 'Official', color: TYPE_META.OFFICIAL.color },
                        { name: 'Personal', color: TYPE_META.PERSONAL.color },
                      ]}
                    />
                  }
                />
                <AreaTrendChart
                  data={comparedTrend}
                  height={320}
                  comparison={compare ? { key: 'previous', name: 'Previous period' } : undefined}
                />
              </Card>

              <Card animated>
                <CardHeader title="Status mix" subtitle="Where the passes ended up" />
                <DonutChart data={statusSlices} height={260} centreLabel="Passes" />
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card animated>
                <CardHeader title="By department" subtitle="Top requesting departments" />
                <BarChart data={departmentBars} orientation="horizontal" height={340} />
              </Card>

              <Card animated>
                <CardHeader title="By unit" subtitle="Volume across the plants" />
                <BarChart data={unitBars} height={340} />
              </Card>
            </div>

            <Card animated>
              <CardHeader
                title="Manager-wise decisions"
                subtitle="Approved, pending and rejected per approver"
              />
              <StackedBarChart data={charts?.byManager ?? []} height={340} />
            </Card>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default Analytics;
