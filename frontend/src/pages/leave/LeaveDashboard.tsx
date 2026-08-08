import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CalendarPlus,
  CalendarRange,
  CalendarX2,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Layers,
  UserCheck,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { leaveApi } from '@/services/leave.endpoints';
import { LEAVE_STATUS_META } from '@/permissions/leave.constants';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  ListSkeleton,
  StatCard,
  StatCardSkeleton,
} from '@/components/ui';
import { pageVariants, staggerContainer, staggerItem } from '@/animations/variants';
import { formatDate, formatRelative } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { LeaveBalanceSummary } from '@/types/leave';

/* ─── Balance bar ─────────────────────────────────────────────────────────── */
const BalanceRow = ({ balance }: { balance: LeaveBalanceSummary }) => {
  const consumed = balance.used + balance.pending;
  const pct = balance.entitled > 0 ? Math.min(100, (consumed / balance.entitled) * 100) : 0;

  return (
    <motion.div variants={staggerItem} className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: balance.color }}
            aria-hidden
          />
          <span className="truncate text-sm font-medium text-content">{balance.name}</span>
          <span className="shrink-0 font-mono text-2xs text-content-subtle">{balance.code}</span>
        </div>

        <p className="shrink-0 text-sm tabular-nums text-content-muted">
          <span className="text-base font-bold text-content">{balance.available}</span>
          <span className="text-xs"> / {balance.entitled}</span>
        </p>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-content/10">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: balance.color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>

      <p className="text-2xs text-content-subtle">
        {balance.used} used
        {balance.pending > 0 && ` · ${balance.pending} awaiting approval`}
      </p>
    </motion.div>
  );
};

/* ─── Page ────────────────────────────────────────────────────────────────── */
const LeaveDashboard = () => {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['leave', 'dashboard', 'stats'],
    queryFn: leaveApi.dashboardStats,
  });

  const totals = data?.totals;
  const isTeamView = data?.scope === 'TEAM';

  const tiles = [
    {
      label: 'Leave Types',
      value: totals?.leaveTypes ?? 0,
      icon: <Layers className="h-5 w-5" />,
      tone: 'brand' as const,
      to: '/leave/types',
    },
    {
      label: 'Pending Leaves',
      value: totals?.pending ?? 0,
      icon: <Clock className="h-5 w-5" />,
      tone: 'warning' as const,
      to: '/leave/approvals',
    },
    {
      label: 'Approved Leaves',
      value: totals?.approved ?? 0,
      icon: <CheckCircle2 className="h-5 w-5" />,
      tone: 'success' as const,
      to: '/leave/my-leaves',
    },
    {
      label: 'Rejected Leaves',
      value: totals?.rejected ?? 0,
      icon: <XCircle className="h-5 w-5" />,
      tone: 'danger' as const,
      to: '/leave/my-leaves',
    },
    {
      label: 'On Leave Today',
      value: totals?.onLeaveToday ?? 0,
      icon: <Users className="h-5 w-5" />,
      tone: 'accent' as const,
      to: '/leave/my-leaves',
    },
  ];

  const QUICK_ACTIONS = [
    { label: 'Apply Leave', to: '/leave/apply', icon: CalendarPlus, tone: 'text-brand-500' },
    { label: 'Leave Approval', to: '/leave/approvals', icon: UserCheck, tone: 'text-warning-500' },
    { label: 'Leave Allocation', to: '/leave/allocation', icon: Wallet, tone: 'text-success-500' },
    { label: 'Leave Types', to: '/leave/types', icon: Layers, tone: 'text-accent-500' },
    { label: 'Leave Deletion', to: '/leave/deletion', icon: CalendarX2, tone: 'text-danger-500' },
    { label: 'Leave Reports', to: '/leave/reports', icon: FileSpreadsheet, tone: 'text-info-500' },
  ];

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" className="space-y-6">
      {/* ── Masthead ──────────────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-content-subtle">
            Leave year {data?.leaveYear ?? '—'}
          </p>
          <h1 className="mt-1 flex items-center gap-3 truncate text-2xl font-bold tracking-tight text-content sm:text-3xl">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand-600 dark:text-brand-300">
              <CalendarRange className="h-5 w-5" />
            </span>
            Leave Dashboard
          </h1>
          <p className="mt-1 text-sm text-content-muted">
            {isTeamView
              ? 'Leave activity across the people you are responsible for.'
              : 'Your leave balance and where your requests stand.'}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate('/leave/my-leaves')}
            leftIcon={<CalendarRange className="h-4 w-4" />}
          >
            My leaves
          </Button>
          <Button
            onClick={() => navigate('/leave/apply')}
            rightIcon={<ArrowRight className="h-4 w-4" />}
          >
            Apply leave
          </Button>
        </div>
      </motion.header>

      {/* ── Stat tiles ────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <StatCardSkeleton key={index} />
          ))}
        </div>
      ) : (
        <motion.div
          variants={staggerContainer(0.05)}
          initial="initial"
          animate="animate"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
        >
          {tiles.map((tile) => (
            <StatCard
              key={tile.label}
              label={tile.label}
              value={tile.value}
              icon={tile.icon}
              tone={tile.tone}
              onClick={() => navigate(tile.to)}
            />
          ))}
        </motion.div>
      )}

      {/* ── Balance summary + Employees on leave today ────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Leave balance summary"
            subtitle={`Your entitlement for ${data?.leaveYear ?? 'the current year'}`}
            icon={<Wallet className="h-5 w-5" />}
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate('/leave/allocation')}>
                Allocation
              </Button>
            }
          />

          {isLoading ? (
            <ListSkeleton rows={4} />
          ) : data?.balanceSummary.length ? (
            <motion.div
              variants={staggerContainer(0.05)}
              initial="initial"
              animate="animate"
              className="grid gap-5 sm:grid-cols-2"
            >
              {data.balanceSummary.map((balance) => (
                <BalanceRow key={balance.id} balance={balance} />
              ))}
            </motion.div>
          ) : (
            <p className="py-6 text-center text-sm text-content-muted">
              No leave allocated yet. Balances appear once an administrator allocates them.
            </p>
          )}
        </Card>

        <Card>
          <CardHeader
            title="On leave today"
            subtitle={formatDate(new Date(), 'EEEE, dd MMM')}
            icon={<Users className="h-5 w-5" />}
          />

          {isLoading ? (
            <ListSkeleton rows={3} />
          ) : data?.onLeaveToday.length ? (
            <motion.ul
              variants={staggerContainer(0.04)}
              initial="initial"
              animate="animate"
              className="space-y-1"
            >
              {data.onLeaveToday.slice(0, 8).map((person) => (
                <motion.li
                  key={person.id}
                  variants={staggerItem}
                  className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-content/5"
                >
                  <Avatar name={person.employeeName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-content">{person.employeeName}</p>
                    <p className="truncate text-2xs text-content-muted">
                      {person.departmentName || person.employeeCode}
                    </p>
                  </div>
                  <Badge tone="accent" className="shrink-0">
                    {person.leaveTypeCode}
                  </Badge>
                </motion.li>
              ))}
            </motion.ul>
          ) : (
            <p className="py-6 text-center text-sm text-content-muted">
              Nobody is on leave today. Full attendance.
            </p>
          )}
        </Card>
      </div>

      {/* ── Recent applications ───────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Recent applications"
          subtitle={isTeamView ? 'Latest requests from your team' : 'Your most recent requests'}
          icon={<CalendarRange className="h-5 w-5" />}
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate('/leave/my-leaves')}>
              View all
            </Button>
          }
        />

        {isLoading ? (
          <ListSkeleton rows={5} />
        ) : data?.recentApplications.length ? (
          <motion.ol
            variants={staggerContainer(0.04)}
            initial="initial"
            animate="animate"
            className="space-y-1"
          >
            {data.recentApplications.map((row) => {
              const meta = LEAVE_STATUS_META[row.status];
              return (
                <motion.li key={row.id} variants={staggerItem}>
                  <div className="flex flex-wrap items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-content/5">
                    <Avatar name={row.employeeName} size="sm" className="shrink-0" />

                    <div className="min-w-[10rem] flex-1">
                      <p className="truncate text-sm text-content">
                        <span className="font-semibold">{row.employeeName}</span>
                        <span className="text-content-muted"> · {row.leaveTypeName}</span>
                      </p>
                      <p className="mt-0.5 truncate text-2xs text-content-muted">
                        <span className="font-mono font-semibold text-brand-600 dark:text-brand-300">
                          {row.leaveNumber}
                        </span>
                        {' · '}
                        {formatDate(row.fromDate)} — {formatDate(row.toDate)}
                        {' · '}
                        {row.totalDays} day{row.totalDays === 1 ? '' : 's'}
                      </p>
                    </div>

                    <Badge tone={meta.tone} dot className="shrink-0">
                      {meta.label}
                    </Badge>

                    <span className="shrink-0 whitespace-nowrap text-2xs text-content-subtle">
                      {formatRelative(row.createdAt)}
                    </span>
                  </div>
                </motion.li>
              );
            })}
          </motion.ol>
        ) : (
          <p className="py-6 text-center text-sm text-content-muted">
            No leave applications yet. They will appear here as they are raised.
          </p>
        )}
      </Card>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-content-muted">
          Quick actions
        </h2>

        <motion.div
          variants={staggerContainer(0.04)}
          initial="initial"
          animate="animate"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"
        >
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <motion.button
                key={action.to}
                type="button"
                variants={staggerItem}
                onClick={() => navigate(action.to)}
                className="card card-hover group flex flex-col items-start gap-3 p-4 text-left"
              >
                <span
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl bg-content/5 transition-transform group-hover:scale-110',
                    action.tone
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-content">{action.label}</span>
              </motion.button>
            );
          })}
        </motion.div>
      </section>
    </motion.div>
  );
};

export default LeaveDashboard;
