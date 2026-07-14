import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Bell,
  BellOff,
  CheckCheck,
  CheckCircle2,
  Clock,
  LogOut,
  MessageSquare,
  XCircle,
} from 'lucide-react';
import { notificationApi } from '@/services/endpoints';
import { formatRelative } from '@/utils/format';
import { cn } from '@/utils/cn';
import { Button, Dropdown } from '@/components/ui';
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

export const NotificationBell = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationApi.unreadCount,
    refetchInterval: 60_000,
  });

  const { data } = useQuery({
    queryKey: ['notifications', { limit: 8 }],
    queryFn: () => notificationApi.list({ limit: 8 }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markRead = useMutation({ mutationFn: notificationApi.markRead, onSuccess: invalidate });
  const markAllRead = useMutation({ mutationFn: notificationApi.markAllRead, onSuccess: invalidate });

  const count = unread?.count ?? 0;
  const items = data?.items ?? [];

  const open = (notification: Notification) => {
    if (!notification.isRead) markRead.mutate(notification._id);
    if (notification.link) navigate(notification.link);
  };

  return (
    <Dropdown
      align="right"
      panelClassName="w-[380px] max-w-[calc(100vw-2rem)] p-0"
      trigger={
        <Button variant="ghost" size="icon" className="relative" aria-label={`${count} unread notifications`}>
          <Bell className="h-[18px] w-[18px]" />
          {count > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger-500 px-1 text-2xs font-bold tabular-nums text-white ring-2 ring-surface"
            >
              {count > 9 ? '9+' : count}
            </motion.span>
          )}
        </Button>
      }
    >
      <div onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-content">Notifications</h3>
            {count > 0 && (
              <span className="rounded-full bg-brand-500/15 px-1.5 py-0.5 text-2xs font-bold text-brand-600 dark:text-brand-300">
                {count} new
              </span>
            )}
          </div>
          {count > 0 && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 transition-colors hover:text-brand-500 dark:text-brand-300"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </header>

        <div className="max-h-[380px] overflow-y-auto">
          {!items.length ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <BellOff className="h-8 w-8 text-content-subtle" />
              <p className="text-sm font-medium text-content">You're all caught up</p>
              <p className="text-xs text-content-muted">New activity will show up here.</p>
            </div>
          ) : (
            items.map((notification) => {
              const Icon = ICONS[notification.type] ?? Bell;
              return (
                <button
                  key={notification._id}
                  type="button"
                  onClick={() => open(notification)}
                  className={cn(
                    'flex w-full gap-3 border-b border-line/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-content/5',
                    !notification.isRead && 'bg-brand-500/[0.05]'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                      TONES[notification.type]
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-content">{notification.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-content-muted">
                      {notification.message}
                    </p>
                    <p className="mt-1 text-2xs text-content-subtle">
                      {formatRelative(notification.createdAt)}
                    </p>
                  </div>

                  {!notification.isRead && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <footer className="border-t border-line p-2">
          <Button
            variant="ghost"
            fullWidth
            size="sm"
            onClick={() => navigate('/notifications')}
          >
            View all notifications
          </Button>
        </footer>
      </div>
    </Dropdown>
  );
};

export default NotificationBell;
