import { forwardRef, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { spring } from '@/animations/variants';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline' | 'subtle';
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-gradient bg-[length:200%_100%] text-white shadow-glow hover:bg-[position:100%_0] hover:shadow-glass-lg',
  secondary: 'bg-surface-raised text-content border border-line hover:bg-content/5 shadow-sm',
  outline: 'border border-brand-500/40 text-brand-600 dark:text-brand-300 hover:bg-brand-500/10',
  ghost: 'text-content-muted hover:bg-content/5 hover:text-content',
  subtle: 'bg-content/5 text-content hover:bg-content/10',
  danger: 'bg-danger-500 text-white shadow-sm hover:bg-danger-600',
  success: 'bg-success-500 text-white shadow-sm hover:bg-success-600',
};

const SIZES: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1.5 rounded-lg',
  sm: 'h-9 px-3.5 text-sm gap-2 rounded-xl',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2.5 rounded-xl',
  icon: 'h-10 w-10 rounded-xl',
};

/**
 * Extends framer's button props rather than React's own: HTMLMotionProps already
 * covers every HTML attribute, so `Omit<ButtonHTMLAttributes, keyof HTMLMotionProps>`
 * would strip the entire surface — onClick, disabled, type and all.
 */
export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  children?: ReactNode;
}

/**
 * The one button. Every affordance in the app routes through it, so the press
 * physics, focus ring and disabled/loading semantics are identical everywhere.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth,
      className,
      children,
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => (
    <motion.button
      ref={ref}
      type={type}
      // A loading button must not be clickable, but it should still read as
      // "busy" rather than "unavailable" to assistive tech.
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      whileTap={disabled || isLoading ? undefined : { scale: 0.97 }}
      transition={spring}
      className={cn(
        'relative inline-flex select-none items-center justify-center overflow-hidden font-semibold',
        'transition-[background,box-shadow,color] duration-300',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />}
      {!isLoading && leftIcon}
      {children && <span className="truncate">{children}</span>}
      {!isLoading && rightIcon}
    </motion.button>
  )
);

Button.displayName = 'Button';

export default Button;
