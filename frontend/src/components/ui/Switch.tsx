import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * The permission/settings toggle. The knob is animated with a spring rather
 * than a CSS transition so it has a little weight when it lands.
 */
export const Switch = ({
  checked,
  onChange,
  label,
  description,
  disabled,
  size = 'md',
  className,
}: SwitchProps) => {
  const track = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const knob = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4.5 w-4.5';
  const travel = size === 'sm' ? 16 : 20;

  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors duration-300',
        track,
        checked ? 'bg-brand-gradient shadow-glow-sm' : 'bg-content-subtle/30',
        disabled && 'cursor-not-allowed opacity-50',
        !label && className
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        animate={{ x: checked ? travel : 0 }}
        className={cn('block rounded-full bg-white shadow-sm', knob, size === 'md' && 'h-[18px] w-[18px]')}
      />
    </button>
  );

  if (!label) return toggle;

  return (
    <label
      className={cn(
        'flex cursor-pointer items-start justify-between gap-4 rounded-xl py-2 transition-colors',
        disabled && 'cursor-not-allowed opacity-60',
        className
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-content">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-content-muted">{description}</span>
        )}
      </span>
      {toggle}
    </label>
  );
};

export default Switch;
