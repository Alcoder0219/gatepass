import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowLeft, MailCheck, Mail, Send } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { authApi } from '@/services/endpoints';
import { errorMessage, fieldErrors } from '@/services/api';
import { scaleIn, staggerContainer, staggerItem } from '@/animations/variants';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
});

type ForgotValues = z.infer<typeof schema>;

const ForgotPassword = () => {
  const [sentTo, setSentTo] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const submit = handleSubmit(async (values) => {
    const email = values.email.trim();
    try {
      await authApi.forgotPassword(email);
      // Deliberately identical whether or not the account exists.
      setSentTo(email);
    } catch (error) {
      const fields = fieldErrors(error);
      if (fields.email) setError('email', { message: fields.email });
      toast.error(errorMessage(error, 'Could not send the reset link'));
    }
  });

  const resend = async () => {
    try {
      await authApi.forgotPassword(getValues('email').trim());
      toast.success('Reset link sent again');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not resend the reset link'));
    }
  };

  if (sentTo) {
    return (
      <motion.div variants={scaleIn} initial="initial" animate="animate">
        <Card padding="lg" className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-success-500/15 text-success-500">
            <MailCheck className="h-7 w-7" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-content">Check your inbox</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-content-muted">
            If an account exists for{' '}
            <span className="font-semibold text-content">{sentTo}</span>, we've sent it a link to
            reset the password. The link expires in 30 minutes.
          </p>

          <div className="mt-7 space-y-3">
            <Button variant="secondary" fullWidth onClick={() => void resend()}>
              Resend the email
            </Button>
            <Link to="/login" className="block">
              <Button variant="ghost" fullWidth leftIcon={<ArrowLeft className="h-4 w-4" />}>
                Back to sign in
              </Button>
            </Link>
          </div>

          <p className="mt-6 text-xs text-content-subtle">
            No email after a few minutes? Check your spam folder, or ask an administrator to reset
            it for you.
          </p>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div variants={staggerContainer(0.06)} initial="initial" animate="animate">
      <Card padding="lg">
        <motion.div variants={staggerItem}>
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand-600 dark:text-brand-300">
            <Mail className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-content">Forgot your password?</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-content-muted">
            Enter the email you sign in with and we'll send you a link to set a new password.
          </p>
        </motion.div>

        <form onSubmit={submit} className="mt-7 space-y-5" noValidate>
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
            <Button
              type="submit"
              fullWidth
              size="lg"
              isLoading={isSubmitting}
              leftIcon={<Send className="h-4 w-4" />}
            >
              Send reset link
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

export default ForgotPassword;
