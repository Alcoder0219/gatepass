import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  AtSign,
  Building2,
  Camera,
  CheckCircle2,
  ClipboardList,
  Factory,
  Fingerprint,
  Laptop,
  Lock,
  LogOut,
  Mail,
  Monitor,
  Moon,
  Phone,
  ShieldCheck,
  Sparkles,
  Sun,
  User as UserIcon,
  UserCog,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  Input,
  StatCard,
  StatCardSkeleton,
  Switch,
  Tabs,
  Tooltip,
  type TabItem,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { authApi, gatePassApi } from '@/services/endpoints';
import { errorMessage, fieldErrors } from '@/services/api';
import { formatDateTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import { staggerContainer } from '@/animations/variants';
import type { Department, Unit, User } from '@/types';

/* ─── Schemas ────────────────────────────────────────────────────────────── */
const profileSchema = z.object({
  name: z.string().min(2, 'Enter your full name').max(80, 'That name is too long'),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number')
    .or(z.literal('')),
  designation: z.string().trim().max(80, 'That designation is too long').or(z.literal('')),
});
type ProfileValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(8, 'Use at least 8 characters')
      .regex(/[a-z]/, 'Add a lowercase letter')
      .regex(/[A-Z]/, 'Add an uppercase letter')
      .regex(/\d/, 'Add a number'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The two passwords do not match',
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password you have not used here before',
  });
type PasswordValues = z.infer<typeof passwordSchema>;

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const nameOf = (value: Department | Unit | User | string | null | undefined) => {
  if (!value) return '—';
  if (typeof value === 'string') return value;
  return value.name || '—';
};

/** A field only an administrator can change — locked, and visibly so. */
const LockedField = ({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) => (
  <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-sunken/50 p-3.5">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-content/5 text-content-subtle">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-content-subtle">{label}</p>
        <Tooltip content="Set by an administrator — ask IT or HR to change it" side="top">
          <Lock className="h-3 w-3 text-content-subtle" aria-label="Read only" />
        </Tooltip>
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-content">{value}</p>
    </div>
  </div>
);

/* ─── Tabs ───────────────────────────────────────────────────────────────── */
const TABS: TabItem[] = [
  { value: 'profile', label: 'Profile', icon: <UserIcon className="h-4 w-4" /> },
  { value: 'security', label: 'Security', icon: <ShieldCheck className="h-4 w-4" /> },
  { value: 'preferences', label: 'Preferences', icon: <Sparkles className="h-4 w-4" /> },
];

const THEME_OPTIONS = [
  { value: 'light' as const, label: 'Light', icon: Sun },
  { value: 'dark' as const, label: 'Dark', icon: Moon },
  { value: 'system' as const, label: 'System', icon: Monitor },
];

const Profile = () => {
  const { user, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('profile');
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Revoke the object URL when the optimistic preview is replaced or unmounted. */
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview]
  );

  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['gate-passes', 'stats'],
    queryFn: gatePassApi.stats,
  });

  /* ── Profile form ───────────────────────────────────────────────────────── */
  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      name: user?.name ?? '',
      phone: user?.phone ?? '',
      designation: user?.designation ?? '',
    },
  });

  const saveProfile = profileForm.handleSubmit(async (values) => {
    try {
      await authApi.updateProfile({
        name: values.name.trim(),
        phone: values.phone.trim() || undefined,
        designation: values.designation.trim() || undefined,
      });
      await refreshUser();
      toast.success('Profile updated');
    } catch (error) {
      const fields = fieldErrors(error);
      (['name', 'phone', 'designation'] as const).forEach((field) => {
        if (fields[field]) profileForm.setError(field, { message: fields[field] });
      });
      toast.error(errorMessage(error, 'Could not save your profile'));
    }
  });

  /* ── Avatar ─────────────────────────────────────────────────────────────── */
  const onPickAvatar = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('That image is larger than 5MB');
      return;
    }

    setPreview(URL.createObjectURL(file)); // optimistic
    setUploading(true);
    try {
      await authApi.uploadAvatar(file);
      await refreshUser();
      toast.success('Photo updated');
    } catch (error) {
      setPreview(null); // roll back to the server's picture
      toast.error(errorMessage(error, 'Could not upload that photo'));
    } finally {
      setUploading(false);
    }
  };

  /* ── Password ───────────────────────────────────────────────────────────── */
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const changePassword = passwordForm.handleSubmit(async (values) => {
    try {
      await authApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      passwordForm.reset();
      toast.success('Password changed. Other devices have been signed out.');
    } catch (error) {
      const fields = fieldErrors(error);
      (['currentPassword', 'newPassword'] as const).forEach((field) => {
        if (fields[field]) passwordForm.setError(field, { message: fields[field] });
      });
      toast.error(errorMessage(error, 'Could not change your password'));
    }
  });

  /* ── Preferences ────────────────────────────────────────────────────────── */
  const preferences = user?.preferences ?? {
    theme: 'system' as const,
    emailNotifications: true,
    pushNotifications: true,
  };

  const savePreferences = useMutation({
    mutationFn: (next: NonNullable<User['preferences']>) => authApi.updateProfile({ preferences: next }),
    onSuccess: async () => {
      await refreshUser();
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Preferences saved');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save your preferences')),
  });

  const setPreference = (patch: Partial<NonNullable<User['preferences']>>) =>
    savePreferences.mutate({ ...preferences, ...patch });

  if (!user) return null;

  // Per-status counts live under `byStatus`, not on the root of the payload.
  const total = stats?.total ?? 0;
  const approved = stats?.byStatus?.APPROVED ?? 0;
  const completed = stats?.byStatus?.COMPLETED ?? 0;

  return (
    <motion.div initial="initial" animate="animate">
      <PageHeader
        title="Your profile"
        subtitle={
          user.lastLoginAt
            ? `Last signed in ${formatDateTime(user.lastLoginAt)}`
            : 'Manage your details, password and preferences'
        }
        icon={<UserIcon className="h-5 w-5" />}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Profile' }]}
      />

      {/* ── Stats strip ───────────────────────────────────────────────────── */}
      {statsLoading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <StatCardSkeleton key={index} />
          ))}
        </div>
      ) : statsError ? (
        <Card className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-sm text-content-muted">Your gate pass stats could not be loaded.</p>
          <Button variant="secondary" size="sm" onClick={() => void refetchStats()}>
            Retry
          </Button>
        </Card>
      ) : (
        <motion.div
          variants={staggerContainer(0.06)}
          initial="initial"
          animate="animate"
          className="grid gap-4 sm:grid-cols-3"
        >
          <StatCard label="Total gate passes" value={total} icon={<ClipboardList className="h-5 w-5" />} tone="brand" />
          <StatCard
            label="Approved"
            value={approved}
            icon={<CheckCircle2 className="h-5 w-5" />}
            tone="success"
            progress={total ? approved / total : 0}
          />
          <StatCard
            label="Completed"
            value={completed}
            icon={<LogOut className="h-5 w-5" />}
            tone="accent"
            progress={total ? completed / total : 0}
          />
        </motion.div>
      )}

      <div className="mt-6 flex justify-start">
        <Tabs tabs={TABS} value={tab} onChange={setTab} layoutId="profile-tab" className="w-full sm:w-auto" />
      </div>

      {/* ── Profile ───────────────────────────────────────────────────────── */}
      {tab === 'profile' && (
        <motion.div
          key="profile"
          variants={staggerContainer(0.06)}
          initial="initial"
          animate="animate"
          className="mt-6 grid gap-6 lg:grid-cols-3"
        >
          <Card animated padding="lg" className="lg:col-span-1">
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <Avatar
                  src={preview ?? user.profileImage}
                  name={user.name}
                  size="xl"
                  ring
                  status={user.status}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  aria-label="Change profile photo"
                  className={cn(
                    'absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-brand-gradient text-white shadow-glow-sm transition-transform hover:scale-110',
                    uploading && 'cursor-not-allowed opacity-70'
                  )}
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    void onPickAvatar(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </div>

              <p className="mt-4 text-lg font-bold text-content">{user.name}</p>
              <p className="text-sm text-content-muted">{user.designation || 'No designation set'}</p>

              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-500/15 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-500/25 dark:text-brand-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                {user.role?.name ?? 'No role'}
              </span>

              <p className="mt-4 text-xs leading-relaxed text-content-subtle">
                {uploading ? 'Uploading your photo…' : 'JPG or PNG, up to 5MB.'}
              </p>
            </div>
          </Card>

          <div className="space-y-6 lg:col-span-2">
            <Card animated padding="lg">
              <CardHeader
                title="Editable details"
                subtitle="These are yours to change"
                icon={<UserCog className="h-4 w-4" />}
              />

              <form onSubmit={saveProfile} className="space-y-5" noValidate>
                <Input
                  label="Full name"
                  leftIcon={<UserIcon className="h-4 w-4" />}
                  error={profileForm.formState.errors.name?.message}
                  {...profileForm.register('name')}
                />

                <div className="grid gap-5 sm:grid-cols-2">
                  <Input
                    label="Phone"
                    type="tel"
                    placeholder="+255 712345678"
                    leftIcon={<Phone className="h-4 w-4" />}
                    error={profileForm.formState.errors.phone?.message}
                    {...profileForm.register('phone')}
                  />
                  <Input
                    label="Designation"
                    placeholder="Production Engineer"
                    hint="Shown on your printed gate passes"
                    error={profileForm.formState.errors.designation?.message}
                    {...profileForm.register('designation')}
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    isLoading={profileForm.formState.isSubmitting}
                    disabled={!profileForm.formState.isDirty}
                  >
                    Save changes
                  </Button>
                </div>
              </form>
            </Card>

            <Card animated padding="lg">
              <CardHeader
                title="Organisation record"
                subtitle="Managed by your administrator"
                icon={<Lock className="h-4 w-4" />}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <LockedField
                  label="Employee ID"
                  value={user.employeeId}
                  icon={<Fingerprint className="h-4 w-4" />}
                />
                <LockedField label="Email" value={user.email} icon={<AtSign className="h-4 w-4" />} />
                <LockedField
                  label="Department"
                  value={nameOf(user.department)}
                  icon={<Building2 className="h-4 w-4" />}
                />
                <LockedField label="Unit" value={nameOf(user.unit)} icon={<Factory className="h-4 w-4" />} />
                <LockedField
                  label="Role"
                  value={user.role?.name ?? '—'}
                  icon={<ShieldCheck className="h-4 w-4" />}
                />
                <LockedField
                  label="Reporting manager"
                  value={nameOf(user.reportingManager)}
                  icon={<UserCog className="h-4 w-4" />}
                />
              </div>

              <p className="mt-4 text-xs leading-relaxed text-content-subtle">
                Your reporting manager is who a gate pass goes to when it enters{' '}
                <span className="font-semibold text-content-muted">PENDING</span>. If it is wrong,
                ask an administrator to correct it before you raise one.
              </p>
            </Card>
          </div>
        </motion.div>
      )}

      {/* ── Security ──────────────────────────────────────────────────────── */}
      {tab === 'security' && (
        <motion.div
          key="security"
          variants={staggerContainer(0.06)}
          initial="initial"
          animate="animate"
          className="mt-6 grid gap-6 lg:grid-cols-3"
        >
          <Card animated padding="lg" className="lg:col-span-2">
            <CardHeader
              title="Change password"
              subtitle="You'll stay signed in here"
              icon={<Lock className="h-4 w-4" />}
            />

            <form onSubmit={changePassword} className="space-y-5" noValidate>
              <Input
                label="Current password"
                type="password"
                autoComplete="current-password"
                leftIcon={<Lock className="h-4 w-4" />}
                error={passwordForm.formState.errors.currentPassword?.message}
                {...passwordForm.register('currentPassword')}
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <Input
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  hint="8+ chars, with upper, lower and a number"
                  leftIcon={<Lock className="h-4 w-4" />}
                  error={passwordForm.formState.errors.newPassword?.message}
                  {...passwordForm.register('newPassword')}
                />
                <Input
                  label="Confirm new password"
                  type="password"
                  autoComplete="new-password"
                  leftIcon={<Lock className="h-4 w-4" />}
                  error={passwordForm.formState.errors.confirmPassword?.message}
                  {...passwordForm.register('confirmPassword')}
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" isLoading={passwordForm.formState.isSubmitting}>
                  Update password
                </Button>
              </div>
            </form>
          </Card>

          <Card animated padding="lg" className="lg:col-span-1">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-warning-500/15 text-warning-500">
              <Laptop className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-content">Other devices sign out</h3>
            <p className="mt-2 text-sm leading-relaxed text-content-muted">
              Changing your password revokes every other active session — the phone in your pocket,
              the shared terminal at the gate, an old browser you forgot about. They'll each need
              the new password to get back in.
            </p>
            <p className="mt-4 text-xs leading-relaxed text-content-subtle">
              This session stays alive, so you won't lose anything you're in the middle of.
            </p>
          </Card>
        </motion.div>
      )}

      {/* ── Preferences ───────────────────────────────────────────────────── */}
      {tab === 'preferences' && (
        <motion.div
          key="preferences"
          variants={staggerContainer(0.06)}
          initial="initial"
          animate="animate"
          className="mt-6 grid gap-6 lg:grid-cols-2"
        >
          <Card animated padding="lg">
            <CardHeader
              title="Appearance"
              subtitle="Applies to this browser immediately"
              icon={<Sun className="h-4 w-4" />}
            />

            <div className="grid grid-cols-3 gap-3">
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setTheme(option.value);
                      setPreference({ theme: option.value });
                    }}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all duration-200',
                      active
                        ? 'border-brand-500/60 bg-brand-500/10 text-brand-600 shadow-glow-sm dark:text-brand-300'
                        : 'border-line bg-surface-sunken/50 text-content-muted hover:border-brand-500/40 hover:text-content'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-sm font-semibold">{option.label}</span>
                  </button>
                );
              })}
            </div>

            <p className="mt-4 text-xs leading-relaxed text-content-subtle">
              "System" follows your operating system and switches with it, including at sunset.
            </p>
          </Card>

          <Card animated padding="lg">
            <CardHeader
              title="Notifications"
              subtitle="How we reach you about your passes"
              icon={<Mail className="h-4 w-4" />}
            />

            <div className="divide-y divide-line">
              <Switch
                label="Email notifications"
                description="Approvals, HR review outcomes and late-return reminders, in your inbox."
                checked={preferences.emailNotifications}
                disabled={savePreferences.isPending}
                onChange={(checked) => setPreference({ emailNotifications: checked })}
              />
              <Switch
                label="Push notifications"
                description="Real-time alerts in the app the moment your pass changes stage."
                checked={preferences.pushNotifications}
                disabled={savePreferences.isPending}
                onChange={(checked) => setPreference({ pushNotifications: checked })}
              />
            </div>

            <p className="mt-4 text-xs leading-relaxed text-content-subtle">
              The in-app notification centre always records everything, whatever you choose here.
            </p>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
};

export default Profile;
