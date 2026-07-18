import { memo, useEffect, useRef, type ReactNode } from 'react';
import { motion, useInView } from 'framer-motion';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/utils/cn';
import { staggerItem } from '@/animations/variants';

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'accent' | 'info';

const TONES: Record<Tone, { icon: string; glow: string; bar: string }> = {
  brand: { icon: 'bg-brand-500/15 text-brand-500', glow: 'from-brand-500/20', bar: 'bg-brand-500' },
  accent: { icon: 'bg-accent-500/15 text-accent-500', glow: 'from-accent-500/20', bar: 'bg-accent-500' },
  success: { icon: 'bg-success-500/15 text-success-500', glow: 'from-success-500/20', bar: 'bg-success-500' },
  warning: { icon: 'bg-warning-500/15 text-warning-500', glow: 'from-warning-500/20', bar: 'bg-warning-500' },
  danger: { icon: 'bg-danger-500/15 text-danger-500', glow: 'from-danger-500/20', bar: 'bg-danger-500' },
  info: { icon: 'bg-info-500/15 text-info-500', glow: 'from-info-500/20', bar: 'bg-info-500' },
};

const format = (n: number) => n.toLocaleString('en-IN');

/**
 * Counts up to the value once the card scrolls into view.
 *
 * The animation writes straight to the DOM node rather than through state. It
 * used to `setValue()` inside the rAF loop, which re-rendered the whole card on
 * every frame — ~54 renders per card, and a dashboard shows six of them. The
 * number on screen is identical; it just no longer drags React through 900ms of
 * reconciliation to draw it.
 *
 * It also animates FROM the previous value now. Keying the effect on `target`
 * meant any background refetch that nudged a count snapped it to 0 and re-ran
 * the whole climb, which is why idle dashboards visibly twitched.
 */
const useCountUp = (target: number, duration = 900) => {
  const ref = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLParagraphElement>(null);
  const from = useRef(0);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  useEffect(() => {
    const node = numberRef.current;
    if (!node) return undefined;

    if (!inView) {
      node.textContent = format(0);
      return undefined;
    }

    const start = from.current;
    const delta = target - start;

    const settle = () => {
      node.textContent = format(target);
      from.current = target;
    };

    // Respect reduced motion — snap straight to the number.
    if (delta === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      settle();
      return undefined;
    }

    let frame = 0;
    const began = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - began) / duration, 1);
      // easeOutExpo — fast start, gentle landing.
      const eased = progress === 1 ? 1 : 1 - 2 ** (-10 * progress);
      node.textContent = format(Math.round(start + delta * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        settle();
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, target, duration]);

  return { ref, numberRef };
};

export interface StatCardProps {
  label: string;
  value: number;
  icon: ReactNode;
  tone?: Tone;
  /** Percentage change vs. the previous period. */
  trend?: number;
  hint?: string;
  onClick?: () => void;
  /** 0–1; renders a progress bar along the bottom edge. */
  progress?: number;
}

const StatCardInner = ({
  label,
  value,
  icon,
  tone = 'brand',
  trend,
  hint,
  onClick,
  progress,
}: StatCardProps) => {
  const { ref, numberRef } = useCountUp(value);
  const palette = TONES[tone];
  const positive = (trend ?? 0) >= 0;

  return (
    <motion.div
      ref={ref}
      variants={staggerItem}
      onClick={onClick}
      className={cn(
        'card card-hover group relative overflow-hidden p-5',
        onClick && 'cursor-pointer'
      )}
    >
      {/* Corner glow — subtle depth that intensifies on hover. */}
      <div
        className={cn(
          'pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br to-transparent opacity-60 blur-2xl transition-opacity duration-500 group-hover:opacity-100',
          palette.glow
        )}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          {/* Wraps rather than truncates — an ellipsised metric label ("APPRO…")
              is worse than two lines, and these cards get narrow in a 6-up grid. */}
          <p className="text-xs font-semibold uppercase leading-tight tracking-wider text-content-muted">
            {label}
          </p>

          {/* Written by useCountUp via ref — see the note there. */}
          <p
            ref={numberRef}
            className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-content"
          >
            {format(value)}
          </p>

          <div className="mt-2 flex items-center gap-2">
            {trend !== undefined && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold',
                  positive
                    ? 'bg-success-500/15 text-success-600 dark:text-success-400'
                    : 'bg-danger-500/15 text-danger-600 dark:text-danger-400'
                )}
              >
                {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(trend)}%
              </span>
            )}
            {hint && <span className="text-xs leading-tight text-content-subtle">{hint}</span>}
          </div>
        </div>

        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110',
            palette.icon
          )}
        >
          {icon}
        </div>
      </div>

      {progress !== undefined && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-content/10">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, progress * 100)}%` }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className={cn('h-full rounded-full', palette.bar)}
          />
        </div>
      )}
    </motion.div>
  );
};

/* ─── Progress ring — used for quota usage on the gate pass form ─────────── */
export const ProgressRing = ({
  value,
  max,
  size = 96,
  strokeWidth = 8,
  label,
  tone = 'brand',
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  tone?: Tone;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;

  // The ring turns amber then red as the quota is consumed.
  const resolvedTone: Tone = ratio >= 1 ? 'danger' : ratio >= 0.75 ? 'warning' : tone;
  const colour = {
    brand: '#6366f1',
    accent: '#06b6d4',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
  }[resolvedTone];

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="stroke-content/10"
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={colour}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - ratio) }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold tabular-nums text-content">
          {value}
          <span className="text-xs font-medium text-content-subtle">/{max}</span>
        </span>
        {label && <span className="text-2xs font-medium uppercase text-content-subtle">{label}</span>}
      </div>
    </div>
  );
};


/* Memoized: a dashboard renders six of these, and every one of them used to
 * re-render whenever any unrelated page state changed. */
export const StatCard = memo(StatCardInner);

export default StatCard;
