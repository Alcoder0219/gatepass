import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, ListTree } from 'lucide-react';
import { dashboardApi } from '@/services/endpoints';
import { PageHeader } from '@/components/common/PageHeader';
import { Button, Card, EmptyState, ListSkeleton, Modal, StatusBadge, Tabs, TypeBadge } from '@/components/ui';
import { STATUS_META } from '@/permissions/constants';
import { pageVariants, staggerContainer, staggerItem } from '@/animations/variants';
import { formatTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { GatePassStatus, GatePassType } from '@/types';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  status: string;
  type: string;
  employeeName: string;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ISO = 'yyyy-MM-dd';
const CHIPS_PER_DAY = 3;

const statusMeta = (status: string) => STATUS_META[status as GatePassStatus] ?? STATUS_META.DRAFT;

/* ─── Pass chip ──────────────────────────────────────────────────────────── */
const PassChip = ({
  event,
  onClick,
  detailed,
}: {
  event: CalendarEvent;
  /** Omit inside a month cell — the cell itself is the button. */
  onClick?: () => void;
  detailed?: boolean;
}) => {
  const meta = statusMeta(event.status);

  const className = cn(
    'flex w-full items-center gap-1.5 overflow-hidden rounded-md px-1.5 py-1 text-left text-2xs font-medium text-content',
    detailed && 'gap-2 rounded-lg px-2.5 py-2 text-xs',
    onClick && 'transition-transform hover:translate-x-0.5'
  );

  const style = {
    backgroundColor: `${meta.color}1f`,
    borderLeft: `3px solid ${meta.color}`,
  };

  const body = (
    <>
      <span className="truncate">{event.title}</span>
      {detailed && (
        <span className="ml-auto shrink-0 text-2xs text-content-muted">{formatTime(event.start)}</span>
      )}
    </>
  );

  // A <button> nested inside the day-cell <button> would be invalid markup.
  if (!onClick) {
    return (
      <span className={className} style={style} title={`${event.title} · ${meta.label}`}>
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${event.title} · ${meta.label}`}
      className={className}
      style={style}
    >
      {body}
    </button>
  );
};

/* ─── Page ───────────────────────────────────────────────────────────────── */
const CalendarView = () => {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [tab, setTab] = useState('calendar');
  const [selected, setSelected] = useState<Date | null>(null);

  /* The grid always shows whole weeks, so the range is the padded month. */
  const gridStart = useMemo(() => startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), [cursor]);
  const gridEnd = useMemo(() => endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }), [cursor]);

  const days = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart, gridEnd]
  );

  const from = format(gridStart, ISO);
  const to = format(gridEnd, ISO);

  const { data: events, isLoading } = useQuery({
    queryKey: ['dashboard', 'calendar', from, to],
    queryFn: () => dashboardApi.calendar(from, to),
  });

  /** Events bucketed by ISO day — one pass over the list instead of one per cell. */
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events ?? []) {
      const key = format(parseISO(event.start), ISO);
      const bucket = map.get(key);
      if (bucket) bucket.push(event);
      else map.set(key, [event]);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.start.localeCompare(b.start));
    }
    return map;
  }, [events]);

  const eventsOn = (day: Date) => byDay.get(format(day, ISO)) ?? [];

  const daysWithEvents = useMemo(
    () => days.filter((day) => isSameMonth(day, cursor) && eventsOn(day).length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, cursor, byDay]
  );

  const selectedEvents = selected ? eventsOn(selected) : [];

  const openPass = (id: string) => {
    setSelected(null);
    navigate(`/gate-pass/${id}`);
  };

  const totalThisMonth = daysWithEvents.reduce((sum, day) => sum + eventsOn(day).length, 0);

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate">
      <PageHeader
        title="Calendar"
        subtitle={`${format(cursor, 'MMMM yyyy')} · ${totalThisMonth} gate pass${totalThisMonth === 1 ? '' : 'es'}`}
        icon={<CalendarDays className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Calendar' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous month"
              onClick={() => setCursor((current) => subMonths(current, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="secondary" onClick={() => setCursor(startOfMonth(new Date()))}>
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next month"
              onClick={() => setCursor((current) => addMonths(current, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <Tabs
        className="mb-6 w-full sm:w-auto"
        layoutId="calendar-tabs"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'calendar', label: 'Month', icon: <CalendarDays className="h-4 w-4" /> },
          { value: 'timeline', label: 'Timeline', icon: <ListTree className="h-4 w-4" /> },
        ]}
      />

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : tab === 'calendar' ? (
        <>
          {/* ── Month grid (sm and up) ────────────────────────────────────── */}
          <Card padding="sm" className="hidden sm:block">
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((weekday) => (
                <div
                  key={weekday}
                  className="pb-2 text-center text-2xs font-semibold uppercase tracking-wider text-content-subtle"
                >
                  {weekday}
                </div>
              ))}

              {days.map((day) => {
                const dayEvents = eventsOn(day);
                const outside = !isSameMonth(day, cursor);
                const overflow = dayEvents.length - CHIPS_PER_DAY;

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => dayEvents.length > 0 && setSelected(day)}
                    className={cn(
                      'flex min-h-[104px] flex-col gap-1 rounded-xl border border-line/60 p-1.5 text-left transition-colors',
                      outside ? 'opacity-45' : 'hover:border-brand-500/40 hover:bg-brand-500/[0.04]',
                      dayEvents.length === 0 && 'cursor-default',
                      isToday(day) && 'border-brand-500/50 bg-brand-500/[0.06]'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                        isToday(day)
                          ? 'bg-brand-gradient text-white'
                          : 'text-content-muted'
                      )}
                    >
                      {format(day, 'd')}
                    </span>

                    <span className="flex w-full flex-col gap-1">
                      {dayEvents.slice(0, CHIPS_PER_DAY).map((event) => (
                        <PassChip key={event.id} event={event} />
                      ))}
                      {overflow > 0 && (
                        <span className="px-1.5 text-2xs font-semibold text-content-muted">
                          +{overflow} more
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* ── Mobile: only the days that actually have passes ───────────── */}
          <div className="sm:hidden">
            {daysWithEvents.length === 0 ? (
              <EmptyState
                title="Nothing this month"
                message={`No gate passes fall in ${format(cursor, 'MMMM yyyy')}.`}
                icon={<CalendarDays className="h-7 w-7" />}
              />
            ) : (
              <motion.div
                variants={staggerContainer(0.04)}
                initial="initial"
                animate="animate"
                className="space-y-3"
              >
                {daysWithEvents.map((day) => (
                  <motion.div key={day.toISOString()} variants={staggerItem}>
                    <Card padding="sm">
                      <div className="mb-2 flex items-center justify-between">
                        <p
                          className={cn(
                            'text-sm font-semibold',
                            isToday(day) ? 'text-brand-600 dark:text-brand-300' : 'text-content'
                          )}
                        >
                          {format(day, 'EEE, dd MMM')}
                        </p>
                        <span className="text-2xs font-semibold uppercase tracking-wider text-content-subtle">
                          {eventsOn(day).length} pass{eventsOn(day).length === 1 ? '' : 'es'}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {eventsOn(day).map((event) => (
                          <PassChip
                            key={event.id}
                            event={event}
                            detailed
                            onClick={() => openPass(event.id)}
                          />
                        ))}
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </>
      ) : (
        /* ── Timeline ───────────────────────────────────────────────────── */
        <>
          {daysWithEvents.length === 0 ? (
            <EmptyState
              title="Nothing this month"
              message={`No gate passes fall in ${format(cursor, 'MMMM yyyy')}.`}
              icon={<ListTree className="h-7 w-7" />}
            />
          ) : (
            <motion.ol
              variants={staggerContainer(0.05)}
              initial="initial"
              animate="animate"
              className="relative space-y-6 border-l border-line pl-6"
            >
              {daysWithEvents.map((day) => (
                <motion.li key={day.toISOString()} variants={staggerItem} className="relative">
                  <span
                    className={cn(
                      'absolute -left-[31px] top-1 flex h-2.5 w-2.5 rounded-full ring-4 ring-surface',
                      isToday(day) ? 'bg-brand-gradient' : 'bg-content-subtle'
                    )}
                    aria-hidden
                  />

                  <p className="mb-3 text-sm font-semibold text-content">
                    {format(day, 'EEEE, dd MMMM')}
                    <span className="ml-2 text-xs font-medium text-content-subtle">
                      {eventsOn(day).length} pass{eventsOn(day).length === 1 ? '' : 'es'}
                    </span>
                  </p>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {eventsOn(day).map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => openPass(event.id)}
                        className="card card-hover flex flex-col gap-2 p-4 text-left"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-content">{event.title}</p>
                          <StatusBadge status={event.status as GatePassStatus} />
                        </div>

                        <p className="truncate text-xs text-content-muted">{event.employeeName}</p>

                        <div className="mt-1 flex items-center justify-between gap-2">
                          <TypeBadge type={event.type as GatePassType} />
                          <span className="whitespace-nowrap text-2xs text-content-subtle">
                            {formatTime(event.start)} → {formatTime(event.end)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.li>
              ))}
            </motion.ol>
          )}
        </>
      )}

      {/* ── Day modal ─────────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? format(selected, 'EEEE, dd MMMM yyyy') : ''}
        description={`${selectedEvents.length} gate pass${selectedEvents.length === 1 ? '' : 'es'} on this day`}
        icon={<CalendarDays className="h-5 w-5" />}
        size="lg"
      >
        <ul className="space-y-2">
          {selectedEvents.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => openPass(event.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left transition-colors hover:border-brand-500/40 hover:bg-brand-500/[0.04]"
              >
                <span
                  className="h-9 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: statusMeta(event.status).color }}
                  aria-hidden
                />

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-content">
                    {event.title}
                  </span>
                  <span className="block truncate text-xs text-content-muted">
                    {event.employeeName} · {formatTime(event.start)} → {formatTime(event.end)}
                  </span>
                </span>

                <span className="hidden shrink-0 sm:block">
                  <TypeBadge type={event.type as GatePassType} />
                </span>
                <StatusBadge status={event.status as GatePassStatus} />
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </motion.div>
  );
};

export default CalendarView;
