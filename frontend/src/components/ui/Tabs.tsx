import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';

export interface TabItem {
  value: string;
  label: string;
  count?: number;
  icon?: ReactNode;
}

/**
 * Segmented tabs with a shared layoutId, so the active pill physically slides
 * between tabs instead of blinking — the small detail that reads as "premium".
 */
export const Tabs = ({
  tabs,
  value,
  onChange,
  className,
  /** A unique id per Tabs instance; two instances must not share the pill. */
  layoutId = 'tab-pill',
}: {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  layoutId?: string;
}) => (
  <div
    role="tablist"
    className={cn(
      'scrollbar-none flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface-sunken/60 p-1',
      className
    )}
  >
    {tabs.map((tab) => {
      const active = tab.value === value;
      return (
        <button
          key={tab.value}
          role="tab"
          type="button"
          aria-selected={active}
          onClick={() => onChange(tab.value)}
          className={cn(
            'relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-colors duration-200',
            active ? 'text-white' : 'text-content-muted hover:text-content'
          )}
        >
          {active && (
            <motion.span
              layoutId={layoutId}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              className="absolute inset-0 rounded-xl bg-brand-gradient shadow-glow-sm"
            />
          )}
          <span className="relative flex items-center gap-2">
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-2xs font-bold tabular-nums',
                  active ? 'bg-white/25 text-white' : 'bg-content/10 text-content-muted'
                )}
              >
                {tab.count}
              </span>
            )}
          </span>
        </button>
      );
    })}
  </div>
);

export default Tabs;
