import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Activity,
  CalendarDays,
  ChevronRight,
  ScrollText,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  Input,
  Modal,
  Select,
  Skeleton,
  StatCard,
  StatCardSkeleton,
  type Column,
} from '@/components/ui';
import { useDebouncedCallback } from '@/hooks/useDebounce';
import { auditApi } from '@/services/endpoints';
import { staggerContainer } from '@/animations/variants';
import { formatDateTime, formatSmartDateTime, humanise } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { AuditLog } from '@/types';

type Tone = React.ComponentProps<typeof Badge>['tone'];

interface AuditStats {
  total: number;
  today: number;
  failures: number;
  byAction: { action: string; count: number }[];
}

interface ActionOption {
  value: string;
  label: string;
}

interface Filters {
  action: string;
  status: string;
  from: string;
  to: string;
  search: string;
  page: number;
}

const EMPTY: Filters = { action: '', status: '', from: '', to: '', search: '', page: 1 };

/**
 * Action → colour, by category. The point is that a scanning eye can group the
 * log: blue is a session, indigo is the gate pass lifecycle, green is a yes,
 * red is a no (or a deletion), amber is someone changing the system itself.
 */
const toneFor = (action: string): Tone => {
  if (action.includes('APPROVE')) return 'success';
  if (action.includes('REJECT') || action.includes('DELETE') || action === 'LOGIN_FAILED') {
    return 'danger';
  }
  if (/^(LOGIN|LOGOUT|PASSWORD_RESET)/.test(action)) return 'info';
  if (/^(SETTINGS|USER|ROLE|UNIT|DEPARTMENT|HOLIDAY)/.test(action)) return 'warning';
  if (/^(GATEPASS|HR|SECURITY|EXPORT)/.test(action)) return 'brand';
  return 'neutral';
};

/** Renders any `changes` value as something a compliance officer can read. */
const readable = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    // ISO timestamps become human dates; everything else stays verbatim.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return formatDateTime(value);
    return value;
  }
  if (Array.isArray(value)) return value.length ? value.map(readable).join(', ') : '—';
  return JSON.stringify(value, null, 2);
};

/* ════════════════════════════════════════════════════════════════════════════
 * Page
 * ════════════════════════════════════════════════════════════════════════════ */
const AuditLogs = () => {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [searchDraft, setSearchDraft] = useState('');
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const patch = (next: Partial<Filters>) =>
    setFilters((current) => ({ ...current, ...next, page: next.page ?? 1 }));

  const pushSearch = useDebouncedCallback((search: string) => patch({ search }), 350);

  /* ── Data ─────────────────────────────────────────────────────────────── */
  const { data: statsRaw, isLoading: statsLoading } = useQuery({
    queryKey: ['audit', 'stats'],
    queryFn: auditApi.stats,
    staleTime: 60_000,
  });
  const stats = statsRaw as unknown as AuditStats | undefined;

  const { data: actions } = useQuery({
    queryKey: ['audit', 'actions'],
    // The API returns `{ value, label }[]`; older builds returned bare strings.
    queryFn: async () => (await auditApi.actions()) as unknown as (string | ActionOption)[],
    staleTime: 30 * 60_000,
  });

  const actionOptions: ActionOption[] = (actions ?? []).map((item) =>
    typeof item === 'string' ? { value: item, label: humanise(item) } : item
  );

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit', 'list', filters],
    queryFn: () => auditApi.list({ ...filters, limit: 20 }),
  });

  const activeCount = Object.entries(filters).filter(
    ([key, value]) => key !== 'page' && value !== ''
  ).length;

  const topActions = (stats?.byAction ?? []).slice(0, 5);
  const topCount = topActions[0]?.count ?? 0;

  /* ── Table ────────────────────────────────────────────────────────────── */
  const columns: Column<AuditLog>[] = [
    {
      key: 'createdAt',
      header: 'When',
      render: (row) => (
        <div className="whitespace-nowrap">
          <p className="text-sm font-medium text-content">{formatSmartDateTime(row.createdAt)}</p>
          {row.status === 'FAILURE' && (
            <p className="text-xs font-semibold text-danger-500">Failed</p>
          )}
        </div>
      ),
    },
    {
      key: 'actorName',
      header: 'Actor',
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar
            name={row.actorName}
            src={typeof row.actor === 'object' && row.actor ? row.actor.profileImage : undefined}
            size="sm"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-content">{row.actorName || 'System'}</p>
            <p className="truncate text-xs text-content-muted">{humanise(row.actorRole)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => <Badge tone={toneFor(row.action)}>{humanise(row.action)}</Badge>,
    },
    {
      key: 'entity',
      header: 'Entity',
      hideBelow: 'lg',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-content">{row.entity || '—'}</p>
          {row.entityLabel && (
            <p className="truncate font-mono text-xs text-content-muted">{row.entityLabel}</p>
          )}
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      hideBelow: 'xl',
      className: 'max-w-[280px]',
      render: (row) => (
        <p className="truncate text-sm text-content-muted" title={row.description}>
          {row.description || '—'}
        </p>
      ),
    },
    {
      key: 'ip',
      header: 'IP',
      hideBelow: 'xl',
      render: (row) => (
        <p className="whitespace-nowrap font-mono text-xs text-content-subtle">{row.ip || '—'}</p>
      ),
    },
    {
      key: 'open',
      header: '',
      className: 'text-right',
      render: () => <ChevronRight className="ml-auto h-4 w-4 text-content-subtle" />,
    },
  ];

  const changes = Object.entries(selected?.changes ?? {});

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        subtitle="Every privileged action, who took it, and exactly what changed."
        icon={<ScrollText className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Insights' }, { label: 'Audit Logs' }]}
      />

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[repeat(3,minmax(0,1fr))_1.4fr]">
        {statsLoading ? (
          <>
            {Array.from({ length: 3 }).map((_, index) => (
              <StatCardSkeleton key={index} />
            ))}
            <Card>
              <Skeleton className="mb-4 h-4 w-28" />
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="mb-3 h-3" />
              ))}
            </Card>
          </>
        ) : (
          <motion.div
            variants={staggerContainer(0.06)}
            initial="initial"
            animate="animate"
            className="contents"
          >
            <StatCard
              label="Total events"
              value={stats?.total ?? 0}
              icon={<ScrollText className="h-5 w-5" />}
              tone="brand"
            />
            <StatCard
              label="Events today"
              value={stats?.today ?? 0}
              icon={<Activity className="h-5 w-5" />}
              tone="accent"
            />
            <StatCard
              label="Failures"
              value={stats?.failures ?? 0}
              icon={<ShieldAlert className="h-5 w-5" />}
              tone="danger"
              hint={stats?.failures ? 'Denied or errored actions' : 'Nothing failed'}
            />

            <Card animated>
              <CardHeader title="Top actions" subtitle="Most recorded across the trail" />
              {topActions.length === 0 ? (
                <p className="text-sm text-content-muted">Nothing recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {topActions.map((item) => (
                    <li key={item.action}>
                      <button
                        type="button"
                        onClick={() => patch({ action: item.action })}
                        className="group w-full text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-medium text-content transition-colors group-hover:text-brand-500">
                            {humanise(item.action)}
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-content-muted">
                            {item.count.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-content/10">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${topCount ? (item.count / topCount) * 100 : 0}%`,
                            }}
                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                            className="h-full rounded-full bg-brand-gradient"
                          />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </motion.div>
        )}
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <Card padding="sm" className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2 lg:col-span-1">
            <Input
              value={searchDraft}
              onChange={(event) => {
                setSearchDraft(event.target.value);
                pushSearch(event.target.value);
              }}
              placeholder="Search actor, description…"
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search audit logs"
            />
          </div>

          <Select
            value={filters.action}
            onChange={(event) => patch({ action: event.target.value })}
            options={actionOptions}
            placeholder="All actions"
            aria-label="Action"
          />

          <Select
            value={filters.status}
            onChange={(event) => patch({ status: event.target.value })}
            options={[
              { value: 'SUCCESS', label: 'Success' },
              { value: 'FAILURE', label: 'Failure' },
            ]}
            placeholder="Any outcome"
            aria-label="Outcome"
          />

          <Input
            type="date"
            value={filters.from}
            onChange={(event) => patch({ from: event.target.value })}
            leftIcon={<CalendarDays className="h-4 w-4" />}
            aria-label="From date"
          />

          <div className="flex items-end gap-2">
            <Input
              type="date"
              value={filters.to}
              onChange={(event) => patch({ to: event.target.value })}
              leftIcon={<CalendarDays className="h-4 w-4" />}
              aria-label="To date"
            />
            {activeCount > 0 && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Clear filters"
                onClick={() => {
                  setFilters(EMPTY);
                  setSearchDraft('');
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ── Trail ────────────────────────────────────────────────────────── */}
      <DataTable
        data={logs?.items ?? []}
        columns={columns}
        isLoading={isLoading}
        rowKey={(row) => row._id}
        onRowClick={setSelected}
        meta={logs?.meta}
        onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
        emptyTitle="No audit events"
        emptyMessage="Nothing matches these filters. Widen the date range or clear the action."
        mobileCard={(row) => (
          <div className="card space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar
                  name={row.actorName}
                  src={typeof row.actor === 'object' && row.actor ? row.actor.profileImage : undefined}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-content">
                    {row.actorName || 'System'}
                  </p>
                  <p className="truncate text-xs text-content-muted">{humanise(row.actorRole)}</p>
                </div>
              </div>
              <Badge tone={toneFor(row.action)}>{humanise(row.action)}</Badge>
            </div>

            <p className="line-clamp-2 text-sm text-content-muted">{row.description}</p>

            <div className="flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-content-subtle">
              <span className="truncate font-mono">{row.ip || '—'}</span>
              <span className="shrink-0">{formatSmartDateTime(row.createdAt)}</span>
            </div>
          </div>
        )}
      />

      {/* ── Detail ───────────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        size="lg"
        title={selected ? humanise(selected.action) : ''}
        description={selected ? formatDateTime(selected.createdAt) : undefined}
        icon={<ScrollText className="h-5 w-5" />}
        footer={
          <Button variant="secondary" onClick={() => setSelected(null)}>
            Close
          </Button>
        }
      >
        {selected && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={toneFor(selected.action)}>{humanise(selected.action)}</Badge>
              <Badge tone={selected.status === 'SUCCESS' ? 'success' : 'danger'} dot>
                {selected.status}
              </Badge>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-sunken/50 p-4">
              <Avatar
                name={selected.actorName}
                src={
                  typeof selected.actor === 'object' && selected.actor
                    ? selected.actor.profileImage
                    : undefined
                }
                size="md"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-content">
                  {selected.actorName || 'System'}
                </p>
                <p className="truncate text-xs text-content-muted">{humanise(selected.actorRole)}</p>
              </div>
            </div>

            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                { label: 'Entity', value: selected.entity || '—' },
                { label: 'Entity label', value: selected.entityLabel || '—' },
                { label: 'IP address', value: selected.ip || '—' },
                { label: 'Recorded at', value: formatDateTime(selected.createdAt) },
              ].map((item) => (
                <div key={item.label} className="min-w-0">
                  <dt className="text-2xs font-semibold uppercase tracking-wider text-content-subtle">
                    {item.label}
                  </dt>
                  <dd className="mt-1 truncate text-sm text-content">{item.value}</dd>
                </div>
              ))}

              <div className="min-w-0 sm:col-span-2">
                <dt className="text-2xs font-semibold uppercase tracking-wider text-content-subtle">
                  Description
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-content">
                  {selected.description || '—'}
                </dd>
              </div>

              {selected.userAgent && (
                <div className="min-w-0 sm:col-span-2">
                  <dt className="text-2xs font-semibold uppercase tracking-wider text-content-subtle">
                    User agent
                  </dt>
                  <dd className="mt-1 break-all font-mono text-xs text-content-muted">
                    {selected.userAgent}
                  </dd>
                </div>
              )}
            </dl>

            {/* The payoff: what actually changed, before → after. */}
            <div>
              <p className="mb-2 text-sm font-semibold text-content">
                Changes
                {changes.length > 0 && (
                  <span className="ml-1.5 text-content-subtle">({changes.length})</span>
                )}
              </p>

              {changes.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-content-muted">
                  This action did not modify any field.
                </p>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-line">
                  <div className="grid grid-cols-[1fr_1fr_1fr] gap-px bg-line text-2xs font-semibold uppercase tracking-wider text-content-muted">
                    <div className="bg-surface-sunken px-3 py-2">Field</div>
                    <div className="bg-surface-sunken px-3 py-2">Before</div>
                    <div className="bg-surface-sunken px-3 py-2">After</div>
                  </div>

                  <div className="grid grid-cols-[1fr_1fr_1fr] gap-px bg-line">
                    {changes.map(([field, diff]) => (
                      <div key={field} className="contents">
                        <div className="bg-surface px-3 py-3 text-sm font-medium text-content">
                          <span className="break-words">{humanise(field)}</span>
                        </div>
                        <div className="bg-surface px-3 py-3">
                          <span
                            className={cn(
                              'inline-block break-words rounded-md px-1.5 py-0.5 text-sm',
                              'bg-danger-500/10 text-danger-700 line-through decoration-danger-500/40 dark:text-danger-300'
                            )}
                          >
                            {readable(diff?.from)}
                          </span>
                        </div>
                        <div className="bg-surface px-3 py-3">
                          <span className="inline-block break-words rounded-md bg-success-500/10 px-1.5 py-0.5 text-sm font-medium text-success-700 dark:text-success-300">
                            {readable(diff?.to)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AuditLogs;
