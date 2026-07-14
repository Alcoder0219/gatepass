import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowLeft, CheckCircle2, KeyRound, Lock, ShieldAlert } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { authApi } from '@/services/endpoints';
import { errorMessage, fieldErrors } from '@/services/api';
import { cn } from '@/utils/cn';
import { scaleIn, staggerContainer, staggerItem } from '@/animations/variants';

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .regex(/[a-z]/, 'Add a lowercase letter')
      .regex(/[A-Z]/, 'Add an uppercase letter')
      .regex(/\d/, 'Add a number'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The two passwords do not match',
  });

type ResetValues = z.infer<typeof schema>;

/* ─── Strength meter ─────────────────────────────────────────────────────── */
const RULES = [
  { label: '8+ characters', test: (value: string) => value.length >= 8 },
  { label: 'A lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { label: 'An uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'A number', test: (value: string) => /\d/.test(value) },
];

const SEGMENT_TONE = ['bg-danger-500', 'bg-warning-500', 'bg-info-500', 'bg-success-500'];
const SEGMENT_LABEL = ['Weak', 'Fair', 'Good', 'Strong'];

const StrengthMeter = ({ value }: { value: string }) => {
  const score = RULES.filter((rule) => rule.test(value)).length;

  return (
    <div>
      <div className="flex gap-1.5" role="presentation">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-1.5 flex-1 overflow-hidden rounded-full bg-content/10">
            <motion.div
              initial={false}
              animate={{ scaleX: index < score ? 1 : 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              style={{ transformOrigin: 'left' }}
              className={cn('h-full w-full rounded-full', SEGMENT_TONE[Math.max(score - 1, 0)])}
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-content-subtle">
          {value ? 'Password strength' : 'Mix case, numbers and length'}
        </p>
        {value && (
          <p
            className={cn(
              'text-xs font-semibold',
              score <= 1 && 'text-danger-500',
              score === 2 && 'text-warning-500',
              score === 3 && 'text-info-500',
              score === 4 && 'text-success-500'
            )}
          >
            {SEGMENT_LABEL[Math.max(score - 1, 0)]}
          </p>
        )}
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {RULES.map((rule) => {
          const met = rule.test(value);
          return (
            <li
              key={rule.label}
              className={cn(
                'flex items-center gap-1.5 text-xs transition-colors',
                met ? 'text-success-600 dark:text-success-400' : 'text-content-subtle'
              )}
            >
              <CheckCircle2 className={cn('h-3.5 w-3.5 shrink-0', !met && 'opacity-40')} />
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/* ─── Page ───────────────────────────────────────────────────────────────── */
const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const password = watch('password');

  const submit = handleSubmit(async (values) => {
    try {
      await authApi.resetPassword({ token, password: values.password });
      setDone(true);
    } catch (error) {
      const fields = fieldErrors(error);
      if (fields.password) setError('password', { message: fields.password });
      toast.error(errorMessage(error, 'Could not reset your password'));
    }
  });

  /* ── No token → the link is malformed or was truncated by a mail client. ── */
  if (!token) {
    return (
      <motion.div variants={scaleIn} initial="initial" animate="animate">
        <Card padding="lg" className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-warning-500/15 text-warning-500">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-content">This link is incomplete</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-content-muted">
            The reset link is missing its token. Some mail clients break long links — request a
            fresh one and open it directly from the email.
          </p>
          <div className="mt-7 space-y-3">
            <Button fullWidth onClick={() => navigate('/forgot-password')}>
              Request a new link
            </Button>
            <Link to="/login" className="block">
              <Button variant="ghost" fullWidth leftIcon={<ArrowLeft className="h-4 w-4" />}>
                Back to sign in
              </Button>
            </Link>
          </div>
        </Card>
      </motion.div>
    );
  }

  if (done) {
    return (
      <motion.div variants={scaleIn} initial="initial" animate="animate">
        <Card padding="lg" className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-success-500/15 text-success-500">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-content">Password updated</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-content-muted">
            Your new password is live. Any other devices still signed in have been logged out.
          </p>
          <div className="mt-7">
            <Button fullWidth size="lg" onClick={() => navigate('/login', { replace: true })}>
              Continue to sign in
            </Button>
          </div>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div variants={staggerContainer(0.06)} initial="initial" animate="animate">
      <Card padding="lg">
        <motion.div variants={staggerItem}>
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand-600 dark:text-brand-300">
            <KeyRound className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-content">Set a new password</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-content-muted">
            Choose something you haven't used here before. You'll sign in with it right away.
          </p>
        </motion.div>

        <form onSubmit={submit} className="mt-7 space-y-5" noValidate>
          <motion.div variants={staggerItem} className="space-y-3">
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              leftIcon={<Lock className="h-4 w-4" />}
              error={errors.password?.message}
              {...register('password')}
            />
            <StrengthMeter value={password ?? ''} />
          </motion.div>

          <motion.div variants={staggerItem}>
            <Input
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              leftIcon={<Lock className="h-4 w-4" />}
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
          </motion.div>

          <motion.div variants={staggerItem}>
            <Button type="submit" fullWidth size="lg" isLoading={isSubmitting}>
              Update password
            </Button>
          </motion.div>
        </form>

        <motion.div variants={staggerItem} className="mt-6 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-500 dark:text-brand-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </motion.div>
      </Card>
    </motion.div>
  );
};

export default ResetPassword;
