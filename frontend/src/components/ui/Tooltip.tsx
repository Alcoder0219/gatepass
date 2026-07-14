import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/utils/cn';

type Side = 'top' | 'bottom' | 'left' | 'right';

const POSITION: Record<Side, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

/** CSS-positioned tooltip — no portal, so it inherits the parent's stacking. */
export const Tooltip = ({
  content,
  children,
  side = 'top',
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: Side;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}

      <AnimatePresence>
        {open && content && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className={cn(
              'pointer-events-none absolute z-50 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg dark:bg-slate-700',
              POSITION[side]
            )}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
};

export default Tooltip;
