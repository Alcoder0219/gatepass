import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  LogIn,
  LogOut,
  MessageSquare,
  Pencil,
  Printer,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Trash2,
  XCircle,
} from 'lucide-react';
import { gatePassApi, hrApi, securityApi } from '@/services/endpoints';
import { errorMessage } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/permissions/usePermissions';
import { PERMISSION } from '@/permissions/constants';
import { useGatePassActions } from '@/hooks/useGatePassActions';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusTimeline, WorkflowProgress } from '@/components/gatepass/StatusTimeline';
import {
  AttachmentList,
  Avatar,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DetailSkeleton,
  EmptyState,
  Modal,
  StatusBadge,
  Textarea,
  TypeBadge,
} from '@/components/ui';
import { cn } from '@/utils/cn';
import { assetUrl, formatDateTime, formatDuration, formatSmartDateTime } from '@/utils/format';
import type { GatePass, User } from '@/types';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const idOf = (value: User | string | null | undefined): string =>
  typeof value === 'string' ? value : (value?._id ?? '');

const statusOf = (error: unknown) =>
  (error as { response?: { status?: number } })?.response?.status;

const minutesBetween = (from?: string | null, to?: string | null) => {
  if (!from || !to) return null;
  const delta = new Date(to).getTime() - new Date(from).getTime();
  return Number.isNaN(delta) ? null : Math.round(delta / 60_000);
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className="text-2xs font-semibold uppercase tracking-wider text-content-subtle">{label}</dt>
    <dd className="mt-1 text-sm leading-relaxed text-content">{children}</dd>
  </div>
);

/** Every action that needs a comment funnels through one dialog. */
type DialogKind =
  | 'APPROVE'
  | 'REJECT'
  | 'CHANGES'
  | 'HR_OK'
  | 'HR_NOT_OK'
  | 'EXIT'
  | 'RETURN'
  | 'CANCEL'
  | 'DELETE';

interface DialogSpec {
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'primary' | 'danger' | 'success';
  commentRequired: boolean;
  commentLabel: string;
  withPhoto?: boolean;
}

const DIALOGS: Record<Exclude<DialogKind, 'CANCEL' | 'DELETE'>, DialogSpec> = {
  APPROVE: {
    title: 'Approve this gate pass',
    description: 'The employee is notified immediately.',
    confirmLabel: 'Approve',
    tone: 'success',
    commentRequired: false,
    commentLabel: 'Comment (optional)',
  },
  REJECT: {
    title: 'Reject this gate pass',
    description: 'Say why — the employee only sees your comment.',
    confirmLabel: 'Reject',
    tone: 'danger',
    commentRequired: true,
    commentLabel: 'Reason for rejection',
  },
  CHANGES: {
    title: 'Request changes',
    description: 'The pass goes back to the employee, who can edit and resubmit it.',
    confirmLabel: 'Request changes',
    tone: 'primary',
    commentRequired: true,
    commentLabel: 'What needs to change?',
  },
  HR_OK: {
    title: 'Mark HR review as OK',
    description: 'The pass clears HR and becomes usable at the gate.',
    confirmLabel: 'Mark OK',
    tone: 'success',
    commentRequired: false,
    commentLabel: 'Comment (optional)',
  },
  HR_NOT_OK: {
    title: 'Mark HR review as Not OK',
    description: 'The pass goes back to the reporting manager.',
    confirmLabel: 'Mark Not OK',
    tone: 'danger',
    commentRequired: true,
    commentLabel: 'Why is this not OK?',
  },
  EXIT: {
    title: 'Record exit at the gate',
    description: 'Logs the employee as physically out.',
    confirmLabel: 'Mark exit',
    tone: 'primary',
    commentRequired: false,
    commentLabel: 'Remark (optional)',
    withPhoto: true,
  },
  RETURN: {
    title: 'Record return at the gate',
    description: 'Closes the pass and stops the clock.',
    confirmLabel: 'Mark return',
    tone: 'success',
    commentRequired: false,
    commentLabel: 'Remark (optional)',
    withPhoto: true,
  },
};

/* ─── Page ────────────────────────────────────────────────────────────────── */
const GatePassDetail = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { can, isAdmin } = usePermissions();
  const { approve, reject, requestChanges, cancel, remove, isPending } = useGatePassActions();

  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  /** The button that opened the approve dialog — the confetti launches from it. */
  const originRef = useRef<HTMLElement | null>(null);

  const { data: gatePass, isLoading, error } = useQuery<GatePass>({
    queryKey: ['gate-passes', 'detail', id],
    queryFn: () => gatePassApi.get(id),
    enabled: Boolean(id),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['hr'] });
    void queryClient.invalidateQueries({ queryKey: ['security'] });
  };

  const hrReview = useMutation({
    mutationFn: (payload: { status: 'OK' | 'NOT_OK'; comment: string }) => hrApi.review(id, payload),
    onSuccess: (_data, variables) => {
      toast.success(`HR review recorded as ${variables.status === 'OK' ? 'OK' : 'Not OK'}`);
      invalidate();
    },
    onError: (err: unknown) => toast.error(errorMessage(err)),
  });

  const movement = useMutation({
    mutationFn: (payload: { kind: 'EXIT' | 'RETURN'; remark: string; photo: File | null }) =>
      payload.kind === 'EXIT'
        ? securityApi.markExit(id, { remark: payload.remark, method: 'MANUAL', photo: payload.photo })
        : securityApi.markReturn(id, { remark: payload.remark, method: 'MANUAL', photo: payload.photo }),
    onSuccess: (_data, variables) => {
      toast.success(variables.kind === 'EXIT' ? 'Exit recorded' : 'Return recorded');
      invalidate();
    },
    onError: (err: unknown) => toast.error(errorMessage(err)),
  });

  /* ── Loading / access ──────────────────────────────────────────────────── */
  if (isLoading) return <DetailSkeleton />;

  if (error || !gatePass) {
    const code = statusOf(error);
    return (
      <>
        <PageHeader title="Gate pass" breadcrumbs={[{ label: 'Gate passes', to: '/my-gate-pass' }]} />
        <EmptyState
          icon={<ShieldAlert className="h-7 w-7" />}
          title={
            code === 403
              ? "You don't have access to this gate pass"
              : code === 404
                ? 'This gate pass no longer exists'
                : 'We could not load this gate pass'
          }
          message={
            code === 403
              ? 'It belongs to someone outside the records you are allowed to see. If you think that is wrong, ask your administrator.'
              : errorMessage(error, 'Try again in a moment.')
          }
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
      </>
    );
  }

  /* ── Who am I to this pass? ────────────────────────────────────────────── */
  const isOwner = idOf(gatePass.employee) === user?._id;
  const isRoutedManager = idOf(gatePass.reportingManager) === user?._id;
  const { status } = gatePass;

  const canDecide =
    status === 'PENDING' && can(PERMISSION.GATEPASS_APPROVE) && (isRoutedManager || isAdmin);
  const canHrReview = status === 'HR_REVIEW' && can(PERMISSION.HR_REVIEW);
  const canMarkExit = status === 'APPROVED' && can(PERMISSION.SECURITY_MARK_EXIT);
  const canMarkReturn = status === 'OUT' && can(PERMISSION.SECURITY_MARK_RETURN);
  const canCancel =
    isOwner && ['PENDING', 'CHANGES_REQUESTED', 'APPROVED'].includes(status);
  const canEdit = isOwner && status === 'CHANGES_REQUESTED';
  const canDelete = can(PERMISSION.GATEPASS_DELETE);
  const canPrint = can(PERMISSION.GATEPASS_PRINT);

  const hasActions =
    canDecide || canHrReview || canMarkExit || canMarkReturn || canCancel || canEdit || canDelete;

  const qrVisible = ['APPROVED', 'OUT', 'COMPLETED'].includes(status) && Boolean(gatePass.qrCode);
  const scanned = Boolean(gatePass.security?.actualOutTime || gatePass.security?.actualInTime);

  const plannedMinutes = minutesBetween(gatePass.expectedOutTime, gatePass.expectedInTime);
  const actualMinutes =
    gatePass.actualDurationMinutes ??
    minutesBetween(gatePass.security?.actualOutTime, gatePass.security?.actualInTime);

  const exitBy = gatePass.security?.exitBy;
  const exitByName = exitBy && typeof exitBy === 'object' ? exitBy.name : '—';

  /* ── Dialog plumbing ───────────────────────────────────────────────────── */
  const openDialog = (kind: DialogKind, event?: React.MouseEvent<HTMLButtonElement>) => {
    originRef.current = event?.currentTarget ?? null;
    setComment('');
    setCommentError(null);
    setPhoto(null);
    setDialog(kind);
  };

  const closeDialog = () => {
    setDialog(null);
    setComment('');
    setCommentError(null);
    setPhoto(null);
  };

  const spec = dialog && dialog !== 'CANCEL' && dialog !== 'DELETE' ? DIALOGS[dialog] : null;

  const submitDialog = async () => {
    if (!spec || !dialog) return;

    const trimmed = comment.trim();
    if (spec.commentRequired && trimmed.length < 5) {
      setCommentError('Write at least 5 characters — the employee will read this.');
      return;
    }

    try {
      switch (dialog) {
        case 'APPROVE':
          await approve.mutateAsync({ id, comment: trimmed, origin: originRef.current });
          break;
        case 'REJECT':
          await reject.mutateAsync({ id, comment: trimmed });
          break;
        case 'CHANGES':
          await requestChanges.mutateAsync({ id, comment: trimmed });
          break;
        case 'HR_OK':
          await hrReview.mutateAsync({ status: 'OK', comment: trimmed });
          break;
        case 'HR_NOT_OK':
          await hrReview.mutateAsync({ status: 'NOT_OK', comment: trimmed });
          break;
        case 'EXIT':
          await movement.mutateAsync({ kind: 'EXIT', remark: trimmed, photo });
          break;
        case 'RETURN':
          await movement.mutateAsync({ kind: 'RETURN', remark: trimmed, photo });
          break;
        default:
          break;
      }
      closeDialog();
    } catch {
      // The mutation's onError already toasted the server's message.
    }
  };

  const busy = isPending || hrReview.isPending || movement.isPending;

  /* ── The action buttons, rendered once and placed twice. ───────────────── */
  const actions = (
    <>
      {canDecide && (
        <>
          <Button
            variant="success"
            fullWidth
            leftIcon={<CheckCircle2 className="h-4 w-4" />}
            onClick={(event) => openDialog('APPROVE', event)}
          >
            Approve
          </Button>
          <Button
            variant="danger"
            fullWidth
            leftIcon={<XCircle className="h-4 w-4" />}
            onClick={(event) => openDialog('REJECT', event)}
          >
            Reject
          </Button>
          <Button
            variant="secondary"
            fullWidth
            leftIcon={<MessageSquare className="h-4 w-4" />}
            onClick={(event) => openDialog('CHANGES', event)}
          >
            Request changes
          </Button>
        </>
      )}

      {canHrReview && (
        <>
          <Button
            variant="success"
            fullWidth
            leftIcon={<ShieldCheck className="h-4 w-4" />}
            onClick={(event) => openDialog('HR_OK', event)}
          >
            HR review OK
          </Button>
          <Button
            variant="danger"
            fullWidth
            leftIcon={<ShieldX className="h-4 w-4" />}
            onClick={(event) => openDialog('HR_NOT_OK', event)}
          >
            Not OK
          </Button>
        </>
      )}

      {canMarkExit && (
        <Button
          fullWidth
          leftIcon={<LogOut className="h-4 w-4" />}
          onClick={(event) => openDialog('EXIT', event)}
        >
          Mark exit
        </Button>
      )}

      {canMarkReturn && (
        <Button
          variant="success"
          fullWidth
          leftIcon={<LogIn className="h-4 w-4" />}
          onClick={(event) => openDialog('RETURN', event)}
        >
          Mark return
        </Button>
      )}

      {canEdit && (
        <Link to={`/gate-pass/${id}/edit`} className="w-full">
          <Button variant="secondary" fullWidth leftIcon={<Pencil className="h-4 w-4" />}>
            Edit & resubmit
          </Button>
        </Link>
      )}

      {canCancel && (
        <Button
          variant="ghost"
          fullWidth
          leftIcon={<XCircle className="h-4 w-4" />}
          onClick={() => openDialog('CANCEL')}
        >
          Cancel pass
        </Button>
      )}

      {canDelete && (
        <Button
          variant="ghost"
          fullWidth
          className="text-danger-500 hover:bg-danger-500/10"
          leftIcon={<Trash2 className="h-4 w-4" />}
          onClick={() => openDialog('DELETE')}
        >
          Delete
        </Button>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        title={gatePass.gatePassNumber}
        className="[&_h1]:font-mono"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} pulse={status === 'OUT'} />
            <TypeBadge type={gatePass.type} />
            <span className="text-content-subtle">
              raised {formatSmartDateTime(gatePass.createdAt)}
            </span>
          </span>
        }
        breadcrumbs={[{ label: 'Gate passes', to: '/my-gate-pass' }, { label: 'Detail' }]}
        actions={
          canPrint ? (
            <Link to={`/gate-pass/${id}/print`}>
              <Button variant="secondary" leftIcon={<Printer className="h-4 w-4" />}>
                Print
              </Button>
            </Link>
          ) : undefined
        }
      />

      <Card className="mb-6 overflow-x-auto" padding="md">
        <WorkflowProgress gatePass={gatePass} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Left: the request ───────────────────────────────────────────── */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader icon={<FileText className="h-5 w-5" />} title="Request details" />

            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-line bg-surface-sunken/50 p-4">
              <Avatar
                name={gatePass.employeeName}
                src={typeof gatePass.employee === 'object' ? gatePass.employee.profileImage : undefined}
                size="lg"
              />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-content">{gatePass.employeeName}</p>
                <p className="truncate text-sm text-content-muted">
                  {gatePass.employeeCode}
                  {gatePass.designation ? ` · ${gatePass.designation}` : ''}
                </p>
                <p className="truncate text-xs text-content-subtle">
                  {gatePass.departmentName} · {gatePass.unitName} · reports to{' '}
                  {gatePass.reportingManagerName || '—'}
                </p>
              </div>
            </div>

            <dl className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Reason">{gatePass.reason}</Field>
              </div>

              {gatePass.purpose && (
                <div className="sm:col-span-2">
                  <Field label="Purpose">{gatePass.purpose}</Field>
                </div>
              )}

              <Field label="Expected out">{formatDateTime(gatePass.expectedOutTime)}</Field>
              <Field label="Expected in">{formatDateTime(gatePass.expectedInTime)}</Field>

              <Field label="Planned duration">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-content-subtle" />
                  {formatDuration(plannedMinutes)}
                </span>
              </Field>

              {gatePass.remarks && <Field label="Remarks">{gatePass.remarks}</Field>}
            </dl>

            <div className="mt-6 border-t border-line pt-5">
              <p className="mb-3 text-2xs font-semibold uppercase tracking-wider text-content-subtle">
                Attachments
              </p>
              <AttachmentList attachments={gatePass.attachments ?? []} />
            </div>
          </Card>

          {/* Security movement — only once someone has actually been scanned. */}
          {scanned && (
            <Card>
              <CardHeader
                icon={<LogOut className="h-5 w-5" />}
                title="Gate movement"
                subtitle="Recorded by security at the gate."
              />

              {gatePass.isLate && (
                <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-danger-500/30 bg-danger-500/5 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-500" />
                  <p className="text-sm text-content-muted">
                    Returned{' '}
                    <span className="font-semibold text-danger-500">
                      {gatePass.lateByMinutes} minutes late
                    </span>{' '}
                    against the expected in-time.
                  </p>
                </div>
              )}

              <dl className="grid gap-5 sm:grid-cols-2">
                <Field label="Actual out">{formatDateTime(gatePass.security?.actualOutTime)}</Field>
                <Field label="Actual in">{formatDateTime(gatePass.security?.actualInTime)}</Field>
                <Field label="Actual duration">{formatDuration(actualMinutes)}</Field>
                <Field label="Recorded by">{exitByName}</Field>
                {gatePass.security?.exitRemark && (
                  <Field label="Exit remark">{gatePass.security.exitRemark}</Field>
                )}
                {gatePass.security?.entryRemark && (
                  <Field label="Entry remark">{gatePass.security.entryRemark}</Field>
                )}
              </dl>

              {(gatePass.security?.exitPhoto || gatePass.security?.entryPhoto) && (
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {gatePass.security?.exitPhoto && (
                    <figure>
                      <img
                        src={assetUrl(gatePass.security.exitPhoto)}
                        alt="Exit capture"
                        className="aspect-video w-full rounded-xl border border-line object-cover"
                      />
                      <figcaption className="mt-1.5 text-xs text-content-subtle">Exit photo</figcaption>
                    </figure>
                  )}
                  {gatePass.security?.entryPhoto && (
                    <figure>
                      <img
                        src={assetUrl(gatePass.security.entryPhoto)}
                        alt="Return capture"
                        className="aspect-video w-full rounded-xl border border-line object-cover"
                      />
                      <figcaption className="mt-1.5 text-xs text-content-subtle">Return photo</figcaption>
                    </figure>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>

        {/* ── Right: QR + timeline + actions ──────────────────────────────── */}
        <div className="space-y-6">
          {qrVisible && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card overflow-hidden p-0"
            >
              {/* The QR sits on plain white regardless of theme — a dark surface
                  behind a QR is a scanner failure waiting to happen. */}
              <div className="flex flex-col items-center bg-white p-6">
                <img
                  src={gatePass.qrCode}
                  alt={`QR code for ${gatePass.gatePassNumber}`}
                  className="h-48 w-48"
                />
                <p className="mt-3 font-mono text-sm font-bold text-slate-900">
                  {gatePass.gatePassNumber}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 px-4 py-3 text-xs text-content-muted">
                <QrCode className="h-3.5 w-3.5" />
                Show this at the gate
              </div>
            </motion.div>
          )}

          {/* Desktop action card. */}
          {hasActions && (
            <Card className="hidden lg:block">
              <CardHeader title="Actions" subtitle="What you can do with this pass right now." />
              <div className="flex flex-col gap-2">{actions}</div>
            </Card>
          )}

          <Card>
            <CardHeader title="Activity" subtitle="Every decision, in the order it happened." />
            <StatusTimeline timeline={gatePass.timeline ?? []} />
          </Card>
        </div>
      </div>

      {/* Mobile action bar — pinned, because the actions are the point of the page. */}
      {hasActions && (
        <div className="sticky bottom-0 z-20 -mx-4 mt-6 flex flex-wrap gap-2 border-t border-line bg-surface/95 px-4 py-3 pb-safe backdrop-blur-xl lg:hidden [&>*]:min-w-[7rem] [&>*]:flex-1">
          {actions}
        </div>
      )}

      {/* ── Comment dialog ────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(spec)}
        onClose={closeDialog}
        title={spec?.title}
        description={spec?.description}
        dismissible={!busy}
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={spec?.tone === 'danger' ? 'danger' : spec?.tone === 'success' ? 'success' : 'primary'}
              isLoading={busy}
              onClick={() => void submitDialog()}
            >
              {spec?.confirmLabel}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Textarea
            label={spec?.commentLabel ?? 'Comment'}
            required={spec?.commentRequired}
            value={comment}
            maxLength={1000}
            showCount
            onChange={(event) => {
              setComment(event.target.value);
              setCommentError(null);
            }}
            placeholder={
              spec?.commentRequired ? 'The employee will see exactly this…' : 'Add a note (optional)…'
            }
            error={commentError ?? undefined}
          />

          {spec?.withPhoto && (
            <div>
              <label
                htmlFor="movement-photo"
                className="mb-1.5 block text-sm font-medium text-content"
              >
                Photo (optional)
              </label>
              <input
                id="movement-photo"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
                className={cn(
                  'input-base cursor-pointer py-2',
                  'file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500/10 file:px-3 file:py-1.5',
                  'file:text-sm file:font-semibold file:text-brand-500'
                )}
              />
            </div>
          )}
        </div>
      </Modal>

      {/* ── Cancel ────────────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={dialog === 'CANCEL'}
        onClose={closeDialog}
        isLoading={cancel.isPending}
        onConfirm={async () => {
          await cancel.mutateAsync({ id }).catch(() => undefined);
          closeDialog();
        }}
        title="Cancel this gate pass?"
        confirmLabel="Yes, cancel it"
        cancelLabel="Keep it"
        message={
          <>
            <span className="font-mono font-semibold text-content">{gatePass.gatePassNumber}</span> will
            be withdrawn. This cannot be undone — you would have to raise a new pass.
          </>
        }
      />

      {/* ── Delete ────────────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={dialog === 'DELETE'}
        onClose={closeDialog}
        isLoading={remove.isPending}
        icon={<Trash2 className="h-5 w-5" />}
        onConfirm={async () => {
          await remove
            .mutateAsync({ id })
            .then(() => navigate('/gate-passes'))
            .catch(() => undefined);
          closeDialog();
        }}
        title="Delete this gate pass?"
        confirmLabel="Delete"
        message={
          <>
            <span className="font-mono font-semibold text-content">{gatePass.gatePassNumber}</span> will
            be removed from every list and report. The audit trail keeps a record.
          </>
        }
      />
    </>
  );
};

export default GatePassDetail;
