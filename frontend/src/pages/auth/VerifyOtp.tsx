import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowLeft, KeyRound, Mail, Send } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { authApi } from '@/services/endpoints';
import { errorMessage, fieldErrors } from '@/services/api';
import { cn } from '@/utils/cn';
import { scaleIn, staggerContainer, staggerItem } from '@/animations/variants';

const emailSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
});

type EmailValues = z.infer<typeof emailSchema>;

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

const VerifyOtp = () => {
  const navigate = useNavigate();
  const { loginWithOtp } = useAuth();

  const [email, setEmail] = useState<string | null>(null);
  const [digits, setDigits] = useState<string[]>(() => Array(OTP_LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);

  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  });

  /* ── Resend countdown ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!email || countdown <= 0) return undefined;
    const timer = window.setInterval(() => setCountdown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [email, countdown]);

  useEffect(() => {
    if (email) boxRefs.current[0]?.focus();
  }, [email]);

  const sendCode = handleSubmit(async (values) => {
    const address = values.email.trim();
    try {
      await authApi.sendOtp(address);
      setEmail(address);
      setCountdown(RESEND_SECONDS);
      toast.success(`We sent a 6-digit code to ${address}`);
    } catch (error) {
      const fields = fieldErrors(error);
      if (fields.email) setError('email', { message: fields.email });
      toast.error(errorMessage(error, 'Could not send the code'));
    }
  });

  const resend = async () => {
    if (!email || countdown > 0) return;
    setResending(true);
    try {
      await authApi.sendOtp(email);
      setDigits(Array(OTP_LENGTH).fill(''));
      setOtpError(null);
      setCountdown(RESEND_SECONDS);
      boxRefs.current[0]?.focus();
      toast.success('A fresh code is on its way');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not resend the code'));
    } finally {
      setResending(false);
    }
  };

  const verify = useCallback(
    async (code: string) => {
      if (!email) return;
      setVerifying(true);
      setOtpError(null);
      try {
        await loginWithOtp(email, code);
        navigate('/dashboard', { replace: true });
      } catch (error) {
        const message = errorMessage(error, 'That code did not work');
        setOtpError(message);
        toast.error(message);
        setDigits(Array(OTP_LENGTH).fill(''));
        boxRefs.current[0]?.focus();
      } finally {
        setVerifying(false);
      }
    },
    [email, loginWithOtp, navigate]
  );

  const commit = (next: string[]) => {
    setDigits(next);
    setOtpError(null);
    const code = next.join('');
    if (code.length === OTP_LENGTH && next.every(Boolean)) void verify(code);
  };

  const onDigitChange = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, '');
    if (!value) {
      const next = [...digits];
      next[index] = '';
      setDigits(next);
      return;
    }

    const next = [...digits];
    // Typing over a filled box, or a paste that landed in one box.
    value.split('').forEach((char, offset) => {
      if (index + offset < OTP_LENGTH) next[index + offset] = char;
    });

    const landed = Math.min(index + value.length, OTP_LENGTH - 1);
    boxRefs.current[landed]?.focus();
    commit(next);
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const next = [...digits];
      if (next[index]) {
        next[index] = '';
      } else if (index > 0) {
        next[index - 1] = '';
        boxRefs.current[index - 1]?.focus();
      }
      setDigits(next);
      setOtpError(null);
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      boxRefs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      event.preventDefault();
      boxRefs.current[index + 1]?.focus();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!text) return;
    event.preventDefault();

    const next = Array(OTP_LENGTH)
      .fill('')
      .map((_, index) => text[index] ?? '');
    boxRefs.current[Math.min(text.length, OTP_LENGTH) - 1]?.focus();
    commit(next);
  };

  /* ── Step 1: email ────────────────────────────────────────────────────── */
  if (!email) {
    return (
      <motion.div variants={staggerContainer(0.06)} initial="initial" animate="animate">
        <Card padding="lg">
          <motion.div variants={staggerItem}>
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand-600 dark:text-brand-300">
              <KeyRound className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-content">Sign in with a code</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-content-muted">
              No password needed. We'll email you a 6-digit code that's valid for 10 minutes.
            </p>
          </motion.div>

          <form onSubmit={sendCode} className="mt-7 space-y-5" noValidate>
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
                Send me a code
              </Button>
            </motion.div>
          </form>

          <motion.div variants={staggerItem} className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-500 dark:text-brand-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Sign in with a password instead
            </Link>
          </motion.div>
        </Card>
      </motion.div>
    );
  }

  /* ── Step 2: the six boxes ────────────────────────────────────────────── */
  return (
    <motion.div variants={scaleIn} initial="initial" animate="animate">
      <Card padding="lg">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand-600 dark:text-brand-300">
          <Mail className="h-5 w-5" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-content">Enter your code</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-content-muted">
          We sent a 6-digit code to <span className="font-semibold text-content">{email}</span>.
        </p>

        <div className="mt-7">
          <div
            role="group"
            aria-label="One-time code"
            className="flex justify-between gap-1.5 sm:gap-2.5"
          >
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(node) => {
                  boxRefs.current[index] = node;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                maxLength={OTP_LENGTH}
                value={digit}
                disabled={verifying}
                aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
                aria-invalid={Boolean(otpError)}
                onChange={(event) => onDigitChange(index, event.target.value)}
                onKeyDown={(event) => onKeyDown(index, event)}
                onPaste={onPaste}
                onFocus={(event) => event.target.select()}
                className={cn(
                  'input-base h-14 flex-1 px-0 text-center text-xl font-bold tabular-nums sm:h-16 sm:text-2xl',
                  digit && 'border-brand-500/60 bg-brand-500/5',
                  otpError && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/10'
                )}
              />
            ))}
          </div>

          {otpError && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 text-center text-xs font-medium text-danger-500"
            >
              {otpError}
            </motion.p>
          )}
        </div>

        <div className="mt-6">
          <Button
            fullWidth
            size="lg"
            isLoading={verifying}
            disabled={digits.some((digit) => !digit)}
            onClick={() => void verify(digits.join(''))}
          >
            Verify and sign in
          </Button>
        </div>

        <div className="mt-5 flex flex-col items-center gap-1 text-center">
          {countdown > 0 ? (
            <p className="text-sm text-content-muted">
              Resend a code in{' '}
              <span className="font-semibold tabular-nums text-content">{countdown}s</span>
            </p>
          ) : (
            <Button variant="ghost" size="sm" isLoading={resending} onClick={() => void resend()}>
              Resend the code
            </Button>
          )}

          <button
            type="button"
            onClick={() => {
              setEmail(null);
              setDigits(Array(OTP_LENGTH).fill(''));
              setOtpError(null);
            }}
            className="text-sm font-semibold text-brand-600 transition-colors hover:text-brand-500 dark:text-brand-300"
          >
            Use a different email
          </button>
        </div>
      </Card>

      <div className="mt-6 text-center">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-content-muted transition-colors hover:text-content"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </div>
    </motion.div>
  );
};

export default VerifyOtp;
