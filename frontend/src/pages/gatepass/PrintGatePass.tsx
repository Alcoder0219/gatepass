import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { gatePassApi } from '@/services/endpoints';
import { errorMessage } from '@/services/api';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import { STATUS_META, TYPE_META } from '@/permissions/constants';
import { formatDateTime, formatDuration } from '@/utils/format';
import type { GatePass } from '@/types';

/** `/gate-passes/:id/print` returns the pass plus the company letterhead. */
type PrintPayload = GatePass & {
  company: { name: string; logo: string; address: string; email: string; phone: string };
  printedAt: string;
  printedBy: { id: string; name: string };
};

const SIGNATORIES = ['Employee', 'Reporting Manager', 'HR', 'Security'];

/** One bordered row of the detail table. */
const Row = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <tr>
    <th
      scope="row"
      className="w-[30%] border border-slate-300 bg-slate-100 px-3 py-1.5 text-left align-top text-[11px] font-semibold uppercase tracking-wide text-slate-600"
    >
      {label}
    </th>
    <td className="border border-slate-300 px-3 py-1.5 align-top text-[13px] text-slate-900">
      {value || '—'}
    </td>
  </tr>
);

const PrintGatePass = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['gate-passes', 'print', id],
    queryFn: async () => (await gatePassApi.print(id)) as unknown as PrintPayload,
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[210mm] space-y-4 p-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[60vh] w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <EmptyState
          title="This gate pass cannot be printed"
          message={errorMessage(error, 'It may have been deleted, or you may not have access to it.')}
          action={
            <Button
              variant="secondary"
              leftIcon={<ArrowLeft className="h-4 w-4" />}
              onClick={() => navigate(-1)}
            >
              Go back
            </Button>
          }
        />
      </div>
    );
  }

  const durationMinutes = Math.round(
    (new Date(data.expectedInTime).getTime() - new Date(data.expectedOutTime).getTime()) / 60_000
  );

  const approvedBy = data.approval?.approvedBy;
  const approver =
    approvedBy && typeof approvedBy === 'object'
      ? `${approvedBy.name} · ${formatDateTime(data.approval?.approvedAt)}`
      : '';

  return (
    <div className="min-h-dvh bg-surface-sunken py-6 print:bg-white print:py-0">
      {/* ── Toolbar (screen only) ─────────────────────────────────────────── */}
      <div className="no-print mx-auto mb-5 flex max-w-[210mm] items-center justify-between gap-3 px-4">
        <Button
          variant="ghost"
          leftIcon={<ArrowLeft className="h-4 w-4" />}
          onClick={() => navigate(-1)}
        >
          Back
        </Button>
        <Button leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
          Print
        </Button>
      </div>

      {/* ── The sheet ─────────────────────────────────────────────────────────
          Deliberately literal light "paper" rather than themed surfaces: a
          print-out is not app chrome, and a dark background would burn toner
          and stop the QR from scanning. ─────────────────────────────────────*/}
      <article className="print-page mx-auto max-w-[210mm] bg-white p-8 text-slate-900 shadow-glass print:p-6 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold uppercase tracking-tight text-slate-900">
              {data.company?.name || 'Company'}
            </h1>
            {data.company?.address && (
              <p className="mt-1 text-[11px] leading-snug text-slate-600">{data.company.address}</p>
            )}
            <p className="text-[11px] text-slate-600">
              {[data.company?.email, data.company?.phone].filter(Boolean).join(' · ')}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Gate Pass
            </p>
            <p className="text-[11px] text-slate-600">
              {TYPE_META[data.type]?.label} · {STATUS_META[data.status]?.label}
            </p>
          </div>
        </header>

        {/* Number + QR, side by side. */}
        <section className="mt-5 flex items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Gate pass number
            </p>
            <p className="font-mono text-2xl font-bold tracking-tight text-slate-900">
              {data.gatePassNumber}
            </p>
            <p className="mt-1 text-[11px] text-slate-600">Raised on {formatDateTime(data.createdAt)}</p>
          </div>

          {data.qrCode && (
            <div className="shrink-0 text-center">
              <img
                src={data.qrCode}
                alt={`QR code for ${data.gatePassNumber}`}
                className="h-28 w-28 border border-slate-300 bg-white p-1"
              />
              <p className="mt-1 text-[10px] text-slate-500">Scan at the gate</p>
            </div>
          )}
        </section>

        <table className="mt-5 w-full border-collapse">
          <tbody>
            <Row label="Employee" value={`${data.employeeName} (${data.employeeCode})`} />
            <Row label="Designation" value={data.designation} />
            <Row label="Department" value={data.departmentName} />
            <Row label="Unit" value={data.unitName} />
            <Row label="Reporting manager" value={data.reportingManagerName} />
            <Row label="Type" value={TYPE_META[data.type]?.label} />
            <Row label="Reason" value={data.reason} />
            <Row label="Purpose" value={data.purpose} />
            <Row label="Expected out" value={formatDateTime(data.expectedOutTime)} />
            <Row label="Expected in" value={formatDateTime(data.expectedInTime)} />
            <Row label="Planned duration" value={formatDuration(durationMinutes)} />
            <Row label="Actual out" value={formatDateTime(data.security?.actualOutTime)} />
            <Row label="Actual in" value={formatDateTime(data.security?.actualInTime)} />
            <Row label="Approved by" value={approver} />
            <Row label="Remarks" value={data.remarks} />
          </tbody>
        </table>

        <section className="mt-10 grid grid-cols-4 gap-4">
          {SIGNATORIES.map((who) => (
            <div key={who} className="text-center">
              <div className="h-12 border-b border-slate-400" />
              <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                {who}
              </p>
            </div>
          ))}
        </section>

        <footer className="mt-8 flex items-center justify-between border-t border-slate-300 pt-3 text-[10px] text-slate-500">
          <span>
            Generated {formatDateTime(data.printedAt)}
            {data.printedBy?.name ? ` by ${data.printedBy.name}` : ''}
          </span>
          <span className="font-mono">{data.gatePassNumber}</span>
        </footer>
      </article>
    </div>
  );
};

export default PrintGatePass;
