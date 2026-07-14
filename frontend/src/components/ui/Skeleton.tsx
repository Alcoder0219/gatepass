import type { CSSProperties } from 'react';
import { cn } from '@/utils/cn';

export const Skeleton = ({ className, style }: { className?: string; style?: CSSProperties }) => (
  <div className={cn('skeleton h-4 w-full', className)} style={style} aria-hidden />
);

/** Mirrors the real card's geometry so the swap to loaded content doesn't jump. */
export const StatCardSkeleton = () => (
  <div className="card p-5">
    <div className="flex items-start justify-between">
      <div className="flex-1 space-y-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-12 w-12 rounded-xl" />
    </div>
  </div>
);

export const TableSkeleton = ({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) => (
  <div className="card overflow-hidden p-0">
    <div className="flex gap-4 border-b border-line px-5 py-4">
      {Array.from({ length: columns }).map((_, index) => (
        <Skeleton key={index} className="h-3 flex-1" />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, row) => (
      <div key={row} className="flex items-center gap-4 border-b border-line/60 px-5 py-4 last:border-0">
        {Array.from({ length: columns }).map((_, column) => (
          <Skeleton
            key={column}
            className={cn("h-4 flex-1", column === 0 && "max-w-[140px]")}
            // Fade successive rows so the block reads as depth, not a flat grid.
            style={{ opacity: 1 - row * 0.08 } as React.CSSProperties}
          />
        ))}
      </div>
    ))}
  </div>
);

export const ChartSkeleton = ({ className }: { className?: string }) => (
  <div className={cn('card p-6', className)}>
    <Skeleton className="mb-6 h-4 w-40" />
    <div className="flex h-56 items-end gap-3">
      {[45, 70, 55, 85, 60, 95, 50, 75].map((height, index) => (
        <Skeleton key={index} className="flex-1 rounded-t-lg" style={{ height: `${height}%` } as React.CSSProperties} />
      ))}
    </div>
  </div>
);

export const ListSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, index) => (
      <div key={index} className="card flex items-center gap-4 p-4">
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    ))}
  </div>
);

export const DetailSkeleton = () => (
  <div className="space-y-6">
    <div className="card p-6">
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    </div>
    <ListSkeleton rows={3} />
  </div>
);

export default Skeleton;
