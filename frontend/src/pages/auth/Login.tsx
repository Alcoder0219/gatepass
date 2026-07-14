import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Lock, Mail } from 'lucide-react';
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

/** The sign-in card. The split-screen brand panel comes from AuthLayout. */
const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [rememberMe, setRememberMe] = useState(true);

  const {
    register,
    handleSubmit,
    setError,
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
      </Card>

      <motion.p variants={slideUp} className="mt-6 text-center text-xs text-content-subtle">
        By signing in you agree to your organisation's acceptable-use policy.
      </motion.p>
    </motion.div>
  );
};

export default Login;
