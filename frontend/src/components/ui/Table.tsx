import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpDown, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { cn } from '@/utils/cn';
import { staggerContainer, staggerItem } from '@/animations/variants';
import { Button } from './Button';
import { TableSkeleton } from './Skeleton';
import type { PaginationMeta } from '@/types';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Render the cell. Receives the whole row, so a cell can compose fields. */
  render: (row: T, index: number) => ReactNode;
  /** Enables the sort affordance; the value is sent to the API as `sort`. */
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
  /** Hide on small screens — the card layout shows it instead. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  meta?: PaginationMeta;
  onPageChange?: (page: number) => void;
  sort?: string;
  onSortChange?: (sort: string) => void;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  /** Renders each row as a card below `md`. Supply it for any table on mobile. */
  mobileCard?: (row: T) => ReactNode;
  className?: string;
}

const HIDE_BELOW = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
  '2xl': 'hidden 2xl:table-cell',
} as const;

/**
 * The one table. It is responsive by construction: a real <table> from `md` up,
 * and a stack of cards below it — because a horizontally scrolling table on a
 * phone is a usability failure, not a layout.
 */
export function DataTable<T>({
  data,
  columns,
  isLoading,
  rowKey,
  onRowClick,
  meta,
  onPageChange,
  sort,
  onSortChange,
  emptyTitle = 'Nothing here yet',
  emptyMessage = 'Records will appear here once they exist.',
  emptyAction,
  mobileCard,
  className,
}: DataTableProps<T>) {
  if (isLoading) return <TableSkeleton columns={Math.min(columns.length, 6)} />;

  if (!data.length) {
    return (
      <EmptyState title={emptyTitle} message={emptyMessage} action={emptyAction} />
    );
  }

  const toggleSort = (key: string) => {
    if (!onSortChange) return;
    onSortChange(sort === key ? `-${key}` : sort === `-${key}` ? key : `-${key}`);
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* ── Desktop ───────────────────────────────────────────────────────── */}
      <div className={cn('card overflow-hidden p-0', mobileCard && 'hidden md:block')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface-sunken/50">
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn(
                      'whitespace-nowrap px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-content-muted',
                      column.hideBelow && HIDE_BELOW[column.hideBelow],
                      column.headerClassName
                    )}
                  >
                    {column.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className="inline-flex items-center gap-1.5 transition-colors hover:text-content"
                      >
                        {column.header}
                        <ArrowUpDown
                          className={cn(
                            'h-3.5 w-3.5 transition-colors',
                            (sort === column.key || sort === `-${column.key}`) && 'text-brand-500'
                          )}
                        />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>

            <motion.tbody variants={staggerContainer(0.03)} initial="initial" animate="animate">
              {data.map((row, index) => (
                <motion.tr
                  key={rowKey(row)}
                  variants={staggerItem}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'table-row-hover border-b border-line/60 last:border-0',
                    onRowClick && 'cursor-pointer'
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-5 py-4 text-sm text-content',
                        column.hideBelow && HIDE_BELOW[column.hideBelow],
                        column.className
                      )}
                    >
                      {column.render(row, index)}
                    </td>
                  ))}
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile ────────────────────────────────────────────────────────── */}
      {mobileCard && (
        <motion.div
          variants={staggerContainer(0.04)}
          initial="initial"
          animate="animate"
          className="space-y-3 md:hidden"
        >
          {data.map((row) => (
            <motion.div
              key={rowKey(row)}
              variants={staggerItem}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'cursor-pointer' : undefined}
            >
              {mobileCard(row)}
            </motion.div>
          ))}
        </motion.div>
      )}

      {meta && onPageChange && meta.totalPages > 1 && (
        <Pagination meta={meta} onPageChange={onPageChange} />
      )}
    </div>
  );
}

/* ─── Pagination ─────────────────────────────────────────────────────────── */
export const Pagination = ({
  meta,
  onPageChange,
}: {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
}) => {
  const { page, totalPages, total, limit } = meta;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  // Windowed page numbers: 1 … 4 5 [6] 7 8 … 20
  const pages: (number | '…')[] = [];
  const window = 1;
  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || (i >= page - window && i <= page + window)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '…') {
      pages.push('…');
    }
  }

  return (
    <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
      <p className="text-sm text-content-muted">
        Showing <span className="font-semibold text-content">{from}</span>–
        <span className="font-semibold text-content">{to}</span> of{' '}
        <span className="font-semibold text-content">{total}</span>
      </p>

      <nav className="flex items-center gap-1" aria-label="Pagination">
        <Button
          variant="ghost"
          size="icon"
          disabled={!meta.hasPrevPage}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {pages.map((value, index) =>
          value === '…' ? (
            <span key={`gap-${index}`} className="px-2 text-sm text-content-subtle">
              …
            </span>
          ) : (
            <Button
              key={value}
              variant={value === page ? 'primary' : 'ghost'}
              size="icon"
              onClick={() => onPageChange(value)}
              aria-current={value === page ? 'page' : undefined}
              className="text-sm tabular-nums"
            >
              {value}
            </Button>
          )
        )}

        <Button
          variant="ghost"
          size="icon"
          disabled={!meta.hasNextPage}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </nav>
    </div>
  );
};

/* ─── Empty state ────────────────────────────────────────────────────────── */
export const EmptyState = ({
  title,
  message,
  action,
  icon,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.97 }}
    animate={{ opacity: 1, scale: 1 }}
    className="card flex flex-col items-center justify-center px-6 py-16 text-center"
  >
    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand-500">
      {icon ?? <Inbox className="h-7 w-7" />}
    </div>
    <h3 className="text-base font-semibold text-content">{title}</h3>
    {message && <p className="mt-1.5 max-w-sm text-sm text-content-muted">{message}</p>}
    {action && <div className="mt-6">{action}</div>}
  </motion.div>
);

export default DataTable;
