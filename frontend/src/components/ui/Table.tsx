import { memo, useCallback, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpDown, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { cn } from '@/utils/cn';
import { staggerContainer, staggerItem } from '@/animations/variants';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { Button } from './Button';
import { TableSkeleton } from './Skeleton';
import type { PaginationMeta } from '@/types';

/* Hoisted out of render: staggerContainer() is a factory, and calling it inline
 * minted a fresh Variants object on every render of every table, which framer
 * treats as a changed animation definition. */
const ROW_STAGGER = staggerContainer(0.03);
const CARD_STAGGER = staggerContainer(0.04);

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

/* ─── Row ────────────────────────────────────────────────────────────────────
 * Split out and memoized. Before this, every row and every cell re-rendered on
 * any parent state change — so a keystroke in a page-level search box re-ran
 * `column.render()` for all 20 rows × 7 columns. The row only re-renders now if
 * its own data, the column set, or the click handler actually changes.
 *
 * This memo is only worth anything if the caller keeps `columns` and `onRowClick`
 * stable — see the useMemo/useCallback in the table's consumers.
 * ────────────────────────────────────────────────────────────────────────── */
interface RowProps<T> {
  row: T;
  index: number;
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
}

const TableRowInner = <T,>({ row, index, columns, onRowClick }: RowProps<T>) => {
  const handleClick = useCallback(() => onRowClick?.(row), [onRowClick, row]);

  return (
    <motion.tr
      variants={staggerItem}
      onClick={onRowClick ? handleClick : undefined}
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
  );
};

const TableRow = memo(TableRowInner) as typeof TableRowInner;

interface CardProps<T> {
  row: T;
  onRowClick?: (row: T) => void;
  mobileCard: (row: T) => ReactNode;
}

const MobileCardInner = <T,>({ row, onRowClick, mobileCard }: CardProps<T>) => {
  const handleClick = useCallback(() => onRowClick?.(row), [onRowClick, row]);

  return (
    <motion.div
      variants={staggerItem}
      onClick={onRowClick ? handleClick : undefined}
      className={onRowClick ? 'cursor-pointer' : undefined}
    >
      {mobileCard(row)}
    </motion.div>
  );
};

const MobileCard = memo(MobileCardInner) as typeof MobileCardInner;

/**
 * The one table. It is responsive by construction: a real <table> from `md` up,
 * and a stack of cards below it — because a horizontally scrolling table on a
 * phone is a usability failure, not a layout.
 *
 * Note on virtualization: deliberately none. Every list here is paginated
 * server-side at 20 rows, so a windowing library would add a dependency and a
 * class of scroll bugs to virtualize twenty elements. If a page ever raises that
 * limit or grows an "show all" view, revisit — until then, memoized rows are the
 * correct and cheaper answer.
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
  /* Render ONE layout, not both. The card branch used to be built for every row
   * and merely hidden with `md:hidden`, so a 20-row list mounted 20 rows AND 20
   * cards — double the reconciliation and double the DOM, permanently. */
  const isDesktop = useIsDesktop();
  const showCards = Boolean(mobileCard) && !isDesktop;

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
      {!showCards && (
      <div className="card overflow-hidden p-0">
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

            <motion.tbody variants={ROW_STAGGER} initial="initial" animate="animate">
              {data.map((row, index) => (
                <TableRow
                  key={rowKey(row)}
                  row={row}
                  index={index}
                  columns={columns}
                  onRowClick={onRowClick}
                />
              ))}
            </motion.tbody>
          </table>
        </div>
      </div>
      )}

      {/* ── Mobile ────────────────────────────────────────────────────────── */}
      {showCards && mobileCard && (
        <motion.div
          variants={CARD_STAGGER}
          initial="initial"
          animate="animate"
          className="space-y-3"
        >
          {data.map((row) => (
            <MobileCard
              key={rowKey(row)}
              row={row}
              onRowClick={onRowClick}
              mobileCard={mobileCard}
            />
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
