import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';

export interface Crumb {
  label: string;
  to?: string;
}

/** Consistent page masthead: breadcrumbs, title, subtitle and an action slot. */
export const PageHeader = ({
  title,
  subtitle,
  breadcrumbs,
  actions,
  icon,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) => (
  <motion.header
    initial={{ opacity: 0, y: -8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    className={cn('mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between', className)}
  >
    <div className="min-w-0">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-xs text-content-muted">
          {breadcrumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="h-3 w-3 text-content-subtle" />}
              {crumb.to ? (
                <Link to={crumb.to} className="transition-colors hover:text-brand-500">
                  {crumb.label}
                </Link>
              ) : (
                <span className="font-medium text-content">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand-600 dark:text-brand-300">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight text-content sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-content-muted">{subtitle}</p>}
        </div>
      </div>
    </div>

    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </motion.header>
);

export default PageHeader;
