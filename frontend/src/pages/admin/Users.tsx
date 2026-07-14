import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users as UsersIcon,
  UserX,
} from 'lucide-react';

import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Dropdown,
  FileUpload,
  Input,
  Modal,
  Select,
  StatCard,
  type Column,
  type DropdownItem,
  type SelectOption,
} from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { Can } from '@/permissions/Can';
import { PERMISSION } from '@/permissions/constants';
import { usePermissions } from '@/permissions/usePermissions';
import { departmentApi, roleApi, unitApi, userApi } from '@/services/endpoints';
import { errorMessage, fieldErrors } from '@/services/api';
import { useDebounce } from '@/hooks/useDebounce';
import { staggerContainer, staggerItem } from '@/animations/variants';
import type { User, UserStatus } from '@/types';

/* ─── Small helpers shared by the directory and the form ─────────────────── */

/** Populated-or-id fields arrive either way depending on the endpoint. */
const idOf = (value: { _id: string } | string | null | undefined): string =>
  !value ? '' : typeof value === 'string' ? value : value._id;

const labelOf = (value: { name: string } | string | null | undefined): string =>
  !value || typeof value === 'string' ? '—' : value.name;

const STATUS_OPTIONS: SelectOption[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

const STATUS_TONE: Record<UserStatus, 'success' | 'neutral' | 'danger'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  SUSPENDED: 'danger',
};

/**
 * A role's colour is data (a hex stored on the Role document), not a design
 * token — so it is the one place an inline style is legitimate. The geometry
 * still matches the Badge component exactly.
 */
export const RoleBadge = ({
  role,
  className,
}: {
  role: { name: string; color?: string } | null | undefined;
  className?: string;
}) => {
  if (!role) return <span className="text-sm text-content-subtle">—</span>;
  const colour = role.color || '#6366f1';

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${className ?? ''}`}
      style={{
        color: colour,
        backgroundColor: `${colour}24`,
        boxShadow: `inset 0 0 0 1px ${colour}59`,
      }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {role.name}
    </span>
  );
};

/* ─── User form ───────────────────────────────────────────────────────────── */

const userSchema = z.object({
  employeeId: z.string().trim().min(2, 'Employee ID is required').max(40),
  name: z.string().trim().min(2, 'Name is required').max(120),
  email: z.string().trim().min(1, 'Email is required').email('A valid email address is required'),
  phone: z
    .string()
    .trim()
    .regex(/^$|^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number'),
  unit: z.string().min(1, 'Unit is required'),
  department: z.string().min(1, 'Department is required'),
  designation: z.string().trim().max(120),
  role: z.string().min(1, 'Role is required'),
  reportingManager: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  password: z
    .string()
    .refine((value) => value === '' || value.length >= 8, 'Password must be at least 8 characters'),
});

export type UserFormValues = z.infer<typeof userSchema>;

const EMPTY_USER: UserFormValues = {
  employeeId: '',
  name: '',
  email: '',
  phone: '',
  unit: '',
  department: '',
  designation: '',
  role: '',
  reportingManager: '',
  status: 'ACTIVE',
  password: '',
};

const toFormValues = (user: User): UserFormValues => ({
  employeeId: user.employeeId ?? '',
  name: user.name ?? '',
  email: user.email ?? '',
  phone: user.phone ?? '',
  unit: idOf(user.unit),
  department: idOf(user.department),
  designation: user.designation ?? '',
  role: idOf(user.role),
  reportingManager: idOf(user.reportingManager),
  status: user.status,
  password: '',
});

/**
 * The endpoint is multipart (the avatar rides along with the fields), so the
 * payload is a FormData. Empty optional fields are omitted rather than sent
 * blank — the API validates them as ObjectIds and an empty string would fail.
 */
const buildUserFormData = (values: UserFormValues, image: File | null, isEdit: boolean) => {
  const form = new FormData();
  form.append('employeeId', values.employeeId.trim());
  form.append('name', values.name.trim());
  form.append('email', values.email.trim());
  form.append('unit', values.unit);
  form.append('department', values.department);
  form.append('role', values.role);
  form.append('status', values.status);

  if (values.phone.trim()) form.append('phone', values.phone.trim());
  if (values.designation.trim()) form.append('designation', values.designation.trim());
  if (values.reportingManager) form.append('reportingManager', values.reportingManager);
  if (!isEdit && values.password.trim()) form.append('password', values.password.trim());
  if (image) form.append('profileImage', image);

  return form;
};

export interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Omit to create. */
  user?: User | null;
  onSaved?: (user: User) => void;
}

/** Create / edit a user. Shared by the directory and the user detail page. */
export const UserFormModal = ({ open, onClose, user, onSaved }: UserFormModalProps) => {
  const queryClient = useQueryClient();
  const isEdit = Boolean(user);
  const [image, setImage] = useState<File[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: EMPTY_USER,
  });

  const selectedUnit = watch('unit');

  const { data: units = [] } = useQuery({ queryKey: ['units', 'lookup'], queryFn: unitApi.lookup });
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: roleApi.list });
  const { data: managers = [] } = useQuery({ queryKey: ['users', 'managers'], queryFn: userApi.managers });
  const { data: departments = [] } = useQuery({
    queryKey: ['departments', 'lookup', selectedUnit],
    queryFn: () => departmentApi.lookup(selectedUnit || undefined),
    enabled: open,
  });

  /* Re-seed the form each time the modal opens so a cancelled edit never
   * leaks into the next one. */
  useEffect(() => {
    if (!open) return;
    reset(user ? toFormValues(user) : EMPTY_USER);
    setImage([]);
  }, [open, user, reset]);

  const unitOptions = useMemo<SelectOption[]>(
    () => units.map((unit) => ({ value: unit._id, label: `${unit.name} (${unit.code})` })),
    [units]
  );
  const departmentOptions = useMemo<SelectOption[]>(
    () => departments.map((dept) => ({ value: dept._id, label: `${dept.name} (${dept.code})` })),
    [departments]
  );
  const roleOptions = useMemo<SelectOption[]>(
    () => roles.map((role) => ({ value: role._id, label: role.name })),
    [roles]
  );
  const managerOptions = useMemo<SelectOption[]>(
    () =>
      managers
        .filter((manager) => manager._id !== user?._id)
        .map((manager) => ({ value: manager._id, label: `${manager.name} · ${manager.employeeId}` })),
    [managers, user]
  );

  const save = useMutation({
    mutationFn: (values: UserFormValues) => {
      const payload = buildUserFormData(values, image[0] ?? null, isEdit);
      return isEdit && user ? userApi.update(user._id, payload) : userApi.create(payload);
    },
    onSuccess: (saved) => {
      toast.success(isEdit ? 'User updated' : 'User created — a welcome email is on its way');
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      onSaved?.(saved);
      onClose();
    },
    onError: (error: unknown) => {
      const fields = fieldErrors(error);
      (Object.keys(fields) as (keyof UserFormValues)[]).forEach((field) => {
        if (field in EMPTY_USER) setError(field, { message: fields[field] });
      });
      toast.error(errorMessage(error, 'Could not save the user'));
    },
  });

  const onSubmit = handleSubmit((values) => save.mutateAsync(values).catch(() => undefined));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      icon={<UserPlus className="h-5 w-5" />}
      title={isEdit ? `Edit ${user?.name}` : 'Add user'}
      description={
        isEdit
          ? 'Changes take effect the next time this person signs in.'
          : 'The new user is emailed their credentials as soon as you save.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} isLoading={isSubmitting}>
            {isEdit ? 'Save changes' : 'Create user'}
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
          label="Employee ID"
          required
          placeholder="EMP-0042"
          error={errors.employeeId?.message}
          {...register('employeeId')}
        />
        <Input
          label="Full name"
          required
          placeholder="Priya Sharma"
          error={errors.name?.message}
          {...register('name')}
        />
        <Input
          label="Email"
          type="email"
          required
          placeholder="priya@company.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Phone"
          placeholder="+91 98765 43210"
          error={errors.phone?.message}
          {...register('phone')}
        />

        <Select
          label="Unit"
          required
          placeholder="Select a unit"
          options={unitOptions}
          error={errors.unit?.message}
          {...register('unit', {
            onChange: () => setValue('department', '', { shouldValidate: false }),
          })}
        />
        <Select
          label="Department"
          required
          placeholder={selectedUnit ? 'Select a department' : 'Pick a unit first'}
          options={departmentOptions}
          disabled={!selectedUnit}
          hint="Only departments inside the chosen unit are listed."
          error={errors.department?.message}
          {...register('department')}
        />

        <Input
          label="Designation"
          placeholder="Senior Engineer"
          error={errors.designation?.message}
          {...register('designation')}
        />
        <Select
          label="Role"
          required
          placeholder="Select a role"
          options={roleOptions}
          hint="The role decides what this person can see and do."
          error={errors.role?.message}
          {...register('role')}
        />

        <Select
          label="Reporting manager"
          placeholder="No manager"
          options={managerOptions}
          hint={isEdit ? 'Leaving this blank keeps the current manager.' : 'Approves this person’s gate passes.'}
          error={errors.reportingManager?.message}
          {...register('reportingManager')}
        />
        <Select
          label="Status"
          options={STATUS_OPTIONS}
          error={errors.status?.message}
          {...register('status')}
        />

        {!isEdit && (
          <Input
            label="Temporary password"
            type="password"
            placeholder="Leave blank to auto-generate"
            hint="Leave this blank and the server generates a strong password and emails it to the user."
            error={errors.password?.message}
            containerClassName="sm:col-span-2"
            {...register('password')}
          />
        )}

        <div className="sm:col-span-2">
          <FileUpload
            files={image}
            onChange={setImage}
            accept="image/*"
            maxFiles={1}
            maxSizeMb={5}
            label="Profile photo"
            hint="One image, up to 5MB. Optional — initials are used otherwise."
          />
        </div>
      </form>
    </Modal>
  );
};

/* ─── Reset password ─────────────────────────────────────────────────────── */

const resetSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

type ResetValues = z.infer<typeof resetSchema>;

export interface ResetPasswordModalProps {
  open: boolean;
  onClose: () => void;
  user: Pick<User, '_id' | 'name'> | null;
}

export const ResetPasswordModal = ({ open, onClose, user }: ResetPasswordModalProps) => {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { password: '' } });

  useEffect(() => {
    if (open) reset({ password: '' });
  }, [open, reset]);

  const submit = handleSubmit(async (values) => {
    if (!user) return;
    try {
      await userApi.resetPassword(user._id, values.password);
      toast.success(`Password reset for ${user.name}`);
      onClose();
    } catch (error) {
      const fields = fieldErrors(error);
      if (fields.password) setError('password', { message: fields.password });
      toast.error(errorMessage(error, 'Could not reset the password'));
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      icon={<KeyRound className="h-5 w-5" />}
      title="Reset password"
      description={user ? `Set a new password for ${user.name}.` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} isLoading={isSubmitting}>
            Reset password
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Input
          label="New password"
          type="password"
          required
          autoComplete="new-password"
          hint="At least 8 characters. Share it with the user over a trusted channel."
          error={errors.password?.message}
          {...register('password')}
        />
      </form>
    </Modal>
  );
};

/* ─── The directory ──────────────────────────────────────────────────────── */

const Users = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('-createdAt');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [unit, setUnit] = useState('');
  const [status, setStatus] = useState('');

  const [formUser, setFormUser] = useState<User | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const debouncedSearch = useDebounce(search, 350);

  const filters = useMemo(
    () => ({ page, limit: 20, sort, search: debouncedSearch, role, department, unit, status }),
    [page, sort, debouncedSearch, role, department, unit, status]
  );

  const usersQuery = useQuery({
    queryKey: ['users', 'list', filters],
    queryFn: () => userApi.list(filters),
  });

  const { data: units = [] } = useQuery({ queryKey: ['units', 'lookup'], queryFn: unitApi.lookup });
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: roleApi.list });
  const { data: departments = [] } = useQuery({
    queryKey: ['departments', 'lookup', unit],
    queryFn: () => departmentApi.lookup(unit || undefined),
  });

  const activeQuery = useQuery({
    queryKey: ['users', 'count', 'ACTIVE'],
    queryFn: () => userApi.list({ limit: 1, status: 'ACTIVE' }),
  });
  const totalQuery = useQuery({
    queryKey: ['users', 'count', 'ALL'],
    queryFn: () => userApi.list({ limit: 1 }),
  });

  const total = totalQuery.data?.meta.total ?? 0;
  const active = activeQuery.data?.meta.total ?? 0;

  const setStatusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: UserStatus }) => userApi.setStatus(id, next),
    onSuccess: (updated) => {
      toast.success(updated.status === 'ACTIVE' ? `${updated.name} activated` : `${updated.name} deactivated`);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not change the status')),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => userApi.remove(id),
    onSuccess: () => {
      toast.success('User deactivated');
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    // The server refuses to remove the last active Super Admin (409). Show its
    // reason verbatim — it is more precise than anything we could invent here.
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not deactivate the user')),
  });

  const resetFilters = () => {
    setSearch('');
    setRole('');
    setDepartment('');
    setUnit('');
    setStatus('');
    setPage(1);
  };

  const openCreate = () => {
    setFormUser(null);
    setFormOpen(true);
  };

  const openEdit = (user: User) => {
    setFormUser(user);
    setFormOpen(true);
  };

  const rowActions = (user: User): DropdownItem[] => {
    const items: DropdownItem[] = [
      {
        label: 'View profile',
        icon: <UsersIcon className="h-4 w-4" />,
        onClick: () => navigate(`/users/${user._id}`),
      },
    ];

    if (can(PERMISSION.USERS_UPDATE)) {
      items.push(
        { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(user) },
        {
          label: 'Reset password',
          icon: <KeyRound className="h-4 w-4" />,
          onClick: () => setResetTarget(user),
        },
        {
          label: user.status === 'ACTIVE' ? 'Deactivate' : 'Activate',
          icon:
            user.status === 'ACTIVE' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />,
          separated: true,
          onClick: () =>
            setStatusMutation.mutate({
              id: user._id,
              next: user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
            }),
        }
      );
    }

    if (can(PERMISSION.USERS_DELETE)) {
      items.push({
        label: 'Delete',
        icon: <Trash2 className="h-4 w-4" />,
        danger: true,
        separated: !can(PERMISSION.USERS_UPDATE),
        onClick: () => setDeleteTarget(user),
      });
    }

    return items;
  };

  const actionCell = (user: User) => (
    <div onClick={(event) => event.stopPropagation()}>
      <Dropdown
        trigger={
          <Button variant="ghost" size="icon" aria-label={`Actions for ${user.name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        }
        items={rowActions(user)}
      />
    </div>
  );

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'User',
      sortable: true,
      render: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={row.name} src={row.profileImage} size="md" status={row.status} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-content">{row.name}</p>
            <p className="truncate font-mono text-xs text-content-muted">{row.employeeId}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Contact',
      hideBelow: 'lg',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-content">{row.email}</p>
          <p className="truncate text-xs text-content-muted">{row.phone || '—'}</p>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      hideBelow: 'lg',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-content">{labelOf(row.department)}</p>
          <p className="truncate text-xs text-content-muted">{row.designation || '—'}</p>
        </div>
      ),
    },
    {
      key: 'unit',
      header: 'Unit',
      hideBelow: 'xl',
      render: (row) => <span className="text-sm text-content-muted">{labelOf(row.unit)}</span>,
    },
    {
      key: 'role',
      header: 'Role',
      render: (row) => <RoleBadge role={row.role} />,
    },
    {
      key: 'reportingManager',
      header: 'Manager',
      hideBelow: 'xl',
      render: (row) => (
        <span className="text-sm text-content-muted">{labelOf(row.reportingManager)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => (
        <Badge tone={STATUS_TONE[row.status]} dot>
          {row.status.charAt(0) + row.status.slice(1).toLowerCase()}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-12',
      render: actionCell,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Everyone with an account, and what they are allowed to do."
        icon={<UsersIcon className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Administration' }, { label: 'Users' }]}
        actions={
          <Can do={PERMISSION.USERS_CREATE}>
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Add user
            </Button>
          </Can>
        }
      />

      {/* ── Stat strip ──────────────────────────────────────────────────── */}
      <motion.div
        variants={staggerContainer()}
        initial="initial"
        animate="animate"
        className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <StatCard label="Total users" value={total} icon={<UsersIcon className="h-5 w-5" />} tone="brand" />
        <StatCard
          label="Active"
          value={active}
          icon={<UserCheck className="h-5 w-5" />}
          tone="success"
          hint={total ? `${Math.round((active / total) * 100)}% of the directory` : undefined}
        />
        <StatCard
          label="Inactive / suspended"
          value={Math.max(total - active, 0)}
          icon={<UserX className="h-5 w-5" />}
          tone="warning"
        />
      </motion.div>

      <motion.div variants={staggerItem} initial="initial" animate="animate" className="mb-6">
        <Card padding="sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-content-muted">
              <ShieldCheck className="h-3.5 w-3.5" />
              By role
            </span>
            {roles.length === 0 && <span className="text-sm text-content-subtle">No roles yet</span>}
            {roles.map((item) => (
              <button
                key={item._id}
                type="button"
                onClick={() => {
                  setRole(item._id);
                  setPage(1);
                }}
                className="transition-opacity hover:opacity-80"
              >
                <RoleBadge role={{ name: `${item.name} · ${item.userCount ?? 0}`, color: item.color }} />
              </button>
            ))}
          </div>
        </Card>
      </motion.div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <Card padding="sm" className="mb-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Input
            placeholder="Search by name, email or employee ID…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            containerClassName="xl:col-span-1"
          />

          <Select
            placeholder="All roles"
            options={roles.map((item) => ({ value: item._id, label: item.name }))}
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
          />

          <Select
            placeholder="All units"
            options={units.map((item) => ({ value: item._id, label: item.name }))}
            value={unit}
            onChange={(event) => {
              setUnit(event.target.value);
              setDepartment('');
              setPage(1);
            }}
          />

          <Select
            placeholder="All departments"
            options={departments.map((item) => ({ value: item._id, label: item.name }))}
            value={department}
            onChange={(event) => {
              setDepartment(event.target.value);
              setPage(1);
            }}
          />

          <div className="flex gap-2">
            <Select
              placeholder="Any status"
              options={STATUS_OPTIONS}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            />
            <Button variant="ghost" onClick={resetFilters} className="shrink-0">
              Clear
            </Button>
          </div>
        </div>
      </Card>

      <DataTable
        data={usersQuery.data?.items ?? []}
        columns={columns}
        isLoading={usersQuery.isPending}
        rowKey={(row) => row._id}
        onRowClick={(row) => navigate(`/users/${row._id}`)}
        meta={usersQuery.data?.meta}
        onPageChange={setPage}
        sort={sort}
        onSortChange={setSort}
        emptyTitle="No users match these filters"
        emptyMessage="Try a different search, or clear the filters to see the whole directory."
        emptyAction={
          <Button variant="secondary" onClick={resetFilters}>
            Clear filters
          </Button>
        }
        mobileCard={(row) => (
          <Card padding="sm" className="card-hover">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={row.name} src={row.profileImage} size="md" status={row.status} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-content">{row.name}</p>
                  <p className="truncate font-mono text-xs text-content-muted">{row.employeeId}</p>
                </div>
              </div>
              {actionCell(row)}
            </div>

            <p className="mt-3 truncate text-sm text-content-muted">{row.email}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <RoleBadge role={row.role} />
              <Badge tone={STATUS_TONE[row.status]} dot>
                {row.status.charAt(0) + row.status.slice(1).toLowerCase()}
              </Badge>
              <span className="truncate text-xs text-content-subtle">
                {labelOf(row.department)} · {labelOf(row.unit)}
              </span>
            </div>
          </Card>
        )}
      />

      <UserFormModal open={formOpen} onClose={() => setFormOpen(false)} user={formUser} />

      <ResetPasswordModal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        user={resetTarget}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) removeMutation.mutate(deleteTarget._id);
        }}
        isLoading={removeMutation.isPending}
        title="Deactivate this user?"
        confirmLabel="Deactivate"
        icon={<Trash2 className="h-5 w-5" />}
        message={
          <>
            <p>
              <span className="font-semibold text-content">{deleteTarget?.name}</span> is not erased —
              this is a soft delete. The account is deactivated, their sessions are dropped, and every
              gate pass, approval and audit entry they touched stays intact.
            </p>
            <p className="mt-3">
              You can bring them back at any time by setting their status to Active.
            </p>
          </>
        }
      />
    </div>
  );
};

export default Users;
