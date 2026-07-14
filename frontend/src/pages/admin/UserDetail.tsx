import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Briefcase,
  Building2,
  CalendarClock,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  ShieldCheck,
  UserCheck,
  UserCog,
  Users as UsersIcon,
  UserX,
} from 'lucide-react';

import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DetailSkeleton,
  EmptyState,
  ListSkeleton,
} from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { GatePassTable } from '@/components/gatepass/GatePassTable';
import { Can } from '@/permissions/Can';
import { PERMISSION } from '@/permissions/constants';
import { gatePassApi, userApi } from '@/services/endpoints';
import { errorMessage } from '@/services/api';
import { formatSmartDateTime } from '@/utils/format';
import { staggerContainer, staggerItem } from '@/animations/variants';
import type { User, UserStatus } from '@/types';
import { ResetPasswordModal, RoleBadge, UserFormModal } from './Users';

const idOf = (value: { _id: string } | string | null | undefined): string =>
  !value ? '' : typeof value === 'string' ? value : value._id;

const labelOf = (value: { name: string } | string | null | undefined): string =>
  !value || typeof value === 'string' ? '—' : value.name;

const STATUS_TONE: Record<UserStatus, 'success' | 'neutral' | 'danger'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  SUSPENDED: 'danger',
};

/** One labelled fact in the contact / organisation grid. */
const Field = ({
  icon,
  label,
  value,
  to,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  to?: string;
}) => (
  <div className="flex items-start gap-3">
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-gradient-soft text-brand-600 dark:text-brand-300">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">{label}</p>
      {to ? (
        <Link
          to={to}
          className="block truncate text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
        >
          {value}
        </Link>
      ) : (
        <p className="truncate text-sm font-medium text-content">{value}</p>
      )}
    </div>
  </div>
);

const UserDetail = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [passPage, setPassPage] = useState(1);

  const userQuery = useQuery({
    queryKey: ['users', 'detail', id],
    queryFn: () => userApi.get(id),
    enabled: Boolean(id),
  });

  const reporteesQuery = useQuery({
    queryKey: ['users', 'reportees', id],
    queryFn: () => userApi.reportees(id),
    enabled: Boolean(id),
  });

  const passesQuery = useQuery({
    queryKey: ['gate-passes', 'employee', id, passPage],
    queryFn: () => gatePassApi.list({ employee: id, page: passPage, limit: 10 }),
    enabled: Boolean(id),
  });

  const user = userQuery.data;

  const setStatusMutation = useMutation({
    mutationFn: (next: UserStatus) => userApi.setStatus(id, next),
    onSuccess: (updated) => {
      toast.success(updated.status === 'ACTIVE' ? 'User activated' : 'User deactivated');
      setStatusOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not change the status')),
  });

  if (userQuery.isPending) {
    return (
      <div>
        <PageHeader title="User" icon={<UserCog className="h-5 w-5" />} />
        <DetailSkeleton />
      </div>
    );
  }

  if (userQuery.isError || !user) {
    return (
      <div>
        <PageHeader title="User" icon={<UserCog className="h-5 w-5" />} />
        <EmptyState
          title="This user could not be loaded"
          message={errorMessage(userQuery.error, 'They may have been removed.')}
          action={
            <Button variant="secondary" onClick={() => navigate('/users')}>
              Back to the directory
            </Button>
          }
        />
      </div>
    );
  }

  const isActive = user.status === 'ACTIVE';
  const reportees: User[] = reporteesQuery.data ?? [];
  const managerId = idOf(user.reportingManager);
  const firstName = user.name.split(' ')[0];

  return (
    <div>
      <PageHeader
        title={user.name}
        subtitle={`${user.employeeId} · ${user.designation || 'No designation'}`}
        icon={<UserCog className="h-5 w-5" />}
        breadcrumbs={[
          { label: 'Administration' },
          { label: 'Users', to: '/users' },
          { label: user.name },
        ]}
        actions={
          <Can do={PERMISSION.USERS_UPDATE}>
            <Button
              variant="secondary"
              leftIcon={<Pencil className="h-4 w-4" />}
              onClick={() => setEditOpen(true)}
            >
              Edit
            </Button>
            <Button
              variant="secondary"
              leftIcon={<KeyRound className="h-4 w-4" />}
              onClick={() => setResetOpen(true)}
            >
              Reset password
            </Button>
            <Button
              variant={isActive ? 'danger' : 'success'}
              leftIcon={isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
              onClick={() => setStatusOpen(true)}
            >
              {isActive ? 'Deactivate' : 'Activate'}
            </Button>
          </Can>
        }
      />

      <motion.div
        variants={staggerContainer()}
        initial="initial"
        animate="animate"
        className="grid gap-6 lg:grid-cols-3"
      >
        {/* ── Profile card ─────────────────────────────────────────────── */}
        <Card animated className="lg:col-span-1">
          <div className="flex flex-col items-center text-center">
            <Avatar name={user.name} src={user.profileImage} size="xl" ring status={user.status} />

            <h2 className="mt-4 text-lg font-semibold text-content">{user.name}</h2>
            <p className="font-mono text-xs text-content-muted">{user.employeeId}</p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <RoleBadge role={user.role} />
              <Badge tone={STATUS_TONE[user.status]} dot>
                {user.status.charAt(0) + user.status.slice(1).toLowerCase()}
              </Badge>
            </div>

            <p className="mt-4 flex items-center gap-1.5 text-xs text-content-subtle">
              <CalendarClock className="h-3.5 w-3.5" />
              Last signed in {formatSmartDateTime(user.lastLoginAt)}
            </p>
          </div>

          <div className="mt-6 space-y-4 border-t border-line pt-6">
            <Field icon={<Mail className="h-4 w-4" />} label="Email" value={user.email} />
            <Field icon={<Phone className="h-4 w-4" />} label="Phone" value={user.phone || '—'} />
            <Field
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Data scope"
              value={user.role?.dataScope ?? '—'}
            />
          </div>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {/* ── Organisation ───────────────────────────────────────────── */}
          <Card animated>
            <CardHeader
              title="Organisation"
              subtitle="Where this person sits, and who signs off their gate passes."
              icon={<Building2 className="h-5 w-5" />}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field icon={<Building2 className="h-4 w-4" />} label="Unit" value={labelOf(user.unit)} />
              <Field
                icon={<Briefcase className="h-4 w-4" />}
                label="Department"
                value={labelOf(user.department)}
              />
              <Field
                icon={<Briefcase className="h-4 w-4" />}
                label="Designation"
                value={user.designation || '—'}
              />
              <Field
                icon={<UserCog className="h-4 w-4" />}
                label="Reporting manager"
                value={labelOf(user.reportingManager)}
                to={managerId ? `/users/${managerId}` : undefined}
              />
            </div>
          </Card>

          {/* ── Reportees ──────────────────────────────────────────────── */}
          <Card animated>
            <CardHeader
              title="Direct reportees"
              subtitle={
                reportees.length
                  ? `${firstName} approves gate passes for ${reportees.length} ${
                      reportees.length === 1 ? 'person' : 'people'
                    }.`
                  : 'Nobody reports to this person yet.'
              }
              icon={<UsersIcon className="h-5 w-5" />}
            />

            {reporteesQuery.isPending ? (
              <ListSkeleton rows={3} />
            ) : reportees.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-content-subtle">
                No direct reportees. Set this person as the reporting manager on someone’s profile to
                build the approval chain.
              </p>
            ) : (
              <motion.div
                variants={staggerContainer(0.04)}
                initial="initial"
                animate="animate"
                className="grid gap-3 sm:grid-cols-2"
              >
                {reportees.map((reportee) => (
                  <motion.div key={reportee._id} variants={staggerItem}>
                    <Link to={`/users/${reportee._id}`}>
                      <Card interactive padding="sm" className="flex items-center gap-3">
                        <Avatar
                          name={reportee.name}
                          src={reportee.profileImage}
                          size="md"
                          status={reportee.status}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-content">{reportee.name}</p>
                          <p className="truncate text-xs text-content-muted">
                            {reportee.employeeId} · {labelOf(reportee.department)}
                          </p>
                        </div>
                        <RoleBadge role={reportee.role} />
                      </Card>
                    </Link>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </Card>
        </div>
      </motion.div>

      {/* ── Gate pass history ───────────────────────────────────────────── */}
      <section className="mt-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand-600 dark:text-brand-300">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-content">Gate pass history</h3>
            <p className="text-sm text-content-muted">Every pass {firstName} has raised, newest first.</p>
          </div>
        </div>

        <GatePassTable
          data={passesQuery.data?.items ?? []}
          isLoading={passesQuery.isPending}
          meta={passesQuery.data?.meta}
          onPageChange={setPassPage}
          hideEmployee
          emptyTitle="No gate passes yet"
          emptyMessage={`${user.name} has not raised a gate pass so far.`}
        />
      </section>

      <UserFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        user={user}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ['users', 'detail', id] })}
      />

      <ResetPasswordModal open={resetOpen} onClose={() => setResetOpen(false)} user={user} />

      <ConfirmDialog
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        onConfirm={() => setStatusMutation.mutate(isActive ? 'INACTIVE' : 'ACTIVE')}
        isLoading={setStatusMutation.isPending}
        tone={isActive ? 'danger' : 'success'}
        confirmLabel={isActive ? 'Deactivate' : 'Activate'}
        title={isActive ? 'Deactivate this user?' : 'Activate this user?'}
        icon={isActive ? <UserX className="h-5 w-5" /> : <UserCheck className="h-5 w-5" />}
        message={
          isActive ? (
            <>
              <span className="font-semibold text-content">{user.name}</span> will be signed out and
              cannot sign in again. Their gate passes, approvals and audit history are untouched.
            </>
          ) : (
            <>
              <span className="font-semibold text-content">{user.name}</span> will be able to sign in
              again with their existing password.
            </>
          )
        }
      />
    </div>
  );
};

export default UserDetail;
