import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, Search, Trash2, Wallet } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  Modal,
  Select,
  Switch,
  Textarea,
  ListSkeleton,
  Pagination,
  EmptyState,
  type SelectOption,
} from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { Can } from '@/permissions/Can';
import { PERMISSION } from '@/permissions/constants';
import { usePermissions } from '@/permissions/usePermissions';
import { leaveAllocationApi, leaveTypeApi } from '@/services/leave.endpoints';
import { departmentApi, unitApi, userApi } from '@/services/endpoints';
import { errorMessage } from '@/services/api';
import { useDebounce } from '@/hooks/useDebounce';
import type { AllocationRow, LeaveType } from '@/types/leave';

const ALL = 'ALL';

/* ─── New allocation form ─────────────────────────────────────────────────── */
const lineSchema = z.object({
  enabled: z.boolean(),
  leaveType: z.string(),
  opening: z.coerce.number().min(0).max(400),
  accrued: z.coerce.number().min(0).max(400),
  carriedForward: z.coerce.number().min(0).max(400),
});

const schema = z
  .object({
    leaveYear: z.string().regex(/^\d{4}-\d{4}$/, 'Pick a leave year'),
    employees: z.array(z.string()).min(1, 'Select at least one employee'),
    remarks: z.string().trim().max(250),
    overwrite: z.boolean(),
    lines: z.array(lineSchema),
  })
  .superRefine((data, ctx) => {
    const chosen = data.lines.filter((line) => line.enabled);
    if (!chosen.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lines'], message: 'Tick at least one leave type' });
    }
    chosen.forEach((line) => {
      const index = data.lines.indexOf(line);
      if (line.opening + line.accrued + line.carriedForward <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index, 'accrued'],
          message: 'Allocate at least half a day',
        });
      }
    });
  });

type FormValues = z.infer<typeof schema>;

/* ─── Page ────────────────────────────────────────────────────────────────── */
const LeaveAllocation = () => {
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const canDelete = can(PERMISSION.LEAVE_ALLOCATION_DELETE);

  /* Draft filters vs applied filters: nothing is fetched until "Show" is
   * pressed, which is what makes this a register rather than a live list. */
  const [draft, setDraft] = useState({ year: '', unit: ALL, department: ALL, employee: ALL, search: '' });
  const [applied, setApplied] = useState(draft);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  const debouncedSearch = useDebounce(applied.search, 350);

  const { data: yearData } = useQuery({
    queryKey: ['leave', 'allocations', 'years'],
    queryFn: leaveAllocationApi.years,
  });

  const { data: units = [] } = useQuery({ queryKey: ['units', 'lookup'], queryFn: unitApi.lookup });
  const { data: departments = [] } = useQuery({
    queryKey: ['departments', 'lookup', draft.unit],
    queryFn: () => departmentApi.lookup(draft.unit === ALL ? undefined : draft.unit),
  });
  const { data: people = [] } = useQuery({ queryKey: ['users', 'lookup'], queryFn: userApi.lookup });
  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['leave', 'types', 'lookup'],
    queryFn: leaveTypeApi.lookup,
  });

  /* Default the year picker to the current leave year once it is known. */
  useEffect(() => {
    if (!yearData?.current || draft.year) return;
    setDraft((prev) => ({ ...prev, year: yearData.current }));
    setApplied((prev) => ({ ...prev, year: yearData.current }));
  }, [yearData, draft.year]);

  const listQuery = useQuery({
    queryKey: ['leave', 'allocations', { ...applied, search: debouncedSearch, page }],
    queryFn: () =>
      leaveAllocationApi.list({
        page,
        limit: 10,
        year: applied.year,
        unit: applied.unit === ALL ? undefined : applied.unit,
        department: applied.department === ALL ? undefined : applied.department,
        employee: applied.employee === ALL ? undefined : applied.employee,
        search: debouncedSearch,
      }),
    enabled: Boolean(applied.year),
  });

  /* Only PAID types can be allocated — unpaid leave has no entitlement. */
  const allocatable = useMemo(
    () => leaveTypes.filter((type: LeaveType) => type.type === 'PAID'),
    [leaveTypes]
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { leaveYear: '', employees: [], remarks: '', overwrite: false, lines: [] },
  });

  useEffect(() => {
    if (!formOpen) return;
    reset({
      leaveYear: applied.year || yearData?.current || '',
      employees: [],
      remarks: '',
      overwrite: false,
      lines: allocatable.map((type: LeaveType) => ({
        enabled: false,
        leaveType: type._id,
        opening: 0,
        accrued: type.annualQuota,
        carriedForward: 0,
      })),
    });
  }, [formOpen, allocatable, applied.year, yearData, reset]);

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      leaveAllocationApi.create({
        leaveYear: values.leaveYear,
        employees: values.employees,
        remarks: values.remarks,
        overwrite: values.overwrite,
        allocations: values.lines
          .filter((line) => line.enabled)
          .map((line) => ({
            leaveType: line.leaveType,
            opening: line.opening,
            accrued: line.accrued,
            carriedForward: line.carriedForward,
            adjusted: 0,
          })),
      }),
    onSuccess: (summary) => {
      toast.success(
        `Allocated ${summary.leaveTypes} leave type(s) to ${summary.employees} employee(s) — ${summary.created} created, ${summary.updated} revised`
      );
      setFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not allocate leave')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => leaveAllocationApi.remove(id),
    onSuccess: () => {
      toast.success('Allocation removed');
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['leave'] });
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not remove the allocation')),
  });

  const onSubmit = handleSubmit((values) => save.mutateAsync(values).catch(() => undefined));

  const show = () => {
    setApplied(draft);
    setPage(1);
  };

  const clear = () => {
    const next = { year: yearData?.current ?? '', unit: ALL, department: ALL, employee: ALL, search: '' };
    setDraft(next);
    setApplied(next);
    setPage(1);
  };

  const opt = (rows: { _id: string; name: string; code?: string }[], allLabel: string): SelectOption[] => [
    { value: ALL, label: allLabel },
    ...rows.map((row) => ({ value: row._id, label: row.code ? `${row.name} (${row.code})` : row.name })),
  ];

  const yearOptions: SelectOption[] = (yearData?.years ?? []).map((year) => ({ value: year, label: year }));

  const lines = watch('lines');
  const selectedEmployees = watch('employees');

  const rows = listQuery.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Leave Allocation"
        subtitle="Grant leave balances to employees for a leave year."
        icon={<Wallet className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Leave Management' }, { label: 'Leave Allocation' }]}
        actions={
          <Can do={PERMISSION.LEAVE_ALLOCATION_CREATE}>
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>
              New allocation
            </Button>
          </Can>
        }
      />

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <Card padding="sm" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Select
            label="Year"
            options={yearOptions}
            value={draft.year}
            onChange={(event) => setDraft({ ...draft, year: event.target.value })}
          />
          <Select
            label="Company"
            options={opt(units, 'All companies')}
            value={draft.unit}
            onChange={(event) => setDraft({ ...draft, unit: event.target.value, department: ALL })}
          />
          <Select
            label="Department"
            options={opt(departments, 'All departments')}
            value={draft.department}
            onChange={(event) => setDraft({ ...draft, department: event.target.value })}
          />
          <Select
            label="Employee"
            options={opt(
              people.map((p) => ({ _id: p._id, name: p.name, code: p.employeeId })),
              'All employees'
            )}
            value={draft.employee}
            onChange={(event) => setDraft({ ...draft, employee: event.target.value })}
          />
          <Input
            label="Search"
            placeholder="Name, code or email…"
            leftIcon={<Search className="h-4 w-4" />}
            value={draft.search}
            onChange={(event) => setDraft({ ...draft, search: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') show();
            }}
          />
          <div className="flex items-end gap-2">
            <Button className="flex-1" onClick={show}>
              Show
            </Button>
            <Button variant="ghost" onClick={clear}>
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Register ──────────────────────────────────────────────────────── */}
      {listQuery.isPending ? (
        <ListSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-7 w-7" />}
          title="No employees match those filters"
          message="Adjust the year, company, department or search and press Show again."
        />
      ) : (
        <div className="space-y-4">
          {rows.map((row: AllocationRow) => (
            <Card key={row.employee._id} padding="sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 lg:w-64 lg:shrink-0">
                  <p className="truncate text-sm font-semibold text-content">{row.employee.name}</p>
                  <p className="truncate font-mono text-xs text-content-muted">{row.employee.employeeId}</p>
                  <p className="mt-1 truncate text-xs text-content-subtle">
                    {[row.department?.name, row.unit?.name].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>

                {row.allocations.length === 0 ? (
                  <p className="flex-1 text-sm text-content-subtle">
                    No leave allocated for {row.leaveYear}.
                  </p>
                ) : (
                  <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {row.allocations.map((line) => (
                      <div
                        key={line._id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-content/5 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: line.leaveType.color }}
                            aria-hidden
                          />
                          <span className="truncate text-xs font-semibold text-content">
                            {line.leaveType.code}
                          </span>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-xs tabular-nums text-content-muted">
                            <span className="font-bold text-content">{line.available}</span>
                            {' / '}
                            {line.entitled}
                          </span>
                          {canDelete && line.used === 0 && line.pending === 0 && (
                            <button
                              type="button"
                              aria-label={`Remove ${line.leaveType.code} allocation for ${row.employee.name}`}
                              onClick={() =>
                                setDeleteTarget({
                                  id: line._id,
                                  label: `${line.leaveType.name} · ${row.employee.name}`,
                                })
                              }
                              className="text-content-subtle transition-colors hover:text-danger-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex shrink-0 items-center gap-2 lg:flex-col lg:items-end">
                  <Badge tone="brand">{row.totals.entitled} allocated</Badge>
                  <Badge tone={row.totals.available > 0 ? 'success' : 'neutral'}>
                    {row.totals.available} available
                  </Badge>
                </div>
              </div>
            </Card>
          ))}

          {listQuery.data?.meta && (
            <Pagination meta={listQuery.data.meta} onPageChange={setPage} />
          )}
        </div>
      )}

      {/* ── New allocation ────────────────────────────────────────────────── */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="xl"
        icon={<Wallet className="h-5 w-5" />}
        title="New allocation"
        description="Allocate several leave types to one or many employees in a single step."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void onSubmit()} isLoading={isSubmitting}>
              Allocate
            </Button>
          </>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
          className="space-y-5"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Select
              label="Leave year"
              required
              options={yearOptions}
              error={errors.leaveYear?.message}
              {...register('leaveYear')}
            />
            <Input
              label="Employees selected"
              readOnly
              value={`${selectedEmployees.length} selected`}
              hint="Pick them from the list below."
            />
          </div>

          {/* Employee picker */}
          <div>
            <p className="mb-2 text-sm font-medium text-content">Employees</p>
            <div className="max-h-48 overflow-y-auto rounded-2xl border border-line p-2">
              {people.map((person) => {
                const checked = selectedEmployees.includes(person._id);
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
                            ? selectedEmployees.filter((id) => id !== person._id)
                            : [...selectedEmployees, person._id],
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
          </div>

          {/* Multiple leave types */}
          <div>
            <p className="mb-2 text-sm font-medium text-content">Leave types</p>
            <div className="space-y-2">
              {lines.map((line, index) => {
                const type = allocatable.find((t: LeaveType) => t._id === line.leaveType);
                if (!type) return null;
                return (
                  <div
                    key={line.leaveType}
                    className="grid items-end gap-3 rounded-2xl bg-content/5 p-3 sm:grid-cols-[auto_minmax(0,1fr)_5.5rem_5.5rem_5.5rem]"
                  >
                    <input
                      type="checkbox"
                      aria-label={`Allocate ${type.name}`}
                      checked={line.enabled}
                      onChange={(event) =>
                        setValue(`lines.${index}.enabled`, event.target.checked, { shouldValidate: true })
                      }
                      className="h-4 w-4 self-center rounded border-line accent-brand-500"
                    />

                    <div className="min-w-0 self-center">
                      <p className="truncate text-sm font-semibold text-content">{type.name}</p>
                      <p className="truncate font-mono text-xs text-content-muted">{type.code}</p>
                    </div>

                    <Input
                      label="Opening"
                      type="number"
                      step="0.5"
                      min={0}
                      disabled={!line.enabled}
                      {...register(`lines.${index}.opening`)}
                    />
                    <Input
                      label="Accrued"
                      type="number"
                      step="0.5"
                      min={0}
                      disabled={!line.enabled}
                      error={errors.lines?.[index]?.accrued?.message}
                      {...register(`lines.${index}.accrued`)}
                    />
                    <Input
                      label="Carried fwd"
                      type="number"
                      step="0.5"
                      min={0}
                      disabled={!line.enabled}
                      {...register(`lines.${index}.carriedForward`)}
                    />
                  </div>
                );
              })}
            </div>
            {errors.lines?.message && (
              <p className="mt-1.5 text-xs text-danger-500">{errors.lines.message}</p>
            )}
          </div>

          <Textarea
            label="Remarks"
            rows={2}
            maxLength={250}
            showCount
            placeholder="Annual allocation for the new leave year"
            {...register('remarks')}
          />

          <Switch
            label="Overwrite existing"
            description="Revise allocations that already exist for this year instead of refusing them."
            checked={watch('overwrite')}
            onChange={(checked) => setValue('overwrite', checked, { shouldDirty: true })}
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) remove.mutate(deleteTarget.id);
        }}
        isLoading={remove.isPending}
        title="Remove this allocation?"
        confirmLabel="Remove"
        icon={<Trash2 className="h-5 w-5" />}
        message={
          <>
            <p>
              <span className="font-semibold text-content">{deleteTarget?.label}</span> will lose its
              allocated balance for this leave year.
            </p>
            <p className="mt-3">
              Allocations that have already been drawn against cannot be removed — revise the days
              instead.
            </p>
          </>
        }
      />
    </div>
  );
};

export default LeaveAllocation;
