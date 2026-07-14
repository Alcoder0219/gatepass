import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ChevronDown, KeyRound, Lock, Mail, Sparkles } from 'lucide-react';
import { Button, Card, Input, Switch } from '@/components/ui';
import { Logo } from '@/components/common/Logo';
import { BRAND } from '@/config/brand';
import { useAuth } from '@/contexts/AuthContext';
import { errorMessage, fieldErrors } from '@/services/api';
import { slideUp, staggerContainer, staggerItem } from '@/animations/variants';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginValues = z.infer<typeof schema>;

const DEMO_PASSWORD = 'Passw0rd@123';

const DEMO_ACCOUNTS = [
  { email: 'superadmin@gatepasspro.io', role: 'Super Admin', note: 'Everything, everywhere' },
  { email: 'admin@gatepasspro.io', role: 'Admin', note: 'Users, roles, masters' },
  { email: 'hr@gatepasspro.io', role: 'HR', note: 'The HR_REVIEW queue' },
  { email: 'security@gatepasspro.io', role: 'Security', note: 'Scan, exit, return' },
  { email: 'hod.manesar@gatepasspro.io', role: 'HOD — Manesar', note: 'Approves their team' },
  { email: 'rohit.verma@gatepasspro.io', role: 'Employee', note: 'Raises gate passes' },
];

/** The sign-in card. The split-screen brand panel comes from AuthLayout. */
const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [rememberMe, setRememberMe] = useState(true);
  const [demoOpen, setDemoOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values.email.trim(), values.password, rememberMe);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      const fields = fieldErrors(error);
      let inlined = false;

      (['email', 'password'] as const).forEach((field) => {
        if (fields[field]) {
          setError(field, { message: fields[field] });
          inlined = true;
        }
      });

      const message = errorMessage(error, 'Could not sign you in');
      toast.error(message);
      if (!inlined) setError('password', { message });
    }
  });

  const fillDemo = (email: string) => {
    setValue('email', email, { shouldValidate: true });
    setValue('password', DEMO_PASSWORD, { shouldValidate: true });
    setDemoOpen(false);
    toast.success(`Filled ${email}`);
  };

  return (
    <motion.div variants={staggerContainer(0.06)} initial="initial" animate="animate">
      <motion.div variants={staggerItem} className="mb-8 flex items-center gap-3 lg:hidden">
        <Logo className="h-12 w-12" />
        <div>
          <p className="text-2xl font-bold tracking-tight gradient-text">{BRAND.name}</p>
          <p className="mt-1 text-sm text-content-muted">{BRAND.tagline}</p>
        </div>
      </motion.div>

      <Card padding="lg" className="overflow-visible">
        <motion.div variants={staggerItem}>
          <h1 className="text-2xl font-bold tracking-tight text-content">Welcome back</h1>
          <p className="mt-1.5 text-sm text-content-muted">
            Sign in to raise, approve and track gate passes.
          </p>
        </motion.div>

        <form onSubmit={onSubmit} className="mt-7 space-y-5" noValidate>
          <motion.div variants={staggerItem}>
            <Input
              label="Work email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              leftIcon={<Mail className="h-4 w-4" />}
              error={errors.email?.message}
              {...register('email')}
            />
          </motion.div>

          <motion.div variants={staggerItem}>
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              leftIcon={<Lock className="h-4 w-4" />}
              error={errors.password?.message}
              {...register('password')}
            />
          </motion.div>

          <motion.div
            variants={staggerItem}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <Switch
              checked={rememberMe}
              onChange={setRememberMe}
              size="sm"
              label="Remember me"
              className="py-0"
            />
            <Link
              to="/forgot-password"
              className="text-sm font-semibold text-brand-600 transition-colors hover:text-brand-500 dark:text-brand-300"
            >
              Forgot password?
            </Link>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Button type="submit" fullWidth size="lg" isLoading={isSubmitting}>
              Sign in
            </Button>
          </motion.div>
        </form>

        <motion.div variants={staggerItem} className="mt-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs font-medium uppercase tracking-wider text-content-subtle">or</span>
          <span className="h-px flex-1 bg-line" />
        </motion.div>

        <motion.div variants={staggerItem} className="mt-6">
          <Link to="/verify-otp" className="block">
            <Button variant="secondary" fullWidth leftIcon={<KeyRound className="h-4 w-4" />}>
              Email me a one-time code
            </Button>
          </Link>
        </motion.div>
      </Card>

      {/* ── Demo accounts ────────────────────────────────────────────────────
       * DEV ONLY. This panel prints working credentials on the sign-in screen,
       * so it must never reach a deployed build. `import.meta.env.DEV` is a
       * compile-time constant — Vite folds this to `false` and drops the whole
       * block (and the credentials with it) from the production bundle.
       */}
      {import.meta.env.DEV && (
      <motion.div variants={staggerItem} className="mt-4">
        <Card padding="none" className="overflow-hidden">
          <button
            type="button"
            onClick={() => setDemoOpen((open) => !open)}
            aria-expanded={demoOpen}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-content/5"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand-600 dark:text-brand-300">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-content">Demo accounts</span>
                <span className="block text-xs text-content-muted">
                  Tap a row to fill the form instantly
                </span>
              </span>
            </span>
            <motion.span animate={{ rotate: demoOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="h-4 w-4 text-content-subtle" />
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {demoOpen && (
              <motion.div
                key="demo-panel"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <ul className="border-t border-line">
                  {DEMO_ACCOUNTS.map((account) => (
                    <li key={account.email}>
                      <button
                        type="button"
                        onClick={() => fillDemo(account.email)}
                        className="flex w-full items-center justify-between gap-3 border-b border-line/60 px-5 py-3 text-left transition-colors last:border-0 hover:bg-brand-500/5"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-content">
                            {account.email}
                          </span>
                          <span className="block truncate text-xs text-content-muted">
                            {account.role} · {account.note}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-lg bg-content/5 px-2 py-1 font-mono text-2xs text-content-muted">
                          {DEMO_PASSWORD}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </motion.div>
      )}

      <motion.p variants={slideUp} className="mt-6 text-center text-xs text-content-subtle">
        By signing in you agree to your organisation's acceptable-use policy.
      </motion.p>
    </motion.div>
  );
};

export default Login;
