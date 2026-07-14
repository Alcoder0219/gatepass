import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Building2, Clock, MapPin, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';

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
import { unitApi, userApi } from '@/services/endpoints';
import { errorMessage, fieldErrors } from '@/services/api';
import { useDebounce } from '@/hooks/useDebounce';
import type { Unit } from '@/types';

const idOf = (value: { _id: string } | string | null | undefined): string =>
  !value ? '' : typeof value === 'string' ? value : value._id;

const labelOf = (value: { name: string } | string | null | undefined): string =>
  !value || typeof value === 'string' ? '—' : value.name;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const schema = z.object({
  code: z.string().trim().min(2, 'Code is required').max(20),
  name: z.string().trim().min(2, 'Name is required').max(120),
  address: z.string().trim().max(280),
  city: z.string().trim().max(80),
  state: z.string().trim().max(80),
  gateOpenTime: z.string().refine((value) => value === '' || TIME.test(value), 'Use HH:mm (24-hour)'),
  gateCloseTime: z.string().refine((value) => value === '' || TIME.test(value), 'Use HH:mm (24-hour)'),
  headOfUnit: z.string(),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  code: '',
  name: '',
  address: '',
  city: '',
  state: '',
  gateOpenTime: '',
  gateCloseTime: '',
  headOfUnit: '',
  isActive: true,
};

const Units = () => {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManage = can(PERMISSION.UNITS_MANAGE);

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('name');
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState<Unit | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Unit | null>(null);

  const debouncedSearch = useDebounce(search, 350);

  const listQuery = useQuery({
    queryKey: ['units', 'list', { page, sort, debouncedSearch }],
    queryFn: () => unitApi.list({ page, limit: 20, sort, search: debouncedSearch }),
  });

  const { data: people = [] } = useQuery({ queryKey: ['users', 'lookup'], queryFn: userApi.lookup });

  const headOptions = useMemo<SelectOption[]>(
    () => people.map((person) => ({ value: person._id, label: `${person.name} · ${person.employeeId}` })),
    [people]
  );

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!formOpen) return;
    reset(
      editing
        ? {
            code: editing.code,
            name: editing.name,
            address: editing.address ?? '',
            city: editing.city ?? '',
            state: editing.state ?? '',
            gateOpenTime: editing.gateOpenTime ?? '',
            gateCloseTime: editing.gateCloseTime ?? '',
            headOfUnit: idOf(editing.headOfUnit),
            isActive: editing.isActive,
          }
        : EMPTY
    );
  }, [formOpen, editing, reset]);

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: Partial<Unit> & { headOfUnit?: string | null } = {
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        address: values.address.trim(),
        city: values.city.trim(),
        state: values.state.trim(),
        // null clears the override and falls back to the global working hours.
        gateOpenTime: values.gateOpenTime || null,
        gateCloseTime: values.gateCloseTime || null,
        isActive: values.isActive,
      };
      payload.headOfUnit = values.headOfUnit ? values.headOfUnit : null;

      return editing ? unitApi.update(editing._id, payload) : unitApi.create(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Unit updated' : 'Unit created');
      setFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['units'] });
    },
    onError: (error: unknown) => {
      const fields = fieldErrors(error);
      (Object.keys(fields) as (keyof FormValues)[]).forEach((field) => {
        if (field in EMPTY) setError(field, { message: fields[field] });
      });
      toast.error(errorMessage(error, 'Could not save the unit'));
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => unitApi.remove(id),
    onSuccess: () => {
      toast.success('Unit deactivated');
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['units'] });
    },
    // 409 while active users still belong to the unit — the server's message
    // names the count, so it is surfaced verbatim.
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not delete the unit')),
  });

  const onSubmit = handleSubmit((values) => save.mutateAsync(values).catch(() => undefined));

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (unit: Unit) => {
    setEditing(unit);
    setFormOpen(true);
  };

  const rowActions = (unit: Unit): DropdownItem[] => [
    { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(unit) },
    {
      label: 'Delete',
      icon: <Trash2 className="h-4 w-4" />,
      danger: true,
      separated: true,
      onClick: () => setDeleteTarget(unit),
    },
  ];

  const actionCell = (unit: Unit) =>
    canManage ? (
      <div onClick={(event) => event.stopPropagation()}>
        <Dropdown
          trigger={
            <Button variant="ghost" size="icon" aria-label={`Actions for ${unit.name}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          }
          items={rowActions(unit)}
        />
      </div>
    ) : null;

  const gateHours = (unit: Unit) =>
    unit.gateOpenTime && unit.gateCloseTime
      ? `${unit.gateOpenTime} – ${unit.gateCloseTime}`
      : 'Global hours';

  const columns: Column<Unit>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      render: (row) => <span className="font-mono text-sm font-semibold text-content">{row.code}</span>,
    },
    {
      key: 'name',
      header: 'Unit',
      sortable: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-content">{row.name}</p>
          <p className="truncate text-xs text-content-muted">{row.address || '—'}</p>
        </div>
      ),
    },
    {
      key: 'city',
      header: 'Location',
      hideBelow: 'md',
      render: (row) => (
        <span className="text-sm text-content-muted">
          {[row.city, row.state].filter(Boolean).join(', ') || '—'}
        </span>
      ),
    },
    {
      key: 'gateOpenTime',
      header: 'Gate hours',
      hideBelow: 'lg',
      render: (row) => (
        <span
          className={
            row.gateOpenTime && row.gateCloseTime
              ? 'font-mono text-sm text-content'
              : 'text-sm text-content-subtle'
          }
        >
          {gateHours(row)}
        </span>
      ),
    },
    {
      key: 'headOfUnit',
      header: 'Head of unit',
      hideBelow: 'xl',
      render: (row) => <span className="text-sm text-content-muted">{labelOf(row.headOfUnit)}</span>,
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

  return (
    <div>
      <PageHeader
        title="Units"
        subtitle="Sites, plants and offices. Each unit can run its own gate hours."
        icon={<Building2 className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Administration' }, { label: 'Units' }]}
        actions={
          <Can do={PERMISSION.UNITS_MANAGE}>
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Add unit
            </Button>
          </Can>
        }
      />

      <Card padding="sm" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            placeholder="Search by name, code or city…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <Button
            variant="ghost"
            onClick={() => {
              setSearch('');
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
        emptyTitle="No units yet"
        emptyMessage="A unit is a physical site. Every department and user belongs to one."
        emptyAction={
          canManage ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Add unit
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

            <p className="mt-3 flex items-center gap-1.5 truncate text-xs text-content-muted">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {[row.city, row.state].filter(Boolean).join(', ') || 'No location set'}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Badge tone={row.isActive ? 'success' : 'neutral'} dot>
                {row.isActive ? 'Active' : 'Inactive'}
              </Badge>
              <span className="inline-flex items-center gap-1 text-xs text-content-subtle">
                <Clock className="h-3.5 w-3.5" />
                {gateHours(row)}
              </span>
            </div>
          </Card>
        )}
      />

      {/* ── Create / edit ────────────────────────────────────────────────── */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="lg"
        icon={<Building2 className="h-5 w-5" />}
        title={editing ? `Edit ${editing.name}` : 'Add unit'}
        description="Gate hours set here override the global working hours for this site."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void onSubmit()} isLoading={isSubmitting}>
              {editing ? 'Save changes' : 'Create unit'}
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
            label="Code"
            required
            placeholder="MNS"
            className="font-mono uppercase"
            error={errors.code?.message}
            {...register('code')}
          />
          <Input
            label="Name"
            required
            placeholder="Manesar Plant"
            error={errors.name?.message}
            {...register('name')}
          />

          <div className="sm:col-span-2">
            <Textarea
              label="Address"
              rows={2}
              maxLength={280}
              showCount
              placeholder="Plot 14, Sector 8, IMT Manesar"
              error={errors.address?.message}
              {...register('address')}
            />
          </div>

          <Input label="City" placeholder="Gurugram" error={errors.city?.message} {...register('city')} />
          <Input label="State" placeholder="Haryana" error={errors.state?.message} {...register('state')} />

          <Input
            label="Gate opens"
            type="time"
            hint="Leave blank to use the global working hours."
            error={errors.gateOpenTime?.message}
            {...register('gateOpenTime')}
          />
          <Input
            label="Gate closes"
            type="time"
            hint="Set both to override the global gate window for this unit only."
            error={errors.gateCloseTime?.message}
            {...register('gateCloseTime')}
          />

          <div className="sm:col-span-2">
            <Select
              label="Head of unit"
              placeholder="No head assigned"
              options={headOptions}
              hint="Optional. Sees every gate pass raised inside this unit."
              error={errors.headOfUnit?.message}
              {...register('headOfUnit')}
            />
          </div>

          <div className="sm:col-span-2">
            <Switch
              label="Active"
              description="Inactive units cannot be assigned to new users or departments."
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
        title="Delete this unit?"
        confirmLabel="Delete"
        icon={<Trash2 className="h-5 w-5" />}
        message={
          <>
            <p>
              <span className="font-semibold text-content">{deleteTarget?.name}</span> is deactivated
              rather than erased — gate passes and audit logs that reference it keep working.
            </p>
            <p className="mt-3">
              If active users still belong to this unit the server will refuse and tell you exactly how
              many need moving first.
            </p>
          </>
        }
      />
    </div>
  );
};

export default Units;
