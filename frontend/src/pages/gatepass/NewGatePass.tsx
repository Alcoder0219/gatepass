import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  CalendarClock,
  Check,
  CircleAlert,
  FilePlus2,
  Lock,
  Send,
  User as UserIcon,
} from 'lucide-react';
import { gatePassApi } from '@/services/endpoints';
import { errorMessage, fieldErrors } from '@/services/api';
import { PageHeader } from '@/components/common/PageHeader';
import {
  AttachmentList,
  Button,
  Card,
  CardHeader,
  DetailSkeleton,
  EmptyState,
  Input,
  ProgressRing,
  Textarea,
  TypeBadge,
} from '@/components/ui';
import { cn } from '@/utils/cn';
import { formatDuration, toDateTimeLocal } from '@/utils/format';
import { staggerContainer, staggerItem } from '@/animations/variants';
import type { GatePassPrefill, GatePassType } from '@/types';

/* ─── Schema ──────────────────────────────────────────────────────────────── */

interface WorkflowToggles {
  reasonMandatory: boolean;
  purposeMandatory: boolean;
}

/**
 * The schema is BUILT AT RUNTIME from the settings the prefill hands back, so an
 * org that makes purpose mandatory gets a form that actually enforces it — no
 * redeploy, no second code path.
 *
 * `reason` keeps its min(3) regardless of `reasonMandatory`: the server's
 * create validator requires it unconditionally, and a client that let it
 * through would only earn a 400.
 */
const buildSchema = (workflow: WorkflowToggles) =>
  z
    .object({
      type: z.enum(['OFFICIAL', 'PERSONAL'], { required_error: 'Pick a gate pass type' }),
      reason: z
        .string()
        .trim()
        .min(3, 'Tell your manager why — at least 3 characters')
        .max(500, 'Keep the reason under 500 characters'),
      purpose: workflow.purposeMandatory
        ? z.string().trim().min(3, 'Purpose is required').max(1000, 'Keep the purpose under 1000 characters')
        : z.string().trim().max(1000, 'Keep the purpose under 1000 characters'),
      expectedOutTime: z.string().min(1, 'Expected out time is required'),
      expectedInTime: z.string().min(1, 'Expected in time is required'),
      remarks: z.string().trim().max(1000, 'Keep remarks under 1000 characters'),
    })
    .refine((data) => new Date(data.expectedInTime) > new Date(data.expectedOutTime), {
      message: 'The in time has to be after the out time',
      path: ['expectedInTime'],
    });

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

const EDITABLE_STATUSES = ['DRAFT', 'CHANGES_REQUESTED'];

const PERIODS = ['daily', 'weekly', 'monthly'] as const;

/* ─── Read-only identity cell ─────────────────────────────────────────────── */
const ProfileField = ({ label, value }: { label: string; value?: string }) => (
  <div className="rounded-xl border border-line bg-surface-sunken/50 px-3.5 py-2.5">
    <p className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-content-subtle">
      <Lock className="h-3 w-3" />
      {label}
    </p>
    <p className="mt-1 truncate text-sm font-medium text-content">{value || '—'}</p>
  </div>
);

/* ─── Type picker ─────────────────────────────────────────────────────────── */
const TYPE_CARDS: { value: GatePassType; title: string; blurb: string }[] = [
  { value: 'OFFICIAL', title: 'Official', blurb: 'Company work — client visit, site, errand' },
  { value: 'PERSONAL', title: 'Personal', blurb: 'Your own time — appointment, family, errand' },
];

const TypePicker = ({
  value,
  onChange,
}: {
  value: GatePassType;
  onChange: (type: GatePassType) => void;
}) => (
  <div className="grid gap-3 sm:grid-cols-2">
    {TYPE_CARDS.map((card) => {
      const selected = value === card.value;
      return (
        <button
          key={card.value}
          type="button"
          onClick={() => onChange(card.value)}
          aria-pressed={selected}
          className={cn(
            'relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200',
            selected
              ? 'border-brand-500 bg-brand-500/5 shadow-glow-sm'
              : 'border-line bg-surface-sunken/40 hover:border-brand-500/40 hover:bg-brand-500/[0.03]'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <TypeBadge type={card.value} />
            <span
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full border transition-colors',
                selected ? 'border-brand-500 bg-brand-500 text-white' : 'border-line'
              )}
            >
              <AnimatePresence>
                {selected && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="flex"
                  >
                    <Check className="h-3 w-3" />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          </div>
          <p className="mt-3 text-sm font-semibold text-content">{card.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-content-muted">{card.blurb}</p>
        </button>
      );
    })}
  </div>
);

/* ─── Quota panel ─────────────────────────────────────────────────────────── */
interface QuotaState {
  blocked: boolean;
  warning: boolean;
  message: string;
  rings: { period: string; used: number; limit: number }[];
}

const readQuota = (prefill: GatePassPrefill | undefined, type: GatePassType): QuotaState => {
  const periods = prefill?.quota?.[type];
  const rings = PERIODS.filter((period) => periods?.[period]).map((period) => ({
    period,
    used: periods?.[period]?.used ?? 0,
    limit: periods?.[period]?.limit ?? 0,
  }));

  const reached = rings.find((ring) => ring.used >= ring.limit);
  const near = rings.find((ring) => ring.limit > 0 && ring.used / ring.limit >= 0.75);

  return {
    blocked: Boolean(reached),
    warning: !reached && Boolean(near),
    message: reached
      ? `You have reached your ${reached.period} limit of ${reached.limit} ${type.toLowerCase()} gate pass(es). You cannot raise another until the period resets.`
      : near
        ? `You have used ${near.used} of your ${near.limit} ${near.period} ${type.toLowerCase()} passes. You are close to the limit.`
        : '',
    rings,
  };
};

/* ─── Page ────────────────────────────────────────────────────────────────── */
const NewGatePass = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [serverError, setServerError] = useState<string | null>(null);

  const { data: prefill, isLoading: prefillLoading } = useQuery({
    queryKey: ['gate-passes', 'prefill'],
    queryFn: gatePassApi.prefill,
    staleTime: 60_000,
  });

  const { data: existing, isLoading: existingLoading } = useQuery({
    queryKey: ['gate-passes', 'detail', id],
    queryFn: () => gatePassApi.get(id as string),
    enabled: isEdit,
  });

  const workflow: WorkflowToggles = {
    reasonMandatory: prefill?.workflow?.reasonMandatory ?? true,
    purposeMandatory: prefill?.workflow?.purposeMandatory ?? false,
  };

  const existingAttachments = existing?.attachments ?? [];

  const schema = useMemo(
    () => buildSchema(workflow),
    // The toggles are primitives — comparing them by value is exactly right here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workflow.reasonMandatory, workflow.purposeMandatory]
  );

  const {
    control,
    handleSubmit,
    register,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'OFFICIAL',
      reason: '',
      purpose: '',
      expectedOutTime: toDateTimeLocal(new Date(Date.now() + 30 * 60_000)),
      expectedInTime: toDateTimeLocal(new Date(Date.now() + 2 * 60 * 60_000)),
      remarks: '',
    },
  });

  /* Editing an existing pass — hydrate the form once it lands. */
  useEffect(() => {
    if (!existing) return;
    reset({
      type: existing.type,
      reason: existing.reason ?? '',
      purpose: existing.purpose ?? '',
      expectedOutTime: toDateTimeLocal(existing.expectedOutTime),
      expectedInTime: toDateTimeLocal(existing.expectedInTime),
      remarks: existing.remarks ?? '',
    });
  }, [existing, reset]);

  const values = watch();
  const quota = readQuota(prefill, values.type);

  const plannedDuration = useMemo(() => {
    const out = new Date(values.expectedOutTime).getTime();
    const back = new Date(values.expectedInTime).getTime();
    if (Number.isNaN(out) || Number.isNaN(back) || back <= out) return null;
    return Math.round((back - out) / 60_000);
  }, [values.expectedOutTime, values.expectedInTime]);

  const save = useMutation({
    mutationFn: (form: FormValues) => {
      const payload = {
        type: form.type,
        reason: form.reason.trim(),
        purpose: form.purpose.trim(),
        expectedOutTime: new Date(form.expectedOutTime).toISOString(),
        expectedInTime: new Date(form.expectedInTime).toISOString(),
        remarks: form.remarks.trim(),
      };

      // PATCH takes JSON; create still posts multipart/form-data (the route runs
      // the upload middleware) even though no files are attached.
      if (isEdit) return gatePassApi.update(id as string, payload);

      const body = new FormData();
      for (const [key, value] of Object.entries(payload)) body.append(key, value);
      return gatePassApi.create(body);
    },
    onSuccess: (gatePass) => {
      void queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(isEdit ? 'Gate pass resubmitted' : 'Gate pass raised');
      navigate(`/my-gate-pass/${gatePass._id}`);
    },
    onError: (error: unknown) => {
      const fields = fieldErrors(error);
      for (const [field, message] of Object.entries(fields)) {
        if (field in values) setError(field as keyof FormValues, { message });
      }
      // The server's quota / working-hours messages are written for humans —
      // show them verbatim rather than flattening them into "Bad request".
      const message = errorMessage(error);
      setServerError(message);
      toast.error(message);
    },
  });

  const onSubmit = handleSubmit((form) => {
    setServerError(null);
    return save.mutateAsync(form).catch(() => undefined);
  });

  /* ── Guards ─────────────────────────────────────────────────────────────── */
  if (prefillLoading || (isEdit && existingLoading)) return <DetailSkeleton />;

  if (isEdit && existing && !EDITABLE_STATUSES.includes(existing.status)) {
    return (
      <>
        <PageHeader
          title="Edit gate pass"
          breadcrumbs={[{ label: 'My Gate Passes', to: '/my-gate-pass' }, { label: 'Edit' }]}
        />
        <EmptyState
          icon={<Lock className="h-7 w-7" />}
          title="This gate pass can no longer be edited"
          message={`${existing.gatePassNumber} is ${existing.status.replace(/_/g, ' ').toLowerCase()}. A pass is only editable while it is a draft, or after your manager has asked for changes.`}
          action={
            <Button
              variant="secondary"
              leftIcon={<ArrowLeft className="h-4 w-4" />}
              onClick={() => navigate(`/my-gate-pass/${existing._id}`)}
            >
              Back to the gate pass
            </Button>
          }
        />
      </>
    );
  }

  const submitBlocked = !isEdit && quota.blocked;

  return (
    <>
      <PageHeader
        icon={<FilePlus2 className="h-5 w-5" />}
        title={isEdit ? 'Edit & resubmit' : 'New gate pass'}
        subtitle={
          isEdit
            ? 'Address your manager’s comments and send it back for approval.'
            : 'Raise a pass for yourself. Your manager is notified the moment you submit.'
        }
        breadcrumbs={[
          { label: 'My Gate Passes', to: '/my-gate-pass' },
          { label: isEdit ? 'Edit' : 'New' },
        ]}
      />

      <form onSubmit={onSubmit} noValidate>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* ── Form ─────────────────────────────────────────────────────── */}
          <motion.div
            variants={staggerContainer(0.06)}
            initial="initial"
            animate="animate"
            className="space-y-6 lg:col-span-2"
          >
            {/* Server-side rule failures (quota, gate hours, holidays). */}
            <AnimatePresence>
              {serverError && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex items-start gap-3 rounded-2xl border border-danger-500/30 bg-danger-500/5 p-4"
                >
                  <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger-500" />
                  <div>
                    <p className="text-sm font-semibold text-content">We couldn’t submit this yet</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-content-muted">{serverError}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Identity — read only, always. */}
            <Card animated>
              <CardHeader
                icon={<UserIcon className="h-5 w-5" />}
                title="Who this pass is for"
                subtitle="Pulled from your employee record — a gate pass is always raised for yourself."
              />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <ProfileField label="Employee" value={prefill?.employeeName} />
                <ProfileField label="Employee code" value={prefill?.employeeCode} />
                <ProfileField label="Department" value={prefill?.department?.name} />
                <ProfileField label="Unit" value={prefill?.unit?.name} />
                <ProfileField label="Designation" value={prefill?.designation} />
                <ProfileField label="Reporting manager" value={prefill?.reportingManager?.name} />
              </div>

              <p className="mt-3 flex items-center gap-1.5 text-xs text-content-subtle">
                <Lock className="h-3 w-3" />
                These fields come from your profile and cannot be changed here.
              </p>
            </Card>

            {/* The request. */}
            <Card animated>
              <CardHeader
                icon={<Briefcase className="h-5 w-5" />}
                title="The request"
                subtitle="What you need, and why."
              />

              <div className="space-y-5">
                <div>
                  <span className="mb-2 block text-sm font-medium text-content">
                    Gate pass type<span className="ml-0.5 text-danger-500">*</span>
                  </span>
                  <Controller
                    name="type"
                    control={control}
                    render={({ field }) => (
                      <TypePicker value={field.value} onChange={field.onChange} />
                    )}
                  />
                  {errors.type && (
                    <p className="mt-1.5 text-xs font-medium text-danger-500">{errors.type.message}</p>
                  )}
                </div>

                <Controller
                  name="reason"
                  control={control}
                  render={({ field }) => (
                    <Textarea
                      {...field}
                      label="Reason"
                      required
                      showCount
                      maxLength={500}
                      placeholder="Client meeting at the Andheri office…"
                      error={errors.reason?.message}
                    />
                  )}
                />

                <Controller
                  name="purpose"
                  control={control}
                  render={({ field }) => (
                    <Textarea
                      {...field}
                      label="Purpose"
                      required={workflow.purposeMandatory}
                      showCount
                      maxLength={1000}
                      placeholder="Any detail your manager needs to decide…"
                      hint={workflow.purposeMandatory ? undefined : 'Optional'}
                      error={errors.purpose?.message}
                    />
                  )}
                />
              </div>
            </Card>

            {/* Timing. */}
            <Card animated>
              <CardHeader
                icon={<CalendarClock className="h-5 w-5" />}
                title="When"
                subtitle={
                  plannedDuration
                    ? `You'll be out for about ${formatDuration(plannedDuration)}.`
                    : 'Pick when you leave and when you expect to be back.'
                }
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  type="datetime-local"
                  label="Expected out time"
                  required
                  error={errors.expectedOutTime?.message}
                  {...register('expectedOutTime')}
                />
                <Input
                  type="datetime-local"
                  label="Expected in time"
                  required
                  error={errors.expectedInTime?.message}
                  {...register('expectedInTime')}
                />
              </div>

              <div className="mt-5">
                <Controller
                  name="remarks"
                  control={control}
                  render={({ field }) => (
                    <Textarea
                      {...field}
                      label="Remarks"
                      showCount
                      maxLength={1000}
                      placeholder="Anything else worth noting…"
                      hint="Optional"
                      error={errors.remarks?.message}
                    />
                  )}
                />
              </div>
            </Card>

            {/* Attachments — read-only, and only for passes that already carry them. */}
            {isEdit && existingAttachments.length > 0 && (
              <Card animated>
                <CardHeader
                  title="Attachments"
                  subtitle="Files you attached when you first raised this pass."
                />
                <AttachmentList attachments={existingAttachments} />
              </Card>
            )}

            {/* Desktop submit — the mobile one is pinned below. */}
            <div className="hidden items-center justify-end gap-3 lg:flex">
              <Button variant="ghost" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="lg"
                isLoading={isSubmitting || save.isPending}
                disabled={submitBlocked}
                leftIcon={<Send className="h-4 w-4" />}
              >
                {isEdit ? 'Resubmit for approval' : 'Submit for approval'}
              </Button>
            </div>
          </motion.div>

          {/* ── Quota + preview ──────────────────────────────────────────── */}
          <motion.aside
            variants={staggerContainer(0.06, 0.1)}
            initial="initial"
            animate="animate"
            className="space-y-6"
          >
            <Card animated>
              <CardHeader
                title="Your quota"
                subtitle={`${values.type === 'PERSONAL' ? 'Personal' : 'Official'} passes used in each period`}
              />

              {quota.rings.length ? (
                <div className="flex flex-wrap items-center justify-center gap-5">
                  {quota.rings.map((ring) => (
                    <ProgressRing
                      key={ring.period}
                      value={ring.used}
                      max={ring.limit}
                      size={88}
                      label={ring.period}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-content-subtle">No limits are configured for this type.</p>
              )}

              <AnimatePresence mode="wait">
                {(quota.blocked || quota.warning) && (
                  <motion.div
                    key={quota.blocked ? 'blocked' : 'warning'}
                    variants={staggerItem}
                    initial="initial"
                    animate="animate"
                    className={cn(
                      'mt-5 flex items-start gap-2.5 rounded-xl border p-3',
                      quota.blocked
                        ? 'border-danger-500/30 bg-danger-500/5'
                        : 'border-warning-500/30 bg-warning-500/5'
                    )}
                  >
                    <AlertTriangle
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        quota.blocked ? 'text-danger-500' : 'text-warning-500'
                      )}
                    />
                    <p className="text-xs leading-relaxed text-content-muted">{quota.message}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>

            <Card animated>
              <CardHeader title="Summary" subtitle="What your manager will see" />

              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-content-muted">Type</dt>
                  <dd>
                    <TypeBadge type={values.type} />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-content-muted">Duration</dt>
                  <dd className="font-medium text-content">
                    {plannedDuration ? formatDuration(plannedDuration) : '—'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-content-muted">Approver</dt>
                  <dd className="truncate font-medium text-content">
                    {prefill?.reportingManager?.name ?? 'Not assigned'}
                  </dd>
                </div>
                <div className="border-t border-line pt-3">
                  <dt className="text-content-muted">Reason</dt>
                  <dd className="mt-1 line-clamp-3 text-content">
                    {values.reason || <span className="text-content-subtle">Not written yet</span>}
                  </dd>
                </div>
              </dl>

              {!prefill?.reportingManager && (
                <p className="mt-4 flex items-start gap-2 rounded-xl border border-warning-500/30 bg-warning-500/5 p-3 text-xs text-content-muted">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-500" />
                  You have no reporting manager on your profile. Ask HR to set one, or this pass will
                  have nobody to approve it.
                </p>
              )}
            </Card>
          </motion.aside>
        </div>

        {/* Mobile submit bar. */}
        <div className="sticky bottom-0 z-20 -mx-4 mt-6 flex gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-xl lg:hidden">
          <Button variant="secondary" fullWidth onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button
            type="submit"
            fullWidth
            isLoading={isSubmitting || save.isPending}
            disabled={submitBlocked}
            leftIcon={<Send className="h-4 w-4" />}
          >
            {isEdit ? 'Resubmit' : 'Submit'}
          </Button>
        </div>
      </form>
    </>
  );
};

export default NewGatePass;
