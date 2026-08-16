import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  Info,
  Send,
  TriangleAlert,
  Users,
} from 'lucide-react';

import { Badge, Button, Card, CardHeader, Input, Select, Textarea, type SelectOption } from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { PERMISSION } from '@/permissions/constants';
import { usePermissions } from '@/permissions/usePermissions';
import { leaveApplicationApi } from '@/services/leave.endpoints';
import { userApi } from '@/services/endpoints';
import { errorMessage } from '@/services/api';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate } from '@/utils/format';
import { cn } from '@/utils/cn';
import { pageVariants, staggerContainer, staggerItem } from '@/animations/variants';
import type { ApplyLeaveType, BulkApplyResult, DayPart, LeaveRequestRow } from '@/types/leave';

const DAY_PART_OPTIONS: SelectOption[] = [
  { value: 'FULL', label: 'Full day' },
  { value: 'FIRST_HALF', label: 'First half' },
  { value: 'SECOND_HALF', label: 'Second half' },
];

const today = () => new Date().toISOString().slice(0, 10);

const schema = z
  .object({
    mode: z.enum(['SELF', 'BULK']),
    employees: z.array(z.string()),
    leaveType: z.string().min(1, 'Pick a leave code'),
    fromDate: z.string().min(1, 'Pick a start date'),
    toDate: z.string().min(1, 'Pick an end date'),
    fromDayPart: z.enum(['FULL', 'FIRST_HALF', 'SECOND_HALF']),
    toDayPart: z.enum(['FULL', 'FIRST_HALF', 'SECOND_HALF']),
    reason: z.string().trim().min(5, 'Give a reason of at least 5 characters').max(1000),
    contactDuringLeave: z.string().trim().max(120),
    handoverNotes: z.string().trim().max(1000),
  })
  .superRefine((data, ctx) => {
    if (data.toDate < data.fromDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['toDate'],
        message: 'The end date cannot be before the start date',
      });
    }
    if (data.mode === 'BULK' && data.employees.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['employees'],
        message: 'Select at least one employee',
      });
    }
  });

type FormValues = z.infer<typeof schema>;

/* ─── Balance chip ────────────────────────────────────────────────────────── */
const BalanceChip = ({ type, active, onClick }: { type: ApplyLeaveType; active: boolean; onClick: () => void }) => (
  <motion.button
    type="button"
    variants={staggerItem}
    onClick={onClick}
    className={cn(
      'card card-hover flex min-w-0 flex-col items-start gap-1 p-3 text-left transition-all',
      active && 'ring-2 ring-brand-500'
    )}
  >
    <span className="flex w-full items-center gap-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: type.color }} aria-hidden />
      <span className="truncate text-xs font-semibold text-content">{type.code}</span>
      {type.type === 'UNPAID' && (
        <span className="ml-auto shrink-0 text-2xs text-content-subtle">Unpaid</span>
      )}
    </span>
    <span className="text-lg font-bold tabular-nums leading-none text-content">
      {type.type === 'UNPAID' ? '∞' : type.balance.available}
    </span>
    <span className="truncate text-2xs text-content-muted">
      {type.type === 'UNPAID' ? 'No limit' : `of ${type.balance.entitled} left`}
    </span>
  </motion.button>
);

/* ─── Page ────────────────────────────────────────────────────────────────── */
const ApplyLeave = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canBulk = can(PERMISSION.LEAVE_APPLY_BULK);

  const [mode, setMode] = useState<'SELF' | 'BULK'>('SELF');

  const { data: prefill, isLoading: prefillLoading } = useQuery({
    queryKey: ['leave', 'apply', 'prefill'],
    queryFn: () => leaveApplicationApi.prefill(),
  });

  const { data: people = [] } = useQuery({
    queryKey: ['users', 'lookup'],
    queryFn: userApi.lookup,
    enabled: canBulk,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      mode: 'SELF',
      employees: [],
      leaveType: '',
      fromDate: today(),
      toDate: today(),
      fromDayPart: 'FULL',
      toDayPart: 'FULL',
      reason: '',
      contactDuringLeave: '',
      handoverNotes: '',
    },
  });

  const values = watch();
  const selectedType = useMemo(
    () => prefill?.leaveTypes.find((type) => type._id === values.leaveType),
    [prefill, values.leaveType]
  );

  /* Default to the first leave type once the form loads. */
  useEffect(() => {
    if (!prefill?.leaveTypes.length || values.leaveType) return;
    setValue('leaveType', prefill.leaveTypes[0]._id);
  }, [prefill, values.leaveType, setValue]);

  useEffect(() => {
    setValue('mode', mode);
  }, [mode, setValue]);

  /* A single-day application has only one day part to choose. */
  const isSingleDay = values.fromDate === values.toDate;
  useEffect(() => {
    if (isSingleDay) setValue('toDayPart', values.fromDayPart);
  }, [isSingleDay, values.fromDayPart, setValue]);

  /* ── Live duration + balance preview ──────────────────────────────────── */
  const previewKey = useDebounce(
    JSON.stringify({
      leaveType: values.leaveType,
      fromDate: values.fromDate,
      toDate: values.toDate,
      fromDayPart: values.fromDayPart,
      toDayPart: values.toDayPart,
      employee: mode === 'BULK' ? values.employees[0] : undefined,
    }),
    400
  );

  /*
   * Gate on the DEBOUNCED payload, not the live form values.
   *
   * `enabled` used to read `values.*` while the request body came from
   * `previewKey`, which lags by the debounce. On first load that let the query
   * fire with a leaveType the debounce had not caught up to yet — one 422 per
   * page load, self-correcting 400ms later but noisy in the console and logs.
   */
  const previewPayload = useMemo(() => JSON.parse(previewKey), [previewKey]);

  const { data: preview, error: previewError } = useQuery({
    queryKey: ['leave', 'apply', 'preview', previewKey],
    queryFn: () => leaveApplicationApi.preview(previewPayload),
    enabled: Boolean(
      previewPayload.leaveType &&
        previewPayload.fromDate &&
        previewPayload.toDate &&
        previewPayload.toDate >= previewPayload.fromDate
    ),
    retry: false,
  });

  const submit = useMutation<LeaveRequestRow | BulkApplyResult, unknown, FormValues>({
    mutationFn: (form: FormValues) => {
      const payload = {
        leaveType: form.leaveType,
        fromDate: form.fromDate,
        toDate: form.toDate,
        fromDayPart: form.fromDayPart as DayPart,
        toDayPart: (isSingleDay ? form.fromDayPart : form.toDayPart) as DayPart,
        reason: form.reason.trim(),
        contactDuringLeave: form.contactDuringLeave.trim(),
        handoverNotes: form.handoverNotes.trim(),
      };
      return form.mode === 'BULK'
        ? leaveApplicationApi.bulkApply({ ...payload, employees: form.employees })
        : leaveApplicationApi.apply(payload);
    },
    onSuccess: (result) => {
      if ('applied' in result) {
        const bulk = result;
        toast.success(`Applied for ${bulk.applied.length} of ${bulk.requested} employee(s)`);
        bulk.failed.forEach((row) => toast.error(`${row.employeeName}: ${row.reason}`, { duration: 7000 }));
      } else {
        toast.success(`${result.leaveNumber} submitted for approval`);
      }
      reset({
        mode,
        employees: [],
        leaveType: values.leaveType,
        fromDate: today(),
        toDate: today(),
        fromDayPart: 'FULL',
        toDayPart: 'FULL',
        reason: '',
        contactDuringLeave: '',
        handoverNotes: '',
      });
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
      if (mode === 'SELF') navigate('/leave/my-leaves');
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not apply for leave')),
  });

  const onSubmit = handleSubmit((form) => submit.mutateAsync(form).catch(() => undefined));

  const typeOptions: SelectOption[] = (prefill?.leaveTypes ?? []).map((type) => ({
    value: type._id,
    label: `${type.code} — ${type.name}`,
  }));

  const blocked =
    Boolean(preview && !preview.sufficient) ||
    Boolean(preview?.overlap) ||
    Boolean(preview && preview.totalDays <= 0) ||
    Boolean(prefill && !prefill.employee.hasManager && mode === 'SELF');

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate">
      <PageHeader
        title="Apply Leave"
        subtitle={
          mode === 'SELF'
            ? 'Raise a leave application for yourself.'
            : 'Apply the same leave for several employees at once.'
        }
        icon={<CalendarPlus className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Leave Management' }, { label: 'Apply Leave' }]}
        actions={
          canBulk ? (
            <div className="flex rounded-xl bg-content/5 p-1">
              {(['SELF', 'BULK'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    mode === option ? 'bg-surface text-content shadow-sm' : 'text-content-muted'
                  )}
                >
                  {option === 'SELF' ? 'For myself' : 'For employees'}
                </button>
              ))}
            </div>
          ) : undefined
        }
      />

      {/* ── Leave balance ─────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader
          title="Leave balance"
          subtitle={
            prefill
              ? `${prefill.employee.name} · ${prefill.employee.department || '—'} · leave year ${prefill.leaveYear}`
              : 'Loading…'
          }
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        {prefillLoading ? (
          <p className="py-4 text-sm text-content-muted">Loading balances…</p>
        ) : (
          <motion.div
            variants={staggerContainer(0.04)}
            initial="initial"
            animate="animate"
            className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
          >
            {prefill?.leaveTypes.map((type) => (
              <BalanceChip
                key={type._id}
                type={type}
                active={type._id === values.leaveType}
                onClick={() => setValue('leaveType', type._id, { shouldValidate: true })}
              />
            ))}
          </motion.div>
        )}
      </Card>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
        className="grid gap-6 xl:grid-cols-3"
      >
        {/* ── The application ─────────────────────────────────────────────── */}
        <Card className="xl:col-span-2">
          <CardHeader title="The application" subtitle="Leave code, dates and reason." />

          <div className="grid gap-5 sm:grid-cols-2">
            {mode === 'BULK' && (
              <div className="sm:col-span-2">
                <p className="mb-2 text-sm font-medium text-content">Employees</p>
                <div className="max-h-44 overflow-y-auto rounded-2xl border border-line p-2">
                  {people.map((person) => {
                    const checked = values.employees.includes(person._id);
                    return (
                      <label
                        key={person._id}
                        className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 text-sm transition-colors hover:bg-content/5"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setValue(
                              'employees',
                              checked
                                ? values.employees.filter((id) => id !== person._id)
                                : [...values.employees, person._id],
                              { shouldValidate: true }
                            )
                          }
                          className="h-4 w-4 rounded border-line accent-brand-500"
                        />
                        <span className="truncate text-content">{person.name}</span>
                        <span className="ml-auto shrink-0 font-mono text-xs text-content-muted">
                          {person.employeeId}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {errors.employees && (
                  <p className="mt-1.5 text-xs text-danger-500">{errors.employees.message}</p>
                )}
                <p className="mt-1.5 text-xs text-content-subtle">
                  {values.employees.length} selected. Each application is raised and routed separately.
                </p>
              </div>
            )}

            <div className="sm:col-span-2">
              <Select
                label="Leave code"
                required
                options={typeOptions}
                error={errors.leaveType?.message}
                {...register('leaveType')}
              />
            </div>

            <Input
              label="From"
              type="date"
              required
              error={errors.fromDate?.message}
              {...register('fromDate')}
            />
            <Input
              label="To"
              type="date"
              required
              error={errors.toDate?.message}
              {...register('toDate')}
            />

            <Select
              label={isSingleDay ? 'Duration' : 'First day'}
              options={DAY_PART_OPTIONS}
              disabled={!selectedType?.allowHalfDay}
              hint={!selectedType?.allowHalfDay ? 'This leave type is full-day only.' : undefined}
              {...register('fromDayPart')}
            />
            <Select
              label="Last day"
              options={DAY_PART_OPTIONS}
              disabled={isSingleDay || !selectedType?.allowHalfDay}
              hint={isSingleDay ? 'Same as the first day.' : undefined}
              {...register('toDayPart')}
            />

            <div className="sm:col-span-2">
              <Textarea
                label="Reason"
                required
                rows={3}
                maxLength={1000}
                showCount
                placeholder="Why you need this leave"
                error={errors.reason?.message}
                {...register('reason')}
              />
            </div>

            <Input
              label="Contact during leave"
              placeholder="Phone number"
              error={errors.contactDuringLeave?.message}
              {...register('contactDuringLeave')}
            />
            <Input
              label="Handover notes"
              placeholder="Who is covering, and what"
              error={errors.handoverNotes?.message}
              {...register('handoverNotes')}
            />
          </div>
        </Card>

        {/* ── Duration & checks ───────────────────────────────────────────── */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Leave duration" subtitle="Calculated from your dates." />

            {previewError ? (
              <p className="flex items-start gap-2 text-sm text-danger-500">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {errorMessage(previewError, 'Could not calculate the duration')}
              </p>
            ) : preview ? (
              <div className="space-y-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold tabular-nums tracking-tight text-content">
                    {preview.totalDays}
                  </span>
                  <span className="text-sm text-content-muted">
                    day{preview.totalDays === 1 ? '' : 's'} charged
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge tone="neutral">{preview.spanDays} calendar day(s)</Badge>
                  {preview.nonWorkingDays > 0 && (
                    <Badge tone="info">{preview.nonWorkingDays} non-working</Badge>
                  )}
                </div>

                {/* Per-date breakdown — the "why" behind the number. */}
                <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
                  {preview.breakdown.map((day) => (
                    <li
                      key={day.date}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 odd:bg-content/5"
                    >
                      <span className="truncate text-content-muted">
                        {formatDate(day.date, 'EEE, dd MMM')}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 tabular-nums',
                          day.charged === 0 ? 'text-content-subtle' : 'font-semibold text-content'
                        )}
                        title={day.reason}
                      >
                        {day.charged === 0 ? '—' : day.charged}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-content-muted">Pick a leave code and dates.</p>
            )}
          </Card>

          {/* Insufficient balance / overlap checks */}
          {preview && (
            <Card padding="sm">
              {!preview.sufficient ? (
                <p className="flex items-start gap-2 text-sm text-danger-600 dark:text-danger-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-semibold">Insufficient balance.</span> {preview.balance.available}{' '}
                    day(s) available but {preview.totalDays} requested — short by {preview.shortfall}.
                  </span>
                </p>
              ) : preview.overlap ? (
                <p className="flex items-start gap-2 text-sm text-danger-600 dark:text-danger-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-semibold">Overlaps {preview.overlap.leaveNumber}</span> (
                    {formatDate(preview.overlap.fromDate)} – {formatDate(preview.overlap.toDate)}).
                  </span>
                </p>
              ) : preview.totalDays <= 0 ? (
                <p className="flex items-start gap-2 text-sm text-warning-600 dark:text-warning-400">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  Every date in that range is a weekly off or holiday for this leave type — nothing to apply
                  for.
                </p>
              ) : (
                <p className="flex items-start gap-2 text-sm text-success-600 dark:text-success-400">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  Balance is sufficient — {preview.balance.available - preview.totalDays} day(s) would remain.
                </p>
              )}
            </Card>
          )}

          {prefill && !prefill.employee.hasManager && mode === 'SELF' && (
            <Card padding="sm">
              <p className="flex items-start gap-2 text-sm text-danger-600 dark:text-danger-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                You have no reporting manager assigned. Contact HR before applying.
              </p>
            </Card>
          )}

          <Button
            type="submit"
            className="w-full"
            isLoading={isSubmitting}
            disabled={blocked}
            leftIcon={mode === 'BULK' ? <Users className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          >
            {mode === 'BULK' ? `Apply for ${values.employees.length} employee(s)` : 'Submit application'}
          </Button>
        </div>
      </form>
    </motion.div>
  );
};

export default ApplyLeave;
