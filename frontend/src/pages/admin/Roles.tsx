import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  Eye,
  Layers,
  Lock,
  Minus,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Users as UsersIcon,
} from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  ListSkeleton,
  Select,
  Skeleton,
  Switch,
  Textarea,
  Tooltip,
  type SelectOption,
} from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { PERMISSION } from '@/permissions/constants';
import { usePermissions } from '@/permissions/usePermissions';
import { departmentApi, roleApi, unitApi } from '@/services/endpoints';
import { errorMessage, fieldErrors } from '@/services/api';
import { cn } from '@/utils/cn';
import { slideUp, staggerContainer, staggerItem } from '@/animations/variants';
import type { DataScope, PermissionCatalogueGroup, Role } from '@/types';

/* ─── Data scope — the single most consequential field on this screen ─────── */
const DATA_SCOPES: { value: DataScope; label: string; explanation: string }[] = [
  { value: 'OWN', label: 'Own records only', explanation: 'Only the gate passes this person raised themselves.' },
  {
    value: 'REPORTEES',
    label: 'Their reportees',
    explanation: 'Their own records plus everyone who reports directly to them.',
  },
  {
    value: 'DEPARTMENT',
    label: 'Their department',
    explanation: 'Every record belonging to the department this person is in.',
  },
  {
    value: 'UNIT',
    label: 'Their unit',
    explanation: 'Every record inside the unit(s) this person belongs to, across all departments.',
  },
  {
    value: 'ALL',
    label: 'Everything',
    explanation: 'Every record in the organisation, in every unit. Grant this sparingly.',
  },
];

const SCOPE_OPTIONS: SelectOption[] = DATA_SCOPES.map((scope) => ({
  value: scope.value,
  label: scope.label,
}));

const HEX = /^#[0-9a-fA-F]{6}$/;

const SWATCHES = ['#6366f1', '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899'];

/* ─── The editable shape of a role ───────────────────────────────────────── */
interface RoleDraft {
  _id?: string;
  key: string;
  name: string;
  description: string;
  permissions: string[];
  dataScope: DataScope;
  unitRestrictions: string[];
  departmentRestrictions: string[];
  level: number;
  color: string;
  isSystem: boolean;
  isActive: boolean;
}

/** Restriction lists arrive as ids from /roles, but populated from /roles/:id. */
const idsOf = (values: (string | { _id: string })[] | undefined): string[] =>
  (values ?? []).map((value) => (typeof value === 'string' ? value : value._id));

const toDraft = (role: Role): RoleDraft => ({
  _id: role._id,
  key: role.key,
  name: role.name,
  description: role.description ?? '',
  permissions: [...(role.permissions ?? [])],
  dataScope: role.dataScope,
  unitRestrictions: idsOf(role.unitRestrictions),
  departmentRestrictions: idsOf(role.departmentRestrictions),
  level: role.level ?? 0,
  color: HEX.test(role.color ?? '') ? role.color : '#6366f1',
  isSystem: role.isSystem,
  isActive: role.isActive,
});

const blankDraft = (): RoleDraft => ({
  key: '',
  name: '',
  description: '',
  permissions: [],
  dataScope: 'OWN',
  unitRestrictions: [],
  departmentRestrictions: [],
  level: 0,
  color: '#6366f1',
  isSystem: false,
  isActive: true,
});

const toggle = (list: string[], value: string): string[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

/** A restriction chip. Selected = the role is confined to this unit/department. */
const Chip = ({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition-all',
      selected
        ? 'bg-brand-500/15 text-brand-700 ring-brand-500/40 dark:text-brand-300'
        : 'bg-content/5 text-content-muted ring-transparent hover:text-content',
      disabled && 'cursor-not-allowed opacity-50'
    )}
  >
    {selected ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
    {label}
  </button>
);

const Roles = () => {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManage = can(PERMISSION.ROLES_MANAGE);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RoleDraft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  /** Below lg the two panes become one column: list → tap → editor. */
  const [mobilePane, setMobilePane] = useState<'list' | 'editor'>('list');

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: roleApi.list });

  const catalogueQuery = useQuery({
    queryKey: ['roles', 'catalogue'],
    queryFn: async () => {
      // The API wraps the catalogue as `{ groups, dataScopes }`; older builds
      // returned the bare array. Accept both.
      const result = await roleApi.catalogue();
      const payload = result as unknown as
        | PermissionCatalogueGroup[]
        | { groups?: PermissionCatalogueGroup[] };
      if (Array.isArray(payload)) return payload;
      return payload.groups ?? [];
    },
  });

  const { data: units = [] } = useQuery({ queryKey: ['units', 'lookup'], queryFn: unitApi.lookup });
  const { data: departments = [] } = useQuery({
    queryKey: ['departments', 'lookup', 'all'],
    queryFn: () => departmentApi.lookup(),
  });

  const roles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);
  const groups = catalogueQuery.data ?? [];

  /* Select the first role once the list lands, so the editor is never empty on
   * a desktop first paint. */
  useEffect(() => {
    if (selectedId || isNew || roles.length === 0) return;
    setSelectedId(roles[0]._id);
    setDraft(toDraft(roles[0]));
  }, [roles, selectedId, isNew]);

  const original = useMemo(
    () => roles.find((role) => role._id === selectedId) ?? null,
    [roles, selectedId]
  );

  /* O(1) membership. The permission grid asked `draft.permissions.includes(key)`
   * for every key in every group, and again for every Switch — a linear scan of
   * the permission array thousands of times per render, on every keystroke. */
  const selectedPermissions = useMemo(
    () => new Set(draft?.permissions ?? []),
    [draft?.permissions]
  );

  const isDirty = useMemo(() => {
    if (!draft) return false;
    if (isNew) return true;
    if (!original) return false;

    /* Was: JSON.stringify(draft) !== JSON.stringify(toDraft(original)) — two full
     * serializations of the role, permission array and all, on every keystroke in
     * the name field. Compare the fields structurally instead; permissions are
     * compared by size then membership against the Set we already built. */
    const base = toDraft(original);
    if (draft.name !== base.name) return true;
    if (draft.description !== base.description) return true;
    if (draft.level !== base.level) return true;
    if (draft.permissions.length !== base.permissions.length) return true;
    return base.permissions.some((key) => !selectedPermissions.has(key));
  }, [draft, original, isNew, selectedPermissions]);

  const allPermissions = useMemo(
    () => groups.flatMap((group) => group.permissions),
    [groups]
  );

  const sidebarPreview = useMemo(
    () =>
      allPermissions.filter(
        (permission) => permission.sidebar && draft?.permissions.includes(permission.key)
      ),
    [allPermissions, draft]
  );

  const selectRole = (role: Role) => {
    setSelectedId(role._id);
    setDraft(toDraft(role));
    setIsNew(false);
    setMobilePane('editor');
  };

  const startNew = () => {
    setSelectedId(null);
    setDraft(blankDraft());
    setIsNew(true);
    setMobilePane('editor');
  };

  const patch = (changes: Partial<RoleDraft>) =>
    setDraft((current) => (current ? { ...current, ...changes } : current));

  const save = useMutation({
    mutationFn: (values: RoleDraft) => {
      const payload: Partial<Role> = {
        name: values.name.trim(),
        description: values.description.trim(),
        permissions: values.permissions,
        dataScope: values.dataScope,
        unitRestrictions: values.unitRestrictions,
        departmentRestrictions: values.departmentRestrictions,
        level: values.level,
        color: values.color,
        isActive: values.isActive,
      };

      if (isNew) return roleApi.create({ ...payload, key: values.key.trim().toUpperCase() });
      // A system role's key is referenced in code — the server rejects a change,
      // so it is never sent.
      if (!values._id) throw new Error('No role selected');
      if (!values.isSystem && values.key.trim().toUpperCase() !== original?.key) {
        payload.key = values.key.trim().toUpperCase();
      }
      return roleApi.update(values._id, payload);
    },
    onSuccess: async (saved) => {
      toast.success(isNew ? `Role ${saved.name} created` : `${saved.name} saved`);
      setIsNew(false);
      setSelectedId(saved._id);
      setDraft(toDraft(saved));
      await queryClient.invalidateQueries({ queryKey: ['roles'] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: unknown) => {
      const fields = fieldErrors(error);
      const first = Object.values(fields)[0];
      toast.error(first ?? errorMessage(error, 'Could not save the role'));
    },
  });

  const remove = useMutation({
    mutationFn: (roleId: string) => roleApi.remove(roleId),
    onSuccess: async () => {
      toast.success('Role deleted');
      setDeleteOpen(false);
      setSelectedId(null);
      setDraft(null);
      setMobilePane('list');
      await queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    // The server refuses when the role is a system role or still has users.
    // Its message names the exact count — show it verbatim.
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not delete the role')),
  });

  const attemptSave = () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error('The role needs a name');
      return;
    }
    if (isNew && !/^[A-Z0-9_]{2,40}$/.test(draft.key.trim().toUpperCase())) {
      toast.error('The role key may only contain A–Z, 0–9 and underscores');
      return;
    }
    if (!HEX.test(draft.color)) {
      toast.error('The colour must be a hex value such as #6366f1');
      return;
    }
    save.mutate(draft);
  };

  const discard = () => {
    if (isNew) {
      setIsNew(false);
      setDraft(original ? toDraft(original) : null);
      if (!original) setMobilePane('list');
      return;
    }
    if (original) setDraft(toDraft(original));
  };

  const permissionCount = draft?.permissions.length ?? 0;
  const totalPermissions = allPermissions.length;

  return (
    <div>
      <PageHeader
        title="Roles & permissions"
        subtitle="Every role is dynamic: build the exact shape of access your organisation needs."
        icon={<ShieldCheck className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Administration' }, { label: 'Roles' }]}
        actions={
          canManage ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={startNew}>
              New role
            </Button>
          ) : (
            <Tooltip content="You need the Manage Roles permission">
              <Button disabled leftIcon={<Plus className="h-4 w-4" />}>
                New role
              </Button>
            </Tooltip>
          )
        }
      />

      {!canManage && (
        <Card padding="sm" className="mb-6 border-l-4 border-l-info-500">
          {/* The icon and the copy must be the flex container's ONLY two children —
              putting the prose directly in a flex parent turns every text node and
              <span> into its own flex item, which fragments the sentence into columns. */}
          <div className="flex items-start gap-2 text-sm text-content-muted">
            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-info-500" />
            <p>
              You are viewing roles in read-only mode. Every control below is disabled — ask an
              administrator for the <span className="font-semibold text-content">Manage Roles</span>{' '}
              permission to make changes.
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* ── Role list ──────────────────────────────────────────────────── */}
        <div className={cn(mobilePane === 'editor' && 'hidden lg:block')}>
          {rolesQuery.isPending ? (
            <ListSkeleton rows={5} />
          ) : roles.length === 0 ? (
            <EmptyState
              title="No roles yet"
              message="Create the first role to start assigning access."
              icon={<ShieldCheck className="h-7 w-7" />}
              action={
                canManage ? (
                  <Button leftIcon={<Plus className="h-4 w-4" />} onClick={startNew}>
                    New role
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <motion.div
              variants={staggerContainer(0.04)}
              initial="initial"
              animate="animate"
              className="space-y-3"
            >
              {roles.map((role) => {
                const active = role._id === selectedId && !isNew;
                return (
                  <motion.button
                    key={role._id}
                    variants={staggerItem}
                    type="button"
                    onClick={() => selectRole(role)}
                    className={cn(
                      'card card-hover w-full p-4 text-left transition-shadow',
                      active && 'ring-2 ring-brand-500/50'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className="mt-1 h-8 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: role.color || '#6366f1' }}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-content">{role.name}</p>
                          {role.isSystem && (
                            <Tooltip content="System role — it cannot be deleted">
                              <Lock className="h-3.5 w-3.5 shrink-0 text-content-subtle" />
                            </Tooltip>
                          )}
                          {!role.isActive && (
                            <Badge tone="neutral" className="px-1.5 py-0.5">
                              Off
                            </Badge>
                          )}
                        </div>

                        <p className="truncate font-mono text-xs text-content-muted">{role.key}</p>

                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <Badge tone="brand" className="px-1.5 py-0.5">
                            {role.dataScope}
                          </Badge>
                          <span className="inline-flex items-center gap-1 text-2xs font-semibold text-content-subtle">
                            <UsersIcon className="h-3 w-3" />
                            {role.userCount ?? 0}
                          </span>
                          <span className="text-2xs font-semibold text-content-subtle">
                            · {role.permissions?.length ?? 0} perms
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </div>

        {/* ── Editor ─────────────────────────────────────────────────────── */}
        <div className={cn('min-w-0', mobilePane === 'list' && 'hidden lg:block')}>
          {!draft ? (
            <EmptyState
              title="Pick a role"
              message="Select a role on the left to see and edit exactly what it can do."
              icon={<ShieldCheck className="h-7 w-7" />}
            />
          ) : (
            <motion.div
              key={draft._id ?? 'new'}
              variants={slideUp}
              initial="initial"
              animate="animate"
              className="space-y-6"
            >
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<ArrowLeft className="h-4 w-4" />}
                onClick={() => setMobilePane('list')}
                className="lg:hidden"
              >
                All roles
              </Button>

              {/* ── Identity ─────────────────────────────────────────────── */}
              <Card>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="h-10 w-10 shrink-0 rounded-xl"
                      style={{ backgroundColor: draft.color }}
                    />
                    <div>
                      <h2 className="text-base font-semibold text-content">
                        {isNew ? 'New role' : draft.name || 'Unnamed role'}
                      </h2>
                      <p className="font-mono text-xs text-content-muted">
                        {draft.key || 'ROLE_KEY'}
                        {draft.isSystem && ' · system'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isNew && draft._id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Trash2 className="h-4 w-4" />}
                        disabled={!canManage}
                        onClick={() => setDeleteOpen(true)}
                        className="text-danger-500 hover:bg-danger-500/10"
                      >
                        Delete
                      </Button>
                    )}
                    <Button
                      size="sm"
                      leftIcon={<Save className="h-4 w-4" />}
                      disabled={!canManage || !isDirty}
                      isLoading={save.isPending}
                      onClick={attemptSave}
                    >
                      {isNew ? 'Create role' : 'Save'}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Input
                    label="Name"
                    required
                    placeholder="Shift Supervisor"
                    disabled={!canManage}
                    value={draft.name}
                    onChange={(event) => patch({ name: event.target.value })}
                  />

                  <Input
                    label="Key"
                    required
                    placeholder="SHIFT_SUPERVISOR"
                    className="font-mono uppercase"
                    disabled={!canManage || !isNew || draft.isSystem}
                    hint={
                      draft.isSystem
                        ? 'System role keys are referenced in code and cannot change.'
                        : isNew
                          ? 'A–Z, 0–9 and underscores. This is permanent once saved.'
                          : 'The key is fixed once the role exists.'
                    }
                    value={draft.key}
                    onChange={(event) => patch({ key: event.target.value.toUpperCase() })}
                  />

                  <div className="sm:col-span-2">
                    <Textarea
                      label="Description"
                      rows={2}
                      maxLength={280}
                      showCount
                      placeholder="What is this role for?"
                      disabled={!canManage}
                      value={draft.description}
                      onChange={(event) => patch({ description: event.target.value })}
                    />
                  </div>

                  <div>
                    <span className="mb-1.5 block text-sm font-medium text-content">Colour</span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="color"
                        aria-label="Role colour"
                        disabled={!canManage}
                        value={draft.color}
                        onChange={(event) => patch({ color: event.target.value })}
                        containerClassName="w-14 shrink-0"
                        className="h-10 cursor-pointer p-1"
                      />
                      <Input
                        aria-label="Role colour hex"
                        className="font-mono"
                        disabled={!canManage}
                        value={draft.color}
                        onChange={(event) => patch({ color: event.target.value })}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {SWATCHES.map((swatch) => (
                        <button
                          key={swatch}
                          type="button"
                          aria-label={`Use ${swatch}`}
                          disabled={!canManage}
                          onClick={() => patch({ color: swatch })}
                          className={cn(
                            'h-6 w-6 rounded-lg ring-2 ring-transparent transition-transform hover:scale-110',
                            draft.color.toLowerCase() === swatch && 'ring-content/30',
                            !canManage && 'cursor-not-allowed opacity-50'
                          )}
                          style={{ backgroundColor: swatch }}
                        />
                      ))}
                    </div>
                  </div>

                  <Input
                    label="Level"
                    type="number"
                    min={0}
                    max={100}
                    disabled={!canManage}
                    hint="Approval weight — a higher level can approve for a lower one."
                    value={draft.level}
                    onChange={(event) => patch({ level: Number(event.target.value) || 0 })}
                  />

                  <div className="sm:col-span-2">
                    <Select
                      label="Data scope"
                      required
                      options={SCOPE_OPTIONS}
                      disabled={!canManage}
                      value={draft.dataScope}
                      onChange={(event) => patch({ dataScope: event.target.value as DataScope })}
                    />
                    <div className="mt-2 rounded-xl bg-surface-sunken/70 px-3 py-2.5">
                      <p className="text-xs leading-relaxed text-content-muted">
                        <span className="font-semibold text-content">
                          {DATA_SCOPES.find((scope) => scope.value === draft.dataScope)?.label}:
                        </span>{' '}
                        {DATA_SCOPES.find((scope) => scope.value === draft.dataScope)?.explanation}
                      </p>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <Switch
                      label="Role is active"
                      description="Turning this off stops the role being assignable to new users. People who already hold it keep it."
                      disabled={!canManage}
                      checked={draft.isActive}
                      onChange={(checked) => patch({ isActive: checked })}
                    />
                  </div>
                </div>
              </Card>

              {/* ── Permissions ──────────────────────────────────────────── */}
              <Card>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand-600 dark:text-brand-300">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-content">Permissions</h3>
                      <p className="text-sm text-content-muted">
                        <span className="font-semibold tabular-nums text-content">
                          {permissionCount}
                        </span>{' '}
                        of {totalPermissions} permissions enabled
                      </p>
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => patch({ permissions: allPermissions.map((p) => p.key) })}
                      >
                        Select all
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => patch({ permissions: [] })}>
                        Clear all
                      </Button>
                    </div>
                  )}
                </div>

                {catalogueQuery.isPending ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton key={index} className="h-16 rounded-xl" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {groups.map((group) => {
                      const keys = group.permissions.map((permission) => permission.key);
                      const enabled = keys.filter((key) => selectedPermissions.has(key));
                      const all = enabled.length === keys.length && keys.length > 0;
                      const partial = enabled.length > 0 && !all;
                      const isCollapsed = collapsed.includes(group.group);

                      return (
                        <div
                          key={group.group}
                          className="overflow-hidden rounded-2xl border border-line bg-surface-sunken/40"
                        >
                          <div className="flex items-center gap-3 px-4 py-3">
                            <button
                              type="button"
                              onClick={() => setCollapsed((current) => toggle(current, group.group))}
                              aria-expanded={!isCollapsed}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              <ChevronDown
                                className={cn(
                                  'h-4 w-4 shrink-0 text-content-subtle transition-transform',
                                  isCollapsed && '-rotate-90'
                                )}
                              />
                              <span className="truncate text-sm font-semibold text-content">
                                {group.group}
                              </span>
                              <Badge tone={all ? 'success' : partial ? 'warning' : 'neutral'}>
                                {enabled.length}/{keys.length}
                              </Badge>
                            </button>

                            {/* Master toggle. A half-filled group reads as "partial"
                             *  rather than pretending to be off. */}
                            <div className="flex shrink-0 items-center gap-2">
                              {partial && (
                                <Tooltip content="Some permissions in this group are on">
                                  <Minus className="h-4 w-4 text-warning-500" />
                                </Tooltip>
                              )}
                              <Switch
                                size="sm"
                                disabled={!canManage}
                                checked={all}
                                onChange={(checked) =>
                                  patch({
                                    permissions: checked
                                      ? Array.from(new Set([...draft.permissions, ...keys]))
                                      : draft.permissions.filter((key) => !keys.includes(key)),
                                  })
                                }
                              />
                            </div>
                          </div>

                          <AnimatePresence initial={false}>
                            {!isCollapsed && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="grid gap-1 border-t border-line px-4 py-2 sm:grid-cols-2">
                                  {group.permissions.map((permission) => (
                                    <Switch
                                      key={permission.key}
                                      label={permission.label}
                                      description={permission.description}
                                      disabled={!canManage}
                                      checked={selectedPermissions.has(permission.key)}
                                      onChange={() =>
                                        patch({
                                          permissions: toggle(draft.permissions, permission.key),
                                        })
                                      }
                                    />
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* ── Restrictions ─────────────────────────────────────────── */}
              <Card>
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand-600 dark:text-brand-300">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-content">Restrictions</h3>
                    <p className="text-sm text-content-muted">
                      Narrow the data scope further. Selecting nothing means no restriction.
                    </p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <p className="mb-2 text-sm font-medium text-content">Units</p>
                    <p className="mb-3 text-xs text-content-subtle">
                      {draft.unitRestrictions.length === 0
                        ? 'No restriction — this role can reach every unit its data scope allows.'
                        : `Confined to ${draft.unitRestrictions.length} of ${units.length} units.`}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {units.map((unit) => (
                        <Chip
                          key={unit._id}
                          label={unit.name}
                          disabled={!canManage}
                          selected={draft.unitRestrictions.includes(unit._id)}
                          onClick={() =>
                            patch({ unitRestrictions: toggle(draft.unitRestrictions, unit._id) })
                          }
                        />
                      ))}
                      {units.length === 0 && (
                        <span className="text-sm text-content-subtle">No units yet</span>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-line pt-6">
                    <p className="mb-2 text-sm font-medium text-content">Departments</p>
                    <p className="mb-3 text-xs text-content-subtle">
                      {draft.departmentRestrictions.length === 0
                        ? 'No restriction — every department its data scope allows.'
                        : `Confined to ${draft.departmentRestrictions.length} of ${departments.length} departments.`}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {departments.map((department) => (
                        <Chip
                          key={department._id}
                          label={department.name}
                          disabled={!canManage}
                          selected={draft.departmentRestrictions.includes(department._id)}
                          onClick={() =>
                            patch({
                              departmentRestrictions: toggle(
                                draft.departmentRestrictions,
                                department._id
                              ),
                            })
                          }
                        />
                      ))}
                      {departments.length === 0 && (
                        <span className="text-sm text-content-subtle">No departments yet</span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>

              {/* ── Sidebar preview ──────────────────────────────────────── */}
              <Card>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand-600 dark:text-brand-300">
                    <Eye className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-content">What this role will see</h3>
                    <p className="text-sm text-content-muted">
                      The sidebar, as it stands with the toggles above — before you save.
                    </p>
                  </div>
                </div>

                {sidebarPreview.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-content-subtle">
                    With no navigation permissions enabled this role signs in to an empty app. Turn on
                    at least Dashboard or View Own.
                  </p>
                ) : (
                  <div className="rounded-2xl border border-line bg-surface-sunken/50 p-2">
                    {sidebarPreview.map((permission) => (
                      <div
                        key={permission.key}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                        <span className="text-sm font-medium text-content">{permission.label}</span>
                        <span className="ml-auto truncate font-mono text-2xs text-content-subtle">
                          {permission.key}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Sticky save bar ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {draft && isDirty && canManage && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="glass-strong sticky bottom-4 z-30 mt-6 flex flex-col gap-3 rounded-2xl px-4 py-3 shadow-glass-lg sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm text-content-muted">
              {isNew ? 'This role has not been created yet.' : 'You have unsaved changes.'}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={discard} disabled={save.isPending}>
                Discard
              </Button>
              <Button leftIcon={<Save className="h-4 w-4" />} isLoading={save.isPending} onClick={attemptSave}>
                {isNew ? 'Create role' : 'Save changes'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          if (draft?._id) remove.mutate(draft._id);
        }}
        isLoading={remove.isPending}
        title="Delete this role?"
        confirmLabel="Delete role"
        icon={<Trash2 className="h-5 w-5" />}
        message={
          <>
            <p>
              <span className="font-semibold text-content">{draft?.name}</span> will be removed
              permanently.
            </p>
            <p className="mt-3">
              The server refuses this if the role is a system role, or if anyone still holds it — you
              will need to move those {draft?._id ? (original?.userCount ?? 0) : 0} user(s) to another
              role first.
            </p>
          </>
        }
      />
    </div>
  );
};

export default Roles;
