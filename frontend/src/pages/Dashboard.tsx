import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  DoorOpen,
  Gauge,
  PackageCheck,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { dashboardApi, gatePassApi } from '@/services/endpoints';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/permissions/usePermissions';
import { PERMISSION } from '@/permissions/constants';
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  ChartSkeleton,
  ListSkeleton,
  ProgressRing,
  StatCard,
  StatCardSkeleton,
} from '@/components/ui';
import { AreaTrendChart, BarChart, DonutChart, toBars, toStatusSlices } from '@/components/charts';
import { pageVariants, staggerContainer, staggerItem } from '@/animations/variants';
import { formatDate, formatRelative, humanise } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { Insight } from '@/types';

/* ─── Greeting ───────────────────────────────────────────────────────────── */
const greetingFor = (hour: number) => {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const SUBTITLE_BY_ROLE: Record<string, string> = {
  SUPER_ADMIN: "Here's everything moving through the gate today.",
  ADMIN: "Here's everything moving through the gate today.",
  HOD: "Here's what your department needs from you today.",
  HR: "Here's the queue waiting on an HR review.",
  SECURITY: "Here's who is expected at the gate today.",
  EMPLOYEE: "Here's where your gate passes stand today.",
};

/* ─── AI insights ────────────────────────────────────────────────────────── */
const SENTIMENT = {
  positive: { icon: TrendingUp, wrap: 'bg-success-500/15 text-success-500', ring: 'ring-success-500/20' },
  warning: { icon: TriangleAlert, wrap: 'bg-warning-500/15 text-warning-500', ring: 'ring-warning-500/20' },
  neutral: { icon: Sparkles, wrap: 'bg-brand-500/15 text-brand-500', ring: 'ring-brand-500/20' },
} as const;

const InsightCard = ({ insight }: { insight: Insight }) => {
  const tone = SENTIMENT[insight.sentiment] ?? SENTIMENT.neutral;
  const Icon = tone.icon;

  return (
    <motion.div
      variants={staggerItem}
      className={cn('card card-hover flex gap-3 p-4 ring-1 ring-inset', tone.ring)}
    >
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tone.wrap)}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-content">{insight.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-content-muted">{insight.message}</p>
        {insight.metric && (
          <p className="mt-2 text-lg font-bold tabular-nums tracking-tight text-content">
            {insight.metric}
          </p>
        )}
      </div>
    </motion.div>
  );
};

/* ─── Page ───────────────────────────────────────────────────────────────── */
const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can, roleKey } = usePermissions();

  const canCreate = can(PERMISSION.GATEPASS_CREATE);
  const canSeeAllPasses =
    can(PERMISSION.GATEPASS_VIEW_ALL) || can(PERMISSION.GATEPASS_VIEW_DEPARTMENT);

  /** Employees without a list-wide scope land on their own list instead. */
  const listPath = canSeeAllPasses ? '/gate-passes' : '/my-gate-pass';

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: dashboardApi.stats,
  });

  const { data: charts, isLoading: chartsLoading } = useQuery({
    queryKey: ['dashboard', 'charts', 30],
    queryFn: () => dashboardApi.charts(30),
  });

  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ['dashboard', 'insights'],
    queryFn: dashboardApi.insights,
  });

  /* The socket invalidates ['dashboard'] on every workflow event, so this feed
   * is live without a poller — the key just has to sit under that prefix. */
  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () => dashboardApi.activity(12),
  });

  const { data: prefill } = useQuery({
    queryKey: ['gate-passes', 'prefill'],
    queryFn: gatePassApi.prefill,
    enabled: canCreate,
    staleTime: 60_000,
  });

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const greeting = `${greetingFor(new Date().getHours())}, ${firstName}`;
  const subtitle = SUBTITLE_BY_ROLE[roleKey ?? ''] ?? "Here's where things stand today.";

  const statusSlices = useMemo(() => toStatusSlices(charts?.byStatus ?? []), [charts]);
  const departmentBars = useMemo(() => toBars(charts?.byDepartment ?? []), [charts]);
  const unitBars = useMemo(() => toBars(charts?.byUnit ?? [], 6), [charts]);

  const tiles: {
    label: string;
    value: number;
    icon: ReactNode;
    tone: 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
    trend?: number;
    hint?: string;
    to: string;
  }[] = [
    {
      label: 'Pending',
      value: stats?.pending ?? 0,
      icon: <Clock className="h-5 w-5" />,
      tone: 'warning' as const,
      trend: stats?.trend?.pending,
      to: `${listPath}?status=PENDING`,
    },
    {
      label: 'Approved',
      value: stats?.approved ?? 0,
      icon: <CheckCircle2 className="h-5 w-5" />,
      tone: 'success' as const,
      trend: stats?.trend?.approved,
      to: `${listPath}?status=APPROVED`,
    },
    {
      label: 'Rejected',
      value: stats?.rejected ?? 0,
      icon: <XCircle className="h-5 w-5" />,
      tone: 'danger' as const,
      trend: stats?.trend?.rejected,
      to: `${listPath}?status=REJECTED`,
    },
    {
      label: 'Completed',
      value: stats?.completed ?? 0,
      icon: <PackageCheck className="h-5 w-5" />,
      tone: 'brand' as const,
      trend: stats?.trend?.completed,
      to: `${listPath}?status=COMPLETED`,
    },
    {
      label: "Today's Passes",
      value: stats?.todayTotal ?? 0,
      icon: <CalendarDays className="h-5 w-5" />,
      tone: 'accent' as const,
      trend: stats?.trend?.todayTotal,
      to: `${listPath}?from=${formatDate(new Date(), 'yyyy-MM-dd')}&to=${formatDate(new Date(), 'yyyy-MM-dd')}`,
    },
    {
      label: 'Currently Out',
      value: stats?.currentlyOut ?? 0,
      icon: <DoorOpen className="h-5 w-5" />,
      tone: 'info' as const,
      hint: stats?.overdue ? `${stats.overdue} overdue` : undefined,
      to: `${listPath}?status=OUT`,
    },
  ];

  /* Quota rings: official + personal, daily + monthly. */
  const quotaRings = useMemo(() => {
    const quota = prefill?.quota;
    if (!quota) return [];

    return (['official', 'personal'] as const).flatMap((type) =>
      (['daily', 'monthly'] as const).map((period) => {
        const entry = quota[type]?.[period];
        return {
          id: `${type}-${period}`,
          type,
          period,
          used: entry?.used ?? 0,
          limit: entry?.limit ?? 0,
        };
      })
    ).filter((ring) => ring.limit > 0);
  }, [prefill]);

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" className="space-y-6">
      {/* ── Greeting ──────────────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-content-subtle">
            {formatDate(new Date(), 'EEEE, dd MMMM yyyy')}
          </p>
          <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-content sm:text-3xl">
            {greeting}
          </h1>
          <p className="mt-1 text-sm text-content-muted">{subtitle}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => navigate('/calendar')} leftIcon={<CalendarDays className="h-4 w-4" />}>
            Calendar
          </Button>
          {canCreate && (
            <Button onClick={() => navigate('/gate-pass/new')} rightIcon={<ArrowRight className="h-4 w-4" />}>
              New gate pass
            </Button>
          )}
        </div>
      </motion.header>

      {/* ── Stat grid ─────────────────────────────────────────────────────── */}
      {statsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <StatCardSkeleton key={index} />
          ))}
        </div>
      ) : (
        <motion.div
          variants={staggerContainer(0.05)}
          initial="initial"
          animate="animate"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"
        >
          {tiles.map((tile) => (
            <StatCard
              key={tile.label}
              label={tile.label}
              value={tile.value}
              icon={tile.icon}
              tone={tile.tone}
              trend={tile.trend}
              hint={tile.hint}
              onClick={() => navigate(tile.to)}
            />
          ))}
        </motion.div>
      )}

      {/* ── Quota ─────────────────────────────────────────────────────────── */}
      {canCreate && quotaRings.length > 0 && (
        <Card>
          <CardHeader
            title="Your quota"
            subtitle="What you have left before the limits bite"
            icon={<Gauge className="h-5 w-5" />}
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate('/my-gate-pass')}>
                My passes
              </Button>
            }
          />

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {quotaRings.map((ring) => (
              <div key={ring.id} className="flex flex-col items-center gap-2">
                <ProgressRing
                  value={ring.used}
                  max={ring.limit}
                  size={88}
                  strokeWidth={8}
                  label={ring.period}
                  tone={ring.type === 'official' ? 'brand' : 'accent'}
                />
                <p className="text-xs font-medium capitalize text-content-muted">
                  {ring.type} · {ring.period}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── AI insights ───────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-content-muted">
            AI insights
          </h2>
        </div>

        {insightsLoading ? (
          <ListSkeleton rows={3} />
        ) : insights?.length ? (
          <motion.div
            variants={staggerContainer(0.06)}
            initial="initial"
            animate="animate"
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </motion.div>
        ) : (
          <Card className="text-sm text-content-muted">
            Nothing worth flagging yet — insights appear once there is enough history.
          </Card>
        )}
      </section>

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      {chartsLoading ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <ChartSkeleton className="xl:col-span-2" />
          <ChartSkeleton />
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
                title="Gate pass trend"
                subtitle="Official vs personal, last 30 days"
                icon={<TrendingUp className="h-5 w-5" />}
                action={
                  <Button variant="ghost" size="sm" onClick={() => navigate('/analytics')}>
                    Analytics
                  </Button>
                }
              />
              <AreaTrendChart data={charts?.monthlyTrend ?? []} height={300} />
            </Card>

            <Card animated>
              <CardHeader title="By status" subtitle="Where every pass sits right now" />
              <DonutChart data={statusSlices} height={260} centreLabel="Passes" />
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card animated>
              <CardHeader title="By department" subtitle="Busiest departments" />
              <BarChart data={departmentBars} orientation="horizontal" height={300} />
            </Card>

            <Card animated>
              <CardHeader title="By unit" subtitle="Volume across the plants" />
              <BarChart data={unitBars} height={300} />
            </Card>
          </div>
        </motion.div>
      )}

      {/* ── Live activity ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Live activity"
          subtitle="Workflow events as they happen"
          icon={<Activity className="h-5 w-5" />}
          action={
            <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-success-600 dark:text-success-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-success-500" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success-500" />
              </span>
              Live
            </span>
          }
        />

        {activityLoading ? (
          <ListSkeleton rows={4} />
        ) : activity?.length ? (
          <motion.ol
            variants={staggerContainer(0.04)}
            initial="initial"
            animate="animate"
            className="relative space-y-1"
          >
            {/* The rail the timeline hangs from. */}
            <span className="absolute bottom-4 left-[19px] top-4 w-px bg-line" aria-hidden />

            {activity.map((item) => (
              <motion.li key={item.id} variants={staggerItem}>
                <button
                  type="button"
                  onClick={() => navigate(`/gate-pass/${item.gatePassId}`)}
                  className="group relative flex w-full items-start gap-3 rounded-xl p-2 text-left transition-colors hover:bg-content/5"
                >
                  <Avatar name={item.actorName} size="sm" className="z-10 ring-2 ring-surface" />

                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-content">
                      <span className="font-semibold">{item.actorName}</span>{' '}
                      <span className="text-content-muted">{humanise(item.action).toLowerCase()}</span>{' '}
                      <span className="font-mono text-xs font-semibold text-brand-600 group-hover:underline dark:text-brand-300">
                        {item.gatePassNumber}
                      </span>
                    </p>
                    {item.comment && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-content-muted">“{item.comment}”</p>
                    )}
                  </div>

                  <span className="shrink-0 whitespace-nowrap text-2xs text-content-subtle">
                    {formatRelative(item.at)}
                  </span>
                </button>
              </motion.li>
            ))}
          </motion.ol>
        ) : (
          <p className="py-6 text-center text-sm text-content-muted">
            No activity yet. It will stream in here the moment something moves.
          </p>
        )}
      </Card>
    </motion.div>
  );
};

export default Dashboard;
