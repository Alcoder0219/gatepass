import { memo, useId, type ReactElement, type ReactNode } from 'react';
import {
  Area,
  AreaChart as RechartsAreaChart,
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { LineChart as LineChartIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import { CHART_COLORS, STATUS_META, TYPE_META } from '@/permissions/constants';
import { cn } from '@/utils/cn';
import { formatNumber } from '@/utils/format';
import type { GatePassStatus } from '@/types';

/* ───────────────────────────────────────────────────────────────────────────
 * Shared axis / grid vocabulary.
 *
 * Every colour resolves through a CSS custom property or the palette maps, so
 * a chart is legible in light AND dark without a single conditional: the token
 * changes value, the chart does not change code.
 * ─────────────────────────────────────────────────────────────────────────── */
const AXIS_LINE = 'rgb(var(--line))';
const TICK = { fill: 'rgb(var(--content-muted))', fontSize: 12 } as const;

const GRID = (
  /* Vertical lines are noise on a time series — horizontal rules only. */
  <CartesianGrid vertical={false} strokeDasharray="4 6" stroke={AXIS_LINE} strokeOpacity={0.7} />
);

const ANIMATION = { isAnimationActive: true, animationDuration: 800, animationEasing: 'ease-out' } as const;

/* ─── Tooltip ────────────────────────────────────────────────────────────────
 * The Recharts default tooltip — a white box with a 1px grey border — is the
 * single biggest tell of an off-the-shelf dashboard. This one is a glass card
 * that matches every other surface in the app.
 * ─────────────────────────────────────────────────────────────────────────── */
export interface ChartTooltipProps extends TooltipProps<number, string> {
  /** Formats each value. Defaults to a grouped integer. */
  valueFormatter?: (value: number) => string;
  /** Appends a summed "Total" row — useful on stacked series. */
  showTotal?: boolean;
  /** Overrides the heading (defaults to the category label). */
  labelFormatter?: (label: string) => string;
}

export const ChartTooltip = ({
  active,
  payload,
  label,
  valueFormatter = (value) => formatNumber(value),
  showTotal,
  labelFormatter,
}: ChartTooltipProps) => {
  if (!active || !payload?.length) return null;

  const heading = label === undefined || label === null ? '' : String(label);
  const rows = payload.filter((entry) => entry.value !== undefined && entry.value !== null);
  const total = rows.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);

  return (
    <div className="glass-strong pointer-events-none min-w-[9rem] rounded-xl px-3 py-2.5 shadow-glass-lg">
      {heading && (
        <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-content-muted">
          {labelFormatter ? labelFormatter(heading) : heading}
        </p>
      )}

      <ul className="space-y-1">
        {rows.map((entry, index) => (
          <li
            key={`${String(entry.dataKey ?? entry.name ?? index)}`}
            className="flex items-center justify-between gap-4 text-xs"
          >
            <span className="flex items-center gap-1.5 text-content-muted">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color ?? CHART_COLORS[index % CHART_COLORS.length] }}
              />
              {entry.name}
            </span>
            <span className="font-semibold tabular-nums text-content">
              {valueFormatter(Number(entry.value) || 0)}
            </span>
          </li>
        ))}
      </ul>

      {showTotal && rows.length > 1 && (
        <div className="mt-2 flex items-center justify-between gap-4 border-t border-line pt-1.5 text-xs">
          <span className="text-content-muted">Total</span>
          <span className="font-bold tabular-nums text-content">{valueFormatter(total)}</span>
        </div>
      )}
    </div>
  );
};

/* ─── Frame ──────────────────────────────────────────────────────────────────
 * Every chart is width-fluid (ResponsiveContainer) with a min-height wrapper,
 * so it reflows at 375px instead of overflowing the card.
 * ─────────────────────────────────────────────────────────────────────────── */
const ChartFrame = ({
  isEmpty,
  height,
  emptyTitle,
  emptyMessage,
  className,
  children,
}: {
  isEmpty: boolean;
  height: number;
  emptyTitle: string;
  emptyMessage: string;
  className?: string;
  children: ReactElement;
}) => {
  if (isEmpty) {
    return (
      <EmptyState
        title={emptyTitle}
        message={emptyMessage}
        icon={<LineChartIcon className="h-7 w-7" />}
      />
    );
  }

  return (
    <div className={cn('w-full', className)} style={{ minHeight: height }}>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  );
};

/** Dot-and-label legend — Recharts' own legend cannot be themed properly. */
export const ChartLegend = ({
  items,
  className,
}: {
  items: { name: string; color: string; value?: ReactNode }[];
  className?: string;
}) => (
  <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
    {items.map((item) => (
      <li key={item.name} className="flex items-center gap-1.5 text-xs text-content-muted">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
        <span>{item.name}</span>
        {item.value !== undefined && (
          <span className="font-semibold tabular-nums text-content">{item.value}</span>
        )}
      </li>
    ))}
  </ul>
);

/* ─── Area trend ─────────────────────────────────────────────────────────── */
export interface TrendPoint {
  label: string;
  official: number;
  personal: number;
  total?: number;
  /** Room for a derived series (e.g. the previous period in comparison mode). */
  [key: string]: string | number | undefined;
}

export interface AreaTrendChartProps {
  data: TrendPoint[];
  height?: number;
  /** Overlays a dashed reference series — used by Analytics' comparison mode. */
  comparison?: { key: string; name: string };
  emptyMessage?: string;
}

const AreaTrendChartInner = ({
  data,
  height = 300,
  comparison,
  emptyMessage = 'No gate passes were raised in this period.',
}: AreaTrendChartProps) => {
  const gradientId = useId().replace(/:/g, '');

  return (
    <ChartFrame
      isEmpty={!data.length}
      height={height}
      emptyTitle="No trend to show"
      emptyMessage={emptyMessage}
    >
      <RechartsAreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id={`${gradientId}-official`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TYPE_META.OFFICIAL.color} stopOpacity={0.34} />
            <stop offset="100%" stopColor={TYPE_META.OFFICIAL.color} stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`${gradientId}-personal`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TYPE_META.PERSONAL.color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={TYPE_META.PERSONAL.color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {GRID}

        <XAxis
          dataKey="label"
          stroke={AXIS_LINE}
          tick={TICK}
          tickLine={false}
          axisLine={{ stroke: AXIS_LINE }}
          minTickGap={16}
        />
        <YAxis
          stroke={AXIS_LINE}
          tick={TICK}
          tickLine={false}
          axisLine={false}
          width={44}
          allowDecimals={false}
        />

        <RechartsTooltip
          content={<ChartTooltip showTotal />}
          cursor={{ stroke: AXIS_LINE, strokeWidth: 1 }}
        />

        <Area
          {...ANIMATION}
          type="monotone"
          dataKey="official"
          name="Official"
          stroke={TYPE_META.OFFICIAL.color}
          strokeWidth={2}
          fill={`url(#${gradientId}-official)`}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--surface))' }}
        />
        <Area
          {...ANIMATION}
          type="monotone"
          dataKey="personal"
          name="Personal"
          stroke={TYPE_META.PERSONAL.color}
          strokeWidth={2}
          fill={`url(#${gradientId}-personal)`}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--surface))' }}
        />

        {comparison && (
          <Area
            {...ANIMATION}
            type="monotone"
            dataKey={comparison.key}
            name={comparison.name}
            stroke={CHART_COLORS[4]}
            strokeWidth={2}
            strokeDasharray="5 5"
            fill="transparent"
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--surface))' }}
          />
        )}
      </RechartsAreaChart>
    </ChartFrame>
  );
};

/* ─── Bar ────────────────────────────────────────────────────────────────── */
export interface BarDatum {
  name: string;
  value: number;
  /** Overrides the categorical palette (e.g. a status-tinted bar). */
  color?: string;
}

export interface BarChartProps {
  data: BarDatum[];
  /** `horizontal` puts the categories on the Y axis — right for long names. */
  orientation?: 'vertical' | 'horizontal';
  height?: number;
  valueName?: string;
  emptyMessage?: string;
}

const BarChartInner = ({
  data,
  orientation = 'vertical',
  height = 300,
  valueName = 'Passes',
  emptyMessage = 'Nothing to break down yet.',
}: BarChartProps) => {
  const horizontal = orientation === 'horizontal';

  return (
    <ChartFrame
      isEmpty={!data.length}
      height={height}
      emptyTitle="No data"
      emptyMessage={emptyMessage}
    >
      <RechartsBarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={
          horizontal
            ? { top: 4, right: 16, left: 4, bottom: 4 }
            : { top: 8, right: 8, left: -18, bottom: 0 }
        }
        barCategoryGap={horizontal ? '28%' : '30%'}
      >
        <CartesianGrid
          vertical={horizontal}
          horizontal={!horizontal}
          strokeDasharray="4 6"
          stroke={AXIS_LINE}
          strokeOpacity={0.7}
        />

        {horizontal ? (
          <>
            <XAxis
              type="number"
              stroke={AXIS_LINE}
              tick={TICK}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke={AXIS_LINE}
              tick={TICK}
              tickLine={false}
              axisLine={{ stroke: AXIS_LINE }}
              width={110}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey="name"
              stroke={AXIS_LINE}
              tick={TICK}
              tickLine={false}
              axisLine={{ stroke: AXIS_LINE }}
              interval={0}
              height={48}
              angle={-20}
              textAnchor="end"
            />
            <YAxis
              stroke={AXIS_LINE}
              tick={TICK}
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
            />
          </>
        )}

        <RechartsTooltip
          content={<ChartTooltip />}
          cursor={{ fill: 'rgb(var(--content-muted) / 0.06)' }}
        />

        <Bar
          {...ANIMATION}
          dataKey="value"
          name={valueName}
          radius={horizontal ? [0, 8, 8, 0] : [8, 8, 0, 0]}
          maxBarSize={horizontal ? 22 : 48}
        >
          {data.map((entry, index) => (
            <Cell
              key={entry.name}
              fill={entry.color ?? CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Bar>
      </RechartsBarChart>
    </ChartFrame>
  );
};

/* ─── Donut ──────────────────────────────────────────────────────────────── */
export interface DonutDatum {
  name: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  data: DonutDatum[];
  height?: number;
  /** The word under the total in the middle of the ring. */
  centreLabel?: string;
  showLegend?: boolean;
  emptyMessage?: string;
}

const DonutChartInner = ({
  data,
  height = 300,
  centreLabel = 'Total',
  showLegend = true,
  emptyMessage = 'No gate passes match this view.',
}: DonutChartProps) => {
  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  if (!data.length || total === 0) {
    return (
      <EmptyState
        title="Nothing to split"
        message={emptyMessage}
        icon={<LineChartIcon className="h-7 w-7" />}
      />
    );
  }

  return (
    <div className="w-full">
      <div className="relative w-full" style={{ minHeight: height }}>
        <ResponsiveContainer width="100%" height={height}>
          <RechartsPieChart>
            <RechartsTooltip content={<ChartTooltip />} />
            <Pie
              {...ANIMATION}
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={2}
              stroke="rgb(var(--surface))"
              strokeWidth={2}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
          </RechartsPieChart>
        </ResponsiveContainer>

        {/* Centre label — a DOM node, not SVG text, so it inherits the type scale. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums tracking-tight text-content">
            {formatNumber(total)}
          </span>
          <span className="text-2xs font-semibold uppercase tracking-wider text-content-subtle">
            {centreLabel}
          </span>
        </div>
      </div>

      {showLegend && (
        <ChartLegend
          className="mt-4 justify-center"
          items={data.map((entry) => ({
            name: entry.name,
            color: entry.color,
            value: entry.value,
          }))}
        />
      )}
    </div>
  );
};

/* ─── Stacked bar ────────────────────────────────────────────────────────── */
export interface StackedDatum {
  name: string;
  approved: number;
  rejected: number;
  pending: number;
}

const STACK_SERIES: { key: keyof Omit<StackedDatum, 'name'>; name: string; status: GatePassStatus }[] = [
  { key: 'approved', name: 'Approved', status: 'APPROVED' },
  { key: 'pending', name: 'Pending', status: 'PENDING' },
  { key: 'rejected', name: 'Rejected', status: 'REJECTED' },
];

const StackedBarChartInner = ({
  data,
  height = 320,
  emptyMessage = 'No approver activity in this period.',
}: {
  data: StackedDatum[];
  height?: number;
  emptyMessage?: string;
}) => (
  <ChartFrame
    isEmpty={!data.length}
    height={height}
    emptyTitle="No approver data"
    emptyMessage={emptyMessage}
  >
    <RechartsBarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="30%">
      {GRID}

      <XAxis
        dataKey="name"
        stroke={AXIS_LINE}
        tick={TICK}
        tickLine={false}
        axisLine={{ stroke: AXIS_LINE }}
        interval={0}
        height={48}
        angle={-20}
        textAnchor="end"
      />
      <YAxis
        stroke={AXIS_LINE}
        tick={TICK}
        tickLine={false}
        axisLine={false}
        width={44}
        allowDecimals={false}
      />

      <RechartsTooltip
        content={<ChartTooltip showTotal />}
        cursor={{ fill: 'rgb(var(--content-muted) / 0.06)' }}
      />

      {STACK_SERIES.map((series, index) => (
        <Bar
          {...ANIMATION}
          key={series.key}
          dataKey={series.key}
          name={series.name}
          stackId="workflow"
          fill={STATUS_META[series.status].color}
          maxBarSize={48}
          /* Only the top-most segment gets the rounded cap. */
          radius={index === STACK_SERIES.length - 1 ? [8, 8, 0, 0] : [0, 0, 0, 0]}
        />
      ))}
    </RechartsBarChart>
  </ChartFrame>
);

/* ─── Line ───────────────────────────────────────────────────────────────── */
export interface LineSeries {
  key: string;
  name: string;
  color?: string;
  dashed?: boolean;
}

export interface LineChartProps {
  data: Record<string, string | number | undefined>[];
  series: LineSeries[];
  xKey?: string;
  height?: number;
  emptyMessage?: string;
}

const LineChartInner = ({
  data,
  series,
  xKey = 'label',
  height = 300,
  emptyMessage = 'No series to plot yet.',
}: LineChartProps) => (
  <ChartFrame
    isEmpty={!data.length || !series.length}
    height={height}
    emptyTitle="No data"
    emptyMessage={emptyMessage}
  >
    <RechartsLineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
      {GRID}

      <XAxis
        dataKey={xKey}
        stroke={AXIS_LINE}
        tick={TICK}
        tickLine={false}
        axisLine={{ stroke: AXIS_LINE }}
        minTickGap={16}
      />
      <YAxis
        stroke={AXIS_LINE}
        tick={TICK}
        tickLine={false}
        axisLine={false}
        width={44}
        allowDecimals={false}
      />

      <RechartsTooltip content={<ChartTooltip />} cursor={{ stroke: AXIS_LINE, strokeWidth: 1 }} />

      {series.map((item, index) => (
        <Line
          {...ANIMATION}
          key={item.key}
          type="monotone"
          dataKey={item.key}
          name={item.name}
          stroke={item.color ?? CHART_COLORS[index % CHART_COLORS.length]}
          strokeWidth={2}
          strokeDasharray={item.dashed ? '5 5' : undefined}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--surface))' }}
        />
      ))}
    </RechartsLineChart>
  </ChartFrame>
);

/* ─── Helpers shared by the analytics pages ──────────────────────────────── */

/** Maps the API's `{ status, count }[]` onto donut slices with the status palette. */
export const toStatusSlices = (
  rows: { status: GatePassStatus | string; count: number }[]
): DonutDatum[] =>
  rows
    .filter((row) => row.count > 0)
    .map((row) => {
      const meta = STATUS_META[row.status as GatePassStatus] ?? STATUS_META.DRAFT;
      return { name: meta.label, value: row.count, color: meta.color };
    });

/** Maps the API's `{ name, count }[]` onto bars, longest first. */
export const toBars = (rows: { name: string; count: number }[], limit = 8): BarDatum[] =>
  [...rows]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((row) => ({ name: row.name, value: row.count }));

/* ─── Memoized exports ───────────────────────────────────────────────────────
 * recharts re-walks and re-animates its whole SVG tree on every render. None of
 * these were memoized, so toggling a period filter on Analytics — or any
 * unrelated query settling on the Dashboard — re-rendered and re-animated all
 * five charts. Their data props are already useMemo'd by the callers, so these
 * memos actually hold.
 * ────────────────────────────────────────────────────────────────────────── */
export const AreaTrendChart = memo(AreaTrendChartInner) as typeof AreaTrendChartInner;
export const BarChart = memo(BarChartInner) as typeof BarChartInner;
export const DonutChart = memo(DonutChartInner) as typeof DonutChartInner;
export const StackedBarChart = memo(StackedBarChartInner) as typeof StackedBarChartInner;
export const LineChart = memo(LineChartInner) as typeof LineChartInner;
