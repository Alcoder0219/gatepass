import { AnimatePresence, motion } from 'framer-motion';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronsLeft, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { usePermissions } from '@/permissions/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { NAVIGATION } from '@/routes/navigation';
import { drawerVariants, staggerContainer, staggerItem } from '@/animations/variants';
import { Avatar, Button, Tooltip } from '@/components/ui';
import { Logo } from '@/components/common/Logo';
import { BRAND } from '@/config/brand';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  badges?: Partial<Record<'pending' | 'hrReview' | 'security' | 'notifications', number>>;
}

const Brand = ({ collapsed }: { collapsed: boolean }) => (
  <div className="flex items-center gap-3 px-1">
    <Logo className="h-10 w-10" />
    <AnimatePresence initial={false}>
      {!collapsed && (
        <motion.div
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: 'auto' }}
          exit={{ opacity: 0, width: 0 }}
          className="overflow-hidden whitespace-nowrap"
        >
          <p className="text-base font-bold leading-tight tracking-tight text-content">
            {BRAND.shortName}
          </p>
          <p className="text-xs font-semibold gradient-text">GROUP</p>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

const SidebarContent = ({
  collapsed,
  badges,
  onNavigate,
}: {
  collapsed: boolean;
  badges: SidebarProps['badges'];
  onNavigate?: () => void;
}) => {
  const { canAny } = usePermissions();
  const { user } = useAuth();
  const location = useLocation();

  // Only render a section if at least one of its items survives the permission filter.
  const sections = NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permissions || canAny(...item.permissions)),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      <nav className="scrollbar-none flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <motion.div
            key={section.title}
            variants={staggerContainer(0.02)}
            initial="initial"
            animate="animate"
          >
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mb-2 px-3 text-2xs font-bold uppercase tracking-widest text-content-subtle"
                >
                  {section.title}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const badge = item.badgeKey ? badges?.[item.badgeKey] : undefined;
                const active = item.matchPrefix
                  ? location.pathname.startsWith(item.matchPrefix)
                  : location.pathname === item.to;

                const link = (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={cn('nav-item', active && 'nav-item-active', collapsed && 'justify-center px-0')}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />

                    <AnimatePresence initial={false}>
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: 'auto' }}
                          exit={{ opacity: 0, width: 0 }}
                          className="flex-1 overflow-hidden whitespace-nowrap"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>

                    {badge !== undefined && badge > 0 && (
                      <span
                        className={cn(
                          'shrink-0 rounded-full bg-danger-500 px-1.5 py-0.5 text-2xs font-bold tabular-nums text-white',
                          collapsed && 'absolute right-1 top-1 px-1'
                        )}
                      >
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </NavLink>
                );

                return collapsed ? (
                  <Tooltip key={item.to} content={item.label} side="right" className="block">
                    {link}
                  </Tooltip>
                ) : (
                  <motion.div key={item.to} variants={staggerItem}>
                    {link}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </nav>

      {/* Identity card — who am I, and in what role. */}
      <div className="border-t border-line p-3">
        <NavLink
          to="/profile"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-content/5',
            collapsed && 'justify-center'
          )}
        >
          <Avatar src={user?.profileImage} name={user?.name} size="sm" status={user?.status} />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-content">{user?.name}</p>
              <p className="truncate text-xs text-content-muted">{user?.role?.name}</p>
            </div>
          )}
        </NavLink>
      </div>
    </>
  );
};

export const Sidebar = ({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  badges,
}: SidebarProps) => (
  <>
    {/* ── Desktop rail ──────────────────────────────────────────────────── */}
    <motion.aside
      animate={{ width: collapsed ? 76 : 264 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className="glass fixed inset-y-0 left-0 z-30 hidden flex-col rounded-none border-y-0 border-l-0 lg:flex"
    >
      <div className="flex h-16 items-center justify-between border-b border-line px-4">
        <Brand collapsed={collapsed} />
        {!collapsed && (
          <Button variant="ghost" size="icon" onClick={onToggleCollapse} aria-label="Collapse sidebar">
            <ChevronsLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand sidebar"
          className="mx-auto mt-3 rounded-lg p-2 text-content-subtle transition-colors hover:bg-content/5 hover:text-content"
        >
          <ChevronsLeft className="h-4 w-4 rotate-180" />
        </button>
      )}

      <SidebarContent collapsed={collapsed} badges={badges} />
    </motion.aside>

    {/* ── Mobile drawer ─────────────────────────────────────────────────── */}
    <AnimatePresence>
      {mobileOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCloseMobile}
            className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden"
          />
          <motion.aside
            variants={drawerVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="glass-strong fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col rounded-none lg:hidden"
          >
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <Brand collapsed={false} />
              <Button variant="ghost" size="icon" onClick={onCloseMobile} aria-label="Close menu">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarContent collapsed={false} badges={badges} onNavigate={onCloseMobile} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  </>
);

export default Sidebar;
