import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  AlarmClock,
  ArrowRightLeft,
  Camera,
  Check,
  DoorOpen,
  History,
  LogIn,
  LogOut,
  ScanLine,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { GatePassTable } from '@/components/gatepass/GatePassTable';
import { QRScanner } from '@/components/security/QRScanner';
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  Input,
  Modal,
  StatCard,
  StatCardSkeleton,
  Tabs,
  Textarea,
  TypeBadge,
  type Column,
} from '@/components/ui';
import { usePermissions } from '@/permissions/usePermissions';
import { PERMISSION } from '@/permissions/constants';
import { errorMessage } from '@/services/api';
import { securityApi } from '@/services/endpoints';
import { staggerContainer } from '@/animations/variants';
import { assetUrl, formatDateTime, formatDuration, formatSmartDateTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { GatePass, SecurityLog, SecurityVerification } from '@/types';

type OutPass = GatePass & { isOverdue?: boolean; overdueByMinutes?: number };
type GateAction = 'EXIT' | 'ENTRY';
type Method = 'QR' | 'MANUAL' | 'SEARCH';

interface PendingAction {
  pass: GatePass;
  action: GateAction;
  method: Method;
}

const minutesSince = (value?: string | null) =>
  value ? Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000)) : null;

/* ─── The checkmark that tells a guard the gate is cleared ────────────────── */
const SuccessBurst = ({ label }: { label: string }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    className="flex flex-col items-center gap-4 py-8 text-center"
  >
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 16 }}
      className="flex h-24 w-24 items-center justify-center rounded-full bg-success-500/15 text-success-500 ring-4 ring-success-500/30"
    >
      <motion.svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={3}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-12 w-12"
      >
        <motion.path
          d="M4 12.5l5 5L20 6.5"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.45, delay: 0.12, ease: 'easeOut' }}
        />
      </motion.svg>
    </motion.div>
    <p className="text-2xl font-bold tracking-tight text-content">{label}</p>
  </motion.div>
);

/* ════════════════════════════════════════════════════════════════════════════
 * Page — designed for a phone held at arm's length, standing at a gate.
 * ════════════════════════════════════════════════════════════════════════════ */
const SecurityConsole = () => {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canExit = can(PERMISSION.SECURITY_MARK_EXIT);
  const canReturn = can(PERMISSION.SECURITY_MARK_RETURN);
  const canScan = can(PERMISSION.SECURITY_SCAN);

  const [tab, setTab] = useState<'queue' | 'out' | 'history'>('queue');
  const [page, setPage] = useState(1);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');

  const [result, setResult] = useState<{
    gatePass: GatePass | null;
    verification: SecurityVerification;
    method: Method;
  } | null>(null);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [remark, setRemark] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [done, setDone] = useState<GateAction | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const switchTab = (value: string) => {
    setTab(value as 'queue' | 'out' | 'history');
    setPage(1);
  };

  /* ── Data ─────────────────────────────────────────────────────────────── */
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['security', 'stats'],
    queryFn: securityApi.stats,
    staleTime: 20_000,
  });

  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ['security', 'queue', page],
    queryFn: () => securityApi.queue({ page, limit: 20 }),
    enabled: tab === 'queue',
  });

  const { data: out, isLoading: outLoading } = useQuery({
    queryKey: ['security', 'out', page],
    queryFn: () => securityApi.out({ page, limit: 20 }),
    enabled: tab === 'out',
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['security', 'history', page],
    queryFn: () => securityApi.history({ page, limit: 20 }),
    enabled: tab === 'history',
  });

  /* ── Verification ─────────────────────────────────────────────────────── */
  const verifyMutation = useMutation({
    mutationFn: ({ code }: { code: string; method: Method }) => securityApi.verify(code),
    onSuccess: (data, variables) => setResult({ ...data, method: variables.method }),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const verify = (code: string, method: Method) => {
    const trimmed = code.trim();
    if (trimmed.length < 3) return;
    setScannerOpen(false);
    verifyMutation.mutate({ code: trimmed, method });
  };

  /* ── Gate movements ───────────────────────────────────────────────────── */
  const openAction = (pass: GatePass, action: GateAction, method: Method) => {
    setResult(null);
    setRemark('');
    setPhoto(null);
    setDone(null);
    setPending({ pass, action, method });
  };

  const closeAction = () => {
    setPending(null);
    setDone(null);
    setPhoto(null);
    setRemark('');
  };

  const gateMutation = useMutation({
    mutationFn: ({ pass, action, method }: PendingAction) => {
      const payload = { remark: remark.trim() || undefined, method, photo };
      return action === 'EXIT'
        ? securityApi.markExit(pass._id, payload)
        : securityApi.markReturn(pass._id, payload);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['security'] });
      void queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setDone(variables.action);
      setManualCode('');
      window.setTimeout(closeAction, 1600);
    },
    // A 400 here is usually "a photo is required to record the exit" — the
    // server's message is the instruction, so it goes straight to the guard.
    onError: (error) => toast.error(errorMessage(error)),
  });

  /* ── Tables ───────────────────────────────────────────────────────────── */
  const exitColumn: Column<GatePass> = {
    key: 'exit',
    header: 'Action',
    headerClassName: 'text-right',
    className: 'text-right',
    render: (row) => (
      <Button
        size="lg"
        variant="success"
        leftIcon={<LogOut className="h-5 w-5" />}
        onClick={(event) => {
          event.stopPropagation();
          openAction(row, 'EXIT', 'MANUAL');
        }}
      >
        Mark Exit
      </Button>
    ),
  };

  const returnColumn: Column<GatePass> = {
    key: 'return',
    header: 'Out for / Action',
    headerClassName: 'text-right',
    className: 'text-right',
    render: (row) => {
      // `isOverdue` / `overdueByMinutes` are decorated onto the row by GET /security/out.
      const outRow = row as OutPass;
      const outFor = minutesSince(outRow.security?.actualOutTime);

      return (
        <div className="flex flex-col items-end gap-2">
          <span
            className={cn(
              'text-sm font-semibold tabular-nums',
              outRow.isOverdue ? 'text-danger-500' : 'text-content-muted'
            )}
          >
            {outFor === null ? '—' : `Out ${formatDuration(outFor)}`}
          </span>
          {outRow.isOverdue && (
            <Badge tone="danger" icon={<AlarmClock className="h-3.5 w-3.5" />}>
              Overdue {formatDuration(outRow.overdueByMinutes ?? 0)}
            </Badge>
          )}
          <Button
            size="lg"
            leftIcon={<LogIn className="h-5 w-5" />}
            onClick={(event) => {
              event.stopPropagation();
              openAction(row, 'ENTRY', 'MANUAL');
            }}
          >
            Mark Return
          </Button>
        </div>
      );
    },
  };

  const historyColumns: Column<SecurityLog>[] = [
    {
      key: 'type',
      header: 'Movement',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          {row.photo ? (
            <img
              src={assetUrl(row.photo)}
              alt=""
              className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-line"
            />
          ) : (
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                row.type === 'EXIT'
                  ? 'bg-accent-500/15 text-accent-500'
                  : 'bg-success-500/15 text-success-500'
              )}
            >
              {row.type === 'EXIT' ? <LogOut className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
            </span>
          )}
          <Badge tone={row.type === 'EXIT' ? 'accent' : 'success'} dot>
            {row.type}
          </Badge>
        </div>
      ),
    },
    {
      key: 'employeeName',
      header: 'Employee',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-content">{row.employeeName}</p>
          <p className="truncate font-mono text-xs text-content-muted">{row.gatePassNumber}</p>
        </div>
      ),
    },
    {
      key: 'recordedAt',
      header: 'Recorded',
      hideBelow: 'md',
      render: (row) => (
        <div className="whitespace-nowrap">
          <p className="text-sm text-content">{formatSmartDateTime(row.recordedAt)}</p>
          {row.isLate && (
            <p className="text-xs font-semibold text-danger-500">
              {formatDuration(row.lateByMinutes)} late
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'recordedByName',
      header: 'Guard',
      hideBelow: 'lg',
      render: (row) => (
        <p className="truncate text-sm text-content-muted">{row.recordedByName || '—'}</p>
      ),
    },
    {
      key: 'verificationMethod',
      header: 'Verified via',
      hideBelow: 'lg',
      render: (row) => <Badge tone="neutral">{row.verificationMethod}</Badge>,
    },
    {
      key: 'remark',
      header: 'Remark',
      hideBelow: 'xl',
      className: 'max-w-[220px]',
      render: (row) =>
        row.remark ? (
          <p className="truncate text-sm text-content-muted" title={row.remark}>
            {row.remark}
          </p>
        ) : (
          <span className="text-sm text-content-subtle">—</span>
        ),
    },
  ];

  const verified = result?.verification.valid ?? false;
  const pass = result?.gatePass ?? null;

  /* An object URL is a live handle — revoke it when the file changes or the modal closes. */
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  return (
    <div>
      <PageHeader
        title="Security Console"
        subtitle="Scan, verify, and record every movement through the gate."
        icon={<ShieldCheck className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Workflow' }, { label: 'Security' }]}
      />

      {/* ── Scan + manual search: the two ways in, both huge ─────────────── */}
      <div className="card mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
        {canScan && (
          <Button
            size="lg"
            fullWidth
            className="h-16 text-lg sm:h-14 sm:w-auto sm:min-w-[220px]"
            leftIcon={<ScanLine className="h-6 w-6" />}
            onClick={() => setScannerOpen(true)}
          >
            Scan QR
          </Button>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            verify(manualCode, 'SEARCH');
          }}
          className="flex flex-1 items-center gap-2"
        >
          <Input
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
            placeholder="Gate pass number or employee code"
            leftIcon={<Search className="h-5 w-5" />}
            className="h-16 text-base sm:h-14"
            aria-label="Gate pass number or employee code"
          />
          <Button
            type="submit"
            size="lg"
            variant="secondary"
            className="h-16 shrink-0 sm:h-14"
            isLoading={verifyMutation.isPending}
            disabled={manualCode.trim().length < 3}
          >
            Verify
          </Button>
        </form>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      {statsLoading ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <StatCardSkeleton key={index} />
          ))}
        </div>
      ) : (
        <motion.div
          variants={staggerContainer(0.05)}
          initial="initial"
          animate="animate"
          className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
        >
          <StatCard
            label="Ready to exit"
            value={stats?.readyToExit ?? 0}
            icon={<DoorOpen className="h-5 w-5" />}
            tone="brand"
          />
          <StatCard
            label="Currently out"
            value={stats?.currentlyOut ?? 0}
            icon={<ArrowRightLeft className="h-5 w-5" />}
            tone="accent"
          />
          <StatCard
            label="Overdue"
            value={stats?.overdue ?? 0}
            icon={<ShieldAlert className="h-5 w-5" />}
            tone="danger"
            hint={stats?.overdue ? 'Past their expected return' : 'Everyone is on time'}
            onClick={() => switchTab('out')}
          />
          <StatCard
            label="Exits today"
            value={stats?.exitsToday ?? 0}
            icon={<LogOut className="h-5 w-5" />}
            tone="info"
          />
          <StatCard
            label="Returns today"
            value={stats?.returnsToday ?? 0}
            icon={<LogIn className="h-5 w-5" />}
            tone="success"
          />
        </motion.div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <Tabs
        layoutId="security-tabs"
        value={tab}
        onChange={switchTab}
        className="mb-5"
        tabs={[
          {
            value: 'queue',
            label: 'Ready to Exit',
            icon: <DoorOpen className="h-4 w-4" />,
            count: stats?.readyToExit ?? 0,
          },
          {
            value: 'out',
            label: 'Currently Out',
            icon: <ArrowRightLeft className="h-4 w-4" />,
            count: stats?.currentlyOut ?? 0,
          },
          { value: 'history', label: 'History', icon: <History className="h-4 w-4" /> },
        ]}
      />

      {tab === 'queue' && (
        <GatePassTable
          data={queue?.items ?? []}
          isLoading={queueLoading}
          meta={queue?.meta}
          onPageChange={setPage}
          basePath="/security"
          actionColumn={canExit ? exitColumn : undefined}
          emptyTitle="Nobody is waiting to leave"
          emptyMessage="Approved passes appear here the moment HR clears them."
        />
      )}

      {tab === 'out' && (
        <GatePassTable
          data={out?.items ?? []}
          isLoading={outLoading}
          meta={out?.meta}
          onPageChange={setPage}
          basePath="/security"
          actionColumn={canReturn ? returnColumn : undefined}
          emptyTitle="Everyone is inside"
          emptyMessage="No employee is currently outside the gate."
        />
      )}

      {tab === 'history' && (
        <DataTable
          data={history?.items ?? []}
          columns={historyColumns}
          isLoading={historyLoading}
          rowKey={(row) => row._id}
          meta={history?.meta}
          onPageChange={setPage}
          emptyTitle="No gate movements yet"
          emptyMessage="Every exit and return you record is logged here."
          mobileCard={(row) => (
            <div className="card space-y-3 p-4">
              <div className="flex items-start gap-3">
                {row.photo ? (
                  <img
                    src={assetUrl(row.photo)}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-line"
                  />
                ) : (
                  <span
                    className={cn(
                      'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                      row.type === 'EXIT'
                        ? 'bg-accent-500/15 text-accent-500'
                        : 'bg-success-500/15 text-success-500'
                    )}
                  >
                    {row.type === 'EXIT' ? (
                      <LogOut className="h-5 w-5" />
                    ) : (
                      <LogIn className="h-5 w-5" />
                    )}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-content">{row.employeeName}</p>
                  <p className="truncate font-mono text-xs text-content-muted">
                    {row.gatePassNumber}
                  </p>
                </div>
                <Badge tone={row.type === 'EXIT' ? 'accent' : 'success'} dot>
                  {row.type}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-content-subtle">
                <span className="truncate">
                  {row.recordedByName || '—'} · {row.verificationMethod}
                </span>
                <span className="shrink-0">{formatSmartDateTime(row.recordedAt)}</span>
              </div>
            </div>
          )}
        />
      )}

      {/* ── Scanner ──────────────────────────────────────────────────────── */}
      <QRScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(code) => verify(code, 'QR')}
      />

      {/* ── Verification result — the one-second decision ─────────────────── */}
      <Modal
        open={Boolean(result)}
        onClose={() => setResult(null)}
        size="md"
        className={cn(
          'border-t-8',
          verified ? 'border-t-success-500' : 'border-t-danger-500'
        )}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setResult(null)}>
              Close
            </Button>

            {verified && pass && result?.verification.canExit && canExit && (
              <Button
                variant="success"
                size="lg"
                className="h-14 text-base"
                leftIcon={<LogOut className="h-5 w-5" />}
                onClick={() => openAction(pass, 'EXIT', result.method)}
              >
                Mark Exit
              </Button>
            )}

            {verified && pass && result?.verification.canReturn && canReturn && (
              <Button
                size="lg"
                className="h-14 text-base"
                leftIcon={<LogIn className="h-5 w-5" />}
                onClick={() => openAction(pass, 'ENTRY', result.method)}
              >
                Mark Return
              </Button>
            )}
          </>
        }
      >
        {result && (
          <div className="space-y-5">
            {/* The verdict. Colour, icon and word all say the same thing. */}
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                'flex flex-col items-center gap-3 rounded-2xl px-4 py-6 text-center',
                verified
                  ? 'bg-success-500/12 ring-1 ring-success-500/30'
                  : 'bg-danger-500/12 ring-1 ring-danger-500/30'
              )}
            >
              <span
                className={cn(
                  'flex h-20 w-20 items-center justify-center rounded-full text-white',
                  verified ? 'bg-success-500' : 'bg-danger-500'
                )}
              >
                {verified ? <Check className="h-11 w-11" strokeWidth={3} /> : <X className="h-11 w-11" strokeWidth={3} />}
              </span>

              <p
                className={cn(
                  'text-3xl font-black uppercase tracking-tight',
                  verified ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400'
                )}
              >
                {verified ? 'Verified' : 'Do not allow'}
              </p>

              {/* Written by the server for a human — never paraphrase it. */}
              <p className="max-w-sm text-base font-medium leading-snug text-content">
                {result.verification.reason}
              </p>
            </motion.div>

            {pass && (
              <div className="rounded-2xl border border-line bg-surface-sunken/50 p-4">
                <div className="flex items-center gap-4">
                  <Avatar
                    name={pass.employeeName}
                    src={typeof pass.employee === 'object' ? pass.employee.profileImage : undefined}
                    size="xl"
                    ring
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xl font-bold text-content">{pass.employeeName}</p>
                    <p className="truncate font-mono text-sm text-content-muted">
                      {pass.employeeCode}
                    </p>
                    <p className="truncate text-sm text-content-muted">{pass.departmentName}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-wider text-content-subtle">
                      Gate pass
                    </p>
                    <p className="mt-0.5 font-mono text-base font-semibold text-content">
                      {pass.gatePassNumber}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-wider text-content-subtle">
                      Type
                    </p>
                    <div className="mt-1">
                      <TypeBadge type={pass.type} />
                    </div>
                  </div>
                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-wider text-content-subtle">
                      Expected out
                    </p>
                    <p className="mt-0.5 text-base font-semibold text-content">
                      {formatDateTime(pass.expectedOutTime)}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-wider text-content-subtle">
                      Expected back
                    </p>
                    <p className="mt-0.5 text-base font-semibold text-content">
                      {formatDateTime(pass.expectedInTime)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Exit / return capture ────────────────────────────────────────── */}
      <Modal
        open={Boolean(pending)}
        onClose={closeAction}
        dismissible={!gateMutation.isPending && !done}
        size="md"
        title={done ? undefined : pending?.action === 'EXIT' ? 'Record exit' : 'Record return'}
        description={done ? undefined : pending?.pass.gatePassNumber}
        icon={
          done ? undefined : pending?.action === 'EXIT' ? (
            <LogOut className="h-5 w-5" />
          ) : (
            <LogIn className="h-5 w-5" />
          )
        }
        footer={
          done ? undefined : (
            <>
              <Button
                variant="secondary"
                size="lg"
                onClick={closeAction}
                disabled={gateMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                size="lg"
                variant={pending?.action === 'EXIT' ? 'success' : 'primary'}
                className="h-14 text-base"
                isLoading={gateMutation.isPending}
                leftIcon={
                  pending?.action === 'EXIT' ? (
                    <LogOut className="h-5 w-5" />
                  ) : (
                    <LogIn className="h-5 w-5" />
                  )
                }
                onClick={() => pending && gateMutation.mutate(pending)}
              >
                {pending?.action === 'EXIT' ? 'Confirm exit' : 'Confirm return'}
              </Button>
            </>
          )
        }
      >
        <AnimatePresence mode="wait">
          {done ? (
            <SuccessBurst
              key="done"
              label={done === 'EXIT' ? 'Exit recorded' : 'Return recorded'}
            />
          ) : (
            pending && (
              <motion.div key="form" className="space-y-5">
                <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-sunken/50 p-3">
                  <Avatar
                    name={pending.pass.employeeName}
                    src={
                      typeof pending.pass.employee === 'object'
                        ? pending.pass.employee.profileImage
                        : undefined
                    }
                    size="lg"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-content">
                      {pending.pass.employeeName}
                    </p>
                    <p className="truncate text-sm text-content-muted">
                      {pending.pass.employeeCode} · {pending.pass.departmentName}
                    </p>
                  </div>
                </div>

                {/* Photo — a raw file input so the phone opens the rear camera directly. */}
                <div>
                  <p className="mb-1.5 text-sm font-medium text-content">Photo</p>

                  {photoPreview ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-raised p-3">
                      <img
                        src={photoPreview}
                        alt="Captured"
                        className="h-20 w-20 rounded-xl object-cover ring-1 ring-line"
                      />
                      <p className="min-w-0 flex-1 truncate text-sm text-content-muted">
                        {photo?.name}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove photo"
                        onClick={() => {
                          setPhoto(null);
                          if (photoInputRef.current) photoInputRef.current.value = '';
                        }}
                      >
                        <X className="h-5 w-5" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      size="lg"
                      fullWidth
                      className="h-14"
                      leftIcon={<Camera className="h-5 w-5" />}
                      onClick={() => photoInputRef.current?.click()}
                    >
                      Capture photo
                    </Button>
                  )}

                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
                  />
                  <p className="mt-1.5 text-xs text-content-subtle">
                    Optional unless your site requires it — the server will tell you.
                  </p>
                </div>

                <Textarea
                  label="Remark"
                  value={remark}
                  onChange={(event) => setRemark(event.target.value)}
                  maxLength={500}
                  showCount
                  placeholder="Anything worth recording — carried items, escort, late return…"
                />
              </motion.div>
            )
          )}
        </AnimatePresence>
      </Modal>
    </div>
  );
};

export default SecurityConsole;
