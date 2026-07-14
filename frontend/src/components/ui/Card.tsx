import { forwardRef, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/utils/cn';
import { staggerItem } from '@/animations/variants';

/**
 * Extends framer's div props rather than React's own: HTMLMotionProps already
 * covers every HTML attribute, so `Omit<HTMLAttributes, keyof HTMLMotionProps>`
 * would strip the whole surface — including onClick.
 */
export interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  /** Adds the lift + sheen sweep on hover. Use for anything clickable. */
  interactive?: boolean;
  /** Opt out of the frosted look for dense surfaces (tables, code). */
  solid?: boolean;
  /** Animate in as part of a parent `staggerContainer`. */
  animated?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children?: ReactNode;
}

const PADDING = { none: '', sm: 'p-4', md: 'p-5 sm:p-6', lg: 'p-6 sm:p-8' } as const;

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ interactive, solid, animated, padding = 'md', className, children, ...props }, ref) => {
    const classes = cn(
      solid ? 'glass-strong' : 'glass',
      'rounded-2xl',
      interactive && 'card-hover cursor-pointer',
      PADDING[padding],
      className
    );

    // Always a motion.div: the props type is framer's, so spreading them onto a
    // plain <div> would leak motion-only props (variants, whileHover) into the DOM.
    return (
      <motion.div
        ref={ref}
        variants={animated ? staggerItem : undefined}
        className={classes}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);
Card.displayName = 'Card';

export const CardHeader = ({
  title,
  subtitle,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) => (
  <div className={cn('mb-5 flex items-start justify-between gap-4', className)}>
    <div className="flex min-w-0 items-center gap-3">
      {icon && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand-600 dark:text-brand-300">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold text-content">{title}</h3>
        {subtitle && <p className="mt-0.5 truncate text-sm text-content-muted">{subtitle}</p>}
      </div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export default Card;
