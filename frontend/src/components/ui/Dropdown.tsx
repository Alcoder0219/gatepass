import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/utils/cn';
import { dropdownVariants } from '@/animations/variants';

export interface DropdownItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Renders a divider above this item. */
  separated?: boolean;
}

export interface DropdownProps {
  trigger: ReactNode;
  items?: DropdownItem[];
  children?: ReactNode;
  align?: 'left' | 'right';
  className?: string;
  panelClassName?: string;
}

/**
 * Click-outside + Escape dismissal, animated panel. Pass `items` for a simple
 * menu, or `children` for a custom panel (the notification bell uses that).
 */
export const Dropdown = ({
  trigger,
  items,
  children,
  align = 'right',
  className,
  panelClassName,
}: DropdownProps) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        {trigger}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            variants={dropdownVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={cn(
              'glass-strong absolute z-40 mt-2 min-w-[200px] origin-top overflow-hidden rounded-2xl p-1.5 shadow-glass-lg',
              align === 'right' ? 'right-0' : 'left-0',
              panelClassName
            )}
          >
            {children ? (
              <div onClick={() => setOpen(false)}>{children}</div>
            ) : (
              items?.map((item, index) => (
                <div key={`${item.label}-${index}`}>
                  {item.separated && <div className="my-1.5 h-px bg-line" />}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      item.onClick?.();
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
                      item.danger
                        ? 'text-danger-500 hover:bg-danger-500/10'
                        : 'text-content-muted hover:bg-content/5 hover:text-content',
                      item.disabled && 'cursor-not-allowed opacity-50'
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                </div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dropdown;
