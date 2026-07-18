import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, FileText } from 'lucide-react';
import { DataTable, StatusBadge, TypeBadge, Avatar, type Column } from '@/components/ui';
import { formatSmartDateTime, formatDateTime } from '@/utils/format';
import type { GatePass, PaginationMeta } from '@/types';

export interface GatePassTableProps {
  data: GatePass[];
  isLoading?: boolean;
  meta?: PaginationMeta;
  onPageChange?: (page: number) => void;
  sort?: string;
  onSortChange?: (sort: string) => void;
  /** Where a row click navigates. Defaults to the generic detail route. */
  basePath?: string;
  /** Extra column pinned to the right — the approve/review/exit actions. */
  actionColumn?: Column<GatePass>;
  /** Hide the employee column on screens that only ever show one person's passes. */
  hideEmployee?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
}

/**
 * The one gate pass table. Every list screen (mine, all, approvals, HR queue,
 * security queue, reports) renders through this, so a status pill, a date or an
 * employee cell looks identical everywhere.
 */
export const GatePassTable = ({
  data,
  isLoading,
  meta,
  onPageChange,
  sort,
  onSortChange,
  basePath = '/gate-pass',
  actionColumn,
  hideEmployee,
  emptyTitle = 'No gate passes found',
  emptyMessage = 'Nothing matches these filters yet.',
  emptyAction,
}: GatePassTableProps) => {
  const navigate = useNavigate();

  /* These four props feed a memoized row. Rebuilt inline (as they were), each one
   * arrives with a fresh identity on every render and the memo never hits — so
   * every keystroke in a parent's search box re-rendered all 20 rows. */
  const columns: Column<GatePass>[] = useMemo(() => [
    {
      key: 'gatePassNumber',
      header: 'Gate Pass',
      sortable: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-semibold text-content">{row.gatePassNumber}</p>
          <p className="truncate text-xs text-content-muted">{row.unitName}</p>
        </div>
      ),
    },

    ...(hideEmployee
      ? []
      : [
          {
            key: 'employeeName',
            header: 'Employee',
            sortable: true,
            render: (row: GatePass) => (
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar
                  name={row.employeeName}
                  src={typeof row.employee === 'object' ? row.employee.profileImage : undefined}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-content">{row.employeeName}</p>
                  <p className="truncate text-xs text-content-muted">
                    {row.employeeCode} · {row.departmentName}
                  </p>
                </div>
              </div>
            ),
          } satisfies Column<GatePass>,
        ]),

    {
      key: 'type',
      header: 'Type',
      hideBelow: 'lg',
      render: (row) => <TypeBadge type={row.type} />,
    },

    {
      // Held back to 2xl: below that, this column's width is what pushes a
      // right-hand action button (Approve, Mark Exit) out past the card edge.
      key: 'reason',
      header: 'Reason',
      hideBelow: '2xl',
      className: 'max-w-[220px]',
      render: (row) => (
        <p className="truncate text-sm text-content-muted" title={row.reason}>
          {row.reason}
        </p>
      ),
    },

    {
      key: 'expectedOutTime',
      header: 'Out → In',
      sortable: true,
      hideBelow: 'md',
      render: (row) => (
        <div className="whitespace-nowrap text-sm">
          <p className="text-content">{formatSmartDateTime(row.expectedOutTime)}</p>
          <p className="text-xs text-content-muted">→ {formatDateTime(row.expectedInTime)}</p>
        </div>
      ),
    },

    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={row.status} pulse={row.status === 'OUT'} />
          {row.isLate && (
            <span className="inline-flex items-center gap-1 text-2xs font-semibold text-danger-500">
              <Clock className="h-3 w-3" />
              {row.lateByMinutes}m late
            </span>
          )}
        </div>
      ),
    },

    ...(actionColumn ? [actionColumn] : []),
  ], [hideEmployee, actionColumn]);

  const rowKey = useCallback((row: GatePass) => row._id, []);
  const onRowClick = useCallback(
    (row: GatePass) => navigate(`${basePath}/${row._id}`),
    [navigate, basePath]
  );

  const mobileCard = useCallback(
    (row: GatePass) => (

        <div className="card card-hover p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-semibold text-content">
                  {row.gatePassNumber}
                </p>
                {!hideEmployee && (
                  <p className="truncate text-xs text-content-muted">
                    {row.employeeName} · {row.employeeCode}
                  </p>
                )}
              </div>
            </div>
            <StatusBadge status={row.status} pulse={row.status === 'OUT'} />
          </div>

          <p className="mt-3 line-clamp-2 text-sm text-content-muted">{row.reason}</p>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
            <TypeBadge type={row.type} />
            <p className="truncate text-xs text-content-subtle">
              {formatSmartDateTime(row.expectedOutTime)}
            </p>
          </div>
        </div>
    ),
    [hideEmployee]
  );

  return (
    <DataTable
      data={data}
      columns={columns}
      isLoading={isLoading}
      rowKey={rowKey}
      onRowClick={onRowClick}
      meta={meta}
      onPageChange={onPageChange}
      sort={sort}
      onSortChange={onSortChange}
      emptyTitle={emptyTitle}
      emptyMessage={emptyMessage}
      emptyAction={emptyAction}
      mobileCard={mobileCard}
    />
  );
};

export default GatePassTable;
