import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { isToday, isYesterday, parseISO } from 'date-fns';
import {
  Bell,
  BellOff,
  CheckCheck,
  CheckCircle2,
  Clock,
  LogOut,
  MessageSquare,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ListSkeleton,
  Pagination,
  Select,
  Tabs,
  type TabItem,
} from '@/components/ui';
import { notificationApi } from '@/services/endpoints';
import { errorMessage } from '@/services/api';
import { formatDate, formatRelative } from '@/utils/format';
import { cn } from '@/utils/cn';
import { staggerContainer, staggerItem } from '@/animations/variants';
import type { Notification, NotificationType } from '@/types';

const ICONS: Record<NotificationType, typeof Bell> = {
  SUBMITTED: Clock,
  APPROVAL: CheckCircle2,
  REJECT: XCircle,
  CHANGES_REQUESTED: MessageSquare,
  REVIEW: Clock,
  REVIEW_FAILED: XCircle,
  EXIT: LogOut,
  COMPLETED: CheckCircle2,
  REMINDER: Bell,
  CANCELLED: XCircle,
  SYSTEM: Bell,
};

const TONES: Record<NotificationType, string> = {
  SUBMITTED: 'bg-warning-500/15 text-warning-500',
  APPROVAL: 'bg-success-500/15 text-success-500',
  REJECT: 'bg-danger-500/15 text-danger-500',
  CHANGES_REQUESTED: 'bg-info-500/15 text-info-500',
  REVIEW: 'bg-brand-500/15 text-brand-500',
  REVIEW_FAILED: 'bg-danger-500/15 text-danger-500',
  EXIT: 'bg-accent-500/15 text-accent-500',
  COMPLETED: 'bg-success-500/15 text-success-500',
  REMINDER: 'bg-warning-500/15 text-warning-500',
  CANCELLED: 'bg-content-subtle/15 text-content-muted',
  SYSTEM: 'bg-brand-500/15 text-brand-500',
};

const TYPE_OPTIONS = [
  { value: 'ALL', label: 'All types' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'APPROVAL', label: 'Approved' },
  { value: 'REJECT', label: 'Rejected' },
  { value: 'CHANGES_REQUESTED', label: 'Changes requested' },
  { value: 'REVIEW', label: 'HR review' },
  { value: 'REVIEW_FAILED', label: 'HR review failed' },
  { value: 'EXIT', label: 'Exit recorded' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'REMINDER', label: 'Reminder' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'SYSTEM', label: 'System' },
];

/** "Today" / "Yesterday" / "12 Mar 2026" — the group heading for a row. */
const dayLabel = (iso: string) => {
  const date = parseISO(iso);
  if (Number.isNaN(date.getTime())) return 'Earlier';
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return formatDate(date);
};

const Notifications = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [type, setType] = useState('ALL');
  const [page, setPage] = useState(1);
  const [confirmClear, setConfirmClear] = useState(false);

  const filters = useMemo(
    () => ({ page, limit: 20, type, isRead: tab === 'unread' ? false : undefined }),
    [page, type, tab]
  );

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['notifications', 'page', filters],
    queryFn: () => notificationApi.list(filters),
  });

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationApi.unreadCount,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const markRead = useMutation({
    mutationFn: notificationApi.markRead,
    onSuccess: () => void invalidate(),
  });

  const markAllRead = useMutation({
    mutationFn: notificationApi.markAllRead,
    onSuccess: () => {
      void invalidate();
      toast.success('Everything marked as read');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not mark them read')),
  });

  const remove = useMutation({
    mutationFn: notificationApi.remove,
    onSuccess: () => void invalidate(),
    onError: (error) => toast.error(errorMessage(error, 'Could not remove that notification')),
  });

  const clearRead = useMutation({
    mutationFn: notificationApi.clearRead,
    onSuccess: () => {
      void invalidate();
      setConfirmClear(false);
      setPage(1);
      toast.success('Read notifications cleared');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not clear them')),
  });

  const items = data?.items ?? [];
  const unreadCount = unread?.count ?? 0;

  /* Group into ordered day buckets — the API already sorts newest first. */
  const groups = useMemo(() => {
    const buckets = new Map<string, Notification[]>();
    items.forEach((notification) => {
      const label = dayLabel(notification.createdAt);
      const bucket = buckets.get(label);
      if (bucket) bucket.push(notification);
      else buckets.set(label, [notification]);
    });
    return [...buckets.entries()];
  }, [items]);

  const open = (notification: Notification) => {
    if (!notification.isRead) markRead.mutate(notification._id);
    if (notification.link) navigate(notification.link);
  };

  const changeTab = (next: string) => {
    setTab(next as 'all' | 'unread');
    setPage(1);
  };

  const TABS: TabItem[] = [
    { value: 'all', label: 'All' },
    { value: 'unread', label: 'Unread', count: unreadCount },
  ];

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={
          unreadCount
            ? `${unreadCount} unread ${unreadCount === 1 ? 'update' : 'updates'} waiting for you`
            : "You're all caught up"
        }
        icon={<Bell className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Notifications' }]}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<CheckCheck className="h-4 w-4" />}
              disabled={!unreadCount || markAllRead.isPending}
              isLoading={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() => setConfirmClear(true)}
            >
              Clear read
            </Button>
          </>
        }
      />

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={changeTab}
          layoutId="notifications-tab"
          className="w-full sm:w-auto"
        />
        <div className="w-full sm:w-56">
          <Select
            aria-label="Filter by type"
            options={TYPE_OPTIONS}
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* ── List ──────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : isError ? (
        <Card className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-content">We couldn't load your notifications</p>
            <p className="mt-0.5 text-sm text-content-muted">Check your connection and try again.</p>
          </div>
          <Button variant="secondary" size="sm" isLoading={isFetching} onClick={() => void refetch()}>
            Retry
          </Button>
        </Card>
      ) : !items.length ? (
        <EmptyState
          icon={<BellOff className="h-7 w-7" />}
          title={tab === 'unread' ? 'Nothing unread' : 'No notifications yet'}
          message={
            tab === 'unread'
              ? 'Every update has been read. New activity will land here as your passes move through the workflow.'
              : 'When a gate pass is submitted, approved, reviewed or scanned at the gate, you will hear about it here.'
          }
          action={
            type !== 'ALL' || tab !== 'all' ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setType('ALL');
                  setTab('all');
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-8">
          {groups.map(([label, group]) => (
            <section key={label}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-content-subtle">
                  {label}
                </h2>
                <span className="h-px flex-1 bg-line" />
                <Badge tone="neutral">{group.length}</Badge>
              </div>

              <motion.ul
                variants={staggerContainer(0.04)}
                initial="initial"
                animate="animate"
                className="space-y-2.5"
              >
                <AnimatePresence initial={false}>
                  {group.map((notification) => {
                    const Icon = ICONS[notification.type] ?? Bell;
                    return (
                      <motion.li
                        key={notification._id}
                        layout
                        variants={staggerItem}
                        exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
                        className={cn(
                          'card group relative flex items-start gap-3 p-4 transition-colors sm:gap-4',
                          !notification.isRead && 'border-brand-500/30 bg-brand-500/[0.04]'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => open(notification)}
                          className="flex min-w-0 flex-1 items-start gap-3 text-left sm:gap-4"
                        >
                          <span
                            className={cn(
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                              TONES[notification.type]
                            )}
                          >
                            <Icon className="h-5 w-5" />
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-content">
                                {notification.title}
                              </span>
                              {!notification.isRead && (
                                <span
                                  aria-label="Unread"
                                  className="h-2 w-2 shrink-0 rounded-full bg-brand-500"
                                />
                              )}
                            </span>
                            <span className="mt-0.5 block text-sm leading-relaxed text-content-muted">
                              {notification.message}
                            </span>
                            <span className="mt-1.5 block text-xs text-content-subtle">
                              {formatRelative(notification.createdAt)}
                            </span>
                          </span>
                        </button>

                        <div className="flex shrink-0 items-center gap-1">
                          {!notification.isRead && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                              aria-label={`Mark "${notification.title}" as read`}
                              onClick={() => markRead.mutate(notification._id)}
                            >
                              <CheckCheck className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                            aria-label={`Remove "${notification.title}"`}
                            onClick={() => remove.mutate(notification._id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </motion.ul>
            </section>
          ))}

          {data?.meta && data.meta.totalPages > 1 && (
            <Pagination meta={data.meta} onPageChange={setPage} />
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => clearRead.mutate()}
        isLoading={clearRead.isPending}
        title="Clear read notifications?"
        confirmLabel="Clear them"
        icon={<Trash2 className="h-4 w-4" />}
        message="Every notification you've already read will be deleted. Unread ones stay put. This cannot be undone."
      />
    </div>
  );
};

export default Notifications;
