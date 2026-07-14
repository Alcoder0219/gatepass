import { useEffect, useMemo, useState } from 'react';
import {
  Controller,
  useFieldArray,
  useForm,
  type Control,
  type FieldPath,
  type UseFormRegister,
} from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Bell,
  Building2,
  CalendarDays,
  Gauge,
  Info,
  Palette,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  DetailSkeleton,
  EmptyState,
  Input,
  Modal,
  Select,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
  type Column,
  type SelectOption,
  type TabItem,
} from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { PERMISSION } from '@/permissions/constants';
import { usePermissions } from '@/permissions/usePermissions';
import { departmentApi, holidayApi, roleApi, settingsApi, unitApi } from '@/services/endpoints';
import { errorMessage, fieldErrors } from '@/services/api';
import { formatDate } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { Holiday, QuotaLimit, Settings as SettingsDoc } from '@/types';

/* ─── Schema — mirrors backend/src/validators/settings.validator.js ───────── */

const quota = z
  .number({ invalid_type_error: 'Enter a number' })
  .int('Whole numbers only')
  .min(0, 'Cannot be negative')
  .max(10_000, 'That limit is unrealistically high');

const ladder = z.object({ daily: quota, weekly: quota, monthly: quota, yearly: quota });
const limitPair = z.object({ official: ladder, personal: ladder });

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm (24-hour) format');

const hex = z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, 'Colours must be hex, e.g. #6366f1');

const schema = z
  .object({
    company: z.object({
      name: z.string().trim().min(2, 'Company name is too short').max(120),
      logo: z.string().trim().max(2048),
      email: z.union([z.literal(''), z.string().email('A valid company email is required')]),
      phone: z.string().trim().max(30),
      address: z.string().trim().max(500),
    }),
    limits: limitPair,
    unitLimits: z.array(z.object({ unit: z.string().min(1, 'Pick a unit'), limits: limitPair })),
    departmentLimits: z.array(
      z.object({ department: z.string().min(1, 'Pick a department'), limits: limitPair })
    ),
    roleLimits: z.array(z.object({ role: z.string().min(1, 'Pick a role'), limits: limitPair })),
    maxActiveGatePasses: z
      .number({ invalid_type_error: 'Enter a number' })
      .int()
      .min(1, 'At least one active gate pass must be allowed')
      .max(50),
    allowMultiplePending: z.boolean(),
    workingHours: z.object({
      gateOpenTime: time,
      gateCloseTime: time,
      weekendDays: z.array(z.number().int().min(0).max(6)),
      restrictWeekend: z.boolean(),
      restrictHolidays: z.boolean(),
      enforceGateHours: z.boolean(),
    }),
    workflow: z.object({
      approvalRequired: z.boolean(),
      hrReviewRequired: z.boolean(),
      hrReviewForPersonalOnly: z.boolean(),
      securityApprovalRequired: z.boolean(),
      attachmentMandatory: z.boolean(),
      reasonMandatory: z.boolean(),
      purposeMandatory: z.boolean(),
      autoClosePass: z.boolean(),
      expiryHours: z
        .number({ invalid_type_error: 'Enter a number' })
        .int()
        .min(1, 'At least 1 hour')
        .max(720, 'At most 720 hours (30 days)'),
      autoReminder: z.boolean(),
      reminderBeforeMinutes: z
        .number({ invalid_type_error: 'Enter a number' })
        .int()
        .min(5, 'At least 5 minutes before')
        .max(1440, 'At most a day before'),
    }),
    notifications: z.object({
      email: z.boolean(),
      push: z.boolean(),
      sms: z.boolean(),
      whatsapp: z.boolean(),
      inApp: z.boolean(),
    }),
    security: z.object({
      requireExitPhoto: z.boolean(),
      requireEntryPhoto: z.boolean(),
      allowManualVerification: z.boolean(),
      qrEnabled: z.boolean(),
    }),
    branding: z.object({
      primaryColor: hex,
      accentColor: hex,
      defaultTheme: z.enum(['light', 'dark', 'system']),
    }),
  })
  .superRefine((data, ctx) => {
    const toMinutes = (value: string) => {
      const [h, m] = value.split(':').map(Number);
      return h * 60 + m;
    };
    if (
      data.workingHours.gateOpenTime &&
      data.workingHours.gateCloseTime &&
      toMinutes(data.workingHours.gateCloseTime) <= toMinutes(data.workingHours.gateOpenTime)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['workingHours', 'gateCloseTime'],
        message: 'The gate must close after it opens',
      });
    }

    // A daily quota above the weekly (or weekly above monthly) is nonsense —
    // the server rejects it, so catch it before the round-trip.
    (['official', 'personal'] as const).forEach((type) => {
      const block = data.limits[type];
      (
        [
          ['daily', 'weekly'],
          ['weekly', 'monthly'],
          ['monthly', 'yearly'],
        ] as const
      ).forEach(([smaller, larger]) => {
        if (block[smaller] > block[larger]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['limits', type, smaller],
            message: `The ${smaller} limit cannot exceed the ${larger} limit`,
          });
        }
      });
    });
  });

type FormValues = z.infer<typeof schema>;

const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const DEFAULT_LADDER: QuotaLimit = { daily: 1, weekly: 3, monthly: 8, yearly: 60 };

const idOf = (value: { _id: string } | string | null | undefined): string =>
  !value ? '' : typeof value === 'string' ? value : value._id;

const asLadder = (value: QuotaLimit | undefined): QuotaLimit => ({
  daily: value?.daily ?? 0,
  weekly: value?.weekly ?? 0,
  monthly: value?.monthly ?? 0,
  yearly: value?.yearly ?? 0,
});

const asPair = (value: { official?: QuotaLimit; personal?: QuotaLimit } | undefined) => ({
  official: asLadder(value?.official),
  personal: asLadder(value?.personal),
});

const toFormValues = (settings: SettingsDoc): FormValues => ({
  company: {
    name: settings.company?.name ?? '',
    logo: settings.company?.logo ?? '',
    email: settings.company?.email ?? '',
    phone: settings.company?.phone ?? '',
    address: settings.company?.address ?? '',
  },
  limits: asPair(settings.limits),
  unitLimits: (settings.unitLimits ?? []).map((row) => ({
    unit: idOf(row.unit),
    limits: asPair(row.limits),
  })),
  departmentLimits: (settings.departmentLimits ?? []).map((row) => ({
    department: idOf(row.department),
    limits: asPair(row.limits),
  })),
  roleLimits: (settings.roleLimits ?? []).map((row) => ({
    role: idOf(row.role),
    limits: asPair(row.limits),
  })),
  maxActiveGatePasses: settings.maxActiveGatePasses ?? 2,
  allowMultiplePending: settings.allowMultiplePending ?? false,
  workingHours: {
    gateOpenTime: settings.workingHours?.gateOpenTime ?? '08:00',
    gateCloseTime: settings.workingHours?.gateCloseTime ?? '20:00',
    weekendDays: settings.workingHours?.weekendDays ?? [0],
    restrictWeekend: settings.workingHours?.restrictWeekend ?? false,
    restrictHolidays: settings.workingHours?.restrictHolidays ?? true,
    enforceGateHours: settings.workingHours?.enforceGateHours ?? true,
  },
  workflow: {
    approvalRequired: settings.workflow?.approvalRequired ?? true,
    hrReviewRequired: settings.workflow?.hrReviewRequired ?? true,
    hrReviewForPersonalOnly: settings.workflow?.hrReviewForPersonalOnly ?? false,
    securityApprovalRequired: settings.workflow?.securityApprovalRequired ?? true,
    attachmentMandatory: settings.workflow?.attachmentMandatory ?? false,
    reasonMandatory: settings.workflow?.reasonMandatory ?? true,
    purposeMandatory: settings.workflow?.purposeMandatory ?? false,
    autoClosePass: settings.workflow?.autoClosePass ?? true,
    expiryHours: settings.workflow?.expiryHours ?? 24,
    autoReminder: settings.workflow?.autoReminder ?? true,
    reminderBeforeMinutes: settings.workflow?.reminderBeforeMinutes ?? 30,
  },
  notifications: {
    email: settings.notifications?.email ?? true,
    push: settings.notifications?.push ?? true,
    sms: settings.notifications?.sms ?? false,
    whatsapp: settings.notifications?.whatsapp ?? false,
    inApp: settings.notifications?.inApp ?? true,
  },
  security: {
    requireExitPhoto: settings.security?.requireExitPhoto ?? false,
    requireEntryPhoto: settings.security?.requireEntryPhoto ?? false,
    allowManualVerification: settings.security?.allowManualVerification ?? true,
    qrEnabled: settings.security?.qrEnabled ?? true,
  },
  branding: {
    primaryColor: settings.branding?.primaryColor ?? '#6366f1',
    accentColor: settings.branding?.accentColor ?? '#06b6d4',
    defaultTheme: settings.branding?.defaultTheme ?? 'system',
  },
});

/* ─── Reusable bits ──────────────────────────────────────────────────────── */

/** The blue "read this before you touch anything" strip. */
const Callout = ({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warning' }) => (
  <div
    className={cn(
      'flex items-start gap-3 rounded-2xl border px-4 py-3',
      tone === 'info'
        ? 'border-info-500/30 bg-info-500/5'
        : 'border-warning-500/30 bg-warning-500/5'
    )}
  >
    <Info
      className={cn('mt-0.5 h-4 w-4 shrink-0', tone === 'info' ? 'text-info-500' : 'text-warning-500')}
    />
    <div className="text-sm leading-relaxed text-content-muted">{children}</div>
  </div>
);

/** A daily/weekly/monthly/yearly quota row. */
const QuotaLadder = ({
  label,
  basePath,
  register,
  disabled,
  compact,
}: {
  label: string;
  basePath: string;
  register: UseFormRegister<FormValues>;
  disabled: boolean;
  compact?: boolean;
}) => (
  <div>
    <p className={cn('mb-2 text-sm font-semibold text-content', compact && 'text-xs uppercase tracking-wider text-content-muted')}>
      {label}
    </p>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {PERIODS.map((period) => (
        <Input
          key={period}
          type="number"
          min={0}
          label={compact ? undefined : period.charAt(0).toUpperCase() + period.slice(1)}
          aria-label={`${label} ${period} limit`}
          disabled={disabled}
          className="tabular-nums"
          {...register(`${basePath}.${period}` as FieldPath<FormValues>, { valueAsNumber: true })}
        />
      ))}
    </div>
  </div>
);

/* ─── Override tables (unit / department / role) ─────────────────────────── */

type OverrideKind = 'unitLimits' | 'departmentLimits' | 'roleLimits';

const OVERRIDE_META: Record<OverrideKind, { title: string; subject: string; field: string }> = {
  roleLimits: { title: 'Per-role overrides', subject: 'role', field: 'role' },
  departmentLimits: { title: 'Per-department overrides', subject: 'department', field: 'department' },
  unitLimits: { title: 'Per-unit overrides', subject: 'unit', field: 'unit' },
};

const OverrideTable = ({
  kind,
  control,
  register,
  options,
  disabled,
}: {
  kind: OverrideKind;
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  options: SelectOption[];
  disabled: boolean;
}) => {
  const meta = OVERRIDE_META[kind];
  const { fields, append, remove } = useFieldArray({ control, name: kind });

  return (
    <Card>
      <CardHeader
        title={meta.title}
        subtitle={`Give a ${meta.subject} its own quota ladder. Anything you leave here inherits the global limits.`}
        icon={<Gauge className="h-5 w-5" />}
        action={
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            disabled={disabled || options.length === 0}
            onClick={() =>
              append({
                [meta.field]: '',
                limits: { official: { ...DEFAULT_LADDER }, personal: { ...DEFAULT_LADDER } },
              } as FormValues[OverrideKind][number])
            }
          >
            Add row
          </Button>
        }
      />

      {fields.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-content-subtle">
          No {meta.subject} overrides. Every {meta.subject} uses the global limits above.
        </p>
      ) : (
        <div className="space-y-4">
          {fields.map((field, index) => (
            <div key={field.id} className="rounded-2xl border border-line bg-surface-sunken/40 p-4">
              <div className="mb-4 flex items-end gap-3">
                <Select
                  label={meta.subject.charAt(0).toUpperCase() + meta.subject.slice(1)}
                  placeholder={`Select a ${meta.subject}`}
                  options={options}
                  disabled={disabled}
                  {...register(`${kind}.${index}.${meta.field}` as FieldPath<FormValues>)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  onClick={() => remove(index)}
                  aria-label="Remove this override"
                  className="shrink-0 text-danger-500 hover:bg-danger-500/10"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <QuotaLadder
                  compact
                  label="Official"
                  basePath={`${kind}.${index}.limits.official`}
                  register={register}
                  disabled={disabled}
                />
                <QuotaLadder
                  compact
                  label="Personal"
                  basePath={`${kind}.${index}.limits.personal`}
                  register={register}
                  disabled={disabled}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

/* ─── Holidays ───────────────────────────────────────────────────────────── */

const holidaySchema = z.object({
  name: z.string().trim().min(2, 'Holiday name is required').max(120),
  date: z.string().min(1, 'Pick a date'),
  type: z.enum(['PUBLIC', 'RESTRICTED', 'COMPANY']),
  units: z.array(z.string()),
  restrictGatePass: z.boolean(),
  description: z.string().trim().max(280),
});

type HolidayValues = z.infer<typeof holidaySchema>;

const EMPTY_HOLIDAY: HolidayValues = {
  name: '',
  date: '',
  type: 'PUBLIC',
  units: [],
  restrictGatePass: true,
  description: '',
};

const HOLIDAY_TYPES: SelectOption[] = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'RESTRICTED', label: 'Restricted' },
  { value: 'COMPANY', label: 'Company' },
];

const HolidayManager = ({ readOnly }: { readOnly: boolean }) => {
  const queryClient = useQueryClient();
  const year = new Date().getFullYear();

  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);

  const listQuery = useQuery({
    queryKey: ['holidays', year, page],
    queryFn: () => holidayApi.list({ year, page, limit: 20, sort: 'date' }),
  });

  const { data: units = [] } = useQuery({ queryKey: ['units', 'lookup'], queryFn: unitApi.lookup });

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<HolidayValues>({ resolver: zodResolver(holidaySchema), defaultValues: EMPTY_HOLIDAY });

  useEffect(() => {
    if (!formOpen) return;
    reset(
      editing
        ? {
            name: editing.name,
            date: editing.date ? editing.date.slice(0, 10) : '',
            type: editing.type,
            units: (editing.units ?? []).map(String),
            restrictGatePass: editing.restrictGatePass,
            description: editing.description ?? '',
          }
        : EMPTY_HOLIDAY
    );
  }, [formOpen, editing, reset]);

  const save = useMutation({
    mutationFn: (values: HolidayValues) => {
      const payload: Partial<Holiday> = {
        name: values.name.trim(),
        date: values.date,
        type: values.type,
        units: values.units,
        restrictGatePass: values.restrictGatePass,
        description: values.description.trim(),
      };
      return editing ? holidayApi.update(editing._id, payload) : holidayApi.create(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Holiday updated' : 'Holiday added');
      setFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['holidays'] });
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not save the holiday')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => holidayApi.remove(id),
    onSuccess: () => {
      toast.success('Holiday removed');
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['holidays'] });
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not remove the holiday')),
  });

  const onSubmit = handleSubmit((values) => save.mutateAsync(values).catch(() => undefined));

  const unitNames = (holiday: Holiday) => {
    if (!holiday.units?.length) return 'All units';
    const names = holiday.units
      .map((id) => units.find((unit) => unit._id === String(id))?.name)
      .filter(Boolean);
    return names.length ? names.join(', ') : `${holiday.units.length} unit(s)`;
  };

  const actions = (holiday: Holiday) =>
    readOnly ? null : (
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Edit ${holiday.name}`}
          onClick={() => {
            setEditing(holiday);
            setFormOpen(true);
          }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${holiday.name}`}
          onClick={() => setDeleteTarget(holiday)}
          className="text-danger-500 hover:bg-danger-500/10"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );

  const columns: Column<Holiday>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (row) => (
        <span className="whitespace-nowrap text-sm font-semibold text-content">
          {formatDate(row.date)}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Holiday',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-content">{row.name}</p>
          <p className="truncate text-xs text-content-muted">{row.description || '—'}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      hideBelow: 'md',
      render: (row) => <Badge tone={row.type === 'PUBLIC' ? 'brand' : 'neutral'}>{row.type}</Badge>,
    },
    {
      key: 'units',
      header: 'Applies to',
      hideBelow: 'lg',
      render: (row) => <span className="text-sm text-content-muted">{unitNames(row)}</span>,
    },
    {
      key: 'restrictGatePass',
      header: 'Gate passes',
      render: (row) => (
        <Badge tone={row.restrictGatePass ? 'danger' : 'success'} dot>
          {row.restrictGatePass ? 'Blocked' : 'Allowed'}
        </Badge>
      ),
    },
    { key: 'actions', header: '', headerClassName: 'w-24', render: actions },
  ];

  return (
    <Card>
      <CardHeader
        title={`Holidays — ${year}`}
        subtitle="A holiday with “Blocked” stops gate passes being raised on that date."
        icon={<CalendarDays className="h-5 w-5" />}
        action={
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            disabled={readOnly}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Add holiday
          </Button>
        }
      />

      <DataTable
        data={listQuery.data?.items ?? []}
        columns={columns}
        isLoading={listQuery.isPending}
        rowKey={(row) => row._id}
        meta={listQuery.data?.meta}
        onPageChange={setPage}
        emptyTitle={`No holidays for ${year}`}
        emptyMessage="Add the public holiday calendar so gate passes cannot be raised on a closed day."
        mobileCard={(row) => (
          <Card padding="sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-content">{row.name}</p>
                <p className="text-xs text-content-muted">{formatDate(row.date)}</p>
              </div>
              {actions(row)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Badge tone={row.type === 'PUBLIC' ? 'brand' : 'neutral'}>{row.type}</Badge>
              <Badge tone={row.restrictGatePass ? 'danger' : 'success'} dot>
                {row.restrictGatePass ? 'Gate passes blocked' : 'Gate passes allowed'}
              </Badge>
              <span className="truncate text-xs text-content-subtle">{unitNames(row)}</span>
            </div>
          </Card>
        )}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="lg"
        icon={<CalendarDays className="h-5 w-5" />}
        title={editing ? `Edit ${editing.name}` : 'Add holiday'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void onSubmit()} isLoading={isSubmitting}>
              {editing ? 'Save changes' : 'Add holiday'}
            </Button>
          </>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
          className="grid gap-5 sm:grid-cols-2"
        >
          <Input
            label="Name"
            required
            placeholder="Republic Day"
            error={errors.name?.message}
            {...register('name')}
          />
          <Input label="Date" type="date" required error={errors.date?.message} {...register('date')} />

          <Select label="Type" options={HOLIDAY_TYPES} error={errors.type?.message} {...register('type')} />

          <div className="flex items-end">
            <Controller
              control={control}
              name="restrictGatePass"
              render={({ field }) => (
                <Switch
                  label="Block gate passes"
                  description="Nobody can raise a pass dated on this day."
                  checked={field.value}
                  onChange={field.onChange}
                  className="w-full"
                />
              )}
            />
          </div>

          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-content">Applies to</span>
            <p className="mb-2 text-xs text-content-subtle">
              Select nothing and the holiday applies to every unit.
            </p>
            <Controller
              control={control}
              name="units"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {units.map((unit) => {
                    const selected = field.value.includes(unit._id);
                    return (
                      <button
                        key={unit._id}
                        type="button"
                        onClick={() =>
                          field.onChange(
                            selected
                              ? field.value.filter((id: string) => id !== unit._id)
                              : [...field.value, unit._id]
                          )
                        }
                        className={cn(
                          'rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition-colors',
                          selected
                            ? 'bg-brand-500/15 text-brand-700 ring-brand-500/40 dark:text-brand-300'
                            : 'bg-content/5 text-content-muted ring-transparent hover:text-content'
                        )}
                      >
                        {unit.name}
                      </button>
                    );
                  })}
                  {units.length === 0 && (
                    <span className="text-sm text-content-subtle">No units yet</span>
                  )}
                </div>
              )}
            />
          </div>

          <div className="sm:col-span-2">
            <Textarea
              label="Description"
              rows={2}
              maxLength={280}
              showCount
              error={errors.description?.message}
              {...register('description')}
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) remove.mutate(deleteTarget._id);
        }}
        isLoading={remove.isPending}
        title="Remove this holiday?"
        confirmLabel="Remove"
        icon={<Trash2 className="h-5 w-5" />}
        message={
          <>
            <span className="font-semibold text-content">{deleteTarget?.name}</span> will be taken off
            the calendar, and gate passes can be raised on that date again.
          </>
        }
      />
    </Card>
  );
};

/* ─── The console ────────────────────────────────────────────────────────── */

const TABS: TabItem[] = [
  { value: 'company', label: 'Company', icon: <Building2 className="h-4 w-4" /> },
  { value: 'limits', label: 'Gate Pass Limits', icon: <Gauge className="h-4 w-4" /> },
  { value: 'hours', label: 'Working Hours', icon: <CalendarDays className="h-4 w-4" /> },
  { value: 'workflow', label: 'Workflow', icon: <SlidersHorizontal className="h-4 w-4" /> },
  { value: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
  { value: 'security', label: 'Security', icon: <ShieldCheck className="h-4 w-4" /> },
  { value: 'branding', label: 'Branding', icon: <Palette className="h-4 w-4" /> },
];

const SettingsPage = () => {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const readOnly = !can(PERMISSION.SETTINGS_UPDATE);

  const [tab, setTab] = useState('company');

  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });

  const { data: units = [] } = useQuery({ queryKey: ['units', 'lookup'], queryFn: unitApi.lookup });
  const { data: departments = [] } = useQuery({
    queryKey: ['departments', 'lookup', 'all'],
    queryFn: () => departmentApi.lookup(),
  });
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: roleApi.list });

  const unitOptions = useMemo<SelectOption[]>(
    () => units.map((unit) => ({ value: unit._id, label: unit.name })),
    [units]
  );
  const departmentOptions = useMemo<SelectOption[]>(
    () => departments.map((department) => ({ value: department._id, label: department.name })),
    [departments]
  );
  const roleOptions = useMemo<SelectOption[]>(
    () => roles.map((role) => ({ value: role._id, label: role.name })),
    [roles]
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (settingsQuery.data) reset(toFormValues(settingsQuery.data));
  }, [settingsQuery.data, reset]);

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      settingsApi.update(values as unknown as Record<string, unknown>),
    onSuccess: (saved) => {
      toast.success('Settings saved');
      reset(toFormValues(saved));
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: unknown) => {
      const fields = fieldErrors(error);
      Object.entries(fields).forEach(([path, message]) =>
        setError(path as FieldPath<FormValues>, { message })
      );
      toast.error(errorMessage(error, 'Could not save the settings'));
    },
  });

  const onSubmit = handleSubmit(
    (values) => save.mutateAsync(values).catch(() => undefined),
    () => toast.error('Some fields need fixing — check the highlighted tabs.')
  );

  if (settingsQuery.isPending) {
    return (
      <div>
        <PageHeader title="Settings" icon={<SlidersHorizontal className="h-5 w-5" />} />
        <DetailSkeleton />
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <div>
        <PageHeader title="Settings" icon={<SlidersHorizontal className="h-5 w-5" />} />
        <EmptyState
          title="Settings could not be loaded"
          message={errorMessage(settingsQuery.error)}
          action={<Button onClick={() => void settingsQuery.refetch()}>Try again</Button>}
        />
      </div>
    );
  }

  return (
    <div className="pb-24">
      <PageHeader
        title="Settings"
        subtitle="The rules the whole gate pass workflow runs on."
        icon={<SlidersHorizontal className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Administration' }, { label: 'Settings' }]}
        actions={
          readOnly ? (
            <Tooltip content="You need the Update Settings permission">
              <Badge tone="neutral" dot>
                Read-only
              </Badge>
            </Tooltip>
          ) : undefined
        }
      />

      <Tabs tabs={TABS} value={tab} onChange={setTab} layoutId="settings-tabs" className="mb-6" />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
      >
        {/* A disabled fieldset makes read-only genuinely read-only, rather than
         *  a hidden save button that a determined click can still reach. */}
        <fieldset disabled={readOnly} className="space-y-6">
          {/* ── Company ──────────────────────────────────────────────────── */}
          {tab === 'company' && (
            <Card>
              <CardHeader
                title="Company"
                subtitle="Shown on printed gate passes, emails and the sign-in screen."
                icon={<Building2 className="h-5 w-5" />}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <Input
                  label="Company name"
                  required
                  error={errors.company?.name?.message}
                  {...register('company.name')}
                />
                <Input
                  label="Logo URL"
                  placeholder="https://…/logo.png"
                  hint="Used on printed passes and emails."
                  error={errors.company?.logo?.message}
                  {...register('company.logo')}
                />
                <Input
                  label="Email"
                  type="email"
                  error={errors.company?.email?.message}
                  {...register('company.email')}
                />
                <Input
                  label="Phone"
                  error={errors.company?.phone?.message}
                  {...register('company.phone')}
                />
                <div className="sm:col-span-2">
                  <Textarea
                    label="Address"
                    rows={3}
                    maxLength={500}
                    error={errors.company?.address?.message}
                    {...register('company.address')}
                  />
                </div>
              </div>
            </Card>
          )}

          {/* ── Gate pass limits ─────────────────────────────────────────── */}
          {tab === 'limits' && (
            <>
              <Callout>
                <p>
                  <span className="font-semibold text-content">Resolution order:</span>{' '}
                  <span className="font-mono text-xs">role → department → unit → global</span>. The most
                  specific rule that matches a person wins — a role override beats a department
                  override, which beats a unit override, which beats the global ladder below.
                </p>
              </Callout>

              <Card>
                <CardHeader
                  title="Global limits"
                  subtitle="The default quota everyone gets, unless an override below applies to them."
                  icon={<Gauge className="h-5 w-5" />}
                />
                <div className="space-y-6">
                  <QuotaLadder
                    label="Official gate passes"
                    basePath="limits.official"
                    register={register}
                    disabled={readOnly}
                  />
                  <div className="border-t border-line pt-6">
                    <QuotaLadder
                      label="Personal gate passes"
                      basePath="limits.personal"
                      register={register}
                      disabled={readOnly}
                    />
                  </div>

                  {(errors.limits?.official || errors.limits?.personal) && (
                    <p className="text-xs font-medium text-danger-500">
                      {errors.limits.official?.daily?.message ??
                        errors.limits.official?.weekly?.message ??
                        errors.limits.official?.monthly?.message ??
                        errors.limits.personal?.daily?.message ??
                        errors.limits.personal?.weekly?.message ??
                        errors.limits.personal?.monthly?.message ??
                        'Check the quota ladder — a shorter period cannot exceed a longer one.'}
                    </p>
                  )}

                  <div className="grid gap-5 border-t border-line pt-6 sm:grid-cols-2">
                    <Input
                      label="Max active gate passes"
                      type="number"
                      min={1}
                      hint="How many passes one person may have in flight (pending, approved or out) at once."
                      error={errors.maxActiveGatePasses?.message}
                      className="tabular-nums"
                      {...register('maxActiveGatePasses', { valueAsNumber: true })}
                    />
                    <div className="flex items-end">
                      <Controller
                        control={control}
                        name="allowMultiplePending"
                        render={({ field }) => (
                          <Switch
                            label="Allow multiple pending passes"
                            description="Off: a person must have their pending pass decided before raising another."
                            disabled={readOnly}
                            checked={Boolean(field.value)}
                            onChange={field.onChange}
                            className="w-full"
                          />
                        )}
                      />
                    </div>
                  </div>
                </div>
              </Card>

              <OverrideTable
                kind="roleLimits"
                control={control}
                register={register}
                options={roleOptions}
                disabled={readOnly}
              />
              <OverrideTable
                kind="departmentLimits"
                control={control}
                register={register}
                options={departmentOptions}
                disabled={readOnly}
              />
              <OverrideTable
                kind="unitLimits"
                control={control}
                register={register}
                options={unitOptions}
                disabled={readOnly}
              />
            </>
          )}

          {/* ── Working hours ────────────────────────────────────────────── */}
          {tab === 'hours' && (
            <>
              <Card>
                <CardHeader
                  title="Gate hours"
                  subtitle="The window during which someone may physically leave."
                  icon={<CalendarDays className="h-5 w-5" />}
                />

                <div className="grid gap-5 sm:grid-cols-2">
                  <Input
                    label="Gate opens"
                    type="time"
                    error={errors.workingHours?.gateOpenTime?.message}
                    {...register('workingHours.gateOpenTime')}
                  />
                  <Input
                    label="Gate closes"
                    type="time"
                    hint="A unit with its own gate hours overrides this."
                    error={errors.workingHours?.gateCloseTime?.message}
                    {...register('workingHours.gateCloseTime')}
                  />
                </div>

                <div className="mt-6 border-t border-line pt-6">
                  <span className="mb-1.5 block text-sm font-medium text-content">Weekend days</span>
                  <p className="mb-3 text-xs text-content-subtle">
                    The days treated as non-working. Only enforced when “Restrict weekends” is on.
                  </p>
                  <Controller
                    control={control}
                    name="workingHours.weekendDays"
                    render={({ field }) => (
                      <div className="flex flex-wrap gap-2">
                        {DAYS.map((day) => {
                          const selected = (field.value ?? []).includes(day.value);
                          return (
                            <button
                              key={day.value}
                              type="button"
                              disabled={readOnly}
                              onClick={() =>
                                field.onChange(
                                  selected
                                    ? field.value.filter((value: number) => value !== day.value)
                                    : [...(field.value ?? []), day.value]
                                )
                              }
                              className={cn(
                                'h-10 w-14 rounded-xl text-sm font-semibold ring-1 ring-inset transition-colors',
                                selected
                                  ? 'bg-brand-500/15 text-brand-700 ring-brand-500/40 dark:text-brand-300'
                                  : 'bg-content/5 text-content-muted ring-transparent hover:text-content',
                                readOnly && 'cursor-not-allowed opacity-60'
                              )}
                            >
                              {day.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  />
                </div>

                <div className="mt-6 space-y-1 border-t border-line pt-6">
                  <Controller
                    control={control}
                    name="workingHours.restrictWeekend"
                    render={({ field }) => (
                      <Switch
                        label="Restrict weekends"
                        description="On: gate passes cannot be raised for the weekend days selected above. Off: weekends behave like any other day."
                        disabled={readOnly}
                        checked={Boolean(field.value)}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name="workingHours.restrictHolidays"
                    render={({ field }) => (
                      <Switch
                        label="Restrict holidays"
                        description="On: a holiday marked “Blocked” below stops passes on that date. Off: the holiday calendar is informational only."
                        disabled={readOnly}
                        checked={Boolean(field.value)}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name="workingHours.enforceGateHours"
                    render={({ field }) => (
                      <Switch
                        label="Enforce gate hours"
                        description="On: a pass whose out-time falls outside the window is rejected. Off: anyone may request any time of day, including 3am."
                        disabled={readOnly}
                        checked={Boolean(field.value)}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </div>
              </Card>

              <HolidayManager readOnly={readOnly} />
            </>
          )}

          {/* ── Workflow ─────────────────────────────────────────────────── */}
          {tab === 'workflow' && (
            <>
              <Callout tone="warning">
                These switches change how a gate pass actually moves. Turning a stage{' '}
                <span className="font-semibold text-content">off</span> does not hide it — it removes
                it from the workflow, and passes will skip straight past that approver.
              </Callout>

              <Card>
                <CardHeader
                  title="Approval stages"
                  subtitle="Who has to say yes before someone can walk out of the gate."
                  icon={<SlidersHorizontal className="h-5 w-5" />}
                />
                <div className="space-y-1">
                  <Controller
                    control={control}
                    name="workflow.approvalRequired"
                    render={({ field }) => (
                      <Switch
                        label="Manager approval required"
                        description="Off: every gate pass is auto-approved the moment it is raised. Nobody reviews it."
                        disabled={readOnly}
                        checked={Boolean(field.value)}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name="workflow.hrReviewRequired"
                    render={({ field }) => (
                      <Switch
                        label="HR review required"
                        description="Off: approved passes go straight to security — HR never sees them."
                        disabled={readOnly}
                        checked={Boolean(field.value)}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name="workflow.hrReviewForPersonalOnly"
                    render={({ field }) => (
                      <Switch
                        label="HR review for personal passes only"
                        description="On: official passes skip HR, personal ones do not. Off: the HR stage applies to both types equally."
                        disabled={readOnly}
                        checked={Boolean(field.value)}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name="workflow.securityApprovalRequired"
                    render={({ field }) => (
                      <Switch
                        label="Security verification required"
                        description="Off: nobody records the exit or the return — a pass is closed without ever being scanned at the gate."
                        disabled={readOnly}
                        checked={Boolean(field.value)}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </div>
              </Card>

              <Card>
                <CardHeader
                  title="What the employee must supply"
                  subtitle="Fields the gate pass form refuses to submit without."
                  icon={<Info className="h-5 w-5" />}
                />
                <div className="space-y-1">
                  <Controller
                    control={control}
                    name="workflow.reasonMandatory"
                    render={({ field }) => (
                      <Switch
                        label="Reason mandatory"
                        description="Off: a pass can be raised with no stated reason — approvers will be deciding blind."
                        disabled={readOnly}
                        checked={Boolean(field.value)}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name="workflow.purposeMandatory"
                    render={({ field }) => (
                      <Switch
                        label="Purpose mandatory"
                        description="Off: the purpose field becomes optional."
                        disabled={readOnly}
                        checked={Boolean(field.value)}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name="workflow.attachmentMandatory"
                    render={({ field }) => (
                      <Switch
                        label="Attachment mandatory"
                        description="Off: supporting documents become optional on every pass."
                        disabled={readOnly}
                        checked={Boolean(field.value)}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </div>
              </Card>

              <Card>
                <CardHeader
                  title="Lifecycle & reminders"
                  subtitle="What happens to a pass nobody acts on."
                  icon={<Bell className="h-5 w-5" />}
                />
                <div className="space-y-1">
                  <Controller
                    control={control}
                    name="workflow.autoClosePass"
                    render={({ field }) => (
                      <Switch
                        label="Auto-close passes"
                        description="Off: a pass that is never used stays open forever and keeps consuming the person's active-pass slot."
                        disabled={readOnly}
                        checked={Boolean(field.value)}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name="workflow.autoReminder"
                    render={({ field }) => (
                      <Switch
                        label="Automatic reminders"
                        description="Off: nobody is nudged before their return time — late returns go unnoticed until security checks."
                        disabled={readOnly}
                        checked={Boolean(field.value)}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </div>

                <div className="mt-5 grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
                  <Input
                    label="Expiry (hours)"
                    type="number"
                    min={1}
                    max={720}
                    hint="An unused approved pass expires after this long."
                    className="tabular-nums"
                    error={errors.workflow?.expiryHours?.message}
                    {...register('workflow.expiryHours', { valueAsNumber: true })}
                  />
                  <Input
                    label="Reminder (minutes before)"
                    type="number"
                    min={5}
                    max={1440}
                    hint="How long before the expected return time the reminder fires."
                    className="tabular-nums"
                    error={errors.workflow?.reminderBeforeMinutes?.message}
                    {...register('workflow.reminderBeforeMinutes', { valueAsNumber: true })}
                  />
                </div>
              </Card>
            </>
          )}

          {/* ── Notifications ────────────────────────────────────────────── */}
          {tab === 'notifications' && (
            <Card>
              <CardHeader
                title="Notification channels"
                subtitle="Where the app is allowed to reach people. Turning a channel off silences it everywhere."
                icon={<Bell className="h-5 w-5" />}
              />
              <div className="space-y-1">
                {(
                  [
                    ['inApp', 'In-app', 'The notification bell inside the app.'],
                    ['email', 'Email', 'Approval requests, decisions and reminders by email.'],
                    ['push', 'Push', 'Browser push notifications.'],
                    ['sms', 'SMS', 'Text messages. Requires an SMS provider to be configured.'],
                    ['whatsapp', 'WhatsApp', 'Requires a WhatsApp Business provider to be configured.'],
                  ] as const
                ).map(([key, label, description]) => (
                  <Controller
                    key={key}
                    control={control}
                    name={`notifications.${key}`}
                    render={({ field }) => (
                      <Switch
                        label={label}
                        description={description}
                        disabled={readOnly}
                        checked={Boolean(field.value)}
                        onChange={field.onChange}
                      />
                    )}
                  />
                ))}
              </div>
            </Card>
          )}

          {/* ── Security ─────────────────────────────────────────────────── */}
          {tab === 'security' && (
            <Card>
              <CardHeader
                title="Gate security"
                subtitle="What the guard at the gate is required to capture."
                icon={<ShieldCheck className="h-5 w-5" />}
              />
              <div className="space-y-1">
                <Controller
                  control={control}
                  name="security.qrEnabled"
                  render={({ field }) => (
                    <Switch
                      label="QR codes"
                      description="Off: no QR is generated and the guard must find every pass by hand."
                      disabled={readOnly}
                      checked={Boolean(field.value)}
                      onChange={field.onChange}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="security.allowManualVerification"
                  render={({ field }) => (
                    <Switch
                      label="Allow manual verification"
                      description="Off: a pass can only be cleared by scanning its QR — a broken camera stops the gate."
                      disabled={readOnly}
                      checked={Boolean(field.value)}
                      onChange={field.onChange}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="security.requireExitPhoto"
                  render={({ field }) => (
                    <Switch
                      label="Photo required on exit"
                      description="On: the guard must capture a photo before marking someone out."
                      disabled={readOnly}
                      checked={Boolean(field.value)}
                      onChange={field.onChange}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="security.requireEntryPhoto"
                  render={({ field }) => (
                    <Switch
                      label="Photo required on return"
                      description="On: the guard must capture a photo before marking someone back in."
                      disabled={readOnly}
                      checked={Boolean(field.value)}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>
            </Card>
          )}

          {/* ── Branding ─────────────────────────────────────────────────── */}
          {tab === 'branding' && (
            <Card>
              <CardHeader
                title="Branding"
                subtitle="The accent colours and the theme new users start on."
                icon={<Palette className="h-5 w-5" />}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <span className="mb-1.5 block text-sm font-medium text-content">Primary colour</span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      aria-label="Primary colour"
                      disabled={readOnly}
                      containerClassName="w-14 shrink-0"
                      className="h-10 cursor-pointer p-1"
                      {...register('branding.primaryColor')}
                    />
                    <Input
                      aria-label="Primary colour hex"
                      className="font-mono"
                      error={errors.branding?.primaryColor?.message}
                      {...register('branding.primaryColor')}
                    />
                  </div>
                </div>

                <div>
                  <span className="mb-1.5 block text-sm font-medium text-content">Accent colour</span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      aria-label="Accent colour"
                      disabled={readOnly}
                      containerClassName="w-14 shrink-0"
                      className="h-10 cursor-pointer p-1"
                      {...register('branding.accentColor')}
                    />
                    <Input
                      aria-label="Accent colour hex"
                      className="font-mono"
                      error={errors.branding?.accentColor?.message}
                      {...register('branding.accentColor')}
                    />
                  </div>
                </div>

                <Select
                  label="Default theme"
                  hint="What a brand-new user sees before they pick their own."
                  options={[
                    { value: 'system', label: 'Match the device' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                  error={errors.branding?.defaultTheme?.message}
                  {...register('branding.defaultTheme')}
                />
              </div>
            </Card>
          )}
        </fieldset>

        {/* ── Sticky save bar ────────────────────────────────────────────── */}
        <AnimatePresence>
          {isDirty && !readOnly && (
            <motion.div
              initial={{ y: 90, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 90, opacity: 0 }}
              className="glass-strong fixed inset-x-4 bottom-4 z-40 flex flex-col gap-3 rounded-2xl px-4 py-3 shadow-glass-lg sm:left-auto sm:right-6 sm:w-auto sm:flex-row sm:items-center sm:gap-6"
            >
              <p className="text-sm font-medium text-content">You have unsaved changes.</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isSubmitting}
                  onClick={() =>
                    settingsQuery.data && reset(toFormValues(settingsQuery.data))
                  }
                >
                  Discard
                </Button>
                <Button
                  type="submit"
                  leftIcon={<Save className="h-4 w-4" />}
                  isLoading={isSubmitting || save.isPending}
                >
                  Save changes
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </div>
  );
};

export default SettingsPage;
