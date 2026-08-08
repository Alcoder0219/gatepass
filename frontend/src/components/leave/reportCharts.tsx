import {
  BarChart as BaseBarChart,
  DonutChart as BaseDonutChart,
  LineChart as BaseLineChart,
  toBars as baseToBars,
} from '@/components/charts';
import { CHART_COLORS } from '@/permissions/constants';
import type { ReportChart } from '@/types/leave';

/**
 * Adapters onto the existing chart components.
 *
 * The report API speaks `{ name, count }`; the charts want `{ name, value }`
 * (and the donut wants a colour per slice). Translating here keeps both sides
 * unchanged — no gate pass chart component is modified.
 */

export const CHART_HEIGHT = 280;

export const toBars = baseToBars;

export const BarChart = ({
  data,
  height = CHART_HEIGHT,
}: {
  data: { name: string; value: number }[];
  height?: number;
}) => (
  <BaseBarChart
    data={data}
    height={height}
    orientation={data.some((row) => row.name.length > 12) ? 'horizontal' : 'vertical'}
    valueName="Days"
  />
);

export const DonutChart = ({
  data,
  height = CHART_HEIGHT,
}: {
  data: ReportChart['data'];
  height?: number;
}) => (
  <BaseDonutChart
    data={data
      .filter((row) => row.count > 0)
      .map((row, index) => ({
        name: row.name,
        value: row.count,
        color: CHART_COLORS[index % CHART_COLORS.length],
      }))}
    height={height}
    centreLabel="Total"
  />
);

export const LineChart = ({
  data,
  height = CHART_HEIGHT,
}: {
  data: ReportChart['data'];
  height?: number;
}) => (
  <BaseLineChart
    data={data.map((row) => ({ label: row.name, applications: row.count, days: row.days ?? 0 }))}
    series={[
      { key: 'applications', name: 'Applications', color: CHART_COLORS[0] },
      { key: 'days', name: 'Days', color: CHART_COLORS[1], dashed: true },
    ]}
    height={height}
  />
);

export default { BarChart, DonutChart, LineChart, toBars, CHART_HEIGHT };
