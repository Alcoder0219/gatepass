import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Briefcase, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';

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
import { departmentApi, unitApi, userApi } from '@/services/endpoints';
import { errorMessage, fieldErrors } from '@/services/api';
import { useDebounce } from '@/hooks/useDebounce';
import type { Department } from '@/types';

const idOf = (value: { _id: string } | string | null | undefined): string =>
  !value ? '' : typeof value === 'string' ? value : value._id;

const labelOf = (value: { name: string } | string | null | undefined): string =>
  !value || typeof value === 'string' ? '—' : value.name;

const schema = z.object({
  code: z.string().trim().min(2, 'Code is required').max(20),
  name: z.string().trim().min(2, 'Name is required').max(120),
  unit: z.string().min(1, 'Pick the unit this department belongs to'),
  hod: z.string(),
  description: z.string().trim().max(280),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = { code: '', name: '', unit: '', hod: '', description: '', isActive: true };

const Departments = () => {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManage = can(PERMISSION.DEPARTMENTS_MANAGE);

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('name');
  const [search, setSearch] = useState('');
  const [unitFilter, setUnitFilter] = useState('');

  const [editing, setEditing] = useState<Department | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);

  const debouncedSearch = useDebounce(search, 350);

  const listQuery = useQuery({
    queryKey: ['departments', 'list', { page, sort, debouncedSearch, unitFilter }],
    queryFn: () =>
      departmentApi.list({ page, limit: 20, sort, search: debouncedSearch, unit: unitFilter }),
  });

  const { data: units = [] } = useQuery({ queryKey: ['units', 'lookup'], queryFn: unitApi.lookup });
  const { data: people = [] } = useQuery({ queryKey: ['users', 'lookup'], queryFn: userApi.lookup });

  const unitOptions = useMemo<SelectOption[]>(
    () => units.map((unit) => ({ value: unit._id, label: `${unit.name} (${unit.code})` })),
    [units]
  );
  const hodOptions = useMemo<SelectOption[]>(
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
            unit: idOf(editing.unit),
            hod: idOf(editing.hod),
            description: editing.description ?? '',
            isActive: editing.isActive,
          }
        : EMPTY
    );
  }, [formOpen, editing, reset]);

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: Partial<Department> & { hod?: string | null } = {
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        unit: values.unit,
        description: values.description.trim(),
        isActive: values.isActive,
      };
      // An empty string is not a valid ObjectId — send null to clear the HOD.
      payload.hod = values.hod ? values.hod : null;

      return editing ? departmentApi.update(editing._id, payload) : departmentApi.create(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Department updated' : 'Department created');
      setFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (error: unknown) => {
      const fields = fieldErrors(error);
      (Object.keys(fields) as (keyof FormValues)[]).forEach((field) => {
        if (field in EMPTY) setError(field, { message: fields[field] });
      });
      toast.error(errorMessage(error, 'Could not save the department'));
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => departmentApi.remove(id),
    onSuccess: () => {
      toast.success('Department deactivated');
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    // The server refuses (409) while active users still belong to it — its
    // message carries the exact count, so it is shown verbatim.
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not delete the department')),
  });

  const onSubmit = handleSubmit((values) => save.mutateAsync(values).catch(() => undefined));

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (department: Department) => {
    setEditing(department);
    setFormOpen(true);
  };

  const rowActions = (department: Department): DropdownItem[] => [
    { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(department) },
    {
      label: 'Delete',
      icon: <Trash2 className="h-4 w-4" />,
      danger: true,
      separated: true,
      onClick: () => setDeleteTarget(department),
    },
  ];

  const actionCell = (department: Department) =>
    canManage ? (
      <div onClick={(event) => event.stopPropagation()}>
        <Dropdown
          trigger={
            <Button variant="ghost" size="icon" aria-label={`Actions for ${department.name}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          }
          items={rowActions(department)}
        />
      </div>
    ) : null;

  const columns: Column<Department>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-sm font-semibold text-content">{row.code}</span>
      ),
    },
    {
      key: 'name',
      header: 'Department',
      sortable: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-content">{row.name}</p>
          <p className="truncate text-xs text-content-muted">{row.description || '—'}</p>
        </div>
      ),
    },
    {
      key: 'unit',
      header: 'Unit',
      hideBelow: 'md',
      render: (row) => <span className="text-sm text-content-muted">{labelOf(row.unit)}</span>,
    },
    {
      key: 'hod',
      header: 'Head of department',
      hideBelow: 'lg',
      render: (row) => <span className="text-sm text-content-muted">{labelOf(row.hod)}</span>,
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
        title="Departments"
        subtitle="The org units a gate pass is raised from — each one lives inside a unit."
        icon={<Briefcase className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Administration' }, { label: 'Departments' }]}
        actions={
          <Can do={PERMISSION.DEPARTMENTS_MANAGE}>
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Add department
            </Button>
          </Can>
        }
      />

      <Card padding="sm" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto]">
          <Input
            placeholder="Search by name or code…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <Select
            placeholder="All units"
            options={unitOptions}
            value={unitFilter}
            onChange={(event) => {
              setUnitFilter(event.target.value);
              setPage(1);
            }}
          />
          <Button
            variant="ghost"
            onClick={() => {
              setSearch('');
              setUnitFilter('');
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
        emptyTitle="No departments yet"
        emptyMessage="Departments group the people who raise gate passes. Create the first one."
        emptyAction={
          canManage ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Add department
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
              <Badge tone={row.isActive ? 'success' : 'neutral'} dot>
                {row.isActive ? 'Active' : 'Inactive'}
              </Badge>
              <span className="truncate text-xs text-content-subtle">
                {labelOf(row.unit)} · HOD {labelOf(row.hod)}
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
        icon={<Briefcase className="h-5 w-5" />}
        title={editing ? `Edit ${editing.name}` : 'Add department'}
        description="A department always belongs to exactly one unit."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void onSubmit()} isLoading={isSubmitting}>
              {editing ? 'Save changes' : 'Create department'}
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
            placeholder="ENG"
            className="font-mono uppercase"
            error={errors.code?.message}
            {...register('code')}
          />
          <Input
            label="Name"
            required
            placeholder="Engineering"
            error={errors.name?.message}
            {...register('name')}
          />

          <Select
            label="Unit"
            required
            placeholder="Select a unit"
            options={unitOptions}
            error={errors.unit?.message}
            {...register('unit')}
          />
          <Select
            label="Head of department"
            placeholder="No HOD"
            options={hodOptions}
            hint="Optional. The HOD sees their whole department’s gate passes."
            error={errors.hod?.message}
            {...register('hod')}
          />

          <div className="sm:col-span-2">
            <Textarea
              label="Description"
              rows={2}
              maxLength={280}
              showCount
              placeholder="What does this department do?"
              error={errors.description?.message}
              {...register('description')}
            />
          </div>

          <div className="sm:col-span-2">
            <Switch
              label="Active"
              description="Inactive departments cannot be assigned to new users."
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
        title="Delete this department?"
        confirmLabel="Delete"
        icon={<Trash2 className="h-5 w-5" />}
        message={
          <>
            <p>
              <span className="font-semibold text-content">{deleteTarget?.name}</span> is deactivated
              rather than erased — every gate pass and audit entry that references it keeps working.
            </p>
            <p className="mt-3">
              If people still belong to this department the server will refuse and tell you how many
              need moving first.
            </p>
          </>
        }
      />
    </div>
  );
};

export default Departments;
