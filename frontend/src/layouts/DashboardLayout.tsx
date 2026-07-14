import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { gatePassApi, hrApi, notificationApi, securityApi } from '@/services/endpoints';
import { usePermissions } from '@/permissions/usePermissions';
import { PERMISSION } from '@/permissions/constants';
import { pageVariants } from '@/animations/variants';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { cn } from '@/utils/cn';

/** Live counts for the sidebar badges — each query only runs if the user can see it. */
const useSidebarBadges = () => {
  const { can } = usePermissions();

  const approvals = useQuery({
    queryKey: ['gate-passes', 'pending-approval', 'badge'],
    queryFn: () => gatePassApi.pendingApproval({ limit: 1 }),
    enabled: can(PERMISSION.GATEPASS_APPROVE),
    refetchInterval: 120_000,
  });

  const hrQueue = useQuery({
    queryKey: ['hr', 'queue', 'badge'],
    queryFn: () => hrApi.queue({ limit: 1 }),
    enabled: can(PERMISSION.HR_REVIEW_VIEW),
    refetchInterval: 120_000,
  });

  const securityQueue = useQuery({
    queryKey: ['security', 'queue', 'badge'],
    queryFn: () => securityApi.queue({ limit: 1 }),
    enabled: can(PERMISSION.SECURITY_ACCESS),
    refetchInterval: 60_000,
  });

  const notifications = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationApi.unreadCount,
    refetchInterval: 60_000,
  });

  return {
    pending: approvals.data?.meta.total ?? 0,
    hrReview: hrQueue.data?.meta.total ?? 0,
    security: securityQueue.data?.meta.total ?? 0,
    notifications: notifications.data?.count ?? 0,
  };
};

export const DashboardLayout = () => {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('gatepass.sidebar') === 'collapsed'
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const badges = useSidebarBadges();

  const toggleCollapse = () => {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem('gatepass.sidebar', next ? 'collapsed' : 'expanded');
      return next;
    });
  };

  return (
    <div className="min-h-dvh">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        badges={badges}
      />

      <div
        className={cn(
          'flex min-h-dvh flex-col transition-[padding] duration-300 ease-spring',
          collapsed ? 'lg:pl-[76px]' : 'lg:pl-[264px]'
        )}
      >
        <Topbar onOpenMobileMenu={() => setMobileOpen(true)} />

        <main className="flex-1 px-4 py-6 pb-safe sm:px-6 lg:px-8">
          {/* Keyed on the pathname so every navigation is a fresh enter/exit. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="mx-auto w-full max-w-[1600px]"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
