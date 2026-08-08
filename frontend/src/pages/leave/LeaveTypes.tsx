import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { CalendarOff, MoreHorizontal, Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Dropdown,
  Input,
  Modal,
  Select,
  Switch,
  Textarea,
  type Column,
  type DropdownItem,
  type SelectOption,
} from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { Can } from '@/permissions/Can';
import { PERMISSION } from '@/permissions/constants';
import { usePermissions } from '@/permissions/usePermissions';
import { leaveTypeApi } from '@/services/leave.endpoints';
import { errorMessage, fieldErrors } from '@/services/api';
import { useDebounce } from '@/hooks/useDebounce';
import {
  LEAVE_CATEGORY_OPTIONS,
  LEAVE_NATURE_OPTIONS,
  type LeaveType,
  type LeaveTypePayload,
} from '@/types/leave';

/* ─── Validation ──────────────────────────────────────────────────────────────
 * Mirrors `leaveType.validator.js`. The server stays the enforcement point;
 * this copy exists so the form can fail fast without a round trip.
 * ────────────────────────────────────────────────────────────────────────────*/
const schema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, 'Leave code must be at least 2 characters')
      .max(10, 'Leave code cannot exceed 10 characters')
      .regex(/^[A-Za-z0-9_]+$/, 'Only letters, numbers and underscores'),
    name: z
      .string()
      .trim()
      .min(2, 'Leave name must be at least 2 characters')
      .max(60, 'Leave name cannot exceed 60 characters'),
    type: z.enum(['PAID', 'UNPAID']),
    category: z.enum(['REGULAR', 'SPECIAL', 'STATUTORY', 'OTHER']),
    includeWeeklyOff: z.boolean(),
    includeHolidays: z.boolean(),
    description: z.string().trim().max(250),
    annualQuota: z.coerce.number().min(0, 'Cannot be negative').max(400, 'That is more than a year'),
    allowHalfDay: z.boolean(),
    requiresAttachmentAfterDays: z.coerce.number().int().min(0).max(60),
    isActive: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'PAID' && data.annualQuota <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['annualQuota'],
        message: 'A paid leave type must grant at least 0.5 days a year',
      });
    }
  });

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  code: '',
  name: '',
  type: 'PAID',
  category: 'REGULAR',
  includeWeeklyOff: false,
  includeHolidays: false,
  description: '',
  annualQuota: 12,
  allowHalfDay: true,
  requiresAttachmentAfterDays: 0,
  isActive: true,
};

const NATURE_TONE = { PAID: 'success', UNPAID: 'neutral' } as const;
const CATEGORY_TONE = {
  REGULAR: 'brand',
  SPECIAL: 'accent',
  STATUTORY: 'info',
  OTHER: 'neutral',
} as const;

const labelFor = (options: { value: string; label: string }[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

const LeaveTypes = () => {
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const canCreate = can(PERMISSION.LEAVE_TYPE_CREATE);
  const canUpdate = can(PERMISSION.LEAVE_TYPE_UPDATE);
  const canDelete = can(PERMISSION.LEAVE_TYPE_DELETE);

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('code');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('ALL');
  const [category, setCategory] = useState('ALL');

  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LeaveType | null>(null);

  const debouncedSearch = useDebounce(search, 350);

  const listQuery = useQuery({
    queryKey: ['leave', 'types', { page, sort, debouncedSearch, type, category }],
    queryFn: () =>
      leaveTypeApi.list({
        page,
        limit: 20,
        sort,
        search: debouncedSearch,
        type: type as 'ALL',
        category: category as 'ALL',
      }),
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  const watchedType = watch('type');

  useEffect(() => {
    if (!formOpen) return;
    reset(
      editing
        ? {
            code: editing.code,
            name: editing.name,
            type: editing.type,
            category: editing.category,
            includeWeeklyOff: editing.includeWeeklyOff,
            includeHolidays: editing.includeHolidays,
            description: editing.description ?? '',
            annualQuota: editing.annualQuota,
            allowHalfDay: editing.allowHalfDay,
            requiresAttachmentAfterDays: editing.requiresAttachmentAfterDays,
            isActive: editing.isActive,
          }
        : EMPTY
    );
  }, [formOpen, editing, reset]);

  /* An unpaid type has no entitlement to draw down — mirror the server rule so
   * the field cannot sit there holding a stale number. */
  useEffect(() => {
    if (watchedType === 'UNPAID') setValue('annualQuota', 0, { shouldValidate: true });
  }, [watchedType, setValue]);

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: LeaveTypePayload = {
        ...values,
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        description: values.description.trim(),
      };
      return editing ? leaveTypeApi.update(editing._id, payload) : leaveTypeApi.create(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Leave type updated' : 'Leave type created');
      setFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
    },
    onError: (error: unknown) => {
      const fields = fieldErrors(error);
      (Object.keys(fields) as (keyof FormValues)[]).forEach((field) => {
        if (field in EMPTY) setError(field, { message: fields[field] });
      });
      toast.error(errorMessage(error, 'Could not save the leave type'));
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => leaveTypeApi.remove(id),
    onSuccess: (result) => {
      toast.success(
        result?.deactivated
          ? 'In use, so the leave type was deactivated instead of deleted'
          : 'Leave type deleted'
      );
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not delete the leave type')),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      leaveTypeApi.setStatus(id, isActive),
    onSuccess: (row) => {
      toast.success(`${row.name} ${row.isActive ? 'activated' : 'deactivated'}`);
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not change the status')),
  });

  const onSubmit = handleSubmit((values) => save.mutateAsync(values).catch(() => undefined));

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (row: LeaveType) => {
    setEditing(row);
    setFormOpen(true);
  };

  const rowActions = (row: LeaveType): DropdownItem[] => {
    const items: DropdownItem[] = [];
    if (canUpdate) {
      items.push({ label: 'Edit', icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(row) });
      items.push({
        label: row.isActive ? 'Deactivate' : 'Activate',
        icon: <CalendarOff className="h-4 w-4" />,
        onClick: () => toggle.mutate({ id: row._id, isActive: !row.isActive }),
      });
    }
    if (canDelete) {
      items.push({
        label: 'Delete',
        icon: <Trash2 className="h-4 w-4" />,
        danger: true,
        separated: true,
        onClick: () => setDeleteTarget(row),
      });
    }
    return items;
  };

  const actionCell = (row: LeaveType) => {
    const items = rowActions(row);
    if (!items.length) return null;
    return (
      <div onClick={(event) => event.stopPropagation()}>
        <Dropdown
          trigger={
            <Button variant="ghost" size="icon" aria-label={`Actions for ${row.name}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          }
          items={items}
        />
      </div>
    );
  };

  const columns: Column<LeaveType>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      render: (row) => (
        <span className="inline-flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: row.color }}
            aria-hidden
          />
          <span className="font-mono text-sm font-semibold text-content">{row.code}</span>
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Leave name',
      sortable: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-content">{row.name}</p>
          <p className="truncate text-xs text-content-muted">{row.description || '—'}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Leave type',
      sortable: true,
      render: (row) => (
        <Badge tone={NATURE_TONE[row.type]}>{labelFor(LEAVE_NATURE_OPTIONS, row.type)}</Badge>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      hideBelow: 'md',
      render: (row) => (
        <Badge tone={CATEGORY_TONE[row.category]}>
          {labelFor(LEAVE_CATEGORY_OPTIONS, row.category)}
        </Badge>
      ),
    },
    {
      key: 'annualQuota',
      header: 'Quota / year',
      sortable: true,
      hideBelow: 'lg',
      render: (row) => (
        <span className="text-sm tabular-nums text-content">
          {row.type === 'UNPAID' ? <span className="text-content-subtle">Unlimited</span> : `${row.annualQuota} days`}
        </span>
      ),
    },
    {
      key: 'includeWeeklyOff',
      header: 'Counts',
      hideBelow: 'xl',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={row.includeWeeklyOff ? 'warning' : 'neutral'}>
            {row.includeWeeklyOff ? 'Weekly off' : 'Skips weekly off'}
          </Badge>
          <Badge tone={row.includeHolidays ? 'warning' : 'neutral'}>
            {row.includeHolidays ? 'Holidays' : 'Skips holidays'}
          </Badge>
        </div>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (row) => (
        <Badge tone={row.isActive ? 'success' : 'neutral'} dot>
          {row.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    { key: 'actions', header: '', headerClassName: 'w-12', render: actionCell },
  ];

  const filterOptions = (
    options: { value: string; label: string }[],
    allLabel: string
  ): SelectOption[] => [{ value: 'ALL', label: allLabel }, ...options];

  return (
    <div>
      <PageHeader
        title="Leave Types"
        subtitle="The catalogue of leave an employee may apply for."
        icon={<Tags className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Leave Management' }, { label: 'Leave Types' }]}
        actions={
          <Can do={PERMISSION.LEAVE_TYPE_CREATE}>
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Add leave type
            </Button>
          </Can>
        }
      />

      <Card padding="sm" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]">
          <Input
            placeholder="Search by code, name or description…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <Select
            options={filterOptions(LEAVE_NATURE_OPTIONS, 'All types')}
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
          />
          <Select
            options={filterOptions(LEAVE_CATEGORY_OPTIONS, 'All categories')}
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
          />
          <Button
            variant="ghost"
            onClick={() => {
              setSearch('');
              setType('ALL');
              setCategory('ALL');
              setPage(1);
            }}
          >
            Clear
          </Button>
        </div>
      </Card>

      <DataTable
        data={listQuery.data?.items ?? []}
        columns={columns}
        isLoading={listQuery.isPending}
        rowKey={(row) => row._id}
        meta={listQuery.data?.meta}
        onPageChange={setPage}
        sort={sort}
        onSortChange={setSort}
        emptyTitle="No leave types yet"
        emptyMessage="A leave type defines what an employee can apply for and how it is counted."
        emptyAction={
          canCreate ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Add leave type
            </Button>
          ) : undefined
        }
        mobileCard={(row) => (
          <Card padding="sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-content">{row.name}</p>
                <p className="truncate font-mono text-xs text-content-muted">{row.code}</p>
              </div>
              {actionCell(row)}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Badge tone={NATURE_TONE[row.type]}>{labelFor(LEAVE_NATURE_OPTIONS, row.type)}</Badge>
              <Badge tone={CATEGORY_TONE[row.category]}>
                {labelFor(LEAVE_CATEGORY_OPTIONS, row.category)}
              </Badge>
              <Badge tone={row.isActive ? 'success' : 'neutral'} dot>
                {row.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </Card>
        )}
      />

      {/* ── Create / edit ────────────────────────────────────────────────── */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="lg"
        icon={<Tags className="h-5 w-5" />}
        title={editing ? `Edit ${editing.name}` : 'Add leave type'}
        description="Weekly off and holiday settings decide whether non-working days inside a leave range are charged to the employee."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void onSubmit()} isLoading={isSubmitting}>
              {editing ? 'Save changes' : 'Create leave type'}
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
            label="Leave code"
            required
            placeholder="CL"
            className="font-mono uppercase"
            hint={editing ? 'Locked once requests reference this type.' : 'Short, unique, e.g. CL or SL.'}
            error={errors.code?.message}
            {...register('code')}
          />
          <Input
            label="Leave name"
            required
            placeholder="Casual Leave"
            error={errors.name?.message}
            {...register('name')}
          />

          <Select
            label="Leave type"
            required
            options={LEAVE_NATURE_OPTIONS}
            error={errors.type?.message}
            {...register('type')}
          />
          <Select
            label="Leave category"
            required
            options={LEAVE_CATEGORY_OPTIONS}
            error={errors.category?.message}
            {...register('category')}
          />

          <Input
            label="Annual quota (days)"
            type="number"
            step="0.5"
            min={0}
            disabled={watchedType === 'UNPAID'}
            hint={
              watchedType === 'UNPAID'
                ? 'Unpaid leave has no entitlement to draw down.'
                : 'Days granted per leave year.'
            }
            error={errors.annualQuota?.message}
            {...register('annualQuota')}
          />
          <Input
            label="Attachment required after (days)"
            type="number"
            min={0}
            hint="0 = never required."
            error={errors.requiresAttachmentAfterDays?.message}
            {...register('requiresAttachmentAfterDays')}
          />

          <div className="sm:col-span-2">
            <Textarea
              label="Description"
              rows={2}
              maxLength={250}
              showCount
              placeholder="Short personal absences"
              error={errors.description?.message}
              {...register('description')}
            />
          </div>

          <div className="sm:col-span-2 grid gap-4 rounded-2xl bg-content/5 p-4">
            <Switch
              label="Weekly off include"
              description="Count weekly offs that fall inside the leave range as leave days."
              checked={watch('includeWeeklyOff')}
              onChange={(checked) => setValue('includeWeeklyOff', checked, { shouldDirty: true })}
            />
            <Switch
              label="Holiday off include"
              description="Count public holidays that fall inside the leave range as leave days."
              checked={watch('includeHolidays')}
              onChange={(checked) => setValue('includeHolidays', checked, { shouldDirty: true })}
            />
            <Switch
              label="Allow half day"
              description="Employees may apply for a first- or second-half day."
              checked={watch('allowHalfDay')}
              onChange={(checked) => setValue('allowHalfDay', checked, { shouldDirty: true })}
            />
            <Switch
              label="Active"
              description="Inactive types cannot be chosen on a new leave application."
              checked={watch('isActive')}
              onChange={(checked) => setValue('isActive', checked, { shouldDirty: true })}
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
        title="Delete this leave type?"
        confirmLabel="Delete"
        icon={<Trash2 className="h-5 w-5" />}
        message={
          <>
            <p>
              <span className="font-semibold text-content">{deleteTarget?.name}</span> will be removed
              from the catalogue.
            </p>
            <p className="mt-3">
              If any leave request or balance still references it, the server deactivates it instead of
              erasing it — so no historic record is ever orphaned.
            </p>
          </>
        }
      />
    </div>
  );
};

export default LeaveTypes;
